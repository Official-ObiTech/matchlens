/** Maximum goals per team modelled explicitly. Mass beyond this is renormalised away. */
export const MAX_GOALS = 10;

export function poissonPmf(k: number, lambda: number): number {
  if (!Number.isInteger(k) || k < 0) throw new RangeError(`k must be a non-negative integer, got ${k}`);
  if (!Number.isFinite(lambda) || lambda < 0) throw new RangeError(`lambda must be finite and >= 0, got ${lambda}`);
  if (lambda === 0) return k === 0 ? 1 : 0;
  // log-space to stay stable for larger k
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFact);
}

/**
 * Dixon & Coles (1997) low-score correction factor. rho < 0 inflates 0-0 and 1-1
 * and deflates 1-0 / 0-1, which plain independent Poisson tends to get wrong.
 */
export function dixonColesTau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

/** Bounds on rho that keep every tau factor positive for the given rates. */
export function rhoBounds(lh: number, la: number): [number, number] {
  const lower = Math.max(-1 / Math.max(lh, 1e-9), -1 / Math.max(la, 1e-9));
  const upper = Math.min(1 / Math.max(lh * la, 1e-9), 1);
  return [lower, upper];
}

/**
 * Joint probability matrix m[h][a] of the final score, normalised to sum to 1.
 */
export function scoreMatrix(lambdaHome: number, lambdaAway: number, rho = 0, maxGoals = MAX_GOALS): number[][] {
  const [lo, hi] = rhoBounds(lambdaHome, lambdaAway);
  const r = Math.min(Math.max(rho, lo + 1e-6), hi - 1e-6);
  const ph = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambdaHome));
  const pa = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambdaAway));
  const m: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = ph[h]! * pa[a]! * dixonColesTau(h, a, lambdaHome, lambdaAway, r);
      row.push(p);
      total += p;
    }
    m.push(row);
  }
  for (const row of m) for (let a = 0; a < row.length; a++) row[a] = row[a]! / total;
  return m;
}

/** Sum of matrix cells satisfying a predicate on (home goals, away goals). */
export function sumWhere(m: number[][], pred: (h: number, a: number) => boolean): number {
  let s = 0;
  for (let h = 0; h < m.length; h++) {
    const row = m[h]!;
    for (let a = 0; a < row.length; a++) if (pred(h, a)) s += row[a]!;
  }
  return s;
}
