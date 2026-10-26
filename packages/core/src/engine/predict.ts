import type {
  AbstainReason,
  DataQuality,
  DataQualityGrade,
  HistoricalMatch,
  MarketProbability,
  PredictionResult,
  Recommendation,
  FixtureStatus,
} from "../types";
import { applyCalibration, type CalibrationTable } from "./calibration";
import { DEFAULT_ENGINE_CONFIG, MODEL_VERSION, isRecommendable, type EngineConfig } from "./config";
import { computeMarkets, selectionKey, type MarketInputs } from "./markets";
import { expectedGoals, fitLeagueModel, type LeagueModel } from "./strength";
import { computeTable, headToHead, summariseTeam } from "./summary";

export interface PredictInput {
  fixtureId: string;
  kickoffAt: string;
  status: FixtureStatus;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  /** Finished matches from the same competition. Anything at/after kickoff is ignored. */
  history: HistoricalMatch[];
  /** Inputs the data source cannot provide (shown to users as unavailable). */
  unavailable?: string[];
  calibration?: CalibrationTable | null;
  config?: EngineConfig;
  modelEnabled?: boolean;
  now?: Date;
}

const DAY_MS = 86_400_000;

/** Pre-match model: never call this with information from after kickoff. */
export function predictFixture(input: PredictInput): PredictionResult {
  const config = input.config ?? DEFAULT_ENGINE_CONFIG;
  const c = config.criteria;
  const now = input.now ?? new Date();
  const kickoff = new Date(input.kickoffAt);
  const asOf = new Date(Math.min(now.getTime(), kickoff.getTime()));
  const history = input.history.filter((m) => new Date(m.date).getTime() < asOf.getTime());

  const base = (
    quality: DataQuality,
    reasons: AbstainReason[],
    extra: Partial<PredictionResult> = {},
  ): PredictionResult => ({
    modelVersion: MODEL_VERSION,
    generatedAt: now.toISOString(),
    fixtureId: input.fixtureId,
    expectedGoals: null,
    markets: [],
    recommendation: null,
    alternatives: [],
    abstained: reasons.length > 0,
    abstainReasons: reasons,
    quality,
    home: null,
    away: null,
    headToHead: [],
    ...extra,
  });

  if (input.modelEnabled === false) return base(emptyQuality(input.unavailable), ["MODEL_DISABLED"]);

  const upcoming = (input.status === "scheduled" || input.status === "tbd") && kickoff.getTime() > now.getTime();
  if (!upcoming) return base(emptyQuality(input.unavailable), ["MATCH_NOT_UPCOMING"]);

  const model = fitLeagueModel(history, asOf, config.strength);
  const table = computeTable(history);
  const home = summariseTeam(input.homeTeamId, history, model, table);
  const away = summariseTeam(input.awayTeamId, history, model, table);
  const h2h = headToHead(history, input.homeTeamId, input.awayTeamId);
  const quality = assessQuality(model, input, kickoff, config);
  const context = { home, away, headToHead: h2h };

  const reasons: AbstainReason[] = [];
  if (model.matches < c.minLeagueMatches) reasons.push("INSUFFICIENT_LEAGUE_HISTORY");
  if (quality.homeMatches < c.minTeamMatches || quality.awayMatches < c.minTeamMatches)
    reasons.push("INSUFFICIENT_TEAM_HISTORY");
  if (reasons.length > 0) return base(quality, reasons, context);

  const xg = expectedGoals(model, input.homeTeamId, input.awayTeamId)!;
  const marketInputs: MarketInputs = {
    lambdaHome: xg.home,
    lambdaAway: xg.away,
    rho: model.rho,
    firstHalfShare: model.firstHalfSample >= c.minLeagueMatches ? model.firstHalfShare : null,
    homeName: input.homeName,
    awayName: input.awayName,
  };
  const markets = computeMarkets(marketInputs);
  const stability = stabilityByKey(model, input, marketInputs, markets);

  if (quality.inputAgeDays != null && quality.inputAgeDays > c.maxInputAgeDays) reasons.push("STALE_INPUTS");

  const scored: Recommendation[] = [];
  let rejectedForCalibration = 0;
  for (const mp of markets) {
    if (!isRecommendable(mp)) continue;
    const cal = applyCalibration(mp.probability, mp.market, input.calibration, config.calibrationMinSample, config.calibrationPrior);
    if (cal.overconfident) {
      rejectedForCalibration++;
      continue;
    }
    const stab = stability.get(selectionKey(mp)) ?? 0;
    const calibrationFactor = cal.calibrated ? 1 : 0.9; // no track record yet → less trust
    const modelConfidence = round4((0.5 * quality.score + 0.5 * stab) * calibrationFactor);
    scored.push({
      ...mp,
      calibratedProbability: round4(cal.probability),
      calibrated: cal.calibrated,
      modelConfidence,
      rankingScore: round4(cal.probability * modelConfidence),
      reasoning: [],
    });
  }

  const eligible = scored
    .filter((r) => r.calibratedProbability >= c.minProbability && r.modelConfidence >= c.minConfidence)
    .sort((a, b) => b.rankingScore - a.rankingScore);

  if (eligible.length === 0) {
    const anyProb = scored.some((r) => r.calibratedProbability >= c.minProbability);
    if (rejectedForCalibration > 0 && !anyProb) reasons.push("POOR_HISTORICAL_CALIBRATION");
    else if (anyProb) reasons.push("LOW_MODEL_CONFIDENCE");
    else reasons.push("NO_SELECTION_MEETS_THRESHOLD");
  }

  const withReasoning = eligible.map((r) => ({ ...r, reasoning: explain(r, xg, home, away, quality, input) }));
  const stale = reasons.includes("STALE_INPUTS");

  return base(quality, [...new Set(reasons)], {
    ...context,
    expectedGoals: { home: round4(xg.home), away: round4(xg.away) },
    markets: markets.map((m) => ({ ...m, probability: round4(m.probability) })),
    recommendation: stale ? null : (withReasoning[0] ?? null),
    alternatives: stale ? [] : withReasoning.slice(1, 6),
  });
}

