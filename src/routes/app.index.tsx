import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Heart, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_SLOTS,
  DEPARTMENTS,
  type DBProfile,
  type Department,
  haptic,
  LOCATIONS,
  type LocationKey,
  PROFILE_COLUMNS,
} from "@/lib/nsu";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { supabase } from "@/integrations/supabase/client";
import { SwipeCard, type SwipeCardHandle, type SwipeDir } from "@/components/nsu/SwipeCard";
import { ProfileDetails } from "@/components/nsu/ProfileDetails";
import { MatchCelebration } from "@/components/nsu/MatchCelebration";
import { ReportSheet } from "@/components/nsu/Safety";
import { notify } from "@/lib/push";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Discover — NSUMatch" },
      {
        name: "description",
        content:
          "Swipe through verified NSU students. Filter by department, age, campus location, and shared free slots.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Discover,
});

function TeaCup({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
      <path d="M16 11h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 4c0 1-1 1.5-1 2.5S8 8 8 9" />
      <path d="M12 4c0 1-1 1.5-1 2.5S12 8 12 9" />
      <path d="M3 21h14" />
    </svg>
  );
}

type Filters = {
  departments: Department[];
  ageRange: [number, number];
  location: LocationKey | "any";
  slot: string | "any";
  verifiedOnly: boolean;
  mutualSlotOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  departments: [],
  ageRange: [18, 30],
  location: "any",
  slot: "any",
  verifiedOnly: false,
  mutualSlotOnly: false,
};

const FILTERS_KEY = "nsumatch:filters";

function countActive(f: Filters) {
  let n = 0;
  if (f.departments.length) n++;
  if (
    f.ageRange[0] !== DEFAULT_FILTERS.ageRange[0] ||
    f.ageRange[1] !== DEFAULT_FILTERS.ageRange[1]
  )
    n++;
  if (f.location !== "any") n++;
  if (f.slot !== "any") n++;
  if (f.verifiedOnly) n++;
  if (f.mutualSlotOnly) n++;
  return n;
}

type Action = "like" | "pass" | "tea";
const DIR_TO_ACTION: Record<SwipeDir, Action> = { right: "like", left: "pass", up: "tea" };

