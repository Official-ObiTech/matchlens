import { STATUS_LABEL, kickoffDate, kickoffTime, pct, type FixtureListItem } from "@fpp/core";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useTheme } from "@/theme";
import { Card, Crest, QualityBadge, Row, StatusPill, T } from "./ui";

export function MatchCard({ f, showDate }: { f: FixtureListItem; showDate?: boolean }) {
  const c = useTheme();
  const started = f.status !== "scheduled" && f.status !== "tbd";
  return (
    <Card onPress={() => router.push({ pathname: "/match/[id]", params: { id: f.id } })} accessibilityLabel={`${f.home.name} versus ${f.away.name}`}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ gap: 6, flexShrink: 1 }}>
          <Crest src={f.competition.logoUrl} name={f.competition.name} size={16} />
          <T variant="subtle" numberOfLines={1} style={{ fontWeight: "600", flexShrink: 1 }}>{f.competition.name}</T>
        </Row>
        {started ? <StatusPill status={f.status === "live" ? "live" : STATUS_LABEL[f.status]} /> : <T variant="subtle" style={{ fontWeight: "600" }}>{showDate ? `${kickoffDate(f.kickoffAt)} · ` : ""}{f.status === "tbd" ? "TBC" : kickoffTime(f.kickoffAt)}</T>}
      </Row>
      {[f.home, f.away].map((t, i) => (
        <Row key={t.id} style={{ justifyContent: "space-between" }}>
          <Row style={{ flexShrink: 1, gap: 9 }}>
            <Crest src={t.logoUrl} name={t.name} />
            <T variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{t.name}</T>
          </Row>
          <T variant="strong" style={{ fontVariant: ["tabular-nums"] }}>{i === 0 ? f.score?.home ?? "" : f.score?.away ?? ""}</T>
        </Row>
      ))}
      {f.pick ? (
        <View style={{ backgroundColor: c.accentSoft, borderRadius: 10, padding: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <T variant="strong" numberOfLines={2}>{f.pick.label}</T>
            <QualityBadge grade={f.pick.dataQuality} />
          </View>
          <Text style={{ color: c.accent, fontWeight: "800", fontSize: 18, fontVariant: ["tabular-nums"] }} accessibilityLabel={`Estimated probability ${pct(f.pick.probability)}`}>{pct(f.pick.probability)}</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: c.surface2, borderRadius: 10, padding: 10 }}>
          <T variant="subtle">{f.predictionState === "abstained" ? "No sufficiently reliable prediction" : started ? "Not analysed before kickoff" : "Analysis not generated yet"}</T>
        </View>
      )}
    </Card>
  );
}
