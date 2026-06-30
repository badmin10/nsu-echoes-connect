import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ALL_SLOTS,
  DEPARTMENTS,
  LOCATIONS,
  type Department,
  type LocationKey,
} from "@/lib/nsu";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [{ title: "Your profile — NSUMatch" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session } = useSession();
  const { profile, refetch } = useMyProfile(session);
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleDark = (v: boolean) => {
    document.documentElement.classList.toggle("dark", v);
    setDark(v);
  };

  if (!profile) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  const update = async (patch: Partial<typeof profile>) => {
    await supabase.from("profiles").update(patch).eq("id", profile.id);
    refetch();
  };

  const toggleSlot = (s: string) => {
    const has = profile.free_slots.includes(s);
    update({ free_slots: has ? profile.free_slots.filter((x) => x !== s) : [...profile.free_slots, s] });
  };

  const toggleGhost = (d: Department) => {
    const has = profile.ghost_from_depts.includes(d);
    update({
      ghost_from_depts: has
        ? profile.ghost_from_depts.filter((x) => x !== d)
        : [...profile.ghost_from_depts, d],
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
      <div className="flex items-center gap-4">
        <img src={profile.photo_url} alt={`Profile photo of ${profile.first_name}`} className="h-20 w-20 rounded-2xl object-cover" />
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-black">
              {profile.first_name}, {profile.age}
            </h1>
            {profile.verified && <BadgeCheck className="h-5 w-5 text-sky-500" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {profile.department} • {profile.major}
          </p>
          <p className="text-xs text-muted-foreground truncate max-w-[220px]">{profile.email}</p>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label>Dark mode</Label>
          <div className="flex items-center gap-2">
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            <Switch checked={dark} onCheckedChange={toggleDark} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <Label className="text-base">📍 Meet me at...</Label>
        <Select
          value={profile.location}
          onValueChange={(v) => update({ location: v as LocationKey })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map((l) => (
              <SelectItem key={l.key} value={l.key}>
                {l.emoji} {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <Label className="text-base">🕒 Free slots</Label>
        <p className="text-xs text-muted-foreground">
          We'll highlight mutual slots on your matches' cards.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_SLOTS.map((s) => {
            const on = profile.free_slots.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSlot(s)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div>
          <Label className="text-base">👻 Ghost Mode</Label>
          <p className="text-xs text-muted-foreground">
            Hide your profile from selected departments (e.g., your own major or relatives on
            campus).
          </p>
        </div>
        <div className="space-y-2">
          {DEPARTMENTS.map((d) => {
            const on = profile.ghost_from_depts.includes(d.value);
            return (
              <div key={d.value} className="flex items-center justify-between">
                <span className="text-sm">{d.label}</span>
                <Switch checked={on} onCheckedChange={() => toggleGhost(d.value)} />
              </div>
            );
          })}
        </div>
      </section>

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}
