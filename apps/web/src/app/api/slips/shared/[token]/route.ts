import { json, route } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";
import { sharedSlip } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ token: string }> }>(async (req, ctx) => {
  await rateLimit(`ip:${clientIp(req)}:read`, 120);
  return json(await sharedSlip((await ctx.params).token));
});
