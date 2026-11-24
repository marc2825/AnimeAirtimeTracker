/**
 * The web role rules against a real PostgreSQL: a throwaway login role gets broad read access the way a provider's
 * "read-only" role does, is audited, brought down to the web's tables, and then used to connect.
 * Run with `npm run test:db` (TEST_DATABASE_URL, name must contain "test"). The role is dropped afterwards.
 */
import { execFileSync } from "node:child_process";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyWebRole, auditWebRole, blockingProblems, rollbackWebRole, WEB_TABLES, webRoleStatements, type Queryable } from "./web-role";

const url = process.env.TEST_DATABASE_URL;
const ROLE = "web_role_dbtest";
const PASSWORD = "web_role_dbtest";
const NOT_FOR_THE_WEB = ["FetchLog", "RawPayload", "SyncCursor", "_prisma_migrations"];

let owner: pg.Client;
const db = () => owner as unknown as Queryable;

async function asRole<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const roleUrl = new URL(url!);
  roleUrl.username = ROLE;
  roleUrl.password = PASSWORD;
  const client = new pg.Client({ connectionString: roleUrl.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dropRole() {
  if ((await owner.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROLE])).rowCount) {
    await owner.query(`DROP OWNED BY ${ROLE}`);
    await owner.query(`DROP ROLE ${ROLE}`);
  }
}

describe("web role (PostgreSQL)", () => {
  beforeAll(async () => {
    if (!url) throw new Error("TEST_DATABASE_URL is not set — see .env.example. DB tests never run against DATABASE_URL.");
    const dbName = new URL(url).pathname.slice(1);
    if (!dbName.includes("test")) throw new Error(`Refusing to use database "${dbName}": name must contain "test".`);
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    owner = new pg.Client({ connectionString: url });
    await owner.connect();
    await dropRole();
    await owner.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}'`);
  });

  afterAll(async () => {
    if (!owner) return;
    await dropRole();
    await owner.end();
  });

  it("flags a provider-style read-only role that can read every table, now and in future", async () => {
    await owner.query(`GRANT pg_read_all_data TO ${ROLE}`);
    await owner.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${ROLE}`);
    const audit = await auditWebRole(db(), ROLE);
    expect(audit.ok).toBe(false);
    expect(audit.problems).toEqual(
      expect.arrayContaining([expect.stringMatching(/member of pg_read_all_data/), "can read RawPayload (the site does not need it)", "can read FetchLog (the site does not need it)", expect.stringMatching(/default privileges .* future tables/)])
    );
    await expect(asRole((client) => client.query('SELECT count(*) FROM "RawPayload"'))).resolves.toBeDefined();
  });

  it("brings the role down to reading the web's tables only, and the audit passes", async () => {
    const statements = await applyWebRole(db(), ROLE);
    expect(statements[0]).toBe(`REVOKE "pg_read_all_data" FROM "${ROLE}"`);
    const audit = await auditWebRole(db(), ROLE);
    expect(audit.problems).toEqual([]);
    expect(audit.ok).toBe(true);
    await asRole(async (client) => {
      for (const table of WEB_TABLES) await expect(client.query(`SELECT count(*) FROM "${table}"`), table).resolves.toBeDefined();
      for (const table of NOT_FOR_THE_WEB) await expect(client.query(`SELECT count(*) FROM "${table}"`), table).rejects.toThrow(/permission denied/);
      await expect(client.query(`INSERT INTO "SyncCursor" (key, value, "updatedAt") VALUES ('x', 'y', now())`)).rejects.toThrow(/permission denied/);
      await expect(client.query('UPDATE "Title" SET name = name')).rejects.toThrow(/permission denied/);
      await expect(client.query('DELETE FROM "Broadcast"')).rejects.toThrow(/permission denied/);
      await expect(client.query('TRUNCATE "Title"')).rejects.toThrow(/permission denied/);
      await expect(client.query("CREATE TABLE web_role_probe (id int)")).rejects.toThrow(/permission denied/);
    });
  });

  it("is idempotent: a second run only re-states the grants", async () => {
    const statements = await webRoleStatements(db(), ROLE);
    expect(statements.some((statement) => statement.startsWith("REVOKE \"pg_read_all_data\"") || statement.startsWith("ALTER DEFAULT"))).toBe(false);
    await applyWebRole(db(), ROLE);
    expect((await auditWebRole(db(), ROLE)).ok).toBe(true);
  });

  it("reports write access, column grants, missing reads and role attributes, and apply clears them", async () => {
    await owner.query(`GRANT INSERT ON "Title" TO ${ROLE}`);
    await owner.query(`GRANT SELECT ("id") ON "FetchLog" TO ${ROLE}`);
    await owner.query(`REVOKE SELECT ON "Slot" FROM ${ROLE}`);
    await owner.query(`ALTER ROLE ${ROLE} CREATEDB`);
    const audit = await auditWebRole(db(), ROLE);
    expect(audit.problems).toEqual(expect.arrayContaining(["can write to Title", "can read FetchLog (the site does not need it)", "cannot read Slot (the site reads it)", "has the CREATEDB attribute"]));
    await owner.query(`ALTER ROLE ${ROLE} NOCREATEDB`);
    await applyWebRole(db(), ROLE);
    expect((await auditWebRole(db(), ROLE)).problems).toEqual([]);
  });

  it("rolls back to reading every table (as before apply) without ever allowing writes, and apply works again", async () => {
    await applyWebRole(db(), ROLE);
    await rollbackWebRole(db(), ROLE);
    const audit = await auditWebRole(db(), ROLE);
    expect(audit.problems).toEqual(expect.arrayContaining(["can read FetchLog (the site does not need it)", expect.stringMatching(/default privileges .* future tables/)]));
    expect(blockingProblems(audit)).toEqual([]);
    await asRole(async (client) => {
      await expect(client.query('SELECT count(*) FROM "FetchLog"')).resolves.toBeDefined();
      await expect(client.query('DELETE FROM "FetchLog"')).rejects.toThrow(/permission denied/);
    });
    await applyWebRole(db(), ROLE);
    expect((await auditWebRole(db(), ROLE)).problems).toEqual([]);
  });

  it("says so when the role does not exist", async () => {
    expect(await auditWebRole(db(), "no_such_role_dbtest")).toMatchObject({ ok: false, problems: ["role no_such_role_dbtest does not exist"] });
  });
});
