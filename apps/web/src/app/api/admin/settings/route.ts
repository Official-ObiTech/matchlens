import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { setSetting } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

const schema = z.object({
  providerEnabled: z.boolean().optional(),
  modelEnabled: z.boolean().optional(),
  reserveFraction: z.number().min(0).max(0.5).optional(),
  modelVersion: z.object({ id: z.string().max(40), enabled: z.boolean() }).optional(),
});

/** Kill-switches: pause the provider or the model without taking the app down. */
export const POST = route(async (req) => {
  await requireAdmin(req);
  const s = schema.parse(await req.json());
  if (s.providerEnabled != null) await setSetting("provider_enabled", s.providerEnabled);
  if (s.modelEnabled != null) await setSetting("model_enabled", s.modelEnabled);
  if (s.reserveFraction != null) await setSetting("quota_reserve_fraction", s.reserveFraction);
  if (s.modelVersion) await adminDb().from("model_versions").update({ is_enabled: s.modelVersion.enabled }).eq("id", s.modelVersion.id);
  return json({ ok: true });
});
