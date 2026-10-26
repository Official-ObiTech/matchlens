import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, Notice, Row, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/lib/hooks";
import { registerForPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme";

interface Prefs { kickoffReminders: boolean; results: boolean; settlement: boolean; matchChanges: boolean }

export default function Profile() {
  const { session, ready, configured } = useSession();
  if (!ready) return null;
  return (
    <Screen>
      {!configured ? (
        <Notice tone="warn">Accounts are not configured in this build (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).</Notice>
      ) : !session ? (
        <Card>
          <T variant="h2">Sign in</T>
          <T variant="muted">Save predictions, sync your slip across devices and track your results.</T>
          <Button kind="primary" title="Sign in or create account" onPress={() => router.push("/sign-in")} />
        </Card>
      ) : (
        <>
          <Card>
            <T variant="h2">Account</T>
            <T variant="muted">{session.user.email}</T>
            <Button title="Sign out" kind="danger" onPress={() => supabase?.auth.signOut()} />
          </Card>
          <Prefs />
        </>
      )}
      <Button title="Prediction history & performance" onPress={() => router.push("/history")} />
      <T variant="subtle" style={{ textAlign: "center" }}>Probabilities are model estimates, not guarantees. This app does not take bets.</T>
    </Screen>
  );
}

function Prefs() {
  const c = useTheme();
  const res = useApi("prefs", () => api<Prefs>("/me/notifications"));
  const [p, setP] = useState<Prefs | null>(null);
  const [pushState, setPushState] = useState<string | null>(null);
  useEffect(() => { if (res.data) setP(res.data); }, [res.data]);
  if (!p) return null;
  const toggle = async (k: keyof Prefs) => {
    const next = { ...p, [k]: !p[k] };
    setP(next);
    try { await api("/me/notifications", { method: "PUT", body: next }); } catch { setP(p); }
  };
  const items: [keyof Prefs, string][] = [["kickoffReminders", "Kickoff reminders"], ["results", "Match results"], ["settlement", "Slip settled"], ["matchChanges", "Match changes"]];
  return (
    <Card>
      <T variant="h2">Notifications</T>
      {items.map(([k, label]) => (
        <Row key={k} style={{ justifyContent: "space-between", minHeight: 44 }}>
          <T>{label}</T>
          <Switch value={p[k]} onValueChange={() => toggle(k)} trackColor={{ true: c.accent }} accessibilityLabel={label} />
        </Row>
      ))}
      <View style={{ gap: 6 }}>
        <Button small title="Enable push on this device" onPress={async () => setPushState(await registerForPush().catch(() => "error"))} />
        {pushState && <T variant="subtle">{pushState === "registered" ? "This device will receive notifications." : pushState === "denied" ? "Permission denied. Enable notifications in system settings." : pushState === "unsupported" ? "Push needs a physical device." : pushState === "not_configured" ? "This build has no EAS project ID yet." : "Couldn’t register this device."}</T>}
      </View>
    </Card>
  );
}
