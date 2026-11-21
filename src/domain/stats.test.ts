import { describe, expect, it } from "vitest";

import { computeTitlePositions, deriveSlots, type SlotInputBroadcast } from "./slots";
import { channelBreakdown, concurrencyProfile, delayBucket, regionalDelay, seasonTrend, weekdayHourMatrix, type StatAiring } from "./stats";
import { addDays, fromAnimeTime } from "./time";

function airing(partial: Partial<StatAiring> & Pick<StatAiring, "titleId" | "animeDate" | "animeStartMinute">): StatAiring {
  const weekday = (new Date(`${partial.animeDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  return {
    channelId: 1,
    animeWeekday: weekday,
    durationMinutes: 30,
    startAt: fromAnimeTime(partial.animeDate, partial.animeStartMinute),
    episodeNumber: null,
    ...partial
  };
}

/** Four weekly airings of a title from a Monday. */
function weekly(titleId: number, firstDate: string, minute: number, extra: Partial<StatAiring> = {}): StatAiring[] {
  return [0, 7, 14, 21].map((offset, index) => airing({ titleId, animeDate: addDays(firstDate, offset), animeStartMinute: minute, episodeNumber: index + 1, ...extra }));
}

describe("weekdayHourMatrix", () => {
  const data = [...weekly(1, "2026-10-05", 25 * 60), ...weekly(2, "2026-10-05", 25 * 60 + 30), ...weekly(3, "2026-10-06", 23 * 60)];

  it("counts each title once per cell in title units", () => {
    const matrix = weekdayHourMatrix(data, "titles");
    expect(matrix.cells[0]![25 - 5]).toBe(2); // Monday 25時台: titles 1 and 2
    expect(matrix.cells[1]![23 - 5]).toBe(1);
    expect(matrix.total).toBe(3);
    expect(matrix.max).toBe(2);
  });

  it("counts every airing in broadcast units", () => {
    const matrix = weekdayHourMatrix(data, "broadcasts");
    expect(matrix.cells[0]![25 - 5]).toBe(8);
    expect(matrix.total).toBe(12);
  });

  it("returns an all-zero matrix for empty input", () => {
    const matrix = weekdayHourMatrix([], "titles");
    expect(matrix.max).toBe(0);
    expect(matrix.total).toBe(0);
    expect(matrix.cells.flat().every((value) => value === 0)).toBe(true);
  });
});

describe("seasonTrend", () => {
  it("separates titles, broadcasts and new titles per season and computes late-night share", () => {
    const rows = seasonTrend([
      ...weekly(1, "2026-09-07", 25 * 60), // summer, late night
      ...weekly(1, "2026-10-05", 25 * 60), // continues into autumn
      ...weekly(2, "2026-10-05", 22 * 60) // autumn, prime time
    ]);
    expect(rows).toEqual([
      { seasonOrdinal: 20263, titles: 1, broadcasts: 4, newTitles: 1, lateNightShare: 1, bandTitles: {} },
      { seasonOrdinal: 20264, titles: 2, broadcasts: 8, newTitles: 1, lateNightShare: 0.5, bandTitles: {} }
    ]);
  });

  it("counts each title once per season in the band of its modal start time", () => {
    const bands = [
      { key: "prime", from: 19 * 60, to: 23 * 60 },
      { key: "late", from: 23 * 60, to: 25 * 60 },
      { key: "latelate", from: 25 * 60, to: 29 * 60 }
    ];
    const rows = seasonTrend(
      [
        ...weekly(1, "2026-10-05", 25 * 60), // 25:00 → latelate
        ...weekly(2, "2026-10-05", 23 * 60), // 23:00 boundary → late
        ...weekly(3, "2026-10-05", 22 * 60 + 59), // 22:59 → prime
        // Title 4 moves from 22:00 (3 weeks) to 24:30 (1 week): its modal start stays prime.
        ...weekly(4, "2026-10-05", 22 * 60).slice(0, 3),
        ...weekly(4, "2026-10-26", 24 * 60 + 30).slice(0, 1)
      ],
      bands
    );
    expect(rows[0]!.bandTitles).toEqual({ prime: 2, late: 1, latelate: 1 });
    expect(Object.values(rows[0]!.bandTitles).reduce((a, b) => a + b, 0)).toBe(rows[0]!.titles);
  });
});

describe("channelBreakdown", () => {
  it("ranks channels by distinct titles", () => {
    const rows = channelBreakdown([...weekly(1, "2026-10-05", 1500, { channelId: 7 }), ...weekly(2, "2026-10-05", 1530, { channelId: 7 }), ...weekly(3, "2026-10-05", 1500, { channelId: 9 })]);
    expect(rows[0]).toEqual({ channelId: 7, titles: 2, broadcasts: 8 });
    expect(rows[1]).toEqual({ channelId: 9, titles: 1, broadcasts: 4 });
  });
});

describe("concurrencyProfile", () => {
  it("uses half-open intervals so back-to-back shows do not overlap", () => {
    const profile = concurrencyProfile(
      [
        { titleId: 1, channelId: 1, weekday: 0, startMinute: 1500, durationMinutes: 30 },
        { titleId: 2, channelId: 2, weekday: 0, startMinute: 1530, durationMinutes: 30 },
        { titleId: 3, channelId: 3, weekday: 0, startMinute: 1515, durationMinutes: 30 }
      ],
      { bucketMinutes: 15, fromMinute: 1500, toMinute: 1560 }
    );
    expect(profile.counts[0]).toEqual([1, 2, 2, 1]);
    expect(profile.peak).toEqual({ count: 2, weekday: 0, minute: 1515 });
  });

  it("has no peak when empty", () => {
    expect(concurrencyProfile([]).peak).toBeNull();
  });
});

describe("regionalDelay", () => {
  it("matches episodes and takes the median delay per title", () => {
    const kanto = [...weekly(1, "2026-10-05", 25 * 60), ...weekly(2, "2026-10-05", 24 * 60), ...weekly(3, "2026-10-05", 23 * 60)];
    const kansai = [
      ...weekly(1, "2026-10-08", 26 * 60, { channelId: 2 }), // three days + 1h later
      ...weekly(2, "2026-10-05", 24 * 60 + 30, { channelId: 2 }), // 30 min later
      ...weekly(4, "2026-10-05", 23 * 60, { channelId: 2 })
    ];
    const result = regionalDelay(kanto, kansai);
    expect(result.compared).toEqual([
      { titleId: 1, delayMinutes: 3 * 24 * 60 + 60, episodes: 4 },
      { titleId: 2, delayMinutes: 30, episodes: 4 }
    ]);
    expect(result.buckets["within-week"]).toBe(1);
    expect(result.buckets["same-time"]).toBe(1);
    expect(result.kantoOnly).toBe(1);
    expect(result.kansaiOnly).toBe(1);
  });

  it("buckets boundaries consistently", () => {
    expect(delayBucket(-181)).toBe("kansai-earlier");
    expect(delayBucket(180)).toBe("same-time");
    expect(delayBucket(24 * 60)).toBe("within-day");
    expect(delayBucket(7 * 24 * 60 + 1)).toBe("over-week");
  });
});

describe("slots", () => {
  const toSlotInput = (a: StatAiring, extra: Partial<SlotInputBroadcast> = {}): SlotInputBroadcast => ({ ...a, isRerun: false, deleted: false, ...extra });

  it("requires a minimum number of airings for a regular position and ignores reruns", () => {
    const positions = computeTitlePositions([
      ...weekly(1, "2026-10-05", 1500).map((a) => toSlotInput(a)),
      ...weekly(2, "2026-10-05", 1530).slice(0, 2).map((a) => toSlotInput(a)),
      ...weekly(3, "2026-10-05", 1560).map((a) => toSlotInput(a, { isRerun: true }))
    ]);
    expect(positions.map((p) => p.titleId)).toEqual([1]);
    expect(positions[0]).toMatchObject({ weekday: 0, startMinute: 1500, count: 4, seasonOrdinal: 20264 });
  });

  it("derives labelled slots with a home channel and infers recurring positions", () => {
    const broadcasts: SlotInputBroadcast[] = [
      ...weekly(1, "2026-04-06", 1500, { channelId: 10 }),
      ...weekly(2, "2026-07-06", 1500, { channelId: 10 }),
      ...weekly(3, "2026-10-05", 1500, { channelId: 10 }),
      ...weekly(3, "2026-10-08", 1560, { channelId: 20 }) // same title also on a second channel
    ].map((a) => toSlotInput(a));
    const slots = deriveSlots({
      titles: [
        { id: 1, externalId: "1", slotLabels: ["テスト枠"], evidence: { テスト枠: "「テスト枠」枠で放送" } },
        { id: 2, externalId: "2", slotLabels: ["テスト枠"], evidence: {} },
        { id: 3, externalId: "3", slotLabels: [], evidence: {} }
      ],
      channels: [
        { id: 10, slug: "mx", shortName: "MX", sortOrder: 1 },
        { id: 20, slug: "bs11", shortName: "BS11", sortOrder: 2 }
      ],
      broadcasts,
      registry: [],
      membershipOverrides: [{ slot: "mx-mon-2500", titleExternalId: "3", action: "remove", reason: "test" }]
    });
    const labelled = slots.find((slot) => slot.kind === "SOURCE_LABEL")!;
    expect(labelled.slug).toBe("テスト枠");
    expect(labelled.homeChannelId).toBe(10);
    expect(labelled.seasons.map((s) => s.seasonOrdinal)).toEqual([20262, 20263]);
    expect(labelled.seasons.map((s) => s.titleIds)).toEqual([[1], [2]]);
    expect(labelled.memberships.find((m) => m.titleId === 1)?.evidence).toContain("テスト枠");

    const inferred = slots.find((slot) => slot.kind === "INFERRED")!;
    expect(inferred.slug).toBe("mx-mon-2500");
    expect(inferred.name).toBe("MX 月曜25:00枠");
    expect(inferred.seasons).toHaveLength(3);
    // The manual override removed title 3 from the inferred slot.
    expect(inferred.memberships.map((m) => m.titleId).sort()).toEqual([1, 2]);
  });

  it("treats a multi-title block as one position (no false time moves)", () => {
    // Two shows per season at 23:00 and 23:30 in the same labelled slot.
    const broadcasts: SlotInputBroadcast[] = [
      ...weekly(1, "2026-07-06", 1380, { channelId: 10 }),
      ...weekly(2, "2026-07-06", 1410, { channelId: 10 }),
      ...weekly(3, "2026-10-05", 1410, { channelId: 10 }),
      ...weekly(4, "2026-10-05", 1380, { channelId: 10 })
    ].map((a) => toSlotInput(a));
    const titles = [1, 2, 3, 4].map((id) => ({ id, externalId: String(id), slotLabels: ["ブロック"], evidence: {} }));
    const [slot] = deriveSlots({ titles, channels: [{ id: 10, slug: "ntv", shortName: "日テレ", sortOrder: 1 }], broadcasts, registry: [], membershipOverrides: [] });
    expect(slot!.seasons.map((s) => [s.animeStartMinute, s.durationMinutes])).toEqual([
      [1380, 60],
      [1380, 60]
    ]);
    // Titles are listed in the order they first aired, not by id.
    expect(slot!.seasons.map((s) => s.titleIds)).toEqual([
      [1, 2],
      [4, 3]
    ]);
    expect(slot!.seasons.every((s) => s.titleCount === s.titleIds.length)).toBe(true);
  });

  it("skips labels with a single member unless curated", () => {
    const slots = deriveSlots({
      titles: [{ id: 1, externalId: "1", slotLabels: ["単独枠"], evidence: {} }],
      channels: [{ id: 10, slug: "mx", shortName: "MX", sortOrder: 1 }],
      broadcasts: weekly(1, "2026-10-05", 1500, { channelId: 10 }).map((a) => toSlotInput(a)),
      registry: [],
      membershipOverrides: []
    });
    expect(slots).toEqual([]);
  });
});
