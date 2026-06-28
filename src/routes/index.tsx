import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { NSU_EMAIL_REGEX, loadUser } from "@/lib/nsu-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NSUMatch — Dating, exclusively for NSU" },
      {
        name: "description",
        content:
          "Campus-only dating for North South University students. Verified .edu sign-in, free-slot matching, and tong-tea-grade vibes.",
      },
      { property: "og:title", content: "NSUMatch — Dating, exclusively for NSU" },
      {
        property: "og:description",
        content: "Verified NSU students only. Match, meet, and grab a cha.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!NSU_EMAIL_REGEX.test(trimmed)) {
      setError("Only @northsouth.edu emails can sign up.");
      return;
    }
    setError(null);
    sessionStorage.setItem("nsumatch:pending-email", trimmed);
    const existing = loadUser();
    if (existing && existing.email.toLowerCase() === trimmed.toLowerCase()) {
      navigate({ to: "/app" });
    } else {
      navigate({ to: "/onboarding" });
    }
  };

  return (
    <div className="min-h-screen nsu-gradient text-navy-foreground flex flex-col">
      <header className="px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gold text-gold-foreground grid place-items-center font-black">
            N
          </div>
          <span className="font-semibold tracking-tight text-lg">NSUMatch</span>
        </div>
        <Link to="/admin" className="text-xs opacity-70 hover:opacity-100">
          Admin
        </Link>
      </header>

      <main className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        <h1 className="text-4xl font-black leading-tight tracking-tight">
          Dating, <span className="text-gold">exclusively</span> for NSU.
        </h1>
        <p className="mt-3 text-sm opacity-80">
          Verified students only. Skip the random apps — find someone who actually shares your free
          slot and your favorite tong.
        </p>

        <form onSubmit={handleContinue} className="mt-8 space-y-3">
          <label className="text-xs uppercase tracking-wider opacity-70" htmlFor="email">
            Your NSU email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="yourname@northsouth.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-white/10 border-white/20 placeholder:text-white/50 text-white h-12"
            autoComplete="email"
          />
          {error && <p className="text-sm text-destructive-foreground bg-destructive/80 rounded-md px-3 py-2">{error}</p>}
          <Button
            type="submit"
            className="w-full h-12 bg-gold text-gold-foreground hover:bg-gold/90 gold-glow font-semibold"
          >
            Continue
          </Button>
        </form>

        <ul className="mt-10 space-y-2 text-sm opacity-90">
          <li>✓ .edu verified — no outsiders, no bots</li>
          <li>✓ Free-slot matcher, campus check-ins, Crush List</li>
          <li>✓ Ghost Mode to hide from your own department</li>
        </ul>
      </main>

      <footer className="px-6 pb-6 text-center text-xs opacity-60">
        Not affiliated with North South University. Student-built MVP.
      </footer>
    </div>
  );
}
