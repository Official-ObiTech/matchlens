import { MARKET_LABEL, localToday, pct, type MarketId, type SlipSelection, type StrongestResponse } from "@fpp/core";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { MatchCard } from "@/components/MatchCard";
import { Screen } from "@/components/Screen";
import { Button, Card, CardSkeletons, Chip, Empty, ErrorState, Notice, QualityBadge, Row, T } from "@/components/ui";
import { api, tzOffset } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSlip } from "@/lib/slipStore";
import { useTheme } from "@/theme";

const THRESHOLDS = [0.75, 0.8, 0.85, 0.9];
const MARKETS: MarketId[] = ["1X2", "DOUBLE_CHANCE", "DRAW_NO_BET", "TOTAL_GOALS", "BTTS"];

export default function Predictions() {
  const params = useLocalSearchParams<{ build?: string }>();
  const [min, setMin] = useState(0.75);
  const [day, setDay] = useState<0 | 1>(0);
  const [market, setMarket] = useState<MarketId | null>(null);
  const date = localToday(day);
  const res = useApi(`str:${date}:${min}:${market}`, () => api<StrongestResponse>("/predictions/strongest", { params: { date, tz: tzOffset(), minProbability: min, market } }));

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.reload}>
      {params.build ? <BuildMySlip date={date} min={min} /> : null}
      <Card>
        <T variant="h3">High Confidence — minimum estimated probability</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {THRESHOLDS.map((t) => <Chip key={t} label={`${Math.round(t * 100)}%+`} selected={min === t} onPress={() => setMin(t)} />)}
        </ScrollView>
        <T variant="subtle">Thresholds filter the model’s estimates; they are not guarantees.</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Today" selected={day === 0} onPress={() => setDay(0)} />
          <Chip label="Tomorrow" selected={day === 1} onPress={() => setDay(1)} />
          <Chip label="All markets" selected={market == null} onPress={() => setMarket(null)} />
          {MARKETS.map((m) => <Chip key={m} label={MARKET_LABEL[m]!} selected={market === m} onPress={() => setMarket(m)} />)}
        </ScrollView>
      </Card>
      {res.loading ? <CardSkeletons /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.picks.length === 0 ? (
        <Empty title="No selections meet these criteria" body="Try a lower threshold or another day. The model does not lower its standards to fill the list." />
      ) : (
        <>
          <T variant="subtle">{res.data!.picks.length} selection{res.data!.picks.length === 1 ? "" : "s"} qualify.</T>
          {res.data!.picks.map((p) => <MatchCard key={p.id} f={p} />)}
        </>
      )}
      {!params.build && <BuildMySlip date={date} min={min} />}
    </Screen>
  );
}

function BuildMySlip({ date, min }: { date: string; min: number }) {
  const c = useTheme();
  const slip = useSlip();
  const [max, setMax] = useState(3);
  const [requested, setRequested] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const res = useApi(requested == null ? null : `sug:${date}:${min}:${requested}`, () => api<StrongestResponse>("/slip/suggest", { params: { date, tz: tzOffset(), minProbability: min, max: requested! } }));
  const kept = (res.data?.picks ?? []).filter((p) => !excluded.has(p.id));

  const addAll = () => {
    let n = 0;
    for (const p of kept) {
      const s: SlipSelection = {
        fixtureId: p.id, homeName: p.home.name, awayName: p.away.name, competition: p.competition.name, kickoffAt: p.kickoffAt,
        market: p.pick.market, outcome: p.pick.outcome, ...(p.pick.line != null ? { line: p.pick.line } : {}), label: p.pick.label,
        probability: p.pick.probability, dataQuality: p.pick.dataQuality, modelVersion: p.modelVersion ?? "unknown", addedAt: new Date().toISOString(),
      };
      if (slip.add(s) !== "full") n++;
    }
    Alert.alert("Added to slip", `${n} selection${n === 1 ? "" : "s"} added.`);
  };

  return (
    <Card>
      <T variant="h2">Build My Slip</T>
      <T variant="muted">Up to how many selections at {Math.round(min * 100)}%+?</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[1, 2, 3, 4, 5, 8].map((n) => <Chip key={n} label={String(n)} selected={max === n} onPress={() => setMax(n)} />)}
      </ScrollView>
      <Button kind="primary" title="Suggest selections" onPress={() => { setExcluded(new Set()); setRequested(max); }} />
      {requested != null && (res.loading ? <CardSkeletons n={1} /> : res.error ? <ErrorState message={res.error.message} onRetry={res.reload} /> : res.data!.picks.length === 0 ? (
        <Notice tone="warn">No eligible selections right now. You can still add your own games.</Notice>
      ) : (
        <View style={{ gap: 8 }}>
          {res.data!.picks.length < requested && <Notice>{`Only ${res.data!.picks.length} selection${res.data!.picks.length === 1 ? "" : "s"} met the criteria.`}</Notice>}
          {res.data!.picks.map((p) => {
            const out = excluded.has(p.id);
            return (
              <Row key={p.id} style={{ backgroundColor: c.surface2, borderRadius: 10, padding: 10, opacity: out ? 0.5 : 1, justifyContent: "space-between" }}>
                <View style={{ flexShrink: 1, gap: 3 }}>
                  <T variant="strong" numberOfLines={1}>{p.home.name} vs {p.away.name}</T>
                  <T variant="subtle">{p.pick.label} · {pct(p.pick.probability)}</T>
                  <QualityBadge grade={p.pick.dataQuality} />
                </View>
                <Button small title={out ? "Keep" : "Remove"} onPress={() => setExcluded((s) => { const n = new Set(s); out ? n.delete(p.id) : n.add(p.id); return n; })} />
              </Row>
            );
          })}
          <Button kind="primary" title={`Add ${kept.length} to slip`} disabled={kept.length === 0} onPress={addAll} />
          <T variant="subtle">A suggestion, not a guarantee. Each extra selection makes it less likely that every pick is correct.</T>
        </View>
      ))}
    </Card>
  );
}
