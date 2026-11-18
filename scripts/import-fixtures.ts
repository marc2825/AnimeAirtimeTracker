/**
 * Imports the recorded Syoboi fixtures into DATABASE_URL (no network). For local development, CI and E2E.
 * Refuses non-local databases unless ALLOW_REMOTE_FIXTURES=1 — fixture rows must never reach production.
 *
 *   npm run db:fixtures
 */
import { existsSync } from "node:fs";

import { deriveAll } from "@/ingest/derive";
import { importFixtures } from "@/ingest/fixtures";
import { createPrismaClient } from "@/server/prisma";

if (existsSync(".env")) process.loadEnvFile(".env");

function assertLocal(url: string | undefined) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "postgres"].includes(host);
  if (!local && process.env.ALLOW_REMOTE_FIXTURES !== "1") {
    throw new Error(`Refusing to import fixtures into non-local database host "${host}". Set ALLOW_REMOTE_FIXTURES=1 only for disposable databases.`);
  }
  if (process.env.APP_ENV === "production") throw new Error("Refusing to import fixtures with APP_ENV=production.");
}

async function main() {
  assertLocal(process.env.DATABASE_URL);
  const prisma = createPrismaClient();
  try {
    const { stats } = await importFixtures(prisma);
    console.log(`fixtures imported: ${JSON.stringify(stats)}`);
    const derived = await deriveAll(prisma, { log: console.log });
    console.log(`derived: ${JSON.stringify(derived)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
