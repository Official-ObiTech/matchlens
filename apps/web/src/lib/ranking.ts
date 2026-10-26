import type { DataQualityGrade, FixtureListItem, MarketId, PickSummary, PredictionRunDto, PublishedPredictionDto } from "@fpp/core";

export interface RankingCriteria {
  minProbability: number;
  market?: MarketId | null;
  competition?: string | null;
  minQuality?: DataQualityGrade | null;
  kickoffFrom?: string | null;
  kickoffTo?: string | null;
}

export interface RankCandidate {
  fixture: FixtureListItem;
  run: PredictionRunDto | null;
  published: PublishedPredictionDto | null;
}

const GRADE_ORDER: Record<DataQualityGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

/**
 * Pick at most one selection per match that satisfies every filter, then rank
 * by the engine's ranking score (calibrated probability × model confidence).
 * Returns however many qualify — never pads the list.
 */
export function rankStrongest(cands: RankCandidate[], c: RankingCriteria): (FixtureListItem & { pick: PickSummary; rankingScore: number })[] {
  const out: (FixtureListItem & { pick: PickSummary; rankingScore: number })[] = [];
  for (const { fixture, run, published } of cands) {
    if (fixture.status !== "scheduled" && fixture.status !== "tbd") continue;
    if (c.competition && fixture.competition.id !== c.competition) continue;
    if (c.kickoffFrom && fixture.kickoffAt < c.kickoffFrom) continue;
    if (c.kickoffTo && fixture.kickoffAt > c.kickoffTo) continue;
    if (!run || !run.recommendation) continue;
    const grade = run.quality.grade;
    if (c.minQuality && GRADE_ORDER[grade] < GRADE_ORDER[c.minQuality]) continue;

    const options = [run.recommendation, ...run.alternatives];
    // Prefer the published (frozen) selection when it satisfies the filters.
    const publishedOpt =
      published && published.modelVersion === run.modelVersion
        ? options.find((o) => o.market === published.market && o.outcome === published.outcome && (o.line ?? null) === (published.line ?? null))
        : undefined;
    const ordered = publishedOpt ? [publishedOpt, ...options.filter((o) => o !== publishedOpt)] : options;
    const chosen = ordered.find((o) => o.calibratedProbability >= c.minProbability && (!c.market || o.market === c.market));
    if (!chosen) continue;
    out.push({
      ...fixture,
      pick: {
        market: chosen.market,
        outcome: chosen.outcome,
        ...(chosen.line != null ? { line: chosen.line } : {}),
        label: chosen.label,
        probability: chosen.calibratedProbability,
        modelConfidence: chosen.modelConfidence,
        dataQuality: grade,
        calibrated: chosen.calibrated,
      },
      rankingScore: chosen.rankingScore,
    });
  }
  return out.sort((a, b) => b.rankingScore - a.rankingScore);
}

/** UTC range for a calendar date in the user's timezone (offset from Date#getTimezoneOffset). */
export function dayRange(date: string, tzOffsetMinutes = 0): { from: string; to: string } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const start = Date.UTC(y, m - 1, d) + tzOffsetMinutes * 60_000;
  return { from: new Date(start).toISOString(), to: new Date(start + 86_400_000).toISOString() };
}

export function localDate(now: Date, tzOffsetMinutes = 0): string {
  return new Date(now.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}
