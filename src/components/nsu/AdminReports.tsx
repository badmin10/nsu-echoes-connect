import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, Ban, Check, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PROFILE_COLUMNS, timeAgo, type DBProfile } from "@/lib/nsu";
import { reasonLabel } from "@/lib/safety";
import { messagePreview, type Message } from "@/lib/messages";
import { ChatImage } from "./ChatImage";

type Report = Tables<"reports">;
type AdminProfile = DBProfile & { banned: boolean };
type View = "open" | "closed";

export function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [people, setPeople] = useState<Map<string, AdminProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("open");
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    const list = (data as Report[]) ?? [];
    setReports(list);
    const ids = [...new Set(list.flatMap((r) => [r.reporter_profile_id, r.reported_profile_id]))];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select(`${PROFILE_COLUMNS},banned`)
        .in("id", ids);
      setPeople(new Map(((profs as unknown as AdminProfile[]) ?? []).map((p) => [p.id, p])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = reports.filter((r) =>
    view === "open" ? r.status === "open" : r.status !== "open",
  );
  const active = reports.find((r) => r.id === activeId) ?? null;
  const countAgainst = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports) m.set(r.reported_profile_id, (m.get(r.reported_profile_id) ?? 0) + 1);
    return m;
  }, [reports]);

  const resolve = async (r: Report, status: "actioned" | "dismissed", note: string) => {
    const patch = {
      status,
      admin_note: note.trim() || null,
      resolved_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("reports").update(patch).eq("id", r.id);
    if (error) return (toast.error(error.message), false);
    setReports((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    return true;
  };

  const setBanned = async (profileId: string, banned: boolean) => {
    const { data, error } = await supabase
      .from("profiles")
      .update({ banned })
      .eq("id", profileId)
      .select("id");
    if (error || !data?.length) {
      toast.error(error?.message ?? "Not saved — admin role required.");
      return false;
    }
    setPeople((m) => {
      const next = new Map(m);
      const p = next.get(profileId);
      if (p) next.set(profileId, { ...p, banned });
      return next;
    });
    return true;
  };

  return (
    <div className="md:grid md:grid-cols-[320px_1fr] md:h-[calc(100dvh-56px)]">
      <aside
        className={`${active ? "hidden md:block" : "block"} md:border-r border-border md:overflow-y-auto`}
      >
        <div className="flex gap-1.5 p-3">
          {(["open", "closed"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`h-9 rounded-full px-3.5 text-sm font-medium border transition ${
                view === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border"
              }`}
            >
              {v === "open" ? "Open" : "Resolved"}{" "}
              <span className="opacity-70">
                {
                  reports.filter((r) => (v === "open" ? r.status === "open" : r.status !== "open"))
                    .length
                }
              </span>
            </button>
          ))}
        </div>
        {loading ? (
          <div className="py-10 grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No reports. 🎉</p>
        ) : (
          <ul className="px-2 pb-6">
            {shown.map((r) => {
              const p = people.get(r.reported_profile_id);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setActiveId(r.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left ${
                      r.id === activeId ? "bg-accent" : "active:bg-accent/60 md:hover:bg-accent/60"
                    }`}
                  >
                    {p ? (
                      <ProfilePhoto
                        src={p.photo_url}
                        alt=""
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {p?.first_name ?? "Deleted account"}
                        {(countAgainst.get(r.reported_profile_id) ?? 0) > 1 && (
                          <span className="ml-1.5 text-[10px] font-bold text-destructive">
                            ×{countAgainst.get(r.reported_profile_id)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {reasonLabel(r.reason)}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {timeAgo(new Date(r.created_at).getTime())}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <main className={`${active ? "block" : "hidden md:block"} md:overflow-y-auto`}>
        {active ? (
          <ReportDetail
            key={active.id}
            report={active}
            reporter={people.get(active.reporter_profile_id)}
            reported={people.get(active.reported_profile_id)}
            totalAgainst={countAgainst.get(active.reported_profile_id) ?? 1}
            onBack={() => setActiveId(null)}
            onResolve={resolve}
            onSetBanned={setBanned}
          />
        ) : (
          <div className="hidden md:grid h-full place-items-center text-sm text-muted-foreground">
            Select a report
          </div>
        )}
      </main>
    </div>
  );
}

function ReportDetail({
  report,
  reporter,
  reported,
  totalAgainst,
  onBack,
  onResolve,
  onSetBanned,
}: {
  report: Report;
  reporter?: AdminProfile;
  reported?: AdminProfile;
  totalAgainst: number;
  onBack: () => void;
  onResolve: (r: Report, status: "actioned" | "dismissed", note: string) => Promise<boolean>;
  onSetBanned: (profileId: string, banned: boolean) => Promise<boolean>;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [note, setNote] = useState(report.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const a = report.reporter_profile_id;
  const b = report.reported_profile_id;

  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .or(
        `and(from_profile_id.eq.${a},to_profile_id.eq.${b}),and(from_profile_id.eq.${b},to_profile_id.eq.${a})`,
      )
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => setMessages(((data as Message[]) ?? []).reverse()));
  }, [a, b]);

  const act = async (fn: () => Promise<boolean>, done: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) toast.success(done);
  };

  const open = report.status === "open";

  return (
    <div className="p-4 md:p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="md:hidden mb-3 flex items-center gap-1 text-sm text-muted-foreground h-10"
      >
        <ArrowLeft className="h-4 w-4" /> All reports
      </button>

      <div className="rounded-2xl border bg-card p-4 flex items-center gap-4">
        {reported && (
          <ProfilePhoto
            src={reported.photo_url}
            alt=""
            className="h-20 w-20 rounded-2xl object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-xl font-black">
              {reported ? `${reported.first_name}, ${reported.age}` : "Deleted account"}
            </h2>
            {reported?.verified && <BadgeCheck className="h-5 w-5 text-sky-500" />}
            {reported?.banned && (
              <span className="text-[10px] font-bold uppercase bg-destructive text-white px-2 py-0.5 rounded-full">
                Banned
              </span>
            )}
          </div>
          {reported && (
            <p className="text-sm text-muted-foreground">
              {reported.department} · {reported.major}
            </p>
          )}
          <p className="text-xs text-destructive font-medium mt-0.5">
            {totalAgainst} report{totalAgainst === 1 ? "" : "s"} against this account
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border bg-card p-4 space-y-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Report</p>
        <p className="font-semibold">{reasonLabel(report.reason)}</p>
        {report.details && <p className="text-sm whitespace-pre-wrap">“{report.details}”</p>}
        <p className="text-xs text-muted-foreground">
          From {reporter?.first_name ?? "a user"} · {new Date(report.created_at).toLocaleString()}
        </p>
        {!open && (
          <p className="text-xs pt-1">
            <span className="font-semibold capitalize">{report.status}</span>
            {report.admin_note && ` — ${report.admin_note}`}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-2xl border bg-card">
        <p className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
          Their conversation (last 60 messages)
        </p>
        <div className="max-h-80 overflow-y-auto p-3 space-y-1.5">
          {messages === null ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No messages between them.
            </p>
          ) : (
            messages.map((m) => {
              const fromReported = m.from_profile_id === b;
              return (
                <div
                  key={m.id}
                  className={`flex ${fromReported ? "justify-start" : "justify-end"}`}
                >
                  {m.image_path ? (
                    <ChatImage path={m.image_path} caption={m.body} mine={!fromReported} />
                  ) : (
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                        fromReported ? "bg-destructive/10 text-foreground" : "bg-muted"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold opacity-60">
                        {fromReported ? reported?.first_name : reporter?.first_name}
                      </span>
                      {messagePreview(m)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Internal note (optional)"
        className="mt-3 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
      />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {reported && !reported.banned ? (
          <Button
            variant="destructive"
            className="h-12 rounded-full font-semibold"
            disabled={busy}
            onClick={() =>
              act(async () => {
                const ok = await onSetBanned(b, true);
                if (ok && open) await onResolve(report, "actioned", note || "Account banned");
                return ok;
              }, `${reported.first_name} banned`)
            }
          >
            <Ban className="h-4 w-4" /> Ban account
          </Button>
        ) : reported ? (
          <Button
            variant="outline"
            className="h-12 rounded-full"
            disabled={busy}
            onClick={() => act(() => onSetBanned(b, false), `${reported.first_name} unbanned`)}
          >
            <ShieldOff className="h-4 w-4" /> Unban account
          </Button>
        ) : null}
        {open && (
          <>
            <Button
              variant="outline"
              className="h-12 rounded-full"
              disabled={busy}
              onClick={() => act(() => onResolve(report, "actioned", note), "Marked as handled")}
            >
              <Check className="h-4 w-4" /> Handled (warned)
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-full sm:col-span-2"
              disabled={busy}
              onClick={() => act(() => onResolve(report, "dismissed", note), "Report dismissed")}
            >
              Dismiss — no violation
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
