import { MODEL_VERSION } from "@fpp/core";
import { requireAdmin } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/db";
import { configStatus, env } from "@/lib/server/env";
import { json, route } from "@/lib/server/http";
import { getSettings } from "@/lib/server/repo";
import { performance } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAdmin(req);
  const db = adminDb();
  const count = async (table: string, f?: (q: any) => any) => {
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (f) q = f(q);
    const { count } = await q;
    return count ?? 0;
  };
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [users, fixtures, pendingSettlement, runsFailedAbstain, usage, logs, models, lastFixture, settings, perf] = await Promise.all([
    count("profiles"),
    count("fixtures"),
    count("predictions", (q) => q.eq("status", "pending").lt("kickoff_at", new Date(Date.now() - 2 * 3_600_000).toISOString())),
    count("prediction_runs", (q) => q.eq("abstained", true).gte("generated_at", new Date(Date.now() - 86_400_000).toISOString())),
    db.from("api_usage").select("*").gte("day", since).order("day", { ascending: false }),
    db.from("sync_logs").select("id, job, status, started_at, finished_at, error, details").order("started_at", { ascending: false }).limit(30),
    db.from("model_versions").select("*").order("created_at", { ascending: false }),
    db.from("fixtures").select("data_updated_at").order("data_updated_at", { ascending: false }).limit(1).maybeSingle(),
    getSettings(),
    performance(MODEL_VERSION),
  ]);
  return json({
    config: configStatus(),
    provider: env().provider,
    settings,
    counts: { users, fixtures, pendingSettlement, abstentionsLast24h: runsFailedAbstain },
    apiUsage: usage.data ?? [],
    jobs: logs.data ?? [],
    failedJobs: (logs.data ?? []).filter((l) => l.status === "failed" || l.status === "partial"),
    models: models.data ?? [],
    dataFreshness: lastFixture.data?.data_updated_at ?? null,
    performance: perf,
  });
});
