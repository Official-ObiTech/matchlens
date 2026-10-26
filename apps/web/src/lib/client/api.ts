"use client";
import type { ApiError } from "@fpp/core";
import { browserSupabase } from "./supabase";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const sb = browserSupabase();
  if (!sb) return {};
  const { data } = await sb.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; params?: Record<string, string | number | undefined | null> } = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init.params ?? {})) if (v != null && v !== "") qs.set(k, String(v));
  const url = `/api${path}${qs.size ? `?${qs}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(await authHeader()) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, "network", "Network error. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = body as ApiError | null;
    throw new ApiRequestError(res.status, err?.error ?? "error", err?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

export const tzOffset = () => new Date().getTimezoneOffset();
