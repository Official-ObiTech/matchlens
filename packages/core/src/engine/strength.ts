import type { HistoricalMatch } from "../types";
import { dixonColesTau, poissonPmf, rhoBounds } from "./poisson";

export interface StrengthModelParams {
  /** Results older than this many days count half as much. */
  halfLifeDays: number;
  /**
   * Prior strength (in "pseudo-matches") pulling every team toward league average.
   * Larger = more conservative ratings for teams with few matches.
   */
  shrinkage: number;
  iterations: number;
  /** Only estimate rho when at least this many matches are available. */
  minMatchesForRho: number;
}

export const DEFAULT_STRENGTH_PARAMS: StrengthModelParams = {
  halfLifeDays: 180,
  shrinkage: 4,
  iterations: 60,
  minMatchesForRho: 150,
};

export interface TeamRating {
  attack: number;
  defence: number; // > 1 concedes more than average
  /** Weighted number of matches behind the estimate. */
  weight: number;
  matches: number;
}

export interface LeagueModel {
  /** Base goal rate for a home side of average attack against an average defence. */
  homeRate: number;
  awayRate: number;
  rho: number;
  ratings: Map<string, TeamRating>;
  matches: number;
  /** Share of goals scored in the first half, if half-time scores were available. */
  firstHalfShare: number | null;
  firstHalfSample: number;
  latestMatchAt: string | null;
}

const DAY_MS = 86_400_000;

/**
 * Fit a Maher-style Poisson rating model:
 *   E[home goals] = homeRate * attack[home] * defence[away]
 *   E[away goals] = awayRate * attack[away] * defence[home]
 * using exponentially time-decayed weights and a Gamma-style prior that shrinks
 * each multiplier toward 1. Only matches strictly before `asOf` are used, so the
 * model can never see the result it is trying to predict.
 */
