import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import pg from "pg";

import { deriveAll } from "../src/ingest/derive";
import { importFixtures } from "../src/ingest/fixtures";
import { createPrismaClient } from "../src/server/prisma";
import { applyWebRole, assertRoleName, auditWebRole, quoteIdent, type Queryable } from "../src/server/web-role";

import { LEAKY_RUN_ERROR } from "./status-fixture";

export default async function globalSetup() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL (or E2E_DATABASE_URL) for E2E tests.");
  const name = new URL(url).pathname.slice(1);
  if (!name.includes("test")) throw new Error(`Refusing to reset "${name}" for E2E: database name must contain "test".`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const prisma = createPrismaClient(url);
  try {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "SlotSeason","SlotMembership","Slot","BroadcastRevision","Broadcast","Title","Channel","CoverageWindow","FetchLog","RawPayload","ImportRun","SyncCursor" RESTART IDENTITY CASCADE`
    );
    await importFixtures(prisma);
    await deriveAll(prisma, { log: () => {} });
    // An older failed run whose stored error carries internal detail (test database only).
    await prisma.importRun.create({
      data: { command: "update", status: "FAILED", startedAt: new Date("2026-01-01T00:00:00Z"), finishedAt: new Date("2026-01-01T00:00:05Z"), error: LEAKY_RUN_ERROR }
    });
  } finally {
    await prisma.$disconnect();
  }
  const webUrl = process.env.E2E_WEB_DATABASE_URL;
  if (webUrl) await prepareWebRole(url, webUrl);
}

/** Create the server's login role from E2E_WEB_DATABASE_URL and limit it exactly as production's web role. */
async function prepareWebRole(ownerUrl: string, webUrl: string) {
  const { username, password } = new URL(webUrl);
  assertRoleName(username);
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [username])).rowCount;
    const literal = `'${decodeURIComponent(password).replace(/'/g, "''")}'`;
    await client.query(`${exists ? "ALTER" : "CREATE"} ROLE ${quoteIdent(username)} LOGIN PASSWORD ${literal}`);
    const db = client as unknown as Queryable;
    await applyWebRole(db, username);
    const audit = await auditWebRole(db, username);
    if (!audit.ok) throw new Error(`E2E web role is not limited as intended: ${audit.problems.join("; ")}`);
  } finally {
    await client.end();
  }
}
