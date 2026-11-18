/**
 * Starts a persistent local PostgreSQL 18 (embedded binaries, no Docker required).
 * Data lives in .data/postgres (gitignored). Stop with Ctrl+C.
 *
 *   npm run db:local            # port 54320
 *   LOCAL_PG_PORT=55432 npm run db:local
 */
import { existsSync } from "node:fs";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.LOCAL_PG_PORT ?? 54320);
const databaseDir = path.resolve(".data/postgres");
const databases = ["anime_airtime_tracker", "anime_airtime_tracker_test"];

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  onLog: () => {}
});

async function main() {
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log(`Initialising cluster in ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  for (const name of databases) {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`Created database ${name}`);
    }
  }
  await client.end();
  console.log(`PostgreSQL ready on postgresql://postgres:postgres@localhost:${port}/ (Ctrl+C to stop)`);
}

async function shutdown() {
  await pg.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

main().catch(async (error: unknown) => {
  console.error(error);
  await pg.stop().catch(() => {});
  process.exit(1);
});
