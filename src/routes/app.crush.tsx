import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Heart, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NSU_EMAIL_REGEX } from "@/lib/nsu";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/crush")({
  head: () => ({ meta: [{ title: "Crush List — NSUMatch" }] }),
  component: CrushList,
});

type Crush = { id: string; target_email: string };

function CrushList() {
  const { session } = useSession();
  const { profile: me } = useMyProfile(session);
  const [crushes, setCrushes] = useState<Crush[]>([]);
  const [ultimateMatches, setUltimateMatches] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from("crushes")
      .select("id,target_email")
      .eq("owner_profile_id", me.id);
    setCrushes((data as Crush[]) ?? []);

    // Ultimate match detection: target user has me on their crush list
    if (data && data.length) {
      const { data: reciprocal } = await supabase
        .from("crushes")
        .select("owner_profile_id,profiles!crushes_owner_profile_id_fkey(email,first_name)")
        .eq("target_email", me.email)
        .in("target_email", [me.email]);
      // Find owners whose email matches one of my targets
      const myTargets = new Set(data.map((c) => c.target_email.toLowerCase()));
      const matches: string[] = [];
      (reciprocal ?? []).forEach((row) => {
        const ownerEmail = (row as { profiles: { email?: string; first_name?: string } | null })
          .profiles?.email;
        const ownerName = (row as { profiles: { email?: string; first_name?: string } | null })
          .profiles?.first_name;
        if (ownerEmail && myTargets.has(ownerEmail.toLowerCase())) {
          matches.push(ownerName || ownerEmail);
        }
      });
      setUltimateMatches(matches);
    } else {
      setUltimateMatches([]);
    }
  }, [me?.id, me?.email]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const add = async () => {
    if (!me) return;
    const v = input.trim().toLowerCase();
    setError(null);
    if (!NSU_EMAIL_REGEX.test(v)) return setError("Use an @northsouth.edu email.");
    if (v === me.email.toLowerCase()) return setError("That's you 😅");
    if (crushes.length >= 3) return setError("Crush List is limited to 3 entries.");
    const { error } = await supabase
      .from("crushes")
      .insert({ owner_profile_id: me.id, target_email: v });
    if (error) {
      setError(/duplicate/i.test(error.message) ? "Already on your list." : error.message);
      return;
    }
    setInput("");
    refetch();
  };

  const remove = async (id: string) => {
    await supabase.from("crushes").delete().eq("id", id);
    refetch();
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-black tracking-tight">Crush List</h1>
      <p className="text-xs text-muted-foreground">
        100% anonymous. Add up to 3 NSU students. If they add you back, it's an{" "}
        <span className="text-gold-foreground bg-gold px-1 rounded">Ultimate Match</span>.
      </p>

      <div className="mt-5 p-4 rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Lock className="h-3.5 w-3.5" /> They will never know unless you both match.
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="name@northsouth.edu"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add} disabled={crushes.length >= 3}>
            Add
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <ul className="mt-4 space-y-2">
          {crushes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between text-sm bg-muted rounded-xl px-3 py-2"
            >
              <span className="truncate">{c.target_email}</span>
              <button
                onClick={() => remove(c.id)}
                className="h-7 w-7 grid place-items-center rounded-full hover:bg-background"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {crushes.length === 0 && (
            <li className="text-xs text-muted-foreground text-center py-4">
              Your list is empty. Be brave.
            </li>
          )}
        </ul>
      </div>

      {ultimateMatches.length > 0 && (
        <div className="mt-6 p-4 rounded-2xl nsu-gradient text-navy-foreground">
          <div className="flex items-center gap-2 font-bold">
            <Heart className="h-4 w-4 fill-current" /> Ultimate Match!
          </div>
          <ul className="mt-2 text-sm">
            {ultimateMatches.map((name, i) => (
              <li key={i}>{name} added you back.</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
