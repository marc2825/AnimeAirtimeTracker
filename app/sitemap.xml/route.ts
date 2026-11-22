import { connection } from "next/server";

import { ANALYSIS_SLUGS } from "@/analysis/slugs";
import { TRACKED_CHANNELS } from "@/domain/coverage";
import { currentSeason, seasonFromOrdinal, seasonId, seasonOrdinal } from "@/domain/season";
import { siteUrl } from "@/lib/site";
import { renderSitemap, type SitemapEntry } from "@/lib/sitemap";
import { getRecentTitleSlugs } from "@/server/queries/sitemap";
import { listSlots } from "@/server/queries/slots";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";

const STATIC_ROUTES = ["/", "/schedule", "/search", "/slots", "/seasons", "/channels", "/stats", "/about", "/status", "/privacy", "/terms", "/analysis", ...ANALYSIS_SLUGS.map((slug) => `/analysis/${slug}`)];

/**
 * The sitemap is built per request from cached data, so `next build` never needs a database. When the
 * database cannot be read it answers 503 with Retry-After instead of a shortened list: crawlers keep the last
 * good sitemap and come back, rather than dropping every detail page.
 */
export async function GET() {
  await connection();
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  let entries: SitemapEntry[];
  try {
    const [slots, titles, covered] = await Promise.all([listSlots(), getRecentTitleSlugs(), getCoveredSeasonOrdinals()]);
    const now = seasonOrdinal(currentSeason());
    entries = [
      ...STATIC_ROUTES.map((path) => ({ url: url(path), changeFrequency: "daily" as const })),
      ...covered
        .filter((ordinal) => ordinal <= now + 1)
        .map((ordinal) => ({ url: url(`/seasons/${seasonId(seasonFromOrdinal(ordinal))}`), changeFrequency: ordinal >= now ? ("daily" as const) : ("monthly" as const) })),
      ...TRACKED_CHANNELS.map((channel) => ({ url: url(`/channels/${channel.slug}`), changeFrequency: "weekly" as const })),
      ...slots.map((slot) => ({ url: url(`/slots/${encodeURIComponent(slot.slug)}`), changeFrequency: "weekly" as const })),
      ...titles.map((title) => ({ url: url(`/titles/${title.slug}`), lastModified: title.updatedAt, changeFrequency: "weekly" as const }))
    ];
  } catch {
    return new Response("Sitemap temporarily unavailable.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store" }
    });
  }
  return new Response(renderSitemap(entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" }
  });
}
