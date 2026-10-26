import "server-only";
import {
  MODEL_VERSION,
  PROBABILITY_BUCKETS,
  bucketFor,
  groupPerformance,
  saveSlipSchema,
  summarisePerformance,
  wilsonInterval,
  type FixturesResponse,
  type MatchDetailDto,
  type PerformanceResponse,
  type SavedSlipDto,
  type StrongestResponse,
  type MarketId,
  type DataQualityGrade,
  type SettlementOutcome,
} from "@fpp/core";
import { unavailableInputs } from "@fpp/core/providers";
import type { z } from "zod";
import { dayRange, localDate, rankStrongest } from "../ranking";
import { adminDb, must, userDb } from "./db";
import { HttpError } from "./http";
import { getSettings, getFixtureByPublicId, getFixturesByPublicIds, lastJob, latestRuns, performanceRows, publicFixtureId, publishedFor, queryFixtures, toListItem, toPublishedDto, toRunDto, type FixtureRow } from "./repo";
import { loadCalibration, predictAndStore } from "./jobs";
import type { AuthUser } from "./auth";
import { footballService } from "./football";

const MIN_SAMPLE_FOR_CLAIMS = 100;

async function withPredictions(rows: FixtureRow[]) {
  const ids = rows.map((r) => r.id);
  const [runs, pubs] = await Promise.all([latestRuns(ids, MODEL_VERSION), publishedFor(ids)]);
  return rows.map((f) => {
    const run = runs.get(f.id) ?? null;
    const pub = pubs.get(f.id) ?? null;
    return {
      row: f,
      fixture: toListItem(f, run, pub),
      run: run ? toRunDto(run) : null,
      published: pub ? toPublishedDto(pub, publicFixtureId(f.provider, f.provider_id)) : null,
    };
  });
}

async function syncNotices(): Promise<{ lastSyncAt: string | null; notices: string[] }> {
  const last = await lastJob("sync", "ok");
  const notices: string[] = [];
  if (!last) notices.push("Football data has not been synchronised yet. An administrator needs to run the sync job.");
  else if (Date.now() - new Date(last.finished_at ?? last.started_at).getTime() > 12 * 3_600_000)
    notices.push("Fixture data may be out of date: the last successful sync was more than 12 hours ago.");
  const settings = await getSettings();
  if (!settings.providerEnabled) notices.push("Live data refresh is paused by an administrator. Showing stored data.");
  if (!settings.modelEnabled) notices.push("The prediction model is temporarily disabled.");
  return { lastSyncAt: last?.finished_at ?? null, notices };
}

export async function listFixtures(p: { date?: string; tz?: number; range?: "day" | "upcoming"; q?: string; competition?: string; country?: string; minProbability?: number; market?: MarketId; page?: number }): Promise<FixturesResponse> {
  const tz = p.tz ?? 0;
  const date = p.date ?? localDate(new Date(), tz);
  const range = p.range === "upcoming" ? { from: new Date().toISOString(), to: new Date(Date.now() + 7 * 86_400_000).toISOString() } : dayRange(date, tz);
  const { rows, hasMore } = await queryFixtures({ ...range, q: p.q, competition: p.competition, country: p.country, page: p.page });
  let items = (await withPredictions(rows)).map((x) => x.fixture);
  if (p.minProbability != null || p.market)
    items = items.filter((f) => f.pick && (p.minProbability == null || f.pick.probability >= p.minProbability) && (!p.market || f.pick.market === p.market));
  return { date: p.range === "upcoming" ? null : date, fixtures: items, page: p.page ?? 1, hasMore, ...(await syncNotices()) };
}

export async function strongest(p: { date?: string; tz?: number; minProbability?: number; market?: MarketId; competition?: string; minQuality?: DataQualityGrade; kickoffFrom?: string; kickoffTo?: string; limit?: number }): Promise<StrongestResponse> {
  const tz = p.tz ?? 0;
  const date = p.date ?? localDate(new Date(), tz);
  const range = dayRange(date, tz);
  const from = new Date(Math.max(Date.now(), new Date(range.from).getTime())).toISOString();
  const { rows } = await queryFixtures({ from, to: range.to, statuses: ["scheduled", "tbd"], competition: p.competition, pageSize: 500 });
  const cands = await withPredictions(rows);
  const minProbability = p.minProbability ?? 0.75;
  const picks = rankStrongest(cands, { minProbability, market: p.market, competition: p.competition, minQuality: p.minQuality, kickoffFrom: p.kickoffFrom, kickoffTo: p.kickoffTo }).slice(0, p.limit ?? 50);
  const { notices } = await syncNotices();
  if (picks.length === 0) notices.push("No available selections meet the current criteria.");
  return { date, criteria: { minProbability, market: p.market ?? null, competition: p.competition ?? null, minQuality: p.minQuality ?? null }, picks, notices };
}

