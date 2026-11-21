import type { RegionKey } from "@/domain/coverage";
import type { Season } from "@/domain/season";
import { dbDateToIsoDate, type IsoDate } from "@/domain/time";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { airingSqlWhere, getTrackedChannels, type ChannelInfo } from "./common";

export interface Premiere {
  titleId: number;
  slug: string;
  name: string;
  /** The earliest first-episode airing in scope. */
  channelSlug: string;
  channelShortName: string;
  startAt: Date;
  animeDate: IsoDate;
  animeWeekday: number;
  animeStartMinute: number;
  /** Other channels in scope that aired the first episode. */
  otherChannels: number;
}

/**
 * New series of a season: titles whose first episode (the source's 新 flag) aired in the season on the channels in
 * scope, reruns excluded, placed at their earliest first-episode airing.
 */
export async function getSeasonPremieres(season: Season, region: RegionKey | null): Promise<Premiere[]> {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const where = airingSqlWhere({ season, region, rerun: "exclude", allKinds: false }, channels);
  const rows = await db().$queryRaw<PremiereRow[]>`
    SELECT b."titleId", t.slug, t.name, b."channelId", b."startAt", b."animeDate", b."animeWeekday", b."animeStartMinute"
    FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId"
    WHERE ${where} AND b."flagNew" = true
    ORDER BY b."startAt", b."channelId"
  `;
  return groupPremieres(rows, channels);
}

export interface PremiereRow {
  titleId: number;
  slug: string;
  name: string;
  channelId: number;
  startAt: Date;
  animeDate: Date;
  animeWeekday: number;
  animeStartMinute: number;
}

/** One entry per title at its earliest first-episode airing (rows must be ordered by startAt), counting other channels. */
export function groupPremieres(rows: PremiereRow[], channels: Pick<ChannelInfo, "id" | "slug" | "shortName">[]): Premiere[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const premieres = new Map<number, Premiere & { channelIds: Set<number> }>();
  for (const row of rows) {
    const existing = premieres.get(row.titleId);
    if (existing) {
      existing.channelIds.add(row.channelId);
      continue;
    }
    const channel = byId.get(row.channelId);
    if (!channel) continue;
    premieres.set(row.titleId, {
      titleId: row.titleId,
      slug: row.slug,
      name: row.name,
      channelSlug: channel.slug,
      channelShortName: channel.shortName,
      startAt: row.startAt,
      animeDate: dbDateToIsoDate(row.animeDate),
      animeWeekday: row.animeWeekday,
      animeStartMinute: row.animeStartMinute,
      otherChannels: 0,
      channelIds: new Set([row.channelId])
    });
  }
  return [...premieres.values()].map(({ channelIds, ...premiere }) => ({ ...premiere, otherChannels: channelIds.size - 1 }));
}

/** Number of new series per covered season (all tracked channels), for the season index. */
export async function getPremiereCounts(): Promise<Map<number, number>> {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const where = airingSqlWhere({ rerun: "exclude", allKinds: false }, channels);
  const rows = await db().$queryRaw<{ ordinal: number; titles: number }[]>`
    SELECT (EXTRACT(YEAR FROM b."animeDate")::int * 10 + ((EXTRACT(MONTH FROM b."animeDate")::int - 1) / 3 + 1)) AS ordinal,
           COUNT(DISTINCT b."titleId")::int AS titles
    FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId"
    WHERE ${where} AND b."flagNew" = true
    GROUP BY 1 ORDER BY 1
  `;
  return new Map(rows.map((row) => [Number(row.ordinal), row.titles]));
}

export interface WindowAiring {
  id: number;
  titleSlug: string;
  titleName: string;
  channelShortName: string;
  channelOrder: number;
  startAt: string;
  endAt: string;
  isRerun: boolean;
}

/**
 * Anime airings from two hours before the anime day until its end, for the now-airing banner. The client decides
 * what is on air from its own clock, so this can stay cached for the dataset's lifetime.
 */
export async function getAiringWindow(startIso: string, endIso: string): Promise<WindowAiring[]> {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const where = airingSqlWhere({ rerun: "include", allKinds: false }, channels);
  const rows = await db().$queryRaw<{ id: number; slug: string; name: string; channelId: number; startAt: Date; endAt: Date; isRerun: boolean }[]>`
    SELECT b.id, t.slug, t.name, b."channelId", b."startAt", b."endAt", b."isRerun"
    FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId"
    WHERE ${where} AND b."endAt" > ${new Date(startIso)} AND b."startAt" < ${new Date(endIso)}
    ORDER BY b."startAt"
  `;
  const byId = new Map(channels.map((c) => [c.id, c]));
  return rows.map((row) => ({
    id: row.id,
    titleSlug: row.slug,
    titleName: row.name,
    channelShortName: byId.get(row.channelId)?.shortName ?? "",
    channelOrder: byId.get(row.channelId)?.sortOrder ?? 0,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    isRerun: row.isRerun
  }));
}

