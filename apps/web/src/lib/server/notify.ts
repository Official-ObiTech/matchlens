import "server-only";
import { adminDb } from "./db";
import { env } from "./env";

/**
 * Push delivery via the Expo Push Service (free). Expo forwards to FCM (Android)
 * and APNs (iOS) using the credentials configured in EAS for the app.
 */

export type NotificationKind = "kickoff_reminder" | "result" | "settlement" | "match_change";

const PREF_COLUMN: Record<NotificationKind, string> = {
  kickoff_reminder: "kickoff_reminders",
  result: "results",
  settlement: "settlement",
  match_change: "match_changes",
};

export interface OutgoingNotification {
  userId: string;
  kind: NotificationKind;
  /** Unique per user+kind; the same ref is never notified twice. */
  refId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendNotifications(items: OutgoingNotification[]): Promise<{ sent: number; skipped: number; failed: number }> {
  if (items.length === 0) return { sent: 0, skipped: 0, failed: 0 };
  const db = adminDb();
  let skipped = 0;
  let failed = 0;
  const messages: { to: string; title: string; body: string; data?: Record<string, string>; sound: "default"; userId: string; logId: number }[] = [];

  const userIds = [...new Set(items.map((i) => i.userId))];
  const [{ data: prefs }, { data: tokens }] = await Promise.all([
    db.from("notification_preferences").select("*").in("user_id", userIds),
    db.from("push_tokens").select("token, user_id").in("user_id", userIds).is("disabled_at", null),
  ]);
  const prefsBy = new Map((prefs ?? []).map((p) => [p.user_id as string, p as Record<string, unknown>]));
  const tokensBy = new Map<string, string[]>();
  for (const t of tokens ?? []) tokensBy.set(t.user_id as string, [...(tokensBy.get(t.user_id as string) ?? []), t.token as string]);

  for (const item of items) {
    const p = prefsBy.get(item.userId);
    const userTokens = tokensBy.get(item.userId) ?? [];
    if (!p || p[PREF_COLUMN[item.kind]] !== true || userTokens.length === 0) {
      skipped++;
      continue;
    }
    // Claim the (user, kind, ref) slot first; the unique constraint makes this idempotent across retries.
    const { data: claimed } = await db
      .from("notification_log")
      .upsert({ user_id: item.userId, kind: item.kind, ref_id: item.refId }, { onConflict: "user_id,kind,ref_id", ignoreDuplicates: true })
      .select("id");
    if (!claimed?.length) {
      skipped++;
      continue;
    }
    for (const to of userTokens)
      messages.push({ to, title: item.title, body: item.body, data: item.data, sound: "default", userId: item.userId, logId: claimed[0]!.id as number });
  }

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(env().expoAccessToken ? { Authorization: `Bearer ${env().expoAccessToken}` } : {}),
        },
        body: JSON.stringify(batch.map(({ to, title, body, data, sound }) => ({ to, title, body, data, sound }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const tickets = json.data ?? [];
      const dead: string[] = [];
      tickets.forEach((t, idx) => {
        if (t.status === "ok") sent++;
        else {
          failed++;
          if (t.details?.error === "DeviceNotRegistered") dead.push(batch[idx]!.to);
        }
      });
      if (dead.length) await db.from("push_tokens").update({ disabled_at: new Date().toISOString() }).in("token", dead);
    } catch (e) {
      console.error("[notify] push batch failed", e);
      failed += batch.length;
      // Release claims so the next run can retry this batch.
      await db.from("notification_log").delete().in("id", [...new Set(batch.map((m) => m.logId))]);
    }
  }
  return { sent, skipped, failed };
}
