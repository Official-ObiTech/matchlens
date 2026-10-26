import "server-only";
import type { NextRequest } from "next/server";
import { adminDb, isDbConfigured } from "./db";
import { HttpError } from "./http";

const memory = new Map<string, { windowStart: number; count: number }>();

function memoryHit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  const w = Math.floor(now / (windowSec * 1000));
  const entry = memory.get(key);
  if (!entry || entry.windowStart !== w) {
    memory.set(key, { windowStart: w, count: 1 });
    if (memory.size > 10_000) memory.clear();
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Fixed-window rate limit backed by Postgres (shared across serverless
 * instances). Falls back to per-instance memory if the database call fails.
 */
export async function rateLimit(key: string, limit: number, windowSec = 60) {
  let allowed: boolean;
  if (isDbConfigured()) {
    const { data, error } = await adminDb().rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSec });
    allowed = error ? memoryHit(key, limit, windowSec) : Boolean(data);
  } else {
    allowed = memoryHit(key, limit, windowSec);
  }
  if (!allowed) throw new HttpError(429, "rate_limited", "Too many requests. Please slow down.");
}
