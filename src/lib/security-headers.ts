/** Applied to successful SSR responses and error pages alike. */
export function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Inline hydration/theme scripts are required by TanStack Start. Restrict
  // embedding and plugin content without breaking those scripts.
  headers.set(
    "Content-Security-Policy",
    "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  );
  const url = new URL(request.url);
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (/^\/(?:app|admin|auth|onboarding|reset-password)(?:\/|$)/.test(url.pathname)) {
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
