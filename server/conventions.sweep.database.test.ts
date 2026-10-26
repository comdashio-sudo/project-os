import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixtureDb, { type Connection } from "./testing/pgCompat";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 15 (owner decision): the convention sweep leaves a table that already matches the convention alone (no exclusive lock on it), and
// whatever it leaves behind is still proved here, table by table: every public table has row-level security on, the application role holds exactly
// the privileges it should, the updated_at trigger is there when the column is, and the table carries exactly the policies it should — a table added
// a minute ago included. Run as the OWNER (the role that migrates), against project_os_integration_test.
const ownerUrl = process.env.TEST_DATABASE_URL;
let owner: Connection;
let second: Connection;

const PROBE = "zz_sweep_probe";
const POLICY_NAMES = ["project_os_isolation", "project_os_read", "project_os_insert", "project_os_update", "project_os_delete"];

type TableState = { name: string; rls: boolean; privileges: string; policies: string; hasTrigger: boolean; hasUpdatedAt: boolean };
async function readState(connection: Connection): Promise<TableState[]> {
  const [rows] = await connection.query<{ name: string; rls: boolean; privileges: string | null; policies: string | null; has_trigger: boolean; has_updated_at: boolean }[]>(
    `SELECT c.relname AS name, c.relrowsecurity AS rls,
            (SELECT string_agg(a.privilege_type::text, ',' ORDER BY a.privilege_type::text) FROM aclexplode(c.relacl) a JOIN pg_roles r ON r.oid = a.grantee WHERE r.rolname = 'project_os_app') AS privileges,
            (SELECT string_agg(p.polname::text, ',' ORDER BY p.polname::text) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname::text = ANY (?::text[])) AS policies,
            EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = c.oid AND tg.tgname = 'set_updated_at' AND NOT tg.tgisinternal) AS has_trigger,
            EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped) AS has_updated_at
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`, [`{${POLICY_NAMES.join(",")}}`]);
  return rows.map(row => ({ name: row.name, rls: Boolean(row.rls), privileges: row.privileges ?? "", policies: row.policies ?? "", hasTrigger: Boolean(row.has_trigger), hasUpdatedAt: Boolean(row.has_updated_at) }));
}
const expectedPrivileges = (table: string) => (table === "audit_logs" ? "INSERT,SELECT" : "DELETE,INSERT,SELECT"); // UPDATE is granted per column (work order 20, item 3): see columnGrants.database.test.ts
const expectedPolicies = (table: string, state: TableState[]) => {
  if (table === "audit_logs") return "project_os_insert,project_os_read";
  if (table === "companies") return "project_os_delete,project_os_insert,project_os_read,project_os_update";
  void state;
  return "project_os_isolation";
};
const wrong = (state: TableState[]) => state.flatMap(table => {
  const problems: string[] = [];
  if (!table.rls) problems.push("row-level security off");
  if (table.privileges !== expectedPrivileges(table.name)) problems.push(`privileges ${table.privileges || "none"}`);
  if (table.policies !== expectedPolicies(table.name, state)) problems.push(`policies ${table.policies || "none"}`);
  if (table.hasUpdatedAt && !table.hasTrigger) problems.push("no updated_at trigger");
  return problems.length ? [`${table.name}: ${problems.join("; ")}`] : [];
});

