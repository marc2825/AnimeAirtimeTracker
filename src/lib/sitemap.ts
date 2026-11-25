/**
 * Sitemaps: `/sitemap.xml` is an index of four child sitemaps (fixed pages, seasons and channels, slots, titles).
 * The builders here are pure: routes pass in what they read from the database. A `lastmod` is written only when it
 * is known, and never later than the moment the sitemap is built (a future date would make search engines distrust
 * every lastmod on the site).
 */
import { addDays, type IsoDate } from "@/domain/time";

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: "daily" | "weekly" | "monthly";
}

/** Child sitemaps, in the order the index lists them. Each is served at `/sitemaps/<name>.xml`. */
export const SITEMAP_FILES = ["static", "seasons", "slots", "titles"] as const;
export type SitemapFile = (typeof SITEMAP_FILES)[number];

/**
 * Fixed pages. `data: true` pages show the stored programming data, so their lastmod is the last change to it;
 * `/about` is prose and gets none. Left out on purpose (the pages stay, with no noindex): `/terms`, `/privacy`,
 * `/status` and `/search`. They outranked the home page for the site's own name (#52), and `/search` without a
 * query is only a form.
 */
export const STATIC_SITEMAP_PAGES: readonly { path: string; data: boolean }[] = [
  { path: "/", data: true },
  { path: "/slots", data: true },
  { path: "/stats", data: true },
  { path: "/analysis", data: true },
  { path: "/schedule", data: true },
  { path: "/seasons", data: true },
  { path: "/channels", data: true },
  { path: "/compare/slots", data: true },
  { path: "/compare/channels", data: true },
  { path: "/about", data: false }
];

/**
 * A title page is listed when it has enough airings to stand as a page, belongs to a slot, or is on air now.
 * Measured on a copy of production (2026-11-21, 6,486 titles with airings): 5,668 are listed; the 818 left out are
 * mostly single TV showings of films (447) and OVAs (168) with one to three airings. Their pages stay reachable
 * through links and are not marked noindex.
 */
export const TITLE_SITEMAP_MIN_AIRINGS = 4;
/** Titles with an airing this many days back or later (including upcoming ones) are always listed. */
export const TITLE_SITEMAP_RECENT_DAYS = 60;
/** sitemaps.org allows 50,000 URLs per file. */
export const TITLE_SITEMAP_LIMIT = 45_000;

export interface TitleSitemapFacts {
  /** Airings neither deleted nor dropped by the source. */
  liveAirings: number;
  lastAnimeDate: IsoDate | null;
  inSlot: boolean;
}

/** The earliest anime date that still counts as "on air now" for the title sitemap. */
export function titleSitemapSince(today: IsoDate): IsoDate {
  return addDays(today, -TITLE_SITEMAP_RECENT_DAYS);
}

/** Whether a title page goes into the sitemap (the query in src/server/queries/sitemap.ts applies the same rule). */
export function titleInSitemap(title: TitleSitemapFacts, since: IsoDate): boolean {
  if (title.liveAirings === 0) return false;
  return title.liveAirings >= TITLE_SITEMAP_MIN_AIRINGS || title.inSlot || (title.lastAnimeDate !== null && title.lastAnimeDate >= since);
}

/** The date itself, or undefined when it is unknown or later than `now`. */
export function pastLastModified(date: Date | null | undefined, now: Date): Date | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.getTime() <= now.getTime() ? date : undefined;
}

export function staticSitemapEntries(url: (path: string) => string, dataChangedAt: Date | null, now: Date, extraDataPaths: readonly string[] = []): SitemapEntry[] {
  const pages = [...STATIC_SITEMAP_PAGES, ...extraDataPaths.map((path) => ({ path, data: true }))];
  return pages.map((page) => ({
    url: url(page.path),
    lastModified: page.data ? pastLastModified(dataChangedAt, now) : undefined,
    changeFrequency: page.data ? ("daily" as const) : ("monthly" as const)
  }));
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

/** sitemaps.org XML for the given entries. */
export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const parts = [`<loc>${escapeXml(entry.url)}</loc>`];
    if (entry.lastModified) parts.push(`<lastmod>${entry.lastModified.toISOString()}</lastmod>`);
    if (entry.changeFrequency) parts.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
    return `<url>${parts.join("")}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** sitemaps.org index pointing at child sitemaps. */
export function renderSitemapIndex(urls: string[]): string {
  const items = urls.map((url) => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}
