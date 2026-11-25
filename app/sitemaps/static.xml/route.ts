import { sitemapResponse } from "@/server/sitemaps";

/** Child sitemap; see src/server/sitemaps.ts. */
export function GET() {
  return sitemapResponse("static");
}
