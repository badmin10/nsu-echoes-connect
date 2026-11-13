import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NSU_EMAIL_REGEX } from "@/lib/nsu";
import { supabase } from "@/integrations/supabase/client";
import { SITE_URL } from "@/lib/site";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signin"; next?: "/admin" } => ({
    ...(search.mode === "signin" ? { mode: "signin" as const } : {}),
    ...(search.next === "/admin" ? { next: "/admin" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Sign in or join — NSUMatch" },
      {
        name: "description",
        content: "Sign in or create your NSUMatch account with your @northsouth.edu email.",
      },
      { property: "og:title", content: "Join NSUMatch — verified NSU students only" },
      {
        property: "og:description",
        content:
          "Create your NSUMatch account with your @northsouth.edu email. Verified students only.",
      },
      { property: "og:url", content: `${SITE_URL}/auth` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/auth` }],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

/** Where to go after signing in. Only whitelisted paths (no open redirects). */
function afterLogin(): "/admin" | "/app" {
  if (typeof window === "undefined") return "/app";
  const next = new URLSearchParams(window.location.search).get("next");
  return next === "/admin" ? "/admin" : "/app";
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(() =>
    search.mode === "signin" || search.next ? "signin" : "signup",
  );
  useEffect(() => {
    setMode(search.mode === "signin" || search.next ? "signin" : "signup");
  }, [search.mode, search.next]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setReady(true);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) navigate({ to: afterLogin() });
      })
      .catch(() => setError("Couldn't restore your session. You can sign in below."));
  }, [navigate]);

  const validate = () => {
    if (!NSU_EMAIL_REGEX.test(email.trim())) {
      setError("Only @northsouth.edu emails are allowed.");
      return false;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return false;
    }
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !ready) return;
    setError(null);
    setInfo(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setInfo(
          "Check your @northsouth.edu inbox for a confirmation link. You can finish setting up your profile after confirming.",
        );
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        navigate({ to: afterLogin() });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("If an account exists, we just sent a reset link.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
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
    <div className="min-h-dvh nsu-gradient text-navy-foreground flex flex-col pt-safe pb-safe">
      <header className="px-6 pt-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gold text-gold-foreground grid place-items-center font-black">
            N
          </div>
          <span className="font-semibold">NSUMatch</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-sm rounded-[28px] bg-card text-card-foreground p-6 shadow-2xl">
          <div className="flex gap-1 p-1 bg-muted rounded-full text-sm font-medium mb-5">
            {(["signup", "signin"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
                type="button"
                disabled={busy || !ready}
                aria-pressed={mode === m}
                className={`flex-1 h-10 rounded-full transition ${
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
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Your campus. Your connections.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3" aria-busy={busy || !ready}>
            <div>
              <Label htmlFor="email">NSU email</Label>
              <Input
                id="email"
                name="email"
                required
                maxLength={254}
                disabled={busy || !ready}
                aria-describedby={error ? "auth-error" : undefined}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={mode === "forgot" ? "send" : "next"}
                className="mt-1.5 h-12 rounded-xl"
                placeholder="yourname@northsouth.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    name="password"
                    required
                    minLength={mode === "signup" ? 8 : 1}
                    disabled={busy || !ready}
                    aria-describedby={mode === "signup" ? "password-help" : undefined}
                    type={showPw ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    enterKeyHint="go"
                    className="h-12 rounded-xl pr-12"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-lg text-muted-foreground"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    aria-pressed={showPw}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p id="password-help" className="mt-1 text-xs text-muted-foreground">
                    Use at least 8 characters and a password you don't use elsewhere.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p
                id="auth-error"
                role="alert"
                className="text-sm text-destructive-foreground bg-destructive/90 rounded-md px-3 py-2"
              >
                {error}
              </p>
            )}
            {info && (
              <p
                role="status"
                className="text-sm bg-primary/10 text-foreground rounded-md px-3 py-2"
              >
                {info}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-full font-semibold text-base"
              disabled={busy || !ready}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
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
                disabled={busy}
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
