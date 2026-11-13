import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedPushEndpoint,
  isRecentEvent,
} from "../supabase/functions/_shared/push-security.ts";
import { withSecurityHeaders } from "../src/lib/security-headers.ts";
import { profilePhotoPath } from "../src/lib/nsu.ts";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("profile photos store object paths and recognize legacy URLs without retaining bearer tokens", () => {
  const path = "00000000-0000-4000-8000-000000000001/photo.jpg";
  assert.equal(profilePhotoPath(path), path);
  assert.equal(
    profilePhotoPath(
      `https://example.supabase.co/storage/v1/object/sign/profile-photos/${path}?token=old`,
    ),
    path,
  );
  assert.equal(profilePhotoPath("https://images.unsplash.com/example"), null);
  assert.equal(profilePhotoPath("not a photo path"), null);
});

test("notification clicks stay inside the app even with an external URL in the payload", async () => {
  const handlers = new Map();
  let navigated;
  const self = {
    location: { origin: "https://example.com" },
    addEventListener: (name, handler) => handlers.set(name, handler),
    clients: {
      matchAll: async () => [
        {
          url: "https://example.com/",
          focus: async () => {},
          navigate: async (url) => {
            navigated = url;
          },
        },
      ],
    },
  };
  vm.runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self,
    URL,
  });
  for (const [input, expected] of [
    ["https://evil.test/phishing", "/app/matches"],
    ["//evil.test/app", "/app/matches"],
    ["/app/chat/123", "/app/chat/123"],
  ]) {
    let work;
    handlers.get("notificationclick")({
      notification: { close() {}, data: { url: input } },
      waitUntil: (promise) => {
        work = promise;
      },
    });
    await work;
    assert.equal(navigated, expected);
  }
});

test("push delivery accepts supported providers and rejects SSRF destinations", () => {
  for (const url of [
    "https://fcm.googleapis.com/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/token",
    "https://db5p.notify.windows.com.wns.windows.com/token",
  ])
    assert.equal(isAllowedPushEndpoint(url), true, url);
  for (const url of [
    "https://127.0.0.1/private",
    "https://169.254.169.254/metadata",
    "https://[::1]/",
    "https://localhost/",
    "http://fcm.googleapis.com/fcm/send/token",
    "https://fcm.googleapis.com.evil.test/fcm/send/token",
    "https://fcm.googleapis.com@evil.test/fcm/send/token",
    "https://user:password@fcm.googleapis.com/fcm/send/token",
    "https://fcm.googleapis.com:8443/fcm/send/token",
    "https://evil.push.apple.com.evil.test/",
    "https://fcm.googleapis.com/redirect",
    "https://web.push.apple.com/token#fragment",
    "file:///etc/passwd",
    null,
    {},
    "not a URL",
  ])
    assert.equal(isAllowedPushEndpoint(url), false, JSON.stringify(url));
});

test("notification events must have a valid, recent, nonfuture timestamp", () => {
  const now = Date.parse("2026-11-13T10:00:00Z");
  assert.equal(isRecentEvent("2026-11-13T09:59:30Z", 60_000, now), true);
  assert.equal(isRecentEvent("2026-11-13T09:58:59Z", 60_000, now), false);
  assert.equal(isRecentEvent("2026-11-13T10:00:01Z", 60_000, now), false);
  assert.equal(isRecentEvent("invalid", 60_000, now), false);
});

test("security headers preserve responses and prevent private-page caching", async () => {
  const response = withSecurityHeaders(
    new Response("private", { status: 403, headers: { "X-Existing": "kept" } }),
    new Request("https://example.com/app/chat/id"),
  );
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "private");
  assert.equal(response.headers.get("X-Existing"), "kept");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(response.headers.get("Strict-Transport-Security"), /max-age=/);
  assert.match(response.headers.get("Content-Security-Policy"), /object-src 'none'/);
  const publicPage = withSecurityHeaders(new Response("public"), new Request("http://localhost/"));
  assert.equal(publicPage.headers.has("Strict-Transport-Security"), false);
  assert.equal(publicPage.headers.has("Cache-Control"), false);
});
