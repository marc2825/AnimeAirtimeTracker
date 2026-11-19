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
    console.log(`Granted read-only access on schema public to ${role} (and to future tables created by ${owner}).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
