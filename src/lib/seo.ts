/**
 * Search engine helpers: page descriptions built only from stored data (a fact that is not stored is left out,
 * never guessed), and JSON-LD for the site name, breadcrumbs and datasets. JSON-LD text is escaped so that a
 * title from the source can never end the script element.
 */
import { formatAnimeSlot, formatIsoDateJa, type IsoDate, type Weekday } from "@/domain/time";

import { SITE_DESCRIPTION, SITE_NAME, SOURCE_NAME, SOURCE_URL, siteUrl } from "./site";

/** English name of the site (the logo's subtitle), offered to search engines as an alternate site name. */
export const SITE_NAME_EN = "Anime Airtime Tracker";

/** JSON for `<script type="application/ld+json">`: `<`, `>`, `&` and line separators escaped as \u escapes. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** The site itself, for the site name shown in search results (home page). */
export function websiteJsonLd(base: URL = siteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_NAME_EN,
    url: new URL("/", base).toString(),
    inLanguage: "ja",
    description: SITE_DESCRIPTION
  };
}

/** Breadcrumbs from the home page to the current page; search results show these instead of the bare URL. */
export function breadcrumbJsonLd(items: { name: string; path: string }[], base: URL = siteUrl()) {
  const trail = [{ name: SITE_NAME, path: "/" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: new URL(item.path, base).toString() }))
  };
}

/**
 * An analysis as a dataset (figures computed by this site from the source). No license is claimed: the terms
 * say the programme data follows the source's conditions.
 */
export function datasetJsonLd(input: { name: string; description: string; path: string }, base: URL = siteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: input.name,
    description: input.description,
    url: new URL(input.path, base).toString(),
    inLanguage: "ja",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: SITE_NAME, url: new URL("/", base).toString() },
    isBasedOn: SOURCE_URL,
    spatialCoverage: { "@type": "Place", name: "日本" }
  };
}

export interface TitleSearchFacts {
  name: string;
  yomi: string | null;
  groups: {
    channel: { shortName: string };
    regular: { weekday: number; minute: number } | null;
    broadcasts: { animeDate: IsoDate; deleted: boolean; missing: boolean }[];
  }[];
}

/** `<title>` of a title page: what people search for next to a series name. */
export function titlePageTitle(name: string): string {
  return `${name}の放送日時・放送局`;
}

/**
 * Meta description of a title page from stored airings: first airing date, number of channels, the regular
 * weekday and time on the first channel that has one. Airings deleted or no longer listed by the source are
 * left out; parts without data are omitted.
 */
export function titlePageDescription(title: TitleSearchFacts): string {
  const groups = title.groups
    .map((group) => ({ ...group, live: group.broadcasts.filter((b) => !b.deleted && !b.missing) }))
    .filter((group) => group.live.length > 0);
  const lead = `『${title.name}』${title.yomi ? `（${title.yomi}）` : ""}のテレビ放送の記録。`;
  let facts = "";
  if (groups.length > 0) {
    const first = groups.flatMap((group) => group.live).reduce((a, b) => (b.animeDate < a.animeDate ? b : a));
    const regularGroup = groups.find((group) => group.regular !== null);
    const named = regularGroup ?? groups[0]!;
    const where = groups.length === 1 ? named.channel.shortName : `${named.channel.shortName}など${groups.length}局`;
    const slot = regularGroup?.regular ? `（${regularGroup.channel.shortName} 毎週${formatAnimeSlot(regularGroup.regular.weekday as Weekday, regularGroup.regular.minute)}）` : "";
    facts = `${formatIsoDateJa(first.animeDate, { withYear: true })}から${where}で放送${slot}。`;
  }
  return `${lead}${facts}放送局ごとの放送日時・話数・サブタイトル・放送枠の履歴。データ出典: ${SOURCE_NAME}。`;
}

const QUARTER_MONTHS = ["1〜3月", "4〜6月", "7〜9月", "10〜12月"] as const;

/** Months of a season quarter, for descriptions (`10〜12月`). */
export function quarterMonths(quarter: 1 | 2 | 3 | 4): string {
  return QUARTER_MONTHS[quarter - 1]!;
}
