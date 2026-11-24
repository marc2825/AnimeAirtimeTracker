import type { PrismaClient } from "@/generated/prisma/client";
import { computeTitlePositions } from "@/domain/slots";
import { seasonFromOrdinal, seasonsBetween, seasonOrdinal, type Season } from "@/domain/season";
import { dbDateToIsoDate, type IsoDate } from "@/domain/time";
import type { SlotPosition } from "@/lib/slot-search";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";

export type SlotKind = "OFFICIAL" | "SOURCE_LABEL" | "INFERRED";

const SEASON_POSITION = { seasonOrdinal: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true } as const;

export interface SlotSummary {
  slug: string;
  name: string;
  kind: SlotKind;
  titleCount: number;
  seasonCount: number;
  firstAnimeDate: IsoDate | null;
  lastAnimeDate: IsoDate | null;
  channel: { slug: string; shortName: string; name: string } | null;
  latest: { seasonOrdinal: number; weekday: number; minute: number; durationMinutes: number } | null;
  /** Season ordinals with a derived position (for the mini strip). */
  seasonOrdinals: number[];
}

export interface SlotListItem extends SlotSummary {
  /** Position per season, newest first (search filters match against these). */
  positions: SlotPosition[];
}

export async function listSlots(): Promise<SlotListItem[]> {
  "use cache";
  datasetCacheProfile();
  return loadSlotList(db());
}

interface SlotListRow {
  slug: string;
  name: string;
  kind: SlotKind;
  titleCount: number;
  seasonCount: number;
  firstAnimeDate: Date | null;
  lastAnimeDate: Date | null;
  homeSlug: string | null;
  homeShortName: string | null;
  homeName: string | null;
  ordinals: number[];
  weekdays: number[];
  minutes: number[];
  durations: number[];
  channelSlugs: string[];
}

/**
 * Every slot with its per-season positions, newest season first. Almost every page reads this list, so the
 * database sends one row per slot with the seasons as arrays (≈ 1/3 of the bytes of one row per season).
 */
export async function loadSlotList(client: PrismaClient): Promise<SlotListItem[]> {
  const rows = await client.$queryRaw<SlotListRow[]>`
    SELECT s.slug, s.name, s.kind::text AS kind, s."titleCount" AS "titleCount", s."seasonCount" AS "seasonCount",
      s."firstAnimeDate" AS "firstAnimeDate", s."lastAnimeDate" AS "lastAnimeDate",
      hc.slug AS "homeSlug", hc."shortName" AS "homeShortName", hc.name AS "homeName",
      coalesce(array_agg(ss."seasonOrdinal" ORDER BY ss."seasonOrdinal" DESC) FILTER (WHERE ss.id IS NOT NULL), '{}') AS ordinals,
      coalesce(array_agg(ss."animeWeekday" ORDER BY ss."seasonOrdinal" DESC) FILTER (WHERE ss.id IS NOT NULL), '{}') AS weekdays,
      coalesce(array_agg(ss."animeStartMinute" ORDER BY ss."seasonOrdinal" DESC) FILTER (WHERE ss.id IS NOT NULL), '{}') AS minutes,
      coalesce(array_agg(ss."durationMinutes" ORDER BY ss."seasonOrdinal" DESC) FILTER (WHERE ss.id IS NOT NULL), '{}') AS durations,
      coalesce(array_agg(c.slug ORDER BY ss."seasonOrdinal" DESC) FILTER (WHERE ss.id IS NOT NULL), '{}') AS "channelSlugs"
    FROM "Slot" AS s
    LEFT JOIN "Channel" AS hc ON hc.id = s."homeChannelId"
    LEFT JOIN "SlotSeason" AS ss ON ss."slotId" = s.id
    LEFT JOIN "Channel" AS c ON c.id = ss."channelId"
    GROUP BY s.id, hc.id
    ORDER BY s."seasonCount" DESC, s."titleCount" DESC, s.slug ASC`;
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    titleCount: row.titleCount,
    seasonCount: row.seasonCount,
    firstAnimeDate: row.firstAnimeDate ? dbDateToIsoDate(row.firstAnimeDate) : null,
    lastAnimeDate: row.lastAnimeDate ? dbDateToIsoDate(row.lastAnimeDate) : null,
    channel: row.homeSlug ? { slug: row.homeSlug, shortName: row.homeShortName ?? row.homeName!, name: row.homeName! } : null,
    latest:
      row.ordinals.length > 0
        ? { seasonOrdinal: row.ordinals[0]!, weekday: row.weekdays[0]!, minute: row.minutes[0]!, durationMinutes: row.durations[0]! }
        : null,
    seasonOrdinals: [...row.ordinals].reverse(),
    positions: row.ordinals.map((ordinal, i) => ({ seasonOrdinal: ordinal, weekday: row.weekdays[i]!, minute: row.minutes[i]!, channelSlug: row.channelSlugs[i]! }))
  }));
}

