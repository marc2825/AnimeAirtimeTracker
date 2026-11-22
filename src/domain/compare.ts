/**
 * Comparing two sides (a region or a single channel) and comparing slots. Pure rules; the queries live in
 * src/server/queries/compare.ts.
 */
import { channelsInRegion, parseRegionKey, REGIONS, TRACKED_CHANNELS, type RegionKey } from "./coverage";
import type { DelayBucket, RegionalDelayResult } from "./stats";

export type CompareSide = { kind: "region"; key: RegionKey } | { kind: "channel"; slug: string };

export const DEFAULT_SIDES: [CompareSide, CompareSide] = [
  { kind: "channel", slug: "mx" },
  { kind: "channel", slug: "bs11" }
];

/** `kanto` … `cs` are regions; any tracked channel slug is a channel. */
export function parseCompareSide(value: string | undefined | null): CompareSide | null {
  const region = parseRegionKey(value);
  if (region) return { kind: "region", key: region };
  return value && TRACKED_CHANNELS.some((channel) => channel.slug === value) ? { kind: "channel", slug: value } : null;
}

export function sideParam(side: CompareSide): string {
  return side.kind === "region" ? side.key : side.slug;
}

export function sideLabel(side: CompareSide): string {
  return side.kind === "region" ? REGIONS[side.key].label : (TRACKED_CHANNELS.find((c) => c.slug === side.slug)?.name ?? side.slug);
}

export function sideChannelSlugs(side: CompareSide): string[] {
  return side.kind === "region" ? channelsInRegion(side.key).map((c) => c.slug) : [side.slug];
}

/** Channels on both sides (e.g. NHK in Kanto and Kansai): left out of the overlap and timing comparison. */
export function sharedChannelSlugs(a: CompareSide, b: CompareSide): string[] {
  const bSlugs = new Set(sideChannelSlugs(b));
  return sideChannelSlugs(a).filter((slug) => bSlugs.has(slug));
}

/** Delay buckets worded for two named sides (the stats page words them for Kanto → Kansai). */
export function delayBucketLabels(bName: string): { key: DelayBucket; label: string }[] {
  return [
    { key: "kansai-earlier", label: `${bName}が3時間以上先` },
    { key: "same-time", label: "ほぼ同時（±3時間）" },
    { key: "within-day", label: `${bName}が3〜24時間後` },
    { key: "within-week", label: `${bName}が1〜7日後` },
    { key: "over-week", label: `${bName}が7日超後` }
  ];
}

export interface Overlap {
  /** Titles aired on both sides (first-run airings, shared channels left out). */
  both: number;
  onlyA: number;
  onlyB: number;
  /** Titles on both sides with at least one episode number aired on both (the timing comparison). */
  timed: number;
  /** Median of the per-title delays (B − A, minutes), or null when nothing could be timed. */
  medianDelay: number | null;
}

export function overlapOf(result: RegionalDelayResult): Overlap {
  const delays = result.compared.map((c) => c.delayMinutes).sort((x, y) => x - y);
  const middle = Math.floor(delays.length / 2);
  const medianDelay = delays.length === 0 ? null : delays.length % 2 === 1 ? delays[middle]! : Math.round((delays[middle - 1]! + delays[middle]!) / 2);
  return { both: result.compared.length + result.unmatched, onlyA: result.kantoOnly, onlyB: result.kansaiOnly, timed: result.compared.length, medianDelay };
}

// ---- Slots ----------------------------------------------------------------------------------------

export interface SlotSeasonPosition {
  ordinal: number;
  position: { weekday: number; minute: number; durationMinutes: number } | null;
  titles: number;
  moved: boolean;
}

export interface SlotForCompare {
  slug: string;
  timeline: SlotSeasonPosition[];
}

export interface SlotCompareSummary {
  slug: string;
  /** Seasons with a regular position. */
  seasons: number;
  firstOrdinal: number | null;
  lastOrdinal: number | null;
  /** Changes of start weekday/time between seasons with a position. */
  moves: number;
  /** Mean of the per-season block length, minutes (null without positions). */
  averageDuration: number | null;
  /** Mean titles per season with a position. */
  titlesPerSeason: number | null;
}

export function summarizeSlot(slot: SlotForCompare): SlotCompareSummary {
  const active = slot.timeline.filter((season) => season.position);
  const durations = active.map((season) => season.position!.durationMinutes);
  return {
    slug: slot.slug,
    seasons: active.length,
    firstOrdinal: active[0]?.ordinal ?? null,
    lastOrdinal: active.at(-1)?.ordinal ?? null,
    moves: slot.timeline.filter((season) => season.moved).length,
    averageDuration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    titlesPerSeason: active.length ? active.reduce((sum, season) => sum + season.titles, 0) / active.length : null
  };
}

/**
 * One row per season from the earliest to the latest season of any slot, with each slot's position (or null)
 * in the given slot order. Seasons where no slot has a position are kept, so gaps stay visible.
 */
export function alignSeasons(slots: SlotForCompare[]): { ordinal: number; cells: (SlotSeasonPosition | null)[] }[] {
  const ordinals = slots.flatMap((slot) => slot.timeline.filter((s) => s.position).map((s) => s.ordinal));
  if (ordinals.length === 0) return [];
  const toIndex = (ordinal: number) => Math.floor(ordinal / 10) * 4 + (ordinal % 10) - 1;
  const fromIndex = (index: number) => Math.floor(index / 4) * 10 + (index % 4) + 1;
  const rows: { ordinal: number; cells: (SlotSeasonPosition | null)[] }[] = [];
  for (let index = toIndex(Math.min(...ordinals)); index <= toIndex(Math.max(...ordinals)); index += 1) {
    const ordinal = fromIndex(index);
    rows.push({ ordinal, cells: slots.map((slot) => slot.timeline.find((s) => s.ordinal === ordinal && s.position) ?? null) });
  }
  return rows;
}
