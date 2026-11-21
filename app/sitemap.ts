import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { TRACKED_CHANNELS } from "@/domain/coverage";
import { currentSeason, seasonFromOrdinal, seasonId, seasonOrdinal } from "@/domain/season";
import { siteUrl } from "@/lib/site";
import { listSlots } from "@/server/queries/slots";
import { getRecentTitleSlugs } from "@/server/queries/sitemap";
import { getCoveredSeasonOrdinals } from "@/server/queries/status";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request (cached data underneath) so `next build` never needs a database.
  await connection();
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  const staticRoutes = ["/", "/schedule", "/search", "/slots", "/seasons", "/channels", "/stats", "/about", "/status"].map((path) => ({ url: url(path), changeFrequency: "daily" as const }));
  try {
    const [slots, titles, covered] = await Promise.all([listSlots(), getRecentTitleSlugs(), getCoveredSeasonOrdinals()]);
    const now = seasonOrdinal(currentSeason());
    return [
      ...staticRoutes,
      ...covered
        .filter((ordinal) => ordinal <= now + 1)
        .map((ordinal) => ({ url: url(`/seasons/${seasonId(seasonFromOrdinal(ordinal))}`), changeFrequency: ordinal >= now ? ("daily" as const) : ("monthly" as const) })),
      ...TRACKED_CHANNELS.map((channel) => ({ url: url(`/channels/${channel.slug}`), changeFrequency: "weekly" as const })),
      ...slots.map((slot) => ({ url: url(`/slots/${encodeURIComponent(slot.slug)}`), changeFrequency: "weekly" as const })),
      ...titles.map((title) => ({ url: url(`/titles/${title.slug}`), lastModified: title.updatedAt, changeFrequency: "weekly" as const }))
    ];
  } catch {
    return staticRoutes;
  }
}
