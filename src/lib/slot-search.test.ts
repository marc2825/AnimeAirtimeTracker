import { describe, expect, it } from "vitest";

import { isUnfiltered, matchSlotPosition, type SlotCriteria, type SlotPosition } from "./slot-search";

// A slot that moved from Thursday 24:55 (2024 winter) to Friday 23:30 (2026 autumn), newest first.
const POSITIONS: SlotPosition[] = [
  { seasonOrdinal: 20264, weekday: 4, minute: 23 * 60 + 30, channelSlug: "fuji" },
  { seasonOrdinal: 20251, weekday: 3, minute: 24 * 60 + 55, channelSlug: "fuji" },
  { seasonOrdinal: 20241, weekday: 3, minute: 24 * 60 + 55, channelSlug: "fuji" }
];
const base: SlotCriteria = { season: "latest", channelSlugs: null, weekday: null, band: null };

describe("matchSlotPosition", () => {
  it("judges each slot by its latest season when no season is chosen", () => {
    expect(matchSlotPosition(POSITIONS, { ...base, band: "latenight" })?.seasonOrdinal).toBe(20264);
    expect(matchSlotPosition(POSITIONS, { ...base, band: "aftermidnight" })).toBeNull();
    expect(matchSlotPosition(POSITIONS, { ...base, weekday: 3 })).toBeNull();
  });

  it("uses the chosen season's position, and nothing when the slot did not air that season", () => {
    expect(matchSlotPosition(POSITIONS, { ...base, season: 20251, band: "aftermidnight" })?.minute).toBe(24 * 60 + 55);
    expect(matchSlotPosition(POSITIONS, { ...base, season: 20251, band: "late" })).toEqual(POSITIONS[1]);
    expect(matchSlotPosition(POSITIONS, { ...base, season: 20253 })).toBeNull();
  });

  it("with any season, returns the most recent matching season", () => {
    expect(matchSlotPosition(POSITIONS, { ...base, season: "any", band: "aftermidnight" })).toEqual(POSITIONS[1]);
    expect(matchSlotPosition(POSITIONS, { ...base, season: "any", band: "morning" })).toBeNull();
  });

  it("combines channel and weekday with the band on the same season", () => {
    expect(matchSlotPosition(POSITIONS, { ...base, season: "any", channelSlugs: new Set(["fuji"]), weekday: 4, band: "late" })).toEqual(POSITIONS[0]);
    expect(matchSlotPosition(POSITIONS, { ...base, season: "any", channelSlugs: new Set(["mx"]) })).toBeNull();
    // Weekday of one season and band of another must not combine into a match.
    expect(matchSlotPosition(POSITIONS, { ...base, season: "any", weekday: 4, band: "aftermidnight" })).toBeNull();
  });

  it("treats only the default criteria as unfiltered", () => {
    expect(isUnfiltered(base)).toBe(true);
    expect(isUnfiltered({ ...base, band: "latenight" })).toBe(false);
    expect(isUnfiltered({ ...base, season: "any" })).toBe(false);
    expect(isUnfiltered({ ...base, channelSlugs: new Set(["fuji"]) })).toBe(false);
  });
});
