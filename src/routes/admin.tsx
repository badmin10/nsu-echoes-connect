import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOCK_PROFILES, type Profile } from "@/lib/nsu-store";
import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — NSUMatch" }] }),
  component: Admin,
});

const ADMIN_CODE = "nsu-admin";

type Queue = (Profile & { idCardPhoto: string; status: "pending" | "approved" | "rejected"; reason?: string })[];

const initialQueue: Queue = MOCK_PROFILES.map((p, i) => ({
  ...p,
  idCardPhoto: `https://images.unsplash.com/photo-15${i % 2 ? "23206" : "59526"}48-${i}?w=600&q=80`,
  status: "pending",
}));

const REJECT_REASONS = ["Blurry Photo", "Wrong School ID", "Photo mismatch", "Expired ID"];

function Admin() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [queue, setQueue] = useState<Queue>(initialQueue);
  const [active, setActive] = useState(0);
  const [reason, setReason] = useState(REJECT_REASONS[0]);

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
  const approve = () => {
    setQueue((q) => q.map((p, i) => (i === active ? { ...p, status: "approved" } : p)));
  };
  const reject = () => {
    setQueue((q) => q.map((p, i) => (i === active ? { ...p, status: "rejected", reason } : p)));
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
        <span className="text-xs text-muted-foreground">
          {queue.filter((q) => q.status === "pending").length} pending
        </span>
      </header>

      <div className="grid md:grid-cols-[260px_1fr] min-h-[calc(100vh-49px)]">
        <aside className="border-r border-border bg-card/40 p-3 space-y-1 overflow-y-auto">
          {queue.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm ${
                i === active ? "bg-accent" : "hover:bg-accent/60"
              }`}
            >
              <img src={p.photo} alt="" className="h-9 w-9 rounded-md object-cover" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.firstName}</p>
                <p className="text-xs text-muted-foreground truncate">{p.department} • {p.major}</p>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  p.status === "pending"
                    ? "bg-gold text-gold-foreground"
                    : p.status === "approved"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/15 text-destructive"
                }`}
              >
                {p.status}
              </span>
            </button>
          ))}
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
                    alt="Student ID"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3 text-xs text-muted-foreground">
                  Cross-check: <strong className="text-foreground">Name</strong> + <strong className="text-foreground">Photo</strong>.
                  Student ID number may be covered.
                </div>
              </div>

              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
                  Submitted profile
                </div>
                <img src={current.photo} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">
                      {current.firstName}, {current.age}
                    </h2>
                    {current.status === "approved" && (
                      <BadgeCheck className="h-5 w-5 text-sky-500" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{current.email}</p>
                  <p className="text-sm">
                    <span className="font-medium">{current.department}</span> • {current.major}
                  </p>
                  <p className="text-sm">{current.bio}</p>
                  {current.status === "rejected" && current.reason && (
                    <p className="text-xs text-destructive">Rejected: {current.reason}</p>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col md:flex-row gap-3">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={approve}
                  disabled={current.status === "approved"}
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
                  <Button variant="destructive" onClick={reject} disabled={current.status === "rejected"}>
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
