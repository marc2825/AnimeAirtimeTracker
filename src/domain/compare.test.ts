import { describe, expect, it } from "vitest";

import { alignSeasons, delayBucketLabels, overlapOf, parseCompareSide, sharedChannelSlugs, sideLabel, summarizeSlot, type SlotForCompare } from "./compare";

describe("compare sides", () => {
  it("parses regions and tracked channels, and nothing else", () => {
    expect(parseCompareSide("kanto")).toEqual({ kind: "region", key: "kanto" });
    expect(parseCompareSide("mx")).toEqual({ kind: "channel", slug: "mx" });
    expect(parseCompareSide("nope")).toBeNull();
    expect(parseCompareSide(undefined)).toBeNull();
    expect(sideLabel({ kind: "channel", slug: "mx" })).toBe("TOKYO MX");
  });

  it("finds channels both sides receive, such as NHK in Kanto and Kansai", () => {
    expect(sharedChannelSlugs({ kind: "region", key: "kanto" }, { kind: "region", key: "kansai" }).sort()).toEqual(["nhk-e", "nhk-g"]);
    expect(sharedChannelSlugs({ kind: "region", key: "kanto" }, { kind: "channel", slug: "mx" })).toEqual(["mx"]);
    expect(sharedChannelSlugs({ kind: "channel", slug: "mx" }, { kind: "channel", slug: "bs11" })).toEqual([]);
  });

  it("words the delay buckets for the second side", () => {
    expect(delayBucketLabels("BS11").map((b) => b.label)).toContain("BS11が1〜7日後");
  });

  it("summarises overlap and the median delay", () => {
    const overlap = overlapOf({
      compared: [
        { titleId: 1, delayMinutes: 30, episodes: 3 },
        { titleId: 2, delayMinutes: 1440, episodes: 3 },
        { titleId: 3, delayMinutes: 60, episodes: 1 }
      ],
      buckets: { "kansai-earlier": 0, "same-time": 2, "within-day": 1, "within-week": 0, "over-week": 0 },
      kantoOnly: 4,
      kansaiOnly: 2,
      unmatched: 1
    });
    expect(overlap).toEqual({ both: 4, onlyA: 4, onlyB: 2, timed: 3, medianDelay: 60 });
  });
});

describe("slot comparison", () => {
  const slot = (slug: string, seasons: [number, number | null, number, boolean?][]): SlotForCompare => ({
    slug,
    timeline: seasons.map(([ordinal, minute, titles, moved]) => ({ ordinal, position: minute === null ? null : { weekday: 4, minute, durationMinutes: 30 }, titles, moved: Boolean(moved) }))
  });

  it("summarises seasons, moves, length and titles per season", () => {
    const summary = summarizeSlot(slot("a", [[20253, 1410, 1], [20254, null, 0], [20261, 1440, 2, true]]));
    expect(summary).toEqual({ slug: "a", seasons: 2, firstOrdinal: 20253, lastOrdinal: 20261, moves: 1, averageDuration: 30, titlesPerSeason: 1.5 });
  });

  it("aligns slots on every season between the first and the last, across years", () => {
    const rows = alignSeasons([slot("a", [[20254, 1410, 1]]), slot("b", [[20261, 1500, 1], [20262, 1500, 1]])]);
    expect(rows.map((row) => row.ordinal)).toEqual([20254, 20261, 20262]);
    expect(rows[0]!.cells.map((cell) => cell?.position?.minute ?? null)).toEqual([1410, null]);
    expect(rows[2]!.cells.map((cell) => cell?.position?.minute ?? null)).toEqual([null, 1500]);
  });
});
