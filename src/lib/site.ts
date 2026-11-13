/**
 * Public address of the site, used for canonical links, Open Graph tags,
 * robots.txt and the sitemap. Set VITE_SITE_URL in .env when the site moves
 * to its own domain.
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://nsu-echoes-connect.lovable.app"
).replace(/\/+$/, "");
