import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, MessageCircle, Heart, ShieldAlert, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SplashLoader } from "@/components/nsu/SplashLoader";
import { useUnreadCount } from "@/lib/messages";

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
  { to: "/app/matches", label: "Chats", icon: MessageCircle },
  { to: "/app/crush", label: "Crush", icon: Heart },
  { to: "/app/profile", label: "You", icon: UserIcon },
];

/**
 * Keeps --app-height equal to the *visible* viewport. iOS Safari doesn't
 * shrink 100dvh when the keyboard opens, which pushes fixed headers/inputs
 * off-screen; visualViewport does report the real height.
 */
function useAppHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
      // iOS scrolls the layout viewport when focusing inputs; pin it back.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      root.style.removeProperty("--app-height");
    };
  }, []);
}

function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [checked, setChecked] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);
  const [gateError, setGateError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const unread = useUnreadCount(meId);
  useAppHeight();

  useEffect(() => {
    let active = true;
    setGateError(false);
    const ensure = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id,onboarding_complete,banned")
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      if (!active) return;
      if (error) throw error;
      if (!profile?.onboarding_complete) {
        navigate({ to: "/onboarding" });
        return;
      }
      if (active) {
        setBanned(profile.banned);
        setMeId(profile.id);
        setChecked(true);
      }
    };
    ensure().catch(() => {
      if (active) setGateError(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setChecked(false);
        setMeId(null);
        navigate({ to: "/" });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, attempt]);

  if (gateError)
    return (
      <main className="min-h-app grid place-items-center px-6 bg-background">
        <div role="alert" className="max-w-sm rounded-3xl border bg-card p-6 text-center">
          <h1 className="text-xl font-bold">Couldn't load your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection, then give it another try.
          </p>
          <button
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-5 h-12 w-full rounded-full bg-primary text-primary-foreground font-semibold"
          >
            Try again
          </button>
        </div>
      </main>
    );

  if (!checked) return <SplashLoader />;

  if (banned) {
    return (
      <div className="min-h-app grid place-items-center bg-background px-6 pt-safe pb-safe text-center">
        <div className="max-w-sm">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 text-2xl font-black">Account suspended</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your NSUMatch account was suspended after a review of reports from other students. If
            you think this is a mistake, contact the NSUMatch team.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 h-12 w-full rounded-full border border-border font-semibold active:bg-accent"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Chat is a full-screen conversation, like every native dating app.
  const hideNav = pathname.startsWith("/app/chat");

  return (
    <div className="h-app flex flex-col overflow-hidden bg-background pl-safe pr-safe">
      <main
        id="app-scroll"
        className={`flex-1 min-h-0 ${hideNav ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
      >
        <Outlet />
      </main>
      {!hideNav && (
        <nav
          aria-label="Main"
          className="shrink-0 z-40 border-t border-border bg-card/90 backdrop-blur-xl supports-[backdrop-filter]:bg-card/75 pb-safe"
        >
          <ul className="max-w-md mx-auto grid grid-cols-4">
            {TABS.map(({ to, label, icon: Icon, exact }) => {
              const active = exact
                ? pathname === to || pathname === `${to}/`
                : pathname.startsWith(to);
              const badge = to === "/app/matches" ? unread : 0;
              return (
                <li key={to}>
                  <Link
                    to={to}
                    aria-current={active ? "page" : undefined}
                    aria-label={badge ? `${label}, ${badge} unread` : undefined}
                    className={`group flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`relative grid h-8 w-14 place-items-center rounded-full transition-all duration-200 ${
                        active ? "bg-primary/10 scale-100" : "scale-90 group-active:scale-95"
                      }`}
                    >
                      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
                      {badge > 0 && (
                        <span className="absolute -top-1 right-1.5 h-[18px] min-w-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-card">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
