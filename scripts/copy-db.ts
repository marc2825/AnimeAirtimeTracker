/**
 * Copies all rows from one database to another with the same schema (local → Neon, or Neon → a local restore
 * check), preserving ids, then advances sequences and verifies row counts per table. Lets a new environment start
 * from data already fetched instead of re-requesting it from the source. Non-destructive: refuses to write into a
 * target that already has rows.
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
      // Keyset pagination on the primary key (the first column of every app table): OFFSET re-scans every
      // earlier row and made large tables quadratic.
      const key = columns[0]!.column_name;
      let last: unknown = undefined;
      for (;;) {
        const rows = (
          last === undefined
            ? await source.query(`SELECT ${names} FROM "${table}" ORDER BY "${key}" LIMIT ${BATCH}`)
            : await source.query(`SELECT ${names} FROM "${table}" WHERE "${key}" > $1 ORDER BY "${key}" LIMIT ${BATCH}`, [last])
        ).rows as Record<string, unknown>[];
        if (rows.length === 0) break;
        last = rows.at(-1)![key];
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
    // Verify the copy: every table must have the same number of rows on both sides.
    let mismatches = 0;
    for (const table of TABLES) {
      const count = async (client: pg.Client) => Number((await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
      const [from, to] = await Promise.all([count(source), count(target)]);
      if (from !== to) mismatches += 1;
      console.log(`verify ${table}: source ${from}, target ${to}${from === to ? "" : "  MISMATCH"}`);
    }
    if (mismatches > 0) {
      throw new Error(`${mismatches} table(s) differ after the copy. If an ingest run wrote to the source meanwhile, re-run when none is running.`);
    }
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
