import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_COLUMNS, type DBProfile } from "./nsu";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authChanged = false;
    // Subscribe FIRST (per Supabase guidance), then fetch existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      authChanged = true;
      setSession(s);
      setLoading(false);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && !authChanged) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && !authChanged) setLoading(false);
      });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export function useMyProfile(session: Session | null) {
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef({ version: 0 });
  const userId = session?.user.id;
  const email = session?.user.email ?? "";

  const refetch = useCallback(async () => {
    const version = ++requestVersion.current.version;
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      const { data: review, error: reviewError } = data
        ? await supabase.rpc("get_profile_verification", { target: data.id })
        : { data: null, error: null };
      if (reviewError) throw reviewError;
      if (version !== requestVersion.current.version) return;
      // email is not selectable on profiles; take it from the auth session.
      setProfile(
        data
          ? ({
              ...data,
              id_card_path: null,
              verification_note: null,
              ...review?.[0],
              email,
            } as DBProfile)
          : null,
      );
    } catch {
      if (version === requestVersion.current.version) {
        setProfile(null);
        setError("Couldn't load your profile. Check your connection and try again.");
      }
    } finally {
      if (version === requestVersion.current.version) setLoading(false);
    }
  }, [userId, email]);

  useEffect(() => {
    const requestState = requestVersion.current;
    refetch();
    return () => {
      requestState.version++;
    };
  }, [refetch]);

  return {
    profile: profile?.user_id === userId ? profile : null,
    loading,
    error,
    refetch,
    setProfile,
  };
}

const THEME_KEY = "nsumatch:theme";

/** Persisted dark mode. The initial class is applied by an inline script in __root. */
export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = (v: boolean) => {
    document.documentElement.classList.toggle("dark", v);
    try {
      localStorage.setItem(THEME_KEY, v ? "dark" : "light");
    } catch {
      // ignore
    }
    setDark(v);
  };
  return { dark, setDark: toggle };
}

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;
