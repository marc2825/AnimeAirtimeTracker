/**
 * Audit or apply the web role's database privileges (rules: src/server/web-role.ts).
 *
 *   DIRECT_DATABASE_URL=… npx tsx scripts/db-role.ts audit [role]        read-only; exit code 1 when there are problems
 *   DIRECT_DATABASE_URL=… npx tsx scripts/db-role.ts apply [role] --yes  owner role; one transaction, then audits
 *
 * The role defaults to WEB_DB_ROLE, then web_readonly. The connection string is never printed. Applying changes
 * production privileges: the owner decides when (docs/operations.md → Security).
 */
import pg from "pg";

import { normalizeSslMode } from "@/server/prisma";
import { applyWebRole, auditWebRole, type Queryable } from "@/server/web-role";

async function main() {
  const [command, roleArg] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const role = roleArg ?? process.env.WEB_DB_ROLE ?? "web_readonly";
  if (command !== "audit" && command !== "apply") throw new Error("Usage: db-role.ts audit|apply [role] [--yes]");
  if (command === "apply" && !process.argv.includes("--yes")) throw new Error("apply changes privileges: pass --yes to confirm.");
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_DATABASE_URL.");
  const client = new pg.Client({ connectionString: normalizeSslMode(url) });
  await client.connect();
  try {
    const db = client as unknown as Queryable;
    if (command === "apply") {
      for (const statement of await applyWebRole(db, role)) console.log(`applied: ${statement}`);
    }
    const audit = await auditWebRole(db, role);
    for (const note of audit.notes) console.log(`note: ${note}`);
    for (const problem of audit.problems) console.log(`problem: ${problem}`);
    console.log(audit.ok ? `${role}: reads only the site's tables, no other privileges.` : `${role}: ${audit.problems.length} problem(s).`);
    if (!audit.ok) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
