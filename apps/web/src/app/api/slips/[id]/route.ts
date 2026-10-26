import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { deleteSlip } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = z.uuid().parse((await ctx.params).id);
  await deleteSlip(user, id);
  return json({ ok: true });
});
