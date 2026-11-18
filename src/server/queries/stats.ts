import { channelsInRegion, type RegionKey } from "@/domain/coverage";
import { computeTitlePositions } from "@/domain/slots";
import { seasonInstantRange, seasonOrdinal, type Season } from "@/domain/season";
import { channelBreakdown, concurrencyProfile, regionalDelay, seasonTrend, weekdayHourMatrix, type CountUnit, type StatAiring } from "@/domain/stats";
import { dbDateToIsoDate } from "@/domain/time";
import type { RerunMode } from "@/lib/search-params";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { airingWhere, getTrackedChannels, type ChannelInfo } from "./common";

async function loadAirings(filter: { season?: Season | null; region: RegionKey | null; rerun: RerunMode }, channels: ChannelInfo[]): Promise<StatAiring[]> {
  const rows = await db().broadcast.findMany({
    where: airingWhere({ season: filter.season, region: filter.region, rerun: filter.rerun, allKinds: false }, channels),
    select: { titleId: true, channelId: true, animeDate: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, startAt: true, episodeNumber: true }
  });
  return rows.map((row) => ({ ...row, animeDate: dbDateToIsoDate(row.animeDate) }));
}

export interface StatsQuery {
  season: Season;
  region: RegionKey;
  unit: CountUnit;
  rerun: RerunMode;
}

export async function getSeasonStats(query: StatsQuery) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const airings = await loadAirings({ season: query.season, region: query.region, rerun: query.rerun }, channels);
  const heatmap = weekdayHourMatrix(airings, query.unit);
  const byChannel = channelBreakdown(airings).map((row) => ({ ...row, channel: channels.find((c) => c.id === row.channelId)! }));
  const positions = computeTitlePositions(airings.map((a) => ({ ...a, isRerun: false, deleted: false }))).filter((p) => p.seasonOrdinal === seasonOrdinal(query.season));
  const concurrency = concurrencyProfile(
    positions.map((p) => ({ titleId: p.titleId, channelId: p.channelId, weekday: p.weekday, startMinute: p.startMinute, durationMinutes: p.durationMinutes })),
    { bucketMinutes: 15, fromMinute: 18 * 60, toMinute: 29 * 60 }
  );
  return {
    heatmap,
    byChannel,
    concurrency,
    positionCount: positions.length,
    titleCount: new Set(airings.map((a) => a.titleId)).size,
    airingCount: airings.length
  };
}

export async function getRegionalDelay(season: Season) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const [kanto, kansai] = await Promise.all([
    loadAirings({ season, region: "kanto", rerun: "exclude" }, channels),
    loadAirings({ season, region: "kansai", rerun: "exclude" }, channels)
  ]);
  // NHK is receivable in both regions; comparing it with itself would only add zero-delay noise.
  const nhk = new Set(channels.filter((c) => c.slug.startsWith("nhk-")).map((c) => c.id));
  const result = regionalDelay(
    kanto.filter((a) => !nhk.has(a.channelId)),
    kansai.filter((a) => !nhk.has(a.channelId))
  );
  const titleIds = result.compared.map((c) => c.titleId);
  const titles = titleIds.length ? await db().title.findMany({ where: { id: { in: titleIds } }, select: { id: true, slug: true, name: true } }) : [];
  const byId = new Map(titles.map((t) => [t.id, t]));
  return {
    ...result,
    examples: [...result.compared]
      .sort((a, b) => b.delayMinutes - a.delayMinutes)
      .slice(0, 8)
      .map((c) => ({ ...c, slug: byId.get(c.titleId)?.slug ?? "", name: byId.get(c.titleId)?.name ?? "" }))
  };
}

export async function getSeasonTrend(region: RegionKey, rerun: RerunMode, from: Season, to: Season) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const range = { start: seasonInstantRange(from).start, end: seasonInstantRange(to).end };
  const rows = await db().broadcast.findMany({
    where: airingWhere({ range, region, rerun, allKinds: false }, channels),
    select: { titleId: true, channelId: true, animeDate: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, startAt: true, episodeNumber: true }
  });
  return seasonTrend(rows.map((row) => ({ ...row, animeDate: dbDateToIsoDate(row.animeDate) })));
}

export function regionChannelNames(region: RegionKey): string {
  return channelsInRegion(region)
    .map((c) => c.shortName)
    .join("・");
}