function Discover() {
  const { session } = useSession();
  const { profile: me, error: profileError, refetch: refetchProfile } = useMyProfile(session);
  const meId = me?.id;
  const navigate = useNavigate();

  const [all, setAll] = useState<DBProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [filters, setFiltersState] = useState<Filters>(DEFAULT_FILTERS);
  const [lastPass, setLastPass] = useState<DBProfile | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [match, setMatch] = useState<DBProfile | null>(null);
  const [reporting, setReporting] = useState<DBProfile | null>(null);
  const topRef = useRef<SwipeCardHandle>(null);

  // Remember filters between visits.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) setFiltersState({ ...DEFAULT_FILTERS, ...JSON.parse(raw) });
    } catch {
      // ignore
    }
  }, []);
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
    } catch {
      // ignore
    }
  };

  const refetch = useCallback(async () => {
    if (!meId) return;
    setLoadError(false);
    try {
      const [{ data: profiles, error }, { data: swipes, error: swipeError }] = await Promise.all([
        supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .eq("onboarding_complete", true)
          .neq("id", meId),
        supabase.from("swipes").select("to_profile_id").eq("from_profile_id", meId),
      ]);
      if (error || swipeError) throw error ?? swipeError;
      setAll((profiles as unknown as DBProfile[]) ?? []);
      setSwipedIds(new Set((swipes ?? []).map((s) => s.to_profile_id)));
      setLoaded(true);
    } catch {
      setLoadError(true);
      setLoaded(true);
    }
  }, [meId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const deck = useMemo<DBProfile[]>(() => {
    if (!me) return [];
    const myGhost = new Set(me.ghost_from_depts);
    return all.filter((p) => {
      if (swipedIds.has(p.id)) return false;
      // Ghost Mode: they hid themselves from my department…
      if ((p.ghost_from_depts ?? []).includes(me.department)) return false;
      // …or I hid myself from theirs (keep it mutual so nobody gets a one-sided view).
      if (myGhost.has(p.department)) return false;
      if (filters.departments.length && !filters.departments.includes(p.department)) return false;
      if (p.age < filters.ageRange[0] || p.age > filters.ageRange[1]) return false;
      if (filters.location !== "any" && p.location !== filters.location) return false;
      if (filters.slot !== "any" && !p.free_slots.includes(filters.slot)) return false;
      if (filters.verifiedOnly && !p.verified) return false;
      if (filters.mutualSlotOnly && !p.free_slots.some((s) => me.free_slots.includes(s)))
        return false;
      return true;
    });
  }, [all, swipedIds, me, filters]);

  const current = deck[0];

  const recordSwipe = async (target: DBProfile, action: Action) => {
    if (!me) return;
    setSwipedIds((s) => new Set([...s, target.id]));
    setLastPass(action === "pass" ? target : null);
    const { error } = await supabase.from("swipes").insert({
      from_profile_id: me.id,
      to_profile_id: target.id,
      action,
    });
    if (error && !/duplicate/i.test(error.message)) {
      setSwipedIds((s) => {
        const next = new Set(s);
        next.delete(target.id);
        return next;
      });
      toast.error("Couldn't save that swipe. Check your connection.");
      return;
    }
    if (action === "pass") return;
    const { data: reverse } = await supabase
      .from("swipes")
      .select("action")
      .eq("from_profile_id", target.id)
      .eq("to_profile_id", me.id)
      .in("action", ["like", "tea"])
      .maybeSingle();
    if (reverse) {
      haptic(40);
      setMatch(target);
      notify({ type: "match", profile_id: target.id });
    } else if (action === "tea") {
      toast(`☕ You sent ${target.first_name} a cup of tea`, {
        description: "If they like you back, it's a match.",
      });
    }
  };

  const onCardSwiped = (dir: SwipeDir) => {
    if (current) recordSwipe(current, DIR_TO_ACTION[dir]);
  };

  const press = (dir: SwipeDir) => {
    setDetailsOpen(false);
    if (topRef.current) topRef.current.swipe(dir);
    else onCardSwiped(dir);
  };

  const rewind = async () => {
    if (!me || !lastPass) return;
    const target = lastPass;
    setLastPass(null);
    haptic(15);
    const { error } = await supabase
      .from("swipes")
      .delete()
      .eq("from_profile_id", me.id)
      .eq("to_profile_id", target.id);
    if (error) {
      toast.error("Couldn't undo that one.");
      return;
    }
    // Put them back on top of the deck.
    setAll((list) => [target, ...list.filter((p) => p.id !== target.id)]);
    setSwipedIds((s) => {
      const next = new Set(s);
      next.delete(target.id);
      return next;
    });
  };

  const activeFilters = countActive(filters);

  return (
    <div className="h-full max-w-md mx-auto flex flex-col px-3 pt-safe">
      <header className="flex items-center justify-between px-1 pt-3 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl nsu-gradient text-navy-foreground grid place-items-center font-black">
            N
          </div>
          <div className="leading-tight">
            <h1 className="text-xl font-black tracking-tight">Discover</h1>
            <p className="text-[11px] text-muted-foreground">Verified NSU students</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FiltersSheet
            filters={filters}
            onChange={setFilters}
            active={activeFilters}
            count={deck.length}
          />
          <button
            onClick={() => navigate({ to: "/app/profile" })}
            className="h-11 w-11 rounded-full overflow-hidden ring-2 ring-gold/70 ring-offset-2 ring-offset-background active:scale-95 transition"
            aria-label="Open your profile"
          >
            {me && (
              <ProfilePhoto src={me.photo_url} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        </div>
      </header>

      {/* Card stack fills whatever height is left — works from iPhone SE to Pro Max. */}
      <div className="relative flex-1 min-h-0">
        {loadError || profileError ? (
          <div
            role="alert"
            className="absolute inset-0 rounded-[28px] border bg-card grid place-items-center p-6 text-center"
          >
            <div>
              <h2 className="text-xl font-bold">Let's try that again</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Couldn't load profiles. Check your connection and retry.
              </p>
              <Button
                className="mt-5 rounded-full"
                onClick={() => (profileError ? refetchProfile() : refetch())}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : !loaded ? (
          <div className="absolute inset-0 rounded-[28px] bg-muted overflow-hidden">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-accent" />
            <div className="absolute bottom-6 left-5 right-5 space-y-3">
              <div className="h-8 w-40 rounded-lg bg-background/40" />
              <div className="h-4 w-56 rounded bg-background/30" />
            </div>
          </div>
        ) : (
          deck
            .slice(0, 3)
            .reverse()
            .map((p, idx, arr) => {
              const isTop = idx === arr.length - 1;
              return (
                <SwipeCard
                  key={p.id}
                  ref={isTop ? topRef : undefined}
                  profile={p}
                  viewer={me}
                  isTop={isTop}
                  depth={arr.length - 1 - idx}
                  onSwipe={onCardSwiped}
                  onOpenDetails={() => setDetailsOpen(true)}
                />
              );
            })
        )}

        {loaded && !loadError && !profileError && !current && (
          <EmptyDeck
            filtered={activeFilters > 0}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            onRefresh={refetch}
          />
        )}
      </div>

      {/* Action bar */}
      <div className="shrink-0 flex items-center justify-center gap-4 py-4">
        <ActionButton
          label="Undo last pass"
          onClick={rewind}
          disabled={!lastPass}
          className="h-12 w-12 text-amber-500"
        >
          <RotateCcw className="h-5 w-5" strokeWidth={2.5} />
        </ActionButton>
        <ActionButton
          label="Pass"
          onClick={() => press("left")}
          disabled={!current}
          className="h-16 w-16 text-rose-500"
        >
          <X className="h-8 w-8" strokeWidth={2.75} />
        </ActionButton>
        <ActionButton
          label="Send a Tea (super like)"
          onClick={() => press("up")}
          disabled={!current}
          className="h-12 w-12 !bg-gold text-gold-foreground gold-glow !ring-0"
        >
          <TeaCup className="h-6 w-6" />
        </ActionButton>
        <ActionButton
          label="Like"
          onClick={() => press("right")}
          disabled={!current}
          className="h-16 w-16 !bg-gradient-to-br from-emerald-400 to-emerald-600 text-white !ring-0"
        >
          <Heart className="h-8 w-8 fill-current" />
        </ActionButton>
      </div>

      <ProfileDetails
        profile={current ?? null}
        viewer={me}
        open={detailsOpen && !!current}
        onOpenChange={setDetailsOpen}
        onPass={() => press("left")}
        onLike={() => press("right")}
        onReport={() => {
          setReporting(current ?? null);
          setDetailsOpen(false);
        }}
      />

      {reporting && me && (
        <ReportSheet
          profile={reporting}
          meId={me.id}
          open={!!reporting}
          onOpenChange={(v) => !v && setReporting(null)}
          onDone={() => {
            // Reported (and maybe blocked): take them out of the deck either way.
            const gone = reporting.id;
            setAll((list) => list.filter((p) => p.id !== gone));
            setReporting(null);
          }}
        />
      )}

      <MatchCelebration
        me={me}
        them={match}
        open={!!match}
        onClose={() => setMatch(null)}
        onMessage={() => {
          const id = match?.id;
          setMatch(null);
          if (id) navigate({ to: "/app/chat/$id", params: { id } });
        }}
      />
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-full bg-card shadow-[0_8px_24px_-8px_rgba(10,15,40,0.35)] ring-1 ring-border grid place-items-center transition active:scale-90 disabled:opacity-35 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

function EmptyDeck({
  filtered,
  onReset,
  onRefresh,
}: {
  filtered: boolean;
  onReset: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center rounded-[28px] bg-muted/60 border border-dashed border-border text-center p-8">
      <div>
        <div className="mx-auto h-20 w-20 rounded-full nsu-gradient grid place-items-center text-3xl animate-float">
          🎓
        </div>
        <p className="mt-5 text-lg font-bold">
          {filtered ? "No one matches your filters" : "You've seen everyone for now"}
        </p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-[16rem] mx-auto">
          {filtered
            ? "Try widening your filters to see more NSU students."
            : "New students join every day. Check back between classes!"}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {filtered && (
            <Button className="h-11 rounded-full px-5" onClick={onReset}>
              Reset filters
            </Button>
          )}
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

function FiltersSheet({
  filters,
  onChange,
  active,
  count,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  active: number;
  count: number;
}) {
  const toggleDept = (d: Department) => {
    const has = filters.departments.includes(d);
    onChange({
      ...filters,
      departments: has ? filters.departments.filter((x) => x !== d) : [...filters.departments, d],
    });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="relative h-11 w-11 rounded-full border border-border bg-card grid place-items-center text-foreground active:scale-95 transition"
          aria-label={active ? `Filters (${active} active)` : "Filters"}
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
          {active > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 rounded-full bg-gold text-gold-foreground text-[10px] font-bold grid place-items-center ring-2 ring-background">
              {active}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] max-h-[88dvh] p-0 flex flex-col gap-0 border-0"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/30 shrink-0" />
        <SheetHeader className="px-5 pt-3 pb-2 text-left">
          <SheetTitle className="text-xl font-black">Filters</SheetTitle>
          <SheetDescription>Find the people you actually cross paths with.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3 space-y-7">
          <section className="space-y-3">
            <Label className="text-sm">School</Label>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map((d) => {
                const on = filters.departments.includes(d.value);
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleDept(d.value)}
                    aria-pressed={on}
                    className={`h-10 text-sm px-4 rounded-full border font-medium transition active:scale-95 ${
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between">
              <Label className="text-sm">Age</Label>
              <span className="text-sm font-semibold">
                {filters.ageRange[0]} – {filters.ageRange[1]}
              </span>
            </div>
            <Slider
              min={17}
              max={40}
              step={1}
              value={filters.ageRange}
              onValueChange={(v) =>
                onChange({ ...filters, ageRange: [v[0], v[1]] as [number, number] })
              }
              className="py-2"
            />
          </section>

          <section className="space-y-2">
            <Label className="text-sm">Currently at</Label>
            <Select
              value={filters.location}
              onValueChange={(v) => onChange({ ...filters, location: v as LocationKey | "any" })}
            >
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anywhere on campus</SelectItem>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l.key} value={l.key}>
                    {l.emoji} {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-2">
            <Label className="text-sm">Has a free slot at</Label>
            <Select value={filters.slot} onValueChange={(v) => onChange({ ...filters, slot: v })}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any time</SelectItem>
                {ALL_SLOTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="rounded-2xl border border-border divide-y divide-border">
            <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
              <div>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <BadgeCheck className="h-4 w-4 text-sky-500" /> Verified only
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">ID-verified students only.</p>
              </div>
              <Switch
                checked={filters.verifiedOnly}
                onCheckedChange={(v) => onChange({ ...filters, verifiedOnly: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
              <div>
                <span className="text-sm font-medium">✨ Mutual free slot</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only people who share at least one slot with you.
                </p>
              </div>
              <Switch
                checked={filters.mutualSlotOnly}
                onCheckedChange={(v) => onChange({ ...filters, mutualSlotOnly: v })}
              />
            </label>
          </section>
        </div>

        <div className="shrink-0 flex gap-3 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-border">
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-full"
            onClick={() => onChange(DEFAULT_FILTERS)}
            disabled={active === 0}
          >
            Reset
          </Button>
          <SheetClose asChild>
            <Button className="h-12 flex-[2] rounded-full font-semibold">
              Show {count} {count === 1 ? "person" : "people"}
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
