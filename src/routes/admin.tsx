import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ImageOff,
  Loader2,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_COLUMNS, type DBProfile, type VerificationStatus } from "@/lib/nsu";
import { useSession } from "@/lib/nsu-auth";
import { idCardUrl } from "@/lib/verification";
import { AdminReports } from "@/components/nsu/AdminReports";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — NSUMatch" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: Admin,
});

const REJECT_REASONS = [
  "Blurry photo",
  "Not an NSU ID",
  "Photo doesn't match profile",
  "Name doesn't match",
  "Expired ID",
];
type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const statusOf = (p: DBProfile): VerificationStatus =>
  p.verified ? "approved" : p.verification_status;

function Admin() {
  const { session, loading: sessionLoading } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    let active = true;
    setIsAdmin(null);
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    // Server-side check; RLS enforces the same role on every admin read/write.
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }).then(({ data, error }) => {
      if (active) setIsAdmin(!error && !!data);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  if (sessionLoading || (session && isAdmin === null)) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session || !isAdmin) {
    return (
      <div className="min-h-dvh grid place-items-center px-6 bg-background pt-safe pb-safe">
        <div className="max-w-sm w-full rounded-3xl border bg-card p-6 text-center">
          {session ? (
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          ) : (
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          )}
          <h1 className="mt-3 text-xl font-black">{session ? "Admins only" : "Admin sign-in"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session
              ? "This account doesn't have admin access. Ask the project owner to grant you the admin role."
              : "Sign in with your NSUMatch account. Only accounts with the admin role can review IDs."}
          </p>
          {!session && (
            <Button asChild className="mt-5 w-full h-12 rounded-full">
              <a href="/auth?next=/admin">
                <LogIn className="h-4 w-4" /> Sign in
              </a>
            </Button>
          )}
          <Link to="/" className="mt-4 block text-sm text-muted-foreground hover:underline">
            ← Back to NSUMatch
          </Link>
        </div>
      </div>
    );
  }

  return <ReviewQueue />;
}

