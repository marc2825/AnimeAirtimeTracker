import { describe, expect, it } from "vitest";

import { TRACKED_CHANNELS, channelSlugsFor, channelsInNetwork, isTokyoChannel, parseNetworkKey, tokyoFirstRank } from "./coverage";

const slugs = (set: Set<string> | null) => (set ? [...set].sort() : null);

describe("Tokyo-first channel order", () => {
  it("puts TOKYO MX first, then the Tokyo key stations, then NHK, Kansai, BS and CS", () => {
    const order = [...TRACKED_CHANNELS.map((channel) => channel.slug), "unknown"].sort((a, b) => tokyoFirstRank(a) - tokyoFirstRank(b));
    expect(order.slice(0, 6)).toEqual(["mx", "ntv", "tbs", "cx", "ex", "tx"]);
    expect(order.slice(6, 8)).toEqual(["nhk-g", "nhk-e"]);
    expect(order.at(-2)).toBe("at-x");
    expect(order.at(-1)).toBe("unknown");
    expect(["mx", "ntv", "tx"].every(isTokyoChannel)).toBe(true);
    expect(["nhk-g", "mbs", "bs11", "at-x"].some(isTokyoChannel)).toBe(false);
  });
});

describe("networks (系列)", () => {
  it("span terrestrial Kanto, Kansai and BS affiliates", () => {
    expect(channelsInNetwork("ntv").map((c) => c.slug).sort()).toEqual(["bs-ntv", "ntv", "ytv"]);
    expect(channelsInNetwork("tx").map((c) => c.slug).sort()).toEqual(["bs-tx", "tvo", "tx"]);
    expect(channelsInNetwork("independent").map((c) => c.slug).sort()).toEqual(["at-x", "bs11", "mx"]);
  });

  it("intersect with a region", () => {
    expect(slugs(channelSlugsFor("bs", "ntv"))).toEqual(["bs-ntv"]);
    expect(slugs(channelSlugsFor("kansai", "cx"))).toEqual(["ktv"]);
    expect(slugs(channelSlugsFor("cs", "ntv"))).toEqual([]);
    expect(slugs(channelSlugsFor(null, "tbs"))).toEqual(["bs-tbs", "mbs", "tbs"]);
    expect(channelSlugsFor(null, null)).toBeNull();
  });

  it("parse only known keys", () => {
    expect(parseNetworkKey("ex")).toBe("ex");
    for (const bogus of ["constructor", "NTV", "", undefined, null]) expect(parseNetworkKey(bogus)).toBeNull();
  });
});
