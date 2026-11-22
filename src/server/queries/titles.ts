import { Prisma } from "@/generated/prisma/client";
import { SYOBOI_CATEGORY_LABELS } from "@/domain/coverage";
import { seasonOfInstant, type Season } from "@/domain/season";
import { dbDateToIsoDate, type IsoDate } from "@/domain/time";
import { likePattern } from "@/lib/search-params";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { airingSqlWhere, getTrackedChannels, syoboiTitleUrl, type AiringFilter } from "./common";

export interface TitleBroadcastRow {
  id: number;
  startAt: Date;
  endAt: Date;
  animeDate: IsoDate;
  animeWeekday: number;
  animeStartMinute: number;
  durationMinutes: number;
  episodeNumber: number | null;
  episodeLabel: string | null;
  subtitle: string | null;
  comment: string | null;
  flagNew: boolean;
  flagFinal: boolean;
  flagNote: boolean;
  flagRerun: boolean;
  isRerun: boolean;
  rerunBasis: string;
  deleted: boolean;
  missing: boolean;
  revisionCount: number;
}

export interface TitleChannelGroup {
  channel: { slug: string; name: string; shortName: string; medium: string | null; area: string | null; sortOrder: number };
  broadcasts: TitleBroadcastRow[];
  firstStartAt: Date | null;
  regular: { weekday: number; minute: number; count: number } | null;
  firstRunCount: number;
}

export interface TitleDetail {
  id: number;
  slug: string;
  name: string;
  shortName: string | null;
  yomi: string | null;
  nameEn: string | null;
  categoryLabel: string | null;
  sourceCategory: number | null;
  firstYear: number | null;
  firstMonth: number | null;
  firstEndYear: number | null;
  firstEndMonth: number | null;
  firstChannelText: string | null;
  officialUrl: string | null;
  sourceUrl: string;
  sourceUpdatedAt: Date | null;
  detailsFetchedAt: Date | null;
  lastSeenAt: Date | null;
  groups: TitleChannelGroup[];
  slots: { slug: string; name: string; kind: string; method: string; confidence: string; evidence: string | null; channelShortName: string | null }[];
  related: { slug: string; name: string; firstYear: number | null; firstMonth: number | null }[];
  seasons: Season[];
}

