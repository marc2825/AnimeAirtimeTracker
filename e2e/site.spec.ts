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

// Fixture Monday on TOKYO MX (Kanto): 21:54, 22:00, 22:30 … then 23:00 PSYREN, 23:30, 24:00 信者ゼロ, 24:30 rerun.
const mondayTab = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "曜日" }).getByRole("link").first();

test("schedule: the late-night preset filters airings and day counts, and survives view and week changes", async ({ page }) => {
  await page.goto(FIXTURE_WEEK);
  const bands = page.getByRole("navigation", { name: "時間帯" });
  await expect(bands.getByRole("link", { name: "全時間帯" })).toHaveAttribute("aria-current", "true");
  await bands.getByRole("link", { name: "深夜アニメ" }).click();
  await expect(page).toHaveURL(/time=latenight/);
  await expect(page.getByRole("link", { name: /PSYREN/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /信者ゼロ/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "ふんばるず" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /惚れ薬/ })).toHaveCount(0);
  await expect(mondayTab(page)).toHaveText(/^月\s*11\/16\s*4$/);
  await expect(page.getByRole("link", { name: "次の週" })).toHaveAttribute("href", /time=latenight/);

  await page.getByRole("link", { name: "週間リスト" }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(page).toHaveURL(/time=latenight/);
  await expect(page.getByRole("heading", { name: /月曜.*4件/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "ふんばるず" })).toHaveCount(0);
});

test("schedule: the band combines with rerun, region and the real-time clock", async ({ page }) => {
  await page.goto(`${FIXTURE_WEEK}&time=latenight&rerun=exclude`);
  await expect(mondayTab(page)).toHaveText(/^月\s*11\/16\s*3$/);
  await expect(page.getByRole("link", { name: /逃げ上手/ })).toHaveCount(0);

  // BS11 airs 転生ゴブリン at 24:00 (MX airs it at 22:00, outside the band).
  await page.goto(`${FIXTURE_WEEK}&time=latenight&region=bs`);
  await expect(page.getByRole("link", { name: /転生ゴブリン/ }).first()).toBeVisible();
  await expect(mondayTab(page)).toHaveText(/^月\s*11\/16\s*4$/);

  // The clock setting changes labels only; the band is judged on the anime-clock start time.
  await page.goto(`${FIXTURE_WEEK}&time=latenight&clock=real`);
  await expect(mondayTab(page)).toHaveText(/^月\s*11\/16\s*4$/);
  await expect(page.getByRole("link", { name: "ふんばるず" })).toHaveCount(0);
});

test("schedule: an empty band explains itself, and unknown band values fall back to all", async ({ page }) => {
  await page.goto(`${FIXTURE_WEEK}&time=morning`);
  await expect(page.getByText("この週に該当する番組はありません")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "時間帯" }).getByRole("link", { name: "朝 5–12時" })).toHaveAttribute("aria-current", "true");
  await page.getByRole("link", { name: "条件を外す" }).click();
  await expect(page).not.toHaveURL(/time=/);
  await expect(page.getByRole("link", { name: "ふんばるず" }).first()).toBeVisible();

  await page.goto(`${FIXTURE_WEEK}&time=constructor`);
  await expect(page.getByRole("navigation", { name: "時間帯" }).getByRole("link", { name: "全時間帯" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "ふんばるず" }).first()).toBeVisible();
});

test("search: the late-night preset applies to titles and airings and can be removed", async ({ page }) => {
  await page.goto("/search?season=all&time=latenight");
  await expect(page.getByRole("heading", { name: /4\s*作品/ })).toBeVisible();
  // The representative time comes from the matching airings only (MX 22:00 is outside the band).
  const goblin = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: /転生ゴブリン/ }) });
  await expect(goblin).toContainText("24:00");
  await expect(goblin).not.toContainText("22:00");

  await page.getByRole("link", { name: "放送", exact: true }).click();
  await expect(page).toHaveURL(/time=latenight/);
  await expect(page.getByRole("heading", { name: /6\s*件の放送/ })).toBeVisible();

  await page.getByRole("link", { name: "深夜アニメ 23–29時 を解除" }).click();
  await expect(page).not.toHaveURL(/time=/);
  await expect(page.getByRole("link", { name: "深夜アニメ 23–29時 を解除" })).toHaveCount(0);
  await expect(page).toHaveURL(/view=airings/);
});

test("search: the slot tab states how time conditions are judged", async ({ page }) => {
  await page.goto("/search?view=slots&time=latenight");
  await expect(page.getByText("各枠の最新クールの放送位置で判定しています")).toBeVisible();
  await page.goto("/search?view=slots&season=all&time=latenight&rerun=include");
  await expect(page.getByText(/いずれかのクールで条件に一致した枠です/)).toBeVisible();
  await expect(page.getByText(/再放送・番組の種類・放送時間の条件は放送枠には適用されません/)).toBeVisible();
});

test("stats always state scope and units", async ({ page }) => {
  await page.goto("/stats?season=2026-autumn");
  await expect(page.getByText("集計対象", { exact: true })).toBeVisible();
  await expect(page.getByText(/単位: 作品本数/).first()).toBeVisible();
  await page.getByRole("link", { name: "放送件数" }).click();
  await expect(page).toHaveURL(/unit=broadcasts/);
});

const tileValue = (page: import("@playwright/test").Page, label: string) =>
  page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");

