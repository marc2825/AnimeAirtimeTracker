import { sitemapIndexResponse } from "@/server/sitemaps";

/** Sitemap index (static pages, seasons and channels, slots, titles); see src/server/sitemaps.ts. */
export function GET() {
  return sitemapIndexResponse();
}
