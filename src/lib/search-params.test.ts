import { describe, expect, it } from "vitest";

import { buildHref, parseCommonFilters, parseIsoDateParam, parsePage, parseQuery, parseSlug } from "./search-params";

describe("URL state", () => {
  it("whitelists filter values and falls back to defaults", () => {
    const filters = parseCommonFilters(
      { season: "2026-autumn", region: "kansai", day: "sat", time: "latelate", rerun: "only", kind: "all", channel: "MX;DROP" },
      { rerun: "exclude", season: null }
    );
    expect(filters).toEqual({ season: { year: 2026, quarter: 4 }, region: "kansai", channel: null, weekday: 5, band: "latelate", rerun: "only", allKinds: true });
    const defaults = parseCommonFilters({ season: "bogus", region: "tokyo", day: "x", time: "noon", rerun: "maybe" }, { rerun: "exclude", season: { year: 2026, quarter: 4 } });
    expect(defaults).toMatchObject({ season: { year: 2026, quarter: 4 }, region: null, weekday: null, band: null, rerun: "exclude" });
    expect(parseCommonFilters({ season: "all" }, { rerun: "exclude", season: { year: 2026, quarter: 4 } }).season).toBeNull();
  });

  it("clamps pages, slugs, dates and queries", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("1e9")).toBe(1);
    expect(parseSlug("bs-ntv")).toBe("bs-ntv");
    expect(parseSlug("../etc")).toBeNull();
    expect(parseIsoDateParam("2026-02-30")).toBeNull();
    expect(parseQuery("  ＰＳＹＲＥＮ ")).toBe("PSYREN");
    expect(parseQuery("x".repeat(200))).toHaveLength(80);
  });

  it("builds shareable URLs, dropping empty values and resetting the page", () => {
    expect(buildHref("/search", { q: "月", page: "3", region: "kanto" }, { region: null, view: "airings" })).toBe("/search?q=%E6%9C%88&view=airings");
    expect(buildHref("/search", { page: "2" }, { page: "3" })).toBe("/search?page=3");
    expect(buildHref("/schedule", {}, {})).toBe("/schedule");
  });
});
