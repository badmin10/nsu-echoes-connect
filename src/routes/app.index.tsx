import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Heart, X } from "lucide-react";
import {
  MOCK_PROFILES,
  type Profile,
  useAppState,
  useUser,
} from "@/lib/nsu-store";
import { ProfileCard } from "@/components/nsu/ProfileCard";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Discover — NSUMatch" }] }),
  component: Discover,
});

function TeaCup({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
      <path d="M16 11h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 4c0 1-1 1.5-1 2.5S8 8 8 9" />
      <path d="M12 4c0 1-1 1.5-1 2.5S12 8 12 9" />
      <path d="M3 21h14" />
    </svg>
  );
}

function Discover() {
  const [user] = useUser();
  const [state, setState] = useAppState();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  const deck = useMemo<Profile[]>(() => {
    const seen = new Set([...state.liked, ...state.passed]);
    const ghost = new Set(user?.ghostFromDepts ?? []);
    return MOCK_PROFILES.filter((p) => !seen.has(p.id) && !ghost.has(p.department));
  }, [state.liked, state.passed, user]);

  const current = deck[0];

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const pass = () => {
    if (!current) return;
    setState((s) => ({ ...s, passed: [...s.passed, current.id] }));
  };
  const like = () => {
    if (!current) return;
    // demo: 50% reciprocate
    const matched = Math.random() > 0.4;
    setState((s) => ({
      ...s,
      liked: [...s.liked, current.id],
      matches: matched ? Array.from(new Set([...s.matches, current.id])) : s.matches,
    }));
    if (matched) flash(`It's a match with ${current.firstName}! 💛`);
  };
  const sendTea = () => {
    if (!current) return;
    setState((s) => ({
      ...s,
      teaSent: [...s.teaSent, current.id],
      liked: [...s.liked, current.id],
      matches: Array.from(new Set([...s.matches, current.id])),
    }));
    flash(`You sent ${current.firstName} a cup of tea ☕`);
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Discover</h1>
          <p className="text-xs text-muted-foreground">Verified NSU students near you</p>
        </div>
        <button
          onClick={() => navigate({ to: "/app/profile" })}
          className="h-10 w-10 rounded-full overflow-hidden border border-border"
          aria-label="Open profile"
        >
          {user && <img src={user.photo} alt="" className="h-full w-full object-cover" />}
        </button>
      </header>

      <div className="relative aspect-[3/4.5] w-full">
        {deck.slice(0, 3).reverse().map((p, idx, arr) => {
          const isTop = idx === arr.length - 1;
          const depth = arr.length - 1 - idx;
          return (
            <div
              key={p.id}
              className="absolute inset-0 transition-transform"
              style={{
                transform: `translateY(${depth * 8}px) scale(${1 - depth * 0.04})`,
                zIndex: idx,
                pointerEvents: isTop ? "auto" : "none",
              }}
            >
              <ProfileCard profile={p} viewer={user} />
            </div>
          );
        })}

        {!current && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-muted text-center p-6">
            <div>
              <p className="text-lg font-semibold">You've seen everyone for now</p>
              <p className="text-sm text-muted-foreground mt-1">
                Check back after class — new students join daily.
              </p>
            </div>
          </div>
        )}
      </div>

      {current && (
        <div className="mt-6 flex items-center justify-center gap-5">
          <button
            onClick={pass}
            className="h-14 w-14 rounded-full bg-card border border-border grid place-items-center text-destructive hover:scale-105 transition"
            aria-label="Pass"
          >
            <X className="h-7 w-7" />
          </button>
          <button
            onClick={sendTea}
            className="h-12 w-12 rounded-full bg-gold text-gold-foreground grid place-items-center hover:scale-105 transition gold-glow"
            aria-label="Send a Tea"
            title="Send a Tea"
          >
            <TeaCup className="h-7 w-7" />
          </button>
          <button
            onClick={like}
            className="h-14 w-14 rounded-full bg-primary text-primary-foreground grid place-items-center hover:scale-105 transition"
            aria-label="Like"
          >
            <Heart className="h-7 w-7 fill-current" />
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
