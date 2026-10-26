import "server-only";
import {
  DEFAULT_ENGINE_CONFIG,
  MODEL_VERSION,
  buildCalibrationTable,
  predictFixture,
  rollUpSlipStatus,
  settleSelection,
  type CalibrationTable,
  type MarketId,
  type SettlementOutcome,
} from "@fpp/core";
import { ProviderError, unavailableInputs } from "@fpp/core/providers";
import { adminDb, must } from "./db";
import { currentSeason, env } from "./env";
import { footballService } from "./football";
import { ProviderDisabledError, QuotaError } from "./footballService";
import { sendNotifications, type OutgoingNotification } from "./notify";
import {
  FINAL_STATUSES,
  calibrationRows,
  chunks,
  competitionHistory,
  finishJob,
  getSettings,
  insertRun,
  latestRuns,
  publicFixtureId,
  publishPrediction,
  startJob,
  upsertFixtures,
  FIXTURE_SELECT,
  type FixtureChange,
  type FixtureRow,
  type RunRow,
} from "./repo";

const HOUR = 3_600_000;
/** Predictions are published (frozen for tracking) once kickoff is this close. */
export const PUBLISH_WINDOW_HOURS = 24;
/** Fixtures this far ahead get model runs. */
const PREDICT_AHEAD_HOURS = 72;
const RERUN_AFTER_HOURS = 6;
/** Settlement is attempted this long after kickoff. */
const SETTLE_AFTER_MINUTES = 110;

export type JobName = "sync" | "predict" | "settle" | "reminders";

