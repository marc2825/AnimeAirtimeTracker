/**
 * Grants a database role read-only access to the app tables (current and future), so the public website
 * connects with credentials that cannot modify data. Run with the owner's direct connection:
 *
 *   DIRECT_DATABASE_URL=<owner direct url> npx tsx scripts/grant-readonly.ts web_readonly
 */
import pg from "pg";

async function main() {
  const role = process.argv[2];
  if (!role || !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error("Usage: grant-readonly.ts <role_name>");
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_DATABASE_URL (owner, non-pooled)");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const owner = (await client.query<{ current_user: string }>("SELECT current_user")).rows[0]!.current_user;
    await client.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT SELECT ON TABLES TO "${role}"`);
    // Granting SELECT does not take anything away. On Neon, a role created with the default `--access admin`
    // joins neon_superuser and can still write, so verify the result instead of assuming it.
    const writable = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND (has_table_privilege($1, format('%I.%I', table_schema, table_name), 'INSERT')
            OR has_table_privilege($1, format('%I.%I', table_schema, table_name), 'UPDATE')
            OR has_table_privilege($1, format('%I.%I', table_schema, table_name), 'DELETE'))`,
      [role]
    );
    if (writable.rowCount) {
      throw new Error(
        `${role} can still write to ${writable.rowCount} table(s) (e.g. ${writable.rows[0]!.table_name}). ` +
          "Recreate it without write access (Neon: `neon roles create --name <role> --access read_only`)."
      );
    }
    console.log(`Granted read-only access on schema public to ${role} (and to future tables created by ${owner}); verified it cannot write.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
