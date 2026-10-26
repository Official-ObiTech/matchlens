"use client";
import { MARKET_LABEL, independentCombinedProbability, kickoffDate, kickoffTime, pct } from "@fpp/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PlusIcon, XIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { Empty, Notice, QualityBadge } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/client/api";
import { useSession } from "@/lib/client/hooks";
import { useSlip } from "@/lib/client/slipStore";

export default function SlipPage() {
  const slip = useSlip();
  const { session, configured } = useSession();
  const toast = useToast((s) => s.show);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; shareToken: string } | null>(null);
  const [name, setName] = useState("");
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return null;

  const sels = slip.selections;
  const combined = independentCombinedProbability(sels);
  const started = sels.filter((s) => new Date(s.kickoffAt) <= new Date());

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<{ id: string; shareToken: string }>("/slips", {
        method: "POST",
        body: { name: name.trim() || undefined, selections: sels.map((s) => ({ fixtureId: s.fixtureId, market: s.market, outcome: s.outcome, ...(s.line != null ? { line: s.line } : {}) })) },
      });
      setSaved(res);
      slip.clear();
      toast("Prediction saved. We’ll track the result.");
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const share = async (url?: string) => {
    const text = url
      ? `My MatchLens prediction slip: ${url}`
      : `My MatchLens picks:\n${sels.map((s) => `• ${s.homeName} vs ${s.awayName}: ${s.label} (${pct(s.probability)})`).join("\n")}`;
    try {
      if (navigator.share) await navigator.share({ text, ...(url ? { url } : {}) });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard.");
      }
    } catch {
      /* user cancelled */
    }
  };

  if (saved)
    return (
      <div className="card empty">
        <h3>Prediction saved</h3>
        <p>It will be settled automatically after the match{sels.length > 1 ? "es" : ""} finish.</p>
        <div className="row-wrap" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/history">View my predictions</Link>
          <button className="btn" onClick={() => share(`${location.origin}/s/${saved.shareToken}`)}>Share slip</button>
          <button className="btn" onClick={() => setSaved(null)}>New slip</button>
        </div>
      </div>
    );

  if (sels.length === 0)
    return (
      <Empty title="Your slip is empty" action={<div className="row-wrap" style={{ justifyContent: "center" }}><Link className="btn btn-primary" href="/matches">Browse matches</Link><Link className="btn" href="/predictions#build">Build my slip</Link></div>}>
        Pick a game, review the analysis, and play that pick on its own or add more games.
      </Empty>
    );

  return (
    <div className="stack">
      <div className="section-head">
        <h1>My Slip</h1>
        <button className="btn btn-sm btn-ghost btn-danger" onClick={() => { if (confirm("Remove all selections?")) slip.clear(); }}>Clear slip</button>
      </div>
      {sels.length === 1 && <Notice>A single-game prediction is complete on its own. You can save it now or add more games.</Notice>}
      {started.length > 0 && <Notice tone="danger">{started.length} selection{started.length > 1 ? "s have" : " has"} already kicked off and can’t be saved. Remove {started.length > 1 ? "them" : "it"} to continue.</Notice>}

      <div className="card card-flush">
        {sels.map((s, i) => (
          <div key={s.fixtureId} className="stack" style={{ gap: 6, padding: "14px 16px", borderTop: i ? "1px solid var(--border)" : 0 }}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="subtle">{s.competition} · {kickoffDate(s.kickoffAt)} {kickoffTime(s.kickoffAt)}</span>
                <b>{s.homeName} vs {s.awayName}</b>
              </div>
              <button className="btn btn-sm btn-ghost" aria-label={`Remove ${s.homeName} vs ${s.awayName}`} onClick={() => slip.remove(s.fixtureId)}><XIcon size={18} /></button>
            </div>
            <div className="pick">
              <div className="stack" style={{ gap: 3 }}>
                <span className="subtle">{MARKET_LABEL[s.market]}</span>
                <span className="pick-label">{s.label}</span>
              </div>
              <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                <span className="pick-prob">{pct(s.probability)}</span>
                <QualityBadge grade={s.dataQuality} />
              </div>
            </div>
            <Link href={`/matches/${encodeURIComponent(s.fixtureId)}`} className="subtle" style={{ color: "var(--accent)", fontWeight: 600 }}>Review analysis / change market</Link>
          </div>
        ))}
      </div>

      <Link className="btn" href="/matches"><PlusIcon size={18} /> Add another game</Link>

      {combined != null && (
        <div className="card stack" style={{ gap: 6 }}>
          <div className="row between"><b>All {sels.length} correct (rough estimate)</b><b className="num">{pct(combined, 1)}</b></div>
          <span className="subtle">
            Multiplies the individual probabilities, assuming the matches are independent. This is an approximation, not a reliable figure. Each added selection lowers the chance that every pick is correct.
          </span>
        </div>
      )}

      <div className="card stack">
        <label className="field">Name (optional)<input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saturday picks" /></label>
        {!configured ? (
          <Notice tone="warn">Accounts are not configured on this server, so predictions can’t be saved yet. Your slip is kept on this device.</Notice>
        ) : !session ? (
          <Notice>Your slip is saved on this device. <Link href="/profile?next=/slip" style={{ fontWeight: 700, textDecoration: "underline" }}>Sign in</Link> to save it as a prediction and track the result.</Notice>
        ) : null}
        <div className="actions">
          <button className="btn btn-primary" disabled={!session || saving || started.length > 0} onClick={save}>{saving ? "Saving…" : sels.length === 1 ? "Save prediction" : `Save ${sels.length} predictions`}</button>
          <button className="btn" onClick={() => share()}>Share slip</button>
        </div>
      </div>
    </div>
  );
}
