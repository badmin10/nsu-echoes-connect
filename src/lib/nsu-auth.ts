import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { DBProfile } from "./nsu";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe FIRST (per Supabase guidance), then fetch existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useMyProfile(session: Session | null) {
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = async () => {
    if (!session) {
      setProfile(null);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    setProfile((data as DBProfile | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    refetch();
  }, [session?.user.id]);

  return { profile, loading, refetch, setProfile };
}