// Concurrent requests for the same match share one on-demand generation instead of each storing a run.
const generating = new Map<number, Promise<unknown>>();
function generateOnce(f: FixtureRow): Promise<unknown> {
  let p = generating.get(f.id);
  if (!p) {
    p = (async () => {
      const settings = await getSettings();
      return predictAndStore(f, { calibration: await loadCalibration(), modelEnabled: settings.modelEnabled });
    })().finally(() => generating.delete(f.id));
    generating.set(f.id, p);
  }
  return p;
}

export async function matchDetail(id: string, allowGenerate: boolean): Promise<MatchDetailDto> {
  const f = await getFixtureByPublicId(id);
  if (!f) throw new HttpError(404, "not_found", "Match not found. It may not be in a supported competition.");
  let { fixture, run, published } = (await withPredictions([f]))[0]!;
  const notices: string[] = [];
  const upcoming = (f.status === "scheduled" || f.status === "tbd") && new Date(f.kickoff_at).getTime() > Date.now();

  // Generate on demand from stored data only (no provider request) if no run exists yet.
  if (!run && upcoming && allowGenerate) {
    await generateOnce(f);
    ({ fixture, run, published } = (await withPredictions([f]))[0]!);
  }
  if (!run && !upcoming) notices.push("No prediction was generated for this match before kickoff.");
  if (upcoming && Date.now() - new Date(f.data_updated_at).getTime() > 12 * 3_600_000) notices.push("Match data was last refreshed more than 12 hours ago.");
  if (published && run && (published.market !== run.recommendation?.market || published.outcome !== run.recommendation?.outcome))
    notices.push("The tracked (published) prediction differs from the latest model view; history uses the published one.");
  try {
    if (run) run.quality.unavailable = run.quality.unavailable.length ? run.quality.unavailable : unavailableInputs(footballService().provider.capabilities);
  } catch {
    /* provider not configured; keep stored list */
  }
  return {
    fixture: { ...fixture, venue: f.venue, halfTime: { home: f.ht_home, away: f.ht_away } },
    run,
    published,
    dataUpdatedAt: f.data_updated_at,
    notices,
  };
}