/**
 * How much each market probability moves when the expected-goal rates are
 * perturbed by roughly one standard error. Large swings mean the estimate rests
 * on thin evidence. Returns 1 (stable) .. 0 (swings >= 15 percentage points).
 */
function stabilityByKey(
  model: LeagueModel,
  input: PredictInput,
  base: MarketInputs,
  markets: MarketProbability[],
): Map<string, number> {
  const rh = model.ratings.get(input.homeTeamId)!;
  const ra = model.ratings.get(input.awayTeamId)!;
  const perTeamGoalRate = (model.homeRate + model.awayRate) / 2;
  const relSe = Math.sqrt(1 / Math.max(rh.weight * perTeamGoalRate, 1e-6) + 1 / Math.max(ra.weight * perTeamGoalRate, 1e-6));
  const variants = [
    { ...base, lambdaHome: base.lambdaHome * (1 + relSe) },
    { ...base, lambdaHome: base.lambdaHome / (1 + relSe) },
    { ...base, lambdaAway: base.lambdaAway * (1 + relSe) },
    { ...base, lambdaAway: base.lambdaAway / (1 + relSe) },
  ].map((v) => new Map(computeMarkets(v).map((m) => [selectionKey(m), m.probability])));

  const out = new Map<string, number>();
  for (const m of markets) {
    const k = selectionKey(m);
    const swing = Math.max(...variants.map((v) => Math.abs((v.get(k) ?? m.probability) - m.probability)));
    out.set(k, Math.max(0, 1 - swing / 0.15));
  }
  return out;
}

function assessQuality(model: LeagueModel, input: PredictInput, kickoff: Date, config: EngineConfig): DataQuality {
  const c = config.criteria;
  const homeMatches = model.ratings.get(input.homeTeamId)?.matches ?? 0;
  const awayMatches = model.ratings.get(input.awayTeamId)?.matches ?? 0;
  const inputAgeDays =
    model.latestMatchAt != null ? (kickoff.getTime() - new Date(model.latestMatchAt).getTime()) / DAY_MS : null;

  const teamComponent = Math.min(1, Math.min(homeMatches, awayMatches) / 15);
  const leagueComponent = Math.min(1, model.matches / 150);
  const freshness =
    inputAgeDays == null ? 0 : Math.max(0, Math.min(1, 1 - Math.max(0, inputAgeDays - 10) / Math.max(1, c.maxInputAgeDays - 10)));
  const score = round4(0.45 * teamComponent + 0.3 * leagueComponent + 0.25 * freshness);

  const notes: string[] = [];
  if (Math.min(homeMatches, awayMatches) < 10) notes.push("Fewer than 10 results available for at least one team.");
  if (model.matches < 100) notes.push(`Only ${model.matches} league results available to fit the model.`);
  if (inputAgeDays != null && inputAgeDays > 14) notes.push(`Most recent result is ${Math.round(inputAgeDays)} days before kickoff.`);
  if (model.rho === 0) notes.push("Low-score (Dixon-Coles) adjustment not applied: sample too small.");

  return {
    grade: gradeFor(score),
    score,
    homeMatches,
    awayMatches,
    leagueMatches: model.matches,
    latestInputAt: model.latestMatchAt,
    inputAgeDays: inputAgeDays == null ? null : Math.round(inputAgeDays * 10) / 10,
    notes,
    unavailable: input.unavailable ?? [],
  };
}

function emptyQuality(unavailable: string[] = []): DataQuality {
  return {
    grade: "D",
    score: 0,
    homeMatches: 0,
    awayMatches: 0,
    leagueMatches: 0,
    latestInputAt: null,
    inputAgeDays: null,
    notes: [],
    unavailable,
  };
}

export function gradeFor(score: number): DataQualityGrade {
  return score >= 0.85 ? "A" : score >= 0.7 ? "B" : score >= 0.5 ? "C" : "D";
}

function explain(
  r: Recommendation,
  xg: { home: number; away: number },
  home: ReturnType<typeof summariseTeam>,
  away: ReturnType<typeof summariseTeam>,
  quality: DataQuality,
  input: PredictInput,
): string[] {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const avg = (gf: number, n: number) => (n > 0 ? (gf / n).toFixed(2) : "–");
  const lines = [
    `Model expected goals: ${input.homeName} ${xg.home.toFixed(2)} – ${xg.away.toFixed(2)} ${input.awayName}.`,
    `${input.homeName} at home: ${avg(home.home.goalsFor, home.home.played)} scored / ${avg(home.home.goalsAgainst, home.home.played)} conceded per game (${home.home.played} games).`,
    `${input.awayName} away: ${avg(away.away.goalsFor, away.away.played)} scored / ${avg(away.away.goalsAgainst, away.away.played)} conceded per game (${away.away.played} games).`,
    `Estimated probability ${pct(r.calibratedProbability)}${r.calibrated ? " after historical calibration" : " (no calibration history yet)"}; model confidence ${pct(r.modelConfidence)}; data quality ${quality.grade}.`,
  ];
  if (home.form.length > 0 || away.form.length > 0)
    lines.splice(3, 0, `Recent form — ${input.homeName}: ${home.form.join("") || "n/a"}, ${input.awayName}: ${away.form.join("") || "n/a"}.`);
  return lines;
}

function round4(x: number) {
  return Math.round(x * 10_000) / 10_000;
}
