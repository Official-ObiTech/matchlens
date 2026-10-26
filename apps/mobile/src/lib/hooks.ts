import type { Session } from "@supabase/supabase-js";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "./api";
import { supabase } from "./supabase";

export function useApi<T>(key: string | null, fetcher: () => Promise<T>, opts: { refetchOnFocus?: boolean } = {}) {
  const [state, setState] = useState<{ data: T | null; error: ApiRequestError | null; loading: boolean; refreshing: boolean; forKey: string | null }>({ data: null, error: null, loading: key != null, refreshing: false, forKey: null });
  const [nonce, setNonce] = useState(0);
  const ref = useRef(fetcher);
  ref.current = fetcher;
  useEffect(() => {
    if (key == null) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: s.data == null, error: null }));
    ref
      .current()
      .then((data) => !cancelled && setState({ data, error: null, loading: false, refreshing: false, forKey: key }))
      .catch((e) => !cancelled && setState((s) => ({ ...s, error: e instanceof ApiRequestError ? e : new ApiRequestError(0, "error", String(e)), loading: false, refreshing: false, forKey: key })));
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, refreshing: true }));
    setNonce((n) => n + 1);
  }, []);
  useFocusEffect(useCallback(() => { if (opts.refetchOnFocus) setNonce((n) => n + 1); }, [opts.refetchOnFocus]));
  // Until something has been fetched for the current key, report loading (avoids a render with loading=false and data=null).
  const loading = key != null && (state.loading || (state.forKey !== key && state.data == null));
  return { ...state, loading, reload };
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready, configured: supabase != null };
}
