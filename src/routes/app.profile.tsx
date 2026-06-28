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
  saveUser,
  useUser,
} from "@/lib/nsu-store";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [{ title: "Your profile — NSUMatch" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const [user] = useUser();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDark(isDark);
  }, []);

  const toggleDark = (v: boolean) => {
    document.documentElement.classList.toggle("dark", v);
    setDark(v);
  };

  if (!user) return null;

  const updateUser = (patch: Partial<typeof user>) => saveUser({ ...user, ...patch });

  const toggleSlot = (s: string) => {
    const has = user.freeSlots.includes(s);
    updateUser({
      freeSlots: has ? user.freeSlots.filter((x) => x !== s) : [...user.freeSlots, s],
    });
  };

  const toggleGhost = (d: Department) => {
    const has = user.ghostFromDepts.includes(d);
    updateUser({
      ghostFromDepts: has
        ? user.ghostFromDepts.filter((x) => x !== d)
        : [...user.ghostFromDepts, d],
    });
  };

  const logout = () => {
    saveUser(null);
    navigate({ to: "/" });
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
      <div className="flex items-center gap-4">
        <img src={user.photo} alt="" className="h-20 w-20 rounded-2xl object-cover" />
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-black">
              {user.firstName}, {user.age}
            </h1>
            {user.verified && <BadgeCheck className="h-5 w-5 text-sky-500" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {user.department} • {user.major}
          </p>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user.email}</p>
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
        <Select value={user.location} onValueChange={(v) => updateUser({ location: v as never })}>
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
            const on = user.freeSlots.includes(s);
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
            const on = user.ghostFromDepts.includes(d.value);
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
