import { addDays, animeDayRange, fromAnimeTime, ANIME_DAY_START_MINUTE, type IsoDate, toAnimeTime } from "./time";

/**
 * A TV "cour" season. Quarter 1 = 冬 (Jan–Mar), 2 = 春 (Apr–Jun), 3 = 夏 (Jul–Sep), 4 = 秋 (Oct–Dec).
 * Season membership is decided by the **anime date** (05:00 rollover), so 12/31 25:00 is still autumn.
 */
export interface Season {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export const QUARTER_KEYS = ["winter", "spring", "summer", "autumn"] as const;
export const QUARTER_LABELS = ["冬", "春", "夏", "秋"] as const;

export function seasonOfAnimeDate(animeDate: IsoDate): Season {
  const [year, month] = animeDate.split("-").map(Number) as [number, number];
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as Season["quarter"] };
}

export function seasonOfInstant(instant: Date): Season {
  return seasonOfAnimeDate(toAnimeTime(instant).animeDate);
}

export function currentSeason(now: Date = new Date()): Season {
  return seasonOfInstant(now);
}

/** URL-friendly id: `2026-autumn`. */
export function seasonId(season: Season): string {
  return `${season.year}-${QUARTER_KEYS[season.quarter - 1]}`;
}

/** Sortable numeric key, e.g. 2026-autumn → 20264. */
export function seasonOrdinal(season: Season): number {
  return season.year * 10 + season.quarter;
}

export function seasonFromOrdinal(ordinal: number): Season {
  return { year: Math.floor(ordinal / 10), quarter: (ordinal % 10) as Season["quarter"] };
}

export function parseSeasonId(value: string | undefined | null): Season | null {
  if (!value) return null;
  const match = /^(\d{4})-(winter|spring|summer|autumn)$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1960 || year > 2100) return null;
  return { year, quarter: (QUARTER_KEYS.indexOf(match[2] as (typeof QUARTER_KEYS)[number]) + 1) as Season["quarter"] };
}

export function formatSeason(season: Season): string {
  return `${season.year}年${QUARTER_LABELS[season.quarter - 1]}`;
}

export function shiftSeason(season: Season, delta: number): Season {
  const index = season.year * 4 + (season.quarter - 1) + delta;
  return { year: Math.floor(index / 4), quarter: ((index % 4) + 1) as Season["quarter"] };
}

export function compareSeasons(left: Season, right: Season): number {
  return seasonOrdinal(left) - seasonOrdinal(right);
}

/** Inclusive list of seasons from `from` to `to`. */
export function seasonsBetween(from: Season, to: Season): Season[] {
  const result: Season[] = [];
  for (let s = from; compareSeasons(s, to) <= 0; s = shiftSeason(s, 1)) {
    result.push(s);
  }
  return result;
}

/** First and last anime date of the season (inclusive). */
export function seasonDateRange(season: Season): { first: IsoDate; last: IsoDate } {
  const startMonth = (season.quarter - 1) * 3 + 1;
  const first = `${season.year}-${String(startMonth).padStart(2, "0")}-01`;
  const next = shiftSeason(season, 1);
  const nextFirst = `${next.year}-${String((next.quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(nextFirst, -1) };
}

/** Half-open instant range [start, end) covering the whole season in anime time. */
export function seasonInstantRange(season: Season): { start: Date; end: Date } {
  const { first, last } = seasonDateRange(season);
  return { start: fromAnimeTime(first, ANIME_DAY_START_MINUTE), end: animeDayRange(last).end };
}

export function isSameSeason(left: Season, right: Season): boolean {
  return left.year === right.year && left.quarter === right.quarter;
}
