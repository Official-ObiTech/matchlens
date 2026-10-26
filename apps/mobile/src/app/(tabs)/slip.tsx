import { MARKET_LABEL, independentCombinedProbability, kickoffDate, kickoffTime, pct } from "@fpp/core";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Share, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, Empty, Notice, QualityBadge, Row, T } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useSession } from "@/lib/hooks";
import { registerForPush } from "@/lib/push";
import { useSlip } from "@/lib/slipStore";
import { useTheme } from "@/theme";

export default function SlipScreen() {
  const c = useTheme();
  const slip = useSlip();
  const { session, configured } = useSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const sels = slip.selections;
  const combined = independentCombinedProbability(sels);
  const started = sels.filter((s) => new Date(s.kickoffAt) <= new Date());

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ id: string; shareToken: string }>("/slips", {
        method: "POST",
        body: { name: name.trim() || undefined, selections: sels.map((s) => ({ fixtureId: s.fixtureId, market: s.market, outcome: s.outcome, ...(s.line != null ? { line: s.line } : {}) })) },
      });
      slip.clear();
      setName("");
      // Ask for notification permission in context, right after saving.
      Alert.alert("Prediction saved", "Get a reminder before kickoff and the result when it’s settled?", [
        { text: "Not now", style: "cancel" },
        { text: "Notify me", onPress: () => registerForPush().then((p) => p === "not_configured" && Alert.alert("Notifications unavailable", "Push notifications need an EAS project ID in this build.")).catch(() => {}) },
      ]);
      void r;
    } catch (e) {
      Alert.alert("Couldn’t save", e instanceof ApiRequestError ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const share = () =>
    Share.share({ message: `My MatchLens picks:\n${sels.map((s) => `• ${s.homeName} vs ${s.awayName}: ${s.label} (${pct(s.probability)})`).join("\n")}` });

  if (sels.length === 0)
    return (
      <Screen>
        <Empty title="Your slip is empty" body="Pick a game, review the analysis, and play that pick on its own or add more games." action={<Button kind="primary" title="Browse matches" onPress={() => router.navigate("/matches")} />} />
        <Button title="View my saved predictions" onPress={() => router.push("/history")} />
      </Screen>
    );

  return (
    <Screen>
      {sels.length === 1 && <Notice>A single-game prediction is complete on its own. Save it now or add more games.</Notice>}
      {started.length > 0 && <Notice tone="danger">{`${started.length} selection(s) already kicked off and can’t be saved. Remove them to continue.`}</Notice>}
      {sels.map((s) => (
        <Card key={s.fixtureId}>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <T variant="subtle">{s.competition} · {kickoffDate(s.kickoffAt)} {kickoffTime(s.kickoffAt)}</T>
              <T variant="strong">{s.homeName} vs {s.awayName}</T>
            </View>
            <Pressable onPress={() => slip.remove(s.fixtureId)} accessibilityRole="button" accessibilityLabel={`Remove ${s.homeName} vs ${s.awayName}`} hitSlop={12} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={c.text3} />
            </Pressable>
          </Row>
          <Row style={{ backgroundColor: c.accentSoft, borderRadius: 10, padding: 10, justifyContent: "space-between" }}>
            <View style={{ flexShrink: 1, gap: 3 }}>
              <T variant="subtle">{MARKET_LABEL[s.market]}</T>
              <T variant="strong">{s.label}</T>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <T variant="strong" style={{ color: c.accent, fontSize: 17 }}>{pct(s.probability)}</T>
              <QualityBadge grade={s.dataQuality} />
            </View>
          </Row>
          <Pressable onPress={() => router.push({ pathname: "/match/[id]", params: { id: s.fixtureId } })} accessibilityRole="link">
            <T style={{ color: c.accent, fontWeight: "600" }}>Review analysis / change market</T>
          </Pressable>
        </Card>
      ))}
      <Button title="+ Add another game" onPress={() => router.navigate("/matches")} />
      {combined != null && (
        <Card>
          <Row style={{ justifyContent: "space-between" }}><T variant="strong">All {sels.length} correct (rough)</T><T variant="strong">{pct(combined, 1)}</T></Row>
          <T variant="subtle">Multiplies individual probabilities assuming independent matches — an approximation, not a reliable figure. Each extra selection lowers the chance that every pick is correct.</T>
        </Card>
      )}
      <Card>
        <TextInput placeholder="Name (optional)" placeholderTextColor={c.text3} value={name} onChangeText={setName} maxLength={80}
          style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, color: c.text }} />
        {!configured ? <Notice tone="warn">Accounts are not configured in this build. Your slip is kept on this device.</Notice>
          : !session ? <Notice>Your slip is kept on this device. Sign in to save it and track the result.</Notice> : null}
        {!session && configured ? (
          <Button kind="primary" title="Sign in to save" onPress={() => router.push("/sign-in")} />
        ) : (
          <Button kind="primary" title={sels.length === 1 ? "Save prediction" : `Save ${sels.length} predictions`} loading={saving} disabled={!session || started.length > 0} onPress={save} />
        )}
        <Row>
          <Button title="Share slip" onPress={share} style={{ flex: 1 }} />
          <Button kind="danger" title="Clear slip" onPress={() => Alert.alert("Clear slip?", "Remove all selections.", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: slip.clear }])} style={{ flex: 1 }} />
        </Row>
        {API_URL ? null : <T variant="subtle">EXPO_PUBLIC_API_URL is not set.</T>}
      </Card>
    </Screen>
  );
}
