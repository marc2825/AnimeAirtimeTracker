import {
  airings,
  channels,
  companies,
  people,
  regions,
  sequelRelations,
  slots,
  titleCompanies,
  titleStaff,
  titles
} from "@/data/catalog";
import { animeWeekdays } from "@/lib/types";
import type {
  Airing,
  AnimeWeekday,
  Channel,
  Company,
  Person,
  Region,
  SequelRelation,
  Slot,
  StaffRole,
  Title,
  TitleCompany,
  TitleStaff
} from "@/lib/types";

const quarterOrder = {
  WINTER: 1,
  SPRING: 2,
  SUMMER: 3,
  AUTUMN: 4
} as const;

export interface AiringView extends Airing {
  channel: Channel;
  region: Region;
  slot: Slot | null;
}

export interface StaffCreditView {
  role: StaffRole;
  person: Person;
}

export interface TitleEntry {
  title: Title;
  airings: AiringView[];
  companies: Company[];
  primaryCompanies: Company[];
  staffCredits: StaffCreditView[];
  slots: Slot[];
  firstAiring: AiringView | null;
  fastestAiring: AiringView | null;
}

export interface SearchFilters {
  q?: string;
  year?: string;
  quarter?: string;
  weekday?: string;
  region?: string;
  channel?: string;
  slot?: string;
  genre?: string;
  company?: string;
  timeBand?: string;
  sort?: string;
}

export interface SearchOptions {
  years: number[];
  quarters: Title["seasonQuarter"][];
  weekdays: AnimeWeekday[];
  regions: Region[];
  channels: Channel[];
  slots: Slot[];
  genres: string[];
  companies: Company[];
}

export interface SlotDetail {
  slot: Slot;
  channel: Channel;
  region: Region;
  airings: AiringView[];
  titles: TitleEntry[];
  yearCounts: Array<{ year: number; count: number }>;
  topGenres: Array<{ label: string; count: number }>;
  topCompanies: Array<{ label: string; count: number }>;
  topStaff: Array<{ label: string; count: number }>;
  sequelRate: number;
  timeChanges: Array<{ seasonLabel: string; titleName: string; timeText: string }>;
  overlaps: Array<{ slot: Slot; count: number }>;
}

export interface DashboardHeatmapRow {
  hour: number;
  counts: Record<AnimeWeekday, number>;
}

const regionMap = new Map(regions.map((region) => [region.id, region]));
const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
const companyMap = new Map(companies.map((company) => [company.id, company]));
const personMap = new Map(people.map((person) => [person.id, person]));
const titleMap = new Map(titles.map((title) => [title.id, title]));

const airingsByTitle = groupBy(airings, (airing) => airing.titleId);
const titleCompaniesByTitle = groupBy(titleCompanies, (entry) => entry.titleId);
const titleStaffByTitle = groupBy(titleStaff, (entry) => entry.titleId);

function groupBy<TValue>(values: TValue[], keySelector: (value: TValue) => string): Map<string, TValue[]> {
  const result = new Map<string, TValue[]>();

  for (const value of values) {
    const key = keySelector(value);
    const current = result.get(key);
    if (current) {
      current.push(value);
    } else {
      result.set(key, [value]);
    }
  }

  return result;
}

function compareByBroadcastStart(left: Airing, right: Airing): number {
  return new Date(left.broadcastStartAt).getTime() - new Date(right.broadcastStartAt).getTime();
}

function uniqueById<TValue extends { id: string }>(values: TValue[]): TValue[] {
  const seen = new Set<string>();
  const result: TValue[] = [];

  for (const value of values) {
    if (!seen.has(value.id)) {
      seen.add(value.id);
      result.push(value);
    }
  }

  return result;
}

function enrichAiring(airing: Airing): AiringView {
  const channel = channelMap.get(airing.channelId);
  const region = regionMap.get(airing.regionId);

  if (!channel || !region) {
    throw new Error(`Airing ${airing.id} references missing channel or region.`);
  }

  return {
    ...airing,
    channel,
    region,
    slot: airing.slotId ? (slotMap.get(airing.slotId) ?? null) : null
  };
}

function getCompaniesForTitle(entries: TitleCompany[]): Company[] {
  return entries
    .map((entry) => companyMap.get(entry.companyId))
    .filter((company): company is Company => company !== undefined);
}

function getStaffForTitle(entries: TitleStaff[]): StaffCreditView[] {
  return entries
    .map((entry) => {
      const person = personMap.get(entry.personId);
      if (!person) {
        return null;
      }

      return {
        role: entry.role,
        person
      };
    })
    .filter((value): value is StaffCreditView => value !== null);
}

