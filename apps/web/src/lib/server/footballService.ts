import type { Fixture, ProviderId } from "@fpp/core";
import type { FootballDataProvider } from "@fpp/core/providers";

/**
 * Wraps a FootballDataProvider with:
 *  - a persistent cache of normalised responses (no repeated upstream calls),
 *  - a daily quota with a reserve kept for critical work (result settlement),
 *  - per-minute pacing to respect provider rate limits,
 *  - de-duplication of identical in-flight requests,
 *  - stale-cache fallback when the provider is down, disabled or out of quota.
 *
 * Deliberately free of framework/DB imports so it can be unit tested.
 */

export type Priority = "critical" | "normal";

export interface CacheEntry {
  payload: Fixture[];
  fetchedAt: string;
  expiresAt: string;
}

export interface FootballStore {
  getCache(key: string): Promise<CacheEntry | null>;
  setCache(key: string, provider: ProviderId, payload: Fixture[], ttlMs: number): Promise<void>;
  usageToday(provider: ProviderId): Promise<number>;
  recordRequest(provider: ProviderId, ok: boolean, remaining: number | null): Promise<void>;
  settings(): Promise<{ providerEnabled: boolean; reserveFraction: number }>;
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

export class ProviderDisabledError extends Error {
  constructor() {
    super("The football data provider has been disabled by an administrator.");
    this.name = "ProviderDisabledError";
  }
}

export interface CachedResult {
  fixtures: Fixture[];
  fromCache: boolean;
  /** True when the cache was past its expiry but fresh data could not be fetched. */
  stale: boolean;
  fetchedAt: string;
  warning?: string;
}

export interface ServiceOptions {
  dailyLimit: number | null;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class FootballService {
  private inflight = new Map<string, Promise<CachedResult>>();
  private lastCallAt = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minInterval: number;

  constructor(
    readonly provider: FootballDataProvider,
    private readonly store: FootballStore,
    private readonly opts: ServiceOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const perMinute = provider.capabilities.perMinuteLimit;
    this.minInterval = opts.minIntervalMs ?? (perMinute ? Math.ceil(60_000 / perMinute) + 200 : 0);
  }

  /** Throws QuotaError if this request may not be made now. */
  async checkQuota(priority: Priority) {
    const limit = this.opts.dailyLimit;
    if (limit == null) return;
    const [used, s] = await Promise.all([this.store.usageToday(this.provider.id), this.store.settings()]);
    const ceiling = priority === "critical" ? limit : Math.floor(limit * (1 - s.reserveFraction));
    if (used >= limit) throw new QuotaError(`Daily request limit reached (${used}/${limit}).`);
    if (used >= ceiling)
      throw new QuotaError(`Non-essential refreshes paused: ${used}/${limit} requests used, remainder reserved for result settlement.`);
  }

  private async upstream<T>(priority: Priority, call: () => Promise<T>): Promise<T> {
    const s = await this.store.settings();
    if (!s.providerEnabled) throw new ProviderDisabledError();
    await this.checkQuota(priority);
    const wait = this.lastCallAt + this.minInterval - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastCallAt = this.now();
    return call();
  }

  /** Cached fetch of a whole competition season (fixtures + results). */
  seasonFixtures(competitionId: string, season: number, opts: { ttlMs: number; priority?: Priority }): Promise<CachedResult> {
    const key = `${this.provider.id}:season:${competitionId}:${season}`;
    return this.cached(key, opts.ttlMs, opts.priority ?? "normal", () => this.provider.getSeasonFixtures(competitionId, season));
  }

  /** Uncached lookup of specific fixtures (settlement needs fresh state). Chunked so each call is quota-checked. */
  async fixturesByIds(ids: string[], priority: Priority = "critical"): Promise<Fixture[]> {
    const out: Fixture[] = [];
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20);
      out.push(...(await this.upstream(priority, () => this.provider.getFixturesByIds(chunk))));
    }
    return out;
  }

  private cached(key: string, ttlMs: number, priority: Priority, fetcher: () => Promise<Fixture[]>): Promise<CachedResult> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = (async (): Promise<CachedResult> => {
      const hit = await this.store.getCache(key);
      if (hit && new Date(hit.expiresAt).getTime() > this.now()) {
        return { fixtures: hit.payload, fromCache: true, stale: false, fetchedAt: hit.fetchedAt };
      }
      try {
        const fixtures = await this.upstream(priority, fetcher);
        await this.store.setCache(key, this.provider.id, fixtures, ttlMs);
        return { fixtures, fromCache: false, stale: false, fetchedAt: new Date(this.now()).toISOString() };
      } catch (e) {
        if (hit) return { fixtures: hit.payload, fromCache: true, stale: true, fetchedAt: hit.fetchedAt, warning: (e as Error).message };
        throw e;
      }
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
