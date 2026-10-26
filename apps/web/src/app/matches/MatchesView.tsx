"use client";
import { MARKET_LABEL, localToday, type FixturesResponse, type MarketId } from "@fpp/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import { CardSkeletons, Empty, ErrorState, Notice } from "@/components/ui";
import { api, tzOffset } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";

const DAYS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "upcoming", label: "Next 7 days" },
] as const;

export function MatchesView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const day = (sp.get("range") === "upcoming" ? "upcoming" : sp.get("day") === "tomorrow" ? "tomorrow" : sp.get("date") ? "date" : "today") as "today" | "tomorrow" | "upcoming" | "date";
  const [q, setQ] = useState(sp.get("q") ?? "");
  const competition = sp.get("competition") ?? "";
  const country = sp.get("country") ?? "";
  const market = (sp.get("market") ?? "") as MarketId | "";
  const minProbability = sp.get("minProbability") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const date = day === "date" ? sp.get("date")! : day === "tomorrow" ? localToday(1) : localToday();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in patch)) next.delete("page");
    router.replace(`${pathname}?${next}`);
  };
  useEffect(() => {
    const t = setTimeout(() => q !== (sp.get("q") ?? "") && set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const key = `fx:${day}:${date}:${sp.get("q") ?? ""}:${competition}:${country}:${market}:${minProbability}:${page}`;
  const res = useApi(key, () =>
    api<FixturesResponse>("/fixtures", {
      params: { date: day === "upcoming" ? undefined : date, range: day === "upcoming" ? "upcoming" : "day", tz: tzOffset(), q: sp.get("q"), competition, country, market, minProbability, page },
    }),
  );
  const comps = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of res.data?.fixtures ?? []) m.set(f.competition.id, f.competition.name);
    return [...m.entries()];
  }, [res.data]);
  const countries = useMemo(() => [...new Set((res.data?.fixtures ?? []).map((f) => f.competition.country).filter(Boolean) as string[])], [res.data]);

  return (
    <div className="stack">
      <h1>Matches</h1>
      <div className="chips" role="group" aria-label="Date">
        {DAYS.map((d) => (
          <button key={d.key} className="chip" aria-pressed={day === d.key} onClick={() => set({ day: d.key === "tomorrow" ? "tomorrow" : null, range: d.key === "upcoming" ? "upcoming" : null, date: null })}>{d.label}</button>
        ))}
        <input type="date" className="chip" aria-label="Pick a date" value={day === "date" ? date : ""} onChange={(e) => set({ date: e.target.value || null, day: null, range: null })} />
      </div>
      <input className="input" type="search" placeholder="Search team, competition or country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      <div className="row-wrap">
        <select className="select" style={{ width: "auto" }} value={competition} onChange={(e) => set({ competition: e.target.value || null })} aria-label="Competition">
          <option value="">All competitions</option>
          {competition && !comps.some(([id]) => id === competition) && <option value={competition}>Selected competition</option>}
          {comps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={country} onChange={(e) => set({ country: e.target.value || null })} aria-label="Country">
          <option value="">All countries</option>
          {country && !countries.includes(country) && <option value={country}>{country}</option>}
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={market} onChange={(e) => set({ market: e.target.value || null })} aria-label="Market of recommended pick">
          <option value="">Any market</option>
          {Object.entries(MARKET_LABEL).filter(([k]) => k !== "CORRECT_SCORE" && k !== "FIRST_HALF_GOALS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={minProbability} onChange={(e) => set({ minProbability: e.target.value || null })} aria-label="Minimum estimated probability">
          <option value="">Any probability</option>
          {[0.7, 0.75, 0.8, 0.85, 0.9].map((p) => <option key={p} value={p}>{Math.round(p * 100)}%+</option>)}
        </select>
      </div>
      {res.data?.notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
      {res.loading ? <CardSkeletons n={6} /> : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : res.data!.fixtures.length === 0 ? (
        <Empty title="No matches found">Try another date, remove a filter, or search for a different team.</Empty>
      ) : (
        <>
          <div className="grid-cards">{res.data!.fixtures.map((f) => <MatchCard key={f.id} f={f} showDate={day === "upcoming"} />)}</div>
          <div className="row between">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</button>
            <span className="subtle">Page {page}</span>
            <button className="btn btn-sm" disabled={!res.data!.hasMore} onClick={() => set({ page: String(page + 1) })}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
