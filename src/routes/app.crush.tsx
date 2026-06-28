import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOCK_PROFILES, NSU_EMAIL_REGEX, useAppState, useUser } from "@/lib/nsu-store";

export const Route = createFileRoute("/app/crush")({
  head: () => ({ meta: [{ title: "Crush List — NSUMatch" }] }),
  component: CrushList,
});

function CrushList() {
  const [user] = useUser();
  const [state, setState] = useAppState();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const v = input.trim().toLowerCase();
    if (!v) return;
    const isEmail = v.includes("@");
    if (isEmail && !NSU_EMAIL_REGEX.test(v)) {
      setError("Only @northsouth.edu emails are allowed.");
      return;
    }
    if (state.crushEmails.includes(v)) {
      setError("Already on your list.");
      return;
    }
    if (state.crushEmails.length >= 3) {
      setError("Crush List is limited to 3 entries.");
      return;
    }
    setError(null);
    setState((s) => ({ ...s, crushEmails: [...s.crushEmails, v] }));
    setInput("");
  };

  const remove = (v: string) =>
    setState((s) => ({ ...s, crushEmails: s.crushEmails.filter((x) => x !== v) }));

  // demo ultimate-match detector: if a mock profile matches the email AND is in matches
  const ultimate = state.crushEmails
    .map((entry) => MOCK_PROFILES.find((p) => p.email.toLowerCase() === entry))
    .filter(Boolean)
    .filter((p) => state.matches.includes(p!.id));

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
            placeholder="name@northsouth.edu or full name"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add} disabled={state.crushEmails.length >= 3}>
            Add
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <ul className="mt-4 space-y-2">
          {state.crushEmails.map((c) => (
            <li
              key={c}
              className="flex items-center justify-between text-sm bg-muted rounded-xl px-3 py-2"
            >
              <span className="truncate">{c}</span>
              <button
                onClick={() => remove(c)}
                className="h-7 w-7 grid place-items-center rounded-full hover:bg-background"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {state.crushEmails.length === 0 && (
            <li className="text-xs text-muted-foreground text-center py-4">
              Your list is empty. Be brave.
            </li>
          )}
        </ul>
      </div>

      {ultimate.length > 0 && (
        <div className="mt-6 p-4 rounded-2xl nsu-gradient text-navy-foreground">
          <div className="flex items-center gap-2 font-bold">
            <Heart className="h-4 w-4 fill-current" /> Ultimate Match!
          </div>
          <ul className="mt-2 text-sm">
            {ultimate.map((p) => (
              <li key={p!.id}>
                {p!.firstName} from {p!.department} added you back.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
