import { describe, expect, it } from "vitest";

import { renderSitemap } from "./sitemap";

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
});