export function fitLeagueModel(
  history: HistoricalMatch[],
  asOf: Date,
  params: StrengthModelParams = DEFAULT_STRENGTH_PARAMS,
): LeagueModel {
  const cutoff = asOf.getTime();
  const used = history.filter((m) => new Date(m.date).getTime() < cutoff);
  const lambdaDecay = Math.LN2 / params.halfLifeDays;
  const w = used.map((m) => Math.exp((-lambdaDecay * (cutoff - new Date(m.date).getTime())) / DAY_MS));

  const teams = new Set<string>();
  for (const m of used) {
    teams.add(m.homeTeamId);
    teams.add(m.awayTeamId);
  }
  const att = new Map<string, number>();
  const def = new Map<string, number>();
  for (const t of teams) {
    att.set(t, 1);
    def.set(t, 1);
  }

  let sumW = 0;
  let sumHG = 0;
  let sumAG = 0;
  used.forEach((m, i) => {
    sumW += w[i]!;
    sumHG += w[i]! * m.homeGoals;
    sumAG += w[i]! * m.awayGoals;
  });
  // Fallbacks are only used when there is no data at all; callers abstain in that case.
  let homeRate = sumW > 0 ? sumHG / sumW : 1.5;
  let awayRate = sumW > 0 ? sumAG / sumW : 1.2;
  const k = params.shrinkage;

  for (let it = 0; it < params.iterations && used.length > 0; it++) {
    const scored = new Map<string, number>();
    const scoredExp = new Map<string, number>();
    const conceded = new Map<string, number>();
    const concededExp = new Map<string, number>();
    const add = (map: Map<string, number>, key: string, v: number) => map.set(key, (map.get(key) ?? 0) + v);

    used.forEach((m, i) => {
      const wi = w[i]!;
      const aH = att.get(m.homeTeamId)!;
      const aA = att.get(m.awayTeamId)!;
      const dH = def.get(m.homeTeamId)!;
      const dA = def.get(m.awayTeamId)!;
      add(scored, m.homeTeamId, wi * m.homeGoals);
      add(scoredExp, m.homeTeamId, wi * homeRate * dA);
      add(scored, m.awayTeamId, wi * m.awayGoals);
      add(scoredExp, m.awayTeamId, wi * awayRate * dH);
      add(conceded, m.homeTeamId, wi * m.awayGoals);
      add(concededExp, m.homeTeamId, wi * awayRate * aA);
      add(conceded, m.awayTeamId, wi * m.homeGoals);
      add(concededExp, m.awayTeamId, wi * homeRate * aH);
    });

    for (const t of teams) {
      att.set(t, (scored.get(t)! + k) / (scoredExp.get(t)! + k));
      def.set(t, (conceded.get(t)! + k) / (concededExp.get(t)! + k));
    }
    // identifiability: geometric mean of attack and defence = 1
    const gAtt = Math.exp([...att.values()].reduce((s, v) => s + Math.log(v), 0) / teams.size);
    const gDef = Math.exp([...def.values()].reduce((s, v) => s + Math.log(v), 0) / teams.size);
    for (const t of teams) {
      att.set(t, att.get(t)! / gAtt);
      def.set(t, def.get(t)! / gDef);
    }

    let expH = 0;
    let expA = 0;
    used.forEach((m, i) => {
      expH += w[i]! * att.get(m.homeTeamId)! * def.get(m.awayTeamId)!;
      expA += w[i]! * att.get(m.awayTeamId)! * def.get(m.homeTeamId)!;
    });
    homeRate = sumHG / expH;
    awayRate = sumAG / expA;
  }

  const ratings = new Map<string, TeamRating>();
  for (const t of teams) {
    let weight = 0;
    let n = 0;
    used.forEach((m, i) => {
      if (m.homeTeamId === t || m.awayTeamId === t) {
        weight += w[i]!;
        n++;
      }
    });
    ratings.set(t, { attack: att.get(t)!, defence: def.get(t)!, weight, matches: n });
  }

  const rho =
    used.length >= params.minMatchesForRho ? estimateRho(used, w, homeRate, awayRate, att, def) : 0;

  let htGoals = 0;
  let ftGoals = 0;
  let htSample = 0;
  for (const m of used) {
    if (m.htHomeGoals == null || m.htAwayGoals == null) continue;
    htGoals += m.htHomeGoals + m.htAwayGoals;
    ftGoals += m.homeGoals + m.awayGoals;
    htSample++;
  }

  const latest = used.reduce<string | null>((acc, m) => (acc == null || m.date > acc ? m.date : acc), null);

  return {
    homeRate,
    awayRate,
    rho,
    ratings,
    matches: used.length,
    firstHalfShare: htSample > 0 && ftGoals > 0 ? htGoals / ftGoals : null,
    firstHalfSample: htSample,
    latestMatchAt: latest,
  };
}

/** One-dimensional grid search for the Dixon-Coles rho maximising weighted likelihood. */
function estimateRho(
  used: HistoricalMatch[],
  w: number[],
  homeRate: number,
  awayRate: number,
  att: Map<string, number>,
  def: Map<string, number>,
): number {
  let best = 0;
  let bestLL = -Infinity;
  for (let r = -0.2; r <= 0.1001; r += 0.01) {
    let ll = 0;
    let valid = true;
    for (let i = 0; i < used.length; i++) {
      const m = used[i]!;
      const lh = homeRate * att.get(m.homeTeamId)! * def.get(m.awayTeamId)!;
      const la = awayRate * att.get(m.awayTeamId)! * def.get(m.homeTeamId)!;
      const [lo, hi] = rhoBounds(lh, la);
      if (r <= lo || r >= hi) {
        valid = false;
        break;
      }
      const tau = dixonColesTau(m.homeGoals, m.awayGoals, lh, la, r);
      ll += w[i]! * (Math.log(tau) + Math.log(poissonPmf(m.homeGoals, lh)) + Math.log(poissonPmf(m.awayGoals, la)));
    }
    if (valid && ll > bestLL) {
      bestLL = ll;
      best = Math.round(r * 100) / 100;
    }
  }
  return best;
}

export function expectedGoals(model: LeagueModel, homeTeamId: string, awayTeamId: string) {
  const h = model.ratings.get(homeTeamId);
  const a = model.ratings.get(awayTeamId);
  if (!h || !a) return null;
  return {
    home: model.homeRate * h.attack * a.defence,
    away: model.awayRate * a.attack * h.defence,
  };
}
