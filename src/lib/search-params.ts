/**
 * URL state parsing shared by pages. Every value is whitelisted; unknown values fall back to defaults,
 * so a hand-edited URL can never reach the database layer unvalidated.
 */
import { parseRegionKey, type RegionKey } from "@/domain/coverage";
import { parseSeasonId, type Season } from "@/domain/season";
import { isIsoDate, parseWeekdayKey, type IsoDate, type Weekday } from "@/domain/time";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function single(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" ? undefined : first;
}

export const TIME_BANDS = {
  morning: { label: "朝 5–12時", from: 5 * 60, to: 12 * 60 },
  daytime: { label: "昼 12–17時", from: 12 * 60, to: 17 * 60 },
  evening: { label: "夕方 17–19時", from: 17 * 60, to: 19 * 60 },
  prime: { label: "夜 19–23時", from: 19 * 60, to: 23 * 60 },
  late: { label: "深夜 23–25時", from: 23 * 60, to: 25 * 60 },
  latelate: { label: "深夜 25時以降", from: 25 * 60, to: 29 * 60 }
} as const;
export type TimeBand = keyof typeof TIME_BANDS;

export type RerunMode = "exclude" | "include" | "only";

export function parseTimeBand(value: string | undefined): TimeBand | null {
  return value && value in TIME_BANDS ? (value as TimeBand) : null;
}

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

export interface CommonFilters {
  season: Season | null;
  region: RegionKey | null;
  channel: string | null;
  weekday: Weekday | null;
  band: TimeBand | null;
  rerun: RerunMode;
  allKinds: boolean;
}

export function parseCommonFilters(params: RawSearchParams, defaults: { rerun: RerunMode; season: Season | null }): CommonFilters {
  const seasonParam = single(params, "season");
  return {
    season: seasonParam === "all" ? null : (parseSeasonId(seasonParam) ?? defaults.season),
    region: parseRegionKey(single(params, "region")),
    channel: parseSlug(single(params, "channel")),
    weekday: parseWeekdayKey(single(params, "day")),
    band: parseTimeBand(single(params, "time")),
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
