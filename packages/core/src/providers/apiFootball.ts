import type { Fixture, FixtureStatus } from "../types";
import { ProviderError, httpGetJson, type FootballDataProvider, type ProviderOptions } from "./types";

/**
 * API-Football (api-sports.io) v3 adapter.
 * Docs: https://www.api-football.com/documentation-v3
 * Free plan: ~100 requests/day; access to seasons may be restricted by plan —
 * the adapter surfaces that as a "plan" error rather than returning empty data.
 */

const STATUS: Record<string, FixtureStatus> = {
  TBD: "tbd",
  NS: "scheduled",
  "1H": "live",
  HT: "live",
  "2H": "live",
  ET: "live",
  BT: "live",
  P: "live",
  LIVE: "live",
  INT: "suspended",
  SUSP: "suspended",
  FT: "finished",
  AET: "finished",
  PEN: "finished",
  PST: "postponed",
  CANC: "cancelled",
  ABD: "abandoned",
  AWD: "awarded",
  WO: "awarded",
};

interface AfScore {
  home: number | null;
  away: number | null;
}

interface AfFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string };
    venue?: { name: string | null; city: string | null } | null;
  };
  league: { id: number; name: string; country: string | null; logo: string | null; season: number };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
  goals: AfScore;
  score: { halftime: AfScore; fulltime: AfScore; extratime?: AfScore; penalty?: AfScore };
}

interface AfEnvelope {
  errors: unknown[] | Record<string, string>;
  response: unknown;
}

export function mapApiFootballFixture(raw: AfFixture): Fixture {
  const status = STATUS[raw.fixture?.status?.short] ?? "unknown";
  const ft = raw.score?.fulltime ?? { home: null, away: null };
  // `score.fulltime` is the 90-minute score. For plain FT matches fall back to `goals`.
  const regular: AfScore =
    ft.home != null && ft.away != null
      ? ft
      : status === "finished" && raw.fixture.status.short === "FT"
        ? raw.goals
        : { home: null, away: null };
  return {
    provider: "api_football",
    providerId: String(raw.fixture.id),
    competition: {
      provider: "api_football",
      providerId: String(raw.league.id),
      name: raw.league.name,
      country: raw.league.country ?? null,
      logoUrl: raw.league.logo ?? null,
      season: raw.league.season,
    },
    homeTeam: {
      provider: "api_football",
      providerId: String(raw.teams.home.id),
      name: raw.teams.home.name,
      shortName: null,
      logoUrl: raw.teams.home.logo ?? null,
    },
    awayTeam: {
      provider: "api_football",
      providerId: String(raw.teams.away.id),
      name: raw.teams.away.name,
      shortName: null,
      logoUrl: raw.teams.away.logo ?? null,
    },
    kickoffAt: new Date(raw.fixture.date).toISOString(),
    status,
    statusDetail: raw.fixture.status.long ?? null,
    venue: [raw.fixture.venue?.name, raw.fixture.venue?.city].filter(Boolean).join(", ") || null,
    regularTime: { home: regular.home ?? null, away: regular.away ?? null },
    halfTime: { home: raw.score?.halftime?.home ?? null, away: raw.score?.halftime?.away ?? null },
    final: { home: raw.goals?.home ?? null, away: raw.goals?.away ?? null },
  };
}

export class ApiFootballProvider implements FootballDataProvider {
  readonly id = "api_football" as const;
  readonly capabilities = {
    // Odds/lineups/injuries exist on API-Football but each costs extra requests per
    // fixture; with a ~100/day free budget they are not fetched in this version.
    odds: false,
    lineups: false,
    injuries: false,
    xg: false,
    corners: false,
    cards: false,
    halfTimeScores: true,
    dailyRequestBudget: 100,
    perMinuteLimit: 10,
  };
  private readonly base: string;

  constructor(private readonly opts: ProviderOptions) {
    if (!opts.apiKey) throw new ProviderError("auth", "FOOTBALL_API_KEY is not set", "api_football");
    this.base = opts.baseUrl ?? "https://v3.football.api-sports.io";
  }

  private async get(path: string, params: Record<string, string | number>): Promise<AfFixture[]> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const body = (await httpGetJson(
      this.id,
      `${this.base}${path}?${qs}`,
      { "x-apisports-key": this.opts.apiKey },
      this.opts,
      (h) => numOrNull(h.get("x-ratelimit-requests-remaining")),
    )) as AfEnvelope;

    // API-Football returns HTTP 200 with an `errors` object for quota/auth/plan problems.
    const errors = body?.errors;
    if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
      const text = Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join("; ");
      const keys = Object.keys(errors).join(" ").toLowerCase();
      const kind = keys.includes("requests") || keys.includes("ratelimit") ? "rate_limited" : keys.includes("token") ? "auth" : keys.includes("plan") ? "plan" : "bad_response";
      throw new ProviderError(kind, text, this.id);
    }
    if (!Array.isArray(body?.response)) throw new ProviderError("bad_response", "Missing response array", this.id);
    const out: AfFixture[] = [];
    for (const r of body.response as AfFixture[]) {
      if (r?.fixture?.id != null && r.teams?.home?.id != null && r.teams?.away?.id != null && r.league?.id != null) out.push(r);
    }
    return out;
  }

  async getFixturesByDate(date: string, competitionIds?: string[]): Promise<Fixture[]> {
    const rows = await this.get("/fixtures", { date, timezone: "UTC" });
    const allow = competitionIds && competitionIds.length > 0 ? new Set(competitionIds) : null;
    return rows.filter((r) => !allow || allow.has(String(r.league.id))).map(mapApiFootballFixture);
  }

  async getFixturesByIds(ids: string[]): Promise<Fixture[]> {
    const out: Fixture[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      const rows = await this.get("/fixtures", { ids: chunk.join("-") });
      out.push(...rows.map(mapApiFootballFixture));
    }
    return out;
  }

  async getSeasonFixtures(competitionId: string, season: number): Promise<Fixture[]> {
    const rows = await this.get("/fixtures", { league: competitionId, season });
    return rows.map(mapApiFootballFixture);
  }
}

function numOrNull(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
