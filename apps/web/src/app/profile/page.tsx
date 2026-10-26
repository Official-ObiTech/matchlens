"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Notice } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useApi, useRole, useSession } from "@/lib/client/hooks";
import { browserSupabase } from "@/lib/client/supabase";

interface Prefs { kickoffReminders: boolean; results: boolean; settlement: boolean; matchChanges: boolean }

export default function ProfilePage() {
  return <Suspense fallback={null}><Profile /></Suspense>;
}

function Profile() {
  const { session, ready, configured } = useSession();
  const role = useRole(session);
  if (!ready) return null;
  if (!configured) return <Notice tone="warn">Accounts are not configured on this server (Supabase URL and anon key are missing). See docs/SETUP.md.</Notice>;
  if (!session) return <SignIn />;
  return (
    <div className="stack-lg">
      <section className="card stack">
        <h1>Profile</h1>
        <span className="muted">{session.user.email}</span>
        <div className="row-wrap">
          <Link className="btn btn-sm" href="/history">My predictions</Link>
          {role.data?.role === "admin" && <Link className="btn btn-sm" href="/admin">Admin dashboard</Link>}
          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => browserSupabase()!.auth.signOut()}>Sign out</button>
        </div>
      </section>
      <NotificationPrefs />
    </div>
  );
}

function NotificationPrefs() {
  const res = useApi("prefs", () => api<Prefs>("/me/notifications"));
  const toast = useToast((s) => s.show);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => { if (res.data) setPrefs(res.data); }, [res.data]);
  if (!prefs) return null;
  const toggle = async (k: keyof Prefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try {
      await api("/me/notifications", { method: "PUT", body: next });
    } catch {
      setPrefs(prefs);
      toast("Couldn’t save preference.");
    }
  };
  const items: [keyof Prefs, string, string][] = [
    ["kickoffReminders", "Kickoff reminders", "An hour before a saved prediction kicks off."],
    ["results", "Match results", "When a match on your slip finishes."],
    ["settlement", "Slip settled", "When every selection on a slip is settled."],
    ["matchChanges", "Match changes", "If a saved match is rescheduled, postponed or cancelled."],
  ];
  return (
    <section className="card stack">
      <h2>Notifications</h2>
      <span className="subtle">Push notifications are delivered to the mobile app. Choose which ones you want.</span>
      {items.map(([k, label, desc]) => (
        <label key={k} className="row between" style={{ cursor: "pointer", gap: 16 }}>
          <span className="stack" style={{ gap: 2 }}><b>{label}</b><span className="subtle">{desc}</span></span>
          <input type="checkbox" checked={prefs[k]} onChange={() => toggle(k)} style={{ width: 22, height: 22, accentColor: "var(--accent)" }} />
        </label>
      ))}
    </section>
  );
}

function SignIn() {
  const sb = browserSupabase()!;
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error, data } = mode === "signin" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg({ tone: "danger", text: error.message });
    if (mode === "signup" && !data.session) return setMsg({ tone: "info", text: "Check your email to confirm your account, then sign in." });
    if (next?.startsWith("/")) router.push(next);
  };
  const magic = async () => {
    if (!email) return setMsg({ tone: "danger", text: "Enter your email first." });
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${next?.startsWith("/") ? next : "/profile"}` } });
    setBusy(false);
    setMsg(error ? { tone: "danger", text: error.message } : { tone: "info", text: "Check your email for a sign-in link." });
  };

  return (
    <form className="card stack" style={{ maxWidth: 420, margin: "0 auto" }} onSubmit={submit}>
      <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
      <span className="muted">Save predictions, sync your slip across devices and track your results.</span>
      <label className="field">Email<input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">Password<input className="input" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn btn-primary" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</button>
      <button type="button" className="btn" disabled={busy} onClick={magic}>Email me a sign-in link</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}</button>
      <span className="subtle">You must be 18 or older where required by local law. This app does not take bets.</span>
    </form>
  );
}
