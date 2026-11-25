import { describe, expect, it } from "vitest";

import {
  STATIC_SITEMAP_PAGES,
  TITLE_SITEMAP_MIN_AIRINGS,
  pastLastModified,
  renderSitemap,
  renderSitemapIndex,
  staticSitemapEntries,
  titleInSitemap,
  titleSitemapSince
} from "./sitemap";

const url = (path: string) => new URL(path, "https://example.jp").toString();
const now = new Date("2026-11-25T03:00:00Z");

describe("renderSitemap", () => {
  it("escapes URLs and writes optional fields only when present", () => {
    const xml = renderSitemap([
      { url: "https://example.jp/slots/a&b", changeFrequency: "weekly" },
      { url: "https://example.jp/titles/1", lastModified: new Date("2026-11-22T00:00:00Z") }
    ]);
    expect(xml).toContain("<loc>https://example.jp/slots/a&amp;b</loc><changefreq>weekly</changefreq>");
    expect(xml).toContain("<loc>https://example.jp/titles/1</loc><lastmod>2026-11-22T00:00:00.000Z</lastmod></url>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("writes a sitemap index of the child sitemaps", () => {
    const xml = renderSitemapIndex([url("/sitemaps/static.xml"), url("/sitemaps/titles.xml")]);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<sitemap><loc>https://example.jp/sitemaps/static.xml</loc></sitemap>\n<sitemap><loc>https://example.jp/sitemaps/titles.xml</loc></sitemap>");
  });
});

describe("fixed pages", () => {
  it("leave out the terms, privacy, status and search pages", () => {
    const paths = STATIC_SITEMAP_PAGES.map((page) => page.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/slots");
    for (const path of ["/terms", "/privacy", "/status", "/search"]) expect(paths).not.toContain(path);
  });

  it("date the data pages by the last data change and leave /about undated", () => {
    const changed = new Date("2026-11-24T12:00:00Z");
    const entries = staticSitemapEntries(url, changed, now, ["/analysis/late-night"]);
    expect(entries.find((entry) => entry.url === url("/"))?.lastModified).toEqual(changed);
    expect(entries.find((entry) => entry.url === url("/analysis/late-night"))?.lastModified).toEqual(changed);
    expect(entries.find((entry) => entry.url === url("/about"))?.lastModified).toBeUndefined();
    // No known change: no lastmod at all.
    expect(staticSitemapEntries(url, null, now).every((entry) => entry.lastModified === undefined)).toBe(true);
  });
});

describe("pastLastModified", () => {
  it("drops unknown and future dates", () => {
    expect(pastLastModified(null, now)).toBeUndefined();
    expect(pastLastModified(new Date("invalid"), now)).toBeUndefined();
    expect(pastLastModified(new Date("2026-12-31T00:00:00Z"), now)).toBeUndefined();
    expect(pastLastModified(now, now)).toEqual(now);
  });
});

describe("titleInSitemap", () => {
  const since = titleSitemapSince("2026-11-25");

  it("counts back 60 days from today", () => {
    expect(since).toBe("2026-09-26");
  });

  it("lists titles with enough airings, a slot, or an airing on or after the cutoff", () => {
    const old = "2010-04-01";
    expect(titleInSitemap({ liveAirings: TITLE_SITEMAP_MIN_AIRINGS, lastAnimeDate: old, inSlot: false }, since)).toBe(true);
    expect(titleInSitemap({ liveAirings: 1, lastAnimeDate: old, inSlot: true }, since)).toBe(true);
    expect(titleInSitemap({ liveAirings: 1, lastAnimeDate: since, inSlot: false }, since)).toBe(true);
    expect(titleInSitemap({ liveAirings: 2, lastAnimeDate: "2027-01-10", inSlot: false }, since)).toBe(true);
  });

  it("leaves out a single old showing, and titles with no live airing even in a slot", () => {
    expect(titleInSitemap({ liveAirings: TITLE_SITEMAP_MIN_AIRINGS - 1, lastAnimeDate: "2026-09-25", inSlot: false }, since)).toBe(false);
    expect(titleInSitemap({ liveAirings: 0, lastAnimeDate: null, inSlot: true }, since)).toBe(false);
  });
});
