import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { NotConfiguredError } from "./http";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — only used inside server code paths that
 * have already authorised the caller. Never import from client components.
 */
export function adminDb(): SupabaseClient {
  const e = env();
  if (!e.supabaseUrl || !e.supabaseServiceKey) throw new NotConfiguredError("Database (Supabase)");
  admin ??= createClient(e.supabaseUrl, e.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Client acting as the signed-in user, so Row Level Security applies. */
export function userDb(accessToken: string): SupabaseClient {
  const e = env();
  if (!e.supabaseUrl || !e.supabaseAnonKey) throw new NotConfiguredError("Database (Supabase)");
  return createClient(e.supabaseUrl, e.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function isDbConfigured() {
  const e = env();
  return Boolean(e.supabaseUrl && e.supabaseServiceKey);
}

/** Throw on a Supabase error, return data otherwise. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
