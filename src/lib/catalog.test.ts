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
  it("builds slot aggregates with summary distributions and time history", () => {
    const slot = getSlotBySlug("bs-select");

    expect(slot?.titles.length).toBeGreaterThan(3);
    expect(slot?.firstRunCount).toBeGreaterThan(0);
    expect(slot?.channelDistribution[0]?.channel.slug).toBe("bs11");
    expect(slot?.weekdayDistribution.length).toBeGreaterThan(0);
    expect(slot?.timeDistribution.length).toBeGreaterThan(0);
    expect(slot?.timeChanges[0]?.animeScheduleText).toContain("曜");
    expect(slot?.timeChanges[0]?.broadcastStartAt).toContain("T");
    expect(slot?.yearCounts.every((item) => item.share >= 0)).toBe(true);
    expect(slot?.topGenres.length).toBeGreaterThan(0);
  });
});

describe("dashboard data", () => {
  it("creates dashboard slices for heatmaps, trends, overlaps, and regional comparison", () => {
    const dashboard = getDashboardData();

    expect(dashboard.weekdayHeatmap).toHaveLength(4);
    expect(dashboard.quarterTrend.length).toBeGreaterThan(0);
    expect(dashboard.channelTimeHeatmap.columns.length).toBeGreaterThan(0);
    expect(dashboard.overlapTable.length).toBeGreaterThan(0);
    expect(dashboard.durationTable.find((row) => row.duration === "STANDARD_30")?.titleCount).toBeGreaterThan(0);
    expect(dashboard.regionTable.find((row) => row.regionName === "関東")?.titleCount).toBeGreaterThan(0);
  });

  it("applies dashboard filters to the aggregated slice", () => {
    const dashboard = getDashboardData({
      year: "2024",
      channel: "tokyo-mx"
    });

    expect(dashboard.summary.titleCount).toBeGreaterThan(0);
    expect(dashboard.channelTimeHeatmap.columns).toHaveLength(1);
    expect(dashboard.channelTimeHeatmap.columns[0]?.slug).toBe("tokyo-mx");
    expect(dashboard.quarterTrend.every((row) => row.label.startsWith("2024年"))).toBe(true);
  });
});
