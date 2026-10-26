import { MARKET_LABEL, kickoffDate, pct, type PerformanceResponse, type SavedSlipDto } from "@fpp/core";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, CardSkeletons, Chip, Empty, ErrorState, Notice, Row, StatusPill, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/lib/hooks";
import { useTheme } from "@/theme";

const TABS = ["all", "pending", "won", "lost", "void"] as const;

export default function History() {
  const c = useTheme();
  const perf = useApi("perf", () => api<PerformanceResponse>("/performance"));
  const { session } = useSession();
  const slips = useApi(session ? `slips:${session.user.id}` : null, () => api<{ slips: SavedSlipDto[] }>("/slips"));
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const o = perf.data?.overall;

  return (
    <Screen refreshing={perf.refreshing} onRefresh={() => { perf.reload(); slips.reload(); }}>
      {perf.loading ? <CardSkeletons n={1} /> : perf.error ? <ErrorState message={perf.error.message} onRetry={perf.reload} /> : o && (
        <Card>
          <T variant="h2">Model track record</T>
          <Row style={{ flexWrap: "wrap", gap: 18 }}>
            {[["Settled", String(o.settled)], ["Won–Lost", `${o.won}–${o.lost}`], ["Win rate", pct(o.winRate, 1)], ["Avg. est.", pct(o.meanPredicted, 1)], ["Brier", o.brier?.toFixed(3) ?? "–"]].map(([l, v]) => (
              <View key={l}><T variant="h2">{v}</T><T variant="subtle">{l}</T></View>
            ))}
          </Row>
          {o.winRateInterval && <T variant="subtle">95% interval: {pct(o.winRateInterval[0], 1)}–{pct(o.winRateInterval[1], 1)}. Voids and pending excluded.</T>}
          {o.settled < perf.data!.minSampleForClaims && <Notice tone="warn">{`Only ${o.settled} settled predictions. At least ${perf.data!.minSampleForClaims} are needed before the win rate is meaningful.`}</Notice>}
          {perf.data!.byMarket.filter((m) => m.summary.settled > 0).map((m) => (
            <Row key={m.key} style={{ justifyContent: "space-between" }}><T variant="muted">{MARKET_LABEL[m.key] ?? m.key}</T><T variant="strong">{m.summary.won}–{m.summary.lost} · {pct(m.summary.winRate, 1)}</T></Row>
          ))}
          {perf.data!.calibration.length > 0 && <T variant="h3">Calibration (estimated vs actual)</T>}
          {perf.data!.calibration.map((b) => (
            <Row key={b.bucket} style={{ justifyContent: "space-between" }}><T variant="muted">{b.bucket} (n={b.n})</T><T variant="strong">{pct(b.meanPredicted, 1)} → {pct(b.winRate, 1)}</T></Row>
          ))}
        </Card>
      )}

      {perf.data && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {TABS.map((t) => <Chip key={t} label={t[0]!.toUpperCase() + t.slice(1)} selected={tab === t} onPress={() => setTab(t)} />)}
          </ScrollView>
          {perf.data.recent.filter((r) => tab === "all" || r.status === tab).map((r) => (
            <Pressable key={r.id} onPress={() => router.push({ pathname: "/match/[id]", params: { id: r.fixtureId } })} style={{ backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flexShrink: 1 }}><T variant="strong" numberOfLines={1}>{r.homeName} vs {r.awayName}</T><T variant="subtle">{kickoffDate(r.kickoffAt)} · {r.label} · {pct(r.probability)}</T></View>
                <StatusPill status={r.status} />
              </Row>
            </Pressable>
          ))}
        </>
      )}

      <T variant="h2">My saved slips</T>
      {!session ? <Empty title="Sign in to see your saved predictions" action={<Button small title="Sign in" onPress={() => router.push("/sign-in")} />} />
        : slips.loading ? <CardSkeletons n={1} /> : slips.error ? <ErrorState message={slips.error.message} onRetry={slips.reload} />
        : slips.data!.slips.length === 0 ? <Empty title="No saved slips yet" />
        : slips.data!.slips.map((s) => (
          <Card key={s.id}>
            <Row style={{ justifyContent: "space-between" }}><T variant="strong">{s.name ?? (s.selections.length === 1 ? "Single prediction" : `${s.selections.length}-game slip`)}</T><StatusPill status={s.status} /></Row>
            {s.selections.map((x) => (
              <Row key={x.fixtureId} style={{ justifyContent: "space-between" }}>
                <View style={{ flexShrink: 1 }}><T numberOfLines={1}>{x.homeName} vs {x.awayName}{x.score ? ` · ${x.score.home}–${x.score.away}` : ""}</T><T variant="subtle">{x.label}{x.probability != null ? ` · ${pct(x.probability)}` : ""}</T></View>
                <StatusPill status={x.status} />
              </Row>
            ))}
          </Card>
        ))}
    </Screen>
  );
}
