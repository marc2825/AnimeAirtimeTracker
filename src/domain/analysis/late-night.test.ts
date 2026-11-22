import { describe, expect, it } from "vitest";

import type { SeasonTrendRow } from "../stats";
import { lateNightByYear, lateNightFindings, lateNightSeasons } from "./late-night";

const row = (seasonOrdinal: number, titles: number, late: number, latelate: number): SeasonTrendRow => ({
  seasonOrdinal,
  titles,
  broadcasts: titles * 12,
  newTitles: 0,
  lateNightShare: 0,
  bandTitles: { day: titles - late - latelate, evening: 0, prime: 0, late, latelate }
});

describe("late-night analysis", () => {
  const rows = [
    row(20051, 10, 1, 0), // before the comparable period
    ...[1, 2, 3, 4].map((q) => row(20060 + q, 40, 10, 2)),
    ...[1, 2, 3, 4].map((q) => row(20250 + q, 50, q === 3 ? 30 : 20, 10)),
    row(20261, 60, 25, 12) // incomplete year
  ];
  const seasons = lateNightSeasons(rows);

  it("counts both late bands as late night and keeps 25:00+ apart", () => {
    expect(seasons.find((s) => s.seasonOrdinal === 20061)).toEqual({ seasonOrdinal: 20061, titles: 40, late: 12, afterOne: 2 });
  });

  it("averages per season within a year and pools shares", () => {
    const y2025 = lateNightByYear(seasons).find((y) => y.year === 2025)!;
    // late per season: 30, 30, 40, 30 → average 32.5; share 130 / 200; 25:00+ 40 / 130.
    expect(y2025).toMatchObject({ seasons: 4, lateAverage: 32.5 });
    expect(y2025.lateShare).toBeCloseTo(0.65);
    expect(y2025.afterOneShare).toBeCloseTo(40 / 130);
  });

  it("compares the first and last complete years of the comparable period only", () => {
    const findings = lateNightFindings(seasons, 2006, 20262)!;
    expect(findings.first.year).toBe(2006);
    expect(findings.last.year).toBe(2025); // 2026 has one season so far
    expect(findings.peak.seasonOrdinal).toBe(20253);
  });

  it("does not treat a year as complete while one of its seasons is still airing", () => {
    // All four 2025 seasons are on file, but autumn 2025 is the current season.
    const findings = lateNightFindings(seasons, 2006, 20254);
    expect(findings).toBeNull(); // only 2006 is complete, nothing to compare
    expect(lateNightFindings(seasons, 2006, 20261)!.last.year).toBe(2025);
  });

  it("returns null when there is nothing to compare", () => {
    expect(lateNightFindings(lateNightSeasons([row(20061, 1, 1, 0)]), 2006, 20264)).toBeNull();
  });
});
