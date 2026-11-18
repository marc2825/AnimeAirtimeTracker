import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { siteUrl } from "@/lib/site";
import { listSlots } from "@/server/queries/slots";
import { getRecentTitleSlugs } from "@/server/queries/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request (cached data underneath) so `next build` never needs a database.
  await connection();
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  const staticRoutes = ["/", "/schedule", "/search", "/slots", "/stats", "/about", "/status"].map((path) => ({ url: url(path), changeFrequency: "daily" as const }));
  try {
    const [slots, titles] = await Promise.all([listSlots(), getRecentTitleSlugs()]);
    return [
      ...staticRoutes,
      ...slots.map((slot) => ({ url: url(`/slots/${encodeURIComponent(slot.slug)}`), changeFrequency: "weekly" as const })),
      ...titles.map((title) => ({ url: url(`/titles/${title.slug}`), lastModified: title.updatedAt, changeFrequency: "weekly" as const }))
    ];
  } catch {
    return staticRoutes;
  }
}
