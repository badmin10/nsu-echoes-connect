// Sends Web Push notifications for new messages and new matches.
//
// Called by the app right after a message is sent / a match happens. The
// caller's JWT is used to prove the event is real (RLS checks they sent the
// message / are actually matched), then the service role looks up the other
// person's devices and pushes to each one.
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   VAPID_PRIVATE_KEY  JSON JWK  {"kty":"EC","crv":"P-256","x":..,"y":..,"d":..}
//   VAPID_SUBJECT      mailto:you@northsouth.edu
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { buildPushHTTPRequest } from "npm:@pushforge/builder@2.0.4";
import { isAllowedPushEndpoint, isRecentEvent } from "../_shared/push-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MESSAGE_MAX_AGE_MS = 60_000;
const MATCH_MAX_AGE_MS = 5 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidKey) return json({ error: "Push not configured" }, 503);

    // Client acting as the caller — every read below goes through their RLS.
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: me } = await asUser
      .from("profiles")
      .select("id,first_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!me) return json({ error: "No profile" }, 403);

    const input = await req.json().catch(() => ({}));
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "Bad request" }, 400);
    let recipient: string;
    let eventKey: string;
    let payload: { title: string; body: string; url: string; tag: string };

    if (input.type === "message" && typeof input.message_id === "string") {
      const { data: msg } = await asUser
        .from("messages")
        .select("id,from_profile_id,to_profile_id,created_at")
        .eq("id", input.message_id)
        .maybeSingle();
      if (!msg || msg.from_profile_id !== me.id) return json({ error: "Forbidden" }, 403);
      if (!isRecentEvent(msg.created_at, MESSAGE_MAX_AGE_MS)) {
        return json({ skipped: "stale" });
      }
      recipient = msg.to_profile_id;
      eventKey = `message:${msg.id}`;
      // Privacy: no message text on the lock screen.
      payload = {
        title: "NSUMatch",
        body: `💬 New message from ${me.first_name}`,
        url: `/app/chat/${me.id}`,
        tag: `chat-${me.id}`,
      };
    } else if (input.type === "match" && typeof input.profile_id === "string") {
      const { data: isMatch } = await asUser.rpc("is_mutual_match", {
        a: me.id,
        b: input.profile_id,
      });
      if (!isMatch) return json({ error: "Forbidden" }, 403);
      // Only right after the caller's own like, so this can't be replayed to spam someone.
      const { data: mySwipe } = await asUser
        .from("swipes")
        .select("created_at")
        .eq("from_profile_id", me.id)
        .eq("to_profile_id", input.profile_id)
        .maybeSingle();
      if (!mySwipe || !isRecentEvent(mySwipe.created_at, MATCH_MAX_AGE_MS)) {
        return json({ skipped: "stale" });
      }
      recipient = input.profile_id;
      eventKey = `match:${[me.id, recipient].sort().join(":")}`;
      payload = {
        title: "It's a match! 💛",
        body: `You and ${me.first_name} liked each other. Say hi!`,
        url: `/app/chat/${me.id}`,
        tag: `match-${me.id}`,
      };
    } else {
      return json({ error: "Bad request" }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    // Re-check current safety state for messages as well as matches.
    const { data: allowed, error: matchError } = await asUser.rpc("is_mutual_match", {
      a: me.id,
      b: recipient,
    });
    if (matchError || !allowed) return json({ error: "Forbidden" }, 403);
    const { error: claimError } = await admin
      .from("push_deliveries")
      .insert({ event_key: eventKey });
    if (claimError?.code === "23505") return json({ skipped: "already_sent" });
    if (claimError) return json({ error: "Notification unavailable" }, 503);
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("profile_id", recipient);

    const privateJWK = JSON.parse(vapidKey);
    const adminContact = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@nsumatch.app";

    const results = await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          if (!isAllowedPushEndpoint(s.endpoint)) return 0;
          const { endpoint, headers, body } = await buildPushHTTPRequest({
            privateJWK,
            subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            message: {
              payload,
              adminContact,
              options: { ttl: 60 * 60 * 12, urgency: "high", topic: payload.tag.slice(0, 32) },
            },
          });
          // Validate both stored and builder-returned URLs; never follow redirects.
          if (!isAllowedPushEndpoint(endpoint)) return 0;
          const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          // Expired / unsubscribed devices: clean up.
          if (res.status === 404 || res.status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
          return res.status;
        } catch (e) {
          console.error("push failed", e);
          return 0;
        }
      }),
    );

    return json({
      sent: results.filter((s) => s >= 200 && s < 300).length,
      devices: results.length,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "Internal error" }, 500);
  }
});
