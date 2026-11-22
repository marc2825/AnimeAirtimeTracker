import { overlapOf, sharedChannelSlugs, type CompareSide } from "@/domain/compare";
import type { Season } from "@/domain/season";
import { regionalDelay } from "@/domain/stats";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { getTrackedChannels } from "./common";
import { loadAirings, statsFilter, toAiringFilter, type StatsFilter } from "./stats";

/** The stats filter for one side: a region's channels, or a single channel; first-run airings only. */
export function sideFilter(side: CompareSide): StatsFilter {
  return side.kind === "region" ? statsFilter({ region: side.key }) : statsFilter({ region: null, channelSlug: side.slug });
}

/**
 * Titles both sides aired in the season and the time difference of the same episode (B − A). Channels that
 * both sides receive are left out on both sides: their airings are the same broadcast and would match trivially.
 */
export async function getPairComparison(season: Season, a: CompareSide, b: CompareSide) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const shared = new Set(sharedChannelSlugs(a, b));
  const sharedIds = new Set(channels.filter((channel) => shared.has(channel.slug)).map((channel) => channel.id));
  const load = async (side: CompareSide) => (await loadAirings(toAiringFilter(sideFilter(side), { season }), channels)).filter((airing) => !sharedIds.has(airing.channelId));
  const [airingsA, airingsB] = await Promise.all([load(a), load(b)]);
  const result = regionalDelay(airingsA, airingsB);
  // The titles furthest apart in each direction, for the reader to check.
  const ranked = [...result.compared].sort((x, y) => Math.abs(y.delayMinutes) - Math.abs(x.delayMinutes)).slice(0, 8);
  const titles = ranked.length ? await db().title.findMany({ where: { id: { in: ranked.map((r) => r.titleId) } }, select: { id: true, slug: true, name: true } }) : [];
  const byId = new Map(titles.map((title) => [title.id, title]));
  return {
    overlap: overlapOf(result),
    buckets: result.buckets,
    sharedChannels: [...shared],
    examples: ranked.flatMap((row) => {
      const title = byId.get(row.titleId);
      return title ? [{ slug: title.slug, name: title.name, delayMinutes: row.delayMinutes, episodes: row.episodes }] : [];
    })
  };
}
