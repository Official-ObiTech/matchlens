"use client";
import { MARKET_LABEL, kickoffDate, pct, type PerformanceResponse, type SavedSlipDto } from "@fpp/core";
import Link from "next/link";
import { useState } from "react";
import { CardSkeletons, Empty, ErrorState } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useApi, useSession } from "@/lib/client/hooks";
import { PerformanceKpis } from "./PerformanceKpis";
import { SlipCard } from "./SlipCard";

const TABS = ["all", "pending", "won", "lost", "void"] as const;

export default function HistoryPage() {
  const perf = useApi("performance", () => api<PerformanceResponse>("/performance"));
  const { session } = useSession();
  const slips = useApi(session ? `slips:${session.user.id}` : null, () => api<{ slips: SavedSlipDto[] }>("/slips"));
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");

  return (
    <div className="stack-lg">
      <section className="stack">
        <h1>Prediction History</h1>
        <p className="muted" style={{ margin: 0 }}>Every model prediction is recorded before kickoff and settled against the official result. These figures are calculated from those records.</p>
        {perf.loading ? <CardSkeletons n={1} /> : perf.error ? <ErrorState message={perf.error.message} onRetry={perf.reload} /> : <PerformanceKpis p={perf.data!} />}
      </section>

      {perf.data && perf.data.overall.settled > 0 && (
        <section className="grid-2">
          <Breakdown title="By market" rows={perf.data.byMarket.map((r) => ({ ...r, key: MARKET_LABEL[r.key] ?? r.key }))} />
          <Breakdown title="By estimated probability" rows={perf.data.byProbability} />
          <Breakdown title="By competition" rows={perf.data.byCompetition} />
          <div className="card stack">
            <h2>Calibration</h2>
            <span className="subtle">Well-calibrated predictions win about as often as their estimated probability.</span>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Range</th><th>n</th><th>Estimated</th><th>Actual</th></tr></thead>
                <tbody>
                  {perf.data.calibration.map((c) => (
                    <tr key={c.bucket}><td>{c.bucket}</td><td>{c.n}</td><td>{pct(c.meanPredicted, 1)}</td><td>{pct(c.winRate, 1)}{c.interval && <span className="subtle"> ({pct(c.interval[0])}–{pct(c.interval[1])})</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {perf.data && (
        <section className="stack">
          <div className="section-head"><h2>Model predictions</h2></div>
          <div className="chips" role="group" aria-label="Filter by result">
            {TABS.map((t) => <button key={t} className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
          </div>
          {perf.data.recent.filter((r) => tab === "all" || r.status === tab).length === 0 ? (
            <Empty title="Nothing here yet">Predictions appear once the model publishes them before kickoff.</Empty>
          ) : (
            <div className="card card-flush">
              {perf.data.recent.filter((r) => tab === "all" || r.status === tab).map((r, i) => (
                <Link key={r.id} href={`/matches/${encodeURIComponent(r.fixtureId)}`} className="row between" style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : 0 }}>
                  <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 620 }}>{r.homeName} vs {r.awayName}</span>
                    <span className="subtle">{r.competition} · {kickoffDate(r.kickoffAt)} · {r.label} · {pct(r.probability)}</span>
                  </div>
                  <span className="status" data-s={r.status}>{r.status.toUpperCase()}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="stack">
        <h2>My saved slips</h2>
        {!session ? (
          <Empty title="Sign in to see your saved predictions" action={<Link className="btn btn-sm" href="/profile?next=/history">Sign in</Link>} />
        ) : slips.loading ? <CardSkeletons n={2} /> : slips.error ? <ErrorState message={slips.error.message} onRetry={slips.reload} /> : slips.data!.slips.length === 0 ? (
          <Empty title="No saved slips yet" action={<Link className="btn btn-sm" href="/matches">Pick a game</Link>} />
        ) : (
          <div className="grid-cards">{slips.data!.slips.map((s) => <SlipCard key={s.id} s={s} onDeleted={slips.reload} />)}</div>
        )}
      </section>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: PerformanceResponse["byMarket"] }) {
  return (
    <div className="card stack">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th></th><th>Settled</th><th>W–L</th><th>Win rate</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><td>{r.key}</td><td>{r.summary.settled}</td><td>{r.summary.won}–{r.summary.lost}</td><td>{pct(r.summary.winRate, 1)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
