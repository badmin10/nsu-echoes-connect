import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
        content:
          "Verified NSU students only. Match on shared free slots and campus check-ins.",
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
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
      else setChecking(false);
    });
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen grid place-items-center text-sm opacity-70">Loading…</div>;
  }

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
        <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
          Dating, <span className="text-gold">exclusively</span> for NSU.
        </h1>
        <p className="mt-4 text-base opacity-85 leading-relaxed">
          Verified students only. Skip random apps — find someone who actually shares your free slot
          and your favorite tong.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Button
            asChild
            className="h-12 bg-gold text-gold-foreground hover:bg-gold/90 gold-glow font-semibold"
          >
            <Link to="/auth">Create your account</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 bg-white/10 border-white/30 text-white hover:bg-white/20"
          >
            <Link to="/auth">I already have an account</Link>
          </Button>
        </div>

        <ul className="mt-10 space-y-2 text-sm opacity-90">
          <li>✓ @northsouth.edu verification + email confirmation</li>
          <li>✓ Free-slot matcher, campus check-ins, Crush List</li>
          <li>✓ Ghost Mode to hide from your own department</li>
          <li>✓ Screenshot guard in chats — privacy by default</li>
        </ul>
      </main>

      <footer className="px-6 pb-6 text-center text-xs opacity-60">
        Not affiliated with North South University. Student-built MVP.
      </footer>
    </div>
  );
}
