/**
 * Renders static brand images (Open Graph card, Apple touch icon) with Playwright so Japanese text
 * uses the system's CJK font without fetching fonts at build time. Re-run after changing the brand:
 *   npx tsx scripts/generate-brand-assets.ts
 */
import { readFile } from "node:fs/promises";

import { chromium } from "@playwright/test";

const icon = await readFile("app/icon.svg", "utf8");

const og = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  body{margin:0;width:1200px;height:630px;background:#0a0f1d;color:#e9edf7;font-family:"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans",sans-serif;overflow:hidden;position:relative}
  .grid{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(160,176,220,.09) 1px,transparent 1px),linear-gradient(to bottom,rgba(160,176,220,.09) 1px,transparent 1px);background-size:120px 44px;mask-image:radial-gradient(ellipse 80% 90% at 25% 30%,#000 30%,transparent 80%)}
  .cells{position:absolute;right:70px;top:150px;opacity:.9;display:grid;grid-template-columns:repeat(4,120px);gap:8px}
  .cells span{height:44px;border-radius:6px;background:#141c32;border:1px solid rgba(160,176,220,.14)}
  .cells span.on{background:#45d3e4;border-color:#45d3e4}.cells span.new{border-left:4px solid #ff8a78}
  .wrap{position:absolute;left:80px;top:90px;width:760px}
  .brand{display:flex;align-items:center;gap:18px;font-size:30px;font-weight:700;letter-spacing:.04em}
  .brand svg{width:64px;height:64px}
  .kicker{margin-top:56px;font-family:monospace;font-size:20px;letter-spacing:.18em;color:#45d3e4;text-transform:uppercase}
  h1{margin:18px 0 0;font-size:54px;white-space:nowrap;line-height:1.25;font-weight:700;letter-spacing:.02em}
  p{margin-top:28px;font-size:24px;color:#b2bad0}
  .line{position:absolute;left:0;right:0;top:540px;border-top:2px solid rgba(69,211,228,.5)}
  .line b{position:absolute;right:70px;top:-15px;font:700 18px monospace;background:#45d3e4;color:#04222a;padding:2px 10px;border-radius:4px}
</style></head><body><div class="grid"></div>
<div class="cells">${Array.from({ length: 20 }, (_, i) => `<span class="${i === 9 ? "on" : i === 6 || i === 15 ? "new" : ""}"></span>`).join("")}</div>
<div class="line"><b>24:00</b></div>
<div class="wrap"><div class="brand">${icon}<span>アニメ放送枠観測所</span></div>
<div class="kicker">Anime Airtime Tracker</div>
<h1>アニメの放送編成を、<br>今週から過去まで。</h1>
<p>番組表・放送枠の年表・編成統計</p></div></body></html>`;

const appleIcon = `<!doctype html><html><head><style>body{margin:0;width:180px;height:180px;background:#141a2e;display:grid;place-items:center}svg{width:150px;height:150px}</style></head><body>${icon}</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(og);
  await page.screenshot({ path: "app/opengraph-image.png" });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(appleIcon);
  await page.screenshot({ path: "app/apple-icon.png" });
  console.log("wrote app/opengraph-image.png, app/apple-icon.png");
} finally {
  await browser.close();
}