/** Titles per slot and season ordinal, in airing order, for the season strips ({ [slotSlug]: { [ordinal]: titles } }). */
export type StripTitles = Record<string, Record<number, { name: string; slug: string }[]>>;

/**
 * Names of the titles behind each strip tick, from `fromOrdinal` on. Reads the per-season title ids stored
 * by derive; seasons derived before that column existed have none, and the strip then shows no names.
 */
export async function getSlotStripTitles(fromOrdinal: number, slugs?: string[]): Promise<StripTitles> {
  "use cache";
  datasetCacheProfile();
  const seasons = await db().slotSeason.findMany({
    where: { seasonOrdinal: { gte: fromOrdinal }, ...(slugs ? { slot: { slug: { in: slugs } } } : {}) },
    select: { seasonOrdinal: true, titleIds: true, slot: { select: { slug: true } } }
  });
  const ids = [...new Set(seasons.flatMap((season) => season.titleIds))];
  const titles = new Map(
    ids.length === 0
      ? []
      : (await db().title.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })).map((title) => [title.id, { name: title.name, slug: title.slug }])
  );
  const result: StripTitles = {};
  for (const season of seasons) {
    const list = season.titleIds.map((id) => titles.get(id)).filter((title) => title !== undefined);
    if (list.length > 0) (result[season.slot.slug] ??= {})[season.seasonOrdinal] = list;
  }
  return result;
}

export interface TimelineTitle {
  slug: string;
  name: string;
  weekday: number;
  minute: number;
  durationMinutes: number;
  airings: number;
  firstStartAt: Date;
  lastStartAt: Date;
  continuesFromPrevious: boolean;
}

export interface TimelineSeason {
  season: Season;
  ordinal: number;
  position: { weekday: number; minute: number; durationMinutes: number } | null;
  /** Position differs from the previous season with data. */
  moved: boolean;
  titles: TimelineTitle[];
}

export interface SlotDetail extends SlotSummary {
  description: string | null;
  evidenceUrl: string | null;
  ruleVersion: string;
  computedAt: Date;
  timeline: TimelineSeason[];
  members: {
    slug: string;
    name: string;
    method: string;
    confidence: string;
    evidence: string | null;
    firstStartAt: Date | null;
    seasonOrdinal: number | null;
    channelShortName: string | null;
  }[];
  byYear: { year: number; titles: number }[];
  related: { slug: string; name: string; kind: SlotKind; shared: number }[];
}

