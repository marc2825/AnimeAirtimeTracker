import { describe, expect, it } from "vitest";

import { headlineSlots, nextAiring } from "./title-headline";

const at = (iso: string, extra: Partial<{ deleted: boolean; missing: boolean }> = {}) => ({ startAt: new Date(iso), deleted: false, missing: false, ...extra });

describe("nextAiring", () => {
  const now = new Date("2026-11-24T12:00:00Z");

  it("picks the earliest airing still to come across channels", () => {
    const groups = [
      { name: "TBS", broadcasts: [at("2026-11-20T16:23:00Z"), at("2026-11-27T16:23:00Z")] },
      { name: "AT-X", broadcasts: [at("2026-11-28T12:00:00Z")] }
    ];
    const next = nextAiring(groups, now);
    expect(next?.group.name).toBe("TBS");
    expect(next?.airing.startAt.toISOString()).toBe("2026-11-27T16:23:00.000Z");
  });

  it("skips deleted and no longer listed airings, and has nothing once everything has aired", () => {
    const groups = [{ name: "MX", broadcasts: [at("2026-11-25T15:00:00Z", { deleted: true }), at("2026-11-26T15:00:00Z", { missing: true }), at("2026-12-01T15:00:00Z")] }];
    expect(nextAiring(groups, now)?.airing.startAt.toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(nextAiring([{ name: "MX", broadcasts: [at("2026-11-01T15:00:00Z")] }], now)).toBeNull();
    // An airing starting exactly now has started.
    expect(nextAiring([{ name: "MX", broadcasts: [at("2026-11-24T12:00:00Z")] }], now)).toBeNull();
  });
});

describe("headlineSlots", () => {
  it("names official and source-named slots first, then inferred slots on the headline channel", () => {
    const slots = [
      { slug: "atx-sat-2100", kind: "INFERRED", channelShortName: "AT-X" },
      { slug: "tbs-fri-2523", kind: "INFERRED", channelShortName: "TBS" },
      { slug: "animeism", kind: "SOURCE_LABEL", channelShortName: "TBS" }
    ];
    expect(headlineSlots(slots, "TBS")).toEqual({ shown: [slots[2], slots[1]], more: 1 });
    expect(headlineSlots([], "TBS")).toEqual({ shown: [], more: 0 });
  });
});
