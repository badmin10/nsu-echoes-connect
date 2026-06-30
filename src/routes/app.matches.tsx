import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import type { DBProfile } from "@/lib/nsu";

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

function Matches() {
  const { session } = useSession();
  const { profile: me } = useMyProfile(session);
  const [matches, setMatches] = useState<DBProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me) return;
    const run = async () => {
      setLoading(true);
      // People I liked/tea'd
      const { data: mine } = await supabase
        .from("swipes")
        .select("to_profile_id")
        .eq("from_profile_id", me.id)
        .in("action", ["like", "tea"]);
      const myTargets = (mine ?? []).map((s) => s.to_profile_id);
      if (myTargets.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      // People who liked/tea'd me back
      const { data: theirs } = await supabase
        .from("swipes")
        .select("from_profile_id")
        .eq("to_profile_id", me.id)
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
        .select("*")
        .in("id", matchedIds);
      setMatches((profiles as DBProfile[]) ?? []);
      setLoading(false);
    };
    run();
  }, [me?.id]);

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-black tracking-tight">Matches</h1>
      <p className="text-xs text-muted-foreground">Say something nicer than "hey".</p>

      {loading ? (
        <div className="mt-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          <MessageCircle className="mx-auto h-10 w-10 opacity-50" />
          <p className="mt-3 text-sm">No matches yet. Keep swiping.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                to="/app/chat/$id"
                params={{ id: m.id }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:bg-accent transition"
              >
                <img src={m.photo_url} alt={`Profile photo of ${m.first_name}`} className="h-14 w-14 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold flex items-center gap-1">
                      <span>{m.first_name}, {m.age}</span>
                      {m.verified && (
                        <BadgeCheck className="h-4 w-4 text-sky-400 fill-sky-400/20" />
                      )}
                    </p>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {m.department}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    New match — start the conversation
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
