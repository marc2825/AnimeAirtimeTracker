import { describe, expect, it } from "vitest";

import { monthGrid, shiftMonth, yearMonthOf } from "./month-grid";

describe("monthGrid", () => {
  it("lays a month out in Monday-first weeks with blanks outside the month", () => {
    const weeks = monthGrid({ year: 2026, month: 11 }); // 2026-11-01 is a Sunday
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks[1]![0]).toBe("2026-11-02");
    expect(weeks.at(-1)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it("handles leap years and a month that starts on Monday", () => {
    expect(monthGrid({ year: 2024, month: 2 }).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid({ year: 2027, month: 2 })).toHaveLength(4); // 2027-02-01 is a Monday, 28 days
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries in both directions", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 11 }, -12)).toEqual({ year: 2025, month: 11 });
    expect(yearMonthOf("2026-11-22")).toEqual({ year: 2026, month: 11 });
  });
});