export async function performance(modelVersion: string | "all" = MODEL_VERSION): Promise<PerformanceResponse> {
  const rows = await performanceRows(modelVersion === "all" ? undefined : modelVersion);
  const perf = rows.map((r) => ({ ...r, probability: Number(r.probability), status: r.status }));
  const bucketLabel = (p: number) => {
    const [lo, hi] = bucketFor(p);
    return `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`;
  };
  const calibration = PROBABILITY_BUCKETS.map(([lo, hi]) => {
    const inBucket = perf.filter((r) => (r.status === "won" || r.status === "lost") && r.probability >= lo && r.probability < hi);
    const wins = inBucket.filter((r) => r.status === "won").length;
    return {
      bucket: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`,
      n: inBucket.length,
      winRate: inBucket.length ? wins / inBucket.length : null,
      meanPredicted: inBucket.length ? inBucket.reduce((s, r) => s + r.probability, 0) / inBucket.length : null,
      interval: inBucket.length ? wilsonInterval(wins, inBucket.length) : null,
    };
  }).filter((b) => b.n > 0);
  return {
    modelVersion: modelVersion === "all" ? null : modelVersion,
    overall: summarisePerformance(perf),
    byMarket: groupPerformance(perf, (r) => r.market),
    byCompetition: groupPerformance(perf, (r) => r.fixture.competition.name),
    byProbability: groupPerformance(perf, (r) => bucketLabel(r.probability)),
    calibration,
    minSampleForClaims: MIN_SAMPLE_FOR_CLAIMS,
    recent: rows.slice(0, 40).map((r) => ({
      ...toPublishedDto(r, publicFixtureId(r.fixture.provider, r.fixture.provider_id)),
      homeName: r.fixture.home.name,
      awayName: r.fixture.away.name,
      competition: r.fixture.competition.name,
      kickoffAt: r.kickoff_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Slips
// ---------------------------------------------------------------------------

export async function saveSlip(user: AuthUser, input: z.infer<typeof saveSlipSchema>) {
  const ids = [...new Set(input.selections.map((s) => s.fixtureId))];
  if (ids.length !== input.selections.length) throw new HttpError(400, "invalid_request", "Each match can appear only once on a slip.");
  const rows = await getFixturesByPublicIds(ids);
  const byPublic = new Map(rows.map((r) => [publicFixtureId(r.provider, r.provider_id), r]));
  const runs = await latestRuns(rows.map((r) => r.id), MODEL_VERSION);

  const selections = input.selections.map((s) => {
    const f = byPublic.get(s.fixtureId);
    if (!f) throw new HttpError(400, "invalid_request", `Unknown match ${s.fixtureId}.`);
    // Predictions can only be recorded before kickoff, otherwise tracking would be meaningless.
    if (!(f.status === "scheduled" || f.status === "tbd") || new Date(f.kickoff_at).getTime() <= Date.now())
      throw new HttpError(409, "match_started", `${f.home.name} vs ${f.away.name} has already started.`);
    // Probability comes from the server's stored model run — never from the client.
    const run = runs.get(f.id);
    const market = run?.markets.find((m) => m.market === s.market && m.outcome === s.outcome && (m.line ?? null) === (s.line ?? null));
    if (run && !market) throw new HttpError(400, "invalid_request", `Unsupported selection for ${f.home.name} vs ${f.away.name}.`);
    return {
      fixture_id: f.id,
      run_id: run?.id ?? null,
      model_version: run?.model_version ?? null,
      market: s.market,
      outcome: s.outcome,
      line: s.line ?? null,
      label: market?.label ?? `${s.market} ${s.outcome}${s.line != null ? ` ${s.line}` : ""}`,
      probability: market?.probability ?? null,
      data_quality: run?.quality.grade ?? null,
    };
  });

  // Inserted with the service role: clients cannot write slips directly (see migration).
  const db = adminDb();
  const slip = must(await db.from("prediction_slips").insert({ user_id: user.id, name: input.name ?? null }).select("id, share_token").single(), "create slip") as { id: string; share_token: string };
  const { error } = await db.from("slip_selections").insert(selections.map((s) => ({ ...s, slip_id: slip.id })));
  if (error) {
    await db.from("prediction_slips").delete().eq("id", slip.id);
    throw new Error(`save selections: ${error.message}`);
  }
  return { id: slip.id, shareToken: slip.share_token };
}

const SLIP_SELECT =
  "id, name, status, created_at, share_token, slip_selections(fixture_id, market, outcome, line, label, probability, data_quality, status," +
  " fx:fixtures(provider, provider_id, kickoff_at, final_home, final_away, status, competition:competitions(name), home:teams!fixtures_home_team_id_fkey(name), away:teams!fixtures_away_team_id_fkey(name)))";

interface SlipRow {
  id: string;
  name: string | null;
  status: SavedSlipDto["status"];
  created_at: string;
  share_token: string | null;
  slip_selections: {
    market: MarketId;
    outcome: string;
    line: number | null;
    label: string;
    probability: number | null;
    data_quality: DataQualityGrade | null;
    status: SettlementOutcome;
    fx: { provider: string; provider_id: string; kickoff_at: string; final_home: number | null; final_away: number | null; status: string; competition: { name: string }; home: { name: string }; away: { name: string } };
  }[];
}

function toSlipDto(r: SlipRow, includeShare: boolean): SavedSlipDto {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    createdAt: r.created_at,
    shareToken: includeShare ? r.share_token : null,
    selections: r.slip_selections
      .map((s) => ({
        fixtureId: publicFixtureId(s.fx.provider, s.fx.provider_id),
        homeName: s.fx.home.name,
        awayName: s.fx.away.name,
        competition: s.fx.competition.name,
        kickoffAt: s.fx.kickoff_at,
        market: s.market,
        outcome: s.outcome,
        ...(s.line != null ? { line: Number(s.line) } : {}),
        label: s.label,
        probability: s.probability != null ? Number(s.probability) : null,
        dataQuality: s.data_quality,
        status: s.status,
        score: s.fx.status === "finished" ? { home: s.fx.final_home, away: s.fx.final_away } : null,
      }))
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  };
}

export async function listSlips(user: AuthUser): Promise<SavedSlipDto[]> {
  const rows = must(await userDb(user.accessToken).from("prediction_slips").select(SLIP_SELECT).order("created_at", { ascending: false }).limit(100), "list slips") as unknown as SlipRow[];
  return rows.map((r) => toSlipDto(r, true));
}

export async function deleteSlip(user: AuthUser, id: string) {
  const { data } = await userDb(user.accessToken).from("prediction_slips").delete().eq("id", id).select("id");
  if (!data?.length) throw new HttpError(404, "not_found", "Slip not found.");
}

/** Public read of a shared slip by its unguessable token (no owner information exposed). */
export async function sharedSlip(token: string): Promise<SavedSlipDto> {
  if (!/^[a-f0-9]{18}$/.test(token)) throw new HttpError(404, "not_found", "Slip not found.");
  const { data } = await adminDb().from("prediction_slips").select(SLIP_SELECT).eq("share_token", token).maybeSingle();
  if (!data) throw new HttpError(404, "not_found", "Slip not found.");
  return toSlipDto(data as unknown as SlipRow, false);
}
