import "server-only";
import type { Fixture, ProviderId } from "@fpp/core";
import { createProvider } from "@fpp/core/providers";
import { adminDb, must } from "./db";
import { env } from "./env";
import { NotConfiguredError } from "./http";
import { FootballService, type FootballStore } from "./footballService";
import { getSettings, usageToday } from "./repo";

const supabaseStore: FootballStore = {
  async getCache(key) {
    const { data } = await adminDb().from("api_cache").select("payload, fetched_at, expires_at").eq("key", key).maybeSingle();
    return data ? { payload: data.payload as Fixture[], fetchedAt: data.fetched_at as string, expiresAt: data.expires_at as string } : null;
  },
  async setCache(key, provider, payload, ttlMs) {
    const now = Date.now();
    must(
      await adminDb()
        .from("api_cache")
        .upsert({ key, provider, payload, fetched_at: new Date(now).toISOString(), expires_at: new Date(now + ttlMs).toISOString() }),
      "write cache",
    );
  },
  usageToday: (provider: ProviderId) => usageToday(provider),
  async recordRequest(provider, ok, remaining) {
    await adminDb().rpc("record_api_request", { p_provider: provider, p_ok: ok, p_remaining: remaining });
  },
  async settings() {
    const s = await getSettings();
    return { providerEnabled: s.providerEnabled, reserveFraction: s.reserveFraction };
  },
};

let service: FootballService | null = null;

/** Single place where the configured provider is instantiated. Swap providers via env only. */
export function footballService(): FootballService {
  if (service) return service;
  const e = env();
  if (!e.footballApiKey) throw new NotConfiguredError("Football data API key (FOOTBALL_API_KEY)");
  const provider = createProvider(e.provider, {
    apiKey: e.footballApiKey,
    onRequest: (info) => supabaseStore.recordRequest(info.provider, info.ok, info.remainingDaily),
  });
  service = new FootballService(provider, supabaseStore, {
    dailyLimit: e.dailyLimitOverride ?? provider.capabilities.dailyRequestBudget,
  });
  return service;
}
