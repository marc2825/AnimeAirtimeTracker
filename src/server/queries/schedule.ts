import { addDays, animeDayRange, dbDateToIsoDate, type IsoDate } from "@/domain/time";
import type { NetworkKey, RegionKey } from "@/domain/coverage";
import type { RerunMode } from "@/lib/search-params";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { airingWhere, getTrackedChannels, type ChannelInfo } from "./common";

export interface ScheduleItem {
  id: number;
  titleSlug: string;
  titleName: string;
  titleKnown: boolean;
  channelSlug: string;
  channelShortName: string;
  startAt: Date;
  endAt: Date;
  animeDate: IsoDate;
  animeWeekday: number;
  animeStartMinute: number;
  durationMinutes: number;
  episodeNumber: number | null;
  episodeLabel: string | null;
  subtitle: string | null;
  flagNew: boolean;
  flagFinal: boolean;
  flagNote: boolean;
  isRerun: boolean;
  rerunBasis: string;
  comment: string | null;
}

export interface ScheduleQuery {
  from: IsoDate;
  days: number;
  region: RegionKey | null;
  network?: NetworkKey | null;
  channelSlug: string | null;
  rerun: RerunMode;
  allKinds: boolean;
}

export async function getSchedule(query: ScheduleQuery): Promise<{ items: ScheduleItem[]; channels: ChannelInfo[] }> {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const range = { start: animeDayRange(query.from).start, end: animeDayRange(addDays(query.from, query.days - 1)).end };
  const rows = await db().broadcast.findMany({
    where: airingWhere({ range, region: query.region, network: query.network, channelSlug: query.channelSlug, rerun: query.rerun, allKinds: query.allKinds }, channels),
    orderBy: [{ startAt: "asc" }, { channelId: "asc" }],
    select: {
      id: true,
      startAt: true,
      endAt: true,
      animeDate: true,
      animeWeekday: true,
      animeStartMinute: true,
      durationMinutes: true,
      episodeNumber: true,
      episodeLabel: true,
      subtitle: true,
      flagNew: true,
      flagFinal: true,
      flagNote: true,
      isRerun: true,
      rerunBasis: true,
      comment: true,
      channelId: true,
      title: { select: { slug: true, name: true, detailsFetchedAt: true } }
    }
  });
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const items = rows.map((row) => {
    const channel = channelById.get(row.channelId)!;
    return {
      id: row.id,
      titleSlug: row.title.slug,
      titleName: row.title.name,
      titleKnown: row.title.detailsFetchedAt !== null,
      channelSlug: channel.slug,
      channelShortName: channel.shortName,
      startAt: row.startAt,
      endAt: row.endAt,
      animeDate: dbDateToIsoDate(row.animeDate),
      animeWeekday: row.animeWeekday,
      animeStartMinute: row.animeStartMinute,
      durationMinutes: row.durationMinutes,
      episodeNumber: row.episodeNumber,
      episodeLabel: row.episodeLabel,
      subtitle: row.subtitle,
      flagNew: row.flagNew,
      flagFinal: row.flagFinal,
      flagNote: row.flagNote,
      isRerun: row.isRerun,
      rerunBasis: row.rerunBasis,
      comment: row.comment
    };
  });
  return { items, channels };
}
