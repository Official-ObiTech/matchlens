"use client";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "./api";
import { browserSupabase } from "./supabase";

export interface ApiState<T> {
  data: T | null;
  error: ApiRequestError | null;
  loading: boolean;
  reload: () => void;
}

/** Minimal fetch-on-change hook. `key` changes trigger a refetch; null disables. */
export function useApi<T>(key: string | null, fetcher: () => Promise<T>): ApiState<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiRequestError | null; loading: boolean; forKey: string | null }>({ data: null, error: null, loading: key != null, forKey: null });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    if (key == null) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => !cancelled && setState({ data, error: null, loading: false, forKey: key }))
      .catch((e) => !cancelled && setState({ data: null, error: e instanceof ApiRequestError ? e : new ApiRequestError(0, "error", String(e)), loading: false, forKey: key }));
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // Until the effect has fetched for the current key, report loading (avoids a render with loading=false and data=null).
  const loading = key != null && (state.loading || state.forKey !== key);
  return { data: state.data, error: loading ? null : state.error, loading, reload };
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) {
      setReady(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready, configured: browserSupabase() != null };
}

export function useRole(session: Session | null) {
  return useApi(session ? `me:${session.user.id}` : null, () => api<{ role: "user" | "admin" }>("/me"));
}
