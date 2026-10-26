import type { ApiError } from "@fpp/core";
import { API_URL } from "./config";
import { supabase } from "./supabase";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Same HTTP API as the website, so both clients show identical predictions. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; params?: Record<string, string | number | undefined | null> } = {}): Promise<T> {
  if (!API_URL) throw new ApiRequestError(0, "not_configured", "EXPO_PUBLIC_API_URL is not set. See apps/mobile/.env.example.");
  const qs = Object.entries(init.params ?? {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}${qs ? `?${qs}` : ""}`, { method: init.method ?? "GET", headers, body: init.body ? JSON.stringify(init.body) : undefined, signal: ctrl.signal });
  } catch {
    throw new ApiRequestError(0, "network", "Can’t reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const e = body as ApiError | null;
    throw new ApiRequestError(res.status, e?.error ?? "error", e?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

export const tzOffset = () => new Date().getTimezoneOffset();
