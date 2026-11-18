import { describe, expect, it } from "vitest";

import { classifyRerun, decodeFlags, encodeFlags } from "./flags";
import {
  formatSeason,
  parseSeasonId,
  seasonDateRange,
  seasonId,
  seasonInstantRange,
  seasonOfInstant,
  seasonsBetween,
  shiftSeason
} from "./season";
import { parseJstDateTime } from "./time";

describe("seasons", () => {
  it("assigns seasons by anime date, so New Year's Eve late night stays in autumn", () => {
    expect(seasonOfInstant(parseJstDateTime("2027-01-01 01:00:00"))).toEqual({ year: 2026, quarter: 4 });
    expect(seasonOfInstant(parseJstDateTime("2027-01-01 05:00:00"))).toEqual({ year: 2027, quarter: 1 });
    expect(seasonOfInstant(parseJstDateTime("2026-04-01 04:30:00"))).toEqual({ year: 2026, quarter: 1 });
  });

  it("round-trips ids and labels", () => {
    expect(seasonId({ year: 2026, quarter: 4 })).toBe("2026-autumn");
    expect(parseSeasonId("2026-autumn")).toEqual({ year: 2026, quarter: 4 });
    expect(parseSeasonId("2026-fall")).toBeNull();
    expect(parseSeasonId("1800-winter")).toBeNull();
    expect(formatSeason({ year: 2027, quarter: 1 })).toBe("2027年冬");
  });

  it("shifts across years", () => {
    expect(shiftSeason({ year: 2026, quarter: 4 }, 1)).toEqual({ year: 2027, quarter: 1 });
    expect(shiftSeason({ year: 2026, quarter: 1 }, -1)).toEqual({ year: 2025, quarter: 4 });
    expect(seasonsBetween({ year: 2025, quarter: 4 }, { year: 2026, quarter: 2 })).toHaveLength(3);
  });

  it("computes date and instant ranges", () => {
    expect(seasonDateRange({ year: 2026, quarter: 4 })).toEqual({ first: "2026-10-01", last: "2026-12-31" });
    const range = seasonInstantRange({ year: 2026, quarter: 4 });
    expect(range.start.toISOString()).toBe("2026-09-30T20:00:00.000Z"); // 10/01 05:00 JST
    expect(range.end.toISOString()).toBe("2026-12-31T20:00:00.000Z"); // 01/01 05:00 JST
  });
});

describe("flags", () => {
  it("decodes the Syoboi bitmask", () => {
    expect(decodeFlags(10)).toEqual({ note: false, isNew: true, isFinal: false, rerun: true });
    expect(decodeFlags(null)).toEqual({ note: false, isNew: false, isFinal: false, rerun: false });
    expect(encodeFlags(decodeFlags(13))).toBe(13);
  });

  it("classifies reruns by flag first, then by age, and never by absence of a flag alone", () => {
    expect(classifyRerun({ flagRerun: true, airingYear: 2026, airingMonth: 11, firstEndYear: null, firstEndMonth: null })).toEqual({
      isRerun: true,
      basis: "FLAG"
    });
    expect(classifyRerun({ flagRerun: false, airingYear: 2026, airingMonth: 11, firstEndYear: 2005, firstEndMonth: 9 })).toEqual({
      isRerun: true,
      basis: "AGE"
    });
    // Within the threshold (e.g. a late regional first run) stays unclassified.
    expect(classifyRerun({ flagRerun: false, airingYear: 2026, airingMonth: 12, firstEndYear: 2026, firstEndMonth: 9 })).toEqual({
      isRerun: false,
      basis: "NONE"
    });
    // Open-ended first run → no age inference.
    expect(classifyRerun({ flagRerun: false, airingYear: 2026, airingMonth: 11, firstEndYear: null, firstEndMonth: null }).basis).toBe("NONE");
  });
});
