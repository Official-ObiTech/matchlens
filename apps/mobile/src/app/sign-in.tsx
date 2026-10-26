import { router } from "expo-router";
import { useState } from "react";
import { TextInput } from "react-native";
import { Screen } from "@/components/Screen";
import { Button, Notice, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme";

export default function SignIn() {
  const c = useTheme();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  if (!supabase) return <Screen><Notice tone="warn">Accounts are not configured in this build.</Notice></Screen>;
  const input = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, color: c.text, fontSize: 15 } as const;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const { error, data } = mode === "signin" ? await supabase!.auth.signInWithPassword({ email, password }) : await supabase!.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg({ tone: "danger", text: error.message });
    if (mode === "signup" && !data.session) return setMsg({ tone: "info", text: "Check your email to confirm your account, then sign in." });
    router.back();
  };

  return (
    <Screen>
      <T variant="h1">{mode === "signin" ? "Sign in" : "Create account"}</T>
      <TextInput style={input} placeholder="Email" placeholderTextColor={c.text3} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={input} placeholder="Password (8+ characters)" placeholderTextColor={c.text3} secureTextEntry autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button kind="primary" title={mode === "signin" ? "Sign in" : "Create account"} loading={busy} disabled={!email || password.length < 8} onPress={submit} />
      <Button kind="ghost" title={mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"} onPress={() => setMode(mode === "signin" ? "signup" : "signin")} />
      <T variant="subtle">You must be 18 or older where required by local law. This app does not take bets.</T>
    </Screen>
  );
}
