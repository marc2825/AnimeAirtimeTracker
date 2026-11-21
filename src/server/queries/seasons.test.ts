import { describe, expect, it } from "vitest";

import { groupPremieres, type PremiereRow } from "./seasons";

const CHANNELS = [
  { id: 1, slug: "mx", shortName: "MX" },
  { id: 2, slug: "bs11", shortName: "BS11" },
  { id: 3, slug: "at-x", shortName: "AT-X" }
];
const row = (titleId: number, channelId: number, iso: string, minute: number): PremiereRow => ({
  titleId,
  slug: String(titleId),
  name: `title ${titleId}`,
  channelId,
  startAt: new Date(iso),
  animeDate: new Date("2026-10-05T00:00:00Z"),
  animeWeekday: 0,
  animeStartMinute: minute
});

describe("groupPremieres", () => {
  it("places each title at its earliest first-episode airing and counts the other channels", () => {
    const premieres = groupPremieres(
      [
        row(1, 3, "2026-10-05T12:30:00Z", 21 * 60 + 30), // AT-X first
        row(1, 1, "2026-10-05T15:00:00Z", 24 * 60),
        row(1, 2, "2026-10-06T14:00:00Z", 23 * 60),
        row(1, 2, "2026-10-13T14:00:00Z", 23 * 60), // a second flagged airing on the same channel counts once
        row(2, 1, "2026-10-05T14:00:00Z", 23 * 60)
      ],
      CHANNELS
    );
    expect(premieres).toHaveLength(2);
    expect(premieres[0]).toMatchObject({ titleId: 1, channelSlug: "at-x", animeStartMinute: 21 * 60 + 30, otherChannels: 2, animeDate: "2026-10-05" });
    expect(premieres[1]).toMatchObject({ titleId: 2, channelSlug: "mx", otherChannels: 0 });
  });

  it("skips airings on channels that are not tracked", () => {
    expect(groupPremieres([row(1, 99, "2026-10-05T12:30:00Z", 1290)], CHANNELS)).toEqual([]);
  });
});
