/* NSUMatch service worker — shows push notifications and opens the right chat. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function notificationURL(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (
      url.origin === self.location.origin &&
      (url.pathname === "/app" || url.pathname.startsWith("/app/"))
    ) {
      return url.pathname + url.search;
    }
  } catch {
    /* Use the inbox when a payload contains an invalid URL. */
  }
  return "/app/matches";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    data = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    data = { title: "NSUMatch", body: event.data ? event.data.text() : "" };
  }
  const url = notificationURL(data.url);

  event.waitUntil(
    (async () => {
      // Skip the banner if the user is already looking at that exact chat.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const viewing = windows.some(
        (c) => c.visibilityState === "visible" && new URL(c.url).pathname === url,
      );
      if (viewing) return;
      await self.registration.showNotification(data.title || "NSUMatch", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/badge-72.png",
        tag: data.tag,
        renotify: !!data.tag,
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = notificationURL(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of windows) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
