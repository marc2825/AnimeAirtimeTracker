/**
 * The sitemap index and its child sitemaps, built per request from cached data so that `next build` never needs a
 * database. When the database cannot be read a child sitemap answers 503 with Retry-After instead of a shortened
 * list: crawlers keep the last good sitemap and come back, rather than dropping every detail page.
 */
import { connection } from "next/server";

import { ANALYSIS_SLUGS } from "@/analysis/slugs";
import { TRACKED_CHANNELS } from "@/domain/coverage";
import { currentSeason, seasonFromOrdinal, seasonId, seasonOrdinal, shiftSeason } from "@/domain/season";
import { currentAnimeDate } from "@/domain/time";
import { siteUrl } from "@/lib/site";
import {
  SITEMAP_FILES,
  pastLastModified,
  renderSitemap,
  renderSitemapIndex,
  staticSitemapEntries,
  titleSitemapSince,
  type SitemapEntry,
  type SitemapFile
} from "@/lib/sitemap";

import { getSitemapChangeTimes, getSitemapSlots, getSitemapTitles } from "./queries/sitemap";
import { getCoveredSeasonOrdinals } from "./queries/status";

const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" };

async function entriesFor(file: SitemapFile, url: (path: string) => string, now: Date): Promise<SitemapEntry[]> {
  switch (file) {
    case "static": {
      const changes = await getSitemapChangeTimes();
      return staticSitemapEntries(url, changes.latest, now, ANALYSIS_SLUGS.map((slug) => `/analysis/${slug}`));
    }
    case "seasons": {
      const [changes, covered] = await Promise.all([getSitemapChangeTimes(), getCoveredSeasonOrdinals()]);
      const seasonChanged = new Map(changes.seasons.map((row) => [row.ordinal, row.lastModified]));
      const channelChanged = new Map(changes.channels.map((row) => [row.slug, row.lastModified]));
      const current = seasonOrdinal(currentSeason(now));
      // Up to next season (season pages further ahead are 404s); shiftSeason also crosses the year correctly.
      const last = seasonOrdinal(shiftSeason(currentSeason(now), 1));
      return [
        ...covered
          .filter((ordinal) => ordinal <= last)
          .map((ordinal) => ({
            url: url(`/seasons/${seasonId(seasonFromOrdinal(ordinal))}`),
            lastModified: pastLastModified(seasonChanged.get(ordinal), now),
            changeFrequency: ordinal >= current ? ("daily" as const) : ("monthly" as const)
          })),
        ...TRACKED_CHANNELS.map((channel) => ({
          url: url(`/channels/${channel.slug}`),
          lastModified: pastLastModified(channelChanged.get(channel.slug), now),
          changeFrequency: "weekly" as const
        }))
      ];
    }
    case "slots":
      return (await getSitemapSlots()).map((slot) => ({
        url: url(`/slots/${encodeURIComponent(slot.slug)}`),
        lastModified: pastLastModified(slot.lastModified, now),
        changeFrequency: "weekly" as const
      }));
    case "titles":
      return (await getSitemapTitles(titleSitemapSince(currentAnimeDate(now)))).map((title) => ({
        url: url(`/titles/${title.slug}`),
        lastModified: pastLastModified(title.lastModified, now),
        changeFrequency: "weekly" as const
      }));
  }
}

/** `/sitemap.xml`: the index of the child sitemaps. Reads no data, so it is always available. */
export async function sitemapIndexResponse(): Promise<Response> {
  await connection();
  const base = siteUrl();
  return new Response(renderSitemapIndex(SITEMAP_FILES.map((file) => new URL(`/sitemaps/${file}.xml`, base).toString())), { headers: XML_HEADERS });
}

/** `/sitemaps/<file>.xml`, or 503 when the database cannot be read. */
export async function sitemapResponse(file: SitemapFile): Promise<Response> {
  await connection();
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  let entries: SitemapEntry[];
  try {
    entries = await entriesFor(file, url, new Date());
  } catch {
    return new Response("Sitemap temporarily unavailable.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store" }
    });
  }
  return new Response(renderSitemap(entries), { headers: XML_HEADERS });
}
