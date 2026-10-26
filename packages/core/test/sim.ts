import type { HistoricalMatch } from "../src/types";

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda: number, r: () => number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

export interface SimTeam {
  id: string;
  attack: number;
  defence: number;
}

/**
 * Simulate double round-robin seasons from a known Poisson model. Test-only:
 * lets us check that the fitted model recovers known parameters and that
 * its probabilities are calibrated when the model is correctly specified.
 */
export function simulateLeague(opts: { teams?: number; seasons?: number; seed?: number; homeRate?: number; awayRate?: number } = {}) {
  const r = rng(opts.seed ?? 42);
  const n = opts.teams ?? 20;
  const teams: SimTeam[] = Array.from({ length: n }, (_, i) => ({
    id: `T${i + 1}`,
    attack: Math.exp((r() - 0.5) * 0.9),
    defence: Math.exp((r() - 0.5) * 0.9),
  }));
  const homeRate = opts.homeRate ?? 1.5;
  const awayRate = opts.awayRate ?? 1.15;
  const matches: HistoricalMatch[] = [];
  let day = Date.UTC(2023, 7, 1);
  let id = 1;
  for (let s = 0; s < (opts.seasons ?? 1); s++) {
    const pairs: [SimTeam, SimTeam][] = [];
    for (const h of teams) for (const a of teams) if (h !== a) pairs.push([h, a]);
    // shuffle
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
    }
    pairs.forEach(([h, a], i) => {
      if (i % (n / 2) === 0) day += 3.5 * 86_400_000;
      const lh = homeRate * h.attack * a.defence;
      const la = awayRate * a.attack * h.defence;
      const hg = samplePoisson(lh, r);
      const ag = samplePoisson(la, r);
      const hth = Math.min(hg, samplePoisson(lh * 0.45, r));
      const hta = Math.min(ag, samplePoisson(la * 0.45, r));
      matches.push({
        fixtureId: `sim:${id++}`,
        date: new Date(day + (i % (n / 2)) * 3_600_000).toISOString(),
        homeTeamId: h.id,
        awayTeamId: a.id,
        homeGoals: hg,
        awayGoals: ag,
        htHomeGoals: hth,
        htAwayGoals: hta,
      });
    });
  }
  return { teams, matches };
}
