import type { HistoricalMatch, TeamSummary } from "../types";
import type { LeagueModel } from "./strength";

/** Compute a league table from the results the model can see. */
export function computeTable(history: HistoricalMatch[]): Map<string, number> {
  const pts = new Map<string, { pts: number; gd: number; gf: number }>();
  const get = (t: string) => pts.get(t) ?? pts.set(t, { pts: 0, gd: 0, gf: 0 }).get(t)!;
  for (const m of history) {
    const h = get(m.homeTeamId);
    const a = get(m.awayTeamId);
    h.gf += m.homeGoals;
    a.gf += m.awayGoals;
    h.gd += m.homeGoals - m.awayGoals;
    a.gd += m.awayGoals - m.homeGoals;
    if (m.homeGoals > m.awayGoals) h.pts += 3;
    else if (m.homeGoals < m.awayGoals) a.pts += 3;
    else {
      h.pts += 1;
      a.pts += 1;
    }
  }
  const order = [...pts.entries()].sort(
    ([, x], [, y]) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf,
  );
  return new Map(order.map(([team], i) => [team, i + 1]));
}

export function summariseTeam(
  teamId: string,
  history: HistoricalMatch[],
  model: LeagueModel | null,
  table: Map<string, number> | null,
  formLength = 6,
): TeamSummary {
  const games = history
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const s: TeamSummary = {
    teamId,
    played: games.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
    failedToScore: 0,
    form: [],
    home: { played: 0, goalsFor: 0, goalsAgainst: 0 },
    away: { played: 0, goalsFor: 0, goalsAgainst: 0 },
    attack: model?.ratings.get(teamId)?.attack ?? null,
    defence: model?.ratings.get(teamId)?.defence ?? null,
    position: table?.get(teamId) ?? null,
  };
  for (const g of games) {
    const isHome = g.homeTeamId === teamId;
    const gf = isHome ? g.homeGoals : g.awayGoals;
    const ga = isHome ? g.awayGoals : g.homeGoals;
    s.goalsFor += gf;
    s.goalsAgainst += ga;
    if (ga === 0) s.cleanSheets++;
    if (gf === 0) s.failedToScore++;
    const r = gf > ga ? "W" : gf < ga ? "L" : "D";
    if (r === "W") s.wins++;
    else if (r === "L") s.losses++;
    else s.draws++;
    if (s.form.length < formLength) s.form.push(r);
    const side = isHome ? s.home : s.away;
    side.played++;
    side.goalsFor += gf;
    side.goalsAgainst += ga;
  }
  return s;
}

export function headToHead(history: HistoricalMatch[], teamA: string, teamB: string, limit = 6): HistoricalMatch[] {
  return history
    .filter(
      (m) =>
        (m.homeTeamId === teamA && m.awayTeamId === teamB) || (m.homeTeamId === teamB && m.awayTeamId === teamA),
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}
