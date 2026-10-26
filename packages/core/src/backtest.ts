import { bucketFor } from "./engine/calibration";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "./engine/config";
import { predictFixture } from "./engine/predict";
import { groupPerformance, summarisePerformance, type PerformanceRow, type PerformanceSummary } from "./metrics";
import { settleSelection } from "./settlement";
import type { HistoricalMatch, MarketId } from "./types";

export interface BacktestOptions {
  config?: EngineConfig;
  /** Matches at the start of the data used only as model input, never evaluated. */
  warmupMatches?: number;
  /** ISO date: matches on/after this date form the held-out test period. */
  testFrom?: string;
}

export interface BacktestPick extends PerformanceRow {
  fixtureId: string;
  date: string;
  market: MarketId;
  label: string;
  period: "validation" | "test";
}

export interface BacktestReport {
  evaluatedMatches: number;
  abstentions: number;
  abstentionReasons: Record<string, number>;
  validation: PerformanceSummary;
  test: PerformanceSummary | null;
  byMarket: { key: string; summary: PerformanceSummary }[];
  byProbability: { key: string; summary: PerformanceSummary }[];
  /** Multiclass Brier score for the 1X2 market over every match the model priced. */
  outcome1x2Brier: number | null;
  picks: BacktestPick[];
}

/**
 * Walk-forward backtest. For each match, the model is fitted on matches that
 * kicked off strictly earlier — the same rule the live engine uses — so there
 * is no leakage of the result being predicted or of any later result.
 */
export function runBacktest(matches: HistoricalMatch[], opts: BacktestOptions = {}): BacktestReport {
  const config = opts.config ?? DEFAULT_ENGINE_CONFIG;
  const warmup = opts.warmupMatches ?? 80;
  const sorted = [...matches].sort((a, b) => (a.date < b.date ? -1 : 1));
  const picks: BacktestPick[] = [];
  const reasons: Record<string, number> = {};
  let abstentions = 0;
  let brierSum = 0;
  let brierN = 0;

  for (let i = warmup; i < sorted.length; i++) {
    const m = sorted[i]!;
    const kickoff = new Date(m.date);
    const pred = predictFixture({
      fixtureId: m.fixtureId,
      kickoffAt: m.date,
      status: "scheduled",
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeName: m.homeTeamId,
      awayName: m.awayTeamId,
      history: sorted.slice(0, i),
      config,
      now: new Date(kickoff.getTime() - 3_600_000),
    });

    const p = (o: string) => pred.markets.find((x) => x.market === "1X2" && x.outcome === o)?.probability;
    const ph = p("HOME");
    const pd = p("DRAW");
    const pa = p("AWAY");
    if (ph != null && pd != null && pa != null) {
      const [yh, yd, ya] = m.homeGoals > m.awayGoals ? [1, 0, 0] : m.homeGoals === m.awayGoals ? [0, 1, 0] : [0, 0, 1];
      brierSum += (ph - yh) ** 2 + (pd - yd) ** 2 + (pa - ya) ** 2;
      brierN++;
    }

    if (!pred.recommendation) {
      abstentions++;
      for (const r of pred.abstainReasons) reasons[r] = (reasons[r] ?? 0) + 1;
      continue;
    }
    const rec = pred.recommendation;
    const decision = settleSelection(rec, {
      status: "finished",
      kickoffAt: m.date,
      regularTime: { home: m.homeGoals, away: m.awayGoals },
      halfTime: { home: m.htHomeGoals, away: m.htAwayGoals },
    });
    picks.push({
      fixtureId: m.fixtureId,
      date: m.date,
      market: rec.market,
      label: rec.label,
      probability: rec.calibratedProbability,
      status: decision.outcome,
      period: opts.testFrom && m.date >= opts.testFrom ? "test" : "validation",
    });
  }

  const test = picks.filter((p) => p.period === "test");
  return {
    evaluatedMatches: Math.max(0, sorted.length - warmup),
    abstentions,
    abstentionReasons: reasons,
    validation: summarisePerformance(picks.filter((p) => p.period === "validation")),
    test: opts.testFrom ? summarisePerformance(test) : null,
    byMarket: groupPerformance(picks, (p) => p.market),
    byProbability: groupPerformance(picks, (p) => {
      const [lo, hi] = bucketFor(p.probability);
      return `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`;
    }),
    outcome1x2Brier: brierN > 0 ? brierSum / brierN : null,
    picks,
  };
}
