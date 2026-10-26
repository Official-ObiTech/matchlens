import { MODEL_VERSION } from "@fpp/core";
import { z } from "zod";
import { json, route, searchParams } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";
import { performance } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await rateLimit(`ip:${clientIp(req)}:read`, 60);
  const { model } = z.object({ model: z.string().regex(/^[a-z0-9.\-]+$/).max(40).optional() }).parse(searchParams(req));
  return json(await performance(model ?? MODEL_VERSION), 200, { "Cache-Control": "public, s-maxage=300" });
});
