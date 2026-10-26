import { saveSlipSchema } from "@fpp/core";
import { requireUser } from "@/lib/server/auth";
import { HttpError, json, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { listSlips, saveSlip } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json({ slips: await listSlips(user) });
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`user:${user.id}:write`, 30);
  const body = await req.json().catch(() => {
    throw new HttpError(400, "invalid_request", "Body must be JSON.");
  });
  const input = saveSlipSchema.parse(body);
  return json(await saveSlip(user, input), 201);
});
