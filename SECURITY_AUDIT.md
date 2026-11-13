# Source audit — 13 November 2026

The fixes below are implemented locally. Production database policies, hosting
configuration, account settings, and deployment history were not inspected or
changed. This directory has no `.git` metadata, so a Git history audit and a
reviewable Git diff were unavailable. No production accounts or messages were
created during testing.

## Security fixes

| Finding                                                                                                     | Change                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible profiles exposed private ID-document paths and rejection notes to other students.                   | Revoked column reads and added an owner/admin-only verification RPC; updated profile and admin screens.                                                                                     |
| Ghost Mode only filtered the discovery UI. Direct API reads bypassed it.                                    | Added database enforcement for both users' department preferences; applied it to discovery, swipes, and secret-crush matches.                                                               |
| Clients could delete/recreate a profile to reset a ban, or edit account identity fields.                    | Removed client profile creation/deletion and limited editable columns; signup still uses the existing backend trigger.                                                                      |
| Verification submissions accepted arbitrary document paths, and documents could be replaced after approval. | Require an existing upload in the submitting user's folder; lock submitted/approved document references.                                                                                    |
| Default table grants could defeat column-specific messaging/report permissions.                             | Explicitly revoked broad writes before restoring allowed columns. Message timestamps/content and admin roles cannot be forged.                                                              |
| Chat images could reference another sender/conversation.                                                    | Validate the uploaded object, sender folder, and recipient folder before inserting a photo message.                                                                                         |
| Push endpoints accepted arbitrary HTTPS URLs, creating a server-side request-forgery risk.                  | Restricted registration and delivery to supported browser-push providers; blocked redirects and added request timeouts and a device limit.                                                  |
| Recent notification events could be replayed repeatedly.                                                    | Added atomic, server-only event claims; re-check match/block/ban status before delivery. Delivery is best-effort and at most once per claimed event.                                        |
| Typing indicators used public Realtime broadcast topics.                                                    | Added private channels and database policies restricted to matched conversation participants.                                                                                               |
| Profile photos persisted year-long bearer URLs.                                                             | Store object paths, normalize existing signed references, and renew five-minute links under the viewer's storage permissions. Profile-photo storage is private and restricted by size/type. |
| Push payload URLs could navigate outside the app.                                                           | Restricted notification-click navigation to same-origin `/app` routes.                                                                                                                      |
| Authenticated pages lacked explicit cache/privacy response headers.                                         | Added private/no-store responses, indexing restrictions, MIME protection, referrer/permissions policies, HTTPS HSTS, and a limited CSP compatible with Lovable framing.                     |
| Environment files were not ignored.                                                                         | Added `.env` ignores and a credential-free example; added a Gitleaks rule for private EC/VAPID JWKs.                                                                                        |

The SQL changes are in
`supabase/migrations/20261113140000_security_audit.sql`. Existing migrations and
published history were preserved.

## Dependencies and tools

- Initial npm audit: **8 vulnerable package entries**, including a high-severity
  Zod advisory. Upgraded Zod to 4.6.7 and scoped the patched minimatch override to
  TypeScript ESLint; kept ESLint's separate minimatch API compatible.
- The original Bun lock also retained older vulnerable framework/build packages,
  including a TanStack Start reflected-XSS advisory. Regenerated `bun.lock` from
  the patched npm resolution. Both lockfiles are now scanned, not just installed
  packages. The nested override requires **Bun 1.4+**.
- Ran [Google OSV-Scanner 2.7.1](https://github.com/google/osv-scanner): **zero
  advisory findings** in the final npm and Bun lockfiles and the edge function's
  ten resolved packages. `scripts/edge-sbom.mjs` exports Deno's dependency lock
  to CycloneDX because this scanner does not parse Deno lockfile v5 directly.
- Ran [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks) locally with redacted
  output. Downloaded scanner binaries were checked against the releases'
  SHA-256 checksums. Three remaining filesystem findings were classified: two
  public Supabase **anon** JWTs in `.env`, and a real VAPID private JWK in the
  ignored `vapid.secret.local` file. These findings were not blanket-suppressed.
- Added a SHA-pinned GitHub Actions workflow for lint, types, database/security
  tests, dependency scans, a production build, and browser tests. It runs on
  pushes, pull requests, and weekly. It has not been executed on GitHub yet.
- Added an isolated, frozen Deno lock for the notification function.

Relevant primary references:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[private Realtime authorization](https://supabase.com/docs/guides/realtime/authorization),
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), and
[Bun scoped overrides](https://bun.sh/docs/pm/overrides).

## UI and reliability

The landing page now uses the available desktop width while retaining a mobile
layout, and its sign-in links open the sign-in form. Auth forms have native
validation, descriptive labels, password visibility, announced status/errors,
duplicate-submit protection, and disabled controls until they are interactive.
Removed claims about breached-password checking that cannot be verified from
this source alone. Added visible keyboard focus, retry states for failed account
and discovery loads, race protection when auth/profile requests complete late,
and success messages that only appear after profile saves succeed.

## Validation

- `npm run lint`: no errors; six existing shadcn Fast Refresh export warnings.
- `npm run typecheck`: passed.
- `npm test`: 14 passing tests, including the actual migration chain running
  against local PostgreSQL via PGlite. Tests exercise anonymous/private reads,
  ownership, roles, verification uploads, Ghost Mode, matched/blocked messaging,
  image references, push endpoint validation, event deduplication, and URL safety.
- `npm run test:e2e`: 8 passing desktop/mobile Chromium tests. Backend writes are
  intercepted; tests cover navigation, auth errors, redirects, and five-minute
  photo signing. Axe found no WCAG A/AA violations on the landing/signup pages.
- `npm run build`: passed (upstream bundler directive warnings remain).
- Deno 2.9.6 notification-function type check: passed with the frozen edge lock.
- Final npm audit and OSV npm/Bun/edge scans: zero known vulnerabilities.
- Bun 1.4.4 frozen-lock resolution: passed.

## Deployment and remaining limits

1. Deploy the new SQL migration, frontend, and `notify` function together in a
   coordinated release. The old frontend requests the now-private columns and
   cannot interpret stored photo paths. Keep the interval between applying the
   migration and releasing the frontend short. Run the migration only once via
   the normal Supabase migration system.
2. Redeploy `supabase/functions/notify` with its `_shared` module and Deno config;
   retain the existing server-side VAPID secrets. The new `push_deliveries` table
   must exist before enabling the new function.
3. Keep the local VAPID private key out of shared source archives. Its Git ignore
   does not protect ZIP uploads. If it has been distributed, replace the key pair
   and re-register browser subscriptions; its previous exposure/history cannot
   be established from this directory.
4. Previously issued year-long photo URLs remain usable until they expire or
   their storage objects are replaced/deleted. Editing saved URL strings cannot
   revoke an already-issued link. New links expire after five minutes.
5. Push allowlists support Google FCM, Mozilla, Apple, and Windows WNS. Add a
   provider to both SQL and TypeScript validators before supporting other push
   services. At-most-once event claims favor spam prevention over delivery retries.
6. The CSP deliberately does not restrict scripts while TanStack hydration and
   Lovable's scripts use inline execution; nonce-based script enforcement remains
   a deployment-specific follow-up. No authenticated two-device production
   messaging/push delivery or real Safari runtime was tested.
7. Profile deletion is intentionally unavailable to browser clients because it
   previously reset moderation state. Account erasure needs a trusted backend
   workflow that preserves moderation requirements. Review auth email-confirmation,
   breached-password protection, rate limits, and admin MFA in the live dashboard;
   source code alone cannot establish those settings.
