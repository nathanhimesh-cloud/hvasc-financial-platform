import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_SHORT_NAME, SITE_DESCRIPTION, BRAND_BG, BRAND_ACCENT } from "@/lib/site";

/**
 * PWA manifest — lets staff "install" the dashboard as an app on their device
 * and gives it a proper name/icon/theme instead of the browser default.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_BG,
    theme_color: BRAND_ACCENT,
    lang: "en-AU",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
