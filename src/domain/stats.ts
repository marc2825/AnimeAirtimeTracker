/**
 * Programming statistics. Pure functions over already-scoped airings (the caller applies season,
 * region, category and rerun filters and must disclose them next to every figure).
 *
 * Counting units (never mixed):
 * - 作品本数 (titles): distinct Syoboi titles. A title that aired in two cells is counted in both cells.
 * - 放送件数 (broadcasts): individual airing events.
 * - 同時放送数 (concurrency): regular title positions whose [start, end) overlaps a time bucket.
 */
import { seasonOfAnimeDate, seasonOrdinal } from "./season";
import { ANIME_DAY_END_MINUTE, ANIME_DAY_START_MINUTE, type IsoDate } from "./time";

export interface StatAiring {
  titleId: number;
  channelId: number;
  animeDate: IsoDate;
  animeWeekday: number;
  animeStartMinute: number;
  durationMinutes: number;
  startAt: Date;
  episodeNumber: number | null;
}

export type CountUnit = "titles" | "broadcasts";

/** Hour rows of the anime day: 5 … 28 (05:00 – 28:59). */
export const ANIME_HOURS = Array.from({ length: 24 }, (_, index) => index + 5);

export interface WeekdayHourMatrix {
  /** cells[weekday][hourIndex], hourIndex 0 = 05:00 */
  cells: number[][];
  max: number;
  /** Distinct titles (unit=titles) or airings (unit=broadcasts) in scope. */
  total: number;
}

