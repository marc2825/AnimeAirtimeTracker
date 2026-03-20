import { durationCategories } from "@/lib/types";
import type {
  Channel,
  Company,
  DurationCategory,
  Region,
  Slot
} from "@/lib/types";
import { getAllTitleEntries, getSearchOptions as getBaseSearchOptions } from "@/lib/catalog";
import type { AiringView, TitleEntry } from "@/lib/catalog";
import { getDefaultSortForView, pageSizeOptions } from "@/lib/search";
import type { SearchState } from "@/lib/search";

const quarterOrder = {
  WINTER: 1,
  SPRING: 2,
  SUMMER: 3,
  AUTUMN: 4
} as const;

export interface AiringSearchEntry {
  airing: AiringView;
  titleEntry: TitleEntry;
  title: TitleEntry["title"];
  companies: Company[];
  primaryCompanies: Company[];
}

export interface TitleSearchEntry {
  titleEntry: TitleEntry;
  title: TitleEntry["title"];
  matchedAirings: AiringSearchEntry[];
  matchedSlots: Slot[];
  matchedChannels: Channel[];
  matchedRegions: Region[];
  firstMatchedAiring: AiringView | null;
}

export interface SlotSearchEntry {
  slot: Slot;
  channel: Channel;
  region: Region;
  matchedAirings: AiringSearchEntry[];
  matchedTitles: TitleEntry[];
  firstMatchedAiring: AiringView | null;
  titleCount: number;
  airingCount: number;
  topGenres: Array<{ label: string; count: number }>;
  topCompanies: Array<{ label: string; count: number }>;
}

export interface SearchCollections {
  titleResults: TitleSearchEntry[];
  airingResults: AiringSearchEntry[];
  slotResults: SlotSearchEntry[];
  counts: {
    title: number;
    airing: number;
    slot: number;
  };
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
}

export interface SearchPageOptions {
  years: number[];
  quarters: ReturnType<typeof getBaseSearchOptions>["quarters"];
  weekdays: ReturnType<typeof getBaseSearchOptions>["weekdays"];
  regions: ReturnType<typeof getBaseSearchOptions>["regions"];
  channels: ReturnType<typeof getBaseSearchOptions>["channels"];
  slots: ReturnType<typeof getBaseSearchOptions>["slots"];
  genres: string[];
  companies: ReturnType<typeof getBaseSearchOptions>["companies"];
  durations: DurationCategory[];
  pageSizes: readonly number[];
}

const allTitleEntries = getAllTitleEntries();

const allAiringSearchEntries: AiringSearchEntry[] = allTitleEntries.flatMap((titleEntry) =>
  titleEntry.airings.map((airing) => ({
    airing,
    titleEntry,
    title: titleEntry.title,
    companies: titleEntry.companies,
    primaryCompanies: titleEntry.primaryCompanies
  }))
);

function compareByBroadcastStart(left: AiringView, right: AiringView): number {
  return new Date(left.broadcastStartAt).getTime() - new Date(right.broadcastStartAt).getTime();
}

