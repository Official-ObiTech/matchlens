import { localToday, pct, RESPONSIBLE_NOTICE, type FixturesResponse, type PerformanceResponse, type StrongestResponse } from "@fpp/core";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { MatchCard } from "@/components/MatchCard";
import { Screen } from "@/components/Screen";
import { Button, Card, CardSkeletons, Empty, ErrorState, Notice, Row, StatusPill, T } from "@/components/ui";
import { api, tzOffset } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useTheme } from "@/theme";

export default function Home() {
  const c = useTheme();
  const today = useMemo(() => localToday(), []);
  const [q, setQ] = useState("");
  const strongest = useApi(`s:${today}`, () => api<StrongestResponse>("/predictions/strongest", { params: { date: today, tz: tzOffset(), limit: 3 } }));
  const fixtures = useApi(`f:${today}`, () => api<FixturesResponse>("/fixtures", { params: { date: today, tz: tzOffset() } }));
  const perf = useApi("perf", () => api<PerformanceResponse>("/performance"));
  const refresh = () => { strongest.reload(); fixtures.reload(); perf.reload(); };
  const settled = perf.data?.recent.filter((r) => r.status !== "pending").slice(0, 4) ?? [];

  return (
    <Screen refreshing={strongest.refreshing} onRefresh={refresh}>
      <View style={{ gap: 4 }}>
        <T variant="subtle">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</T>
        <T variant="h1">Today’s strongest predictions</T>
      </View>
      <TextInput
        placeholder="Search teams, competitions or countries"
        placeholderTextColor={c.text3}
        value={q}
        onChangeText={setQ}
        returnKeyType="search"
        onSubmitEditing={() => router.push({ pathname: "/matches", params: { q } })}
        style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, color: c.text, fontSize: 15 }}
        accessibilityLabel="Search matches"
      />
      {fixtures.error && <Notice tone="warn">{fixtures.error.message}</Notice>}
      {fixtures.data?.notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}

      <T variant="h2">Highest-confidence selections</T>
      {strongest.loading ? <CardSkeletons n={2} /> : strongest.error ? null : strongest.data!.picks.length === 0 ? (
        <Empty title="No selections meet the criteria today" body="The model only recommends picks it can support with data." />
      ) : strongest.data!.picks.map((p) => <MatchCard key={p.id} f={p} />)}
      <Button title="See all strongest predictions" onPress={() => router.push("/predictions")} />

      <Card>
        <T variant="h2">Build My Slip</T>
        <T variant="muted">Get eligible selections from the model, then keep or remove each one. One game is enough.</T>
        <Button kind="primary" title="Build my slip" onPress={() => router.push({ pathname: "/predictions", params: { build: "1" } })} />
      </Card>

      <T variant="h2">Today’s fixtures</T>
      {fixtures.loading ? <CardSkeletons /> : fixtures.error ? <ErrorState message={fixtures.error.message} onRetry={fixtures.reload} /> : fixtures.data!.fixtures.length === 0 ? (
        <Empty title="No fixtures today" action={<Button small title="Upcoming matches" onPress={() => router.push({ pathname: "/matches", params: { range: "upcoming" } })} />} />
      ) : (
        <>
          {fixtures.data!.fixtures.slice(0, 8).map((f) => <MatchCard key={f.id} f={f} />)}
          <Button title="All matches" onPress={() => router.push("/matches")} />
        </>
      )}

      {perf.data && (
        <Card>
          <T variant="h2">Prediction performance</T>
          <T variant="muted">
            {perf.data.overall.settled} settled · win rate {pct(perf.data.overall.winRate, 1)} · avg. estimated {pct(perf.data.overall.meanPredicted, 1)}
          </T>
          {perf.data.overall.settled < perf.data.minSampleForClaims && <T variant="subtle">Fewer than {perf.data.minSampleForClaims} settled predictions: too early to judge the model.</T>}
          {settled.map((r) => (
            <Row key={r.id} style={{ justifyContent: "space-between" }}>
              <View style={{ flexShrink: 1 }}><T variant="strong" numberOfLines={1}>{r.homeName} vs {r.awayName}</T><T variant="subtle">{r.label} · {pct(r.probability)}</T></View>
              <StatusPill status={r.status} />
            </Row>
          ))}
          <Button small title="Full history" onPress={() => router.push("/history")} />
        </Card>
      )}
      <T variant="subtle" style={{ textAlign: "center" }}>{RESPONSIBLE_NOTICE}</T>
    </Screen>
  );
}
