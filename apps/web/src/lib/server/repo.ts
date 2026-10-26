import "server-only";
import { MODEL_VERSION } from "@fpp/core";
import type {
  DataQualityGrade,
  Fixture,
  FixtureListItem,
  FixtureStatus,
  HistoricalMatch,
  MarketId,
  PickSummary,
  PredictionResult,
  PredictionRunDto,
  PublishedPredictionDto,
  ProviderId,
  SettlementOutcome,
} from "@fpp/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb, must } from "./db";
import { HttpError } from "./http";

// ---------------------------------------------------------------------------
// Row shapes (subset of columns we select)
// ---------------------------------------------------------------------------

export interface FixtureRow {
  id: number;
  provider: ProviderId;
  provider_id: string;
  kickoff_at: string;
  status: FixtureStatus;
  status_detail: string | null;
  venue: string | null;
  rt_home: number | null;
  rt_away: number | null;
  ht_home: number | null;
  ht_away: number | null;
  final_home: number | null;
  final_away: number | null;
  data_updated_at: string;
  competition: { id: number; provider_id: string; name: string; country: string | null; logo_url: string | null; season: number };
  home: { id: number; provider_id: string; name: string; logo_url: string | null };
  away: { id: number; provider_id: string; name: string; logo_url: string | null };
}

export const FIXTURE_SELECT =
  "id, provider, provider_id, kickoff_at, status, status_detail, venue, rt_home, rt_away, ht_home, ht_away, final_home, final_away, data_updated_at," +
  " competition:competitions!inner(id, provider_id, name, country, logo_url, season)," +
  " home:teams!fixtures_home_team_id_fkey(id, provider_id, name, logo_url)," +
  " away:teams!fixtures_away_team_id_fkey(id, provider_id, name, logo_url)";

export interface RunRow {
  id: string;
  fixture_id: number;
  model_version: string;
  generated_at: string;
  input_data_at: string | null;
  expected_home: number | null;
  expected_away: number | null;
  markets: PredictionResult["markets"];
  quality: PredictionResult["quality"];
  team_context: { home: PredictionResult["home"]; away: PredictionResult["away"]; headToHead: PredictionResult["headToHead"]; recommendation: PredictionResult["recommendation"]; alternatives: PredictionResult["alternatives"] } | null;
  abstained: boolean;
  abstain_reasons: PredictionResult["abstainReasons"];
}

export interface PredictionRow {
  id: string;
  fixture_id: number;
  run_id: string;
  model_version: string;
  market: MarketId;
  outcome: string;
  line: number | null;
  label: string;
  raw_probability: number;
  probability: number;
  model_confidence: number;
  data_quality: DataQualityGrade;
  calibrated: boolean;
  published_at: string;
  input_data_at: string | null;
  kickoff_at: string;
  status: SettlementOutcome;
  settled_at: string | null;
}

export const FINAL_STATUSES: FixtureStatus[] = ["finished", "cancelled", "abandoned", "awarded"];

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export function publicFixtureId(provider: string, providerId: string) {
  return `${provider}:${providerId}`;
}

