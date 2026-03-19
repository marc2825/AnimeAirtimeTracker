import { describe, expect, it } from "vitest";

import { filterTitles, getDashboardData, getSlotBySlug, getTitleBySlug } from "@/lib/catalog";

describe("catalog filters", () => {
  it("filters titles by year and weekday", () => {
    const results = filterTitles({
      year: "2024",
      weekday: "TUE"
    });

    expect(results.map((entry) => entry.title.slug)).toContain("august-archive");
    expect(results.every((entry) => entry.title.seasonYear === 2024)).toBe(true);
  });

  it("finds a title detail with airings and slots", () => {
    const title = getTitleBySlug("moonlight-signal");

    expect(title?.airings.length).toBeGreaterThan(1);
    expect(title?.slots[0]?.slug).toBe("urban-monday");
  });
});

describe("slot detail", () => {
  it("builds slot aggregates", () => {
    const slot = getSlotBySlug("bs-select");

    expect(slot?.titles.length).toBeGreaterThan(3);
    expect(slot?.topGenres.length).toBeGreaterThan(0);
  });
});

describe("dashboard data", () => {
  it("creates a heatmap and summary tables", () => {
    const dashboard = getDashboardData();

    expect(dashboard.heatmap).toHaveLength(4);
    expect(dashboard.slotTable.length).toBeGreaterThan(0);
    expect(dashboard.regionTable.find((row) => row.regionName === "関東")?.titleCount).toBeGreaterThan(0);
  });
});
