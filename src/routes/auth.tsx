import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NSU_EMAIL_REGEX } from "@/lib/nsu";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in — NSUMatch" }],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  const validate = () => {
    if (!NSU_EMAIL_REGEX.test(email.trim())) {
      setError("Only @northsouth.edu emails are allowed.");
      return false;
    }
    if (mode !== "forgot" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return false;
    }
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setInfo(
          "Check your @northsouth.edu inbox for a confirmation link. You can finish setting up your profile after confirming.",
        );
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("If an account exists, we just sent a reset link.");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      // Surface .edu enforcement nicely
      setError(
        /northsouth\.edu/.test(msg)
          ? "NSUMatch only accepts verified @northsouth.edu accounts."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen nsu-gradient text-navy-foreground flex flex-col">
      <header className="px-6 pt-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gold text-gold-foreground grid place-items-center font-black">
            N
          </div>
          <span className="font-semibold">NSUMatch</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-3xl bg-card text-card-foreground p-6 shadow-2xl">
          <div className="flex gap-1 p-1 bg-muted rounded-full text-xs font-medium mb-5">
            {(["signup", "signin"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
                className={`flex-1 py-2 rounded-full transition ${
                  mode === m ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          <h1 className="text-xl font-bold">
            {mode === "signup"
              ? "Verified NSU students only"
              : mode === "signin"
                ? "Welcome back"
                : "Reset your password"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Credentials encrypted. Emails verified.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <Label htmlFor="email">NSU email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="yourname@northsouth.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === "signup" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Use 8+ characters. We check against known breached passwords.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive-foreground bg-destructive/90 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm bg-primary/10 text-foreground rounded-md px-3 py-2">{info}</p>
            )}

            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create my account"
                  : mode === "signin"
                    ? "Sign in"
                    : "Send reset link"}
            </Button>
          </form>

          <div className="mt-4 text-xs text-center text-muted-foreground">
            {mode === "signin" ? (
              <button
                className="hover:underline"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setInfo(null);
                }}
              >
                Forgot password?
              </button>
            ) : mode === "forgot" ? (
              <button
                className="hover:underline"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
              >
                Back to sign in
              </button>
            ) : (
              <span>By continuing, you agree to keep NSUMatch private to NSU students.</span>
            )}
          </div>
        </div>
      </main>

      <footer className="px-6 pb-6 text-center text-xs opacity-70">
        <Link to="/admin">Admin sign-in</Link>
      </footer>
    </div>
  );
}
