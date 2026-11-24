import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * Crawlers get the pages the sitemap lists (clean paths: titles, slots, channels, seasons, analysis, the default
 * views). URLs with conditions in the query string (week-by-week schedules, search terms, filter combinations,
 * comparisons) are endless variations of those pages; each one is a fresh database read, and on the free plans a
 * crawler walking them would cost more than all visitors (docs/operations.md → Usage and limits).
 */
export const ROBOTS_DISALLOW = ["/*?", "/api/"];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW }],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin
  };
}
