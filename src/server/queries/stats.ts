import { channelSlugsFor, TRACKED_CHANNELS, type NetworkKey, type RegionKey } from "@/domain/coverage";
import { computeTitlePositions } from "@/domain/slots";
import { seasonInstantRange, seasonOrdinal, type Season } from "@/domain/season";
import { channelBreakdown, concurrencyProfile, regionalDelay, seasonTrend, weekdayHourMatrix, type CountUnit, type StatAiring } from "@/domain/stats";
import { dbDateToIsoDate } from "@/domain/time";
import { inTimeBand, TIME_BANDS, type LengthKey, type RerunMode, type TimeBand } from "@/lib/search-params";

import { datasetCacheProfile } from "../cache";
import { db } from "../db";
import { airingWhere, getTrackedChannels, type AiringFilter, type ChannelInfo } from "./common";

/** Conditions shared by every figure on /stats. The time band is judged on the start time (see /about). */
export interface StatsFilter {
  /** null = every tracked channel (useful with a network across regions). */
  region: RegionKey | null;
  rerun: RerunMode;
  band: TimeBand | null;
  network: NetworkKey | null;
  channelSlug: string | null;
  length: LengthKey | null;
}

export function statsFilter(overrides: Partial<StatsFilter> = {}): StatsFilter {
  return { region: "kanto", rerun: "exclude", band: null, network: null, channelSlug: null, length: null, ...overrides };
}

const STAT_SELECT = { titleId: true, channelId: true, animeDate: true, animeWeekday: true, animeStartMinute: true, durationMinutes: true, startAt: true, episodeNumber: true } as const;

function toAiringFilter(filter: StatsFilter, extra: Pick<AiringFilter, "season" | "range">): AiringFilter {
  return { ...extra, region: filter.region, network: filter.network, channelSlug: filter.channelSlug, band: filter.band, length: filter.length, rerun: filter.rerun, allKinds: false };
}

async function loadAirings(where: AiringFilter, channels: ChannelInfo[]): Promise<StatAiring[]> {
  const rows = await db().broadcast.findMany({ where: airingWhere(where, channels), select: STAT_SELECT });
  return rows.map((row) => ({ ...row, animeDate: dbDateToIsoDate(row.animeDate) }));
}

/** Concurrency is drawn from the band start to two hours past its end (capped at 29:00), or 18:00–29:00 without a band. */
export function concurrencyWindow(band: TimeBand | null): { fromMinute: number; toMinute: number } {
  if (!band) return { fromMinute: 18 * 60, toMinute: 29 * 60 };
  return { fromMinute: TIME_BANDS[band].from, toMinute: Math.min(29 * 60, TIME_BANDS[band].to + 120) };
}

export async function getSeasonStats(season: Season, unit: CountUnit, filter: StatsFilter) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const airings = await loadAirings(toAiringFilter(filter, { season }), channels);
  const heatmap = weekdayHourMatrix(airings, unit);
  const byChannel = channelBreakdown(airings).map((row) => ({ ...row, channel: channels.find((c) => c.id === row.channelId)! }));
  // Positions come from airings that start in the band; their full length is drawn, even past the band's end.
  const positions = computeTitlePositions(airings.map((a) => ({ ...a, isRerun: false, deleted: false }))).filter((p) => p.seasonOrdinal === seasonOrdinal(season));
  const window = concurrencyWindow(filter.band);
  const concurrency = concurrencyProfile(
    positions.map((p) => ({ titleId: p.titleId, channelId: p.channelId, weekday: p.weekday, startMinute: p.startMinute, durationMinutes: p.durationMinutes })),
    { bucketMinutes: 15, ...window }
  );
  return {
    heatmap,
    byChannel,
    concurrency,
    positionCount: positions.length,
    titleCount: new Set(airings.map((a) => a.titleId)).size,
    airingCount: airings.length
  };
}

/**
 * Kansai's delay behind Kanto. The band is judged on the Kanto airing (the Kansai airing may fall outside it);
 * network and length apply to both sides; a single channel cannot be compared and is ignored.
 */
