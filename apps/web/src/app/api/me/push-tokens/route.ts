import { pushTokenSchema } from "@fpp/core";
import { requireUser } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Register (or re-assign) an Expo push token to the signed-in user. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  await rateLimit(`user:${u.id}:write`, 30);
  const { token, platform } = pushTokenSchema.parse(await req.json());
  // Service role: a device token may previously belong to another account on the same device.
  const { error } = await adminDb()
    .from("push_tokens")
    .upsert({ token, platform, user_id: u.id, last_seen_at: new Date().toISOString(), disabled_at: null }, { onConflict: "token" });
  if (error) throw new Error(error.message);
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  const { token } = pushTokenSchema.pick({ token: true }).parse(await req.json());
  await adminDb().from("push_tokens").delete().eq("token", token).eq("user_id", u.id);
  return json({ ok: true });
});
