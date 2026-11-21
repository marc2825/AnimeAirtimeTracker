import { expect, test } from "@playwright/test";

import { LEAKY_FRAGMENTS } from "./status-fixture";

// Fixtures: one recorded anime day (Mon 2026-11-16) for TOKYO MX, BS11 and Fuji TV, plus 11 titles.
const FIXTURE_WEEK = "/schedule?week=2026-11-16&day=mon";

test("home renders the main entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("アニメの放送編成を");
  await page.getByRole("link", { name: "今週の番組表" }).click();
  await expect(page).toHaveURL(/\/schedule/);
  await expect(page.getByRole("heading", { level: 1, name: "週間番組表" })).toBeVisible();
});

test("schedule shows real fixture airings and links to the title", async ({ page, isMobile }) => {
  await page.goto(FIXTURE_WEEK);
  const link = page.getByRole("link", { name: /PSYREN/ }).first();
  await expect(link).toBeVisible();
  if (!isMobile) {
    await expect(page.getByRole("region", { name: "番組表（局×時刻）" })).toBeVisible();
    await expect(page.getByText("日付変更").first()).toBeVisible();
  }
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PSYREN -サイレン-");
  await expect(page.getByRole("link", { name: /TID 8053/ })).toHaveAttribute("href", "https://cal.syoboi.jp/tid/8053");
});

test("mobile schedule switches to a list instead of the wide grid", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto(FIXTURE_WEEK);
  await expect(page.getByRole("region", { name: "番組表（局×時刻）" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "メイン（モバイル）" })).toBeVisible();
});

test("week list and region filter are reflected in the URL", async ({ page }) => {
  await page.goto(FIXTURE_WEEK);
  await page.getByRole("link", { name: "週間リスト" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page.getByRole("heading", { name: /月曜/ })).toBeVisible();
  await page.getByRole("navigation", { name: "地域・媒体" }).getByRole("link", { name: "BS" }).click();
  await expect(page).toHaveURL(/region=bs/);
  await expect(page.getByRole("link", { name: /PSYREN/ }).first()).toBeVisible();
});

test("search finds a title across all seasons", async ({ page }) => {
  await page.goto("/search?season=all");
  await page.getByRole("searchbox", { name: "キーワード" }).fill("PSYREN");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL(/q=PSYREN/);
  await expect(page.getByRole("heading", { name: /1\s*作品/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "PSYREN -サイレン-" })).toBeVisible();
  await page.getByRole("link", { name: "放送", exact: true }).click();
  await expect(page.getByRole("heading", { name: /2\s*件の放送/ })).toBeVisible();
});

test("stats always state scope and units", async ({ page }) => {
  await page.goto("/stats?season=2026-autumn");
  await expect(page.getByText("集計対象")).toBeVisible();
  await expect(page.getByText(/単位: 作品本数/).first()).toBeVisible();
  await page.getByRole("link", { name: "放送件数" }).click();
  await expect(page).toHaveURL(/unit=broadcasts/);
});

test("slots, about and status pages render honestly with limited data", async ({ page }) => {
  await page.goto("/slots");
  await expect(page.getByRole("heading", { level: 1, name: "放送枠" })).toBeVisible();
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "データの出典と利用条件" })).toBeVisible();
  await page.goto("/status");
  await expect(page.getByRole("cell", { name: "テスト用データ" })).toBeVisible();
});

test("status shows only a summary for failed runs, never the stored exception", async ({ page, request }) => {
  await page.goto("/status");
  await expect(page.getByRole("cell", { name: "データベースの処理でエラーが発生しました" })).toBeVisible();
  // The full response (HTML + streamed RSC payload) must not carry any part of the stored message.
  const html = await (await request.get("/status")).text();
  for (const fragment of LEAKY_FRAGMENTS) expect(html).not.toContain(fragment);
});

test("admin and unknown routes are not exposed", async ({ page, request }) => {
  expect((await request.get("/admin")).status()).toBe(404);
  // Detail pages stream inside Suspense, so an unknown slug cannot change the already-sent status code;
  // Next marks the streamed not-found page noindex instead (soft 404).
  await page.goto("/titles/0");
  await expect(page.getByText("ページが見つかりません")).toBeVisible();
  await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
});

test("keyboard: skip link moves focus to the main content", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow on desktop");
  await page.goto("/about");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "本文へスキップ" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("theme toggle switches and persists the color scheme", async ({ page }) => {
  await page.goto("/about");
  const html = page.locator("html");
  const initial = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /モードに切り替え/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", initial ?? "");
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", initial ?? "");
});

test("security headers are sent", async ({ request }) => {
  const response = await request.get("/about");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});
