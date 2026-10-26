import { describe, expect, it } from "vitest";
import { brierScore, groupPerformance, logLoss, summarisePerformance, wilsonInterval } from "../src";

describe("metrics", () => {
  it("brier and log loss behave at the extremes", () => {
    expect(brierScore([])).toBeNull();
    expect(brierScore([{ probability: 1, won: true }])).toBe(0);
    expect(brierScore([{ probability: 0.8, won: false }])).toBeCloseTo(0.64);
    expect(logLoss([{ probability: 0.5, won: true }])).toBeCloseTo(Math.LN2);
  });

  it("wilson interval contains the point estimate and narrows with sample size", () => {
    const [lo1, hi1] = wilsonInterval(9, 10);
    const [lo2, hi2] = wilsonInterval(900, 1000);
    expect(lo1).toBeLessThan(0.9);
    expect(hi1).toBeGreaterThan(0.9);
    expect(hi2 - lo2).toBeLessThan(hi1 - lo1);
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });

  it("excludes pending and void predictions from the win rate", () => {
    const s = summarisePerformance([
      { probability: 0.8, status: "won" },
      { probability: 0.8, status: "won" },
      { probability: 0.8, status: "lost" },
      { probability: 0.8, status: "void" },
      { probability: 0.8, status: "pending" },
    ]);
    expect(s).toMatchObject({ total: 5, settled: 3, won: 2, lost: 1, void: 1, pending: 1 });
    expect(s.winRate).toBeCloseTo(2 / 3);
  });

  it("returns null win rate with no settled predictions", () => {
    expect(summarisePerformance([{ probability: 0.9, status: "pending" }]).winRate).toBeNull();
  });

  it("groups by key", () => {
    const g = groupPerformance(
      [
        { probability: 0.7, status: "won" as const, m: "BTTS" },
        { probability: 0.7, status: "lost" as const, m: "1X2" },
        { probability: 0.7, status: "won" as const, m: "BTTS" },
      ],
      (r) => r.m,
    );
    expect(g.find((x) => x.key === "BTTS")!.summary.winRate).toBe(1);
  });
});
