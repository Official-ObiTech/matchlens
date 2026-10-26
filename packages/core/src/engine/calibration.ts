import type { MarketId } from "../types";
import { wilsonInterval } from "../metrics";

/** Probability ranges used for calibration and reporting. */
export const PROBABILITY_BUCKETS: [number, number][] = [
  [0, 0.5],
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.75],
  [0.75, 0.8],
  [0.8, 0.85],
  [0.85, 0.9],
  [0.9, 0.95],
  [0.95, 1.0001],
];

export function bucketFor(p: number): [number, number] {
  return PROBABILITY_BUCKETS.find(([lo, hi]) => p >= lo && p < hi) ?? PROBABILITY_BUCKETS[PROBABILITY_BUCKETS.length - 1]!;
}

export interface CalibrationBucket {
  market: MarketId | "ALL";
  lo: number;
  hi: number;
  /** Settled (won + lost) predictions; voids excluded. */
  n: number;
  wins: number;
  meanPredicted: number;
}

export type CalibrationTable = CalibrationBucket[];

export interface CalibrationResult {
  probability: number;
  calibrated: boolean;
  /** True when history shows the model is clearly over-confident in this range. */
  overconfident: boolean;
  sample: number;
}

/**
 * Adjust a raw model probability using historical results in the same
 * probability range. The adjustment is the observed bias (win rate minus mean
 * predicted), shrunk toward zero by `prior` pseudo-observations. Market-specific
 * buckets are preferred; the all-market bucket is the fallback.
 */
export function applyCalibration(
  p: number,
  market: MarketId,
  table: CalibrationTable | null | undefined,
  minSample: number,
  prior: number,
): CalibrationResult {
  if (!table || table.length === 0) return { probability: p, calibrated: false, overconfident: false, sample: 0 };
  const [lo] = bucketFor(p);
  const pick = (mk: MarketId | "ALL") => table.find((b) => b.market === mk && b.lo === lo && b.n >= minSample);
  const b = pick(market) ?? pick("ALL");
  if (!b) return { probability: p, calibrated: false, overconfident: false, sample: 0 };

  const observed = b.wins / b.n;
  const bias = (b.n / (b.n + prior)) * (observed - b.meanPredicted);
  const [, upper] = wilsonInterval(b.wins, b.n);
  return {
    probability: Math.min(0.999, Math.max(0.001, p + bias)),
    calibrated: true,
    overconfident: upper < b.meanPredicted - 0.05,
    sample: b.n,
  };
}

/**
 * Build a calibration table from settled predictions. `probability` must be the
 * raw model probability recorded at publication time.
 */
export function buildCalibrationTable(
  rows: { market: MarketId; probability: number; status: "pending" | "won" | "lost" | "void" }[],
): CalibrationTable {
  const acc = new Map<string, CalibrationBucket>();
  for (const r of rows) {
    if (r.status !== "won" && r.status !== "lost") continue;
    const [lo, hi] = bucketFor(r.probability);
    for (const market of [r.market, "ALL"] as const) {
      const key = `${market}|${lo}`;
      const b = acc.get(key) ?? { market, lo, hi, n: 0, wins: 0, meanPredicted: 0 };
      b.meanPredicted = (b.meanPredicted * b.n + r.probability) / (b.n + 1);
      b.n++;
      if (r.status === "won") b.wins++;
      acc.set(key, b);
    }
  }
  return [...acc.values()];
}
