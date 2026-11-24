/**
 * Least privilege for the web's database role (production: the role in Vercel's DATABASE_URL).
 *
 * The web reads only WEB_TABLES (src/server/queries; revisions for the "変更N" count on title pages). Fetch logs,
 * raw payloads, sync cursors and the migration history belong to ingestion and operations. `auditWebRole` checks a role against this and changes
 * nothing (any role can run it: it reads the catalogs only); `applyWebRole` brings a role to it in one
 * transaction, and `rollbackWebRole` restores the broad read access the role had before (SELECT on every table,
 * now and in future) if the site turns out to need more. scripts/db-role.ts runs both; the E2E suite in CI serves the site as a role limited this way, so a
 * page that starts reading another table fails there before it fails in production.
 */

/** Tables the web reads. Add a table here in the same change that makes a page read it. */
export const WEB_TABLES = ["Broadcast", "BroadcastRevision", "Channel", "CoverageWindow", "ImportRun", "Slot", "SlotMembership", "SlotSeason", "Title", "TitleSubtitle"] as const;

/**
 * Predefined or provider roles that grant far more than the web needs. Neon's "read-only" access is membership in
 * pg_read_all_data, which reads every table and bypasses table grants, so `applyWebRole` revokes these.
 */
const BROAD_ROLES = ["pg_read_all_data", "pg_write_all_data", "pg_maintain", "pg_monitor", "pg_read_all_settings", "pg_read_all_stats", "pg_signal_backend", "pg_read_server_files", "pg_write_server_files", "pg_execute_server_program", "pg_create_subscription", "pg_checkpoint", "neon_superuser"];

const DEFAULT_ACL_OBJECTS: Record<string, string> = { r: "TABLES", S: "SEQUENCES", f: "FUNCTIONS", T: "TYPES", n: "SCHEMAS" };

/** The part of node-postgres' Client used here, so tests and the CLI can pass a client directly. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface RoleAudit {
  role: string;
  ok: boolean;
  /** Anything that gives the role more (or less) than the web needs. */
  problems: string[];
  /** Facts worth knowing that are not problems (e.g. defaults every role has). */
  notes: string[];
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function assertRoleName(role: string): void {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error(`Not a plain role name: ${JSON.stringify(role)}`);
}

async function memberships(db: Queryable, role: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT r.rolname AS name FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
     WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = $1) ORDER BY 1`,
    [role]
  );
  return rows.map((row) => String(row.name));
}

async function defaultAcls(db: Queryable, role: string): Promise<{ owner: string; schema: string | null; objects: string }[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT pg_get_userbyid(d.defaclrole) AS owner, n.nspname AS schema, d.defaclobjtype AS type
     FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace, LATERAL aclexplode(d.defaclacl) a
     WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1) ORDER BY 1, 2, 3`,
    [role]
  );
  return rows.map((row) => ({ owner: String(row.owner), schema: row.schema === null ? null : String(row.schema), objects: DEFAULT_ACL_OBJECTS[String(row.type)] ?? "TABLES" }));
}