describe.skipIf(!ownerUrl || !isTestDatabaseUrl(ownerUrl))("the convention sweep", () => {
  beforeAll(async () => {
    owner = await fixtureDb.createConnection(ownerUrl!);
    second = await fixtureDb.createConnection(ownerUrl!);
  });
  afterAll(async () => {
    await owner.query(`DROP TABLE IF EXISTS ${PROBE}`).catch(() => undefined);
    await owner.end(); await second.end();
  });

  it("after a sweep EVERY table has row-level security, the right privileges and the right policies", async () => {
    await owner.query("SELECT project_os_apply_conventions()");
    const state = await readState(owner);
    expect(state.length).toBeGreaterThan(100);
    expect(wrong(state)).toEqual([]);
  });

  it("a table added later gets all of it from the sweep, and a second sweep leaves it alone", async () => {
    await owner.query(`CREATE TABLE ${PROBE} (id varchar(36) PRIMARY KEY, tenant_id varchar(36) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    const before = (await readState(owner)).find(table => table.name === PROBE)!;
    expect(before.rls).toBe(false); // it starts open, which is exactly why the sweep exists
    await owner.query("SELECT project_os_apply_conventions()");
    const after = await readState(owner);
    expect(wrong(after)).toEqual([]);
    expect(after.find(table => table.name === PROBE)).toMatchObject({ rls: true, privileges: "DELETE,INSERT,SELECT", policies: "project_os_isolation", hasTrigger: true });
    // the fingerprint of the rule is stamped on the policy, which is how a later sweep knows the table matches
    const [stamp] = await owner.query<{ comment: string | null }[]>("SELECT obj_description(p.oid, 'pg_policy') AS comment FROM pg_policy p WHERE p.polrelid = ?::regclass", [PROBE]);
    expect(String(stamp[0].comment)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("a table that already matches is skipped: a sweep does not wait for a lock someone holds on it", async () => {
    // an ACCESS EXCLUSIVE lock on a matching table would block the sweep's ALTER TABLE for good; the sweep reads only the catalogs, so it passes
    await second.query("BEGIN");
    try {
      await second.query("LOCK TABLE projects IN ACCESS EXCLUSIVE MODE");
      await second.query("LOCK TABLE audit_logs IN ACCESS EXCLUSIVE MODE").catch(() => undefined);
      await owner.query("BEGIN");
      await owner.query("SET LOCAL lock_timeout = '1500ms'");
      const [done] = await owner.query<{ n: number }[]>("SELECT project_os_apply_conventions() AS n");
      await owner.query("COMMIT");
      expect(Number(done[0].n)).toBeGreaterThan(100);
    } finally {
      await owner.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK");
    }
  });

  it("NEGATIVE: drift is put right — a policy dropped, a grant widened, row-level security switched off", async () => {
    await owner.query(`DROP POLICY project_os_isolation ON ${PROBE}`);
    await owner.query(`GRANT TRUNCATE ON ${PROBE} TO project_os_app`);
    await owner.query(`ALTER TABLE ${PROBE} DISABLE ROW LEVEL SECURITY`);
    const drifted = await readState(owner);
    expect(wrong(drifted).some(line => line.startsWith(`${PROBE}:`))).toBe(true);
    await owner.query("SELECT project_os_apply_conventions()");
    expect(wrong(await readState(owner))).toEqual([]);
  });

  it("NEGATIVE: a policy changed by hand (same name, other rule) no longer carries the fingerprint, so the sweep writes the rule back", async () => {
    await owner.query(`ALTER POLICY project_os_isolation ON ${PROBE} USING (true) WITH CHECK (true)`);
    await owner.query(`COMMENT ON POLICY project_os_isolation ON ${PROBE} IS 'hand-edited'`);
    await owner.query("SELECT project_os_apply_conventions()");
    const [rows] = await owner.query<{ qual: string }[]>("SELECT pg_get_expr(p.polqual, p.polrelid) AS qual FROM pg_policy p WHERE p.polrelid = ?::regclass", [PROBE]);
    expect(rows[0].qual).toContain("app_tenant_ids");
  });

  it("NEGATIVE: a table with no tenant_id that nobody classified still stops the sweep, before anything is touched", async () => {
    await owner.query("CREATE TABLE zz_sweep_unclassified (id integer PRIMARY KEY)");
    try {
      const attempt = await owner.query("SELECT project_os_apply_conventions()").then(() => null, error => error as Error);
      expect(String(attempt?.message)).toMatch(/not classified in project_os_apply_conventions/);
    } finally {
      await owner.query("DROP TABLE zz_sweep_unclassified");
    }
  });
});
