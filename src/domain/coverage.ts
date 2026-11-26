/**
 * Coverage definition: the bounded set of channels this site ingests and analyses.
 * Changing this list changes what users see — update docs/data-sources.md and the /about page copy with it.
 *
 * Geographic area and broadcast medium are separate axes:
 * - `medium`: physical distribution (terrestrial / BS / CS)
 * - `area`: where a terrestrial channel is receivable. NHK and satellite channels are NATIONWIDE.
 */

export type Medium = "TERRESTRIAL" | "BS" | "CS";
export type Area = "NATIONWIDE" | "KANTO" | "KANSAI";
export type Network = "NHK" | "NTV" | "TBS" | "CX" | "EX" | "TX" | "INDEPENDENT" | "SATELLITE";

export interface TrackedChannel {
  /** Syoboi ChID */
  syoboiId: number;
  slug: string;
  name: string;
  shortName: string;
  medium: Medium;
  area: Area;
  network: Network;
  sortOrder: number;
}

export const TRACKED_CHANNELS: readonly TrackedChannel[] = [
  { syoboiId: 1, slug: "nhk-g", name: "NHK総合", shortName: "NHK総合", medium: "TERRESTRIAL", area: "NATIONWIDE", network: "NHK", sortOrder: 10 },
  { syoboiId: 2, slug: "nhk-e", name: "NHK Eテレ", shortName: "Eテレ", medium: "TERRESTRIAL", area: "NATIONWIDE", network: "NHK", sortOrder: 11 },
  { syoboiId: 4, slug: "ntv", name: "日本テレビ", shortName: "日テレ", medium: "TERRESTRIAL", area: "KANTO", network: "NTV", sortOrder: 20 },
  { syoboiId: 5, slug: "tbs", name: "TBS", shortName: "TBS", medium: "TERRESTRIAL", area: "KANTO", network: "TBS", sortOrder: 21 },
  { syoboiId: 3, slug: "cx", name: "フジテレビ", shortName: "フジ", medium: "TERRESTRIAL", area: "KANTO", network: "CX", sortOrder: 22 },
  { syoboiId: 6, slug: "ex", name: "テレビ朝日", shortName: "テレ朝", medium: "TERRESTRIAL", area: "KANTO", network: "EX", sortOrder: 23 },
  { syoboiId: 7, slug: "tx", name: "テレビ東京", shortName: "テレ東", medium: "TERRESTRIAL", area: "KANTO", network: "TX", sortOrder: 24 },
  { syoboiId: 19, slug: "mx", name: "TOKYO MX", shortName: "MX", medium: "TERRESTRIAL", area: "KANTO", network: "INDEPENDENT", sortOrder: 25 },
  { syoboiId: 48, slug: "mbs", name: "MBS毎日放送", shortName: "MBS", medium: "TERRESTRIAL", area: "KANSAI", network: "TBS", sortOrder: 30 },
  { syoboiId: 67, slug: "abc", name: "ABCテレビ", shortName: "ABC", medium: "TERRESTRIAL", area: "KANSAI", network: "EX", sortOrder: 31 },
  { syoboiId: 54, slug: "ytv", name: "読売テレビ", shortName: "ytv", medium: "TERRESTRIAL", area: "KANSAI", network: "NTV", sortOrder: 32 },
  { syoboiId: 70, slug: "ktv", name: "関西テレビ", shortName: "カンテレ", medium: "TERRESTRIAL", area: "KANSAI", network: "CX", sortOrder: 33 },
  { syoboiId: 28, slug: "tvo", name: "テレビ大阪", shortName: "テレ大", medium: "TERRESTRIAL", area: "KANSAI", network: "TX", sortOrder: 34 },
  { syoboiId: 128, slug: "bs11", name: "BS11", shortName: "BS11", medium: "BS", area: "NATIONWIDE", network: "SATELLITE", sortOrder: 40 },
  { syoboiId: 71, slug: "bs-ntv", name: "BS日テレ", shortName: "BS日テレ", medium: "BS", area: "NATIONWIDE", network: "NTV", sortOrder: 41 },
  { syoboiId: 16, slug: "bs-tbs", name: "BS-TBS", shortName: "BS-TBS", medium: "BS", area: "NATIONWIDE", network: "TBS", sortOrder: 42 },
  { syoboiId: 17, slug: "bs-fuji", name: "BSフジ", shortName: "BSフジ", medium: "BS", area: "NATIONWIDE", network: "CX", sortOrder: 43 },
  { syoboiId: 18, slug: "bs-asahi", name: "BS朝日", shortName: "BS朝日", medium: "BS", area: "NATIONWIDE", network: "EX", sortOrder: 44 },
  { syoboiId: 15, slug: "bs-tx", name: "BSテレ東", shortName: "BSテレ東", medium: "BS", area: "NATIONWIDE", network: "TX", sortOrder: 45 },
  { syoboiId: 20, slug: "at-x", name: "AT-X", shortName: "AT-X", medium: "CS", area: "NATIONWIDE", network: "SATELLITE", sortOrder: 50 }
];

