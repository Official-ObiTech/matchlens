"use client";
import {
  ABSTAIN_MESSAGES,
  MARKET_LABEL,
  NO_RELIABLE_PREDICTION,
  STATUS_LABEL,
  kickoffDate,
  kickoffTime,
  pct,
  selectionKey,
  type MarketProbability,
  type MatchDetailDto,
  type SlipSelection,
  type TeamSummary,
} from "@fpp/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Crest, Empty, ErrorState, FormDots, Notice, ProbBar, QualityBadge, Skeleton } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { useSlip } from "@/lib/client/slipStore";

export function MatchView({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const slip = useSlip();
  const res = useApi(`match:${id}`, () => api<MatchDetailDto>(`/matches/${encodeURIComponent(id)}`));
  const [chosenKey, setChosenKey] = useState<string | null>(null);

  const d = res.data;
  const run = d?.run ?? null;
  const rec = run?.recommendation ?? null;
  const upcoming = d ? (d.fixture.status === "scheduled" || d.fixture.status === "tbd") && new Date(d.fixture.kickoffAt) > new Date() : false;
  const onSlip = slip.selections.find((s) => s.fixtureId === id);

  const chosen: MarketProbability | null = useMemo(() => {
    if (!run) return null;
    const key = chosenKey ?? (onSlip ? selectionKey(onSlip) : rec ? selectionKey(rec) : null);
    return run.markets.find((m) => selectionKey(m) === key) ?? null;
  }, [run, chosenKey, rec, onSlip]);
  const chosenRec = chosen && rec && selectionKey(chosen) === selectionKey(rec) ? rec : run?.alternatives.find((a) => chosen && selectionKey(a) === selectionKey(chosen)) ?? null;

  if (res.loading)
    return (
      <div className="stack">
        <div className="card stack"><Skeleton h={14} w="40%" /><Skeleton h={56} /></div>
        <div className="card stack"><Skeleton h={18} w="60%" /><Skeleton h={40} /><Skeleton h={44} /></div>
      </div>
    );
  if (res.error) return <ErrorState message={res.error.message} onRetry={res.reload} />;
  if (!d) return null;
  const f = d.fixture;

  const toSelection = (m: MarketProbability): SlipSelection => ({
    fixtureId: id,
    homeName: f.home.name,
    awayName: f.away.name,
    competition: f.competition.name,
    kickoffAt: f.kickoffAt,
    market: m.market,
    outcome: m.outcome,
    ...(m.line != null ? { line: m.line } : {}),
    label: m.label,
    probability: m === chosen && chosenRec ? chosenRec.calibratedProbability : m.probability,
    dataQuality: run!.quality.grade,
    modelVersion: run!.modelVersion,
    addedAt: new Date().toISOString(),
  });

  const addToSlip = (then: "slip" | "browse") => {
    if (!chosen) return;
    const r = slip.add(toSelection(chosen));
    if (r === "full") return toast("Your slip is full. Remove a selection first.");
    if (then === "slip") return router.push("/slip");
    toast(r === "replaced" ? "Selection updated. Pick another game." : r === "unchanged" ? "Already on your slip. Pick another game." : "Added to slip. Pick another game.");
    router.push("/matches");
  };

  const groups = groupMarkets(run?.markets ?? []);

  return (
    <div className="stack">
      <section className="card stack">
        <div className="match-meta">
          <span className="comp"><Crest src={f.competition.logoUrl} name={f.competition.name} /><span>{f.competition.name}{f.competition.country ? ` · ${f.competition.country}` : ""}</span></span>
          <span className="status" data-s={f.status}>{STATUS_LABEL[f.status]}</span>
        </div>
        <div className="hero">
          <div className="side"><Crest src={f.home.logoUrl} name={f.home.name} large /><span>{f.home.name}</span></div>
          <div className="mid">{f.score ? `${f.score.home ?? "-"} – ${f.score.away ?? "-"}` : kickoffTime(f.kickoffAt)}</div>
          <div className="side"><Crest src={f.away.logoUrl} name={f.away.name} large /><span>{f.away.name}</span></div>
        </div>
        <p className="subtle" style={{ textAlign: "center", margin: 0 }}>{kickoffDate(f.kickoffAt)} · {kickoffTime(f.kickoffAt)}{f.venue ? ` · ${f.venue}` : ""}</p>
      </section>

      {d.notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}

      {d.published && (
        <Notice>
          Tracked prediction: <b>{d.published.label}</b> at {pct(d.published.probability)} (published {new Date(d.published.publishedAt).toLocaleString()}) — {d.published.status === "pending" ? "awaiting result" : <b>{d.published.status.toUpperCase()}</b>}.
        </Notice>
      )}

      {!run ? (
        <Empty title={upcoming ? "Analysis not available yet" : "No analysis"}>{upcoming ? "This match has not been analysed yet. Data for its competition may still be synchronising." : NO_RELIABLE_PREDICTION}</Empty>
      ) : (
        <>
          <section className={`card stack${rec ? " rec" : ""}`}>
            <div className="section-head"><h2>Recommended prediction</h2><QualityBadge grade={run.quality.grade} /></div>
            {rec ? (
              <>
                <div className="row between" style={{ alignItems: "flex-end" }}>
                  <div className="stack" style={{ gap: 3 }}>
                    <span className="subtle">{MARKET_LABEL[rec.market]}</span>
                    <span style={{ fontSize: "1.25rem", fontWeight: 760 }}>{rec.label}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="rec-prob">{pct(rec.calibratedProbability)}</div>
                    <span className="subtle">estimated probability</span>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="subtle">Model confidence {pct(rec.modelConfidence)}</span>
                    <ProbBar value={rec.modelConfidence} />
                  </div>
                  <span className="subtle">
                    {rec.calibrated ? "Adjusted using this model’s settled track record." : "Not yet calibrated: too few settled predictions in this range."} Inputs as of{" "}
                    {run.inputDataAt ? new Date(run.inputDataAt).toLocaleDateString() : "–"}.
                  </span>
                </div>
                <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: "0.9rem" }}>
                  {rec.reasoning.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <b>{NO_RELIABLE_PREDICTION}</b>
                <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>{run.abstainReasons.map((r) => <li key={r}>{ABSTAIN_MESSAGES[r]}</li>)}</ul>
              </div>
            )}
            <span className="subtle">Estimated probability is the model’s chance of the outcome. Model confidence reflects how much the inputs support that estimate. Neither is a guarantee.</span>
          </section>

          {run.markets.length > 0 && (
            <section className="card stack">
              <div className="section-head"><h2>Probability overview</h2>{run.expectedGoals && <span className="subtle num">xG (model) {run.expectedGoals.home.toFixed(2)} – {run.expectedGoals.away.toFixed(2)}</span>}</div>
              <OneXTwo markets={run.markets} home={f.home.name} away={f.away.name} />
              <span className="subtle">Tap a market to select it for your slip{rec ? "" : " (none currently meets the recommendation criteria)"}.</span>
              {groups.map(([market, items]) => (
                <details key={market} open={market === "1X2" || market === "TOTAL_GOALS" || market === "BTTS" || items.some((m) => chosen && selectionKey(m) === selectionKey(chosen))}>
                  <summary>{MARKET_LABEL[market]} <span className="count">{items.length}</span></summary>
                  <div role="radiogroup" aria-label={MARKET_LABEL[market]}>
                    {items.map((m) => {
                      const k = selectionKey(m);
                      const sel = chosen != null && selectionKey(chosen) === k;
                      return (
                        <button
                          key={k}
                          role="radio"
                          aria-checked={sel}
                          disabled={!upcoming || m.market === "CORRECT_SCORE"}
                          onClick={() => setChosenKey(k)}
                          className="prob-row"
                          style={{ width: "100%", background: sel ? "var(--accent-soft)" : "transparent", border: 0, borderRadius: 8, padding: "8px 8px", color: "inherit", cursor: upcoming ? "pointer" : "default", textAlign: "left" }}
                        >
                          <span>{m.label}{m.pushProbability ? <span className="subtle"> (void if draw: {pct(m.pushProbability)})</span> : null}</span>
                          <ProbBar value={m.probability} />
                          <span className="v">{pct(m.probability)}</span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
              {run.quality.unavailable.length > 0 && <span className="subtle">Not available from the current data source and not used: {run.quality.unavailable.join(", ")}.</span>}
            </section>
          )}

          {(run.home || run.away) && (
            <section className="card stack">
              <h2>Team analysis</h2>
              <div className="grid-2">
                {run.home && <TeamPanel name={f.home.name} t={run.home} side="home" />}
                {run.away && <TeamPanel name={f.away.name} t={run.away} side="away" />}
              </div>
              <h3>Head to head <span className="subtle">(stored results in this competition)</span></h3>
              {run.headToHead.length === 0 ? (
                <span className="subtle">No recent meetings in the available data.</span>
              ) : (
                <div className="table-wrap">
                  <table className="t">
                    <tbody>
                      {run.headToHead.map((m) => (
                        <tr key={m.fixtureId}>
                          <td>{new Date(m.date).toLocaleDateString()}</td>
                          <td>{m.homeTeamId === f.home.id ? f.home.name : f.away.name}</td>
                          <td className="num" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{m.homeGoals}–{m.awayGoals}</td>
                          <td>{m.awayTeamId === f.home.id ? f.home.name : f.away.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <span className="subtle">Data quality {run.quality.grade}: {run.quality.homeMatches} and {run.quality.awayMatches} results for the teams, {run.quality.leagueMatches} in the competition. {run.quality.notes.join(" ")}</span>
            </section>
          )}
        </>
      )}

      {upcoming && run && (
        <div className="sticky-actions">
          {chosen ? (
            <div className="card stack" style={{ gap: 10 }}>
              <div className="row between">
                <span><span className="subtle">Selected: </span><b>{chosen.label}</b></span>
                <b className="num">{pct(chosenRec ? chosenRec.calibratedProbability : chosen.probability)}</b>
              </div>
              {!chosenRec && <span className="subtle">This selection does not meet the model’s recommendation criteria.</span>}
              <div className="actions">
                <button className="btn btn-primary" onClick={() => addToSlip("slip")}>PLAY THIS PICK</button>
                <button className="btn" onClick={() => addToSlip("browse")}>ADD ANOTHER GAME</button>
              </div>
            </div>
          ) : (
            <div className="card row between">
              <span className="muted">Select a market above to add this game to your slip.</span>
              <Link className="btn btn-sm" href="/matches">Browse matches</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OneXTwo({ markets, home, away }: { markets: MarketProbability[]; home: string; away: string }) {
  const p = (o: string) => markets.find((m) => m.market === "1X2" && m.outcome === o)?.probability ?? 0;
  const [h, d, a] = [p("HOME"), p("DRAW"), p("AWAY")];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="split3" aria-hidden>
        <i style={{ width: `${h * 100}%` }} />
        <i style={{ width: `${d * 100}%` }} />
        <i style={{ width: `${a * 100}%` }} />
      </div>
      <div className="row between subtle num">
        <span>{home} {pct(h)}</span>
        <span>Draw {pct(d)}</span>
        <span>{away} {pct(a)}</span>
      </div>
    </div>
  );
}

function TeamPanel({ name, t, side }: { name: string; t: TeamSummary; side: "home" | "away" }) {
  const v = side === "home" ? t.home : t.away;
  const per = (x: number, n: number) => (n ? (x / n).toFixed(2) : "–");
  return (
    <div className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
      <div className="row between"><b>{name}</b>{t.position != null && <span className="subtle">#{t.position} (computed)</span>}</div>
      <FormDots form={t.form} />
      <table className="t">
        <tbody>
          <tr><td>Record (W-D-L)</td><td className="num">{t.wins}-{t.draws}-{t.losses}</td></tr>
          <tr><td>Goals per game</td><td className="num">{per(t.goalsFor, t.played)} for / {per(t.goalsAgainst, t.played)} against</td></tr>
          <tr><td>{side === "home" ? "At home" : "Away"}</td><td className="num">{per(v.goalsFor, v.played)} / {per(v.goalsAgainst, v.played)} ({v.played} games)</td></tr>
          <tr><td>Clean sheets</td><td className="num">{t.cleanSheets} / {t.played}</td></tr>
          <tr><td>Failed to score</td><td className="num">{t.failedToScore} / {t.played}</td></tr>
          <tr><td title="1.00 = league average. Higher attack is better; lower defence (goals conceded) is better.">Attack / defence (1.00 = avg)</td><td className="num">{t.attack?.toFixed(2) ?? "–"} / {t.defence?.toFixed(2) ?? "–"}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function groupMarkets(ms: MarketProbability[]): [MarketProbability["market"], MarketProbability[]][] {
  const m = new Map<MarketProbability["market"], MarketProbability[]>();
  for (const x of ms) m.set(x.market, [...(m.get(x.market) ?? []), x]);
  return [...m.entries()];
}
