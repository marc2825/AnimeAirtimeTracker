import { datasetCacheProfile } from "../cache";
import { db } from "../db";

/** Titles with at least one non-deleted airing, most recently updated first (sitemap limit 50,000). */
export async function getRecentTitleSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  "use cache";
  datasetCacheProfile();
  return db().title.findMany({
    where: { broadcasts: { some: { deleted: false } } },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 45_000
  });
}
