import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  Heart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NSUMatch — Dating, exclusively for NSU" },
      {
        name: "description",
        content:
          "Campus-exclusive dating for verified North South University students. Match on free slots, campus check-ins, and good vibes — @northsouth.edu only.",
      },
      { property: "og:title", content: "NSUMatch — Dating, exclusively for NSU" },
      {
        property: "og:description",
        content:
          "Verified NSU students only. Match on shared free slots, campus check-ins, and grab a cha together.",
      },
      { property: "og:url", content: "https://nsu-echoes-connect.lovable.app/" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "NSUMatch — Dating, exclusively for NSU" },
      {
        name: "twitter:description",
        content: "Verified NSU students only. Match on shared free slots and campus check-ins.",
      },
    ],
    links: [{ rel: "canonical", href: "https://nsu-echoes-connect.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "NSUMatch",
          url: "https://nsu-echoes-connect.lovable.app",
          description:
            "Campus-exclusive dating app for verified North South University students, built around free-slot matching and campus check-ins.",
          areaServed: "North South University, Dhaka, Bangladesh",
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) navigate({ to: "/app" });
      })
      .catch(() => {
        /* The public page remains available when auth is offline. */
      });
  }, [navigate]);

  return (
    <div className="min-h-dvh nsu-gradient text-navy-foreground flex flex-col pt-safe pb-safe">
      <header className="px-6 py-6 sm:px-10 flex items-center justify-between w-full max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gold text-gold-foreground grid place-items-center font-black">
            N
          </div>
          <span className="font-semibold tracking-tight text-lg">NSUMatch</span>
        </div>
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold hover:bg-white/10 transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 grid items-center gap-12 px-6 py-10 sm:px-10 sm:py-16 max-w-6xl mx-auto w-full lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3.5 py-2 text-xs font-semibold text-gold">
            <GraduationCap className="h-4 w-4" aria-hidden /> Made for your campus
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight max-w-xl">
            Dating, <span className="text-gold">exclusively</span> for NSU.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/80 leading-relaxed max-w-md">
            Meet someone who shares your free slot, your favorite tong, and a little of your
            everyday life.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Button
              asChild
              className="h-12 bg-gold text-gold-foreground hover:bg-gold/90 gold-glow font-semibold"
            >
              <Link to="/auth">
                Find your campus connection <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <Link to="/auth" search={{ mode: "signin" }}>
                I already have an account
              </Link>
            </Button>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-white/75">
            <ShieldCheck className="h-4 w-4 text-gold" aria-hidden /> NSU email required. Student
            IDs reviewed privately.
          </p>
        </div>

        <section aria-labelledby="campus-features" className="relative">
          <div className="mb-5 flex items-center gap-2 text-gold">
            <Sparkles className="h-5 w-5" aria-hidden />
            <h2 id="campus-features" className="text-lg font-bold">
              A little closer to your kind of person.
            </h2>
          </div>
          <div className="mb-4 rounded-3xl border border-gold/25 bg-white/10 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-gold-foreground">
                Between classes
              </span>
              <Heart className="h-5 w-5 text-gold" aria-hidden />
            </div>
            <p className="mt-6 text-2xl font-bold tracking-tight">Same campus. Shared moments.</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Turn a free period into a coffee, a conversation, or something worth showing up for.
            </p>
            <div className="mt-5 flex items-center gap-2 border-t border-white/15 pt-4 text-xs text-white/80">
              <CalendarDays className="h-4 w-4 text-gold" aria-hidden /> Connections that fit your
              schedule
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["🎓", "@northsouth.edu only", "Every account is a verified NSU email"],
              ["🕒", "Free-slot matching", "See who's free between classes with you"],
              ["💛", "Secret Crush List", "Matches only if it's mutual"],
              ["👻", "Ghost Mode", "Hide from your own department"],
            ].map(([icon, title, body]) => (
              <li
                key={title}
                className="rounded-2xl bg-white/10 border border-white/10 p-3.5 backdrop-blur-sm"
              >
                <span className="text-xl" aria-hidden>
                  {icon}
                </span>
                <p className="mt-1.5 font-semibold leading-tight">{title}</p>
                <p className="mt-0.5 text-xs text-white/70 leading-snug">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-white/70">
        <p>Not affiliated with North South University. Student-built MVP.</p>
        <Link to="/admin" className="mt-3 inline-block rounded px-2 py-1 hover:text-white">
          Admin sign-in
        </Link>
      </footer>
    </div>
  );
}
