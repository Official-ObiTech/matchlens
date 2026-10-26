import { QUALITY_LABEL, type DataQualityGrade } from "@fpp/core";
import type { ReactNode } from "react";

export function Crest({ src, name, large }: { src: string | null; name: string; large?: boolean }) {
  const cls = large ? "crest crest-lg" : "crest";
  if (!src) {
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
    return <span className={`crest-fallback${large ? " crest-lg" : ""}`} aria-hidden>{initials}</span>;
  }
  // Provider-hosted logos; plain <img> keeps them off our image-optimisation quota.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cls} src={src} alt="" loading="lazy" width={large ? 52 : 24} height={large ? 52 : 24} />;
}

export function QualityBadge({ grade }: { grade: DataQualityGrade }) {
  return (
    <span className="qbadge" data-g={grade} title={`Data quality ${grade}: ${QUALITY_LABEL[grade]}`}>
      {grade} · {QUALITY_LABEL[grade]}
    </span>
  );
}

export function ProbBar({ value }: { value: number }) {
  return (
    <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "danger" }) {
  return <div className={`notice${tone === "warn" ? " notice-warn" : tone === "danger" ? " notice-danger" : ""}`} role={tone === "danger" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function CardSkeletons({ n = 4 }: { n?: number }) {
  return (
    <div className="grid-cards" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card stack">
          <Skeleton h={12} w="45%" />
          <Skeleton h={18} />
          <Skeleton h={18} />
          <Skeleton h={34} />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card empty">
      <h3>Couldn’t load this</h3>
      <div>{message}</div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function FormDots({ form }: { form: ("W" | "D" | "L")[] }) {
  if (form.length === 0) return <span className="subtle">No results</span>;
  return (
    <span className="form" aria-label={`Recent form: ${form.join(" ")}`}>
      {form.map((r, i) => <b key={i} data-r={r}>{r}</b>)}
    </span>
  );
}
