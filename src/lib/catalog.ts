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
import { formatAnimeSchedule, formatSeason } from "@/lib/formatters";
import { animeWeekdays, durationCategories } from "@/lib/types";
import type {
  Airing,
  AnimeWeekday,
  Channel,
  Company,
  DurationCategory,
  Person,
  Region,
  SequelRelation,
  SeasonQuarter,
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

export interface SlotDistributionItem {
  label: string;
  count: number;
  share: number;
}

export interface SlotChannelDistributionItem {
  channel: Channel;
  count: number;
  share: number;
}

export interface SlotWeekdayDistributionItem {
  weekday: AnimeWeekday;
  count: number;
  share: number;
}

export interface SlotTimeChangeItem {
  seasonLabel: string;
  titleSlug: string;
  titleName: string;
  animeScheduleText: string;
  broadcastStartAt: string;
  channelName: string;
}

export interface SlotOverlapItem {
  slot: Slot;
  count: number;
  share: number;
}

export interface DashboardFilters {
  year?: string;
  quarter?: string;
  channel?: string;
  slot?: string;
}

export interface SlotDetail {
  slot: Slot;
  channel: Channel;
  region: Region;
  airings: AiringView[];
  titles: TitleEntry[];
  firstRunCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  sequelCount: number;
  schedulePatternCount: number;
  yearCounts: Array<{ year: number; count: number; share: number }>;
  topGenres: Array<{ label: string; count: number }>;
  genreDistribution: SlotDistributionItem[];
  topCompanies: Array<{ label: string; count: number }>;
  companyDistribution: SlotDistributionItem[];
  channelDistribution: SlotChannelDistributionItem[];
  weekdayDistribution: SlotWeekdayDistributionItem[];
  timeDistribution: SlotDistributionItem[];
  topStaff: Array<{ label: string; count: number }>;
  sequelRate: number;
  timeChanges: SlotTimeChangeItem[];
  overlaps: SlotOverlapItem[];
}

export interface DashboardHeatmapRow {
  timeBand: string;
  counts: Record<AnimeWeekday, number>;
}

export interface DashboardChannelHeatmap {
  columns: Array<{ slug: string; label: string }>;
  rows: Array<{
    timeBand: string;
    counts: Record<string, number>;
  }>;
}

export interface DashboardTrendPoint {
  seasonKey: string;
  label: string;
  titleCount: number;
  airingCount: number;
  share: number;
}

export interface DashboardOverlapRow {
  leftSlotSlug: string;
  leftSlotName: string;
  rightSlotSlug: string;
  rightSlotName: string;
  count: number;
  share: number;
  seasonCount: number;
  topWeekday: AnimeWeekday | null;
  topTimeWindow: string;
}

export interface DashboardDurationRow {
  duration: DurationCategory;
  titleCount: number;
  share: number;
}

export interface DashboardRegionRow {
  regionSlug: string;
  regionName: string;
  titleCount: number;
  airingCount: number;
  averageHour: string;
  topChannel: string;
  peakWeekday: AnimeWeekday | null;
  peakTimeBand: string;
  airingShare: number;
}

export interface DashboardSummary {
  titleCount: number;
  airingCount: number;
  slotCount: number;
  overlapPairCount: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  weekdayHeatmap: DashboardHeatmapRow[];
  quarterTrend: DashboardTrendPoint[];
  channelTimeHeatmap: DashboardChannelHeatmap;
  overlapTable: DashboardOverlapRow[];
  durationTable: DashboardDurationRow[];
  regionTable: DashboardRegionRow[];
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

function getShare(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return (count / total) * 100;
}

function buildDistribution(values: string[]): SlotDistributionItem[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
    .map(([label, count]) => ({
      label,
      count,
      share: getShare(count, values.length)
    }));
}

function buildChannelDistribution(values: Channel[]): SlotChannelDistributionItem[] {
  const counts = new Map<string, { channel: Channel; count: number }>();

  for (const channel of values) {
    const current = counts.get(channel.id);

    if (current) {
      current.count += 1;
    } else {
      counts.set(channel.id, { channel, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.channel.name.localeCompare(right.channel.name, "ja"))
    .map((entry) => ({
      ...entry,
      share: getShare(entry.count, values.length)
    }));
}

function buildWeekdayDistribution(values: AnimeWeekday[]): SlotWeekdayDistributionItem[] {
  const counts = new Map<AnimeWeekday, number>();

  for (const weekday of values) {
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(
      (left, right) =>
        right[1] - left[1] || animeWeekdays.indexOf(left[0]) - animeWeekdays.indexOf(right[0])
    )
    .map(([weekday, count]) => ({
      weekday,
      count,
      share: getShare(count, values.length)
    }));
}

function buildYearCounts(values: number[]): Array<{ year: number; count: number; share: number }> {
  if (values.length === 0) {
    return [];
  }

  const minYear = Math.min(...values);
  const maxYear = Math.max(...values);

  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index).map((year) => {
    const count = values.filter((value) => value === year).length;

    return {
      year,
      count,
      share: getShare(count, values.length)
    };
  });
}

function matchesDashboardFilters(airing: AiringView, filters: DashboardFilters): boolean {
  const title = titleMap.get(airing.titleId);

  if (!title) {
    return false;
  }

  if (filters.year && String(title.seasonYear) !== filters.year) {
    return false;
  }

  if (filters.quarter && title.seasonQuarter !== filters.quarter) {
    return false;
  }

  if (filters.channel && airing.channel.slug !== filters.channel) {
    return false;
  }

  if (filters.slot && airing.slot?.slug !== filters.slot) {
    return false;
  }

  return true;
}

function buildSeasonTrend(airings: AiringView[], relatedTitles: TitleEntry[]): DashboardTrendPoint[] {
  const counts = new Map<
    string,
    {
      year: number;
      quarter: SeasonQuarter;
      titleIds: Set<string>;
      airingCount: number;
    }
  >();

  for (const airing of airings) {
    const title = titleMap.get(airing.titleId);

    if (!title) {
      continue;
    }

    const seasonKey = getSeasonKey(title);
    const current = counts.get(seasonKey);

    if (current) {
      current.titleIds.add(title.id);
      current.airingCount += 1;
    } else {
      counts.set(seasonKey, {
        year: title.seasonYear,
        quarter: title.seasonQuarter,
        titleIds: new Set([title.id]),
        airingCount: 1
      });
    }
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (left[1].year !== right[1].year) {
        return left[1].year - right[1].year;
      }

      return quarterOrder[left[1].quarter] - quarterOrder[right[1].quarter];
    })
    .map(([seasonKey, entry]) => ({
      seasonKey,
      label: formatSeason(entry.year, entry.quarter),
      titleCount: entry.titleIds.size,
      airingCount: entry.airingCount,
      share: getShare(entry.titleIds.size, relatedTitles.length)
    }));
}

function buildChannelTimeHeatmap(airings: AiringView[]): DashboardChannelHeatmap {
  const channelColumns = uniqueById(airings.map((airing) => airing.channel)).sort((left, right) =>
    left.name.localeCompare(right.name, "ja")
  );
  const timeBands = ["23", "24", "25", "26"];

  return {
    columns: channelColumns.map((channel) => ({
      slug: channel.slug,
      label: channel.name
    })),
    rows: timeBands.map((timeBand) => ({
      timeBand,
      counts: channelColumns.reduce<Record<string, number>>((accumulator, channel) => {
        accumulator[channel.slug] = airings.filter(
          (airing) => airing.channel.id === channel.id && getTimeBand(airing) === timeBand
        ).length;
        return accumulator;
      }, {})
    }))
  };
}

function buildOverlapTable(airings: AiringView[]): DashboardOverlapRow[] {
  const counts = new Map<
    string,
    {
      leftSlot: Slot;
      rightSlot: Slot;
      count: number;
      seasons: Set<string>;
      weekdays: AnimeWeekday[];
      timeWindows: string[];
    }
  >();

  for (let index = 0; index < airings.length; index += 1) {
    const left = airings[index];
    const leftTitle = titleMap.get(left.titleId);

    if (!leftTitle || !left.slot) {
      continue;
    }

    for (let innerIndex = index + 1; innerIndex < airings.length; innerIndex += 1) {
      const right = airings[innerIndex];
      const rightTitle = titleMap.get(right.titleId);

      if (!rightTitle || !right.slot) {
        continue;
      }

      if (left.titleId === right.titleId || left.slot.id === right.slot.id) {
        continue;
      }

      if (getSeasonKey(leftTitle) !== getSeasonKey(rightTitle)) {
        continue;
      }

      if (left.animeBroadcastDay !== right.animeBroadcastDay) {
        continue;
      }

      if (Math.abs(getAnimeMinutes(left) - getAnimeMinutes(right)) > 30) {
        continue;
      }

      const [firstSlot, secondSlot] = [left.slot, right.slot].sort((slotLeft, slotRight) =>
        slotLeft.name.localeCompare(slotRight.name, "ja")
      );
      const isLeftFirst = firstSlot.id === left.slot.id;
      const timeWindow = isLeftFirst
        ? `${left.animeBroadcastTimeText} / ${right.animeBroadcastTimeText}`
        : `${right.animeBroadcastTimeText} / ${left.animeBroadcastTimeText}`;
      const key = `${firstSlot.id}__${secondSlot.id}`;
      const current = counts.get(key);

      if (current) {
        current.count += 1;
        current.seasons.add(getSeasonKey(leftTitle));
        current.weekdays.push(left.animeBroadcastDay);
        current.timeWindows.push(timeWindow);
      } else {
        counts.set(key, {
          leftSlot: firstSlot,
          rightSlot: secondSlot,
          count: 1,
          seasons: new Set([getSeasonKey(leftTitle)]),
          weekdays: [left.animeBroadcastDay],
          timeWindows: [timeWindow]
        });
      }
    }
  }

  const total = [...counts.values()].reduce((sum, entry) => sum + entry.count, 0);

  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count || left.leftSlot.name.localeCompare(right.leftSlot.name, "ja")
    )
    .map((entry) => ({
      leftSlotSlug: entry.leftSlot.slug,
      leftSlotName: entry.leftSlot.name,
      rightSlotSlug: entry.rightSlot.slug,
      rightSlotName: entry.rightSlot.name,
      count: entry.count,
      share: getShare(entry.count, total),
      seasonCount: entry.seasons.size,
      topWeekday: topCounts(entry.weekdays, 1)[0]?.label as AnimeWeekday | undefined ?? null,
      topTimeWindow: topCounts(entry.timeWindows, 1)[0]?.label ?? "未観測"
    }));
}

function buildDurationTable(entries: TitleEntry[]): DashboardDurationRow[] {
  return durationCategories.map((duration) => {
    const titleCount = entries.filter((entry) => entry.title.durationCategory === duration).length;

    return {
      duration,
      titleCount,
      share: getShare(titleCount, entries.length)
    };
  });
}

function formatAverageHour(airings: AiringView[]): string {
  if (airings.length === 0) {
    return "未観測";
  }

  const averageMinutes = airings.reduce((sum, airing) => sum + getAnimeMinutes(airing), 0) / airings.length;
  return `${Math.floor(averageMinutes / 60)}:${String(Math.round(averageMinutes % 60)).padStart(2, "0")}`;
}

function buildRegionTable(airings: AiringView[]): DashboardRegionRow[] {
  return regions.map((region) => {
    const regionAirings = airings.filter((airing) => airing.region.id === region.id);
    const titleCount = new Set(regionAirings.map((airing) => airing.titleId)).size;

    return {
      regionSlug: region.slug,
      regionName: region.name,
      titleCount,
      airingCount: regionAirings.length,
      averageHour: formatAverageHour(regionAirings),
      topChannel: topCounts(regionAirings.map((airing) => airing.channel.name), 1)[0]?.label ?? "未観測",
      peakWeekday: (topCounts(regionAirings.map((airing) => airing.animeBroadcastDay), 1)[0]?.label as
        | AnimeWeekday
        | undefined) ?? null,
      peakTimeBand: topCounts(regionAirings.map((airing) => getTimeBand(airing)), 1)[0]?.label ?? "未観測",
      airingShare: getShare(regionAirings.length, airings.length)
    };
  });
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
  const firstRunAirings = slotAirings.filter((airing) => !airing.isRebroadcast);
  const slotTitleIds = new Set(slotAirings.map((airing) => airing.titleId));
  const slotTitleEntries = titleEntries.filter((entry) => slotTitleIds.has(entry.title.id));
  const channel = channelMap.get(slot.channelId);
  const region = channel ? regionMap.get(channel.regionId) : undefined;

  if (!channel || !region) {
    throw new Error(`Slot ${slot.id} references missing channel or region.`);
  }

  const genreDistribution = buildDistribution(slotTitleEntries.flatMap((entry) => entry.title.genres));
  const companyDistribution = buildDistribution(
    slotTitleEntries.flatMap((entry) =>
      (entry.primaryCompanies.length > 0 ? entry.primaryCompanies : entry.companies).map((company) => company.name)
    )
  );
  const channelDistribution = buildChannelDistribution(firstRunAirings.map((airing) => airing.channel));
  const weekdayDistribution = buildWeekdayDistribution(firstRunAirings.map((airing) => airing.animeBroadcastDay));
  const timeDistribution = buildDistribution(firstRunAirings.map((airing) => airing.animeBroadcastTimeText));
  const sequelCount = slotTitleEntries.filter((entry) => entry.title.isSequel).length;
  const timePatternCount = new Set(
    firstRunAirings.map((airing) => `${airing.animeBroadcastDay}-${airing.animeBroadcastTimeText}`)
  ).size;

  return {
    slot,
    channel,
    region,
    airings: slotAirings,
    titles: slotTitleEntries,
    firstRunCount: firstRunAirings.length,
    firstObservedAt: firstRunAirings[0]?.broadcastStartAt ?? slotAirings[0]?.broadcastStartAt ?? null,
    lastObservedAt:
      firstRunAirings[firstRunAirings.length - 1]?.broadcastStartAt ?? slotAirings[slotAirings.length - 1]?.broadcastStartAt ?? null,
    sequelCount,
    schedulePatternCount: timePatternCount,
    yearCounts: buildYearCounts(slotTitleEntries.map((entry) => entry.title.seasonYear)),
    topGenres: genreDistribution.slice(0, 4).map(({ label, count }) => ({ label, count })),
    genreDistribution,
    topCompanies: companyDistribution.slice(0, 4).map(({ label, count }) => ({ label, count })),
    companyDistribution,
    channelDistribution,
    weekdayDistribution,
    timeDistribution,
    topStaff: topCounts(
      slotTitleEntries.flatMap((entry) => entry.staffCredits.map((credit) => credit.person.name)),
      4
    ),
    sequelRate: slotTitleEntries.length === 0 ? 0 : getShare(sequelCount, slotTitleEntries.length),
    timeChanges: firstRunAirings
      .map((airing) => {
        const title = titleMap.get(airing.titleId);

        return {
          seasonLabel: title ? formatSeason(title.seasonYear, title.seasonQuarter) : "不明シーズン",
          titleSlug: title?.slug ?? "",
          titleName: title?.name ?? "不明作品",
          animeScheduleText: formatAnimeSchedule(airing.animeBroadcastDay, airing.animeBroadcastTimeText),
          broadcastStartAt: airing.broadcastStartAt,
          channelName: airing.channel.name
        };
      }),
    overlaps: getOverlappingSlots(slot.id, slotAirings).map((entry) => ({
      ...entry,
      share: getShare(entry.count, Math.max(firstRunAirings.length, 1))
    }))
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

export function getDashboardData(filters: DashboardFilters = {}): DashboardData {
  const firstRunAirings = airings
    .map(enrichAiring)
    .filter((airing) => !airing.isRebroadcast)
    .filter((airing) => matchesDashboardFilters(airing, filters));
  const relatedTitles = uniqueTitleEntriesById(
    firstRunAirings
      .map((airing) => titleEntries.find((entry) => entry.title.id === airing.titleId))
      .filter((entry): entry is TitleEntry => entry !== undefined)
  );
  const relatedSlots = uniqueById(
    firstRunAirings
      .map((airing) => airing.slot)
      .filter((slot): slot is Slot => slot !== null)
  );
  const timeBands = ["23", "24", "25", "26"];

  const weekdayHeatmap = timeBands.map((timeBand) => ({
    timeBand,
    counts: animeWeekdays.reduce<Record<AnimeWeekday, number>>((accumulator, weekday) => {
      accumulator[weekday] = firstRunAirings.filter(
        (airing) => airing.animeBroadcastDay === weekday && getTimeBand(airing) === timeBand
      ).length;
      return accumulator;
    }, {} as Record<AnimeWeekday, number>)
  }));

  const overlapTable = buildOverlapTable(firstRunAirings);

  return {
    summary: {
      titleCount: relatedTitles.length,
      airingCount: firstRunAirings.length,
      slotCount: relatedSlots.length,
      overlapPairCount: overlapTable.length
    },
    weekdayHeatmap,
    quarterTrend: buildSeasonTrend(firstRunAirings, relatedTitles),
    channelTimeHeatmap: buildChannelTimeHeatmap(firstRunAirings),
    overlapTable,
    durationTable: buildDurationTable(relatedTitles),
    regionTable: buildRegionTable(firstRunAirings)
  };
}
