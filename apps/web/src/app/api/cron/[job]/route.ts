import { z } from "zod";
import { requireCron } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { runJob, type JobName } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const jobSchema = z.enum(["sync", "predict", "settle", "reminders", "all"]);

/**
 * Scheduled entry point. Vercel Cron issues GET with `Authorization: Bearer $CRON_SECRET`;
 * GitHub Actions / other schedulers can call the same URL.
 */
const handler = route<{ params: Promise<{ job: string }> }>(async (req, ctx) => {
  requireCron(req);
  const job = jobSchema.parse((await ctx.params).job);
  const deadline = Date.now() + 45_000;
  const order: JobName[] = job === "all" ? ["sync", "predict", "settle", "reminders"] : [job];
  const results = [];
  for (const j of order) {
    try {
      results.push(await runJob(j, { deadline }));
    } catch (e) {
      results.push({ job: j, status: "failed", error: (e as Error).message });
    }
  }
  return json({ results });
});

export const GET = handler;
export const POST = handler;
