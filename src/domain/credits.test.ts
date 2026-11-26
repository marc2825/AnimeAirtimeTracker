import { describe, expect, it } from "vitest";

import { bandOf, computeCreditProfiles, creditKey, type CreditSlotInput, type TitleCredits } from "./credits";

const member = (titleId: number, seasonOrdinal: number | null, channelId: number | null = null) => ({ titleId, channelId, seasonOrdinal });
const credits = (entries: [number, string[], string[]?][]) => new Map<number, TitleCredits>(entries.map(([id, studios, publishers]) => [id, { studios, publishers: publishers ?? [] }]));
const noAliases = { studios: {}, publishers: {} };

/** Slot A (channel 1): OLM three seasons running under two spellings, then J.C.STAFF. Slot B (channel 2): J.C.STAFF earlier. */
const slots: CreditSlotInput[] = [
  { slug: "a", homeChannelId: 1, members: [member(1, 20241), member(2, 20242), member(3, 20243), member(4, 20244), member(5, 20251)] },
  { slug: "b", homeChannelId: 2, members: [member(6, 20231), member(7, 20232), member(8, 20233)] }
];
const titleCredits = credits([
  [1, ["オー・エル・エム"]],
  [2, ["OLM"]],
  [3, ["OLM"]],
  [4, ["J.C.STAFF"]],
  [5, [], ["集英社"]],
  [6, ["J.C.STAFF"]],
  [7, ["J.C.Staff"]],
  [8, ["J.C.STAFF"]]
]);
const profiles = computeCreditProfiles({ slots, credits: titleCredits, aliases: { studios: { OLM: ["オー・エル・エム"] }, publishers: {} }, latestSeason: 20251 });

describe("credit profiles", () => {
  it("compares names without case, spaces or punctuation", () => {
    expect(creditKey("SILVER LINK.")).toBe(creditKey("silver link"));
    expect(creditKey("スタジオ・ファンタジア")).toBe(creditKey("スタジオファンタジア"));
  });

  it("counts titles per name, joins aliases and spellings, and names a dominant studio", () => {
    const studio = profiles.get("a")!.roles.studio;
    expect(studio.known).toBe(4);
    expect(studio.top).toEqual([
      { name: "OLM", titles: 3, firstSeason: 20241, lastSeason: 20243 },
      { name: "J.C.STAFF", titles: 1, firstSeason: 20244, lastSeason: 20244 }
    ]);
    expect(studio.dominant).toEqual({ name: "OLM", titles: 3, share: 0.75 });
    // The spelling most titles use is the one shown.
    expect(profiles.get("b")!.roles.studio.top[0]).toMatchObject({ name: "J.C.STAFF", titles: 3 });
    // One title naming a publisher is not enough for dominance.
    expect(profiles.get("a")!.roles.publisher).toMatchObject({ known: 1, dominant: null });
  });

  it("backtests each title from earlier seasons only, next to channel and overall baselines", () => {
    // t2, t3: OLM predicted and right (one and two titles of history); t4: OLM predicted (3 titles, share 1) but J.C.STAFF.
    // Channel 1 before t2/t3/t4: OLM → right, right, wrong. Overall: J.C.STAFF leads (3 vs 1, 2), then ties 3–3 with OLM
    // before t4 and wins on name order → wrong, wrong, right.
    expect(profiles.get("a")!.roles.studio.backtest).toEqual({
      n: 3,
      top1: 2,
      top3: 2,
      channelTop1: 2,
      globalTop1: 1,
      bands: { high: { n: 1, top1: 0 }, mid: { n: 0, top1: 0 }, low: { n: 0, top1: 0 }, short: { n: 2, top1: 2 } }
    });
    expect(profiles.get("b")!.roles.studio.backtest).toMatchObject({ n: 2, top1: 2 });
  });

  it("predicts the next season for slots on air, weighting recent seasons more", () => {
    // Target winter→spring 2025 (20252). Weights 0.7^distance: OLM 0.7^5 + 0.7^4 + 0.7^3 = 0.75117, J.C.STAFF 0.7^2 = 0.49.
    expect(profiles.get("a")!.roles.studio.prediction).toEqual({
      season: 20252,
      candidates: [
        { name: "OLM", share: 0.605 },
        { name: "J.C.STAFF", share: 0.395 }
      ],
      band: "mid",
      history: 4
    });
    // Slot B last aired in 2023: no prediction.
    expect(profiles.get("b")!.roles.studio.prediction).toBeNull();
  });

  it("bands predictions by the top share and the number of past titles", () => {
    expect(bandOf(0.9, 2)).toBe("short");
    expect(bandOf(0.8, 3)).toBe("high");
    expect(bandOf(0.6, 5)).toBe("mid");
    expect(bandOf(0.59, 5)).toBe("low");
  });
});

describe("similar slots", () => {
  const four = (base: number) => [member(base, 20241), member(base + 1, 20242), member(base + 2, 20243), member(base + 3, 20244)];
  const similar = computeCreditProfiles({
    slots: [
      { slug: "c", homeChannelId: 1, members: four(10) },
      { slug: "d", homeChannelId: 1, members: four(20) },
      { slug: "e", homeChannelId: 1, members: four(30) },
      // Same titles as C: related, not "similar".
      { slug: "f", homeChannelId: 1, members: four(10) }
    ],
    credits: credits([
      [10, ["X"]], [11, ["X"]], [12, ["Y"]], [13, ["Y"]],
      [20, ["X"]], [21, ["X"]], [22, ["Y"]], [23, ["Y"]],
      [30, ["Z"]], [31, ["Z"]], [32, ["Z"]], [33, ["Z"]]
    ]),
    aliases: noAliases,
    latestSeason: 20244
  });

  it("lists slots with the same mix of names, never ones that share titles", () => {
    expect(similar.get("c")!.similar).toEqual([{ slug: "d", score: 1 }]);
    expect(similar.get("e")!.similar).toEqual([]);
  });
});