export function weekdayHourMatrix(airings: StatAiring[], unit: CountUnit): WeekdayHourMatrix {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const seen = new Set<string>();
  for (const airing of airings) {
    const hourIndex = Math.floor(airing.animeStartMinute / 60) - 5;
    if (hourIndex < 0 || hourIndex > 23 || airing.animeWeekday < 0 || airing.animeWeekday > 6) continue;
    if (unit === "titles") {
      const key = `${airing.titleId}|${airing.animeWeekday}|${hourIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    cells[airing.animeWeekday]![hourIndex]! += 1;
  }
  const total = unit === "titles" ? new Set(airings.map((a) => a.titleId)).size : airings.length;
  return { cells, max: Math.max(0, ...cells.flat()), total };
}

export interface SeasonTrendRow {
  seasonOrdinal: number;
  titles: number;
  broadcasts: number;
  /** Titles whose earliest in-scope airing falls in this season. */
  newTitles: number;
  /** Share (0–1) of the season's titles whose modal start time is 24:00 or later. */
  lateNightShare: number;
}

export function seasonTrend(airings: StatAiring[]): SeasonTrendRow[] {
  const bySeason = new Map<number, StatAiring[]>();
  const firstSeasonOfTitle = new Map<number, number>();
  for (const airing of airings) {
    const ordinal = seasonOrdinal(seasonOfAnimeDate(airing.animeDate));
    const list = bySeason.get(ordinal);
    if (list) list.push(airing);
    else bySeason.set(ordinal, [airing]);
    const first = firstSeasonOfTitle.get(airing.titleId);
    if (first === undefined || ordinal < first) firstSeasonOfTitle.set(airing.titleId, ordinal);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ordinal, list]) => {
      const titleStarts = new Map<number, Map<number, number>>();
      for (const airing of list) {
        const counts = titleStarts.get(airing.titleId) ?? new Map<number, number>();
        counts.set(airing.animeStartMinute, (counts.get(airing.animeStartMinute) ?? 0) + 1);
        titleStarts.set(airing.titleId, counts);
      }
      let late = 0;
      for (const counts of titleStarts.values()) {
        const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
        if (modal >= 24 * 60) late += 1;
      }
      const titles = titleStarts.size;
      return {
        seasonOrdinal: ordinal,
        titles,
        broadcasts: list.length,
        newTitles: [...titleStarts.keys()].filter((id) => firstSeasonOfTitle.get(id) === ordinal).length,
        lateNightShare: titles === 0 ? 0 : late / titles
      };
    });
}

export interface ChannelRow {
  channelId: number;
  titles: number;
  broadcasts: number;
}

export function channelBreakdown(airings: StatAiring[]): ChannelRow[] {
  const map = new Map<number, { titles: Set<number>; broadcasts: number }>();
  for (const airing of airings) {
    const entry = map.get(airing.channelId) ?? { titles: new Set<number>(), broadcasts: 0 };
    entry.titles.add(airing.titleId);
    entry.broadcasts += 1;
    map.set(airing.channelId, entry);
  }
  return [...map.entries()]
    .map(([channelId, entry]) => ({ channelId, titles: entry.titles.size, broadcasts: entry.broadcasts }))
    .sort((a, b) => b.titles - a.titles || b.broadcasts - a.broadcasts || a.channelId - b.channelId);
}

export interface Position {
  titleId: number;
  channelId: number;
  weekday: number;
  startMinute: number;
  durationMinutes: number;
}

export interface ConcurrencyProfile {
  bucketMinutes: number;
  /** First bucket start (anime minute). */
  fromMinute: number;
  /** counts[weekday][bucketIndex] */
  counts: number[][];
  peak: { count: number; weekday: number; minute: number } | null;
}

/** Regular positions overlapping each bucket, using half-open intervals [start, start+duration). */
export function concurrencyProfile(
  positions: Position[],
  options: { bucketMinutes?: number; fromMinute?: number; toMinute?: number } = {}
): ConcurrencyProfile {
  const bucketMinutes = options.bucketMinutes ?? 15;
  const fromMinute = options.fromMinute ?? ANIME_DAY_START_MINUTE;
  const toMinute = options.toMinute ?? ANIME_DAY_END_MINUTE;
  const bucketCount = Math.ceil((toMinute - fromMinute) / bucketMinutes);
  const counts = Array.from({ length: 7 }, () => Array<number>(bucketCount).fill(0));
  for (const position of positions) {
    const start = position.startMinute;
    const end = start + Math.max(1, position.durationMinutes);
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const bucketStart = fromMinute + bucket * bucketMinutes;
      const bucketEnd = bucketStart + bucketMinutes;
      if (start < bucketEnd && bucketStart < end) counts[position.weekday]![bucket]! += 1;
    }
  }
  let peak: ConcurrencyProfile["peak"] = null;
  counts.forEach((row, weekday) =>
    row.forEach((count, bucket) => {
      if (count > 0 && (!peak || count > peak.count)) peak = { count, weekday, minute: fromMinute + bucket * bucketMinutes };
    })
  );
  return { bucketMinutes, fromMinute, counts, peak };
}

export type DelayBucket = "kansai-earlier" | "same-time" | "within-day" | "within-week" | "over-week";

export const DELAY_BUCKETS: { key: DelayBucket; label: string }[] = [
  { key: "kansai-earlier", label: "関西が3時間以上先行" },
  { key: "same-time", label: "ほぼ同時（±3時間）" },
  { key: "within-day", label: "関西が3〜24時間遅れ" },
  { key: "within-week", label: "関西が1〜7日遅れ" },
  { key: "over-week", label: "関西が7日超遅れ" }
];

export function delayBucket(delayMinutes: number): DelayBucket {
  if (delayMinutes < -180) return "kansai-earlier";
  if (delayMinutes <= 180) return "same-time";
  if (delayMinutes <= 24 * 60) return "within-day";
  if (delayMinutes <= 7 * 24 * 60) return "within-week";
  return "over-week";
}

export interface RegionalDelayResult {
  /** Titles with ≥1 matching episode number in both regions. */
  compared: { titleId: number; delayMinutes: number; episodes: number }[];
  buckets: Record<DelayBucket, number>;
  kantoOnly: number;
  kansaiOnly: number;
  unmatched: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/**
 * Kanto vs Kansai timing per title: for every episode number aired in both regions, take the earliest
 * airing in each region; the title's delay is the median of (Kansai − Kanto) across those episodes.
 * Airings without an episode number are ignored for matching.
 */
export function regionalDelay(kanto: StatAiring[], kansai: StatAiring[]): RegionalDelayResult {
  const earliest = (airings: StatAiring[]) => {
    const map = new Map<number, Map<number, number>>();
    for (const airing of airings) {
      if (airing.episodeNumber === null) {
        if (!map.has(airing.titleId)) map.set(airing.titleId, new Map());
        continue;
      }
      const episodes = map.get(airing.titleId) ?? new Map<number, number>();
      const current = episodes.get(airing.episodeNumber);
      const time = airing.startAt.getTime();
      if (current === undefined || time < current) episodes.set(airing.episodeNumber, time);
      map.set(airing.titleId, episodes);
    }
    return map;
  };
  const east = earliest(kanto);
  const west = earliest(kansai);
  const buckets: Record<DelayBucket, number> = { "kansai-earlier": 0, "same-time": 0, "within-day": 0, "within-week": 0, "over-week": 0 };
  const compared: RegionalDelayResult["compared"] = [];
  let unmatched = 0;
  for (const [titleId, eastEpisodes] of east) {
    const westEpisodes = west.get(titleId);
    if (!westEpisodes) continue;
    const deltas: number[] = [];
    for (const [episode, eastTime] of eastEpisodes) {
      const westTime = westEpisodes.get(episode);
      if (westTime !== undefined) deltas.push(Math.round((westTime - eastTime) / 60_000));
    }
    if (deltas.length === 0) {
      unmatched += 1;
      continue;
    }
    const delayMinutes = median(deltas);
    compared.push({ titleId, delayMinutes, episodes: deltas.length });
    buckets[delayBucket(delayMinutes)] += 1;
  }
  return {
    compared: compared.sort((a, b) => a.titleId - b.titleId),
    buckets,
    kantoOnly: [...east.keys()].filter((id) => !west.has(id)).length,
    kansaiOnly: [...west.keys()].filter((id) => !east.has(id)).length,
    unmatched
  };
}
