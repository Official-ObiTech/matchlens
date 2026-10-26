import { fixtureRefSchema } from "@fpp/core";
import { HttpError, json, route } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";
import { matchDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const ip = clientIp(req);
  await rateLimit(`ip:${ip}:read`, 120);
  const id = fixtureRefSchema.parse(decodeURIComponent((await ctx.params).id));
  // On-demand model runs use stored data only, but are still limited per client.
  let allowGenerate = true;
  try {
    await rateLimit(`ip:${ip}:generate`, 20);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    allowGenerate = false;
  }
  return json(await matchDetail(id, allowGenerate));
});
