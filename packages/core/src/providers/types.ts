import type { Fixture, HistoricalMatch, ProviderId } from "../types";

export type ProviderErrorKind =
  | "rate_limited" // per-minute or daily quota exhausted
  | "auth" // missing/invalid key
  | "plan" // the current plan does not include this data (e.g. season)
  | "timeout"
  | "network"
  | "bad_response"
  | "not_found";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly provider: ProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface RequestInfo {
  provider: ProviderId;
  endpoint: string;
  /** Remaining daily requests reported by the provider, when it reports one. */
  remainingDaily: number | null;
  ok: boolean;
}

export interface ProviderOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Called after every upstream HTTP request (used for quota tracking). */
  onRequest?: (info: RequestInfo) => void | Promise<void>;
  baseUrl?: string;
}

/** Inputs the model could use but this provider/plan does not deliver. */
export interface ProviderCapabilities {
  odds: boolean;
  lineups: boolean;
  injuries: boolean;
  xg: boolean;
  corners: boolean;
  cards: boolean;
  halfTimeScores: boolean;
  /** Approximate free-plan daily request budget, for quota planning. */
  dailyRequestBudget: number | null;
  perMinuteLimit: number | null;
}

export interface FootballDataProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  /** All fixtures on a UTC calendar date, optionally restricted to competitions. */
  getFixturesByDate(date: string, competitionIds?: string[]): Promise<Fixture[]>;
  /** Current state of specific fixtures (used for settlement). */
  getFixturesByIds(ids: string[]): Promise<Fixture[]>;
  /** Every fixture of a competition season (any status). */
  getSeasonFixtures(competitionId: string, season: number): Promise<Fixture[]>;
}

export function unavailableInputs(c: ProviderCapabilities): string[] {
  const out: string[] = [];
  if (!c.xg) out.push("xG / xGA");
  if (!c.lineups) out.push("Confirmed lineups");
  if (!c.injuries) out.push("Injuries & suspensions");
  if (!c.odds) out.push("Bookmaker odds");
  if (!c.corners) out.push("Corners");
  if (!c.cards) out.push("Cards");
  return out;
}

/** Reduce finished fixtures to model input. Matches without a regular-time score are dropped. */
export function toHistorical(fixtures: Fixture[]): HistoricalMatch[] {
  const out: HistoricalMatch[] = [];
  for (const f of fixtures) {
    if (f.status !== "finished") continue;
    const { home, away } = f.regularTime;
    if (home == null || away == null) continue;
    out.push({
      fixtureId: `${f.provider}:${f.providerId}`,
      date: f.kickoffAt,
      homeTeamId: f.homeTeam.providerId,
      awayTeamId: f.awayTeam.providerId,
      homeGoals: home,
      awayGoals: away,
      htHomeGoals: f.halfTime.home,
      htAwayGoals: f.halfTime.away,
    });
  }
  return out;
}

/** fetch with timeout and uniform error classification. */
export async function httpGetJson(
  provider: ProviderId,
  url: string,
  headers: Record<string, string>,
  opts: ProviderOptions,
  readRemaining: (h: Headers) => number | null,
): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  const endpoint = new URL(url).pathname;
  let res: Response;
  try {
    res = await f(url, { headers, signal: ctrl.signal });
  } catch (e) {
    await opts.onRequest?.({ provider, endpoint, remainingDaily: null, ok: false });
    if ((e as Error).name === "AbortError") throw new ProviderError("timeout", `Request to ${endpoint} timed out`, provider);
    throw new ProviderError("network", `Network error calling ${endpoint}: ${(e as Error).message}`, provider);
  } finally {
    clearTimeout(timer);
  }
  await opts.onRequest?.({ provider, endpoint, remainingDaily: readRemaining(res.headers), ok: res.ok });

  if (res.status === 429) throw new ProviderError("rate_limited", "Provider rate limit reached", provider, 429);
  if (res.status === 401 || res.status === 403)
    throw new ProviderError("auth", "Provider rejected the API key or the plan does not allow this resource", provider, res.status);
  if (res.status === 404) throw new ProviderError("not_found", `Not found: ${endpoint}`, provider, 404);
  if (!res.ok) throw new ProviderError("bad_response", `HTTP ${res.status} from ${endpoint}`, provider, res.status);
  try {
    return await res.json();
  } catch {
    throw new ProviderError("bad_response", `Invalid JSON from ${endpoint}`, provider, res.status);
  }
}
