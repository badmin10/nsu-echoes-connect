// Keep this allowlist in sync with save_push_subscription in the audit migration.
// Never send server-authenticated requests to arbitrary subscription URLs.
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash)
      return false;
    return (
      (url.hostname === "fcm.googleapis.com" && url.pathname.startsWith("/fcm/send/")) ||
      (url.hostname === "updates.push.services.mozilla.com" &&
        url.pathname.startsWith("/wpush/v2/")) ||
      ((url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com")) &&
        url.pathname.startsWith("/")) ||
      ((url.hostname === "wns.windows.com" || url.hostname.endsWith(".wns.windows.com")) &&
        url.pathname.startsWith("/"))
    );
  } catch {
    return false;
  }
}

export function isRecentEvent(createdAt: string, maxAgeMs: number, now = Date.now()): boolean {
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}
