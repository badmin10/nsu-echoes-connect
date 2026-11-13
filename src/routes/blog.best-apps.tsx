import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/site";

const URL = `${SITE_URL}/blog/best-apps`;
const TITLE = "The Best Dating Apps for NSU Students (2026)";
const DESCRIPTION =
  "Comparing the dating apps NSU students actually use — Tinder U, UMatch, Bumble, and NSUMatch — for safety, campus fit, and finding someone nearby.";

export const Route = createFileRoute("/blog/best-apps")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          mainEntityOfPage: URL,
          author: { "@type": "Organization", name: "NSUMatch" },
          publisher: { "@type": "Organization", name: "NSUMatch" },
        }),
      },
    ],
  }),
  component: BestApps,
});

function BestApps() {
  return (
    <article className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:underline">
            ← NSUMatch
          </Link>
        </nav>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">{TITLE}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          A practical comparison for North South University students looking for something better
          than swiping through strangers across Dhaka.
        </p>

        <section className="mt-8 space-y-4 leading-relaxed">
          <p>
            Most mainstream dating apps weren't built with a single campus in mind. If you're an NSU
            student, you've probably swiped past the same five batchmates on Tinder, gotten matched
            with someone three districts away on Bumble, or wondered whether the "verified student"
            badge on UMatch actually means anything for your school. Here's how the popular options
            stack up against an app built specifically for North South University.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Tinder (and Tinder U)</h2>
          <p className="mt-2">
            Tinder has the biggest pool and Tinder U adds a college filter, but Tinder U isn't
            officially supported in Bangladesh and the "U" badge isn't a real ID check. Expect a
            wide radius, lots of off-campus profiles, and no way to filter for shared free slots or
            department.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">UMatch</h2>
          <p className="mt-2">
            UMatch markets itself to college students and pulls roughly 1,300 monthly searches in
            English-speaking markets. It's lighter on verification than it looks — most regions
            accept any signup — and there's no concept of campus locations like the Cafeteria, Open
            Plaza, or Library that NSU students actually meet at.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Bumble</h2>
          <p className="mt-2">
            Bumble's "women message first" rule is its strongest feature. The downside for an NSU
            student is the same as Tinder: you can't filter by NSU department, you'll match across
            all of Dhaka, and you can't tell at a glance whether someone is a real student.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">NSUMatch</h2>
          <p className="mt-2">
            NSUMatch is exclusive to verified <code>@northsouth.edu</code> emails with a manual
            Student ID check, so every profile you swipe is a real NSU student. It adds a few things
            mainstream apps can't:
          </p>
          <ul className="mt-3 list-disc list-inside space-y-1">
            <li>
              <strong>Free-slot matcher</strong> — pick the times you're free between classes (e.g.
              "ST 09:40 AM") and see who shares them.
            </li>
            <li>
              <strong>"Meet me at..." check-ins</strong> — show up as "Grabbing coffee at the
              Cafeteria" or "Suffering in the Library".
            </li>
            <li>
              <strong>Ghost Mode</strong> — hide your profile from your own department (or any
              department you'd rather not run into).
            </li>
            <li>
              <strong>Crush List</strong> — privately add up to 3 NSU students. They only find out
              if they add you back.
            </li>
            <li>
              <strong>Screenshot-guarded chat</strong> — a privacy notice and basic guard against
              screenshots leaking to campus group chats.
            </li>
          </ul>
        </section>

        <section className="mt-10 rounded-2xl bg-card border border-border p-5">
          <h2 className="text-lg font-bold">TL;DR for NSU students</h2>
          <p className="mt-2 text-sm">
            If you want the biggest possible pool across Dhaka, mainstream apps are fine. If you
            want to actually match with NSU students you'll see on campus, share a free slot with,
            and trust are real students — NSUMatch is built for that.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Create your NSUMatch account
          </Link>
        </section>

        <footer className="mt-12 text-xs text-muted-foreground">
          Not affiliated with North South University, Tinder, Bumble, or UMatch.
        </footer>
      </div>
    </article>
  );
}
