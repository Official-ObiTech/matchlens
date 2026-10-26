import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENGINE_CONFIG,
  applyCalibration,
  buildCalibrationTable,
  computeMarkets,
  fitLeagueModel,
  isRecommendable,
  poissonPmf,
  predictFixture,
  runBacktest,
  scoreMatrix,
  type EngineConfig,
  type PredictInput,
} from "../src";
import { simulateLeague } from "./sim";

const sumMatrix = (m: number[][]) => m.flat().reduce((s, x) => s + x, 0);

describe("poisson", () => {
  it("pmf sums to ~1 and rejects invalid input", () => {
    let s = 0;
    for (let k = 0; k < 40; k++) s += poissonPmf(k, 2.7);
    expect(s).toBeCloseTo(1, 10);
    expect(() => poissonPmf(-1, 1)).toThrow();
    expect(() => poissonPmf(1.5, 1)).toThrow();
    expect(() => poissonPmf(1, -0.1)).toThrow();
    expect(() => poissonPmf(1, Number.NaN)).toThrow();
    expect(poissonPmf(0, 0)).toBe(1);
  });

  it("score matrix is a normalised distribution, with and without Dixon-Coles", () => {
    for (const rho of [0, -0.1, 0.05]) {
      const m = scoreMatrix(1.6, 1.1, rho);
      expect(sumMatrix(m)).toBeCloseTo(1, 10);
      for (const v of m.flat()) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("negative rho raises the probability of 0-0 and 1-1", () => {
    const base = scoreMatrix(1.3, 1.0, 0);
    const dc = scoreMatrix(1.3, 1.0, -0.1);
    expect(dc[0]![0]!).toBeGreaterThan(base[0]![0]!);
    expect(dc[1]![1]!).toBeGreaterThan(base[1]![1]!);
  });

  it("clamps extreme rho to keep probabilities valid", () => {
    const m = scoreMatrix(3, 3, -5);
    for (const v of m.flat()) expect(v).toBeGreaterThanOrEqual(0);
    expect(sumMatrix(m)).toBeCloseTo(1, 10);
  });
});

describe("markets", () => {
  const markets = computeMarkets({ lambdaHome: 1.8, lambdaAway: 0.9, rho: -0.05, firstHalfShare: 0.45, homeName: "H", awayName: "A" });
  const p = (market: string, outcome: string, line?: number) =>
    markets.find((m) => m.market === market && m.outcome === outcome && m.line === line)!.probability;

  it("1X2 is exhaustive and exclusive", () => {
    expect(p("1X2", "HOME") + p("1X2", "DRAW") + p("1X2", "AWAY")).toBeCloseTo(1, 8);
    expect(p("1X2", "HOME")).toBeGreaterThan(p("1X2", "AWAY"));
  });

  it("over/under and BTTS are complementary", () => {
    for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) expect(p("TOTAL_GOALS", "OVER", line) + p("TOTAL_GOALS", "UNDER", line)).toBeCloseTo(1, 8);
    expect(p("BTTS", "YES") + p("BTTS", "NO")).toBeCloseTo(1, 8);
  });

  it("is internally consistent", () => {
    expect(p("DOUBLE_CHANCE", "1X")).toBeCloseTo(p("1X2", "HOME") + p("1X2", "DRAW"), 8);
    expect(p("TOTAL_GOALS", "OVER", 1.5)).toBeGreaterThan(p("TOTAL_GOALS", "OVER", 2.5));
    const dnb = markets.find((m) => m.market === "DRAW_NO_BET" && m.outcome === "HOME")!;
    expect(dnb.probability + dnb.pushProbability! + p("1X2", "AWAY")).toBeCloseTo(1, 8);
    for (const m of markets) {
      expect(m.probability).toBeGreaterThanOrEqual(0);
      expect(m.probability).toBeLessThanOrEqual(1);
    }
  });

  it("omits first-half markets when the half-time share is unknown", () => {
    const ms = computeMarkets({ lambdaHome: 1.4, lambdaAway: 1.1, rho: 0, firstHalfShare: null, homeName: "H", awayName: "A" });
    expect(ms.some((m) => m.market === "FIRST_HALF_GOALS")).toBe(false);
  });

  it("never treats trivial or loosely modelled markets as recommendable", () => {
    expect(isRecommendable({ market: "TOTAL_GOALS", outcome: "OVER", line: 0.5 })).toBe(false);
    expect(isRecommendable({ market: "CORRECT_SCORE", outcome: "1-0" })).toBe(false);
    expect(isRecommendable({ market: "TOTAL_GOALS", outcome: "OVER", line: 1.5 })).toBe(true);
  });
});

describe("strength model", () => {
  const { teams, matches } = simulateLeague({ seasons: 2, seed: 7 });

  it("recovers the ordering of true attacking strength", () => {
    const model = fitLeagueModel(matches, new Date("2030-01-01"));
    const fitted = teams.map((t) => model.ratings.get(t.id)!.attack);
    const truth = teams.map((t) => t.attack);
    expect(spearman(fitted, truth)).toBeGreaterThan(0.8);
    expect(model.homeRate).toBeGreaterThan(model.awayRate);
  });

  it("ignores results at or after the as-of time (no leakage)", () => {
    const cut = new Date(matches[300]!.date);
    const a = fitLeagueModel(matches, cut);
    const b = fitLeagueModel(matches.slice(0, 300), cut);
    expect(a.matches).toBe(b.matches);
    expect(a.homeRate).toBeCloseTo(b.homeRate, 10);
  });
});

describe("predictFixture", () => {
  const { matches } = simulateLeague({ seasons: 2, seed: 11 });
  const last = matches[matches.length - 1]!;
  const kickoff = new Date(new Date(last.date).getTime() + 3 * 86_400_000).toISOString();
  const input = (over: Partial<PredictInput> = {}): PredictInput => ({
    fixtureId: "x:1",
    kickoffAt: kickoff,
    status: "scheduled",
    homeTeamId: "T1",
    awayTeamId: "T2",
    homeName: "Team 1",
    awayName: "Team 2",
    history: matches,
    now: new Date(new Date(kickoff).getTime() - 86_400_000),
    ...over,
  });

  it("produces bounded, consistent probabilities", () => {
    const r = predictFixture(input());
    expect(r.markets.length).toBeGreaterThan(10);
    const one = r.markets.filter((m) => m.market === "1X2").reduce((s, m) => s + m.probability, 0);
    expect(one).toBeCloseTo(1, 3);
    expect(r.quality.grade).toMatch(/[ABCD]/);
    expect(r.expectedGoals!.home).toBeGreaterThan(0);
  });

  it("any recommendation satisfies the configured criteria", () => {
    for (let h = 1; h <= 20; h++) {
      const r = predictFixture(input({ homeTeamId: `T${h}`, awayTeamId: `T${(h % 20) + 1}` }));
      if (!r.recommendation) {
        expect(r.abstainReasons.length).toBeGreaterThan(0);
        continue;
      }
      expect(r.recommendation.calibratedProbability).toBeGreaterThanOrEqual(DEFAULT_ENGINE_CONFIG.criteria.minProbability);
      expect(r.recommendation.modelConfidence).toBeGreaterThanOrEqual(DEFAULT_ENGINE_CONFIG.criteria.minConfidence);
      expect(isRecommendable(r.recommendation)).toBe(true);
      expect(r.recommendation.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("abstains instead of lowering the threshold", () => {
    const strict: EngineConfig = { ...DEFAULT_ENGINE_CONFIG, criteria: { ...DEFAULT_ENGINE_CONFIG.criteria, minProbability: 0.99 } };
    const r = predictFixture(input({ config: strict }));
    expect(r.recommendation).toBeNull();
    expect(r.abstainReasons).toContain("NO_SELECTION_MEETS_THRESHOLD");
    expect(r.markets.length).toBeGreaterThan(0); // probabilities still shown
  });

  it("abstains with insufficient history and shows no probabilities", () => {
    const r = predictFixture(input({ history: matches.slice(0, 30) }));
    expect(r.recommendation).toBeNull();
    expect(r.abstainReasons).toContain("INSUFFICIENT_LEAGUE_HISTORY");
    expect(r.markets).toHaveLength(0);
  });

  it("abstains for unknown teams", () => {
    const r = predictFixture(input({ homeTeamId: "PROMOTED" }));
    expect(r.abstainReasons).toContain("INSUFFICIENT_TEAM_HISTORY");
    expect(r.markets).toHaveLength(0);
  });

  it("abstains for matches that are not upcoming", () => {
    expect(predictFixture(input({ status: "live" })).abstainReasons).toEqual(["MATCH_NOT_UPCOMING"]);
    expect(predictFixture(input({ now: new Date(new Date(kickoff).getTime() + 1000) })).abstainReasons).toEqual(["MATCH_NOT_UPCOMING"]);
  });

  it("abstains on stale inputs", () => {
    const later = new Date(new Date(kickoff).getTime() + 120 * 86_400_000).toISOString();
    const r = predictFixture(input({ kickoffAt: later, now: new Date(new Date(later).getTime() - 3600_000) }));
    expect(r.abstainReasons).toContain("STALE_INPUTS");
    expect(r.recommendation).toBeNull();
  });

  it("respects the model kill-switch", () => {
    expect(predictFixture(input({ modelEnabled: false })).abstainReasons).toEqual(["MODEL_DISABLED"]);
  });

  it("does not use results from after kickoff", () => {
    const future = { ...matches[0]!, fixtureId: "future", date: new Date(new Date(kickoff).getTime() + 1000).toISOString(), homeGoals: 9 };
    const a = predictFixture(input());
    const b = predictFixture(input({ history: [...matches, future] }));
    expect(b.markets).toEqual(a.markets);
  });
});

describe("calibration", () => {
  it("leaves probabilities unchanged without enough history", () => {
    expect(applyCalibration(0.8, "BTTS", [], 50, 50)).toMatchObject({ probability: 0.8, calibrated: false });
  });

  it("pulls probabilities toward observed win rates and flags over-confidence", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ market: "TOTAL_GOALS" as const, probability: 0.82, status: (i < 120 ? "won" : "lost") as "won" | "lost" }));
    const table = buildCalibrationTable(rows);
    const r = applyCalibration(0.82, "TOTAL_GOALS", table, 50, 50);
    expect(r.calibrated).toBe(true);
    expect(r.probability).toBeLessThan(0.82);
    expect(r.overconfident).toBe(true);
  });

  it("ignores voids and pending rows", () => {
    const table = buildCalibrationTable([
      { market: "BTTS", probability: 0.7, status: "void" },
      { market: "BTTS", probability: 0.7, status: "pending" },
    ]);
    expect(table).toHaveLength(0);
  });
});

describe("backtest", () => {
  it("produces calibrated picks on correctly specified simulated data", () => {
    const { matches } = simulateLeague({ seasons: 3, seed: 3 });
    const report = runBacktest(matches, { warmupMatches: 200, testFrom: matches[900]!.date });
    expect(report.picks.length).toBeGreaterThan(50);
    const all = report.picks.filter((p) => p.status === "won" || p.status === "lost");
    const winRate = all.filter((p) => p.status === "won").length / all.length;
    const meanPred = all.reduce((s, p) => s + p.probability, 0) / all.length;
    // Within ~2.5 standard errors of the mean prediction.
    const se = Math.sqrt((meanPred * (1 - meanPred)) / all.length);
    expect(Math.abs(winRate - meanPred)).toBeLessThan(2.5 * se + 0.01);
    expect(report.outcome1x2Brier).toBeLessThan(0.667); // better than uniform guessing
    expect(report.test).not.toBeNull();
  }, 60_000);
});

function spearman(a: number[], b: number[]) {
  const rank = (x: number[]) => {
    const idx = x.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(x.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const d2 = ra.reduce((s, v, i) => s + (v - rb[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
