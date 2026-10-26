import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { adminDb } from "./db";
import { env } from "./env";
import { HttpError } from "./http";

export interface AuthUser {
  id: string;
  email: string | null;
  role: "user" | "admin";
  accessToken: string;
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t.length > 0 && t.length < 4096 ? t : null;
}

/** Resolve the Supabase user from the Authorization header (web and mobile both send it). */
export async function getUser(req: NextRequest): Promise<AuthUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? null, role: profile?.role === "admin" ? "admin" : "user", accessToken: token };
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, "unauthorized", "Sign in required.");
  return u;
}

/** Admin role is checked on the server from the profiles table, never trusted from the client. */
export async function requireAdmin(req: NextRequest): Promise<AuthUser> {
  const u = await requireUser(req);
  if (u.role !== "admin") throw new HttpError(403, "forbidden", "Administrator access required.");
  return u;
}

/** Scheduled jobs authenticate with CRON_SECRET (Vercel Cron sends it as a bearer token). */
export function requireCron(req: NextRequest) {
  const secret = env().cronSecret;
  const token = bearer(req);
  if (!secret) throw new HttpError(503, "not_configured", "CRON_SECRET is not configured.");
  const a = Buffer.from(token ?? "");
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "unauthorized", "Invalid cron secret.");
}
