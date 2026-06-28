import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DBProfile } from "@/lib/nsu";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — NSUMatch" }] }),
  component: Admin,
});

const ADMIN_CODE = "nsu-admin";
const REJECT_REASONS = ["Blurry Photo", "Wrong School ID", "Photo mismatch", "Expired ID"];

type LocalStatus = Record<string, { status: "pending" | "approved" | "rejected"; reason?: string }>;
const LS_KEY = "nsumatch:admin-status";

function loadStatus(): LocalStatus {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStatus(s: LocalStatus) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function Admin() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [queue, setQueue] = useState<DBProfile[]>([]);
  const [active, setActive] = useState(0);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [statusMap, setStatusMap] = useState<LocalStatus>({});

  useEffect(() => {
    if (!unlocked) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("onboarding_complete", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => setQueue((data as DBProfile[]) ?? []));
    setStatusMap(loadStatus());
  }, [unlocked]);

  if (!unlocked) {
    return (
      <div className="min-h-screen grid place-items-center px-6 bg-background">
        <div className="max-w-sm w-full rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="font-bold">Admin sign-in</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Demo passcode: <code className="bg-muted px-1.5 py-0.5 rounded">nsu-admin</code>
          </p>
          <Input
            placeholder="Passcode"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setUnlocked(code === ADMIN_CODE)}
          />
          <Button className="w-full" onClick={() => setUnlocked(code === ADMIN_CODE)}>
            Unlock
          </Button>
          <Link to="/" className="block text-xs text-center text-muted-foreground hover:underline">
            ← Back to app
          </Link>
        </div>
      </div>
    );
  }

  const current = queue[active];
  const statusFor = (p: DBProfile) =>
    statusMap[p.id]?.status ?? (p.verified ? "approved" : "pending");

  const approve = async () => {
    if (!current) return;
    await supabase.from("profiles").update({ verified: true }).eq("id", current.id);
    const next = { ...statusMap, [current.id]: { status: "approved" as const } };
    setStatusMap(next);
    saveStatus(next);
    setQueue((q) => q.map((p) => (p.id === current.id ? { ...p, verified: true } : p)));
  };
  const reject = async () => {
    if (!current) return;
    await supabase.from("profiles").update({ verified: false }).eq("id", current.id);
    const next = { ...statusMap, [current.id]: { status: "rejected" as const, reason } };
    setStatusMap(next);
    saveStatus(next);
    setQueue((q) => q.map((p) => (p.id === current.id ? { ...p, verified: false } : p)));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="h-8 w-8 grid place-items-center rounded-full hover:bg-accent">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-bold">NSUMatch · Admin</h1>
        </div>
        <span className="text-xs text-muted-foreground">{queue.length} profiles</span>
      </header>

      <div className="grid md:grid-cols-[260px_1fr] min-h-[calc(100vh-49px)]">
        <aside className="border-r border-border bg-card/40 p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-49px)]">
          {queue.map((p, i) => {
            const s = statusFor(p);
            return (
              <button
                key={p.id}
                onClick={() => setActive(i)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm ${
                  i === active ? "bg-accent" : "hover:bg-accent/60"
                }`}
              >
                <img src={p.photo_url} alt="" className="h-9 w-9 rounded-md object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.first_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.department} • {p.major}
                  </p>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    s === "pending"
                      ? "bg-gold text-gold-foreground"
                      : s === "approved"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {s}
                </span>
              </button>
            );
          })}
          {queue.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No profiles yet.</p>
          )}
        </aside>

        <main className="p-4 md:p-6">
          {current && (
            <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
                  Uploaded Student ID
                </div>
                <div className="aspect-[4/3] bg-muted grid place-items-center">
                  <img
                    src="https://images.unsplash.com/photo-1606166187734-a4cb74079037?w=800&q=80"
                    alt="Student ID placeholder"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3 text-xs text-muted-foreground">
                  Cross-check: <strong className="text-foreground">Name</strong> +{" "}
                  <strong className="text-foreground">Photo</strong>. Student ID number may be
                  covered.
                </div>
              </div>

              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
                  Submitted profile
                </div>
                <img src={current.photo_url} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">
                      {current.first_name}, {current.age}
                    </h2>
                    {current.verified && <BadgeCheck className="h-5 w-5 text-sky-500" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{current.email}</p>
                  <p className="text-sm">
                    <span className="font-medium">{current.department}</span> • {current.major}
                  </p>
                  <p className="text-sm">{current.bio}</p>
                  {statusMap[current.id]?.status === "rejected" && (
                    <p className="text-xs text-destructive">
                      Rejected: {statusMap[current.id].reason}
                    </p>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col md:flex-row gap-3">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={approve}
                >
                  Approve account
                </Button>
                <div className="flex-1 flex gap-2">
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REJECT_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" onClick={reject}>
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
