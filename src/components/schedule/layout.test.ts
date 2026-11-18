import { describe, expect, it } from "vitest";

import { buildSegments, GAP_SEGMENT_PX, minuteToY, placeItems, PX_PER_MINUTE, totalHeight } from "./layout";

describe("schedule grid layout", () => {
  const items = [
    { id: 1, column: "mx", start: 7 * 60, duration: 30 },
    { id: 2, column: "mx", start: 25 * 60, duration: 30 },
    { id: 3, column: "tx", start: 25 * 60 + 15, duration: 30 }
  ];

  it("collapses empty hours into gap segments and trims leading/trailing hours", () => {
    const segments = buildSegments(items);
    expect(segments.map((s) => [s.kind, s.from / 60, s.to / 60])).toEqual([
      ["active", 7, 8],
      ["gap", 8, 25],
      ["active", 25, 26]
    ]);
    expect(totalHeight(segments)).toBe(60 * PX_PER_MINUTE + GAP_SEGMENT_PX + 60 * PX_PER_MINUTE);
  });

  it("maps minutes to y positions within active segments", () => {
    const segments = buildSegments(items);
    expect(minuteToY(segments, 7 * 60 + 30)).toBe(30 * PX_PER_MINUTE);
    expect(minuteToY(segments, 25 * 60)).toBe(60 * PX_PER_MINUTE + GAP_SEGMENT_PX);
  });

  it("splits overlapping items in the same column into lanes", () => {
    const overlapping = [
      { id: 1, column: "mx", start: 1500, duration: 30 },
      { id: 2, column: "mx", start: 1515, duration: 30 },
      { id: 3, column: "mx", start: 1545, duration: 15 }
    ];
    const placed = placeItems(overlapping, buildSegments(overlapping));
    expect(placed.get(1)).toMatchObject({ lane: 0, lanes: 2 });
    expect(placed.get(2)).toMatchObject({ lane: 1, lanes: 2 });
    // Starts exactly when #2 ends: half-open intervals do not overlap, so it gets the full width.
    expect(placed.get(3)).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("returns no segments for an empty day", () => {
    expect(buildSegments([])).toEqual([]);
  });
});
