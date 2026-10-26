import type { Fixture } from "@fpp/core";
import type { FootballDataProvider } from "@fpp/core/providers";
import { describe, expect, it, vi } from "vitest";
import { FootballService, ProviderDisabledError, QuotaError, type CacheEntry, type FootballStore } from "../src/lib/server/footballService";

const fx = (id: string) => ({ providerId: id }) as unknown as Fixture;

function setup(opts: { used?: number; enabled?: boolean; cache?: CacheEntry | null; limit?: number | null; fail?: Error } = {}) {
  let used = opts.used ?? 0;
  const cache = new Map<string, CacheEntry>();
  if (opts.cache) cache.set("api_football:season:39:2026", opts.cache);
  const store: FootballStore = {
    getCache: async (k) => cache.get(k) ?? null,
    setCache: async (k, _p, payload, ttl) => void cache.set(k, { payload, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttl).toISOString() }),
    usageToday: async () => used,
    recordRequest: async () => void used++,
    settings: async () => ({ providerEnabled: opts.enabled ?? true, reserveFraction: 0.2 }),
  };
  const getSeasonFixtures = vi.fn(async () => {
    if (opts.fail) throw opts.fail;
    return [fx("1"), fx("2")];
  });
  const getFixturesByIds = vi.fn(async (ids: string[]) => ids.map(fx));
  const provider = {
    id: "api_football",
    capabilities: { perMinuteLimit: null, dailyRequestBudget: 100 },
    getSeasonFixtures,
    getFixturesByIds,
    getFixturesByDate: vi.fn(),
  } as unknown as FootballDataProvider;
  const sleep = vi.fn(async () => {});
  const svc = new FootballService(provider, store, { dailyLimit: opts.limit === undefined ? 100 : opts.limit, sleep });
  return { svc, getSeasonFixtures, getFixturesByIds, sleep, cache };
}

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

describe("FootballService", () => {
  it("serves fresh cache without calling the provider", async () => {
    const { svc, getSeasonFixtures } = setup({ cache: { payload: [fx("9")], fetchedAt: past(), expiresAt: future() } });
    const r = await svc.seasonFixtures("39", 2026, { ttlMs: 1000 });
    expect(r).toMatchObject({ fromCache: true, stale: false });
    expect(getSeasonFixtures).not.toHaveBeenCalled();
  });

  it("refreshes expired cache and stores the result", async () => {
    const { svc, getSeasonFixtures, cache } = setup({ cache: { payload: [fx("9")], fetchedAt: past(), expiresAt: past() } });
    const r = await svc.seasonFixtures("39", 2026, { ttlMs: 1000 });
    expect(r.fromCache).toBe(false);
    expect(r.fixtures).toHaveLength(2);
    expect(getSeasonFixtures).toHaveBeenCalledOnce();
    expect(cache.get("api_football:season:39:2026")!.payload).toHaveLength(2);
  });

  it("deduplicates identical in-flight requests", async () => {
    const { svc, getSeasonFixtures } = setup();
    await Promise.all([svc.seasonFixtures("39", 2026, { ttlMs: 1000 }), svc.seasonFixtures("39", 2026, { ttlMs: 1000 })]);
    expect(getSeasonFixtures).toHaveBeenCalledOnce();
  });

  it("keeps a reserve: normal requests stop early, critical ones continue", async () => {
    const { svc } = setup({ used: 85 });
    await expect(svc.seasonFixtures("39", 2026, { ttlMs: 1000 })).rejects.toBeInstanceOf(QuotaError);
    await expect(svc.fixturesByIds(["1"], "critical")).resolves.toHaveLength(1);
  });

  it("blocks everything at the hard limit", async () => {
    const { svc } = setup({ used: 100 });
    await expect(svc.fixturesByIds(["1"], "critical")).rejects.toBeInstanceOf(QuotaError);
  });

  it("falls back to stale cache when quota is exhausted or the provider fails", async () => {
    const stale = { payload: [fx("9")], fetchedAt: past(), expiresAt: past() };
    const a = await setup({ used: 100, cache: stale }).svc.seasonFixtures("39", 2026, { ttlMs: 1000 });
    expect(a).toMatchObject({ fromCache: true, stale: true });
    expect(a.warning).toMatch(/limit/);
    const b = await setup({ cache: stale, fail: new Error("timeout") }).svc.seasonFixtures("39", 2026, { ttlMs: 1000 });
    expect(b).toMatchObject({ stale: true, warning: "timeout" });
  });

  it("propagates errors when nothing is cached", async () => {
    await expect(setup({ fail: new Error("boom") }).svc.seasonFixtures("39", 2026, { ttlMs: 1000 })).rejects.toThrow("boom");
  });

  it("respects the admin kill switch", async () => {
    await expect(setup({ enabled: false }).svc.fixturesByIds(["1"])).rejects.toBeInstanceOf(ProviderDisabledError);
  });

  it("chunks id lookups so each request is quota-checked", async () => {
    const { svc, getFixturesByIds } = setup();
    await svc.fixturesByIds(Array.from({ length: 45 }, (_, i) => String(i)));
    expect(getFixturesByIds).toHaveBeenCalledTimes(3);
  });

  it("works without a daily limit", async () => {
    await expect(setup({ used: 10_000, limit: null }).svc.fixturesByIds(["1"])).resolves.toHaveLength(1);
  });
});
