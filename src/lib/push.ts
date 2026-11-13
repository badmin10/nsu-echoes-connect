// Web Push (works on Android Chrome/Firefox/Samsung Internet, desktop browsers,
// and iPhone/iPad 16.4+ **only after "Add to Home Screen"**).
import { supabase } from "@/integrations/supabase/client";

/** Public VAPID key — safe to ship. The private half lives only in the edge function's secrets. */
export const VAPID_PUBLIC_KEY =
  "BLBNZa00lnnfB6K7Xy3_ealOSA597UDrmfaT8o0ZFvjI8pLGiEYXKdxUa3xUhNBOTYMenqGKxYiyIucBfD_-Efs";

export type PushState = "unsupported" | "needs-install" | "denied" | "enabled" | "disabled";

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "enabled" : "disabled";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Must be called from a tap (browsers require a user gesture for the permission prompt). */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) {
    return {
      ok: false,
      error: isIOS()
        ? "On iPhone, add NSUMatch to your Home Screen first (Share → Add to Home Screen)."
        : "This browser doesn't support notifications.",
    };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notifications are blocked. Allow them in your browser settings." };
  }
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!reg) return { ok: false, error: "Couldn't start the notification service." };
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  const json = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    _endpoint: sub.endpoint,
    _p256dh: json.keys?.p256dh ?? "",
    _auth: json.keys?.auth ?? "",
    _user_agent: navigator.userAgent,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Fire-and-forget: ask the server to push a notification to the other person. */
export function notify(
  body: { type: "message"; message_id: string } | { type: "match"; profile_id: string },
) {
  supabase.functions.invoke("notify", { body }).catch(() => {
    // Notifications are best-effort; never block the UI on them.
  });
}
