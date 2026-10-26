import { notificationPrefsSchema } from "@fpp/core";
import { requireUser } from "@/lib/server/auth";
import { userDb } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const { data } = await userDb(u.accessToken).from("notification_preferences").select("*").eq("user_id", u.id).maybeSingle();
  return json({
    kickoffReminders: data?.kickoff_reminders ?? true,
    results: data?.results ?? true,
    settlement: data?.settlement ?? true,
    matchChanges: data?.match_changes ?? false,
  });
});

export const PUT = route(async (req) => {
  const u = await requireUser(req);
  await rateLimit(`user:${u.id}:write`, 30);
  const p = notificationPrefsSchema.parse(await req.json());
  const { error } = await userDb(u.accessToken).from("notification_preferences").upsert({
    user_id: u.id,
    kickoff_reminders: p.kickoffReminders,
    results: p.results,
    settlement: p.settlement,
    match_changes: p.matchChanges,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return json(p);
});
