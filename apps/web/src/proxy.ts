import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for the JSON API so the Expo web build and other origins can call it.
 * Auth uses bearer tokens (not cookies), so allowing any origin does not
 * expose users to CSRF.
 */
export function proxy(req: NextRequest) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: "/api/:path*" };
