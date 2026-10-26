import type { FixtureListItem, PredictionRunDto, Recommendation } from "@fpp/core";
import { describe, expect, it } from "vitest";
import { dayRange, localDate, rankStrongest, type RankCandidate } from "../src/lib/ranking";

const rec = (over: Partial<Recommendation>): Recommendation => ({
  market: "TOTAL_GOALS", outcome: "OVER", line: 1.5, label: "Over 1.5 goals", probability: 0.8,
  calibratedProbability: 0.8, calibrated: false, modelConfidence: 0.8, rankingScore: 0.64, reasoning: [], ...over,
});

function cand(id: string, r: Recommendation | null, alts: Recommendation[] = [], over: Partial<FixtureListItem> = {}, grade: "A" | "B" | "C" | "D" = "B"): RankCandidate {
  const fixture = {
    id, competition: { id: "39", name: "PL", country: "England", logoUrl: null, season: 2026 },
    home: { id: "1", name: "H", logoUrl: null }, away: { id: "2", name: "A", logoUrl: null },
    kickoffAt: "2026-10-26T15:00:00.000Z", status: "scheduled", statusDetail: null, score: null,
    predictionState: r ? "recommended" : "abstained", pick: null, modelVersion: "m", ...over,
  } as FixtureListItem;
  const run = { modelVersion: "m", recommendation: r, alternatives: alts, quality: { grade } } as unknown as PredictionRunDto;
  return { fixture, run, published: null };
}

describe("rankStrongest", () => {
  it("ranks by score and never pads the list", () => {
    const out = rankStrongest(
      [cand("a", rec({ rankingScore: 0.5, calibratedProbability: 0.76 })), cand("b", rec({ rankingScore: 0.7, calibratedProbability: 0.86 })), cand("c", null)],
      { minProbability: 0.75 },
    );
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("applies the probability threshold as a filter", () => {
    const out = rankStrongest([cand("a", rec({ calibratedProbability: 0.78 })), cand("b", rec({ calibratedProbability: 0.91 }))], { minProbability: 0.9 });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });

  it("uses an alternative when a market filter excludes the main recommendation", () => {
    const out = rankStrongest([cand("a", rec({}), [rec({ market: "BTTS", outcome: "YES", line: undefined, label: "BTTS", calibratedProbability: 0.77 })])], { minProbability: 0.75, market: "BTTS" });
    expect(out[0]!.pick.market).toBe("BTTS");
  });

  it("filters by data quality and match status", () => {
    expect(rankStrongest([cand("a", rec({}), [], {}, "C")], { minProbability: 0.7, minQuality: "B" })).toHaveLength(0);
    expect(rankStrongest([cand("a", rec({}), [], { status: "live" })], { minProbability: 0.7 })).toHaveLength(0);
  });
});

describe("dates", () => {
  it("maps a local calendar day to a UTC range", () => {
    expect(dayRange("2026-10-26", -120)).toEqual({ from: "2026-10-25T22:00:00.000Z", to: "2026-10-26T22:00:00.000Z" });
    expect(localDate(new Date("2026-10-25T23:30:00Z"), -120)).toBe("2026-10-26");
  });
});
