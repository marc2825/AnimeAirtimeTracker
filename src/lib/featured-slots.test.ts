import { describe, expect, it } from "vitest";

import { pickFeaturedSlots, type FeaturedSlotCandidate } from "./featured-slots";

const slot = (slug: string, kind: FeaturedSlotCandidate["kind"], latest: number | null, seasonCount = 4): FeaturedSlotCandidate => ({
  slug,
  kind,
  seasonCount,
  latest: latest === null ? null : { seasonOrdinal: latest }
});

describe("pickFeaturedSlots", () => {
  it("features named slots on air in the latest or previous season, keeping the list order", () => {
    const slots = [slot("ended", "SOURCE_LABEL", 20241, 19), slot("a", "SOURCE_LABEL", 20264, 18), slot("inferred", "INFERRED", 20264, 30), slot("b", "OFFICIAL", 20263), slot("c", "SOURCE_LABEL", 20264)];
    const { featured, more } = pickFeaturedSlots(slots, 20264, 2);
    expect(featured.map((s) => s.slug)).toEqual(["a", "b"]);
    expect(more.map((s) => s.slug)).toEqual(["c"]);
  });

  it("crosses the year when finding the previous season", () => {
    const { featured } = pickFeaturedSlots([slot("autumn", "SOURCE_LABEL", 20264), slot("old", "SOURCE_LABEL", 20263)], 20271, 8);
    expect(featured.map((s) => s.slug)).toEqual(["autumn", "old"]);
    // "old" is not on air in winter 2027; it only fills an empty place.
    expect(pickFeaturedSlots([slot("autumn", "SOURCE_LABEL", 20264), slot("old", "SOURCE_LABEL", 20263)], 20271, 1).featured.map((s) => s.slug)).toEqual(["autumn"]);
  });

  it("fills with other named slots when too few are on air, never with inferred or empty ones", () => {
    const slots = [slot("ended", "SOURCE_LABEL", 20201), slot("now", "OFFICIAL", 20264), slot("guess", "INFERRED", 20264), slot("empty", "SOURCE_LABEL", null, 0)];
    const { featured, more } = pickFeaturedSlots(slots, 20264, 4);
    expect(featured.map((s) => s.slug)).toEqual(["now", "ended"]);
    expect(more).toEqual([]);
  });
});