export function parseFixtureId(id: string): { provider: ProviderId; providerId: string } {
  const m = /^(api_football|football_data):(\d{1,12})$/.exec(id);
  if (!m) throw new HttpError(400, "invalid_request", "Invalid fixture id.");
  return { provider: m[1] as ProviderId, providerId: m[2]! };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toListItem(f: FixtureRow, run: RunRow | null, published: PredictionRow | null): FixtureListItem {
  const showScore = f.status === "finished" || f.status === "live" || f.status === "awarded";
  let pick: PickSummary | null = null;
  // A published prediction is the stable record; fall back to the latest run otherwise.
  if (published) {
    pick = {
      market: published.market,
      outcome: published.outcome,
      ...(published.line != null ? { line: Number(published.line) } : {}),
      label: published.label,
      probability: Number(published.probability),
      modelConfidence: Number(published.model_confidence),
      dataQuality: published.data_quality,
      calibrated: published.calibrated,
    };
  } else if (run?.team_context?.recommendation) {
    const r = run.team_context.recommendation;
    pick = {
      market: r.market,
      outcome: r.outcome,
      ...(r.line != null ? { line: r.line } : {}),
      label: r.label,
      probability: r.calibratedProbability,
      modelConfidence: r.modelConfidence,
      dataQuality: run.quality.grade,
      calibrated: r.calibrated,
    };
  }
  return {
    id: publicFixtureId(f.provider, f.provider_id),
    competition: { id: f.competition.provider_id, name: f.competition.name, country: f.competition.country, logoUrl: f.competition.logo_url, season: f.competition.season },
    home: { id: f.home.provider_id, name: f.home.name, logoUrl: f.home.logo_url },
    away: { id: f.away.provider_id, name: f.away.name, logoUrl: f.away.logo_url },
    kickoffAt: f.kickoff_at,
    status: f.status,
    statusDetail: f.status_detail,
    score: showScore ? { home: f.final_home, away: f.final_away } : null,
    predictionState: pick ? "recommended" : run ? "abstained" : "not_generated",
    pick,
    modelVersion: published?.model_version ?? run?.model_version ?? null,
  };
}

export function toRunDto(r: RunRow): PredictionRunDto {
  return {
    modelVersion: r.model_version,
    generatedAt: r.generated_at,
    inputDataAt: r.input_data_at,
    expectedGoals: r.expected_home != null && r.expected_away != null ? { home: Number(r.expected_home), away: Number(r.expected_away) } : null,
    markets: r.markets,
    recommendation: r.team_context?.recommendation ?? null,
    alternatives: r.team_context?.alternatives ?? [],
    abstained: r.abstained,
    abstainReasons: r.abstain_reasons,
    quality: r.quality,
    home: r.team_context?.home ?? null,
    away: r.team_context?.away ?? null,
    headToHead: r.team_context?.headToHead ?? [],
  };
}

export function toPublishedDto(p: PredictionRow, fixturePublicId: string): PublishedPredictionDto {
  return {
    id: p.id,
    fixtureId: fixturePublicId,
    modelVersion: p.model_version,
    label: p.label,
    market: p.market,
    outcome: p.outcome,
    ...(p.line != null ? { line: Number(p.line) } : {}),
    probability: Number(p.probability),
    rawProbability: Number(p.raw_probability),
    modelConfidence: Number(p.model_confidence),
    dataQuality: p.data_quality,
    publishedAt: p.published_at,
    inputDataAt: p.input_data_at,
    status: p.status,
    settledAt: p.settled_at,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettings {
  providerEnabled: boolean;
  modelEnabled: boolean;
  reserveFraction: number;
}

let settingsCache: { at: number; value: AppSettings } | null = null;

export async function getSettings(db = adminDb()): Promise<AppSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.value;
  const [rowsRes, versionRes] = await Promise.all([
    db.from("app_settings").select("key, value"),
    db.from("model_versions").select("is_enabled").eq("id", MODEL_VERSION).maybeSingle(),
  ]);
  const rows = must(rowsRes, "load settings") as { key: string; value: unknown }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const value: AppSettings = {
    providerEnabled: map.get("provider_enabled") !== false,
    // Global switch and the per-version switch must both allow the current model.
    modelEnabled: map.get("model_enabled") !== false && versionRes.data?.is_enabled !== false,
    reserveFraction: typeof map.get("quota_reserve_fraction") === "number" ? (map.get("quota_reserve_fraction") as number) : 0.15,
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

export async function setSetting(key: "provider_enabled" | "model_enabled" | "quota_reserve_fraction", value: boolean | number) {
  must(await adminDb().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }), "save setting");
  settingsCache = null;
}

export async function activeModelVersion(db = adminDb()): Promise<{ id: string; is_enabled: boolean } | null> {
  const { data } = await db.from("model_versions").select("id, is_enabled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface FixtureChange {
  fixtureId: number;
  kind: "kickoff_changed" | "status_changed";
  from: string;
  to: string;
}

/**
 * Upsert provider fixtures (with their competitions and teams). Returns
 * detected kickoff/status changes for already-known fixtures so saved slips
 * can be notified.
 */
export async function upsertFixtures(fixtures: Fixture[]): Promise<{ upserted: number; changes: FixtureChange[] }> {
  if (fixtures.length === 0) return { upserted: 0, changes: [] };
  const db = adminDb();
  const now = new Date().toISOString();

  const comps = dedupe(fixtures.map((f) => f.competition), (c) => `${c.provider}|${c.providerId}|${c.season}`);
  const compRows = must(
    await db
      .from("competitions")
      .upsert(
        comps.map((c) => ({ provider: c.provider, provider_id: c.providerId, season: c.season, name: c.name, country: c.country, logo_url: c.logoUrl, updated_at: now })),
        { onConflict: "provider,provider_id,season" },
      )
      .select("id, provider, provider_id, season"),
    "upsert competitions",
  ) as { id: number; provider: string; provider_id: string; season: number }[];
  const compId = new Map(compRows.map((r) => [`${r.provider}|${r.provider_id}|${r.season}`, r.id]));

  const teams = dedupe(fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]), (t) => `${t.provider}|${t.providerId}`);
  const teamId = new Map<string, number>();
  for (const chunk of chunks(teams, 500)) {
    const rows = must(
      await db
        .from("teams")
        .upsert(
          chunk.map((t) => ({ provider: t.provider, provider_id: t.providerId, name: t.name, short_name: t.shortName, logo_url: t.logoUrl, updated_at: now })),
          { onConflict: "provider,provider_id" },
        )
        .select("id, provider, provider_id"),
      "upsert teams",
    ) as { id: number; provider: string; provider_id: string }[];
    for (const r of rows) teamId.set(`${r.provider}|${r.provider_id}`, r.id);
  }

  const changes: FixtureChange[] = [];
  let upserted = 0;
  for (const chunk of chunks(dedupe(fixtures, (f) => `${f.provider}|${f.providerId}`), 400)) {
    const provider = chunk[0]!.provider;
    const existing = must(
      await db.from("fixtures").select("id, provider_id, kickoff_at, status").eq("provider", provider).in("provider_id", chunk.map((f) => f.providerId)),
      "load fixtures",
    ) as { id: number; provider_id: string; kickoff_at: string; status: string }[];
    const byPid = new Map(existing.map((e) => [e.provider_id, e]));
    for (const f of chunk) {
      const e = byPid.get(f.providerId);
      if (!e) continue;
      if (new Date(e.kickoff_at).getTime() !== new Date(f.kickoffAt).getTime())
        changes.push({ fixtureId: e.id, kind: "kickoff_changed", from: e.kickoff_at, to: f.kickoffAt });
      if (e.status !== f.status && ["postponed", "cancelled", "abandoned", "suspended"].includes(f.status))
        changes.push({ fixtureId: e.id, kind: "status_changed", from: e.status, to: f.status });
    }
    const rows = chunk.map((f) => ({
      provider: f.provider,
      provider_id: f.providerId,
      competition_id: compId.get(`${f.competition.provider}|${f.competition.providerId}|${f.competition.season}`)!,
      home_team_id: teamId.get(`${f.homeTeam.provider}|${f.homeTeam.providerId}`)!,
      away_team_id: teamId.get(`${f.awayTeam.provider}|${f.awayTeam.providerId}`)!,
      kickoff_at: f.kickoffAt,
      status: f.status,
      status_detail: f.statusDetail,
      venue: f.venue,
      rt_home: f.regularTime.home,
      rt_away: f.regularTime.away,
      ht_home: f.halfTime.home,
      ht_away: f.halfTime.away,
      final_home: f.final.home,
      final_away: f.final.away,
      data_updated_at: now,
    }));
    must(await db.from("fixtures").upsert(rows, { onConflict: "provider,provider_id" }), "upsert fixtures");
    upserted += rows.length;
  }
  return { upserted, changes };
}

export interface FixtureQuery {
  from: string; // ISO
  to: string; // ISO
  q?: string;
  competition?: string; // provider competition id
  country?: string;
  statuses?: FixtureStatus[];
  page?: number;
  pageSize?: number;
}

export async function queryFixtures(q: FixtureQuery): Promise<{ rows: FixtureRow[]; hasMore: boolean }> {
  const db = adminDb();
  const pageSize = q.pageSize ?? 50;
  const page = q.page ?? 1;
  let query = db
    .from("fixtures")
    .select(FIXTURE_SELECT)
    .gte("kickoff_at", q.from)
    .lt("kickoff_at", q.to)
    .order("kickoff_at", { ascending: true })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize); // one extra row to detect hasMore
  if (q.statuses?.length) query = query.in("status", q.statuses);
  if (q.competition) query = query.eq("competition.provider_id", q.competition);
  if (q.country) query = query.ilike("competition.country", escapeLike(q.country));

  if (q.q) {
    const term = `%${escapeLike(q.q)}%`;
    const [teams, comps] = await Promise.all([
      db.from("teams").select("id").ilike("name", term).limit(200),
      db.from("competitions").select("id").or(`name.ilike.${quoteOr(term)},country.ilike.${quoteOr(term)}`).limit(200),
    ]);
    const teamIds = (teams.data ?? []).map((t) => t.id as number);
    const compIds = (comps.data ?? []).map((c) => c.id as number);
    const ors: string[] = [];
    if (teamIds.length) ors.push(`home_team_id.in.(${teamIds.join(",")})`, `away_team_id.in.(${teamIds.join(",")})`);
    if (compIds.length) ors.push(`competition_id.in.(${compIds.join(",")})`);
    if (ors.length === 0) return { rows: [], hasMore: false };
    query = query.or(ors.join(","));
  }

  const rows = must(await query, "query fixtures") as unknown as FixtureRow[];
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function getFixtureByPublicId(id: string): Promise<FixtureRow | null> {
  const { provider, providerId } = parseFixtureId(id);
  const { data, error } = await adminDb().from("fixtures").select(FIXTURE_SELECT).eq("provider", provider).eq("provider_id", providerId).maybeSingle();
  if (error) throw new Error(`load fixture: ${error.message}`);
  return data as unknown as FixtureRow | null;
}

export async function getFixturesByPublicIds(ids: string[]): Promise<FixtureRow[]> {
  if (ids.length === 0) return [];
  const parsed = ids.map(parseFixtureId);
  const out: FixtureRow[] = [];
  for (const provider of new Set(parsed.map((p) => p.provider))) {
    const pids = parsed.filter((p) => p.provider === provider).map((p) => p.providerId);
    out.push(...(must(await adminDb().from("fixtures").select(FIXTURE_SELECT).eq("provider", provider).in("provider_id", pids), "load fixtures") as unknown as FixtureRow[]));
  }
  return out;
}

/** Finished matches of a competition (all stored seasons) before a time, for the model. */
export async function competitionHistory(provider: ProviderId, competitionProviderId: string, before: string, seasons = 2): Promise<HistoricalMatch[]> {
  const db = adminDb();
  const comps = must(
    await db.from("competitions").select("id, season").eq("provider", provider).eq("provider_id", competitionProviderId).order("season", { ascending: false }).limit(seasons),
    "load competition seasons",
  ) as { id: number }[];
  if (comps.length === 0) return [];
  const out: HistoricalMatch[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const rows = must(
      await db
        .from("fixtures")
        .select("provider, provider_id, kickoff_at, rt_home, rt_away, ht_home, ht_away, home:teams!fixtures_home_team_id_fkey(provider_id), away:teams!fixtures_away_team_id_fkey(provider_id)")
        .in("competition_id", comps.map((c) => c.id))
        .eq("status", "finished")
        .lt("kickoff_at", before)
        .not("rt_home", "is", null)
        .not("rt_away", "is", null)
        .order("kickoff_at", { ascending: true })
        .range(from, from + pageSize - 1),
      "load history",
    ) as unknown as { provider: string; provider_id: string; kickoff_at: string; rt_home: number; rt_away: number; ht_home: number | null; ht_away: number | null; home: { provider_id: string }; away: { provider_id: string } }[];
    for (const r of rows)
      out.push({
        fixtureId: publicFixtureId(r.provider, r.provider_id),
        date: r.kickoff_at,
        homeTeamId: r.home.provider_id,
        awayTeamId: r.away.provider_id,
        homeGoals: r.rt_home,
        awayGoals: r.rt_away,
        htHomeGoals: r.ht_home,
        htAwayGoals: r.ht_away,
      });
    if (rows.length < pageSize) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Runs and published predictions
// ---------------------------------------------------------------------------

export async function latestRuns(fixtureIds: number[], modelVersion?: string): Promise<Map<number, RunRow>> {
  const out = new Map<number, RunRow>();
  for (const chunk of chunks(fixtureIds, 200)) {
    let q = adminDb().from("prediction_runs").select("*").in("fixture_id", chunk).order("generated_at", { ascending: false });
    if (modelVersion) q = q.eq("model_version", modelVersion);
    const rows = must(await q, "load runs") as RunRow[];
    for (const r of rows) if (!out.has(r.fixture_id)) out.set(r.fixture_id, r);
  }
  return out;
}

export async function publishedFor(fixtureIds: number[]): Promise<Map<number, PredictionRow>> {
  const out = new Map<number, PredictionRow>();
  for (const chunk of chunks(fixtureIds, 200)) {
    const rows = must(await adminDb().from("predictions").select("*").in("fixture_id", chunk).order("published_at", { ascending: false }), "load predictions") as PredictionRow[];
    for (const r of rows) if (!out.has(r.fixture_id)) out.set(r.fixture_id, r);
  }
  return out;
}

export async function insertRun(fixtureId: number, result: PredictionResult): Promise<string> {
  const row = must(
    await adminDb()
      .from("prediction_runs")
      .insert({
        fixture_id: fixtureId,
        model_version: result.modelVersion,
        generated_at: result.generatedAt,
        input_data_at: result.quality.latestInputAt,
        expected_home: result.expectedGoals?.home ?? null,
        expected_away: result.expectedGoals?.away ?? null,
        markets: result.markets,
        quality: result.quality,
        team_context: { home: result.home, away: result.away, headToHead: result.headToHead, recommendation: result.recommendation, alternatives: result.alternatives },
        abstained: result.recommendation == null,
        abstain_reasons: result.abstainReasons,
      })
      .select("id")
      .single(),
    "insert run",
  ) as { id: string };
  return row.id;
}

/** Publish once per fixture and model version; later runs never overwrite it. */
export async function publishPrediction(fixtureId: number, kickoffAt: string, runId: string, result: PredictionResult): Promise<boolean> {
  const r = result.recommendation;
  if (!r) return false;
  const { data, error } = await adminDb()
    .from("predictions")
    .upsert(
      {
        fixture_id: fixtureId,
        run_id: runId,
        model_version: result.modelVersion,
        market: r.market,
        outcome: r.outcome,
        line: r.line ?? null,
        label: r.label,
        raw_probability: r.probability,
        probability: r.calibratedProbability,
        model_confidence: r.modelConfidence,
        data_quality: result.quality.grade,
        calibrated: r.calibrated,
        reasoning: r.reasoning,
        input_data_at: result.quality.latestInputAt,
        kickoff_at: kickoffAt,
      },
      { onConflict: "fixture_id,model_version", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`publish prediction: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Settled rows of a model version for calibration (raw model probability). */
export async function calibrationRows(modelVersion: string) {
  return fetchAll<{ market: MarketId; raw_probability: number; status: SettlementOutcome }>((from, to) =>
    adminDb().from("predictions").select("market, raw_probability, status").eq("model_version", modelVersion).in("status", ["won", "lost"]).range(from, to),
  ).then((rows) => rows.map((r) => ({ market: r.market, probability: Number(r.raw_probability), status: r.status as "won" | "lost" })));
}

export interface PerformanceRowDb extends PredictionRow {
  fixture: { provider: string; provider_id: string; competition: { name: string; provider_id: string }; home: { name: string }; away: { name: string } };
}

export async function performanceRows(modelVersion?: string, sinceIso?: string): Promise<PerformanceRowDb[]> {
  return fetchAll<PerformanceRowDb>((from, to) => {
    let q = adminDb()
      .from("predictions")
      .select("*, fixture:fixtures!inner(provider, provider_id, competition:competitions!inner(name, provider_id), home:teams!fixtures_home_team_id_fkey(name), away:teams!fixtures_away_team_id_fkey(name))")
      .order("kickoff_at", { ascending: false })
      .range(from, to);
    if (modelVersion) q = q.eq("model_version", modelVersion);
    if (sinceIso) q = q.gte("kickoff_at", sinceIso);
    return q;
  });
}

// ---------------------------------------------------------------------------
// Sync logs and API usage
// ---------------------------------------------------------------------------

export async function startJob(job: string): Promise<number> {
  const row = must(await adminDb().from("sync_logs").insert({ job, status: "running" }).select("id").single(), "start job") as { id: number };
  return row.id;
}

export async function finishJob(id: number, status: "ok" | "partial" | "failed", details: Record<string, unknown>, error?: string) {
  await adminDb().from("sync_logs").update({ status, details, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", id);
}

export async function lastJob(job: string, status?: "ok" | "partial") {
  let q = adminDb().from("sync_logs").select("*").eq("job", job).order("started_at", { ascending: false }).limit(1);
  if (status) q = q.in("status", status === "ok" ? ["ok", "partial"] : [status]);
  const { data } = await q.maybeSingle();
  return data as { id: number; status: string; started_at: string; finished_at: string | null; details: Record<string, unknown>; error: string | null } | null;
}

export async function usageToday(provider: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await adminDb().from("api_usage").select("requests").eq("provider", provider).eq("day", day).maybeSingle();
  return (data?.requests as number | undefined) ?? 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, pageSize = 1000, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const res = await page(from, from + pageSize - 1);
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dedupe<T>(arr: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of arr) m.set(key(x), x);
  return [...m.values()];
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Quote a value for a PostgREST `or=` filter. */
function quoteOr(s: string) {
  return `"${s.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

export type Db = SupabaseClient;
