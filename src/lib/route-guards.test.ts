import { describe, expect, it } from "vitest";

import { isSeasonInScope, routeExists } from "./route-guards";

const NOW = new Date("2026-11-22T03:00:00Z"); // 2026 autumn

describe("routeExists", () => {
  it("accepts well-formed title IDs and rejects anything else", () => {
    expect(routeExists("/titles/8031", NOW)).toBe(true);
    expect(routeExists("/titles/8031/", NOW)).toBe(true);
    for (const bad of ["/titles/abc", "/titles/0", "/titles/012", "/titles/12345678", "/titles/-1", "/titles/%E0%A4%A"]) {
      expect(routeExists(bad, NOW), bad).toBe(false);
    }
  });

  it("knows the tracked channels", () => {
    expect(routeExists("/channels/mx", NOW)).toBe(true);
    expect(routeExists("/channels/nope", NOW)).toBe(false);
  });

  it("keeps seasons to the site's range: 2000 winter to the next season", () => {
    expect(routeExists("/seasons/2000-winter", NOW)).toBe(true);
    expect(routeExists("/seasons/2027-winter", NOW)).toBe(true); // next season: schedules are published ahead
    expect(routeExists("/seasons/2027-spring", NOW)).toBe(false);
    expect(routeExists("/seasons/1999-autumn", NOW)).toBe(false);
    expect(routeExists("/seasons/2026-xyz", NOW)).toBe(false);
    expect(isSeasonInScope("2026-autumn", NOW)).toBe(true);
  });

  it("leaves index pages, slots and other routes to the router", () => {
    for (const path of ["/titles", "/seasons", "/channels", "/slots/anything", "/slots/%E3%83%8E", "/stats", "/titles/1/extra"]) {
      expect(routeExists(path, NOW), path).toBe(true);
    }
  });
});
