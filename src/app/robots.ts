import type { MetadataRoute } from "next";

/**
 * This is a PRIVATE council financial tool, not a public website. We explicitly
 * tell every crawler not to index any of it, and deliberately publish no
 * sitemap — exposing the route structure of a live financial system would be a
 * privacy/security risk. Access control is handled at the deployment layer.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
