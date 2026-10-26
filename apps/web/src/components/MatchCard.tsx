import { STATUS_LABEL, kickoffDate, kickoffTime, pct, type FixtureListItem } from "@fpp/core";
import Link from "next/link";
import { Crest, QualityBadge } from "./ui";

export function MatchCard({ f, showDate }: { f: FixtureListItem; showDate?: boolean }) {
  const started = f.status !== "scheduled" && f.status !== "tbd";
  return (
    <Link href={`/matches/${encodeURIComponent(f.id)}`} className="card card-link match">
      <div className="match-meta">
        <span className="comp"><Crest src={f.competition.logoUrl} name={f.competition.name} /><span>{f.competition.name}</span></span>
        <span className="num">
          {started ? <span className="status" data-s={f.status}>{STATUS_LABEL[f.status]}</span> : `${showDate ? `${kickoffDate(f.kickoffAt)} · ` : ""}${f.status === "tbd" ? "TBC" : kickoffTime(f.kickoffAt)}`}
        </span>
      </div>
      <div className="teams">
        <div className="team"><Crest src={f.home.logoUrl} name={f.home.name} /><span>{f.home.name}</span></div>
        <div className="score">{f.score?.home ?? ""}</div>
        <div className="team"><Crest src={f.away.logoUrl} name={f.away.name} /><span>{f.away.name}</span></div>
        <div className="score">{f.score?.away ?? ""}</div>
      </div>
      {f.pick ? (
        <div className="pick">
          <div className="stack" style={{ gap: 4 }}>
            <span className="pick-label">{f.pick.label}</span>
            <QualityBadge grade={f.pick.dataQuality} />
          </div>
          <span className="pick-prob" title="Estimated probability">{pct(f.pick.probability)}</span>
        </div>
      ) : (
        <div className="pick pick-none">
          {f.predictionState === "abstained" ? "No sufficiently reliable prediction" : started ? "Not analysed before kickoff" : "Analysis not generated yet"}
        </div>
      )}
    </Link>
  );
}
