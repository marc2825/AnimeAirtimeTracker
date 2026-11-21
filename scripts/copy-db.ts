/**
 * Copies all rows from one database to another with the same schema (e.g. local → Neon), preserving ids,
 * then advances sequences. Lets a new environment start from data already fetched instead of re-requesting
 * it from the source. Non-destructive: refuses to write into a target that already has rows.
 *
 *   SOURCE_DATABASE_URL=… TARGET_DATABASE_URL=… npx tsx scripts/copy-db.ts
 *
 * Apply migrations to the target first (`DIRECT_DATABASE_URL=<target> npm run db:deploy`).
 */
import pg from "pg";

import { normalizeSslMode } from "@/server/prisma";

// Parent tables before children (foreign keys).
const TABLES = [
  "Channel",
  "Title",
  "ImportRun",
  "Broadcast",
  "BroadcastRevision",
  "Slot",
  "SlotMembership",
  "SlotSeason",
  "FetchLog",
  "RawPayload",
  "CoverageWindow",
  "SyncCursor"
] as const;
const BATCH = 1000;

async function columnsOf(client: pg.Client, table: string) {
  const result = await client.query<{ column_name: string; data_type: string }>(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  return result.rows;
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
  if (sourceUrl === targetUrl) throw new Error("Source and target are the same database");
  const source = new pg.Client({ connectionString: normalizeSslMode(sourceUrl) });
  const target = new pg.Client({ connectionString: normalizeSslMode(targetUrl) });
  await source.connect();
  await target.connect();
  try {
    for (const table of TABLES) {
      const existing = await target.query(`SELECT 1 FROM "${table}" LIMIT 1`);
      if (existing.rowCount) throw new Error(`Target table "${table}" is not empty; refusing to copy.`);
    }
    await target.query("BEGIN");
    for (const table of TABLES) {
      const columns = await columnsOf(source, table);
      const names = columns.map((c) => `"${c.column_name}"`).join(", ");
      const jsonColumns = new Set(columns.filter((c) => c.data_type === "json" || c.data_type === "jsonb").map((c) => c.column_name));
      let copied = 0;
      for (let offset = 0; ; offset += BATCH) {
        const rows = (await source.query(`SELECT ${names} FROM "${table}" ORDER BY 1 LIMIT ${BATCH} OFFSET ${offset}`)).rows as Record<string, unknown>[];
        if (rows.length === 0) break;
        const values: unknown[] = [];
        const tuples = rows.map((row) => {
          const placeholders = columns.map((column) => {
            const value = row[column.column_name];
            // node-postgres would turn a JS array into a Postgres array literal; JSON columns need JSON text.
            values.push(jsonColumns.has(column.column_name) && value !== null ? JSON.stringify(value) : value);
            return `$${values.length}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        await target.query(`INSERT INTO "${table}" (${names}) VALUES ${tuples.join(", ")}`, values);
        copied += rows.length;
      }
      // Advance the id sequence (tables with text primary keys have none).
      if (columns.some((c) => c.column_name === "id")) {
        await target.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`);
      }
      console.log(`${table}: ${copied} rows`);
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
