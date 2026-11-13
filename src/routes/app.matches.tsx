import { ProfilePhoto } from "@/components/nsu/ProfilePhoto";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Flame, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { type DBProfile, PROFILE_COLUMNS, timeAgo } from "@/lib/nsu";
import { fetchInbox, type InboxEntry, type Message, messagePreview } from "@/lib/messages";

export const Route = createFileRoute("/app/matches")({
  head: () => ({
    meta: [
      { title: "Matches — NSUMatch" },
      {
        name: "description",
        content:
          "Your mutual matches on NSUMatch — start a conversation with verified NSU students you've both liked.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Matches,
});

type Row = { profile: DBProfile; last?: Message; unread: number };

function Matches() {
  const { session } = useSession();
  const { profile: me } = useMyProfile(session);
  const meId = me?.id ?? null;
  const [matches, setMatches] = useState<DBProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [inbox, setInbox] = useState<Map<string, InboxEntry>>(new Map());

  const refreshInbox = useCallback(async () => {
    if (!meId) return;
    const { inbox: next } = await fetchInbox(meId);
    setInbox(next);
  }, [meId]);

  // Live inbox: re-pull when any message to or from me changes.
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`inbox:${meId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `to_profile_id=eq.${meId}` },
        () => refreshInbox(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `from_profile_id=eq.${meId}`,
        },
        () => refreshInbox(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meId, refreshInbox]);

  useEffect(() => {
    if (!meId) return;
    const run = async () => {
      setLoading(true);
      const { data: mine } = await supabase
        .from("swipes")
        .select("to_profile_id")
        .eq("from_profile_id", meId)
        .in("action", ["like", "tea"]);
      const myTargets = (mine ?? []).map((s) => s.to_profile_id);
      if (myTargets.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      const { data: theirs } = await supabase
        .from("swipes")
        .select("from_profile_id")
        .eq("to_profile_id", meId)
        .in("from_profile_id", myTargets)
        .in("action", ["like", "tea"]);
      const matchedIds = (theirs ?? []).map((s) => s.from_profile_id);
      if (matchedIds.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .in("id", matchedIds);
      const list = (profiles as unknown as DBProfile[]) ?? [];
      setMatches(list);
      await refreshInbox();
      setLoading(false);
    };
    run();
  }, [meId, refreshInbox]);

  const { fresh, convos } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Row[] = matches
      .filter(
        (m) => !q || m.first_name.toLowerCase().includes(q) || m.major.toLowerCase().includes(q),
      )
      .map((p) => {
        const entry = inbox.get(p.id);
        return { profile: p, last: entry?.last, unread: entry?.unread ?? 0 };
      });
    const at = (r: Row) => (r.last ? new Date(r.last.created_at).getTime() : 0);
    return {
      fresh: rows.filter((r) => !r.last),
      convos: rows.filter((r) => r.last).sort((a, b) => at(b) - at(a)),
    };
  }, [matches, inbox, query]);

  return (
    <div className="max-w-md mx-auto pt-safe pb-6">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-[28px] font-black tracking-tight">Chats</h1>
        {matches.length > 0 && (
          <div className="mt-3 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search matches"
              type="search"
              enterKeyHint="search"
              className="w-full h-11 pl-10 pr-4 rounded-full bg-muted text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </header>

      {loading ? (
        <MatchesSkeleton />
      ) : matches.length === 0 ? (
        <div className="mt-16 px-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-muted grid place-items-center text-3xl animate-float">
            💌
          </div>
          <p className="mt-5 text-lg font-bold">No matches yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            When someone you like likes you back, they'll show up here.
          </p>
          <Link
            to="/app"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground active:scale-95 transition"
          >
            <Flame className="h-4 w-4" /> Start swiping
          </Link>
        </div>
      ) : (
        <>
          {fresh.length > 0 && (
            <section className="mt-3">
              <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                New matches <span className="text-primary">{fresh.length}</span>
              </h2>
              <ul className="mt-3 flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1 snap-x">
                {fresh.map(({ profile: m }) => (
                  <li key={m.id} className="snap-start shrink-0">
                    <Link
                      to="/app/chat/$id"
                      params={{ id: m.id }}
                      className="block w-[76px] text-center active:scale-95 transition"
                    >
                      <span className="block p-[2.5px] rounded-full bg-gradient-to-br from-gold to-primary">
                        <ProfilePhoto
                          src={m.photo_url}
                          alt=""
                          className="h-[70px] w-[70px] rounded-full object-cover ring-2 ring-background"
                        />
                      </span>
                      <span className="mt-1.5 block text-xs font-semibold truncate">
                        {m.first_name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-5">
            <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Messages
            </h2>
            {convos.length === 0 ? (
              <p className="px-4 mt-3 text-sm text-muted-foreground">
                Tap a new match above and break the ice — say something nicer than "hey" 😉
              </p>
            ) : (
              <ul className="mt-1">
                {convos.map(({ profile: m, last, unread }) => (
                  <li key={m.id}>
                    <Link
                      to="/app/chat/$id"
                      params={{ id: m.id }}
                      className="flex items-center gap-3 px-4 py-3 active:bg-accent transition-colors"
                    >
                      <ProfilePhoto
                        src={m.photo_url}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold flex items-center gap-1 min-w-0">
                            <span className="truncate">{m.first_name}</span>
                            {m.verified && (
                              <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500 fill-sky-500/15" />
                            )}
                          </p>
                          <span
                            className={`text-[11px] shrink-0 ${unread ? "text-primary font-semibold" : "text-muted-foreground"}`}
                          >
                            {last && timeAgo(new Date(last.created_at).getTime())}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p
                            className={`flex-1 text-sm truncate ${
                              unread ? "text-foreground font-semibold" : "text-muted-foreground"
                            }`}
                          >
                            {last?.from_profile_id === meId && "You: "}
                            {last && messagePreview(last)}
                          </p>
                          {unread > 0 && (
                            <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold grid place-items-center">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="mt-4 px-4 animate-pulse">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="mt-3 flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[75px] w-[75px] rounded-full bg-muted" />
        ))}
      </div>
      <div className="mt-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-28 rounded bg-muted" />
              <div className="h-3 w-48 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
