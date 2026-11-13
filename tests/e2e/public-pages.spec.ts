import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";

test("landing page renders on the server and fits the viewport", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("/");
  expect(await response.text()).toContain("Dating,");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dating, exclusively for NSU." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
  await page.getByRole("link", { name: "I already have an account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("auth form offers password visibility and announces recoverable errors", async ({ page }) => {
  // All auth writes are intercepted; this test never submits to the real backend.
  await page.route("**/auth/v1/token?**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }),
    }),
  );
  await page.goto("/auth?mode=signin");
  await page.getByLabel("NSU email").fill("student@northsouth.edu");
  await page.getByLabel("Password", { exact: true }).fill("example-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByRole("alert")).toContainText("Invalid login credentials");
  await expect(page.getByRole("button", { name: "Sign in", exact: true }).last()).toBeEnabled();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("signup is accessible and private pages redirect signed-out visitors", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Verified NSU students only" })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth/);
});

test("private profile photos resolve stored paths to five-minute URLs", async ({ page }) => {
  const localEnv = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const backend =
    process.env.VITE_SUPABASE_URL ??
    localEnv
      .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ??
    "https://example.supabase.co";
  const userId = "00000000-0000-4000-8000-000000000001";
  const photoPath = `${userId}/photo.jpg`;
  const profile = {
    id: userId,
    user_id: userId,
    first_name: "Student",
    age: 21,
    bio: "A sample profile for a local browser test.",
    department: "SBE",
    major: "Economics",
    photo_url: photoPath,
    photos: [photoPath],
    free_slots: [],
    location: "none",
    ghost_from_depts: [],
    verified: false,
    banned: false,
    id_card_uploaded: false,
    onboarding_complete: true,
    verification_status: "none",
  };
  const user = {
    id: userId,
    email: "student@northsouth.edu",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
    }),
  ).toString("base64url");
  const session = {
    access_token: `e30.${payload}.test`,
    refresh_token: "local-test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: `sb-${new URL(backend).hostname.split(".")[0]}-auth-token`, session },
  );
  const expirations: number[] = [];
  // Intercept every request to this backend, including writes and Realtime.
  await page.route(`${new URL(backend).origin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/storage/v1/object/sign/") && request.method() === "POST") {
      expirations.push(request.postDataJSON().expiresIn);
      return route.fulfill({
        json: { signedURL: `/object/sign/profile-photos/${photoPath}?token=local-test` },
      });
    }
    if (path.startsWith("/storage/v1/object/sign/")) {
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    }
    if (path === "/rest/v1/profiles") return route.fulfill({ json: profile });
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (path.endsWith("get_profile_verification"))
      return route.fulfill({ json: [{ id_card_path: null, verification_note: null }] });
    return route.fulfill({ json: [], headers: { "content-range": "*/0" } });
  });
  await page.routeWebSocket(`${new URL(backend).origin.replace(/^http/, "ws")}/**`, () => {});
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByAltText("Your main photo")).toHaveAttribute("src", /token=local-test/);
  expect(expirations.length).toBeGreaterThan(0);
  expect(expirations.every((expiry) => expiry === 300)).toBe(true);
});
