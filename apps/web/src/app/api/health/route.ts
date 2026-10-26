import { configStatus } from "@/lib/server/env";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Reports which integrations are configured (booleans only, never values). */
export const GET = route(async () => json({ ok: true, config: configStatus() }));
