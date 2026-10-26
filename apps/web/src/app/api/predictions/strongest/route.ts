import { strongestQuerySchema } from "@fpp/core";
import { json, route, searchParams } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";
import { strongest } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await rateLimit(`ip:${clientIp(req)}:read`, 120);
  const q = strongestQuerySchema.parse(searchParams(req));
  return json(await strongest(q), 200, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" });
});
