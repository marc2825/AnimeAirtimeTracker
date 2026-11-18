/**
 * Broadcast time conventions.
 *
 * - All instants are stored as UTC `Date` objects. Japan has no DST, so JST is a fixed +09:00.
 * - "Anime time" (アニメ時刻) rolls the calendar day over at 05:00 JST, the same convention as
 *   Syoboi Calendar. Tuesday 01:30 JST is therefore "Monday 25:30".
 * - `animeMinute` = minutes since 00:00 of the anime date, in the range [300, 1740).
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const ANIME_DAY_ROLLOVER_HOUR = 5;
export const ANIME_DAY_START_MINUTE = ANIME_DAY_ROLLOVER_HOUR * 60; // 05:00
export const ANIME_DAY_END_MINUTE = ANIME_DAY_START_MINUTE + 24 * 60; // 29:00 (exclusive)
const DAY_MS = 24 * 60 * 60 * 1000;

/** 0 = Monday … 6 = Sunday (Japanese weekly programming starts on Monday). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** ISO calendar date string `YYYY-MM-DD`. */
export type IsoDate = string;

export interface AnimeTime {
  animeDate: IsoDate;
  weekday: Weekday;
  animeMinute: number;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const JST_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Parse a JST wall-clock timestamp such as `2026-11-16 25:30` is NOT accepted; only real clock time. */
export function parseJstDateTime(value: string): Date {
  const match = JST_DATETIME_RE.exec(value.trim());
  if (!match) {
    throw new RangeError(`Invalid JST datetime: ${value}`);
  }
  const [, y, mo, d, h, mi, s] = match;
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Invalid JST clock time: ${value}`);
  }
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute, second) - JST_OFFSET_MS;
  const date = new Date(utc);
  // Reject impossible calendar dates such as 2026-02-30.
  const roundTrip = toJstParts(date);
  if (roundTrip.year !== Number(y) || roundTrip.month !== Number(mo) || roundTrip.day !== Number(d)) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }
  return date;
}

export interface JstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function toJstParts(instant: Date): JstParts {
  const shifted = new Date(instant.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

function isoDateToUtcMidnight(isoDate: IsoDate): number {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match || !isIsoDate(isoDate)) {
    throw new RangeError(`Invalid ISO date: ${isoDate}`);
  }
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

export function addDays(isoDate: IsoDate, days: number): IsoDate {
  const date = new Date(isoDateToUtcMidnight(isoDate) + days * DAY_MS);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function diffDays(later: IsoDate, earlier: IsoDate): number {
  return Math.round((isoDateToUtcMidnight(later) - isoDateToUtcMidnight(earlier)) / DAY_MS);
}

export function weekdayOf(isoDate: IsoDate): Weekday {
  const sundayBased = new Date(isoDateToUtcMidnight(isoDate)).getUTCDay();
  return ((sundayBased + 6) % 7) as Weekday;
}

/** Convert an instant into the anime-day representation (05:00 rollover). */
export function toAnimeTime(instant: Date): AnimeTime {
  const parts = toJstParts(instant);
  const calendarDate = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const clockMinute = parts.hour * 60 + parts.minute;
  const rollsBack = parts.hour < ANIME_DAY_ROLLOVER_HOUR;
  const animeDate = rollsBack ? addDays(calendarDate, -1) : calendarDate;
  return {
    animeDate,
    weekday: weekdayOf(animeDate),
    animeMinute: rollsBack ? clockMinute + 24 * 60 : clockMinute
  };
}

/** Inverse of {@link toAnimeTime}: the real instant for an anime date and minute. */
export function fromAnimeTime(animeDate: IsoDate, animeMinute: number): Date {
  return new Date(isoDateToUtcMidnight(animeDate) + animeMinute * 60_000 - JST_OFFSET_MS);
}

/** Half-open instant range [start, end) covering one anime day. */
export function animeDayRange(animeDate: IsoDate): { start: Date; end: Date } {
  return {
    start: fromAnimeTime(animeDate, ANIME_DAY_START_MINUTE),
    end: fromAnimeTime(animeDate, ANIME_DAY_END_MINUTE)
  };
}

/** Monday of the anime week containing the given anime date. */
export function animeWeekStart(animeDate: IsoDate): IsoDate {
  return addDays(animeDate, -weekdayOf(animeDate));
}

export function currentAnimeDate(now: Date = new Date()): IsoDate {
  return toAnimeTime(now).animeDate;
}

/** `25:30` style label. */
export function formatAnimeMinute(animeMinute: number): string {
  const hours = Math.floor(animeMinute / 60);
  const minutes = animeMinute % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** Real JST wall clock `01:30`. */
export function formatClockTime(instant: Date): string {
  const parts = toJstParts(instant);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function formatJstDateTime(instant: Date): string {
  const p = toJstParts(instant);
  return `${p.year}/${pad2(p.month)}/${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatIsoDateJa(isoDate: IsoDate, options: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = options.withWeekday ? `(${WEEKDAY_LABELS[weekdayOf(isoDate)]})` : "";
  return options.withYear ? `${y}年${m}月${d}日${weekday}` : `${m}月${d}日${weekday}`;
}

/** `月曜 25:30` */
export function formatAnimeSlot(weekday: Weekday, animeMinute: number): string {
  return `${WEEKDAY_LABELS[weekday]}曜 ${formatAnimeMinute(animeMinute)}`;
}

export function parseWeekdayKey(value: string | undefined | null): Weekday | null {
  if (!value) return null;
  const index = WEEKDAY_KEYS.indexOf(value as WeekdayKey);
  return index >= 0 ? (index as Weekday) : null;
}

export function toIsoDate(instant: Date): IsoDate {
  const p = toJstParts(instant);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** UTC-midnight Date for storing an IsoDate in a `@db.Date` column. */
export function isoDateToDbDate(isoDate: IsoDate): Date {
  return new Date(isoDateToUtcMidnight(isoDate));
}

export function dbDateToIsoDate(value: Date): IsoDate {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

/** Syoboi query timestamp format `YYYYMMDD_HHMMSS` (JST wall clock). */
export function toSyoboiTimestamp(instant: Date): string {
  const p = toJstParts(instant);
  return `${p.year}${pad2(p.month)}${pad2(p.day)}_${pad2(p.hour)}${pad2(p.minute)}${pad2(p.second)}`;
}