/** Read-only check of a role against the web's needs. */
export async function auditWebRole(db: Queryable, role: string): Promise<RoleAudit> {
  assertRoleName(role);
  const problems: string[] = [];
  const notes: string[] = [];
  const { rows: roles } = await db.query(
    "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1",
    [role]
  );
  const info = roles[0];
  if (!info) return { role, ok: false, problems: [`role ${role} does not exist`], notes };
  for (const attribute of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls"]) {
    if (info[attribute] === true) problems.push(`has the ${attribute.slice(3).toUpperCase()} attribute`);
  }
  if (info.rolcanlogin !== true) notes.push("cannot log in");
  for (const name of await memberships(db, role)) problems.push(`is a member of ${name}${BROAD_ROLES.includes(name) ? " (grants access beyond the web's tables)" : ""}`);

  const { rows: relations } = await db.query(
    `SELECT c.relname AS name,
       has_any_column_privilege($1, c.oid, 'SELECT') AS can_select,
       has_any_column_privilege($1, c.oid, 'INSERT') OR has_any_column_privilege($1, c.oid, 'UPDATE')
         OR has_table_privilege($1, c.oid, 'DELETE') OR has_table_privilege($1, c.oid, 'TRUNCATE')
         OR has_any_column_privilege($1, c.oid, 'REFERENCES') OR has_table_privilege($1, c.oid, 'TRIGGER') AS can_write
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY 1`,
    [role]
  );
  const web = new Set<string>(WEB_TABLES);
  const present = new Set(relations.map((row) => String(row.name)));
  for (const table of WEB_TABLES) if (!present.has(table)) problems.push(`table ${table} (read by the site) does not exist`);
  for (const row of relations) {
    const name = String(row.name);
    if (row.can_write === true) problems.push(`can write to ${name}`);
    if (web.has(name) && row.can_select !== true) problems.push(`cannot read ${name} (the site reads it)`);
    if (!web.has(name) && row.can_select === true) problems.push(`can read ${name} (the site does not need it)`);
  }

  const { rows: sequences } = await db.query(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S' AND (has_sequence_privilege($1, c.oid, 'USAGE') OR has_sequence_privilege($1, c.oid, 'UPDATE')) ORDER BY 1`,
    [role]
  );
  for (const row of sequences) problems.push(`can use sequence ${String(row.name)}`);

  const { rows: schemas } = await db.query(
    `SELECT nspname AS name, has_schema_privilege($1, oid, 'CREATE') AS can_create, has_schema_privilege($1, oid, 'USAGE') AS can_use
     FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`,
    [role]
  );
  for (const row of schemas) {
    const name = String(row.name);
    if (row.can_create === true) problems.push(`can create objects in schema ${name}`);
    if (name === "public" && row.can_use !== true) problems.push("cannot use schema public");
    if (name !== "public" && row.can_use === true) notes.push(`can use schema ${name}`);
  }

  const { rows: database } = await db.query(
    "SELECT has_database_privilege($1, current_database(), 'CREATE') AS can_create, has_database_privilege($1, current_database(), 'TEMPORARY') AS can_temp",
    [role]
  );
  if (database[0]?.can_create === true) problems.push("can create schemas in the database");
  if (database[0]?.can_temp === true) notes.push("can create temporary tables (PostgreSQL grants this to PUBLIC by default)");

  for (const acl of await defaultAcls(db, role)) problems.push(`default privileges of ${acl.owner}${acl.schema ? ` in ${acl.schema}` : ""} grant it future ${acl.objects.toLowerCase()}`);

  return { role, ok: problems.length === 0, problems, notes };
}

/** The statements `applyWebRole` runs for the role's current state (exported for review and tests). */
export async function webRoleStatements(db: Queryable, role: string): Promise<string[]> {
  assertRoleName(role);
  const r = quoteIdent(role);
  const statements: string[] = [];
  for (const name of await memberships(db, role)) if (BROAD_ROLES.includes(name)) statements.push(`REVOKE ${quoteIdent(name)} FROM ${r}`);
  for (const acl of await defaultAcls(db, role)) {
    statements.push(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(acl.owner)}${acl.schema ? ` IN SCHEMA ${quoteIdent(acl.schema)}` : ""} REVOKE ALL ON ${acl.objects} FROM ${r}`);
  }
  statements.push(
    // Table-level REVOKE ALL also removes column privileges.
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${r}`,
    `REVOKE CREATE ON SCHEMA public FROM ${r}`,
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    `GRANT SELECT ON ${WEB_TABLES.map((table) => `public.${quoteIdent(table)}`).join(", ")} TO ${r}`
  );
  return statements;
}

/** Bring `role` to read-only access on WEB_TABLES, in one transaction; returns the statements run. */
export async function applyWebRole(db: Queryable, role: string): Promise<string[]> {
  const statements = await webRoleStatements(db, role);
  await db.query("BEGIN");
  try {
    for (const statement of statements) await db.query(statement);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return statements;
}

/**
 * Undo `applyWebRole`: the state the setup script used to create (USAGE on public, SELECT on every table, and
 * default privileges of the connected owner for future tables). Never grants anything that could write.
 */
export async function rollbackWebRole(db: Queryable, role: string): Promise<string[]> {
  assertRoleName(role);
  const r = quoteIdent(role);
  const owner = String((await db.query("SELECT current_user AS name")).rows[0]?.name);
  const statements = [
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${r}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(owner)} IN SCHEMA public GRANT SELECT ON TABLES TO ${r}`
  ];
  await db.query("BEGIN");
  try {
    for (const statement of statements) await db.query(statement);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return statements;
}

/** Problems that would break the site or let it write; reading more than needed is not one of them. */
export function blockingProblems(audit: RoleAudit): string[] {
  return audit.problems.filter((problem) => /^(cannot |can write|can create|can use sequence|has the |role .* does not exist|table .* does not exist)/.test(problem));
}
