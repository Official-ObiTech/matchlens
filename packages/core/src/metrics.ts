/**
 * Evaluation metrics for settled predictions. All inputs are binary: did the
 * recommended selection win (1) or lose (0). Voids/pushes are excluded upstream.
 */

export interface ScoredPrediction {
  probability: number;
  won: boolean;
}

export function brierScore(rows: ScoredPrediction[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (r.probability - (r.won ? 1 : 0)) ** 2, 0) / rows.length;
}

export function logLoss(rows: ScoredPrediction[]): number | null {
  if (rows.length === 0) return null;
  const eps = 1e-12;
  return (
    -rows.reduce((s, r) => {
      const p = Math.min(1 - eps, Math.max(eps, r.probability));
      return s + (r.won ? Math.log(p) : Math.log(1 - p));
    }, 0) / rows.length
  );
}

/** 95% Wilson score interval for a binomial proportion. */
export function wilsonInterval(wins: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface PerformanceSummary {
  total: number;
  pending: number;
  settled: number; // won + lost
  won: number;
  lost: number;
  void: number;
  winRate: number | null;
  winRateInterval: [number, number] | null;
  meanPredicted: number | null;
  brier: number | null;
  logLoss: number | null;
}

export interface PerformanceRow {
  probability: number;
  status: "pending" | "won" | "lost" | "void";
}

export function summarisePerformance(rows: PerformanceRow[]): PerformanceSummary {
  const won = rows.filter((r) => r.status === "won").length;
  const lost = rows.filter((r) => r.status === "lost").length;
  const settledRows = rows
    .filter((r) => r.status === "won" || r.status === "lost")
    .map((r) => ({ probability: r.probability, won: r.status === "won" }));
  const settled = won + lost;
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    settled,
    won,
    lost,
    void: rows.filter((r) => r.status === "void").length,
    winRate: settled > 0 ? won / settled : null,
    winRateInterval: settled > 0 ? wilsonInterval(won, settled) : null,
    meanPredicted: settled > 0 ? settledRows.reduce((s, r) => s + r.probability, 0) / settled : null,
    brier: brierScore(settledRows),
    logLoss: logLoss(settledRows),
  };
}

/** Group rows by a key and summarise each group. */
export function groupPerformance<T extends PerformanceRow>(
  rows: T[],
  key: (r: T) => string,
): { key: string; summary: PerformanceSummary }[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .map(([k, rs]) => ({ key: k, summary: summarisePerformance(rs) }))
    .sort((a, b) => b.summary.total - a.summary.total);
}
