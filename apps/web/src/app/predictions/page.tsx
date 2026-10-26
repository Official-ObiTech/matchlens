"use client";
import { MARKET_LABEL, localToday, pct, type DataQualityGrade, type MarketId, type SlipSelection, type StrongestResponse } from "@fpp/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import { useToast } from "@/components/Toast";
import { CardSkeletons, Empty, ErrorState, Notice, QualityBadge } from "@/components/ui";
import { api, tzOffset } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { useSlip } from "@/lib/client/slipStore";

const THRESHOLDS = [0.75, 0.8, 0.85, 0.9];

export default function PredictionsPage() {
  const [day, setDay] = useState<0 | 1>(0);
  const [minProbability, setMin] = useState(0.75);
  const [market, setMarket] = useState<MarketId | "">("");
  const [minQuality, setQuality] = useState<DataQualityGrade | "">("");
  const [competition, setCompetition] = useState("");
  const date = useMemo(() => localToday(day), [day]);
  const params = { date, tz: tzOffset(), minProbability, market, minQuality, competition };
  const res = useApi(`strongest:${JSON.stringify(params)}`, () => api<StrongestResponse>("/predictions/strongest", { params }));
  const comps = useMemo(() => [...new Map((res.data?.picks ?? []).map((p) => [p.competition.id, p.competition.name])).entries()], [res.data]);

  return (
    <div className="stack-lg">
      <section className="stack">
        <h1>Today’s Strongest Predictions</h1>
        <p className="muted" style={{ margin: 0 }}>
          Ranked by estimated probability weighted by model confidence. Only selections that pass every filter are shown — there is no fixed number of picks.
        </p>
        <div className="card stack">
          <div className="stack" style={{ gap: 6 }}>
            <b>High Confidence mode — minimum estimated probability</b>
            <div className="chips" role="group" aria-label="Minimum estimated probability">
              {THRESHOLDS.map((t) => <button key={t} className="chip" aria-pressed={minProbability === t} onClick={() => setMin(t)}>{Math.round(t * 100)}%+</button>)}
            </div>
            <span className="subtle">Thresholds filter the model’s estimates; they are not guarantees. Higher thresholds usually mean fewer picks.</span>
          </div>
          <div className="row-wrap">
            <div className="chips" role="group" aria-label="Day">
              <button className="chip" aria-pressed={day === 0} onClick={() => setDay(0)}>Today</button>
              <button className="chip" aria-pressed={day === 1} onClick={() => setDay(1)}>Tomorrow</button>
            </div>
            <select className="select" style={{ width: "auto" }} value={market} onChange={(e) => setMarket(e.target.value as MarketId | "")} aria-label="Market">
              <option value="">All markets</option>
              {(["1X2", "DOUBLE_CHANCE", "DRAW_NO_BET", "TOTAL_GOALS", "BTTS", "HOME_TEAM_GOALS", "AWAY_TEAM_GOALS"] as MarketId[]).map((m) => <option key={m} value={m}>{MARKET_LABEL[m]}</option>)}
            </select>
            <select className="select" style={{ width: "auto" }} value={minQuality} onChange={(e) => setQuality(e.target.value as DataQualityGrade | "")} aria-label="Minimum data quality">
              <option value="">Any data quality</option>
              <option value="A">A only</option>
              <option value="B">B or better</option>
              <option value="C">C or better</option>
            </select>
            <select className="select" style={{ width: "auto" }} value={competition} onChange={(e) => setCompetition(e.target.value)} aria-label="Competition">
              <option value="">All competitions</option>
              {competition && !comps.some(([id]) => id === competition) && <option value={competition}>Selected</option>}
              {comps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        </div>
        {res.loading ? <CardSkeletons /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.picks.length === 0 ? (
          <Empty title="No selections meet these criteria">{res.data!.notices.filter((n) => !n.startsWith("No available")).join(" ") || "Try a lower threshold or another day. The model does not lower its standards to fill the list."}</Empty>
        ) : (
          <>
            <span className="subtle">{res.data!.picks.length} selection{res.data!.picks.length === 1 ? "" : "s"} qualify.</span>
            <div className="grid-cards">{res.data!.picks.map((p) => <MatchCard key={p.id} f={p} />)}</div>
          </>
        )}
      </section>
      <BuildMySlip date={date} minProbability={minProbability} />
    </div>
  );
}

function BuildMySlip({ date, minProbability }: { date: string; minProbability: number }) {
  const [max, setMax] = useState(3);
  const [requested, setRequested] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const slip = useSlip();
  const toast = useToast((s) => s.show);
  const res = useApi(requested == null ? null : `suggest:${date}:${minProbability}:${requested}`, () =>
    api<StrongestResponse>("/slip/suggest", { params: { date, tz: tzOffset(), minProbability, max: requested! } }),
  );
  const kept = (res.data?.picks ?? []).filter((p) => !excluded.has(p.id));

  const toSel = (p: StrongestResponse["picks"][number]): SlipSelection => ({
    fixtureId: p.id,
    homeName: p.home.name,
    awayName: p.away.name,
    competition: p.competition.name,
    kickoffAt: p.kickoffAt,
    market: p.pick.market,
    outcome: p.pick.outcome,
    ...(p.pick.line != null ? { line: p.pick.line } : {}),
    label: p.pick.label,
    probability: p.pick.probability,
    dataQuality: p.pick.dataQuality,
    modelVersion: p.modelVersion ?? "unknown",
    addedAt: new Date().toISOString(),
  });

  return (
    <section className="stack" id="build">
      <div className="section-head"><h2>Build My Slip</h2></div>
      <div className="card stack">
        <div className="row-wrap">
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            Up to
            <select className="select" style={{ width: 80 }} value={max} onChange={(e) => setMax(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            selections at {Math.round(minProbability * 100)}%+
          </label>
          <button className="btn btn-primary" onClick={() => { setExcluded(new Set()); setRequested(max); }}>Suggest selections</button>
        </div>
        <span className="subtle">The suggestion uses the same engine and filters as above. If fewer selections qualify than you asked for, you get fewer — never filler.</span>
        {requested != null && (res.loading ? <CardSkeletons n={2} /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.picks.length === 0 ? (
          <Notice tone="warn">No eligible selections right now. You can still add your own games from the match list.</Notice>
        ) : (
          <div className="stack">
            {res.data!.picks.length < requested && <Notice>Only {res.data!.picks.length} selection{res.data!.picks.length === 1 ? "" : "s"} met the criteria.</Notice>}
            {res.data!.picks.map((p) => {
              const out = excluded.has(p.id);
              return (
                <div key={p.id} className="row between" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)", opacity: out ? 0.5 : 1 }}>
                  <div className="stack" style={{ gap: 3, minWidth: 0 }}>
                    <Link href={`/matches/${encodeURIComponent(p.id)}`} style={{ fontWeight: 650 }}>{p.home.name} vs {p.away.name}</Link>
                    <span className="subtle">{p.pick.label} · {pct(p.pick.probability)} · <QualityBadge grade={p.pick.dataQuality} /></span>
                  </div>
                  <button className="btn btn-sm" onClick={() => setExcluded((s) => { const n = new Set(s); out ? n.delete(p.id) : n.add(p.id); return n; })}>{out ? "Keep" : "Remove"}</button>
                </div>
              );
            })}
            <div className="row-wrap">
              <button className="btn btn-primary" disabled={kept.length === 0} onClick={() => {
                let added = 0;
                for (const p of kept) if (slip.add(toSel(p)) !== "full") added++;
                toast(`${added} selection${added === 1 ? "" : "s"} added to your slip.`);
              }}>Add {kept.length} to slip</button>
              <Link className="btn" href="/matches">Add my own games</Link>
            </div>
            <span className="subtle">A suggestion, not a guarantee. Each extra selection makes it less likely that every pick is correct.</span>
          </div>
        ))}
      </div>
    </section>
  );
}