export async function getSlotDetail(slug: string): Promise<SlotDetail | null> {
  "use cache";
  datasetCacheProfile();
  const slot = await db().slot.findUnique({
    where: { slug },
    include: {
      homeChannel: true,
      seasons: { orderBy: { seasonOrdinal: "asc" }, select: SEASON_POSITION },
      memberships: { include: { title: true, channel: true } }
    }
  });
  if (!slot) return null;

  const memberIds = slot.memberships.map((m) => m.titleId);
  const broadcasts =
    slot.homeChannelId === null || memberIds.length === 0
      ? []
      : await db().broadcast.findMany({
          where: { titleId: { in: memberIds }, channelId: slot.homeChannelId, deleted: false, missingSince: null, isRerun: false },
          select: { titleId: true, channelId: true, animeDate: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, startAt: true, isRerun: true, deleted: true }
        });
  let positions = computeTitlePositions(broadcasts.map((b) => ({ ...b, animeDate: dbDateToIsoDate(b.animeDate) })));
  const anchor = slot.seasons.at(-1);
  if (slot.kind === "INFERRED" && anchor) {
    positions = positions.filter((p) => p.weekday === anchor.animeWeekday && p.startMinute === anchor.animeStartMinute);
  }
  const titleById = new Map(slot.memberships.map((m) => [m.titleId, m.title]));
  const seasonRows = new Map(slot.seasons.map((s) => [s.seasonOrdinal, s]));
  const ordinals = [...new Set([...positions.map((p) => p.seasonOrdinal), ...slot.seasons.map((s) => s.seasonOrdinal)])].sort((a, b) => a - b);

  const timeline: TimelineSeason[] = [];
  if (ordinals.length > 0) {
    let previous: TimelineSeason["position"] = null;
    let previousTitles = new Set<number>();
    for (const season of seasonsBetween(seasonFromOrdinal(ordinals[0]!), seasonFromOrdinal(ordinals.at(-1)!))) {
      const ordinal = seasonOrdinal(season);
      const row = seasonRows.get(ordinal);
      const inSeason = positions.filter((p) => p.seasonOrdinal === ordinal).sort((a, b) => a.firstStartAt.getTime() - b.firstStartAt.getTime());
      const position = row ? { weekday: row.animeWeekday, minute: row.animeStartMinute, durationMinutes: row.durationMinutes } : null;
      const moved = Boolean(position && previous && (position.weekday !== previous.weekday || position.minute !== previous.minute));
      timeline.push({
        season,
        ordinal,
        position,
        moved,
        titles: inSeason.map((p) => {
          const title = titleById.get(p.titleId)!;
          return {
            slug: title.slug,
            name: title.name,
            weekday: p.weekday,
            minute: p.startMinute,
            durationMinutes: p.durationMinutes,
            airings: p.count,
            firstStartAt: p.firstStartAt,
            lastStartAt: p.lastStartAt,
            continuesFromPrevious: previousTitles.has(p.titleId)
          };
        })
      });
      if (position) previous = position;
      previousTitles = new Set(inSeason.map((p) => p.titleId));
    }
  }

  const byYearMap = new Map<number, Set<number>>();
  for (const position of positions) {
    const year = Math.floor(position.seasonOrdinal / 10);
    byYearMap.set(year, (byYearMap.get(year) ?? new Set<number>()).add(position.titleId));
  }

  const relatedRows =
    memberIds.length === 0
      ? []
      : await db().slotMembership.groupBy({ by: ["slotId"], where: { titleId: { in: memberIds }, slotId: { not: slot.id } }, _count: { titleId: true } });
  const relatedSlots = relatedRows.length
    ? await db().slot.findMany({ where: { id: { in: relatedRows.map((r) => r.slotId) } }, select: { id: true, slug: true, name: true, kind: true } })
    : [];
  const sharedBySlot = new Map(relatedRows.map((r) => [r.slotId, r._count.titleId]));

  return {
    slug: slot.slug,
    name: slot.name,
    kind: slot.kind,
    titleCount: slot.titleCount,
    seasonCount: slot.seasonCount,
    firstAnimeDate: slot.firstAnimeDate ? dbDateToIsoDate(slot.firstAnimeDate) : null,
    lastAnimeDate: slot.lastAnimeDate ? dbDateToIsoDate(slot.lastAnimeDate) : null,
    channel: slot.homeChannel ? { slug: slot.homeChannel.slug, shortName: slot.homeChannel.shortName ?? slot.homeChannel.name, name: slot.homeChannel.name } : null,
    latest: anchor ? { seasonOrdinal: anchor.seasonOrdinal, weekday: anchor.animeWeekday, minute: anchor.animeStartMinute, durationMinutes: anchor.durationMinutes } : null,
    seasonOrdinals: slot.seasons.map((season) => season.seasonOrdinal),
    description: slot.description,
    evidenceUrl: slot.evidenceUrl,
    ruleVersion: slot.ruleVersion,
    computedAt: slot.computedAt,
    timeline,
    members: slot.memberships
      .map((m) => ({
        slug: m.title.slug,
        name: m.title.name,
        method: m.method,
        confidence: m.confidence,
        evidence: m.evidence,
        firstStartAt: m.firstStartAt,
        seasonOrdinal: m.seasonOrdinal,
        channelShortName: m.channel?.shortName ?? null
      }))
      .sort((a, b) => (b.firstStartAt?.getTime() ?? 0) - (a.firstStartAt?.getTime() ?? 0)),
    byYear: [...byYearMap.entries()].sort(([a], [b]) => a - b).map(([year, titles]) => ({ year, titles: titles.size })),
    related: relatedSlots
      .map((s) => ({ slug: s.slug, name: s.name, kind: s.kind, shared: sharedBySlot.get(s.id) ?? 0 }))
      .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name, "ja"))
      .slice(0, 8)
  };
}
