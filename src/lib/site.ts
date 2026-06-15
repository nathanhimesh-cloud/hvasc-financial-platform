/**
 * Canonical site identity + base URL.
 *
 * Used by metadata, robots, and the manifest. The base URL resolves, in order:
 *   1. NEXT_PUBLIC_SITE_URL              — explicit override (set on Vercel)
 *   2. https://$VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable prod domain
 *   3. http://localhost:3000             — local dev
 */
export const SITE_URL = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
})();

export const SITE_NAME = "Hope Vale ASC Financial Intelligence Platform";
export const SITE_SHORT_NAME = "HVASC Finance";
export const SITE_DESCRIPTION =
  "Private financial intelligence dashboard for Hope Vale Aboriginal Shire Council. Built and maintained by SandS Australia.";

/** Brand colours (kept in sync with globals.css). */
export const BRAND_BG = "#000000";
export const BRAND_ACCENT = "#c8a24b";
