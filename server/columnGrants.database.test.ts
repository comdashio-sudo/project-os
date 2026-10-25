import fixtureDb, { type Connection } from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 20, item 3 (audit 4.3): the application role may UPDATE a column only when it is not immutable. Evidence is read from the catalogue with has_column_privilege
// and confirmed with REAL statements run as project_os_app (the restricted role) inside transactions that are rolled back. Run as the owner for the catalogue, as the app role for the statements.
const ownerUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
const IMMUTABLE = ["id", "tenant_id", "created_at"];
const EXTRA: Record<string, string[]> = { users: ["open_id"], auth_sessions: ["user_id"], memberships: ["user_id"], user_mfa: ["user_id"] };

describe.skipIf(!ownerUrl || !isTestDatabaseUrl(ownerUrl) || !appUrl || !isTestDatabaseUrl(appUrl))("column-level UPDATE for the application role", () => {
  let owner: Connection; let app: Connection;
  beforeAll(async () => { owner = await fixtureDb.createConnection(ownerUrl!); app = await fixtureDb.createConnection(appUrl!); });
  afterAll(async () => { await owner.end(); await app.end(); });

  it("every column of every table: immutable ones cannot be updated by the application role, every other one can (audit_logs: none at all)", async () => {
    const [rows] = await owner.query<{ tbl: string; col: string; can: boolean }[]>(
      `SELECT c.relname AS tbl, a.attname AS col, has_column_privilege('project_os_app', c.oid, a.attnum, 'UPDATE') AS can
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1, 2`);
    expect(rows.length).toBeGreaterThan(1000);
    const wrong = rows.filter(row => Boolean(row.can) !== (row.tbl !== "audit_logs" && !IMMUTABLE.includes(row.col) && !(EXTRA[row.tbl] ?? []).includes(row.col))).map(row => `${row.tbl}.${row.col}`);
    expect(wrong).toEqual([]);
    // no table-level UPDATE remains anywhere: that is what a column-level REVOKE could never have removed
    const [tableLevel] = await owner.query<{ tbl: string }[]>(
      `SELECT c.relname AS tbl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND has_table_privilege('project_os_app', c.oid, 'UPDATE')`);
    expect(tableLevel.map(row => row.tbl)).toEqual([]);
  });

  async function refused(sql: string, params: unknown[] = []) {
    await app.query("BEGIN");
    try { await app.query("SELECT set_config('app.system', 'on', true)"); await app.query(sql, params); return null; }
    catch (error) { return String((error as { code?: string; message?: string }).code ?? (error as Error).message); }
    finally { await app.query("ROLLBACK"); }
  }

  it("NEGATIVE, real statements: moving a row to another company, rewriting an id, a creation time, or a person's identity is refused with 42501 — in the system context, where row-level security would allow everything", async () => {
    expect(await refused("UPDATE projects SET tenant_id = tenant_id WHERE false")).toBe("42501");
    expect(await refused("UPDATE companies SET id = id WHERE false")).toBe("42501");
    expect(await refused("UPDATE memberships SET created_at = created_at WHERE false")).toBe("42501");
    expect(await refused("UPDATE users SET open_id = open_id WHERE false")).toBe("42501");
    expect(await refused("UPDATE auth_sessions SET user_id = user_id WHERE false")).toBe("42501");
    expect(await refused("UPDATE audit_logs SET action = action WHERE false")).toBe("42501");
  });

  it("POSITIVE, real statements: an ordinary column still updates (the grant is not so narrow that the application breaks)", async () => {
    expect(await refused("UPDATE users SET name = name WHERE false")).toBeNull();
    expect(await refused("UPDATE users SET role = role, last_signed_in = last_signed_in WHERE false")).toBeNull();
    expect(await refused("UPDATE projects SET updated_at = updated_at WHERE false")).toBeNull();
    expect(await refused("UPDATE auth_sessions SET revoked_at = revoked_at, last_seen_at = last_seen_at WHERE false")).toBeNull();
  });

  it("a column added later is writable without anyone granting it: the sweep that runs after every migration grants it (and an immutable name added later is not)", async () => {
    await owner.query("BEGIN");
    try {
      await owner.query("ALTER TABLE projects ADD COLUMN zz_probe_note text");
      expect(Boolean((await owner.query<{ c: boolean }[]>("SELECT has_column_privilege('project_os_app', 'projects', 'zz_probe_note', 'UPDATE') AS c"))[0][0].c)).toBe(false); // before the sweep: ungranted
      await owner.query("SELECT project_os_apply_conventions()");
      expect(Boolean((await owner.query<{ c: boolean }[]>("SELECT has_column_privilege('project_os_app', 'projects', 'zz_probe_note', 'UPDATE') AS c"))[0][0].c)).toBe(true);
    } finally { await owner.query("ROLLBACK"); }
  });
});
