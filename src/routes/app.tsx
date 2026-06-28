import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { loadUser } from "@/lib/nsu-store";
import { Flame, MessageCircle, Heart, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const TABS = [
  { to: "/app", label: "Discover", icon: Flame, exact: true },
  { to: "/app/matches", label: "Matches", icon: MessageCircle },
  { to: "/app/crush", label: "Crush", icon: Heart },
  { to: "/app/profile", label: "You", icon: UserIcon },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loadUser()) navigate({ to: "/" });
  }, [navigate]);

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
