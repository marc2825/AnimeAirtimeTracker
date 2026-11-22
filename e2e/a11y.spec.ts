import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/*
 * Automated accessibility checks (axe-core, WCAG 2.x A/AA rules) on the main pages in both themes.
 * axe finds what can be found mechanically (contrast, names, roles, landmarks); keyboard flows and reading
 * order are covered by the other E2E tests and by manual review (docs/design-system.md#accessibility).
 */
const PAGES = [
  "/",
  "/schedule?week=2026-11-16&day=mon",
  "/schedule?week=2026-11-16&day=mon&view=list",
  "/search",
  "/stats?season=2026-autumn&region=all",
  "/slots",
  "/seasons",
  "/channels/mx",
  "/titles/8053",
  "/status",
  "/analysis",
  "/analysis/late-night",
  "/compare/channels?a=mx&b=bs11&season=2026-autumn",
  "/about",
  "/privacy",
  "/terms"
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`axe (${theme})`, () => {
    test.use({ colorScheme: theme });

    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.addInitScript((value) => {
          try {
            localStorage.setItem("theme", value);
          } catch {}
        }, theme);
        await page.goto(path);
        // Streamed sections must have arrived before the check.
        await page.waitForLoadState("networkidle");
        await expect(page.locator("main")).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")} — ${v.help}`);
        expect(summary, `${path} in ${theme}`).toEqual([]);
      });
    }
  });
}
