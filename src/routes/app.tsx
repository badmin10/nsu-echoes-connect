import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, MessageCircle, Heart, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

type Tab = {
  to: "/app" | "/app/matches" | "/app/crush" | "/app/profile";
  label: string;
  icon: typeof Flame;
  exact?: boolean;
};
const TABS: Tab[] = [
  { to: "/app", label: "Discover", icon: Flame, exact: true },
  { to: "/app/matches", label: "Matches", icon: MessageCircle },
  { to: "/app/crush", label: "Crush", icon: Heart },
  { to: "/app/profile", label: "You", icon: UserIcon },
];

function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    const ensure = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      if (!profile?.onboarding_complete) {
        navigate({ to: "/onboarding" });
        return;
      }
      if (active) setChecked(true);
    };
    ensure();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/" });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading your campus…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <ul className="max-w-md mx-auto grid grid-cols-4">
          {TABS.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex flex-col items-center justify-center py-3 text-xs gap-1 ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
