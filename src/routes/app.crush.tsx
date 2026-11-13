import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Heart, Lock, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { haptic, NSU_EMAIL_REGEX } from "@/lib/nsu";
import { useMyProfile, useSession } from "@/lib/nsu-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/crush")({
  head: () => ({
    meta: [{ title: "Crush List — NSUMatch" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: CrushList,
});

type Crush = { id: string; target_email: string };
const MAX_CRUSHES = 3;

function CrushList() {
  const { session } = useSession();
  const { profile: me } = useMyProfile(session);
  const meId = me?.id;
  const [crushes, setCrushes] = useState<Crush[]>([]);
  const [ultimateMatches, setUltimateMatches] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    if (!meId) return;
    const [{ data }, { data: rpc }] = await Promise.all([
      supabase.from("crushes").select("id,target_email").eq("owner_profile_id", meId),
      supabase.rpc("get_ultimate_matches"),
    ]);
    setCrushes((data as Crush[]) ?? []);
    setUltimateMatches(((rpc as { first_name: string }[] | null) ?? []).map((r) => r.first_name));
  }, [meId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const add = async () => {
    if (!me || busy) return;
    let v = input.trim().toLowerCase();
    // Let people type just the username part.
    if (v && !v.includes("@")) v = `${v}@northsouth.edu`;
    setError(null);
    if (!NSU_EMAIL_REGEX.test(v)) return setError("Use an @northsouth.edu email.");
    if (v === me.email.toLowerCase()) return setError("That's you 😅");
    if (crushes.length >= MAX_CRUSHES) return setError(`Crush List is limited to ${MAX_CRUSHES}.`);
    setBusy(true);
    const { error } = await supabase
      .from("crushes")
      .insert({ owner_profile_id: me.id, target_email: v });
    setBusy(false);
    if (error) {
      setError(/duplicate/i.test(error.message) ? "Already on your list." : error.message);
      return;
    }
    haptic(15);
    setInput("");
    toast.success("Added secretly 🤫");
    refetch();
  };

  const remove = async (c: Crush) => {
    setCrushes((list) => list.filter((x) => x.id !== c.id));
    const { error } = await supabase.from("crushes").delete().eq("id", c.id);
    if (error) {
      toast.error("Couldn't remove. Try again.");
      refetch();
    }
  };

  const full = crushes.length >= MAX_CRUSHES;

  return (
    <div className="max-w-md mx-auto px-4 pt-safe pb-8">
      <header className="pt-4">
        <h1 className="text-[28px] font-black tracking-tight">Crush List</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add up to 3 NSU students. If they add you too, it's an{" "}
          <span className="text-gold-foreground bg-gold px-1.5 py-0.5 rounded-md font-semibold">
            Ultimate Match
          </span>
          .
        </p>
      </header>

      {ultimateMatches.length > 0 && (
        <div className="mt-5 p-5 rounded-3xl nsu-gradient text-navy-foreground animate-pop">
          <div className="flex items-center gap-2 font-black text-lg">
            <Heart className="h-5 w-5 fill-gold text-gold" /> Ultimate Match!
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {ultimateMatches.map((name, i) => (
              <li key={i}>💛 {name} has a crush on you too.</li>
            ))}
          </ul>
        </div>
      )}

      {/* Slots */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        {Array.from({ length: MAX_CRUSHES }).map((_, i) => {
          const filled = i < crushes.length;
          return (
            <div
              key={i}
              className={`aspect-square rounded-3xl grid place-items-center transition ${
                filled
                  ? "nsu-gradient text-gold shadow-lg"
                  : "border-2 border-dashed border-border text-muted-foreground"
              }`}
            >
              <Heart className={`h-8 w-8 ${filled ? "fill-current animate-pop" : ""}`} />
            </div>
          );
        })}
      </div>

      <form
        className="mt-5 rounded-3xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="crush" className="text-sm font-semibold">
          Their NSU email
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="crush"
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="firstname.lastname@northsouth.edu"
            value={input}
            disabled={full}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-muted text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button
            type="submit"
            className="h-12 w-12 rounded-2xl p-0 shrink-0"
            disabled={full || busy}
            aria-label="Add crush"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        {full && !error && (
          <p className="mt-2 text-xs text-muted-foreground">
            Your list is full. Remove someone to add another.
          </p>
        )}

        {crushes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {crushes.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-sm bg-muted rounded-2xl pl-4 pr-1 h-12"
              >
                <span className="truncate">{c.target_email}</span>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  className="h-10 w-10 shrink-0 grid place-items-center rounded-full active:bg-background"
                  aria-label={`Remove ${c.target_email}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground px-1">
        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        100% anonymous. They'll never know unless they add you too.
      </p>
    </div>
  );
}