export async function getTitleDetail(slug: string): Promise<TitleDetail | null> {
  "use cache";
  datasetCacheProfile();
  const title = await db().title.findUnique({
    where: { slug },
    include: {
      broadcasts: {
        orderBy: { startAt: "asc" },
        include: { channel: true, _count: { select: { revisions: true } } }
      },
      memberships: { include: { slot: true, channel: true } },
      subtitles: { select: { episodeNumber: true, subtitle: true } }
    }
  });
  if (!title) return null;
  // The source fills an airing's own subtitle mostly for specials; regular episodes take the title's list.
  const listed = new Map(title.subtitles.map((s) => [s.episodeNumber, s.subtitle]));

  const groupsBySlug = new Map<string, TitleChannelGroup>();
  for (const b of title.broadcasts) {
    const key = b.channel.slug;
    const group =
      groupsBySlug.get(key) ??
      ({
        channel: { slug: b.channel.slug, name: b.channel.name, shortName: b.channel.shortName ?? b.channel.name, medium: b.channel.medium, area: b.channel.area, sortOrder: b.channel.sortOrder },
        broadcasts: [],
        firstStartAt: null,
        regular: null,
        firstRunCount: 0
      } satisfies TitleChannelGroup);
    group.broadcasts.push({
      id: b.id,
      startAt: b.startAt,
      endAt: b.endAt,
      animeDate: dbDateToIsoDate(b.animeDate),
      animeWeekday: b.animeWeekday,
      animeStartMinute: b.animeStartMinute,
      durationMinutes: b.durationMinutes,
      episodeNumber: b.episodeNumber,
      episodeLabel: b.episodeLabel,
      subtitle: b.subtitle ?? (b.episodeNumber === null ? null : (listed.get(b.episodeNumber) ?? null)),
      comment: b.comment,
      flagNew: b.flagNew,
      flagFinal: b.flagFinal,
      flagNote: b.flagNote,
      flagRerun: b.flagRerun,
      isRerun: b.isRerun,
      rerunBasis: b.rerunBasis,
      deleted: b.deleted,
      missing: b.missingSince !== null,
      // The CREATED revision is not a change.
      revisionCount: Math.max(0, b._count.revisions - 1)
    });
    groupsBySlug.set(key, group);
  }
  for (const group of groupsBySlug.values()) {
    const live = group.broadcasts.filter((b) => !b.deleted && !b.missing);
    const firstRun = live.filter((b) => !b.isRerun);
    group.firstRunCount = firstRun.length;
    group.firstStartAt = live[0]?.startAt ?? null;
    const counts = new Map<string, number>();
    for (const b of firstRun.length > 0 ? firstRun : live) {
      const k = `${b.animeWeekday}|${b.animeStartMinute}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) {
      const [weekday, minute] = best[0].split("|").map(Number) as [number, number];
      group.regular = { weekday, minute, count: best[1] };
    }
  }
  const groups = [...groupsBySlug.values()].sort(
    (a, b) => (a.firstStartAt?.getTime() ?? Infinity) - (b.firstStartAt?.getTime() ?? Infinity) || a.channel.sortOrder - b.channel.sortOrder
  );

  const related = title.seriesKey
    ? await db().title.findMany({
        where: { seriesKey: title.seriesKey, id: { not: title.id } },
        orderBy: [{ firstYear: "asc" }, { firstMonth: "asc" }, { id: "asc" }],
        select: { slug: true, name: true, firstYear: true, firstMonth: true },
        take: 30
      })
    : [];

  const seasonKeys = new Map<string, Season>();
  for (const b of title.broadcasts) {
    if (b.deleted || b.isRerun) continue;
    const season = seasonOfInstant(b.startAt);
    seasonKeys.set(`${season.year}-${season.quarter}`, season);
  }

  return {
    id: title.id,
    slug: title.slug,
    name: title.name,
    shortName: title.shortName,
    yomi: title.yomi,
    nameEn: title.nameEn,
    sourceCategory: title.sourceCategory,
    categoryLabel: title.sourceCategory === null ? null : (SYOBOI_CATEGORY_LABELS[title.sourceCategory] ?? `カテゴリ ${title.sourceCategory}`),
    firstYear: title.firstYear,
    firstMonth: title.firstMonth,
    firstEndYear: title.firstEndYear,
    firstEndMonth: title.firstEndMonth,
    firstChannelText: title.firstChannelText,
    officialUrl: title.officialUrl,
    sourceUrl: syoboiTitleUrl(title.externalId),
    sourceUpdatedAt: title.sourceUpdatedAt,
    detailsFetchedAt: title.detailsFetchedAt,
    lastSeenAt: title.broadcasts.reduce<Date | null>((latest, b) => (!latest || b.lastSeenAt > latest ? b.lastSeenAt : latest), null),
    groups,
    slots: title.memberships
      .map((m) => ({
        slug: m.slot.slug,
        name: m.slot.name,
        kind: m.slot.kind,
        method: m.method,
        confidence: m.confidence,
        evidence: m.evidence,
        channelShortName: m.channel?.shortName ?? null
      }))
      .sort((a, b) => (a.kind === "INFERRED" ? 1 : 0) - (b.kind === "INFERRED" ? 1 : 0) || a.name.localeCompare(b.name, "ja")),
    related,
    seasons: [...seasonKeys.values()].sort((a, b) => a.year * 10 + a.quarter - (b.year * 10 + b.quarter))
  };
}

export type TitleSort = "position" | "first" | "name" | "airings";

export interface TitleSearchRow {
  id: number;
  slug: string;
  name: string;
  firstAt: Date;
  lastAt: Date;
  airings: number;
  channelIds: number[];
  modalChannelId: number;
  modalWeekday: number;
  modalMinute: number;
  hasNew: boolean;
}

export interface TitleSearchResult {
  rows: TitleSearchRow[];
  total: number;
}

const TITLE_SORTS: Record<TitleSort, Prisma.Sql> = {
  position: Prisma.sql`modal_position ASC, t.name ASC`,
  first: Prisma.sql`first_at DESC, t.name ASC`,
  name: Prisma.sql`COALESCE(t.yomi, t.name) ASC, t.id ASC`,
  airings: Prisma.sql`airings DESC, t.name ASC`
};

export async function searchTitles(filter: AiringFilter, query: string, sort: TitleSort, page: number, pageSize: number): Promise<TitleSearchResult> {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const where = airingSqlWhere(filter, channels);
  const textFilter = query
    ? Prisma.sql`AND (t.name ILIKE ${likePattern(query)} OR t."shortName" ILIKE ${likePattern(query)} OR t.yomi ILIKE ${likePattern(query)} OR t."nameEn" ILIKE ${likePattern(query)})`
    : Prisma.empty;
  const rows = await db().$queryRaw<
    (Omit<TitleSearchRow, "modalWeekday" | "modalMinute"> & { modal_position: number; total: number; first_at: Date; last_at: Date; channel_ids: number[]; modal_channel_id: number; has_new: boolean })[]
  >`
    SELECT t.id, t.slug, t.name,
           MIN(b."startAt") AS first_at, MAX(b."startAt") AS last_at,
           COUNT(*)::int AS airings,
           ARRAY_AGG(DISTINCT b."channelId") AS channel_ids,
           MODE() WITHIN GROUP (ORDER BY b."channelId") AS modal_channel_id,
           MODE() WITHIN GROUP (ORDER BY b."animeWeekday" * 10000 + b."animeStartMinute") AS modal_position,
           BOOL_OR(b."flagNew") AS has_new,
           COUNT(*) OVER()::int AS total
    FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId"
    WHERE ${where} ${textFilter}
    GROUP BY t.id
    ORDER BY ${TITLE_SORTS[sort]}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  if (rows.length === 0 && page > 1) {
    // Past the last page the windowed total is unavailable; count separately so the page can say where results are.
    const [count] = await db().$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT t.id)::int AS total FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId" WHERE ${where} ${textFilter}
    `;
    return { total: count?.total ?? 0, rows: [] };
  }
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      firstAt: row.first_at,
      lastAt: row.last_at,
      airings: row.airings,
      channelIds: row.channel_ids,
      modalChannelId: row.modal_channel_id,
      modalWeekday: Math.floor(row.modal_position / 10000),
      modalMinute: row.modal_position % 10000,
      hasNew: row.has_new
    }))
  };
}

export interface BroadcastSearchRow {
  id: number;
  startAt: Date;
  animeDate: IsoDate;
  animeWeekday: number;
  animeStartMinute: number;
  durationMinutes: number;
  episodeNumber: number | null;
  episodeLabel: string | null;
  subtitle: string | null;
  flagNew: boolean;
  flagFinal: boolean;
  isRerun: boolean;
  titleSlug: string;
  titleName: string;
  channelId: number;
}

export async function searchBroadcasts(filter: AiringFilter, query: string, order: "asc" | "desc", page: number, pageSize: number) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const where = airingSqlWhere(filter, channels);
  const textFilter = query ? Prisma.sql`AND (t.name ILIKE ${likePattern(query)} OR t.yomi ILIKE ${likePattern(query)} OR t."shortName" ILIKE ${likePattern(query)})` : Prisma.empty;
  const direction = order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const rows = await db().$queryRaw<
    { id: number; startAt: Date; animeDate: Date; animeWeekday: number; animeStartMinute: number; durationMinutes: number; episodeNumber: number | null; episodeLabel: string | null; subtitle: string | null; flagNew: boolean; flagFinal: boolean; isRerun: boolean; slug: string; name: string; channelId: number; total: number }[]
  >`
    SELECT b.id, b."startAt", b."animeDate", b."animeWeekday", b."animeStartMinute", b."durationMinutes", b."episodeNumber", b."episodeLabel",
           COALESCE(b.subtitle, s.subtitle) AS subtitle, b."flagNew", b."flagFinal", b."isRerun", t.slug, t.name, b."channelId", COUNT(*) OVER()::int AS total
    FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId"
    LEFT JOIN "TitleSubtitle" s ON s."titleId" = b."titleId" AND s."episodeNumber" = b."episodeNumber"
    WHERE ${where} ${textFilter}
    ORDER BY b."startAt" ${direction}, b.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  if (rows.length === 0 && page > 1) {
    const [count] = await db().$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM "Broadcast" b JOIN "Title" t ON t.id = b."titleId" WHERE ${where} ${textFilter}
    `;
    return { total: count?.total ?? 0, rows: [] };
  }
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map(
      (row): BroadcastSearchRow => ({
        id: row.id,
        startAt: row.startAt,
        animeDate: dbDateToIsoDate(row.animeDate),
        animeWeekday: row.animeWeekday,
        animeStartMinute: row.animeStartMinute,
        durationMinutes: row.durationMinutes,
        episodeNumber: row.episodeNumber,
        episodeLabel: row.episodeLabel,
        subtitle: row.subtitle,
        flagNew: row.flagNew,
        flagFinal: row.flagFinal,
        isRerun: row.isRerun,
        titleSlug: row.slug,
        titleName: row.name,
        channelId: row.channelId
      })
    )
  };
}
