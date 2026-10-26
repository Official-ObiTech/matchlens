"use client";
import { localToday, pct, type FixturesResponse, type PerformanceResponse, type StrongestResponse } from "@fpp/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import { SearchIcon } from "@/components/Icons";
import { CardSkeletons, Empty, ErrorState, Notice } from "@/components/ui";
import { api, tzOffset } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { PerformanceKpis } from "./history/PerformanceKpis";

export default function HomePage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const today = useMemo(() => localToday(), []);
  const strongest = useApi(`strongest:${today}`, () => api<StrongestResponse>("/predictions/strongest", { params: { date: today, tz: tzOffset(), limit: 3 } }));
  const fixtures = useApi(`fixtures:${today}`, () => api<FixturesResponse>("/fixtures", { params: { date: today, tz: tzOffset() } }));
  const perf = useApi("performance", () => api<PerformanceResponse>("/performance"));

  const competitions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const f of fixtures.data?.fixtures ?? []) {
      const c = m.get(f.competition.id) ?? { id: f.competition.id, name: f.competition.name, count: 0 };
      c.count++;
      m.set(f.competition.id, c);
    }
    return [...m.values()];
  }, [fixtures.data]);

  // The page is prerendered; render the local date only on the client to avoid a hydration mismatch.
  const [dateLabel, setDateLabel] = useState<string | null>(null);
  useEffect(() => setDateLabel(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })), []);
  const notConfigured = fixtures.error?.code === "not_configured";

  return (
    <div className="stack-lg">
      <section className="stack">
        <div>
          <p className="subtle">{dateLabel ?? "\u00a0"}</p>
          <h1>What are today’s strongest predictions?</h1>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); router.push(`/matches?q=${encodeURIComponent(q)}`); }} role="search">
          <input className="input" placeholder="Search teams, competitions or countries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search matches" />
          <button className="btn" type="submit" aria-label="Search"><SearchIcon /></button>
        </form>
        {notConfigured && <Notice tone="warn">{fixtures.error!.message}</Notice>}
        {fixtures.data?.notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
      </section>

      <section className="stack">
        <div className="section-head"><h2>Highest-confidence selections</h2><Link href="/predictions">See all</Link></div>
        {strongest.loading ? <CardSkeletons n={3} /> : strongest.error ? (
          notConfigured ? null : <ErrorState message={strongest.error.message} onRetry={strongest.reload} />
        ) : strongest.data!.picks.length === 0 ? (
          <Empty title="No selections meet the criteria today">The model only recommends picks it can support with data. Check back after the next data refresh, or browse matches yourself.</Empty>
        ) : (
          <div className="grid-cards">{strongest.data!.picks.map((p) => <MatchCard key={p.id} f={p} />)}</div>
        )}
      </section>

      <section className="card row between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2>Build My Slip</h2>
          <span className="muted">Get eligible selections from the model, then keep, replace or remove each one. One game is enough.</span>
        </div>
        <Link className="btn btn-primary" href="/predictions#build">Build my slip</Link>
      </section>

      <section className="stack">
        <div className="section-head"><h2>Today’s fixtures</h2><Link href="/matches">All matches</Link></div>
        {competitions.length > 0 && (
          <div className="chips" aria-label="Browse competitions">
            {competitions.map((c) => <Link key={c.id} className="chip" href={`/matches?competition=${c.id}`} style={{ display: "inline-flex", alignItems: "center" }}>{c.name} · {c.count}</Link>)}
          </div>
        )}
        {fixtures.loading ? <CardSkeletons /> : fixtures.error ? (
          notConfigured ? null : <ErrorState message={fixtures.error.message} onRetry={fixtures.reload} />
        ) : fixtures.data!.fixtures.length === 0 ? (
          <Empty title="No fixtures today" action={<Link className="btn btn-sm" href="/matches?range=upcoming">See upcoming matches</Link>}>There are no matches in the supported competitions today.</Empty>
        ) : (
          <div className="grid-cards">{fixtures.data!.fixtures.slice(0, 12).map((f) => <MatchCard key={f.id} f={f} />)}</div>
        )}
      </section>

      <section className="stack">
        <div className="section-head"><h2>Prediction performance</h2><Link href="/history">Full history</Link></div>
        {perf.data ? (
          <>
            <PerformanceKpis p={perf.data} />
            {perf.data.recent.filter((r) => r.status !== "pending").slice(0, 5).length > 0 && (
              <div className="card card-flush">
                {perf.data.recent.filter((r) => r.status !== "pending").slice(0, 5).map((r, i) => (
                  <Link key={r.id} href={`/matches/${encodeURIComponent(r.fixtureId)}`} className="row between" style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : 0 }}>
                    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 620 }}>{r.homeName} vs {r.awayName}</span>
                      <span className="subtle">{r.label} · {pct(r.probability)}</span>
                    </div>
                    <span className="status" data-s={r.status}>{r.status.toUpperCase()}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : perf.loading ? <CardSkeletons n={1} /> : null}
      </section>
    </div>
  );
}
