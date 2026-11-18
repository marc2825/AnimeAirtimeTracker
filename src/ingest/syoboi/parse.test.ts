import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractOfficialUrl, extractSlotLabels, normalizeProgram, normalizeTitle, toSeriesKey } from "./normalize";
import { parseChGroupLookup, parseChLookup, parseProgLookup, parseTitleLookup, SyoboiResultError } from "./parse";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("db.php envelope", () => {
  it("throws on Result/Code errors even though HTTP was 200", () => {
    expect(() => parseProgLookup(fixture("result-400.xml"))).toThrow(SyoboiResultError);
    try {
      parseProgLookup(fixture("result-400.xml"));
    } catch (error) {
      expect((error as SyoboiResultError).code).toBe(400);
    }
  });

  it("treats Result/Code 404 as an empty result", () => {
    expect(parseProgLookup(fixture("result-404.xml"))).toEqual({ items: [], rejected: [], rowCount: 0 });
  });

  it("rejects non-XML and wrong-root responses", () => {
    expect(() => parseProgLookup("<html><body>Bad Request</body></html>")).toThrow(SyoboiResultError);
    expect(() => parseProgLookup(fixture("titles-sample.xml"))).toThrow(/missing <ProgLookupResponse>/);
  });

  it("quarantines invalid rows instead of failing the batch", () => {
    const result = parseProgLookup(fixture("malformed-row.xml"));
    expect(result.rowCount).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/TID|StTime/);
  });
});

describe("ProgLookup (recorded 2026-11-18, ChID 19/128/3, one anime day)", () => {
  const result = parseProgLookup(fixture("prog-2026-11-16-mx-bs11-cx.xml"));

  it("parses every row", () => {
    expect(result.rowCount).toBe(15);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes deleted reruns, empty counts and late-night times", () => {
    const deleted = normalizeProgram(result.items.find((item) => item.PID === "715750")!);
    expect(deleted).toMatchObject({ deleted: true, flagRerun: true, episodeNumber: 12, durationMinutes: 30 });

    const special = normalizeProgram(result.items.find((item) => item.PID === "724817")!);
    expect(special.episodeNumber).toBeNull();
    expect(special.episodeLabel).toBeNull();
    expect(special.flagNote).toBe(true);
    expect(special.comment).toContain("総集編");

    const lateNight = normalizeProgram(result.items.find((item) => item.PID === "721549")!);
    expect(lateNight.animeDate).toBe("2026-11-16");
    expect(lateNight.animeStartMinute).toBe(24 * 60 + 30); // Tuesday 00:30 = Monday 24:30
    expect(lateNight.animeWeekday).toBe(0);
  });

  it("produces stable content hashes independent of LastUpdate/Revision", () => {
    const item = result.items.find((entry) => entry.PID === "720086")!;
    const a = normalizeProgram(item);
    const b = normalizeProgram({ ...item, Revision: 9, LastUpdate: "2030-01-01 00:00:00" });
    expect(a.contentHash).toBe(b.contentHash);
    const moved = normalizeProgram({ ...item, StTime: "2026-11-16 23:05:00", EdTime: "2026-11-16 23:35:00" });
    expect(moved.contentHash).not.toBe(a.contentHash);
  });
});

describe("TitleLookup", () => {
  const result = parseTitleLookup(fixture("titles-sample.xml"));

  it("parses titles with nullable fields", () => {
    expect(result.rejected).toEqual([]);
    const ongoing = result.items.find((item) => item.TID === "8053")!;
    expect(ongoing.FirstEndYear).toBeNull();
    expect(ongoing.Cat).toBe(1);
  });

  it("extracts source-stated slot labels with their evidence line", () => {
    const nigewaka = normalizeTitle(result.items.find((item) => item.TID === "7953")!);
    expect(nigewaka.slotLabels).toEqual(["ノイタミナ"]);
    expect(extractSlotLabels(result.items.find((item) => item.TID === "7953")!.Comment)[0]?.evidence).toContain("「ノイタミナ」枠で放送");
  });

  it("only accepts http(s) official links", () => {
    expect(normalizeTitle(result.items.find((item) => item.TID === "8053")!).officialUrl).toBe("https://psyren-anime.com/");
    expect(extractOfficialUrl("-[[公式 archive://www.basilisk.jp/]]")).toBeNull();
    expect(extractOfficialUrl("-[[公式 javascript:alert(1)]]")).toBeNull();
  });

  it("derives a series key from the reading", () => {
    expect(toSeriesKey("にげじょうずのわかぎみ")).toBe("にげじょうずのわかぎみ");
    expect(toSeriesKey("ど う も、")).toBe("どうも");
    expect(toSeriesKey(null)).toBeNull();
  });
});

describe("slot label extraction", () => {
  it("accepts explicit statements only", () => {
    expect(extractSlotLabels("-「アニメイズム」枠にて放送\n-「＋Ultra」枠で放送").map((entry) => entry.label)).toEqual(["アニメイズム", "+Ultra"]);
    expect(extractSlotLabels("-「ノイタミナ」枠の後番組")).toEqual([]);
    expect(extractSlotLabels("「ノイタミナ」枠")).toEqual([]);
    expect(extractSlotLabels(null)).toEqual([]);
  });
});

describe("channels", () => {
  it("parses channels and groups", () => {
    const channels = parseChLookup(fixture("channels-tracked.xml"));
    expect(channels.items).toHaveLength(20);
    expect(channels.items.find((channel) => channel.ChID === "19")?.ChName).toBe("TOKYO MX");
    const groups = parseChGroupLookup(fixture("chgroups.xml"));
    expect(groups.items.find((group) => group.ChGID === "1")?.ChGroupName).toBe("テレビ 関東");
  });
});
