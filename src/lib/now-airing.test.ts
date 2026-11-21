import { describe, expect, it } from "vitest";

import { airingsOnAir } from "./now-airing";

const at = (iso: string) => Date.parse(iso);
const AIRINGS = [
  { id: 1, channelOrder: 25, startAt: "2026-11-16T14:00:00Z", endAt: "2026-11-16T14:30:00Z" }, // MX 23:00–23:30 JST
  { id: 2, channelOrder: 40, startAt: "2026-11-16T14:00:00Z", endAt: "2026-11-16T14:30:00Z" }, // BS11 23:00–23:30
  { id: 3, channelOrder: 25, startAt: "2026-11-16T14:30:00Z", endAt: "2026-11-16T15:00:00Z" } // MX 23:30–24:00
];

describe("airingsOnAir", () => {
  it("includes the start minute and excludes the end minute", () => {
    expect(airingsOnAir(AIRINGS, at("2026-11-16T14:00:00Z")).map((a) => a.id)).toEqual([1, 2]);
    expect(airingsOnAir(AIRINGS, at("2026-11-16T14:29:59Z")).map((a) => a.id)).toEqual([1, 2]);
    expect(airingsOnAir(AIRINGS, at("2026-11-16T14:30:00Z")).map((a) => a.id)).toEqual([3]);
    expect(airingsOnAir(AIRINGS, at("2026-11-16T15:00:00Z"))).toEqual([]);
  });

  it("orders by channel", () => {
    expect(airingsOnAir([...AIRINGS].reverse(), at("2026-11-16T14:10:00Z")).map((a) => a.channelOrder)).toEqual([25, 40]);
  });
});
