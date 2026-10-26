import { describe, expect, it } from "vitest";
import { ApiFootballProvider, FootballDataOrgProvider, ProviderError, toHistorical } from "../src/providers";

const afFixture = (over: Record<string, unknown> = {}) => ({
  fixture: { id: 1001, date: "2026-10-26T15:00:00+00:00", status: { short: "FT", long: "Match Finished" }, venue: { name: "Anfield", city: "Liverpool" } },
  league: { id: 39, name: "Premier League", country: "England", logo: "l.png", season: 2026 },
  teams: { home: { id: 40, name: "Liverpool", logo: "a.png" }, away: { id: 51, name: "Brighton", logo: "b.png" } },
  goals: { home: 2, away: 1 },
  score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 }, extratime: { home: null, away: null } },
  ...over,
});

function mockFetch(handler: (url: string) => { status?: number; body?: unknown; headers?: Record<string, string>; throws?: Error }) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const r = handler(u);
    if (r.throws) throw r.throws;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

describe("ApiFootballProvider", () => {
  it("maps a valid response into the internal model and reports quota", async () => {
    const usage: (number | null)[] = [];
    const { impl, calls } = mockFetch(() => ({
      body: { errors: [], response: [afFixture(), afFixture({ league: { id: 999, name: "Other", country: null, logo: null, season: 2026 } })] },
      headers: { "x-ratelimit-requests-remaining": "87" },
    }));
    const p = new ApiFootballProvider({ apiKey: "k", fetchImpl: impl, onRequest: (i) => void usage.push(i.remainingDaily) });
    const fx = await p.getFixturesByDate("2026-10-26", ["39"]);
    expect(calls[0]).toContain("date=2026-10-26");
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({
      providerId: "1001",
      status: "finished",
      homeTeam: { name: "Liverpool", providerId: "40" },
      regularTime: { home: 2, away: 1 },
      halfTime: { home: 1, away: 0 },
      venue: "Anfield, Liverpool",
    });
    expect(usage).toEqual([87]);
    expect(toHistorical(fx)).toHaveLength(1);
  });

  it("uses the 90-minute score for matches decided in extra time", async () => {
    const { impl } = mockFetch(() => ({
      body: {
        errors: [],
        response: [afFixture({ fixture: { id: 5, date: "2026-10-26T15:00:00Z", status: { short: "AET", long: "After extra time" } }, goals: { home: 2, away: 1 }, score: { halftime: { home: 0, away: 0 }, fulltime: { home: 1, away: 1 }, extratime: { home: 1, away: 0 } } })],
      },
    }));
    const [f] = await new ApiFootballProvider({ apiKey: "k", fetchImpl: impl }).getFixturesByIds(["5"]);
    expect(f!.regularTime).toEqual({ home: 1, away: 1 });
    expect(f!.final).toEqual({ home: 2, away: 1 });
  });

  it("tolerates missing optional fields and drops malformed rows", async () => {
    const { impl } = mockFetch(() => ({
      body: {
        errors: [],
        response: [
          { ...afFixture(), fixture: { id: 7, date: "2026-10-26T15:00:00Z", status: { short: "NS", long: "Not Started" } }, goals: { home: null, away: null }, score: {} },
          { fixture: { id: 8 } },
        ],
      },
    }));
    const fx = await new ApiFootballProvider({ apiKey: "k", fetchImpl: impl }).getFixturesByDate("2026-10-26");
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ status: "scheduled", venue: null, regularTime: { home: null, away: null } });
    expect(toHistorical(fx)).toHaveLength(0);
  });

  it.each([
    [{ requests: "You have reached the request limit for the day" }, "rate_limited"],
    [{ token: "Error/Missing application key." }, "auth"],
    [{ plan: "Free plans do not have access to this season" }, "plan"],
  ])("classifies body error %o as %s", async (errors, kind) => {
    const { impl } = mockFetch(() => ({ body: { errors, response: [] } }));
    await expect(new ApiFootballProvider({ apiKey: "k", fetchImpl: impl }).getFixturesByDate("2026-10-26")).rejects.toMatchObject({ kind });
  });

  it("classifies HTTP failures", async () => {
    const run = (status: number) => new ApiFootballProvider({ apiKey: "k", fetchImpl: mockFetch(() => ({ status })).impl }).getFixturesByDate("2026-10-26");
    await expect(run(429)).rejects.toMatchObject({ kind: "rate_limited" });
    await expect(run(401)).rejects.toMatchObject({ kind: "auth" });
    await expect(run(500)).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("times out slow requests", async () => {
    const slow = ((_u: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
    await expect(new ApiFootballProvider({ apiKey: "k", fetchImpl: slow, timeoutMs: 20 }).getFixturesByDate("2026-10-26")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("reports network failures", async () => {
    const { impl } = mockFetch(() => ({ throws: new TypeError("fetch failed") }));
    await expect(new ApiFootballProvider({ apiKey: "k", fetchImpl: impl }).getFixturesByDate("2026-10-26")).rejects.toMatchObject({ kind: "network" });
  });

  it("refuses to start without a key", () => {
    expect(() => new ApiFootballProvider({ apiKey: "" })).toThrow(ProviderError);
  });

  it("batches id lookups in groups of 20", async () => {
    const { impl, calls } = mockFetch(() => ({ body: { errors: [], response: [] } }));
    await new ApiFootballProvider({ apiKey: "k", fetchImpl: impl }).getFixturesByIds(Array.from({ length: 45 }, (_, i) => String(i)));
    expect(calls).toHaveLength(3);
  });
});

describe("FootballDataOrgProvider", () => {
  it("maps matches including extra-time regular score", async () => {
    const { impl } = mockFetch(() => ({
      body: {
        matches: [
          {
            id: 9,
            utcDate: "2026-10-26T19:45:00Z",
            status: "FINISHED",
            competition: { id: 2001, name: "Champions League", emblem: null },
            area: { name: "Europe" },
            season: { startDate: "2026-08-01" },
            homeTeam: { id: 1, name: "A", shortName: "A" },
            awayTeam: { id: 2, name: "B", shortName: "B" },
            score: { duration: "EXTRA_TIME", fullTime: { home: 3, away: 2 }, halfTime: { home: 1, away: 1 }, extraTime: { home: 1, away: 0 } },
          },
        ],
      },
    }));
    const [f] = await new FootballDataOrgProvider({ apiKey: "k", fetchImpl: impl }).getFixturesByDate("2026-10-26");
    expect(f).toMatchObject({ status: "finished", regularTime: { home: 2, away: 2 }, competition: { season: 2026 } });
  });

  it("surfaces quota errors", async () => {
    const { impl } = mockFetch(() => ({ status: 429, body: { message: "Too many requests" } }));
    await expect(new FootballDataOrgProvider({ apiKey: "k", fetchImpl: impl }).getSeasonFixtures("2021", 2026)).rejects.toMatchObject({ kind: "rate_limited" });
  });
});