function groupBy<TValue>(values: TValue[], keySelector: (value: TValue) => string): Map<string, TValue[]> {
  const result = new Map<string, TValue[]>();

  for (const value of values) {
    const key = keySelector(value);
    const existing = result.get(key);
    if (existing) {
      existing.push(value);
    } else {
      result.set(key, [value]);
    }
  }

  return result;
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

function uniqueByKey<TValue>(values: TValue[], keySelector: (value: TValue) => string): TValue[] {
  const seen = new Set<string>();
  const result: TValue[] = [];

  for (const value of values) {
    const key = keySelector(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
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

function matchesSequelFilter(isSequel: boolean, sequel: string): boolean {
  if (sequel === "only") {
    return isSequel;
  }

  if (sequel === "exclude") {
    return !isSequel;
  }

  return true;
}

function matchesQuery(entry: AiringSearchEntry, query: string): boolean {
  if (!query) {
    return true;
  }

  const values = [
    entry.title.name,
    entry.title.shortName ?? "",
    entry.title.kana ?? "",
    entry.airing.channel.name,
    entry.airing.region.name,
    entry.airing.slot?.name ?? "",
    ...(entry.airing.slot?.aliasNames ?? []),
    ...entry.titleEntry.slots.map((slot) => slot.name)
  ];

  return values.map(normalizeText).some((value) => value.includes(query));
}

function matchesFilters(entry: AiringSearchEntry, state: SearchState): boolean {
  const query = state.q ? normalizeText(state.q) : "";

  if (!matchesQuery(entry, query)) {
    return false;
  }

  if (state.year && String(entry.title.seasonYear) !== state.year) {
    return false;
  }

  if (state.quarter && entry.title.seasonQuarter !== state.quarter) {
    return false;
  }

  if (state.weekday && entry.airing.animeBroadcastDay !== state.weekday) {
    return false;
  }

  if (state.timeBand && getTimeBand(entry.airing) !== state.timeBand) {
    return false;
  }

  if (state.channel && entry.airing.channel.slug !== state.channel) {
    return false;
  }

  if (state.region && entry.airing.region.slug !== state.region) {
    return false;
  }

  if (state.slot && entry.airing.slot?.slug !== state.slot) {
    return false;
  }

  if (state.genre && !entry.title.genres.includes(state.genre)) {
    return false;
  }

  if (state.company && !entry.companies.some((company) => company.slug === state.company)) {
    return false;
  }

  if (!matchesSequelFilter(entry.title.isSequel, state.sequel)) {
    return false;
  }

  if (state.duration && entry.airing.durationCategory !== state.duration) {
    return false;
  }

  return true;
}

function buildTitleSearchEntries(filteredAirings: AiringSearchEntry[]): TitleSearchEntry[] {
  const grouped = groupBy(filteredAirings, (entry) => entry.title.id);

  return [...grouped.values()].map((entries) => {
    const sortedEntries = [...entries].sort((left, right) =>
      compareByBroadcastStart(left.airing, right.airing)
    );
    const titleEntry = sortedEntries[0]?.titleEntry ?? entries[0].titleEntry;

    return {
      titleEntry,
      title: titleEntry.title,
      matchedAirings: sortedEntries,
      matchedSlots: uniqueById(
        sortedEntries
          .map((entry) => entry.airing.slot)
          .filter((slot): slot is Slot => slot !== null)
      ),
      matchedChannels: uniqueById(sortedEntries.map((entry) => entry.airing.channel)),
      matchedRegions: uniqueById(sortedEntries.map((entry) => entry.airing.region)),
      firstMatchedAiring: sortedEntries[0]?.airing ?? null
    };
  });
}

function buildSlotSearchEntries(filteredAirings: AiringSearchEntry[]): SlotSearchEntry[] {
  const grouped = groupBy(
    filteredAirings.filter((entry) => entry.airing.slot !== null),
    (entry) => entry.airing.slot?.id ?? ""
  );

  return [...grouped.values()].map((entries) => {
    const sortedEntries = [...entries].sort((left, right) =>
      compareByBroadcastStart(left.airing, right.airing)
    );
    const slot = sortedEntries[0]?.airing.slot;

    if (!slot) {
      throw new Error("Slot search entry requires a slot.");
    }

    const matchedTitles = uniqueByKey(sortedEntries.map((entry) => entry.titleEntry), (entry) => entry.title.id);

    return {
      slot,
      channel: sortedEntries[0].airing.channel,
      region: sortedEntries[0].airing.region,
      matchedAirings: sortedEntries,
      matchedTitles,
      firstMatchedAiring: sortedEntries[0]?.airing ?? null,
      titleCount: matchedTitles.length,
      airingCount: sortedEntries.length,
      topGenres: topCounts(matchedTitles.flatMap((entry) => entry.title.genres), 3),
      topCompanies: topCounts(
        matchedTitles.flatMap((entry) => entry.primaryCompanies.map((company) => company.name)),
        3
      )
    };
  });
}

function sortTitleResults(entries: TitleSearchEntry[], sort: string): TitleSearchEntry[] {
  const effectiveSort = sort || getDefaultSortForView("title");
  const items = [...entries];

  if (effectiveSort === "title") {
    return items.sort((left, right) => left.title.name.localeCompare(right.title.name, "ja"));
  }

  if (effectiveSort === "airtime") {
    return items.sort((left, right) => {
      const leftTime = left.firstMatchedAiring ? new Date(left.firstMatchedAiring.broadcastStartAt).getTime() : 0;
      const rightTime = right.firstMatchedAiring ? new Date(right.firstMatchedAiring.broadcastStartAt).getTime() : 0;
      return leftTime - rightTime;
    });
  }

  if (effectiveSort === "slot") {
    return items.sort((left, right) => {
      const leftSlot = left.matchedSlots[0]?.name ?? "未分類";
      const rightSlot = right.matchedSlots[0]?.name ?? "未分類";
      return leftSlot.localeCompare(rightSlot, "ja") || left.title.name.localeCompare(right.title.name, "ja");
    });
  }

  if (effectiveSort === "matches") {
    return items.sort(
      (left, right) =>
        right.matchedAirings.length - left.matchedAirings.length ||
        left.title.name.localeCompare(right.title.name, "ja")
    );
  }

  return items.sort((left, right) => {
    if (left.title.seasonYear !== right.title.seasonYear) {
      return right.title.seasonYear - left.title.seasonYear;
    }

    if (left.title.seasonQuarter !== right.title.seasonQuarter) {
      return quarterOrder[right.title.seasonQuarter] - quarterOrder[left.title.seasonQuarter];
    }

    return left.title.name.localeCompare(right.title.name, "ja");
  });
}

function sortAiringResults(entries: AiringSearchEntry[], sort: string): AiringSearchEntry[] {
  const effectiveSort = sort || getDefaultSortForView("airing");
  const items = [...entries];

  if (effectiveSort === "airtime") {
    return items.sort((left, right) => compareByBroadcastStart(left.airing, right.airing));
  }

  if (effectiveSort === "title") {
    return items.sort((left, right) => left.title.name.localeCompare(right.title.name, "ja"));
  }

  if (effectiveSort === "channel") {
    return items.sort((left, right) => {
      return (
        left.airing.channel.name.localeCompare(right.airing.channel.name, "ja") ||
        left.title.name.localeCompare(right.title.name, "ja")
      );
    });
  }

  if (effectiveSort === "slot") {
    return items.sort((left, right) => {
      const leftSlot = left.airing.slot?.name ?? "未分類";
      const rightSlot = right.airing.slot?.name ?? "未分類";
      return leftSlot.localeCompare(rightSlot, "ja") || left.title.name.localeCompare(right.title.name, "ja");
    });
  }

  return items.sort(
    (left, right) =>
      new Date(right.airing.broadcastStartAt).getTime() - new Date(left.airing.broadcastStartAt).getTime()
  );
}

function sortSlotResults(entries: SlotSearchEntry[], sort: string): SlotSearchEntry[] {
  const effectiveSort = sort || getDefaultSortForView("slot");
  const items = [...entries];

  if (effectiveSort === "slot") {
    return items.sort((left, right) => left.slot.name.localeCompare(right.slot.name, "ja"));
  }

  if (effectiveSort === "airings") {
    return items.sort(
      (left, right) =>
        right.airingCount - left.airingCount || left.slot.name.localeCompare(right.slot.name, "ja")
    );
  }

  if (effectiveSort === "confidence") {
    return items.sort(
      (left, right) =>
        right.slot.confidence - left.slot.confidence || left.slot.name.localeCompare(right.slot.name, "ja")
    );
  }

  return items.sort(
    (left, right) => right.titleCount - left.titleCount || left.slot.name.localeCompare(right.slot.name, "ja")
  );
}

export function getSearchPageOptions(): SearchPageOptions {
  const base = getBaseSearchOptions();

  return {
    ...base,
    durations: [...durationCategories],
    pageSizes: pageSizeOptions
  };
}

export function getSearchCollections(state: SearchState): SearchCollections {
  const filteredAirings = allAiringSearchEntries.filter((entry) => matchesFilters(entry, state));
  const titleResults = sortTitleResults(buildTitleSearchEntries(filteredAirings), state.sort);
  const airingResults = sortAiringResults(filteredAirings, state.sort);
  const slotResults = sortSlotResults(buildSlotSearchEntries(filteredAirings), state.sort);

  return {
    titleResults,
    airingResults,
    slotResults,
    counts: {
      title: titleResults.length,
      airing: airingResults.length,
      slot: slotResults.length
    }
  };
}

export function paginateItems<TItem>(
  items: TItem[],
  page: number,
  pageSize: number
): PaginatedResult<TItem> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    totalItems,
    totalPages,
    page: currentPage,
    pageSize,
    startIndex,
    endIndex
  };
}
