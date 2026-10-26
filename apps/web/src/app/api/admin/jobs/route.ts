import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { runJob } from "@/lib/server/jobs";
import { rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  await rateLimit(`admin:${admin.id}:jobs`, 10);
  const { job } = z.object({ job: z.enum(["sync", "predict", "settle", "reminders"]) }).parse(await req.json());
  return json(await runJob(job, { deadline: Date.now() + 45_000 }));
});