/** The station lists that lead with Tokyo start with this one. */
export const LEAD_CHANNEL_SLUG = "mx";

/** Tokyo stations: the Kanto terrestrial channels based in Tokyo (TOKYO MX and the five key stations). */
export function isTokyoChannel(slug: string): boolean {
  return TRACKED_CHANNELS.some((channel) => channel.slug === slug && channel.area === "KANTO");
}

/**
 * Sort key for station lists that lead with Tokyo: TOKYO MX, then the other Tokyo stations, then every other channel,
 * each part in the usual channel order (sortOrder). Unknown channels come last.
 */
export function tokyoFirstRank(slug: string | null | undefined): number {
  const channel = TRACKED_CHANNELS.find((entry) => entry.slug === slug);
  if (!channel) return 100_000;
  if (channel.slug === LEAD_CHANNEL_SLUG) return 0;
  return (isTokyoChannel(channel.slug) ? 1_000 : 10_000) + channel.sortOrder;
}

/**
 * Viewing regions used for filters and statistics. A region is a set of channels a viewer
 * in that place can receive, so NHK appears in both Kanto and Kansai.
 */
export const REGIONS = {
  kanto: { label: "関東地上波", short: "関東", description: "NHK総合・Eテレ・在京キー局5局・TOKYO MX" },
  kansai: { label: "関西地上波", short: "関西", description: "NHK総合・Eテレ・在阪5局" },
  bs: { label: "BS", short: "BS", description: "BS11・BS民放キー局系5局" },
  cs: { label: "CS", short: "CS", description: "AT-X" }
} as const;

export type RegionKey = keyof typeof REGIONS;
export const REGION_KEYS = Object.keys(REGIONS) as RegionKey[];

export function channelsInRegion(region: RegionKey): TrackedChannel[] {
  return TRACKED_CHANNELS.filter((channel) => {
    switch (region) {
      case "kanto":
        return channel.medium === "TERRESTRIAL" && (channel.area === "KANTO" || channel.area === "NATIONWIDE");
      case "kansai":
        return channel.medium === "TERRESTRIAL" && (channel.area === "KANSAI" || channel.area === "NATIONWIDE");
      case "bs":
        return channel.medium === "BS";
      case "cs":
        return channel.medium === "CS";
    }
  });
}

export function parseRegionKey(value: string | undefined | null): RegionKey | null {
  return value && (REGION_KEYS as string[]).includes(value) ? (value as RegionKey) : null;
}

/**
 * Syoboi Calendar's records thin out before this year: 2002 and earlier cover only three or four of the tracked
 * channels and 2003–2005 are partial. Counts for earlier seasons understate real programming.
 */
/** The earliest season the site holds (backfilled history starts here). Earlier seasons are out of scope. */
export const FIRST_SEASON = { year: 2000, quarter: 1 } as const;

