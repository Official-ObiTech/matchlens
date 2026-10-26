import { describe, expect, it } from "vitest";
import { addOutcome, emptySlip, independentCombinedProbability, slipReducer, type SlipSelection } from "../src";

const sel = (fixtureId: string, over: Partial<SlipSelection> = {}): SlipSelection => ({
  fixtureId,
  homeName: "Home",
  awayName: "Away",
  competition: "League",
  kickoffAt: "2026-11-01T15:00:00Z",
  market: "TOTAL_GOALS",
  outcome: "OVER",
  line: 1.5,
  label: "Over 1.5 goals",
  probability: 0.8,
  dataQuality: "B",
  modelVersion: "test",
  addedAt: "2026-10-26T10:00:00Z",
  ...over,
});

describe("slip reducer", () => {
  it("a single game is a complete slip", () => {
    const s = slipReducer(emptySlip(), { type: "add", selection: sel("api_football:1") });
    expect(s.selections).toHaveLength(1);
    expect(independentCombinedProbability(s.selections)).toBeNull();
  });

  it("adds further games and removes them back to one", () => {
    let s = slipReducer(emptySlip(), { type: "add", selection: sel("api_football:1") });
    s = slipReducer(s, { type: "add", selection: sel("api_football:2") });
    s = slipReducer(s, { type: "add", selection: sel("api_football:3") });
    expect(s.selections.map((x) => x.fixtureId)).toEqual(["api_football:1", "api_football:2", "api_football:3"]);
    s = slipReducer(s, { type: "remove", fixtureId: "api_football:2" });
    s = slipReducer(s, { type: "remove", fixtureId: "api_football:3" });
    expect(s.selections).toHaveLength(1);
  });

  it("changing the market for a match replaces it in place, never duplicates", () => {
    let s = slipReducer(emptySlip(), { type: "add", selection: sel("api_football:1") });
    s = slipReducer(s, { type: "add", selection: sel("api_football:2") });
    const changed = sel("api_football:1", { market: "BTTS", outcome: "YES", line: undefined, label: "BTTS" });
    expect(addOutcome(s, changed)).toBe("replaced");
    s = slipReducer(s, { type: "add", selection: changed });
    expect(s.selections).toHaveLength(2);
    expect(s.selections[0]!.market).toBe("BTTS");
  });

  it("ignores exact duplicates", () => {
    const s1 = slipReducer(emptySlip(), { type: "add", selection: sel("api_football:1") });
    expect(addOutcome(s1, sel("api_football:1"))).toBe("unchanged");
    expect(slipReducer(s1, { type: "add", selection: sel("api_football:1") })).toBe(s1);
  });

  it("enforces the maximum size", () => {
    let s = { ...emptySlip(), maxSelections: 2 };
    s = slipReducer(s, { type: "add", selection: sel("a:1") });
    s = slipReducer(s, { type: "add", selection: sel("a:2") });
    expect(addOutcome(s, sel("a:3"))).toBe("full");
    expect(slipReducer(s, { type: "add", selection: sel("a:3") }).selections).toHaveLength(2);
  });

  it("clears and restores (deduplicating persisted data)", () => {
    let s = slipReducer(emptySlip(), { type: "add", selection: sel("a:1") });
    s = slipReducer(s, { type: "clear" });
    expect(s.selections).toHaveLength(0);
    s = slipReducer(s, { type: "restore", selections: [sel("a:1"), sel("a:1"), sel("a:2")] });
    expect(s.selections.map((x) => x.fixtureId)).toEqual(["a:1", "a:2"]);
  });

  it("combined probability is the independence product and decreases with each selection", () => {
    const two = independentCombinedProbability([{ probability: 0.8 }, { probability: 0.8 }])!;
    const three = independentCombinedProbability([{ probability: 0.8 }, { probability: 0.8 }, { probability: 0.8 }])!;
    expect(two).toBeCloseTo(0.64);
    expect(three).toBeLessThan(two);
  });
});
