/**
 * Visual verification: captures pages × viewports × themes into .artifacts/screenshots/.
 *
 *   npm run screenshots                         # against http://localhost:3000
 *   BASE_URL=http://localhost:3100 npm run screenshots -- /schedule /stats
 *
 * Requires a running app (npm run dev or npm start) and Playwright's Chromium (npx playwright install chromium).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve(".artifacts/screenshots");
const DEFAULT_ROUTES = ["/", "/schedule", "/schedule?view=list", "/search", "/slots", "/stats", "/about", "/status"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 }
] as const;
const THEMES = ["light", "dark"] as const;

function fileName(route: string, viewport: string, theme: string) {
  const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+$/, "");
  return `${slug}--${viewport}--${theme}.png`;
}

async function main() {
  const routes = process.argv.slice(2).filter((arg) => arg.startsWith("/"));
  const fullPage = !process.argv.includes("--viewport-only");
  const onlyViewport = process.argv.find((arg) => arg.startsWith("--viewport="))?.split("=")[1];
  const onlyTheme = process.argv.find((arg) => arg.startsWith("--theme="))?.split("=")[1];
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const failures: string[] = [];
  try {
    for (const viewport of VIEWPORTS.filter((v) => !onlyViewport || v.name === onlyViewport)) {
      for (const theme of THEMES.filter((t) => !onlyTheme || t === onlyTheme)) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: theme });
        await context.addInitScript((value) => {
          try {
            localStorage.setItem("theme", value);
          } catch {}
        }, theme);
        const page = await context.newPage();
        page.on("pageerror", (error) => failures.push(`${viewport.name}/${theme} pageerror: ${error.message}`));
        for (const route of routes.length ? routes : DEFAULT_ROUTES) {
          const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
          if (!response || response.status() >= 400) failures.push(`${route} → HTTP ${response?.status()}`);
          await page.evaluate(() => document.fonts.ready);
          const file = path.join(OUT_DIR, fileName(route, viewport.name, theme));
          await page.screenshot({ path: file, fullPage });
          console.log(file);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
