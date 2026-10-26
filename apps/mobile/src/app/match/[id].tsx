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
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Crest, Empty, ErrorState, FormDots, Notice, ProbBar, QualityBadge, Row, Skeleton, StatusPill, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSlip } from "@/lib/slipStore";
import { useTheme } from "@/theme";

export default function MatchScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const slip = useSlip();
  const res = useApi(id ? `match:${id}` : null, () => api<MatchDetailDto>(`/matches/${encodeURIComponent(id!)}`));
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [openMarket, setOpenMarket] = useState<string | null>(null);

  const d = res.data;
  const run = d?.run ?? null;
  const rec = run?.recommendation ?? null;
  const onSlip = slip.selections.find((s) => s.fixtureId === id);
  const upcoming = d ? (d.fixture.status === "scheduled" || d.fixture.status === "tbd") && new Date(d.fixture.kickoffAt) > new Date() : false;

  const chosen = useMemo(() => {
    if (!run) return null;
    const key = chosenKey ?? (onSlip ? selectionKey(onSlip) : rec ? selectionKey(rec) : null);
    return run.markets.find((m) => selectionKey(m) === key) ?? null;
  }, [run, chosenKey, onSlip, rec]);
  const chosenRec = chosen && rec && selectionKey(chosen) === selectionKey(rec) ? rec : (run?.alternatives.find((a) => chosen && selectionKey(a) === selectionKey(chosen)) ?? null);

  if (res.loading)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Card><Skeleton h={14} w="40%" /><Skeleton h={60} /></Card>
        <Card><Skeleton h={18} w="60%" /><Skeleton h={44} /></Card>
      </View>
    );
  if (res.error || !d) return <View style={{ padding: 16 }}><ErrorState message={res.error?.message ?? "Not found"} onRetry={res.reload} /></View>;
  const f = d.fixture;

  const add = (then: "slip" | "browse") => {
    if (!chosen || !run) return;
    const sel: SlipSelection = {
      fixtureId: f.id,
      homeName: f.home.name,
      awayName: f.away.name,
      competition: f.competition.name,
      kickoffAt: f.kickoffAt,
      market: chosen.market,
      outcome: chosen.outcome,
      ...(chosen.line != null ? { line: chosen.line } : {}),
      label: chosen.label,
      probability: chosenRec ? chosenRec.calibratedProbability : chosen.probability,
      dataQuality: run.quality.grade,
      modelVersion: run.modelVersion,
      addedAt: new Date().toISOString(),
    };
    const r = slip.add(sel);
    if (r === "full") return Alert.alert("Slip is full", "Remove a selection first.");
    if (then === "slip") return router.navigate("/slip");
    router.navigate("/matches");
  };

  const groups = [...new Map(run?.markets.map((m) => [m.market, run.markets.filter((x) => x.market === m.market)])).entries()];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: upcoming && run ? 200 : 40 }}>
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="subtle" numberOfLines={1} style={{ flexShrink: 1 }}>{f.competition.name}{f.competition.country ? ` · ${f.competition.country}` : ""}</T>
            <StatusPill status={f.status === "live" ? "live" : STATUS_LABEL[f.status]} />
          </Row>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, alignItems: "center", gap: 6 }}><Crest src={f.home.logoUrl} name={f.home.name} size={52} /><T variant="strong" style={{ textAlign: "center" }}>{f.home.name}</T></View>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: "800", marginTop: 12, fontVariant: ["tabular-nums"] }}>{f.score ? `${f.score.home ?? "-"} – ${f.score.away ?? "-"}` : kickoffTime(f.kickoffAt)}</Text>
            <View style={{ flex: 1, alignItems: "center", gap: 6 }}><Crest src={f.away.logoUrl} name={f.away.name} size={52} /><T variant="strong" style={{ textAlign: "center" }}>{f.away.name}</T></View>
          </Row>
          <T variant="subtle" style={{ textAlign: "center" }}>{kickoffDate(f.kickoffAt)} · {kickoffTime(f.kickoffAt)}{f.venue ? ` · ${f.venue}` : ""}</T>
        </Card>

        {d.notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
        {d.published && <Notice>{`Tracked prediction: ${d.published.label} at ${pct(d.published.probability)} — ${d.published.status === "pending" ? "awaiting result" : d.published.status.toUpperCase()}.`}</Notice>}

        {!run ? (
          <Empty title={upcoming ? "Analysis not available yet" : "No analysis"} body={upcoming ? "This match has not been analysed yet." : NO_RELIABLE_PREDICTION} />
        ) : (
          <>
            <Card style={rec ? { borderColor: c.accent, borderWidth: 1.5 } : undefined}>
              <Row style={{ justifyContent: "space-between" }}><T variant="h2">Recommended prediction</T><QualityBadge grade={run.quality.grade} /></Row>
              {rec ? (
                <>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                    <View style={{ flexShrink: 1, gap: 2 }}>
                      <T variant="subtle">{MARKET_LABEL[rec.market]}</T>
                      <T variant="h2">{rec.label}</T>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: c.accent, fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{pct(rec.calibratedProbability)}</Text>
                      <T variant="subtle">estimated probability</T>
                    </View>
                  </Row>
                  <T variant="subtle">Model confidence {pct(rec.modelConfidence)}</T>
                  <ProbBar value={rec.modelConfidence} />
                  <T variant="subtle">{rec.calibrated ? "Adjusted using this model’s settled track record." : "Not yet calibrated: too few settled predictions in this range."}</T>
                  {rec.reasoning.map((r) => <T key={r} variant="muted">• {r}</T>)}
                </>
              ) : (
                <>
                  <T variant="strong">{NO_RELIABLE_PREDICTION}</T>
                  {run.abstainReasons.map((r) => <T key={r} variant="muted">• {ABSTAIN_MESSAGES[r]}</T>)}
                </>
              )}
              <T variant="subtle">Estimated probability is the model’s chance of the outcome; model confidence reflects how well the data supports it. Neither is a guarantee.</T>
            </Card>

            {run.markets.length > 0 && (
              <Card>
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="h2">Probabilities</T>
                  {run.expectedGoals && <T variant="subtle">xG (model) {run.expectedGoals.home.toFixed(2)}–{run.expectedGoals.away.toFixed(2)}</T>}
                </Row>
                <T variant="subtle">Tap a selection to choose it for your slip.</T>
                {groups.map(([market, items]) => {
                  const open = openMarket === market || (openMarket == null && (market === "1X2" || market === "TOTAL_GOALS" || market === "BTTS"));
                  return (
                    <View key={market} style={{ gap: 2 }}>
                      <Pressable onPress={() => setOpenMarket(open ? "" : market)} accessibilityRole="button" style={{ paddingVertical: 8 }}>
                        <Row style={{ justifyContent: "space-between" }}><T variant="h3">{MARKET_LABEL[market]}</T><T variant="subtle">{open ? "Hide" : "Show"}</T></Row>
                      </Pressable>
                      {open && items.map((m) => <MarketRow key={selectionKey(m)} m={m} selected={chosen != null && selectionKey(chosen) === selectionKey(m)} disabled={!upcoming || m.market === "CORRECT_SCORE"} onPress={() => setChosenKey(selectionKey(m))} />)}
                    </View>
                  );
                })}
                {run.quality.unavailable.length > 0 && <T variant="subtle">Not available from the current data source: {run.quality.unavailable.join(", ")}.</T>}
              </Card>
            )}

            {(run.home || run.away) && (
              <Card>
                <T variant="h2">Team analysis</T>
                {run.home && <TeamBlock name={f.home.name} t={run.home} side="home" />}
                {run.away && <TeamBlock name={f.away.name} t={run.away} side="away" />}
                <T variant="h3">Head to head</T>
                {run.headToHead.length === 0 ? <T variant="subtle">No recent meetings in the available data.</T> : run.headToHead.map((m) => (
                  <Row key={m.fixtureId} style={{ justifyContent: "space-between" }}>
                    <T variant="subtle">{new Date(m.date).toLocaleDateString()}</T>
                    <T variant="strong">{(m.homeTeamId === f.home.id ? f.home.name : f.away.name)} {m.homeGoals}–{m.awayGoals} {(m.awayTeamId === f.home.id ? f.home.name : f.away.name)}</T>
                  </Row>
                ))}
                <T variant="subtle">Data quality {run.quality.grade}: {run.quality.homeMatches}/{run.quality.awayMatches} team results, {run.quality.leagueMatches} league results. {run.quality.notes.join(" ")}</T>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {upcoming && run && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 12 + insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
          {chosen ? (
            <>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{chosen.label}</T>
                <T variant="strong">{pct(chosenRec ? chosenRec.calibratedProbability : chosen.probability)}</T>
              </Row>
              {!chosenRec && <T variant="subtle">Below the model’s recommendation criteria.</T>}
              <Row>
                <Button kind="primary" title="PLAY THIS PICK" onPress={() => add("slip")} style={{ flex: 1 }} />
                <Button title="ADD ANOTHER GAME" onPress={() => add("browse")} style={{ flex: 1 }} />
              </Row>
            </>
          ) : (
            <T variant="muted">Select a market above to add this game to your slip.</T>
          )}
        </View>
      )}
    </View>
  );
}

function MarketRow({ m, selected, disabled, onPress }: { m: MarketProbability; selected: boolean; disabled: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 9, backgroundColor: selected ? c.accentSoft : "transparent", minHeight: 44 }}>
      <T style={{ flex: 1 }} numberOfLines={2}>{m.label}</T>
      <ProbBar value={m.probability} width={70} />
      <T variant="strong" style={{ width: 44, textAlign: "right", fontVariant: ["tabular-nums"] }}>{pct(m.probability)}</T>
    </Pressable>
  );
}

