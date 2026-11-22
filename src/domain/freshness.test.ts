import { describe, expect, it } from "vitest";

import { dataAgeHours, isDataStale, STALE_AFTER_HOURS } from "./freshness";

describe("freshness", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  it("is fresh up to the threshold and stale after it", () => {
    expect(isDataStale(new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000), now)).toBe(false);
    expect(isDataStale(new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000 - 1000), now)).toBe(true);
  });
  it("treats a missing import as stale", () => {
    expect(isDataStale(null, now)).toBe(true);
    expect(dataAgeHours(null, now)).toBeNull();
    expect(dataAgeHours(new Date("2026-11-22T09:00:00Z"), now)).toBe(3);
  });
});
