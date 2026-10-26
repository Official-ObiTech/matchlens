import "server-only";
import { z } from "zod";
import { DEFAULT_COMPETITIONS } from "@fpp/core/providers";
import type { ProviderId } from "@fpp/core";

/**
 * Server-side configuration. Secrets are read only here and never sent to the
 * browser; only NEXT_PUBLIC_* values are exposed to client bundles.
 */
const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  FOOTBALL_DATA_PROVIDER: z.enum(["api_football", "football_data"]).default("api_football"),
  FOOTBALL_API_KEY: z.string().optional(),
  FOOTBALL_COMPETITIONS: z.string().optional(),
  FOOTBALL_SEASON: z.coerce.number().int().min(2000).max(2100).optional(),
  FOOTBALL_DAILY_LIMIT: z.coerce.number().int().positive().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

let cached: ReturnType<typeof load> | null = null;

function load() {
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v])));
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  const e = parsed.data;
  const provider = e.FOOTBALL_DATA_PROVIDER as ProviderId;
  return {
    appEnv: e.APP_ENV,
    provider,
    footballApiKey: e.FOOTBALL_API_KEY ?? null,
    competitions: e.FOOTBALL_COMPETITIONS
      ? e.FOOTBALL_COMPETITIONS.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_COMPETITIONS[provider],
    seasonOverride: e.FOOTBALL_SEASON ?? null,
    dailyLimitOverride: e.FOOTBALL_DAILY_LIMIT ?? null,
    supabaseUrl: e.NEXT_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
    supabaseServiceKey: e.SUPABASE_SERVICE_ROLE_KEY ?? null,
    cronSecret: e.CRON_SECRET ?? null,
    expoAccessToken: e.EXPO_ACCESS_TOKEN ?? null,
  };
}

export function env() {
  cached ??= load();
  return cached;
}

/** For the health endpoint and setup screens: what is configured, never the values. */
export function configStatus() {
  const e = env();
  return {
    database: Boolean(e.supabaseUrl && e.supabaseServiceKey),
    auth: Boolean(e.supabaseUrl && e.supabaseAnonKey),
    footballProvider: e.provider,
    footballApiKey: Boolean(e.footballApiKey),
    cron: Boolean(e.cronSecret),
    competitions: e.competitions.length,
  };
}

/** European-style season year: Aug–Dec belong to that year, Jan–Jul to the previous one. */
export function currentSeason(now = new Date()): number {
  const o = env().seasonOverride;
  if (o) return o;
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