function ReviewQueue() {
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"ids" | "reports">("ids");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .not("user_id", "is", null)
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setProfiles((data as unknown as DBProfile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      all: profiles.length,
    };
    for (const p of profiles) {
      const s = statusOf(p);
      if (s !== "none") c[s] += 1;
    }
    return c;
  }, [profiles]);

  const list = profiles.filter((p) => filter === "all" || statusOf(p) === filter);
  const active = profiles.find((p) => p.id === activeId) ?? null;

  const decide = async (p: DBProfile, approve: boolean, reason?: string) => {
    setSaving(true);
    const patch = approve
      ? { verified: true, verification_status: "approved" as const, verification_note: null }
      : {
          verified: false,
          verification_status: "rejected" as const,
          verification_note: reason ?? null,
        };
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", p.id)
      .select("id");
    setSaving(false);
    if (error || !data?.length) {
      toast.error(error?.message ?? "Not saved — check that this account has the admin role.");
      return;
    }
    setProfiles((all) => all.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    toast.success(approve ? `${p.first_name} approved` : `${p.first_name} rejected`);
    // Move on to the next pending profile.
    const next = profiles.find((x) => x.id !== p.id && statusOf(x) === "pending");
    setActiveId(next?.id ?? null);
  };

  return (
    <div className="min-h-dvh bg-background pt-safe">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur-xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {active && tab === "ids" ? (
            <button
              onClick={() => setActiveId(null)}
              className="md:hidden h-10 w-10 -ml-2 grid place-items-center rounded-full active:bg-accent"
              aria-label="Back to queue"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <Link
              to="/"
              className="h-10 w-10 -ml-2 grid place-items-center rounded-full active:bg-accent"
              aria-label="Home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <h1 className="sr-only">NSUMatch admin</h1>
          <div className="flex gap-1 rounded-full bg-muted p-1 text-sm font-medium" role="tablist">
            {(
              [
                ["ids", `IDs${counts.pending ? ` · ${counts.pending}` : ""}`],
                ["reports", "Reports"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`h-8 rounded-full px-3.5 transition ${
                  tab === key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === "reports" ? (
        <AdminReports />
      ) : (
        <div className="md:grid md:grid-cols-[320px_1fr] md:h-[calc(100dvh-56px)]">
          <aside
            className={`${active ? "hidden md:block" : "block"} md:border-r border-border md:overflow-y-auto`}
          >
            <div className="flex gap-1.5 p-3 overflow-x-auto no-scrollbar">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium border transition ${
                    filter === f.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border"
                  }`}
                >
                  {f.label} <span className="opacity-70">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            {loading ? (
              <div className="py-10 grid place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing here. 🎉
              </p>
            ) : (
              <ul className="px-2 pb-6">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setActiveId(p.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left ${
                        p.id === activeId
                          ? "bg-accent"
                          : "active:bg-accent/60 md:hover:bg-accent/60"
                      }`}
                    >
                      <ProfilePhoto
                        src={p.photo_url}
                        alt=""
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          {p.first_name}, {p.age}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.department} · {p.major}
                        </p>
                      </div>
                      <StatusPill status={statusOf(p)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className={`${active ? "block" : "hidden md:block"} md:overflow-y-auto`}>
            {active ? (
              <ReviewDetail key={active.id} profile={active} saving={saving} onDecide={decide} />
            ) : (
              <div className="hidden md:grid h-full place-items-center text-sm text-muted-foreground">
                Select a profile to review
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: VerificationStatus }) {
  const styles: Record<VerificationStatus, string> = {
    pending: "bg-gold text-gold-foreground",
    approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rejected: "bg-destructive/15 text-destructive",
    none: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {status === "none" ? "no ID" : status}
    </span>
  );
}

function ReviewDetail({
  profile,
  saving,
  onDecide,
}: {
  profile: DBProfile;
  saving: boolean;
  onDecide: (p: DBProfile, approve: boolean, reason?: string) => void;
}) {
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [idLoading, setIdLoading] = useState(true);
  const [idPath, setIdPath] = useState<string | null>(null);
  const [verificationNote, setVerificationNote] = useState<string | null>(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const status = statusOf(profile);

  useEffect(() => {
    let active = true;
    setIdLoading(true);
    setIdUrl(null);
    setIdPath(null);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_profile_verification", {
          target: profile.id,
        });
        if (error) throw error;
        const review = data?.[0];
        const url = review?.id_card_path ? await idCardUrl(review.id_card_path) : null;
        if (active) {
          setIdPath(review?.id_card_path ?? null);
          setVerificationNote(review?.verification_note ?? null);
          setIdUrl(url);
        }
      } catch {
        if (active) toast.error("Couldn't load the verification document.");
      } finally {
        if (active) setIdLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile.id, profile.verification_note]);

  return (
    <div className="p-4 md:p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-black">
          {profile.first_name}, {profile.age}
        </h2>
        {profile.verified && <BadgeCheck className="h-6 w-6 text-sky-500" />}
        <StatusPill status={status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {profile.department} · {profile.major}
      </p>
      {status === "rejected" && verificationNote && (
        <p className="mt-1 text-xs text-destructive">Rejected: {verificationNote}</p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <figure className="rounded-2xl border bg-card overflow-hidden">
          <figcaption className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
            Student ID
          </figcaption>
          <div className="aspect-[4/3] bg-muted grid place-items-center">
            {idLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : idUrl ? (
              <a href={idUrl} target="_blank" rel="noreferrer" className="h-full w-full">
                <img
                  src={idUrl}
                  alt={`Student ID uploaded by ${profile.first_name}`}
                  className="h-full w-full object-contain"
                />
              </a>
            ) : (
              <div className="text-center text-sm text-muted-foreground px-6">
                <ImageOff className="mx-auto h-8 w-8" />
                <p className="mt-2">No ID photo on file.</p>
              </div>
            )}
          </div>
        </figure>
        <figure className="rounded-2xl border bg-card overflow-hidden">
          <figcaption className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
            Profile photo
          </figcaption>
          <ProfilePhoto
            src={profile.photo_url}
            alt={`Profile photo of ${profile.first_name}`}
            className="aspect-[4/3] w-full object-cover"
          />
        </figure>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Check that the <strong className="text-foreground">name</strong> and{" "}
        <strong className="text-foreground">face</strong> match. The ID number may be covered.
      </p>
      {profile.bio && <p className="mt-3 text-sm">“{profile.bio}”</p>}

      <div className="mt-6 space-y-3">
        <Button
          className="w-full h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          disabled={saving || !idPath || !idUrl || status === "approved"}
          onClick={() => onDecide(profile, true)}
        >
          <Check className="h-4 w-4" /> Approve
        </Button>
        <div className="rounded-2xl border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Reject with reason</p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`h-9 px-3 rounded-full text-xs border ${
                  reason === r
                    ? "bg-destructive text-white border-destructive"
                    : "bg-card border-border"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full h-11 rounded-full text-destructive border-destructive/40"
            disabled={saving || status === "rejected"}
            onClick={() => onDecide(profile, false, reason)}
          >
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
