"use client";
import { MARKET_LABEL, pct, type PerformanceResponse } from "@fpp/core";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { CardSkeletons, Empty, ErrorState, Notice } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/client/api";
import { useApi, useSession } from "@/lib/client/hooks";
import { PerformanceKpis } from "../history/PerformanceKpis";

interface Overview {
  config: Record<string, boolean | string | number>;
  provider: string;
  settings: { providerEnabled: boolean; modelEnabled: boolean; reserveFraction: number };
  counts: { users: number; fixtures: number; pendingSettlement: number; abstentionsLast24h: number };
  apiUsage: { provider: string; day: string; requests: number; failures: number; last_remaining: number | null }[];
  jobs: { id: number; job: string; status: string; started_at: string; finished_at: string | null; error: string | null; details: Record<string, unknown> }[];
  failedJobs: Overview["jobs"];
  models: { id: string; description: string; is_enabled: boolean; created_at: string }[];
  dataFreshness: string | null;
  performance: PerformanceResponse;
}

/** Access is enforced by the API (server-side role check); this page only renders what it is given. */
export default function AdminPage() {
  const { session, ready } = useSession();
  const res = useApi(session ? "admin" : null, () => api<Overview>("/admin/overview"));
  const toast = useToast((s) => s.show);
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (!session) return <Empty title="Sign in required" />;
  if (res.loading) return <CardSkeletons n={4} />;
  if (res.error) return res.error.status === 403 ? <Empty title="Administrator access required" /> : <ErrorState message={res.error.message} onRetry={res.reload} />;
  const d = res.data!;

  const update = async (body: Record<string, unknown>) => {
    await api("/admin/settings", { method: "POST", body });
    res.reload();
  };
  const run = async (job: string) => {
    setBusy(job);
    try {
      const r = await api<{ status: string; details: Record<string, unknown> }>("/admin/jobs", { method: "POST", body: { job } });
      toast(`${job}: ${r.status}`);
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : `${job} failed`);
    } finally {
      setBusy(null);
      res.reload();
    }
  };

  return (
    <div className="stack-lg">
      <h1>Admin</h1>
      {Object.entries(d.config).filter(([, v]) => v === false).map(([k]) => <Notice key={k} tone="warn">Not configured: {k}</Notice>)}

      <section className="card stack">
        <h2>Operations</h2>
        <div className="kpis">
          <div className="kpi"><span className="v">{d.counts.users}</span><span className="l">Users</span></div>
          <div className="kpi"><span className="v">{d.counts.fixtures}</span><span className="l">Fixtures stored</span></div>
          <div className="kpi"><span className="v">{d.counts.pendingSettlement}</span><span className="l">Awaiting settlement</span></div>
          <div className="kpi"><span className="v">{d.counts.abstentionsLast24h}</span><span className="l">Abstentions 24h</span></div>
        </div>
        <span className="subtle">Provider: {d.provider}. Latest fixture update: {d.dataFreshness ? new Date(d.dataFreshness).toLocaleString() : "never"}.</span>
        <div className="row-wrap">
          {(["sync", "predict", "settle", "reminders"] as const).map((j) => (
            <button key={j} className="btn btn-sm" disabled={busy != null} onClick={() => run(j)}>{busy === j ? "Running…" : `Run ${j}`}</button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Kill switches</h2>
        <label className="row between"><span><b>Football data provider</b><br /><span className="subtle">When off, the app serves stored data only.</span></span>
          <input type="checkbox" checked={d.settings.providerEnabled} onChange={(e) => update({ providerEnabled: e.target.checked })} style={{ width: 22, height: 22 }} /></label>
        <label className="row between"><span><b>Prediction model</b><br /><span className="subtle">When off, no new predictions are generated or published.</span></span>
          <input type="checkbox" checked={d.settings.modelEnabled} onChange={(e) => update({ modelEnabled: e.target.checked })} style={{ width: 22, height: 22 }} /></label>
        <label className="field">Quota reserved for result settlement ({pct(d.settings.reserveFraction)})
          <input type="range" min={0} max={0.5} step={0.05} value={d.settings.reserveFraction} onChange={(e) => update({ reserveFraction: Number(e.target.value) })} /></label>
      </section>

      <section className="card stack">
        <h2>API usage (last 14 days)</h2>
        {d.apiUsage.length === 0 ? <span className="subtle">No requests recorded.</span> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Day</th><th>Provider</th><th>Requests</th><th>Failures</th><th>Remaining (reported)</th></tr></thead>
            <tbody>{d.apiUsage.map((u) => <tr key={`${u.provider}${u.day}`}><td>{u.day}</td><td>{u.provider}</td><td>{u.requests}</td><td>{u.failures}</td><td>{u.last_remaining ?? "–"}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="card stack">
        <h2>Jobs</h2>
        {d.failedJobs.length > 0 && <Notice tone="danger">{d.failedJobs.length} recent job{d.failedJobs.length > 1 ? "s" : ""} failed or partially failed.</Notice>}
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Job</th><th>Status</th><th>Started</th><th>Notes</th></tr></thead>
          <tbody>{d.jobs.map((j) => (
            <tr key={j.id}><td>{j.job}</td><td><span className="status" data-s={j.status === "ok" ? "won" : j.status === "failed" ? "lost" : ""}>{j.status}</span></td><td>{new Date(j.started_at).toLocaleString()}</td>
              <td className="subtle" style={{ maxWidth: 420 }}>{j.error ?? (Array.isArray(j.details.errors) && j.details.errors.length ? (j.details.errors as string[]).slice(0, 3).join(" · ") : summarise(j.details))}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="stack">
        <h2>Model performance</h2>
        <PerformanceKpis p={d.performance} />
        <div className="card table-wrap"><table className="t">
          <thead><tr><th>Market</th><th>Settled</th><th>Win rate</th><th>Avg est.</th><th>Brier</th></tr></thead>
          <tbody>{d.performance.byMarket.map((m) => <tr key={m.key}><td>{MARKET_LABEL[m.key] ?? m.key}</td><td>{m.summary.settled}</td><td>{pct(m.summary.winRate, 1)}</td><td>{pct(m.summary.meanPredicted, 1)}</td><td>{m.summary.brier?.toFixed(3) ?? "–"}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="card stack">
        <h2>Model versions</h2>
        {d.models.map((m) => (
          <label key={m.id} className="row between" style={{ gap: 16 }}>
            <span><b>{m.id}</b><br /><span className="subtle">{m.description}</span></span>
            <input type="checkbox" checked={m.is_enabled} onChange={(e) => update({ modelVersion: { id: m.id, enabled: e.target.checked } })} style={{ width: 22, height: 22 }} />
          </label>
        ))}
      </section>
    </div>
  );
}

function summarise(d: Record<string, unknown>) {
  return Object.entries(d).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k}: ${v}`).join(", ");
}
