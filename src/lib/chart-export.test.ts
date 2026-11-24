import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import { csvCell, niceStep, SOURCE_LINE, toCsv, toSvg, wrapText, type ChartSpec, type ExportMeta } from "./chart-export";

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

/** Reads CSV the way a spreadsheet import does (RFC 4180): quoted fields, doubled quotes, CRLF records. */
function parseCsv(csv: string): string[][] {
  const text = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

// Synthetic labels only: what a source-derived name could contain, never real data.
const FORMULA_LIKE = ["=1+1", "+81", "-x", "@SUM(A1)", "\tタブ", "\r改行", "\n改行", "＝全角", "＋全角", "－全角", "＠全角", '=HYPERLINK("https://example.invalid","x")'];
const TRIGGER = /^[=+\-@\t\r\n＝＋－＠]/;
const NUMBER = /^-?\d+(\.\d+)?$/;

describe("toCsv safety (spreadsheet import)", () => {
  const hostile: ChartSpec = {
    kind: "columns",
    categoryLabel: "=区分",
    categories: [...FORMULA_LIKE, "普通の名前"],
    series: [
      { name: "-前年差", values: [...FORMULA_LIKE.map((_, i) => (i % 2 ? -i : i + 0.5)), -3] },
      { name: "作品", values: [...FORMULA_LIKE.map(() => null), 0] }
    ],
    unit: "作品"
  };

  it("gives formula-like text a leading apostrophe and keeps numbers, negative ones too, as numbers", () => {
    const rows = parseCsv(toCsv(hostile, meta));
    const table = rows.slice(rows.findIndex((row) => row.length > 1));
    expect(table[0]).toEqual(["'=区分", "'-前年差", "作品"]);
    FORMULA_LIKE.forEach((label, i) => {
      const [category, diff] = table[i + 1]!;
      expect(category).toBe(`'${label}`);
      expect(Number(diff)).toBe(i % 2 ? -i : i + 0.5);
    });
    expect(table.at(-1)).toEqual(["普通の名前", "-3", "0"]);
    // Nothing a spreadsheet reads as a formula: every field is a plain number, empty, or starts harmlessly.
    for (const field of rows.flat()) expect(NUMBER.test(field) || !TRIGGER.test(field), JSON.stringify(field)).toBe(true);
  });

  it("keeps each metadata line one field, even with commas, quotes and line breaks", () => {
    const tricky = { ...meta, title: "=タイトル", scope: '関東, 関西 "再放送を除く"\n2026年', url: "https://example.jp/stats?channels=a,b" };
    const rows = parseCsv(toCsv(matrix, tricky));
    const header = rows.slice(0, 6);
    for (const row of header) expect(row).toHaveLength(1);
    expect(header.map((row) => row[0])).toEqual([
      "# アニメ放送枠観測所: =タイトル",
      `# 対象: ${tricky.scope}`,
      "# 単位: 作品",
      `# ${SOURCE_LINE}`,
      "# URL: https://example.jp/stats?channels=a,b",
      "# データ時点: 2026/11/22 07:20"
    ]);
  });

  it("round-trips quotes, commas and line breaks inside labels and keeps the BOM and CRLF records", () => {
    const csv = toCsv({ kind: "bars", categoryLabel: "局", categories: ['A,"B"\nC'], series: [{ name: "作品", values: [12] }], unit: "作品" }, meta);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(parseCsv(csv).at(-1)).toEqual(['A,"B"\nC', "12"]);
  });

  it("writes numbers at full precision and leaves values that are not finite empty", () => {
    expect([csvCell(12.345678), csvCell(-0.5), csvCell(0), csvCell(Number.NaN), csvCell(Number.POSITIVE_INFINITY), csvCell(null)]).toEqual(["12.345678", "-0.5", "0", "", "", ""]);
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

  it("stays well-formed with only drawing elements, whatever the labels contain", () => {
    const evil = '</text><script>alert(1)</script><a href="javascript:x">\u0001\u0008\'"&';
    const hostileMeta = { ...meta, title: evil, scope: evil, url: `https://example.jp/?q="${evil}` };
    const specs: ChartSpec[] = [
      { kind: "matrix", rowLabel: evil, colLabel: evil, rows: [evil], cols: [evil, "25"], values: [[1, 2]], unit: evil },
      { kind: "columns", categoryLabel: evil, categories: [evil], series: [{ name: evil, values: [3] }, { name: "b", values: [1] }], unit: evil, lines: true },
      { kind: "bars", categoryLabel: evil, categories: [evil], series: [{ name: evil, values: [4] }], unit: evil }
    ];
    for (const spec of specs) {
      const svg = toSvg(spec, hostileMeta);
      expect(XMLValidator.validate(svg)).toBe(true);
      for (const [, name] of svg.matchAll(/<([a-zA-Z]+)/g)) expect(["svg", "rect", "text", "title", "line", "polyline", "circle"], name).toContain(name);
      expect(svg).not.toMatch(/<script|<a\s|javascript:x"/);
      // Control characters are not allowed in XML 1.0; some SVG readers refuse the whole file.
      expect(svg).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    }
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
