import { describe, expect, it } from "vitest";

import { buildHref, inLength, inTimeBand, likePattern, parseCommonFilters, parseIsoDateParam, parseLength, parsePage, parseQuery, parseSlug, parseTimeBand, TIME_BANDS, type TimeBand } from "./search-params";

const at = (hour: number, minute = 0) => hour * 60 + minute;
const bandsOf = (minute: number) => (Object.keys(TIME_BANDS) as TimeBand[]).filter((band) => inTimeBand(minute, band));

describe("time bands (anime clock, start minute, half-open)", () => {
  it.each([
    ["05:00", at(5), ["morning"]],
    ["11:59", at(11, 59), ["morning"]],
    ["12:00", at(12), ["daytime"]],
    ["16:59", at(16, 59), ["daytime"]],
    ["17:00", at(17), ["evening"]],
    ["18:59", at(18, 59), ["evening"]],
    ["19:00", at(19), ["prime"]],
    ["22:59", at(22, 59), ["prime"]],
    ["23:00", at(23), ["latenight", "late"]],
    ["23:59", at(23, 59), ["latenight", "late"]],
    ["24:00", at(24), ["latenight", "late", "aftermidnight"]],
    ["24:59", at(24, 59), ["latenight", "late", "aftermidnight"]],
    ["25:00", at(25), ["latenight", "aftermidnight", "latelate"]],
    ["28:59", at(28, 59), ["latenight", "aftermidnight", "latelate"]],
    ["29:00 (= next day 05:00)", at(29), []]
  ])("%s starts in %j", (_, minute, expected) => {
    expect(bandsOf(minute)).toEqual(expected);
  });

  it("keeps the original six bands a partition of the anime day; latenight is late + latelate", () => {
    const original: TimeBand[] = ["morning", "daytime", "evening", "prime", "late", "latelate"];
    for (let minute = at(5); minute < at(29); minute += 1) {
      expect(original.filter((band) => inTimeBand(minute, band))).toHaveLength(1);
      expect(inTimeBand(minute, "latenight")).toBe(inTimeBand(minute, "late") || inTimeBand(minute, "latelate"));
      if (inTimeBand(minute, "aftermidnight")) expect(inTimeBand(minute, "latenight")).toBe(true);
    }
  });

  it("accepts only its own keys from the URL", () => {
    expect(parseTimeBand("latenight")).toBe("latenight");
    expect(parseTimeBand("aftermidnight")).toBe("aftermidnight");
    expect(parseTimeBand("late")).toBe("late");
    for (const bogus of ["constructor", "toString", "__proto__", "hasOwnProperty", "LATENIGHT", "", undefined]) {
      expect(parseTimeBand(bogus)).toBeNull();
    }
  });
});

describe("URL state", () => {
  it("whitelists filter values and falls back to defaults", () => {
    const filters = parseCommonFilters(
      { season: "2026-autumn", region: "kansai", day: "sat", time: "latelate", rerun: "only", kind: "all", channel: "MX;DROP" },
      { rerun: "exclude", season: null }
    );
    expect(filters).toEqual({ season: { year: 2026, quarter: 4 }, region: "kansai", network: null, channel: null, weekday: 5, band: "latelate", length: null, rerun: "only", allKinds: true });
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

describe("airing length presets", () => {
  it.each([
    [5, "short"],
    [15, "short"],
    [16, "standard"],
    [30, "standard"],
    [45, "standard"],
    [46, "long"],
    [120, "long"]
  ] as const)("%i minutes is %s (half-open bounds)", (minutes, expected) => {
    expect((["short", "standard", "long"] as const).filter((key) => inLength(minutes, key))).toEqual([expected]);
  });

  it("parses network and length from the URL, ignoring unknown values", () => {
    expect(parseCommonFilters({ network: "ntv", length: "short" }, { rerun: "exclude", season: null })).toMatchObject({ network: "ntv", length: "short" });
    expect(parseCommonFilters({ network: "toString", length: "constructor" }, { rerun: "exclude", season: null })).toMatchObject({ network: null, length: null });
    expect(parseLength("long")).toBe("long");
  });
});

describe("likePattern", () => {
  it("wraps the query and escapes LIKE wildcards so they match literally", () => {
    expect(likePattern("進撃")).toBe("%進撃%");
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b\\c")).toBe("%a\\_b\\\\c%");
  });
});
