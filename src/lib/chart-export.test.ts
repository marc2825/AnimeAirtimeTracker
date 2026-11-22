import { describe, expect, it } from "vitest";

import { niceStep, SOURCE_LINE, toCsv, toSvg, wrapText, type ChartSpec, type ExportMeta } from "./chart-export";

const meta: ExportMeta = { title: "曜日×時間帯（作品本数）", scope: "2026年秋・関東地上波", url: "https://example.jp/stats?season=2026-autumn", dataTime: "2026/11/22 07:20", filename: "heatmap" };
const matrix: ChartSpec = { kind: "matrix", rowLabel: "曜日", colLabel: "時台", rows: ["月", "火"], cols: ["24", "25"], values: [[3, 0], [1, 2]], unit: "作品" };
const columns: ChartSpec = {
  kind: "columns",
  categoryLabel: "クール",
  categories: ["2026年冬", "2026年春"],
  series: [
    { name: "23–24時台", values: [10, 12] },
    { name: "25時以降, \"深夜\"", values: [5, null] }
  ],
  unit: "作品",
  stacked: true
};

describe("toCsv", () => {
  it("starts with a BOM and states title, scope, unit, source, URL and data time", () => {
    const csv = toCsv(matrix, meta);
    expect(csv.startsWith("﻿# アニメ放送枠観測所: 曜日×時間帯（作品本数）")).toBe(true);
    for (const line of ["# 対象: 2026年秋・関東地上波", "# 単位: 作品", `# ${SOURCE_LINE}`, "# URL: https://example.jp/stats?season=2026-autumn", "# データ時点: 2026/11/22 07:20"]) {
      expect(csv).toContain(line);
    }
  });

  it("writes a matrix with its row and column labels", () => {
    expect(toCsv(matrix, meta)).toContain("曜日＼時台,24,25\r\n月,3,0\r\n火,1,2\r\n");
  });

  it("writes series as columns, quotes special characters and leaves missing values empty", () => {
    const csv = toCsv(columns, meta);
    expect(csv).toContain('クール,23–24時台,"25時以降, ""深夜"""\r\n');
    expect(csv).toContain("2026年春,12,\r\n");
  });
});

describe("toSvg", () => {
  it("is a standalone SVG with the title, scope, values and the source footer", () => {
    for (const spec of [matrix, columns, { kind: "bars", categoryLabel: "局", categories: ["MX", "テレ東"], series: [{ name: "作品", values: [45, 30] }], unit: "作品" } as ChartSpec]) {
      const svg = toSvg(spec, meta);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg).toContain("曜日×時間帯（作品本数）");
      expect(svg).toContain("対象: 2026年秋・関東地上波");
      expect(svg).toContain("しょぼいカレンダー");
      expect(svg).toContain("https://example.jp/stats?season=2026-autumn");
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("escapes text", () => {
    expect(toSvg(matrix, { ...meta, title: "A&B <C>" })).toContain("A&amp;B &lt;C&gt;");
  });
});

describe("wrapText", () => {
  it("breaks by visual width, counting full-width characters wider", () => {
    expect(wrapText("あいうえおかきくけこ", 4)).toEqual(["あいうえ", "おかきく", "けこ"]);
    expect(wrapText("abcdefgh", 2.2)).toEqual(["abcd", "efgh"]);
  });
});

describe("niceStep", () => {
  it("picks readable steps that cover the maximum in about four ticks", () => {
    expect(niceStep(57.9)).toBe(20);
    expect(niceStep(120)).toBe(30);
    expect(niceStep(6)).toBe(2);
    expect(niceStep(0)).toBe(1);
  });
});
