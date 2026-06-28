import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: Callback,
});

function Callback() {
  const navigate = useNavigate();
  useEffect(() => {
    // The Supabase client auto-parses tokens from URL hash on load.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      navigate({ to: profile?.onboarding_complete ? "/app" : "/onboarding" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
      Confirming your account…
    </div>
  );
}
