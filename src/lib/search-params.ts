/**
 * URL state parsing shared by pages. Every value is whitelisted; unknown values fall back to defaults,
 * so a hand-edited URL can never reach the database layer unvalidated.
 */
import { parseNetworkKey, parseRegionKey, type NetworkKey, type RegionKey } from "@/domain/coverage";
import { parseSeasonId, type Season } from "@/domain/season";
import { isIsoDate, parseWeekdayKey, type IsoDate, type Weekday } from "@/domain/time";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function single(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" ? undefined : first;
}

/**
 * Start-time presets on the anime clock (the day runs 05:00–29:00). Each band is half-open [from, to) and an
 * airing belongs to a band by its start minute only. Bands may overlap (latenight covers late, aftermidnight
 * and latelate); they are filters, not a partition. Object order is the order shown in selects.
 */
export const TIME_BANDS = {
  morning: { name: "朝", label: "朝 5–12時", from: 5 * 60, to: 12 * 60 },
  daytime: { name: "昼", label: "昼 12–17時", from: 12 * 60, to: 17 * 60 },
  evening: { name: "夕方", label: "夕方 17–19時", from: 17 * 60, to: 19 * 60 },
  prime: { name: "夜", label: "夜 19–23時", from: 19 * 60, to: 23 * 60 },
  latenight: { name: "深夜アニメ", label: "深夜アニメ 23–29時", from: 23 * 60, to: 29 * 60 },
  late: { name: "深夜", label: "深夜 23–25時", from: 23 * 60, to: 25 * 60 },
  aftermidnight: { name: "24時以降", label: "24時以降", from: 24 * 60, to: 29 * 60 },
  latelate: { name: "25時以降", label: "25時以降", from: 25 * 60, to: 29 * 60 }
} as const;
export type TimeBand = keyof typeof TIME_BANDS;

export type RerunMode = "exclude" | "include" | "only";

/** Own keys only: `value in TIME_BANDS` would also accept "constructor", "toString", … */
export function parseTimeBand(value: string | undefined): TimeBand | null {
  return value && Object.hasOwn(TIME_BANDS, value) ? (value as TimeBand) : null;
}

/** Whether an airing starting at `animeStartMinute` falls in the band. The DB filters use the same bounds. */
export function inTimeBand(animeStartMinute: number, band: TimeBand): boolean {
  const { from, to } = TIME_BANDS[band];
  return animeStartMinute >= from && animeStartMinute < to;
}

export const TIME_BAND_OPTIONS = [{ value: "", label: "すべて" }, ...Object.entries(TIME_BANDS).map(([value, band]) => ({ value, label: band.label }))];

/** Airing length presets on durationMinutes, half-open [min, max). */
export const LENGTHS = {
  short: { label: "短編（15分以下）", min: 0, max: 16 },
  standard: { label: "30分前後（16〜45分）", min: 16, max: 46 },
  long: { label: "長尺（46分以上）", min: 46, max: null }
} as const satisfies Record<string, { label: string; min: number; max: number | null }>;
export type LengthKey = keyof typeof LENGTHS;

export function parseLength(value: string | undefined): LengthKey | null {
  return value && Object.hasOwn(LENGTHS, value) ? (value as LengthKey) : null;
}

export function inLength(durationMinutes: number, key: LengthKey): boolean {
  const { min, max } = LENGTHS[key];
  return durationMinutes >= min && (max === null || durationMinutes < max);
}

export const LENGTH_OPTIONS = [{ value: "", label: "すべて" }, ...Object.entries(LENGTHS).map(([value, length]) => ({ value, label: length.label }))];

export function parseRerunMode(value: string | undefined, fallback: RerunMode): RerunMode {
  return value === "exclude" || value === "include" || value === "only" ? value : fallback;
}

export function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

export function parseSlug(value: string | undefined): string | null {
  return value && /^[a-z0-9-]{1,40}$/.test(value) ? value : null;
}

export function parseIsoDateParam(value: string | undefined): IsoDate | null {
  return value && isIsoDate(value) ? value : null;
}

export function parseQuery(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().slice(0, 80);
}

/** `%query%` for ILIKE with the query's own `%`, `_` and `\` taken literally (PostgreSQL's default escape is `\`). */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export interface CommonFilters {
  season: Season | null;
  region: RegionKey | null;
  network: NetworkKey | null;
  channel: string | null;
  weekday: Weekday | null;
  band: TimeBand | null;
  length: LengthKey | null;
  rerun: RerunMode;
  allKinds: boolean;
}

export function parseCommonFilters(params: RawSearchParams, defaults: { rerun: RerunMode; season: Season | null }): CommonFilters {
  const seasonParam = single(params, "season");
  return {
    season: seasonParam === "all" ? null : (parseSeasonId(seasonParam) ?? defaults.season),
    region: parseRegionKey(single(params, "region")),
    network: parseNetworkKey(single(params, "network")),
    channel: parseSlug(single(params, "channel")),
    weekday: parseWeekdayKey(single(params, "day")),
    band: parseTimeBand(single(params, "time")),
    length: parseLength(single(params, "length")),
    rerun: parseRerunMode(single(params, "rerun"), defaults.rerun),
    allKinds: single(params, "kind") === "all"
  };
}

/** Build a URL keeping current params, applying overrides; `null`/"" removes a key. Page resets unless set. */
export function buildHref(pathname: string, current: Record<string, string | undefined>, overrides: Record<string, string | null | undefined>): string {
  const next = new URLSearchParams();
  const merged: Record<string, string | null | undefined> = { ...current, page: undefined, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== "") next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function flattenParams(params: RawSearchParams): Record<string, string | undefined> {
  return Object.fromEntries(Object.keys(params).map((key) => [key, single(params, key)]));
}