function buildTitleEntry(title: Title): TitleEntry {
  const titleAirings = (airingsByTitle.get(title.id) ?? []).map(enrichAiring).sort(compareByBroadcastStart);
  const companyEntries = titleCompaniesByTitle.get(title.id) ?? [];
  const relatedCompanies = getCompaniesForTitle(companyEntries);
  const primaryCompanies = companyEntries
    .filter((entry) => entry.isPrimary)
    .map((entry) => companyMap.get(entry.companyId))
    .filter((company): company is Company => company !== undefined);
  const staffCredits = getStaffForTitle(titleStaffByTitle.get(title.id) ?? []);
  const relatedSlots = uniqueById(
    titleAirings
      .map((airing) => airing.slot)
      .filter((slot): slot is Slot => slot !== null)
  );
  const firstRunAirings = titleAirings.filter((airing) => airing.isFirstRun && !airing.isRebroadcast);
  const firstAiring = firstRunAirings[0] ?? titleAirings[0] ?? null;

  return {
    title,
    airings: titleAirings,
    companies: relatedCompanies,
    primaryCompanies,
    staffCredits,
    slots: relatedSlots,
    firstAiring,
    fastestAiring: firstAiring
  };
}

const titleEntries = titles
  .map(buildTitleEntry)
  .sort((left, right) => {
    if (left.title.seasonYear !== right.title.seasonYear) {
      return right.title.seasonYear - left.title.seasonYear;
    }

    if (left.title.seasonQuarter !== right.title.seasonQuarter) {
      return quarterOrder[right.title.seasonQuarter] - quarterOrder[left.title.seasonQuarter];
    }

    return left.title.name.localeCompare(right.title.name, "ja");
  });

const titleEntryBySlug = new Map(titleEntries.map((entry) => [entry.title.slug, entry]));

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("ja-JP");
}

function getTimeBand(airing: AiringView): string {
  if (airing.animeBroadcastHour24 <= 23) {
    return "23";
  }

  if (airing.animeBroadcastHour24 === 24) {
    return "24";
  }

  if (airing.animeBroadcastHour24 === 25) {
    return "25";
  }

  return "26";
}

function uniqueTitleEntriesById(entries: TitleEntry[]): TitleEntry[] {
  const seen = new Set<string>();
  const result: TitleEntry[] = [];

  for (const entry of entries) {
    if (!seen.has(entry.title.id)) {
      seen.add(entry.title.id);
      result.push(entry);
    }
  }

  return result;
}

function topCounts(values: string[], limit: number): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function getSeasonKey(title: Title): string {
  return `${title.seasonYear}-${title.seasonQuarter}`;
}

function getAnimeMinutes(airing: AiringView): number {
  return airing.animeBroadcastHour24 * 60 + airing.animeBroadcastMinute;
}

