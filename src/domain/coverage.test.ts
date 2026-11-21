import { describe, expect, it } from "vitest";

import { channelSlugsFor, channelsInNetwork, parseNetworkKey } from "./coverage";

const slugs = (set: Set<string> | null) => (set ? [...set].sort() : null);

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
