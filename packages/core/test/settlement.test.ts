import { describe, expect, it } from "vitest";
import { settleSelection, type SettlementInput } from "../src";

const ft = (home: number, away: number, ht: [number, number] | null = null): SettlementInput => ({
  status: "finished",
  kickoffAt: "2026-10-01T15:00:00Z",
  regularTime: { home, away },
  halfTime: ht ? { home: ht[0], away: ht[1] } : { home: null, away: null },
});

describe("settleSelection", () => {
  it("settles 1X2 / double chance", () => {
    expect(settleSelection({ market: "1X2", outcome: "HOME" }, ft(2, 1)).outcome).toBe("won");
    expect(settleSelection({ market: "1X2", outcome: "DRAW" }, ft(2, 1)).outcome).toBe("lost");
    expect(settleSelection({ market: "1X2", outcome: "AWAY" }, ft(0, 1)).outcome).toBe("won");
    expect(settleSelection({ market: "DOUBLE_CHANCE", outcome: "1X" }, ft(1, 1)).outcome).toBe("won");
    expect(settleSelection({ market: "DOUBLE_CHANCE", outcome: "12" }, ft(1, 1)).outcome).toBe("lost");
    expect(settleSelection({ market: "DOUBLE_CHANCE", outcome: "X2" }, ft(2, 0)).outcome).toBe("lost");
  });

  it("voids draw no bet on a draw", () => {
    expect(settleSelection({ market: "DRAW_NO_BET", outcome: "HOME" }, ft(1, 1)).outcome).toBe("void");
    expect(settleSelection({ market: "DRAW_NO_BET", outcome: "HOME" }, ft(2, 1)).outcome).toBe("won");
  });

  it("settles goal lines, including pushes on whole lines", () => {
    expect(settleSelection({ market: "TOTAL_GOALS", outcome: "OVER", line: 2.5 }, ft(2, 1)).outcome).toBe("won");
    expect(settleSelection({ market: "TOTAL_GOALS", outcome: "UNDER", line: 2.5 }, ft(2, 1)).outcome).toBe("lost");
    expect(settleSelection({ market: "TOTAL_GOALS", outcome: "OVER", line: 3 }, ft(2, 1)).outcome).toBe("void");
    expect(settleSelection({ market: "HOME_TEAM_GOALS", outcome: "OVER", line: 1.5 }, ft(2, 0)).outcome).toBe("won");
    expect(settleSelection({ market: "AWAY_TEAM_GOALS", outcome: "UNDER", line: 0.5 }, ft(2, 0)).outcome).toBe("won");
  });

  it("settles BTTS, correct score and first half", () => {
    expect(settleSelection({ market: "BTTS", outcome: "YES" }, ft(1, 1)).outcome).toBe("won");
    expect(settleSelection({ market: "BTTS", outcome: "NO" }, ft(1, 1)).outcome).toBe("lost");
    expect(settleSelection({ market: "CORRECT_SCORE", outcome: "2-1" }, ft(2, 1)).outcome).toBe("won");
    expect(settleSelection({ market: "FIRST_HALF_GOALS", outcome: "OVER", line: 0.5 }, ft(2, 1, [0, 0])).outcome).toBe("lost");
    expect(settleSelection({ market: "FIRST_HALF_GOALS", outcome: "OVER", line: 0.5 }, ft(2, 1)).outcome).toBe("pending");
  });

  it("keeps unfinished matches pending and never guesses", () => {
    for (const status of ["scheduled", "tbd", "live", "unknown"] as const)
      expect(settleSelection({ market: "1X2", outcome: "HOME" }, { ...ft(0, 0), status }).outcome).toBe("pending");
    expect(settleSelection({ market: "1X2", outcome: "HOME" }, { ...ft(0, 0), regularTime: { home: null, away: null } }).outcome).toBe("pending");
  });

  it("voids cancelled/abandoned/awarded matches", () => {
    for (const status of ["cancelled", "abandoned", "awarded"] as const)
      expect(settleSelection({ market: "1X2", outcome: "HOME" }, { ...ft(3, 0), status }).outcome).toBe("void");
  });

  it("voids postponed matches only after the grace window", () => {
    const pst: SettlementInput = { ...ft(0, 0), status: "postponed" };
    expect(settleSelection({ market: "BTTS", outcome: "YES" }, pst, new Date("2026-10-02T15:00:00Z")).outcome).toBe("pending");
    expect(settleSelection({ market: "BTTS", outcome: "YES" }, pst, new Date("2026-10-05T15:00:00Z")).outcome).toBe("void");
  });

  it("rejects malformed selections", () => {
    expect(() => settleSelection({ market: "TOTAL_GOALS", outcome: "OVER" }, ft(1, 0))).toThrow();
    expect(() => settleSelection({ market: "1X2", outcome: "NOPE" }, ft(1, 0))).toThrow();
  });
});

import { rollUpSlipStatus } from "../src";

describe("rollUpSlipStatus", () => {
  it("rolls selections up into a slip result", () => {
    expect(rollUpSlipStatus(["won"])).toBe("won");
    expect(rollUpSlipStatus(["won", "void"])).toBe("won");
    expect(rollUpSlipStatus(["won", "pending"])).toBe("pending");
    expect(rollUpSlipStatus(["lost", "pending"])).toBe("lost");
    expect(rollUpSlipStatus(["void", "void"])).toBe("void");
  });
});
