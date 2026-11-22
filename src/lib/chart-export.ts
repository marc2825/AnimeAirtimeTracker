/**
 * Chart export: CSV and a standalone SVG drawn from the same small data spec that each chart passes to its
 * export menu. Pure functions (no DOM) so they can be tested; PNG is rasterised from the SVG in the browser.
 *
 * Exports carry aggregated figures only (counts and shares), never source records such as title lists, and
 * always name the source, the site, the scope and the URL that reproduces the view (terms: /terms#license).
 */
import { SITE_NAME, SOURCE_NAME, SOURCE_URL } from "./site";

export type ChartSpec =
  /** Rows × columns of values, drawn as a heatmap (e.g. weekday × hour). */
  | { kind: "matrix"; rowLabel: string; colLabel: string; rows: string[]; cols: string[]; values: number[][]; unit: string }
  /** Categories along an ordered axis with one or more series, drawn as (stacked) columns or lines. */
  | { kind: "columns"; categoryLabel: string; categories: string[]; series: { name: string; values: (number | null)[] }[]; unit: string; stacked?: boolean; lines?: boolean }
  /** Named categories with one or more series, drawn as horizontal bars (e.g. channels). */
  | { kind: "bars"; categoryLabel: string; categories: string[]; series: { name: string; values: number[] }[]; unit: string };

export interface ExportMeta {
  title: string;
  /** What is counted, where and when; printed under the title and in the CSV header. */
  scope: string;
  /** Absolute URL that reproduces this view (conditions made explicit). */
  url: string;
  /** Time of the data the figures come from, already formatted. */
  dataTime?: string;
  /** File name without extension (ASCII). */
  filename: string;
}

export const SOURCE_LINE = `出典: 番組データ ${SOURCE_NAME}（${SOURCE_URL}）／集計 ${SITE_NAME}`;