function getOverlappingSlots(targetSlotId: string, targetAirings: AiringView[]): Array<{ slot: Slot; count: number }> {
  const counts = new Map<string, number>();
  const targetTitleIds = new Set(targetAirings.map((airing) => airing.titleId));
  const comparableAirings = airings
    .map(enrichAiring)
    .filter((airing) => airing.slot && airing.slot.id !== targetSlotId && !airing.isRebroadcast);

  for (const target of targetAirings.filter((airing) => !airing.isRebroadcast)) {
    const targetTitle = titleMap.get(target.titleId);
    if (!targetTitle) {
      continue;
    }

    for (const other of comparableAirings) {
      if (targetTitleIds.has(other.titleId)) {
        continue;
      }

      const otherTitle = titleMap.get(other.titleId);
      if (!otherTitle) {
        continue;
      }

      if (getSeasonKey(targetTitle) !== getSeasonKey(otherTitle)) {
        continue;
      }

      if (target.animeBroadcastDay !== other.animeBroadcastDay) {
        continue;
      }

      if (Math.abs(getAnimeMinutes(target) - getAnimeMinutes(other)) > 30) {
        continue;
      }

      if (other.slot) {
        counts.set(other.slot.id, (counts.get(other.slot.id) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([slotId, count]) => ({ slot: slotMap.get(slotId), count }))
    .filter((entry): entry is { slot: Slot; count: number } => entry.slot !== undefined)
    .sort((left, right) => right.count - left.count || left.slot.name.localeCompare(right.slot.name, "ja"));
}

export function getSearchOptions(): SearchOptions {
  return {
    years: [...new Set(titles.map((title) => title.seasonYear))].sort((left, right) => right - left),
    quarters: ["WINTER", "SPRING", "SUMMER", "AUTUMN"],
    weekdays: [...animeWeekdays],
    regions,
    channels,
    slots,
    genres: [...new Set(titles.flatMap((title) => title.genres))].sort((left, right) =>
      left.localeCompare(right, "ja")
    ),
    companies
  };
}

export function getAllTitleEntries(): TitleEntry[] {
  return titleEntries;
}

export function filterTitles(filters: SearchFilters): TitleEntry[] {
  const q = filters.q ? normalizeText(filters.q) : "";

  const result = titleEntries.filter((entry) => {
    if (
      q &&
      ![
        entry.title.name,
        entry.title.shortName ?? "",
        entry.title.kana ?? "",
        ...entry.slots.map((slot) => slot.name)
      ]
        .map(normalizeText)
        .some((value) => value.includes(q))
    ) {
      return false;
    }

    if (filters.year && String(entry.title.seasonYear) !== filters.year) {
      return false;
    }

    if (filters.quarter && entry.title.seasonQuarter !== filters.quarter) {
      return false;
    }

    if (filters.weekday && !entry.airings.some((airing) => airing.animeBroadcastDay === filters.weekday)) {
      return false;
    }

    if (filters.region && !entry.airings.some((airing) => airing.region.slug === filters.region)) {
      return false;
    }

    if (filters.channel && !entry.airings.some((airing) => airing.channel.slug === filters.channel)) {
      return false;
    }

    if (filters.slot && !entry.slots.some((slot) => slot.slug === filters.slot)) {
      return false;
    }

    if (filters.genre && !entry.title.genres.includes(filters.genre)) {
      return false;
    }

    if (filters.company && !entry.companies.some((company) => company.slug === filters.company)) {
      return false;
    }

    if (filters.timeBand && !entry.airings.some((airing) => getTimeBand(airing) === filters.timeBand)) {
      return false;
    }

    return true;
  });

  const sort = filters.sort ?? "latest";

  if (sort === "title") {
    return result.sort((left, right) => left.title.name.localeCompare(right.title.name, "ja"));
  }

  if (sort === "slot") {
    return result.sort((left, right) => {
      const leftSlot = left.slots[0]?.name ?? "未分類";
      const rightSlot = right.slots[0]?.name ?? "未分類";
      return leftSlot.localeCompare(rightSlot, "ja") || left.title.name.localeCompare(right.title.name, "ja");
    });
  }

  if (sort === "airtime") {
    return result.sort((left, right) => {
      const leftStart = left.firstAiring ? new Date(left.firstAiring.broadcastStartAt).getTime() : 0;
      const rightStart = right.firstAiring ? new Date(right.firstAiring.broadcastStartAt).getTime() : 0;
      return leftStart - rightStart;
    });
  }

  return result;
}

export function getTitleBySlug(slug: string): TitleEntry | null {
  return titleEntryBySlug.get(slug) ?? null;
}

export function getTitleSequelLinks(titleId: string): {
  previous: TitleEntry | null;
  next: TitleEntry | null;
  relations: SequelRelation[];
} {
  const relations = sequelRelations.filter(
    (relation) => relation.fromTitleId === titleId || relation.toTitleId === titleId
  );

  const previousRelation = relations.find((relation) => relation.toTitleId === titleId);
  const nextRelation = relations.find((relation) => relation.fromTitleId === titleId);

  return {
    previous: previousRelation ? (titleEntries.find((entry) => entry.title.id === previousRelation.fromTitleId) ?? null) : null,
    next: nextRelation ? (titleEntries.find((entry) => entry.title.id === nextRelation.toTitleId) ?? null) : null,
    relations
  };
}

export function getRelatedTitlesBySeason(title: Title): TitleEntry[] {
  return titleEntries.filter(
    (entry) =>
      entry.title.id !== title.id &&
      entry.title.seasonYear === title.seasonYear &&
      entry.title.seasonQuarter === title.seasonQuarter
  );
}

export function getTitlesSharingSlot(titleId: string): TitleEntry[] {
  const target = titleEntries.find((entry) => entry.title.id === titleId);

  if (!target) {
    return [];
  }

  return uniqueTitleEntriesById(
    titleEntries.filter(
      (entry) =>
        entry.title.id !== titleId && entry.slots.some((slot) => target.slots.some((targetSlot) => targetSlot.id === slot.id))
    )
  );
}

export function getSlotBySlug(slug: string): SlotDetail | null {
  const slot = slots.find((entry) => entry.slug === slug);

  if (!slot) {
    return null;
  }

  const slotAirings = airings
    .map(enrichAiring)
    .filter((airing) => airing.slot?.id === slot.id)
    .sort(compareByBroadcastStart);
  const slotTitleEntries = uniqueTitleEntriesById(
    slotAirings
      .map((airing) => titleEntries.find((entry) => entry.title.id === airing.titleId))
      .filter((entry): entry is TitleEntry => entry !== undefined)
  );
  const channel = channelMap.get(slot.channelId);
  const region = channel ? regionMap.get(channel.regionId) : undefined;

  if (!channel || !region) {
    throw new Error(`Slot ${slot.id} references missing channel or region.`);
  }

  return {
    slot,
    channel,
    region,
    airings: slotAirings,
    titles: slotTitleEntries,
    yearCounts: [...new Set(slotTitleEntries.map((entry) => entry.title.seasonYear))]
      .sort((left, right) => left - right)
      .map((year) => ({
        year,
        count: slotTitleEntries.filter((entry) => entry.title.seasonYear === year).length
      })),
    topGenres: topCounts(slotTitleEntries.flatMap((entry) => entry.title.genres), 4),
    topCompanies: topCounts(slotTitleEntries.flatMap((entry) => entry.primaryCompanies.map((company) => company.name)), 4),
    topStaff: topCounts(
      slotTitleEntries.flatMap((entry) => entry.staffCredits.map((credit) => credit.person.name)),
      4
    ),
    sequelRate:
      slotTitleEntries.length === 0
        ? 0
        : (slotTitleEntries.filter((entry) => entry.title.isSequel).length / slotTitleEntries.length) * 100,
    timeChanges: slotAirings
      .filter((airing) => !airing.isRebroadcast)
      .map((airing) => {
        const title = titleMap.get(airing.titleId);

        return {
          seasonLabel: title ? `${title.seasonYear} ${title.seasonQuarter}` : "不明",
          titleName: title?.name ?? "不明作品",
          timeText: airing.animeBroadcastTimeText
        };
      }),
    overlaps: getOverlappingSlots(slot.id, slotAirings)
  };
}

export function getOverviewStats(): Array<{ label: string; value: string; help: string }> {
  const firstRunAirings = airings.filter((airing) => !airing.isRebroadcast);

  return [
    {
      label: "作品数",
      value: String(titles.length),
      help: "ダミーデータ上の作品本数"
    },
    {
      label: "放送件数",
      value: String(firstRunAirings.length),
      help: "作品×局×日時の初回放送件数"
    },
    {
      label: "放送枠数",
      value: String(slots.length),
      help: "独立エンティティとして管理している枠"
    }
  ];
}

export function getFeaturedSlots(limit: number): SlotDetail[] {
  return slots
    .map((slot) => getSlotBySlug(slot.slug))
    .filter((entry): entry is SlotDetail => entry !== null)
    .sort((left, right) => right.titles.length - left.titles.length || left.slot.name.localeCompare(right.slot.name, "ja"))
    .slice(0, limit);
}

export function getDashboardData(): {
  heatmap: DashboardHeatmapRow[];
  slotTable: Array<{
    slotSlug: string;
    slotName: string;
    channelName: string;
    titleCount: number;
    firstRunCount: number;
    topGenre: string;
    sequelRate: number;
  }>;
  regionTable: Array<{
    regionName: string;
    titleCount: number;
    averageHour: string;
  }>;
} {
  const firstRunAirings = airings.map(enrichAiring).filter((airing) => !airing.isRebroadcast);
  const hours = [23, 24, 25, 26];

  const heatmap = hours.map((hour) => ({
    hour,
    counts: animeWeekdays.reduce<Record<AnimeWeekday, number>>((accumulator, weekday) => {
      accumulator[weekday] = firstRunAirings.filter(
        (airing) => airing.animeBroadcastDay === weekday && airing.animeBroadcastHour24 === hour
      ).length;
      return accumulator;
    }, {} as Record<AnimeWeekday, number>)
  }));

  const slotTable = slots
    .map((slot) => {
      const detail = getSlotBySlug(slot.slug);

      if (!detail) {
        return null;
      }

      return {
        slotSlug: detail.slot.slug,
        slotName: detail.slot.name,
        channelName: detail.channel.name,
        titleCount: detail.titles.length,
        firstRunCount: detail.airings.filter((airing) => !airing.isRebroadcast).length,
        topGenre: detail.topGenres[0]?.label ?? "未集計",
        sequelRate: detail.sequelRate
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((left, right) => right.titleCount - left.titleCount || left.slotName.localeCompare(right.slotName, "ja"));

  const regionTable = regions.map((region) => {
    const regionAirings = firstRunAirings.filter((airing) => airing.region.id === region.id);
    const titleCount = new Set(regionAirings.map((airing) => airing.titleId)).size;
    const averageMinutes =
      regionAirings.reduce((sum, airing) => sum + getAnimeMinutes(airing), 0) / Math.max(regionAirings.length, 1);
    const averageHour = `${Math.floor(averageMinutes / 60)}:${String(Math.round(averageMinutes % 60)).padStart(2, "0")}`;

    return {
      regionName: region.name,
      titleCount,
      averageHour
    };
  });

  return {
    heatmap,
    slotTable,
    regionTable
  };
}
