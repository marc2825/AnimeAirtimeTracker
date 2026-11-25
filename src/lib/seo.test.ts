import { describe, expect, it } from "vitest";

import { breadcrumbJsonLd, datasetJsonLd, jsonLdText, quarterMonths, slotItemListJsonLd, titleJsonLd, titlePageDescription, titlePageTitle, websiteJsonLd, type TitleJsonLdFacts } from "./seo";

const base = new URL("https://example.jp");
const airing = (animeDate: string, extra: Partial<{ deleted: boolean; missing: boolean }> = {}) => ({ animeDate: animeDate as `${number}-${number}-${number}`, deleted: false, missing: false, ...extra });

describe("jsonLdText", () => {
  it("cannot end the script element, and parses back to the same data", () => {
    const data = { name: '</script><script>alert(1)</script> & \u2028' };
    const text = jsonLdText(data);
    expect(text).not.toMatch(/<|>|&|\u2028/);
    expect(JSON.parse(text)).toEqual(data);
  });
});

describe("structured data", () => {
  it("names the site with its English alternate name", () => {
    expect(websiteJsonLd(base)).toMatchObject({ "@type": "WebSite", name: "アニメ放送枠観測所", alternateName: "Anime Airtime Tracker", url: "https://example.jp/" });
  });

  it("offers the title search as the site's search action", () => {
    expect(websiteJsonLd(base).potentialAction).toEqual({
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: "https://example.jp/search?q={search_term_string}" },
      "query-input": "required name=search_term_string"
    });
  });

  it("builds breadcrumbs from the home page with absolute URLs", () => {
    const crumbs = breadcrumbJsonLd([{ name: "放送枠", path: "/slots" }, { name: "ノイタミナ", path: "/slots/noitamina" }], base);
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "アニメ放送枠観測所", item: "https://example.jp/" },
      { "@type": "ListItem", position: 2, name: "放送枠", item: "https://example.jp/slots" },
      { "@type": "ListItem", position: 3, name: "ノイタミナ", item: "https://example.jp/slots/noitamina" }
    ]);
  });

  it("describes an analysis as a dataset without claiming a license", () => {
    const dataset = datasetJsonLd({ name: "深夜アニメ", description: "説明", path: "/analysis/late-night" }, base);
    expect(dataset).toMatchObject({ "@type": "Dataset", url: "https://example.jp/analysis/late-night", isBasedOn: "https://cal.syoboi.jp/" });
    expect(dataset).not.toHaveProperty("license");
  });
});

describe("title JSON-LD", () => {
  const facts: TitleJsonLdFacts = {
    slug: "8053",
    name: "作品A",
    shortName: null,
    nameEn: "Work A",
    sourceCategory: 1,
    firstYear: 2026,
    firstMonth: 10,
    firstEndYear: null,
    firstEndMonth: null,
    officialUrl: "https://example.com/work-a/",
    sourceUrl: "https://cal.syoboi.jp/tid/8053"
  };

  it("uses only stored source facts", () => {
    expect(titleJsonLd(facts, base)).toEqual({
      "@context": "https://schema.org",
      "@type": "TVSeries",
      name: "作品A",
      url: "https://example.jp/titles/8053",
      alternateName: "Work A",
      startDate: "2026-10",
      sameAs: ["https://example.com/work-a/", "https://cal.syoboi.jp/tid/8053"]
    });
  });

  it("leaves out what is unknown or not a web address, and dates only TV series", () => {
    const movie = titleJsonLd({ ...facts, sourceCategory: 8, nameEn: null, shortName: "作品A", officialUrl: "javascript:alert(1)" }, base);
    expect(movie).toEqual({ "@context": "https://schema.org", "@type": "Movie", name: "作品A", url: "https://example.jp/titles/8053", sameAs: ["https://cal.syoboi.jp/tid/8053"] });
    const other = titleJsonLd({ ...facts, sourceCategory: null, firstYear: null }, base);
    expect(other["@type"]).toBe("CreativeWork");
    expect(other).not.toHaveProperty("startDate");
    expect(titleJsonLd({ ...facts, firstMonth: null, firstEndYear: 2027, firstEndMonth: 3 }, base)).toMatchObject({ startDate: "2026", endDate: "2027-03" });
  });
});

describe("slot JSON-LD", () => {
  it("lists the slot's titles in page order with absolute URLs", () => {
    const list = slotItemListJsonLd({ slug: "ノイタミナ", name: "ノイタミナ", members: [{ slug: "2", name: "新" }, { slug: "1", name: "旧" }] }, base);
    expect(list).toMatchObject({ "@type": "ItemList", name: "ノイタミナの所属作品", url: "https://example.jp/slots/%E3%83%8E%E3%82%A4%E3%82%BF%E3%83%9F%E3%83%8A", numberOfItems: 2 });
    expect(list.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "新", url: "https://example.jp/titles/2" },
      { "@type": "ListItem", position: 2, name: "旧", url: "https://example.jp/titles/1" }
    ]);
  });
});

describe("title page title and description", () => {
  it("puts what people search for next to the name", () => {
    expect(titlePageTitle("作品A")).toBe("作品Aの放送日時・放送局");
  });

  it("states the first airing, the number of channels and the regular slot from stored airings", () => {
    const description = titlePageDescription({
      name: "作品A",
      yomi: "さくひんえー",
      groups: [
        { channel: { shortName: "MX" }, regular: { weekday: 6, minute: 1440 }, broadcasts: [airing("2026-10-05"), airing("2026-10-12")] },
        { channel: { shortName: "BS11" }, regular: null, broadcasts: [airing("2026-10-08")] },
        // Deleted and no longer listed airings say nothing about when or where it aired.
        { channel: { shortName: "テレ東" }, regular: null, broadcasts: [airing("2026-09-01", { deleted: true }), airing("2026-09-02", { missing: true })] }
      ]
    });
    expect(description).toBe(
      "『作品A』（さくひんえー）のテレビ放送の記録。2026年10月5日からMXなど2局で放送（MX 毎週日曜 24:00）。放送局ごとの放送日時・話数・サブタイトル・放送枠の履歴。データ出典: しょぼいカレンダー。"
    );
  });

  it("leaves out what is not stored", () => {
    expect(titlePageDescription({ name: "作品B", yomi: null, groups: [{ channel: { shortName: "NHK" }, regular: null, broadcasts: [airing("2001-04-02")] }] })).toBe(
      "『作品B』のテレビ放送の記録。2001年4月2日からNHKで放送。放送局ごとの放送日時・話数・サブタイトル・放送枠の履歴。データ出典: しょぼいカレンダー。"
    );
    expect(titlePageDescription({ name: "作品C", yomi: null, groups: [] })).toBe("『作品C』のテレビ放送の記録。放送局ごとの放送日時・話数・サブタイトル・放送枠の履歴。データ出典: しょぼいカレンダー。");
  });

  it("names the months of a season", () => {
    expect([1, 2, 3, 4].map((q) => quarterMonths(q as 1 | 2 | 3 | 4))).toEqual(["1〜3月", "4〜6月", "7〜9月", "10〜12月"]);
  });
});
