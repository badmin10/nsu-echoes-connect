import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Heart, X, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  LOCATIONS,
  type LocationKey,
} from "@/lib/nsu";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { supabase } from "@/integrations/supabase/client";
import { ProfileCard } from "@/components/nsu/ProfileCard";
import { SwipeCard } from "@/components/nsu/SwipeCard";

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

function Discover() {
  const { session } = useSession();
  const { profile: me } = useMyProfile(session);
  const navigate = useNavigate();

  const [all, setAll] = useState<DBProfile[]>([]);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [toast, setToast] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!me) return;
    const [{ data: profiles }, { data: swipes }] = await Promise.all([
      supabase.from("profiles").select("*").eq("onboarding_complete", true).neq("id", me.id),
      supabase.from("swipes").select("to_profile_id").eq("from_profile_id", me.id),
    ]);
    setAll((profiles as DBProfile[]) ?? []);
    setSwipedIds(new Set((swipes ?? []).map((s) => s.to_profile_id)));
  }, [me?.id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const deck = useMemo<DBProfile[]>(() => {
    if (!me) return [];
    const ghost = new Set(me.ghost_from_depts);
    return all.filter((p) => {
      if (swipedIds.has(p.id)) return false;
      if (ghost.has(p.department)) return false;
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

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const swipe = async (action: "like" | "pass" | "tea") => {
    if (!current || !me) return;
    const target = current;
    // optimistic
    setSwipedIds((s) => new Set([...s, target.id]));
    const { error } = await supabase.from("swipes").insert({
      from_profile_id: me.id,
      to_profile_id: target.id,
      action,
    });
    if (error) {
      // rollback on real failure (ignore duplicate-unique error)
      if (!/duplicate/i.test(error.message)) {
        setSwipedIds((s) => {
          const next = new Set(s);
          next.delete(target.id);
          return next;
        });
        flash("Couldn't save that swipe. Try again.");
        return;
      }
    }
    if (action === "pass") return;
    // Check reciprocity for match toast
    const { data: reverse } = await supabase
      .from("swipes")
      .select("action")
      .eq("from_profile_id", target.id)
      .eq("to_profile_id", me.id)
      .in("action", ["like", "tea"])
      .maybeSingle();
    if (reverse) flash(`It's a match with ${target.first_name}! 💛`);
    else if (action === "tea") flash(`You sent ${target.first_name} a cup of tea ☕`);
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Discover</h1>
          <p className="text-xs text-muted-foreground">Verified NSU students near you</p>
        </div>
        <div className="flex items-center gap-2">
          <FiltersSheet filters={filters} onChange={setFilters} />
          <button
            onClick={() => navigate({ to: "/app/profile" })}
            className="h-10 w-10 rounded-full overflow-hidden border border-border"
            aria-label="Open profile"
          >
            {me && <img src={me.photo_url} alt="Your profile photo" className="h-full w-full object-cover" />}
          </button>
        </div>
      </header>

      <div className="relative aspect-[3/4.5] w-full">
        {deck.slice(0, 3).reverse().map((p, idx, arr) => {
          const isTop = idx === arr.length - 1;
          const depth = arr.length - 1 - idx;
          return (
            <SwipeCard
              key={p.id}
              profile={p}
              viewer={me}
              isTop={isTop}
              depth={depth}
              onSwipe={(dir) => swipe(dir === "right" ? "like" : "pass")}
            />
          );
        })}

        {!current && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-muted text-center p-6">
            <div>
              <p className="text-lg font-semibold">No one matches your filters</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try widening your filters or check back later.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                Reset filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {current && (
        <div className="mt-6 flex items-center justify-center gap-5">
          <button
            onClick={() => swipe("pass")}
            className="h-14 w-14 rounded-full bg-card border border-border grid place-items-center text-destructive hover:scale-105 transition"
            aria-label="Pass"
          >
            <X className="h-7 w-7" />
          </button>
          <button
            onClick={() => swipe("tea")}
            className="h-12 w-12 rounded-full bg-gold text-gold-foreground grid place-items-center hover:scale-105 transition gold-glow"
            aria-label="Send a Tea"
            title="Send a Tea"
          >
            <TeaCup className="h-7 w-7" />
          </button>
          <button
            onClick={() => swipe("like")}
            className="h-14 w-14 rounded-full bg-primary text-primary-foreground grid place-items-center hover:scale-105 transition"
            aria-label="Like"
          >
            <Heart className="h-7 w-7 fill-current" />
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Tip: drag the card left to pass, right to like.
      </p>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function FiltersSheet({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
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
          className="h-10 w-10 rounded-full border border-border grid place-items-center text-foreground hover:bg-accent"
          aria-label="Filters"
        >
          <Filter className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-6">
          <section className="space-y-2">
            <Label>Departments</Label>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map((d) => {
                const on = filters.departments.includes(d.value);
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleDept(d.value)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
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

          <section className="space-y-2">
            <Label>
              Age {filters.ageRange[0]} – {filters.ageRange[1]}
            </Label>
            <Slider
              min={17}
              max={40}
              step={1}
              value={filters.ageRange}
              onValueChange={(v) =>
                onChange({ ...filters, ageRange: [v[0], v[1]] as [number, number] })
              }
            />
          </section>

          <section className="space-y-2">
            <Label>Currently at</Label>
            <Select
              value={filters.location}
              onValueChange={(v) => onChange({ ...filters, location: v as LocationKey | "any" })}
            >
              <SelectTrigger>
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
            <Label>Has free slot at</Label>
            <Select
              value={filters.slot}
              onValueChange={(v) => onChange({ ...filters, slot: v })}
            >
              <SelectTrigger>
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

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-1">
                  <BadgeCheck className="h-4 w-4 text-sky-500" /> Verified only
                </Label>
                <p className="text-xs text-muted-foreground">Show ID-verified students only.</p>
              </div>
              <Switch
                checked={filters.verifiedOnly}
                onCheckedChange={(v) => onChange({ ...filters, verifiedOnly: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Mutual free slot</Label>
                <p className="text-xs text-muted-foreground">
                  Only show people who share at least one slot with you.
                </p>
              </div>
              <Switch
                checked={filters.mutualSlotOnly}
                onCheckedChange={(v) => onChange({ ...filters, mutualSlotOnly: v })}
              />
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onChange(DEFAULT_FILTERS)}>
              Reset
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

void ProfileCard;
