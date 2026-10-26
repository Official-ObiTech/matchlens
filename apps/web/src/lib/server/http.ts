import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ProviderError } from "@fpp/core/providers";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NotConfiguredError extends HttpError {
  constructor(what: string) {
    super(503, "not_configured", `${what} is not configured on the server. See docs/SETUP.md.`);
  }
}

export class QuotaExceededError extends HttpError {
  constructor(message = "The football data quota for today has been reached. Showing cached data where available.") {
    super(503, "quota_exceeded", message);
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Uniform error handling: validation → 400, known errors → their status, the rest → 500 (logged, not leaked). */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ZodError)
        return json({ error: "invalid_request", message: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, 400);
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      if (e instanceof ProviderError) {
        console.error("[provider]", e.kind, e.message);
        const status = e.kind === "rate_limited" ? 503 : 502;
        return json({ error: `provider_${e.kind}`, message: "The football data provider is unavailable right now." }, status);
      }
      console.error("[api] unhandled", e);
      return json({ error: "internal_error", message: "Something went wrong." }, 500);
    }
  };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers });
}

export function searchParams(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