export async function getRegionalDelay(season: Season, filter: Pick<StatsFilter, "band" | "network" | "length">) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const base = { season, network: filter.network, length: filter.length, rerun: "exclude" as const, allKinds: false };
  const [kantoAll, kansai] = await Promise.all([loadAirings({ ...base, region: "kanto" }, channels), loadAirings({ ...base, region: "kansai" }, channels)]);
  // NHK is receivable in both regions; comparing it with itself would only add zero-delay noise.
  const nhk = new Set(channels.filter((c) => c.slug.startsWith("nhk-")).map((c) => c.id));
  const east = kantoAll.filter((a) => !nhk.has(a.channelId));
  const west = kansai.filter((a) => !nhk.has(a.channelId));
  const band = filter.band;
  const eastInBand = band ? east.filter((a) => inTimeBand(a.animeStartMinute, band)) : east;
  const result = regionalDelay(eastInBand, west);
  // "Kansai only" = titles starting in the band in Kansai that Kanto did not air at all.
  const eastTitles = new Set(east.map((a) => a.titleId));
  const westInBand = band ? west.filter((a) => inTimeBand(a.animeStartMinute, band)) : west;
  const kansaiOnly = new Set(westInBand.filter((a) => !eastTitles.has(a.titleId)).map((a) => a.titleId)).size;
  const titleIds = result.compared.map((c) => c.titleId);
  const titles = titleIds.length ? await db().title.findMany({ where: { id: { in: titleIds } }, select: { id: true, slug: true, name: true } }) : [];
  const byId = new Map(titles.map((t) => [t.id, t]));
  return {
    ...result,
    kansaiOnly,
    examples: [...result.compared]
      .sort((a, b) => b.delayMinutes - a.delayMinutes)
      .slice(0, 8)
      .map((c) => ({ ...c, slug: byId.get(c.titleId)?.slug ?? "", name: byId.get(c.titleId)?.name ?? "" }))
  };
}

/** Five ordered start-time groups for the trend (morning and daytime are merged: few titles, and 5 sequential steps stay distinguishable). */
export const TREND_BANDS = [
  { key: "day", label: "5–17時", from: TIME_BANDS.morning.from, to: TIME_BANDS.daytime.to },
  { key: "evening", label: "夕方 17–19時", from: TIME_BANDS.evening.from, to: TIME_BANDS.evening.to },
  { key: "prime", label: "夜 19–23時", from: TIME_BANDS.prime.from, to: TIME_BANDS.prime.to },
  { key: "late", label: "深夜 23–25時", from: TIME_BANDS.late.from, to: TIME_BANDS.late.to },
  { key: "latelate", label: "25時以降", from: TIME_BANDS.latelate.from, to: TIME_BANDS.latelate.to }
] as const;

export async function getSeasonTrend(filter: StatsFilter, from: Season, to: Season) {
  "use cache";
  datasetCacheProfile();
  const channels = await getTrackedChannels();
  const range = { start: seasonInstantRange(from).start, end: seasonInstantRange(to).end };
  // Only the three columns the trend needs: this query spans every covered season.
  const rows = await db().broadcast.findMany({
    where: airingWhere(toAiringFilter(filter, { range }), channels),
    select: { titleId: true, animeDate: true, animeStartMinute: true }
  });
  return seasonTrend(
    rows.map((row) => ({ ...row, animeDate: dbDateToIsoDate(row.animeDate) })),
    TREND_BANDS
  );
}

/** Channel names in scope, for the scope line under every figure. */
export function scopeChannelNames(filter: Pick<StatsFilter, "region" | "network" | "channelSlug">): string {
  const slugs = filter.channelSlug ? new Set([filter.channelSlug]) : channelSlugsFor(filter.region, filter.network);
  return TRACKED_CHANNELS.filter((c) => !slugs || slugs.has(c.slug))
    .map((c) => c.shortName)
    .join("・");
}
