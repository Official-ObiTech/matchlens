import { pct, type PerformanceResponse } from "@fpp/core";
import { Notice } from "@/components/ui";

/** Headline track record. Below the minimum sample it is explicitly labelled as not yet meaningful. */
export function PerformanceKpis({ p }: { p: PerformanceResponse }) {
  const o = p.overall;
  const enough = o.settled >= p.minSampleForClaims;
  return (
    <div className="card stack">
      <div className="kpis">
        <div className="kpi"><span className="v">{o.total}</span><span className="l">Published</span></div>
        <div className="kpi"><span className="v">{o.settled}</span><span className="l">Settled</span></div>
        <div className="kpi"><span className="v">{o.won}–{o.lost}</span><span className="l">Won–Lost</span></div>
        <div className="kpi"><span className="v">{o.winRate == null ? "–" : pct(o.winRate, 1)}</span><span className="l">Actual win rate</span></div>
        <div className="kpi"><span className="v">{o.meanPredicted == null ? "–" : pct(o.meanPredicted, 1)}</span><span className="l">Avg. estimated</span></div>
        <div className="kpi"><span className="v">{o.brier == null ? "–" : o.brier.toFixed(3)}</span><span className="l">Brier score</span></div>
      </div>
      {o.winRateInterval && <span className="subtle">95% interval for the true win rate: {pct(o.winRateInterval[0], 1)} – {pct(o.winRateInterval[1], 1)}. Voids and pending predictions are excluded.</span>}
      {!enough && <Notice tone="warn">Only {o.settled} settled predictions so far. At least {p.minSampleForClaims} are needed before the win rate says much about the model.</Notice>}
    </div>
  );
}