export async function runJob(name: JobName, opts: { deadline?: number } = {}) {
  const id = await startJob(name);
  try {
    const details =
      name === "sync" ? await syncCompetitions(opts.deadline)
      : name === "predict" ? await generatePredictions()
      : name === "settle" ? await settlePending()
      : await sendKickoffReminders();
    const status = Array.isArray(details.errors) && details.errors.length > 0 ? "partial" : "ok";
    await finishJob(id, status, details);
    return { job: name, status, details };
  } catch (e) {
    await finishJob(id, "failed", {}, (e as Error).message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 1. Sync fixtures + results (one request per competition season, cached)
// ---------------------------------------------------------------------------

export async function syncCompetitions(deadline = Date.now() + 45_000) {
  const svc = footballService();
  const season = currentSeason();
  const errors: string[] = [];
  const synced: { competition: string; season: number; fixtures: number; fromCache: boolean; stale: boolean }[] = [];
  const allChanges: FixtureChange[] = [];

  for (const competition of env().competitions) {
    // Current season refreshes every 6h; the previous season is immutable, so cache it for 30 days.
    for (const [s, ttl] of [[season, 6 * HOUR], [season - 1, 30 * 24 * HOUR]] as const) {
      if (Date.now() > deadline) {
        errors.push("Time budget reached; remaining competitions will sync on the next run.");
        return { synced, errors, changes: allChanges.length };
      }
      try {
        const res = await svc.seasonFixtures(competition, s, { ttlMs: ttl });
        if (!res.fromCache || res.stale) {
          const { changes } = await upsertFixtures(res.fixtures);
          allChanges.push(...changes);
        }
        synced.push({ competition, season: s, fixtures: res.fixtures.length, fromCache: res.fromCache, stale: res.stale });
        if (res.warning) errors.push(`${competition}/${s}: ${res.warning}`);
      } catch (e) {
        errors.push(`${competition}/${s}: ${describe(e)}`);
        if (e instanceof QuotaError || e instanceof ProviderDisabledError) return { synced, errors, changes: allChanges.length };
      }
    }
  }
  await notifyMatchChanges(allChanges);
  return { synced, errors, changes: allChanges.length };
}

// ---------------------------------------------------------------------------
// 2. Generate model runs and publish predictions
// ---------------------------------------------------------------------------

export async function loadCalibration(modelVersion = MODEL_VERSION): Promise<CalibrationTable> {
  return buildCalibrationTable(await calibrationRows(modelVersion));
}

/**
 * Run the engine for one fixture using only stored data (no provider calls),
 * store the run, and publish if inside the publication window.
 */
export async function predictAndStore(f: FixtureRow, ctx: { calibration: CalibrationTable; modelEnabled: boolean; historyCache?: Map<string, Awaited<ReturnType<typeof competitionHistory>>> }) {
  const key = `${f.provider}:${f.competition.provider_id}`;
  let history = ctx.historyCache?.get(key);
  if (!history) {
    history = await competitionHistory(f.provider, f.competition.provider_id, new Date().toISOString());
    ctx.historyCache?.set(key, history);
  }
  const svcCaps = (() => {
    try {
      return unavailableInputs(footballService().provider.capabilities);
    } catch {
      return [];
    }
  })();
  const result = predictFixture({
    fixtureId: publicFixtureId(f.provider, f.provider_id),
    kickoffAt: f.kickoff_at,
    status: f.status,
    homeTeamId: f.home.provider_id,
    awayTeamId: f.away.provider_id,
    homeName: f.home.name,
    awayName: f.away.name,
    history,
    unavailable: svcCaps,
    calibration: ctx.calibration,
    config: DEFAULT_ENGINE_CONFIG,
    modelEnabled: ctx.modelEnabled,
  });
  if (result.abstainReasons.includes("MATCH_NOT_UPCOMING")) return { result, runId: null, published: false };
  const runId = await insertRun(f.id, result);
  const withinWindow = new Date(f.kickoff_at).getTime() - Date.now() <= PUBLISH_WINDOW_HOURS * HOUR;
  const published = withinWindow && result.recommendation ? await publishPrediction(f.id, f.kickoff_at, runId, result) : false;
  return { result, runId, published };
}

export async function generatePredictions() {
  const db = adminDb();
  const settings = await getSettings();
  const now = new Date();
  const upcoming = must(
    await db
      .from("fixtures")
      .select(FIXTURE_SELECT)
      .in("status", ["scheduled", "tbd"])
      .gt("kickoff_at", now.toISOString())
      .lte("kickoff_at", new Date(now.getTime() + PREDICT_AHEAD_HOURS * HOUR).toISOString())
      .order("kickoff_at")
      .limit(500),
    "load upcoming fixtures",
  ) as unknown as FixtureRow[];

  const runs = await latestRuns(upcoming.map((f) => f.id), MODEL_VERSION);
  const { data: publishedRows } = await db.from("predictions").select("fixture_id").eq("model_version", MODEL_VERSION).in("fixture_id", upcoming.map((f) => f.id));
  const published = new Set((publishedRows ?? []).map((r) => r.fixture_id as number));

  const calibration = await loadCalibration();
  const historyCache = new Map();
  let generated = 0;
  let newlyPublished = 0;
  const errors: string[] = [];
  for (const f of upcoming) {
    const run = runs.get(f.id);
    const fresh = run && now.getTime() - new Date(run.generated_at).getTime() < RERUN_AFTER_HOURS * HOUR && new Date(f.data_updated_at) <= new Date(run.generated_at);
    const needsPublishCheck = !published.has(f.id) && new Date(f.kickoff_at).getTime() - now.getTime() <= PUBLISH_WINDOW_HOURS * HOUR;
    if (fresh && !needsPublishCheck) continue;
    try {
      const r = await predictAndStore(f, { calibration, modelEnabled: settings.modelEnabled, historyCache });
      generated++;
      if (r.published) newlyPublished++;
    } catch (e) {
      errors.push(`${f.id}: ${describe(e)}`);
    }
  }
  return { considered: upcoming.length, generated, published: newlyPublished, errors };
}

// ---------------------------------------------------------------------------
// 3. Settle predictions and slip selections
// ---------------------------------------------------------------------------

interface PendingSelection {
  id: string;
  slip_id: string;
  fixture_id: number;
  market: MarketId;
  outcome: string;
  line: number | null;
  label: string;
  slip: { user_id: string };
}

export async function settlePending() {
  const db = adminDb();
  const cutoff = new Date(Date.now() - SETTLE_AFTER_MINUTES * 60_000).toISOString();
  const errors: string[] = [];

  const preds = must(
    await db.from("predictions").select("id, fixture_id, market, outcome, line, label").eq("status", "pending").lt("kickoff_at", cutoff).limit(500),
    "load pending predictions",
  ) as { id: string; fixture_id: number; market: MarketId; outcome: string; line: number | null; label: string }[];
  const sels = must(
    await db
      .from("slip_selections")
      .select("id, slip_id, fixture_id, market, outcome, line, label, slip:prediction_slips!inner(user_id), fx:fixtures!inner(kickoff_at)")
      .eq("status", "pending")
      .lt("fx.kickoff_at", cutoff)
      .limit(1000),
    "load pending selections",
  ) as unknown as PendingSelection[];

  const fixtureIds = [...new Set([...preds.map((p) => p.fixture_id), ...sels.map((s) => s.fixture_id)])];
  if (fixtureIds.length === 0) return { predictions: 0, selections: 0, refreshed: 0, errors };

  const loadFixtures = async () => {
    const out = new Map<number, FixtureRow>();
    for (const c of chunks(fixtureIds, 200))
      for (const f of must(await db.from("fixtures").select(FIXTURE_SELECT).in("id", c), "load fixtures") as unknown as FixtureRow[]) out.set(f.id, f);
    return out;
  };
  let fixtures = await loadFixtures();

  // Only ask the provider about fixtures whose stored state is not final yet.
  const stale = [...fixtures.values()].filter((f) => !FINAL_STATUSES.includes(f.status));
  let refreshed = 0;
  if (stale.length > 0) {
    try {
      const svc = footballService();
      const byProvider = stale.filter((f) => f.provider === svc.provider.id).map((f) => f.provider_id);
      const fresh = await svc.fixturesByIds(byProvider, "critical");
      await upsertFixtures(fresh);
      refreshed = fresh.length;
      fixtures = await loadFixtures();
    } catch (e) {
      errors.push(`refresh: ${describe(e)}`);
    }
  }

  const now = new Date();
  const settlementInput = (f: FixtureRow) => ({
    status: f.status,
    kickoffAt: f.kickoff_at,
    regularTime: { home: f.rt_home, away: f.rt_away },
    halfTime: { home: f.ht_home, away: f.ht_away },
  });

  let settledPreds = 0;
  for (const p of preds) {
    const f = fixtures.get(p.fixture_id);
    if (!f) continue;
    const d = settleSelection({ market: p.market, outcome: p.outcome, ...(p.line != null ? { line: Number(p.line) } : {}) }, settlementInput(f), now);
    if (d.outcome === "pending") continue;
    // The unique settlement row is the idempotency guard against double settlement.
    const { data: inserted, error } = await db
      .from("prediction_settlements")
      .upsert({ prediction_id: p.id, outcome: d.outcome, rt_home: f.rt_home, rt_away: f.rt_away, reason: d.reason, source: f.provider }, { onConflict: "prediction_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      errors.push(`prediction ${p.id}: ${error.message}`);
      continue;
    }
    if (!inserted?.length) continue;
    await db.from("predictions").update({ status: d.outcome, settled_at: now.toISOString() }).eq("id", p.id).eq("status", "pending");
    settledPreds++;
  }

  const notifications: OutgoingNotification[] = [];
  const touchedSlips = new Set<string>();
  let settledSels = 0;
  for (const s of sels) {
    const f = fixtures.get(s.fixture_id);
    if (!f) continue;
    const d = settleSelection({ market: s.market, outcome: s.outcome, ...(s.line != null ? { line: Number(s.line) } : {}) }, settlementInput(f), now);
    if (d.outcome === "pending") continue;
    const { data: updated } = await db
      .from("slip_selections")
      .update({ status: d.outcome, settled_at: now.toISOString() })
      .eq("id", s.id)
      .eq("status", "pending")
      .select("id");
    if (!updated?.length) continue;
    settledSels++;
    touchedSlips.add(s.slip_id);
    notifications.push({
      userId: s.slip.user_id,
      kind: "result",
      refId: s.id,
      title: `${f.home.name} ${f.rt_home ?? "-"}–${f.rt_away ?? "-"} ${f.away.name}`,
      body: `${s.label}: ${d.outcome.toUpperCase()}`,
      data: { fixtureId: publicFixtureId(f.provider, f.provider_id) },
    });
  }

  for (const slipId of touchedSlips) {
    const rows = must(await db.from("slip_selections").select("status").eq("slip_id", slipId), "load slip") as { status: SettlementOutcome }[];
    const status = rollUpSlipStatus(rows.map((r) => r.status));
    if (status === "pending") continue;
    const { data: slip } = await db.from("prediction_slips").update({ status, updated_at: now.toISOString() }).eq("id", slipId).eq("status", "pending").select("user_id, name").maybeSingle();
    if (slip)
      notifications.push({
        userId: slip.user_id as string,
        kind: "settlement",
        refId: slipId,
        title: "Prediction slip settled",
        body: `${(slip.name as string | null) ?? "Your slip"}: ${status.toUpperCase()}`,
        data: { slipId },
      });
  }
  const push = await sendNotifications(notifications).catch((e) => (errors.push(`notify: ${describe(e)}`), null));
  return { predictions: settledPreds, selections: settledSels, refreshed, notifications: push, errors };
}

// ---------------------------------------------------------------------------
// 4. Notifications
// ---------------------------------------------------------------------------

export async function sendKickoffReminders() {
  const db = adminDb();
  const now = Date.now();
  const rows = must(
    await db
      .from("slip_selections")
      .select("id, label, slip:prediction_slips!inner(user_id), fx:fixtures!inner(provider, provider_id, kickoff_at, status, home:teams!fixtures_home_team_id_fkey(name), away:teams!fixtures_away_team_id_fkey(name))")
      .eq("status", "pending")
      .gt("fx.kickoff_at", new Date(now).toISOString())
      .lte("fx.kickoff_at", new Date(now + HOUR).toISOString())
      .limit(1000),
    "load reminders",
  ) as unknown as { id: string; label: string; slip: { user_id: string }; fx: { provider: string; provider_id: string; kickoff_at: string; home: { name: string }; away: { name: string } } }[];
  const result = await sendNotifications(
    rows.map((r) => ({
      userId: r.slip.user_id,
      kind: "kickoff_reminder" as const,
      refId: r.id,
      title: `Kickoff soon: ${r.fx.home.name} vs ${r.fx.away.name}`,
      body: `Your pick: ${r.label}`,
      data: { fixtureId: publicFixtureId(r.fx.provider, r.fx.provider_id) },
    })),
  );
  return { candidates: rows.length, ...result, errors: [] as string[] };
}

async function notifyMatchChanges(changes: FixtureChange[]) {
  if (changes.length === 0) return;
  const db = adminDb();
  const rows = must(
    await db
      .from("slip_selections")
      .select("fixture_id, label, slip:prediction_slips!inner(user_id)")
      .eq("status", "pending")
      .in("fixture_id", [...new Set(changes.map((c) => c.fixtureId))]),
    "load affected selections",
  ) as unknown as { fixture_id: number; label: string; slip: { user_id: string } }[];
  const out: OutgoingNotification[] = [];
  for (const c of changes)
    for (const r of rows.filter((x) => x.fixture_id === c.fixtureId))
      out.push({
        userId: r.slip.user_id,
        kind: "match_change",
        refId: `${c.fixtureId}:${c.kind}:${c.to}`,
        title: c.kind === "kickoff_changed" ? "Kickoff time changed" : `Match ${c.to}`,
        body: c.kind === "kickoff_changed" ? `${r.label} — new kickoff ${new Date(c.to).toUTCString()}` : `${r.label} — status is now ${c.to}.`,
      });
  await sendNotifications(out);
}

function describe(e: unknown) {
  if (e instanceof ProviderError) return `${e.kind}: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}

export type { RunRow };
