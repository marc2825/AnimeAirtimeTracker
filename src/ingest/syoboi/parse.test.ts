import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractCredits, extractOfficialUrl, extractSlotLabels, normalizeProgram, normalizeTitle, parseEpisodeSubtitles, toSeriesKey } from "./normalize";
import { MAX_ITEMS_PER_RESPONSE, MAX_TEXT_LENGTH, parseChGroupLookup, parseChLookup, parseProgLookup, parseTitleLookup, SyoboiResultError } from "./parse";

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

describe("credit extraction (studios, publishers)", () => {
  it("reads the studio and the magazine's publisher from a recorded comment, with the lines as evidence", () => {
    const result = parseTitleLookup(fixture("titles-sample.xml"));
    const basilisk = normalizeTitle(result.items.find((item) => item.TID === "567")!);
    expect(basilisk.studios).toEqual(["GONZO"]);
    expect(basilisk.publishers).toEqual(["講談社"]);
    expect(basilisk.creditEvidence).toEqual([
      { role: "publisher", line: ":掲載誌:ヤングマガジンアッパーズ(講談社)" },
      { role: "studio", line: ":アニメーション制作:GONZO" }
    ]);
    // A title whose comment names neither stays empty: unknown, not guessed.
    const minkyMomo = normalizeTitle(result.items.find((item) => item.TID === "2968")!);
    expect(minkyMomo.studios).toEqual([]);
    expect(minkyMomo.publishers).toEqual([]);
  });

  it("splits joint studios, drops notes in parentheses and keeps names that contain & or a comma", () => {
    expect(extractCredits(":アニメーション制作:アクタス(第1話～第26話)、スタジオコメット(第27話～第52話)").studios).toEqual(["アクタス", "スタジオコメット"]);
    expect(extractCredits(":アニメーション制作:トムス・エンタテインメント(3×Cube)").studios).toEqual(["トムス・エンタテインメント"]);
    expect(extractCredits(":アニメーション制作:OLM×SUNRISE BEYOND").studios).toEqual(["OLM", "SUNRISE BEYOND"]);
    expect(extractCredits(":アニメーション制作:AQUAPLUS／カオスプロジェクト").studios).toEqual(["AQUAPLUS", "カオスプロジェクト"]);
    expect(extractCredits(":アニメーション制作:Synergy SP、G&G ENTERTAINMENT").studios).toEqual(["Synergy SP", "G&G ENTERTAINMENT"]);
    expect(extractCredits(":アニメーション制作:MMT Technology Co.,Ltd").studios).toEqual(["MMT Technology Co.,Ltd"]);
    // Production companies and broadcasters are not animation studios.
    expect(extractCredits(":制作:テレビ東京\n:製作:テスト製作委員会").studios).toEqual([]);
    // The same studio twice (different case) counts once.
    expect(extractCredits(":アニメーション制作:J.C.STAFF\n:アニメーション制作:J.C.Staff").studios).toEqual(["J.C.STAFF"]);
  });

  it("takes publishers from magazine lines, and from 原作 lines only when the name reads as a publisher or imprint", () => {
    expect(extractCredits(":掲載誌:週刊ヤングジャンプ(集英社 刊)").publishers).toEqual(["集英社"]);
    expect(extractCredits(":掲載誌:月刊コミックアライブ(KADOKAWA)\n:原作:三浦勇雄(MF文庫J)").publishers).toEqual(["KADOKAWA", "MF文庫J"]);
    expect(extractCredits(":原作:柊あおい(徳間書店「バロン－猫の男爵」)").publishers).toEqual(["徳間書店"]);
    expect(extractCredits(":原作:P.I.C.S.、此元和津也『RoOT』(小学館/ビックコミックスペリオールダルパナ)").publishers).toEqual(["小学館"]);
    // Authors, roles, games and episode ranges are not publishers.
    expect(extractCredits(":原作:武論尊(原作)、原哲夫(作画)").publishers).toEqual([]);
    expect(extractCredits(":原作:GROOVER(パソコンゲーム)").publishers).toEqual([]);
    expect(extractCredits(":原作:倉田英之(舛成孝二)").publishers).toEqual([]);
    expect(extractCredits(":掲載誌:なかよし(#1~#26)").publishers).toEqual([]);
    expect(extractCredits(null)).toEqual({ studios: [], publishers: [], evidence: [] });
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

describe("episode subtitles", () => {
  it("reads the SubTitles list of a title", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><TitleLookupResponse><Result><Code>200</Code><Message></Message></Result><TitleItems><TitleItem id="1"><TID>1</TID><Title>テスト</Title>' +
      "<SubTitles>*01*はじまりの日\r\n*02*  二つ目の扉 \r\n*3*三話\r\n*04*\r\nメモ行\r\n*02*二つ目の扉（修正）</SubTitles></TitleItem></TitleItems></TitleLookupResponse>";
    const [title] = parseTitleLookup(xml).items.map(normalizeTitle);
    expect(title!.episodeSubtitles).toEqual([
      { episodeNumber: 1, subtitle: "はじまりの日" },
      { episodeNumber: 2, subtitle: "二つ目の扉（修正）" },
      { episodeNumber: 3, subtitle: "三話" }
    ]);
  });

  it("is empty when the list is missing or blank", () => {
    expect(parseEpisodeSubtitles(null)).toEqual([]);
    expect(parseEpisodeSubtitles("   ")).toEqual([]);
  });
});

describe("XML limits (synthetic responses)", () => {
  const envelope = (items: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><TitleLookupResponse><Result><Code>200</Code><Message></Message></Result><TitleItems>${items}</TitleItems></TitleLookupResponse>`;
  const title = (tid: number, comment = "") => `<TitleItem id="${tid}"><TID>${tid}</TID><Title>作品${tid}</Title><Comment>${comment}</Comment></TitleItem>`;

  it("decodes the five XML entities and keeps Japanese text; character references stay as written", () => {
    // No stored title or airing contains a character reference (checked 2026-11); decoding them would change
    // stored values and their hashes, so the behaviour is pinned here.
    const { items } = parseTitleLookup(envelope(title(1, "A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos; 日本語 &#12354;")));
    expect(items[0]!.Comment).toBe(`A&B <C> "D" 'E' 日本語 &#12354;`);
  });

  it("refuses a DOCTYPE, so no entity can be defined or expanded", () => {
    const body = envelope(title(1, "&b;")).replace("?>", '?><!DOCTYPE TitleLookupResponse [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>');
    expect(() => parseTitleLookup(body)).toThrow(/DOCTYPE/);
    expect(() => parseTitleLookup(envelope(title(1)).replace("?>", "?><!doctype TitleLookupResponse>"))).toThrow(/DOCTYPE/);
  });

  it("rejects nesting far deeper than the response format", () => {
    expect(() => parseTitleLookup(envelope(title(1, "<x>".repeat(40) + "</x>".repeat(40))))).toThrow(SyoboiResultError);
  });

  it("rejects a response with more items than any real one", () => {
    const items = Array.from({ length: MAX_ITEMS_PER_RESPONSE + 1 }, (_, i) => `<TitleItem><TID>${i + 1}</TID><Title>t</Title></TitleItem>`).join("");
    expect(() => parseTitleLookup(envelope(items))).toThrow(/items \(limit/);
  });

  it("quarantines a record with an oversized field and keeps the others", () => {
    const result = parseTitleLookup(envelope(title(1, "a".repeat(MAX_TEXT_LENGTH + 1)) + title(2, "普通の備考")));
    expect(result.items.map((item) => item.TID)).toEqual(["2"]);
    expect(result.rejected).toHaveLength(1);
  });
});
