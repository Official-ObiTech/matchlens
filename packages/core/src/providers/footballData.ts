import type { Fixture, FixtureStatus } from "../types";
import { ProviderError, httpGetJson, type FootballDataProvider, type ProviderOptions } from "./types";

/**
 * football-data.org v4 adapter.
 * Docs: https://docs.football-data.org/general/v4/index.html
 * Free tier: 12 competitions, 10 calls/minute, delayed scores, no lineups or odds.
 */

const STATUS: Record<string, FixtureStatus> = {
  SCHEDULED: "tbd",
  TIMED: "scheduled",
  IN_PLAY: "live",
  PAUSED: "live",
  LIVE: "live",
  EXTRA_TIME: "live",
  PENALTY_SHOOTOUT: "live",
  FINISHED: "finished",
  SUSPENDED: "suspended",
  POSTPONED: "postponed",
  CANCELLED: "cancelled",
  AWARDED: "awarded",
};

interface FdScore {
  home: number | null;
  away: number | null;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  venue?: string | null;
  competition: { id: number; name: string; emblem?: string | null };
  area?: { name?: string | null };
  season?: { startDate?: string | null };
  homeTeam: { id: number | null; name: string | null; shortName?: string | null; crest?: string | null };
  awayTeam: { id: number | null; name: string | null; shortName?: string | null; crest?: string | null };
  score: {
    duration?: string;
    fullTime: FdScore;
    halfTime: FdScore;
    regularTime?: FdScore;
    extraTime?: FdScore;
  };
}

export function mapFootballDataMatch(m: FdMatch, seasonOverride?: number): Fixture {
  const s = m.score ?? { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } };
  let regular: FdScore = s.fullTime;
  if (s.duration && s.duration !== "REGULAR") {
    if (s.regularTime) regular = s.regularTime;
    else if (s.extraTime && s.fullTime.home != null && s.fullTime.away != null && s.extraTime.home != null && s.extraTime.away != null)
      regular = { home: s.fullTime.home - s.extraTime.home, away: s.fullTime.away - s.extraTime.away };
    else regular = { home: null, away: null };
  }
  const season = seasonOverride ?? (m.season?.startDate ? Number(m.season.startDate.slice(0, 4)) : new Date(m.utcDate).getUTCFullYear());
  return {
    provider: "football_data",
    providerId: String(m.id),
    competition: {
      provider: "football_data",
      providerId: String(m.competition.id),
      name: m.competition.name,
      country: m.area?.name ?? null,
      logoUrl: m.competition.emblem ?? null,
      season,
    },
    homeTeam: {
      provider: "football_data",
      providerId: String(m.homeTeam.id),
      name: m.homeTeam.name ?? "TBD",
      shortName: m.homeTeam.shortName ?? null,
      logoUrl: m.homeTeam.crest ?? null,
    },
    awayTeam: {
      provider: "football_data",
      providerId: String(m.awayTeam.id),
      name: m.awayTeam.name ?? "TBD",
      shortName: m.awayTeam.shortName ?? null,
      logoUrl: m.awayTeam.crest ?? null,
    },
    kickoffAt: new Date(m.utcDate).toISOString(),
    status: STATUS[m.status] ?? "unknown",
    statusDetail: m.status,
    venue: m.venue ?? null,
    regularTime: { home: regular.home ?? null, away: regular.away ?? null },
    halfTime: { home: s.halfTime?.home ?? null, away: s.halfTime?.away ?? null },
    final: { home: s.fullTime?.home ?? null, away: s.fullTime?.away ?? null },
  };
}

export class FootballDataOrgProvider implements FootballDataProvider {
  readonly id = "football_data" as const;
  readonly capabilities = {
    odds: false,
    lineups: false,
    injuries: false,
    xg: false,
    corners: false,
    cards: false,
    halfTimeScores: true,
    dailyRequestBudget: null,
    perMinuteLimit: 10,
  };
  private readonly base: string;

  constructor(private readonly opts: ProviderOptions) {
    if (!opts.apiKey) throw new ProviderError("auth", "FOOTBALL_API_KEY is not set", "football_data");
    this.base = opts.baseUrl ?? "https://api.football-data.org/v4";
  }

  private async getMatches(path: string, params: Record<string, string | number>): Promise<FdMatch[]> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const body = (await httpGetJson(
      this.id,
      `${this.base}${path}${qs.size ? `?${qs}` : ""}`,
      { "X-Auth-Token": this.opts.apiKey },
      this.opts,
      () => null, // only per-minute counters are reported
    )) as { matches?: unknown; errorCode?: number; message?: string };
    if (body?.errorCode) throw new ProviderError(body.errorCode === 429 ? "rate_limited" : "bad_response", body.message ?? "Provider error", this.id);
    if (!Array.isArray(body?.matches)) throw new ProviderError("bad_response", "Missing matches array", this.id);
    return (body.matches as FdMatch[]).filter((m) => m?.id != null && m.homeTeam?.id != null && m.awayTeam?.id != null && m.competition?.id != null);
  }

  async getFixturesByDate(date: string, competitionIds?: string[]): Promise<Fixture[]> {
    const params: Record<string, string> = { dateFrom: date, dateTo: date };
    if (competitionIds?.length) params.competitions = competitionIds.join(",");
    return (await this.getMatches("/matches", params)).map((m) => mapFootballDataMatch(m));
  }

  async getFixturesByIds(ids: string[]): Promise<Fixture[]> {
    const out: Fixture[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      const rows = await this.getMatches("/matches", { ids: ids.slice(i, i + 20).join(",") });
      out.push(...rows.map((m) => mapFootballDataMatch(m)));
    }
    return out;
  }

  async getSeasonFixtures(competitionId: string, season: number): Promise<Fixture[]> {
    return (await this.getMatches(`/competitions/${encodeURIComponent(competitionId)}/matches`, { season })).map((m) =>
      mapFootballDataMatch(m, season),
    );
  }
}