function TeamBlock({ name, t, side }: { name: string; t: TeamSummary; side: "home" | "away" }) {
  const c = useTheme();
  const v = side === "home" ? t.home : t.away;
  const per = (x: number, n: number) => (n ? (x / n).toFixed(2) : "–");
  const rows: [string, string][] = [
    ["Record (W-D-L)", `${t.wins}-${t.draws}-${t.losses}`],
    ["Goals per game", `${per(t.goalsFor, t.played)} / ${per(t.goalsAgainst, t.played)}`],
    [side === "home" ? "At home" : "Away", `${per(v.goalsFor, v.played)} / ${per(v.goalsAgainst, v.played)} (${v.played})`],
    ["Clean sheets", `${t.cleanSheets}/${t.played}`],
    ["Failed to score", `${t.failedToScore}/${t.played}`],
    ["Attack / defence (1.00 = avg)", `${t.attack?.toFixed(2) ?? "–"} / ${t.defence?.toFixed(2) ?? "–"}`],
  ];
  return (
    <View style={{ backgroundColor: c.surface2, borderRadius: 12, padding: 12, gap: 6 }}>
      <Row style={{ justifyContent: "space-between" }}><T variant="h3">{name}</T>{t.position != null && <T variant="subtle">#{t.position} (computed)</T>}</Row>
      <FormDots form={t.form} />
      {rows.map(([k, val]) => (
        <Row key={k} style={{ justifyContent: "space-between" }}><T variant="muted">{k}</T><T variant="strong" style={{ fontVariant: ["tabular-nums"] }}>{val}</T></Row>
      ))}
    </View>
  );
}
