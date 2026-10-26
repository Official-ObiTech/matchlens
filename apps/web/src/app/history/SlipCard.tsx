"use client";
import { kickoffDate, pct, type SavedSlipDto } from "@fpp/core";
import Link from "next/link";
import { api } from "@/lib/client/api";

export function SlipCard({ s, onDeleted }: { s: SavedSlipDto; onDeleted?: () => void }) {
  return (
    <div className="card stack">
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <b>{s.name ?? (s.selections.length === 1 ? "Single prediction" : `${s.selections.length}-game slip`)}</b>
          <span className="subtle">Saved {new Date(s.createdAt).toLocaleString()}</span>
        </div>
        <span className="status" data-s={s.status}>{s.status.toUpperCase()}</span>
      </div>
      {s.selections.map((x) => (
        <Link key={x.fixtureId} href={`/matches/${encodeURIComponent(x.fixtureId)}`} className="row between" style={{ padding: "8px 10px", borderRadius: 9, background: "var(--surface-2)" }}>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{x.homeName} vs {x.awayName}{x.score ? ` · ${x.score.home}–${x.score.away}` : ""}</span>
            <span className="subtle">{kickoffDate(x.kickoffAt)} · {x.label}{x.probability != null ? ` · ${pct(x.probability)}` : ""}</span>
          </div>
          <span className="status" data-s={x.status}>{x.status.toUpperCase()}</span>
        </Link>
      ))}
      {onDeleted && (
        <div className="row-wrap">
          {s.shareToken && <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(`${location.origin}/s/${s.shareToken}`)}>Copy share link</button>}
          <button className="btn btn-sm btn-ghost btn-danger" onClick={async () => { if (confirm("Delete this slip?")) { await api(`/slips/${s.id}`, { method: "DELETE" }); onDeleted(); } }}>Delete</button>
        </div>
      )}
    </div>
  );
}
