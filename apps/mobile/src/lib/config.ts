/** Public build-time configuration (EXPO_PUBLIC_* values are inlined into the bundle). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
