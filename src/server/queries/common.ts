import { Prisma } from "@/generated/prisma/client";
import { ANIME_CATEGORIES, channelsInRegion, type RegionKey } from "@/domain/coverage";
import { seasonInstantRange, type Season } from "@/domain/season";
import type { Weekday } from "@/domain/time";
import { TIME_BANDS, type RerunMode, type TimeBand } from "@/lib/search-params";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";

export interface ChannelInfo {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  medium: string | null;
  area: string | null;
  sortOrder: number;
  externalId: string;
}

export async function getTrackedChannels(): Promise<ChannelInfo[]> {
  "use cache";
  datasetCacheProfile();
  const rows = await db().channel.findMany({ where: { isTracked: true }, orderBy: { sortOrder: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName ?? row.name,
    medium: row.medium,
    area: row.area,
    sortOrder: row.sortOrder,
    externalId: row.externalId
  }));
}

export interface AiringFilter {
  season?: Season | null;
  range?: { start: Date; end: Date };
  region?: RegionKey | null;
  channelSlug?: string | null;
  weekday?: Weekday | null;
  band?: TimeBand | null;
  rerun: RerunMode;
  allKinds: boolean;
  titleIds?: number[];
}

/** Resolve region/channel filters to channel ids (null = all tracked channels). */
export function resolveChannelIds(channels: ChannelInfo[], filter: Pick<AiringFilter, "region" | "channelSlug">): number[] | null {
  if (filter.channelSlug) {
    const channel = channels.find((c) => c.slug === filter.channelSlug);
    return channel ? [channel.id] : [];
  }
  if (filter.region) {
    const slugs = new Set(channelsInRegion(filter.region).map((c) => c.slug));
    return channels.filter((c) => slugs.has(c.slug)).map((c) => c.id);
  }
  return null;
}

/** Prisma where-clause for public airing queries. Deleted and vanished airings are always excluded. */
export function airingWhere(filter: AiringFilter, channels: ChannelInfo[]): Prisma.BroadcastWhereInput {
  const range = filter.range ?? (filter.season ? seasonInstantRange(filter.season) : undefined);
  const channelIds = resolveChannelIds(channels, filter);
  const where: Prisma.BroadcastWhereInput = { deleted: false, missingSince: null };
  if (range) where.startAt = { gte: range.start, lt: range.end };
  if (channelIds) where.channelId = { in: channelIds };
  if (filter.weekday !== null && filter.weekday !== undefined) where.animeWeekday = filter.weekday;
  if (filter.band) where.animeStartMinute = { gte: TIME_BANDS[filter.band].from, lt: TIME_BANDS[filter.band].to };
  if (filter.rerun === "exclude") where.isRerun = false;
  if (filter.rerun === "only") where.isRerun = true;
  if (!filter.allKinds) where.title = { OR: [{ sourceCategory: null }, { sourceCategory: { in: [...ANIME_CATEGORIES] } }] };
  if (filter.titleIds) where.titleId = { in: filter.titleIds };
  return where;
}

/** Same filter as raw SQL (alias b = Broadcast, t = Title) for aggregate queries. */
export function airingSqlWhere(filter: AiringFilter, channels: ChannelInfo[]): Prisma.Sql {
  const range = filter.range ?? (filter.season ? seasonInstantRange(filter.season) : undefined);
  const channelIds = resolveChannelIds(channels, filter);
  const parts: Prisma.Sql[] = [Prisma.sql`b."deleted" = false`, Prisma.sql`b."missingSince" IS NULL`];
  if (range) parts.push(Prisma.sql`b."startAt" >= ${range.start} AND b."startAt" < ${range.end}`);
  if (channelIds) parts.push(channelIds.length > 0 ? Prisma.sql`b."channelId" IN (${Prisma.join(channelIds)})` : Prisma.sql`false`);
  if (filter.weekday !== null && filter.weekday !== undefined) parts.push(Prisma.sql`b."animeWeekday" = ${filter.weekday}`);
  if (filter.band) parts.push(Prisma.sql`b."animeStartMinute" >= ${TIME_BANDS[filter.band].from} AND b."animeStartMinute" < ${TIME_BANDS[filter.band].to}`);
  if (filter.rerun === "exclude") parts.push(Prisma.sql`b."isRerun" = false`);
  if (filter.rerun === "only") parts.push(Prisma.sql`b."isRerun" = true`);
  if (!filter.allKinds) parts.push(Prisma.sql`(t."sourceCategory" IS NULL OR t."sourceCategory" IN (${Prisma.join([...ANIME_CATEGORIES])}))`);
  return Prisma.join(parts, " AND ");
}

export function syoboiTitleUrl(tid: string): string {
  return `https://cal.syoboi.jp/tid/${encodeURIComponent(tid)}`;
}
