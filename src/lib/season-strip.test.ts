import { describe, expect, it } from "vitest";

import { STRIP_NAMES_UNKNOWN, STRIP_NO_POSITION, stripTickLabel, stripTicks, stripTooltipText } from "./season-strip";

describe("stripTicks", () => {
  const end = { year: 2026, quarter: 4 } as const;

  it("covers the window oldest first and crosses year boundaries", () => {
    const ticks = stripTicks([], end, 5);
    expect(ticks.map((tick) => tick.ordinal)).toEqual([20254, 20261, 20262, 20263, 20264]);
    expect(ticks[0]!.heading).toBe("2025年秋");
  });

  it("names the titles of filled seasons in the stored order", () => {
    const [tick] = stripTicks([20264], end, 1, { 20264: [{ name: "作品B", slug: "200" }, { name: "作品A", slug: "100" }] });
    // A double-click opens the first title.
    expect(tick).toMatchObject({ on: true, lines: ["作品B", "作品A"], slug: "200" });
    expect(stripTickLabel(tick!)).toBe("2026年秋：作品B、作品A");
  });

  it("never invents names: filled seasons without stored names and empty seasons say so", () => {
    const ticks = stripTicks([20263], end, 2, { 20264: [{ name: "別の枠の作品", slug: "1" }] });
    expect(ticks[0]).toMatchObject({ on: true, lines: [STRIP_NAMES_UNKNOWN], slug: null });
    // Names for a season the slot did not hold are ignored.
    expect(ticks[1]).toMatchObject({ on: false, lines: [STRIP_NO_POSITION], slug: null });
  });
});

describe("stripTooltipText", () => {
  it("reads the season from the tick position and the names back from the markup", () => {
    expect(stripTooltipText(20264, 12, 11, null)).toEqual({ heading: "2026年秋", lines: [STRIP_NO_POSITION] });
    expect(stripTooltipText(20264, 12, 0, null).heading).toBe("2024年冬");
    const [tick] = stripTicks([20264], { year: 2026, quarter: 4 }, 1, { 20264: [{ name: "ひとつ、ふたつ", slug: "1" }] });
    // A single name may contain the list separator: it is taken whole from the label.
    expect(stripTooltipText(20264, 1, 0, { label: stripTickLabel(tick!), names: null }).lines).toEqual(["ひとつ、ふたつ"]);
    expect(stripTooltipText(20264, 1, 0, { label: "2026年秋：A、B", names: "A\nB" }).lines).toEqual(["A", "B"]);
  });
});
