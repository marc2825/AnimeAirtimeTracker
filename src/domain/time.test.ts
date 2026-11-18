import { describe, expect, it } from "vitest";

import {
  addDays,
  animeDayRange,
  animeWeekStart,
  diffDays,
  formatAnimeMinute,
  formatAnimeSlot,
  formatClockTime,
  fromAnimeTime,
  parseJstDateTime,
  parseWeekdayKey,
  toAnimeTime,
  toSyoboiTimestamp,
  weekdayOf
} from "./time";

describe("parseJstDateTime", () => {
  it("parses JST wall clock into the correct UTC instant", () => {
    expect(parseJstDateTime("2026-11-16 18:30:00").toISOString()).toBe("2026-11-16T09:30:00.000Z");
    expect(parseJstDateTime("2026-11-17T01:30").toISOString()).toBe("2026-11-16T16:30:00.000Z");
  });

  it("rejects malformed and impossible values", () => {
    expect(() => parseJstDateTime("2026-11-16 25:30:00")).toThrow(RangeError);
    expect(() => parseJstDateTime("2026-02-30 10:00:00")).toThrow(RangeError);
    expect(() => parseJstDateTime("")).toThrow(RangeError);
  });
});

describe("toAnimeTime (05:00 rollover)", () => {
  it("maps Tuesday 01:30 JST to Monday 25:30", () => {
    const result = toAnimeTime(parseJstDateTime("2026-11-17 01:30:00"));
    expect(result).toEqual({ animeDate: "2026-11-16", weekday: 0, animeMinute: 25 * 60 + 30 });
    expect(formatAnimeSlot(result.weekday, result.animeMinute)).toBe("月曜 25:30");
  });

  it("keeps 05:00 on the same calendar day and 04:59 on the previous day", () => {
    expect(toAnimeTime(parseJstDateTime("2026-11-17 05:00:00"))).toMatchObject({ animeDate: "2026-11-17", animeMinute: 300 });
    expect(toAnimeTime(parseJstDateTime("2026-11-17 04:59:00"))).toMatchObject({ animeDate: "2026-11-16", animeMinute: 1739 });
  });

  it("handles midnight exactly as 24:00 of the previous anime day", () => {
    expect(toAnimeTime(parseJstDateTime("2026-11-17 00:00:00"))).toMatchObject({ animeDate: "2026-11-16", animeMinute: 1440 });
  });

  it("crosses year boundaries", () => {
    const result = toAnimeTime(parseJstDateTime("2027-01-01 02:00:00"));
    expect(result.animeDate).toBe("2026-12-31");
    expect(formatAnimeMinute(result.animeMinute)).toBe("26:00");
    expect(result.weekday).toBe(3); // 2026-12-31 is a Thursday
  });

  it("round-trips through fromAnimeTime", () => {
    const instant = parseJstDateTime("2026-03-01 03:15:00");
    const anime = toAnimeTime(instant);
    expect(anime.animeDate).toBe("2026-02-28");
    expect(fromAnimeTime(anime.animeDate, anime.animeMinute).toISOString()).toBe(instant.toISOString());
  });
});

describe("calendar helpers", () => {
  it("computes weekdays with Monday = 0", () => {
    expect(weekdayOf("2026-11-16")).toBe(0);
    expect(weekdayOf("2026-11-22")).toBe(6);
  });

  it("adds and diffs days across month and leap boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2027-01-01", "2026-12-25")).toBe(7);
  });

  it("finds the Monday of an anime week", () => {
    expect(animeWeekStart("2026-11-22")).toBe("2026-11-16");
    expect(animeWeekStart("2026-11-16")).toBe("2026-11-16");
  });

  it("returns half-open day ranges from 05:00 to 05:00", () => {
    const range = animeDayRange("2026-11-16");
    expect(range.start.toISOString()).toBe("2026-11-15T20:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-16T20:00:00.000Z");
  });

  it("formats clock time in JST regardless of host timezone", () => {
    expect(formatClockTime(new Date("2026-11-16T16:30:00Z"))).toBe("01:30");
  });

  it("formats Syoboi query timestamps", () => {
    expect(toSyoboiTimestamp(parseJstDateTime("2026-10-01 05:00:00"))).toBe("20261001_050000");
  });

  it("parses weekday keys", () => {
    expect(parseWeekdayKey("sat")).toBe(5);
    expect(parseWeekdayKey("xyz")).toBeNull();
    expect(parseWeekdayKey(undefined)).toBeNull();
  });
});