const csvCell = (value: string | number | null) => {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV with `#` header lines (title, scope, source, URL, data time) and a BOM so spreadsheets read UTF-8. */
export function toCsv(spec: ChartSpec, meta: ExportMeta): string {
  const header = [`# ${SITE_NAME}: ${meta.title}`, `# 対象: ${meta.scope}`, `# 単位: ${spec.unit}`, `# ${SOURCE_LINE}`, `# URL: ${meta.url}`];
  if (meta.dataTime) header.push(`# データ時点: ${meta.dataTime}`);
  let rows: (string | number | null)[][];
  if (spec.kind === "matrix") {
    rows = [[`${spec.rowLabel}＼${spec.colLabel}`, ...spec.cols], ...spec.rows.map((row, i) => [row, ...(spec.values[i] ?? [])])];
  } else {
    rows = [[spec.categoryLabel, ...spec.series.map((s) => s.name)], ...spec.categories.map((category, i) => [category, ...spec.series.map((s) => s.values[i] ?? null)])];
  }
  return `﻿${[...header, ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n")}\r\n`;
}

// ---- SVG ---------------------------------------------------------------------------------------------

/** Fixed light palette (the site's light tokens) so an exported figure looks the same wherever it is used. */
const INK = "#17171c";
const INK2 = "#3f3f47";
const INK3 = "#66666f";
const LINE = "#dedee2";
const RAMP = ["#f1f1f2", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const FONT = `"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,system-ui,sans-serif`;
const WIDTH = 960;
const PAD = 32;

const esc = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const num = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** Visual width of a string in "em" (CJK and full-width ≈ 1, others ≈ 0.55). */
function textWidth(text: string): number {
  let width = 0;
  for (const char of text) width += /[　-鿿＀-￯]/.test(char) ? 1 : 0.55;
  return width;
}

/** Break text into lines no wider than `maxEm`. */
export function wrapText(text: string, maxEm: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (textWidth(line + char) > maxEm && line) {
      lines.push(line);
      line = char;
    } else {
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines: string[], x: number, y: number, size: number, color: string, weight = 400, lineHeight = 1.5): string {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * size * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(line)}</text>`).join("");
}

/** Step 1–7 of the sequential ramp for a value, 0 for zero (same rule as the site's heatmaps). */
function step(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(7, Math.max(1, Math.ceil((value / max) * 7)));
}

/** A readable tick step (1, 2, 2.5, 3 or 5 × 10^k) so that about four steps cover `max`. */
export function niceStep(max: number, steps = 4): number {
  if (max <= 0) return 1;
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 3, 5, 10].find((candidate) => candidate * magnitude >= raw) ?? 10;
  return factor * magnitude;
}

/** Show every n-th category label so labels never collide. */
function labelEvery(count: number, room: number, labelEm: number, size: number): number {
  const per = room / Math.max(1, count);
  return Math.max(1, Math.ceil((labelEm * size + 6) / per));
}

function plot(spec: ChartSpec, top: number): { body: string; height: number } {
  const left = PAD;
  const right = WIDTH - PAD;
  if (spec.kind === "matrix") {
    const labelW = 40;
    const cols = spec.cols.length;
    const cell = Math.min(36, Math.floor((right - left - labelW) / Math.max(1, cols)));
    const max = Math.max(0, ...spec.values.flat());
    const every = labelEvery(cols, cell * cols, Math.max(...spec.cols.map(textWidth)), 11);
    let body = spec.cols.map((col, c) => (c % every === 0 ? `<text x="${left + labelW + c * cell + 2}" y="${top + 12}" font-size="11" fill="${INK3}">${esc(col)}</text>` : "")).join("");
    spec.rows.forEach((row, r) => {
      const y = top + 20 + r * (cell + 2);
      body += `<text x="${left}" y="${y + cell * 0.65}" font-size="12" font-weight="700" fill="${INK2}">${esc(row)}</text>`;
      spec.cols.forEach((col, c) => {
        const value = spec.values[r]?.[c] ?? 0;
        body += `<rect x="${left + labelW + c * cell}" y="${y}" width="${cell - 2}" height="${cell}" fill="${RAMP[step(value, max)]}"><title>${esc(`${row} ${col}: ${num(value)}${spec.unit}`)}</title></rect>`;
      });
    });
    const legendY = top + 20 + spec.rows.length * (cell + 2) + 14;
    body += `<text x="${left}" y="${legendY + 10}" font-size="11" fill="${INK3}">0</text>`;
    RAMP.forEach((color, i) => (body += `<rect x="${left + 14 + i * 22}" y="${legendY}" width="20" height="12" fill="${color}"/>`));
    body += `<text x="${left + 14 + RAMP.length * 22 + 6}" y="${legendY + 10}" font-size="11" fill="${INK3}">${esc(`${num(max)}${spec.unit}`)}</text>`;
    return { body, height: legendY + 20 - top };
  }

  const series = spec.series;
  const legend = series.length > 1 ? series.map((s, i) => ({ name: s.name, color: RAMP[Math.min(7, 3 + i)]! })) : [];
  let body = "";
  let y = top;
  if (legend.length) {
    let x = left;
    for (const item of legend) {
      body += `<rect x="${x}" y="${y}" width="12" height="12" fill="${item.color}"/><text x="${x + 16}" y="${y + 10}" font-size="12" fill="${INK2}">${esc(item.name)}</text>`;
      x += 16 + textWidth(item.name) * 12 + 18;
    }
    y += 30;
  }
  const colorOf = (i: number) => (series.length > 1 ? RAMP[Math.min(7, 3 + i)]! : RAMP[5]!);

  if (spec.kind === "bars") {
    const labelW = Math.min(220, Math.max(...spec.categories.map(textWidth)) * 12 + 12);
    const valueW = 56;
    const barRoom = right - left - labelW - valueW;
    const totals = spec.categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
    const max = Math.max(1, ...totals);
    const rowH = 22;
    spec.categories.forEach((category, i) => {
      const ry = y + i * rowH;
      body += `<text x="${left}" y="${ry + 15}" font-size="12" fill="${INK}">${esc(category)}</text>`;
      let x = left + labelW;
      series.forEach((s, k) => {
        const w = ((s.values[i] ?? 0) / max) * barRoom;
        if (w > 0) body += `<rect x="${x}" y="${ry + 4}" width="${w}" height="${rowH - 8}" fill="${colorOf(k)}"/>`;
        x += w;
      });
      body += `<text x="${right}" y="${ry + 15}" font-size="12" text-anchor="end" fill="${INK2}">${esc(`${num(totals[i]!)}${spec.unit}`)}</text>`;
    });
    return { body, height: y + spec.categories.length * rowH - top };
  }

  // Columns (stacked or side by side) or lines over ordered categories.
  const axisW = 44;
  const chartH = 260;
  const x0 = left + axisW;
  const room = right - x0;
  const n = spec.categories.length;
  const slot = room / Math.max(1, n);
  const totals = spec.categories.map((_, i) => (spec.stacked ? series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.values[i] ?? 0))));
  const tickStep = niceStep(Math.max(...totals, 0));
  const max = Math.max(tickStep, Math.ceil(Math.max(...totals, 0) / tickStep) * tickStep);
  // The unit sits above the axis labels, clear of the legend.
  body += `<text x="${left}" y="${y + 4}" font-size="11" fill="${INK3}">${esc(spec.unit)}</text>`;
  y += 16;
  const yOf = (value: number) => y + chartH - (value / max) * chartH;
  for (let tick = 0; tick <= max + tickStep / 1000; tick += tickStep) {
    const ty = yOf(tick);
    body += `<line x1="${x0}" x2="${right}" y1="${ty}" y2="${ty}" stroke="${LINE}"/><text x="${x0 - 6}" y="${ty + 4}" font-size="11" text-anchor="end" fill="${INK3}">${esc(num(tick))}</text>`;
  }
  if (spec.lines) {
    series.forEach((s, k) => {
      const points = s.values.map((v, i) => (v === null ? null : `${x0 + slot * (i + 0.5)},${yOf(v)}`)).filter(Boolean);
      body += `<polyline points="${points.join(" ")}" fill="none" stroke="${colorOf(k)}" stroke-width="2"/>`;
      s.values.forEach((v, i) => {
        if (v !== null) body += `<circle cx="${x0 + slot * (i + 0.5)}" cy="${yOf(v)}" r="3" fill="${colorOf(k)}"><title>${esc(`${spec.categories[i]} ${s.name}: ${num(v)}${spec.unit}`)}</title></circle>`;
      });
    });
  } else {
    const groups = spec.stacked ? 1 : series.length;
    const barW = Math.max(1, (slot * 0.8) / groups);
    spec.categories.forEach((category, i) => {
      let base = 0;
      series.forEach((s, k) => {
        const value = s.values[i] ?? 0;
        if (value <= 0) return;
        const x = x0 + slot * i + slot * 0.1 + (spec.stacked ? 0 : k * barW);
        const yTop = yOf(spec.stacked ? base + value : value);
        const h = (value / max) * chartH;
        body += `<rect x="${x}" y="${yTop}" width="${Math.max(1, barW - 1)}" height="${h}" fill="${colorOf(k)}"><title>${esc(`${category} ${s.name}: ${num(value)}${spec.unit}`)}</title></rect>`;
        if (spec.stacked) base += value;
      });
    });
  }
  const every = labelEvery(n, room, Math.max(...spec.categories.map(textWidth)), 11);
  spec.categories.forEach((category, i) => {
    if (i % every === 0) body += `<text x="${x0 + slot * (i + 0.5)}" y="${y + chartH + 16}" font-size="11" text-anchor="middle" fill="${INK3}">${esc(category)}</text>`;
  });
  return { body, height: y + chartH + 24 - top };
}

/** A standalone SVG: title, scope, the chart, and the source/URL footer. */
export function toSvg(spec: ChartSpec, meta: ExportMeta): string {
  const maxEm = (WIDTH - PAD * 2) / 12;
  const titleLines = wrapText(meta.title, (WIDTH - PAD * 2) / 20);
  const scopeLines = wrapText(`対象: ${meta.scope}`, maxEm);
  let y = PAD + 20;
  let out = textLines(titleLines, PAD, y, 20, INK, 700, 1.3);
  y += titleLines.length * 26 + 4;
  out += textLines(scopeLines, PAD, y, 12, INK2);
  y += scopeLines.length * 18 + 16;
  const chart = plot(spec, y);
  out += chart.body;
  y += chart.height + 20;
  // Source, link and data time each on their own line(s), so a URL or a date is never split mid-way.
  const footer = [SOURCE_LINE, meta.url, ...(meta.dataTime ? [`データ時点 ${meta.dataTime}`] : [])].flatMap((line) => wrapText(line, maxEm * 1.1));
  out += `<line x1="${PAD}" x2="${WIDTH - PAD}" y1="${y - 14}" y2="${y - 14}" stroke="${LINE}"/>`;
  out += textLines(footer, PAD, y, 11, INK3);
  const height = Math.ceil(y + footer.length * 16 + PAD - 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family='${FONT}'><rect width="100%" height="100%" fill="#ffffff"/>${out}</svg>`;
}