export const SOURCE_COMPLETE_FROM_YEAR = 2006;
export const SPARSE_SOURCE_NOTE = `${SOURCE_COMPLETE_FROM_YEAR - 1}年以前は出典の登録が少なく、本数は実際より少なく出ます（2002年以前は数局分のみ）。`;

/**
 * Network (系列) filters. A network spans regions and media: 日本テレビ系 is 日本テレビ, 読売テレビ and BS日テレ.
 * Combined with a region, the filter is the intersection (BS + 日テレ系 = BS日テレ).
 */
export const NETWORKS = {
  nhk: { label: "NHK", networks: ["NHK"] },
  ntv: { label: "日本テレビ系", networks: ["NTV"] },
  tbs: { label: "TBS系", networks: ["TBS"] },
  cx: { label: "フジテレビ系", networks: ["CX"] },
  ex: { label: "テレビ朝日系", networks: ["EX"] },
  tx: { label: "テレビ東京系", networks: ["TX"] },
  independent: { label: "独立局（MX・BS11・AT-X）", networks: ["INDEPENDENT", "SATELLITE"] }
} as const satisfies Record<string, { label: string; networks: readonly Network[] }>;

export type NetworkKey = keyof typeof NETWORKS;
export const NETWORK_KEYS = Object.keys(NETWORKS) as NetworkKey[];

export function channelsInNetwork(key: NetworkKey): TrackedChannel[] {
  const networks: readonly Network[] = NETWORKS[key].networks;
  return TRACKED_CHANNELS.filter((channel) => networks.includes(channel.network));
}

export function parseNetworkKey(value: string | undefined | null): NetworkKey | null {
  return value && (NETWORK_KEYS as string[]).includes(value) ? (value as NetworkKey) : null;
}

/** "日本テレビ系", "独立局", … for a channel. */
export function networkLabelOf(channel: TrackedChannel): string {
  const key = NETWORK_KEYS.find((candidate) => (NETWORKS[candidate].networks as readonly Network[]).includes(channel.network));
  return key === "independent" ? "独立局" : key ? NETWORKS[key].label : "";
}

/** Channel slugs selected by region and network filters (null = no restriction). */
export function channelSlugsFor(region: RegionKey | null, network: NetworkKey | null): Set<string> | null {
  if (!region && !network) return null;
  const inRegion = region ? new Set(channelsInRegion(region).map((c) => c.slug)) : null;
  const inNetwork = network ? new Set(channelsInNetwork(network).map((c) => c.slug)) : null;
  if (inRegion && inNetwork) return new Set([...inRegion].filter((slug) => inNetwork.has(slug)));
  return inRegion ?? inNetwork;
}

export const MEDIUM_LABELS: Record<Medium, string> = { TERRESTRIAL: "地上波", BS: "BS", CS: "CS" };
export const AREA_LABELS: Record<Area, string> = { NATIONWIDE: "全国", KANTO: "関東", KANSAI: "関西" };

/**
 * Syoboi title category (`Cat`). Values 1 and 10 are confirmed by observed data (1 = アニメ, 10 = アニメ(終了/再放送));
 * the remaining labels follow the categories shown on Syoboi Calendar and are treated as descriptive only.
 */
export const SYOBOI_CATEGORY_LABELS: Record<number, string> = {
  0: "その他",
  1: "アニメ",
  2: "ラジオ",
  3: "テレビ",
  4: "特撮",
  5: "アニメ関連",
  6: "メモ",
  7: "OVA",
  8: "映画",
  10: "アニメ（放送終了）"
};

/** Categories counted as "anime" for schedules and statistics by default. */
export const ANIME_CATEGORIES: readonly number[] = [1, 7, 8, 10];

export function isAnimeCategory(category: number | null | undefined): boolean {
  // Unknown category (title details not yet fetched) is kept visible rather than silently dropped.
  return category === null || category === undefined || ANIME_CATEGORIES.includes(category);
}
