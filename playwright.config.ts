import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = Number(process.env.E2E_PORT ?? 3200);
// E2E runs against the disposable test database filled with recorded fixtures (see e2e/global-setup.ts).
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    // Requires `npm run build` first (CI does this). Uses the production server, not dev.
    command: `npx next start --port ${PORT}`,
    // The server starts before globalSetup seeds the database. Poll a route that reads no data, so the
    // cached dataset status (rendered in every page footer) is not filled from the pre-seed database.
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL: DATABASE_URL ?? "", SITE_URL: `http://localhost:${PORT}` }
  }
});
