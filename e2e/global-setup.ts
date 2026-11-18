import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { deriveAll } from "../src/ingest/derive";
import { importFixtures } from "../src/ingest/fixtures";
import { createPrismaClient } from "../src/server/prisma";

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
  } finally {
    await prisma.$disconnect();
  }
}