test("stats: time band, network and length narrow the figures and are stated in the scope", async ({ page }) => {
  await page.goto("/stats?season=2026-autumn");
  const all = Number((await tileValue(page, "作品本数").innerText()).replace(/\D/g, ""));
  await page.goto("/stats?season=2026-autumn&time=latenight");
  await expect(page.getByText(/深夜アニメ 23–29時に始まる放送/).first()).toBeVisible();
  // Kanto, reruns excluded: PSYREN 23:00, ロメリア戦記 23:30 and 信者ゼロ 24:00 on MX.
  await expect(tileValue(page, "作品本数")).toHaveText(/^3\s*作品$/);
  expect(all).toBeGreaterThan(3);
  const bands = page.locator("#bands");
  await expect(bands.getByRole("heading", { name: "時間帯別の推移" })).toBeVisible();
  await bands.getByText("表で見る").click();
  await expect(bands.getByRole("row", { name: /2026年秋/ })).toContainText("100%");

  await page.goto("/stats?season=2026-autumn&region=all&network=independent&length=standard");
  const scope = page.getByText("集計対象", { exact: true }).locator("..");
  await expect(scope).toContainText("全対象局の独立局（MX・BS11・AT-X）");
  await expect(scope).toContainText("30分前後（16〜45分）");
});

test("network (系列) and length filters on the schedule and search", async ({ page, isMobile }) => {
  await page.goto(`${FIXTURE_WEEK}&region=all&network=independent`);
  await expect(page.getByRole("link", { name: /PSYREN/ }).first()).toBeVisible();
  if (!isMobile) {
    const grid = page.getByRole("region", { name: "番組表（局×時刻）" });
    await expect(grid).toContainText("AT-X");
    await expect(grid).not.toContainText("日テレ");
  }
  // The fixture has no Fuji TV airing that week: a filtered-empty week is not reported as missing data.
  await page.goto(`${FIXTURE_WEEK}&region=all&network=cx`);
  await expect(page.getByText("この週に該当する番組はありません")).toBeVisible();
  await expect(page.getByText(/フジテレビ系に該当する放送がありません/)).toBeVisible();

  await page.goto("/search?season=all&network=independent&time=latenight");
  await expect(page.getByRole("heading", { name: /4\s*作品/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "独立局（MX・BS11・AT-X） を解除" })).toBeVisible();
  // ふんばるず is the only 5-minute short in the fixture.
  await page.goto("/search?season=all&length=short");
  await expect(page.getByRole("heading", { name: /1\s*作品/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "ふんばるず" })).toBeVisible();
  await page.goto("/search?season=all&length=long");
  await expect(page.getByText("該当する作品はありません")).toBeVisible();
});

test("season pages list covered seasons and are honest about missing data", async ({ page }) => {
  await page.goto("/seasons");
  await expect(page.getByRole("heading", { level: 1, name: "クール別の新作" })).toBeVisible();
  await page.getByRole("link", { name: /秋\s*0\s*作品/ }).click();
  await expect(page).toHaveURL(/\/seasons\/2026-autumn/);
  await expect(page.getByRole("heading", { level: 1, name: "2026年秋の新作アニメ" })).toBeVisible();
  // The fixture day has no first-episode airing.
  await expect(page.getByText("新作の記録がありません")).toBeVisible();
  await page.goto("/seasons/2030-winter");
  await expect(page.getByText("このクールのデータはまだありません")).toBeVisible();
  await page.goto("/seasons/not-a-season");
  await expect(page.getByText("ページが見つかりません")).toBeVisible();
});

test("channel pages summarise a channel and link to filtered views", async ({ page }) => {
  await page.goto("/channels");
  await expect(page.getByRole("heading", { level: 2, name: "関東地上波" })).toBeVisible();
  await page.getByRole("link", { name: /TOKYO MX/ }).click();
  await expect(page).toHaveURL(/\/channels\/mx$/);
  await expect(page.getByRole("heading", { level: 1, name: "TOKYO MX" })).toBeVisible();
  await expect(page.getByText("地上波・関東・独立局")).toBeVisible();
  await expect(page.getByRole("link", { name: "この局の番組表" })).toHaveAttribute("href", "/schedule?region=all&channel=mx");
  await expect(page.getByRole("heading", { name: "クール別の作品本数" })).toBeVisible();
  await page.goto("/channels/no-such-channel");
  await expect(page.getByText("ページが見つかりません")).toBeVisible();
});

test("sitemap lists the season and channel pages", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/seasons/2026-autumn");
  expect(xml).toContain("/channels/mx");
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

test("search past the last page says where the results are", async ({ page }) => {
  await page.goto("/search?season=all&page=9");
  await expect(page.getByText("このページには結果がありません")).toBeVisible();
  await expect(page.getByText(/結果は1ページまでです/)).toBeVisible();
  await page.getByRole("link", { name: "1ページ目へ" }).click();
  await expect(page).not.toHaveURL(/page=/);
});

test("health endpoint reports fresh data without internal detail", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, staleAfterHours: 48 });
  expect(Object.keys(body).sort()).toEqual(["ageHours", "lastSuccessAt", "ok", "staleAfterHours"]);
});

// Playwright's javaScriptEnabled: false still parses <noscript> as raw text, so check the served HTML instead.
test("data pages carry a noscript notice instead of loading forever without JavaScript", async ({ request }) => {
  const html = await (await request.get("/search")).text();
  expect(html).toMatch(/<noscript><p[^>]*>このページのデータを表示するには、JavaScriptを有効にしてください。<\/p><\/noscript>/);
});

test.describe("with motion allowed", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("key figures count up and settle on the final value", async ({ page }) => {
    await page.goto("/stats?season=2026-autumn&time=latenight");
    // Kanto late night in the fixture: 3 titles (see the stats filter test).
    await expect(tileValue(page, "作品本数")).toHaveText(/^3\s*作品$/);
    await expect(tileValue(page, "放送件数")).toHaveText(/^3\s*件$/);
  });
});
