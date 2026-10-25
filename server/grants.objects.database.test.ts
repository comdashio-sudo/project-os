import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixtureDb, { type Connection } from "./testing/pgCompat";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 18, section 0 item 4 (docs/TASLEEM_LESSONS.md section 4). PostgreSQL gives EXECUTE on every new function to PUBLIC, and on 2026-10-30 Supabase stops granting
// new tables and sequences to its API roles on its own. So nothing here relies on a default: what the application role may use is granted in the migration that creates it.
// Read from the catalogue with the ACL functions (aclexplode, has_*_privilege), never a text pattern. Probes run in transactions that are ROLLED BACK. Run as the OWNER.
const ownerUrl = process.env.TEST_DATABASE_URL;
let owner: Connection;

const openFunctions = `
  SELECT DISTINCT p.proname AS name FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.pronamespace = 'public'::regnamespace AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY 1`;

describe.skipIf(!isTestDatabaseUrl(ownerUrl))("object privileges: functions, sequences, tables are granted by what creates them", () => {
  beforeAll(async () => { owner = await fixtureDb.createConnection(ownerUrl!); });
  afterAll(async () => { await owner?.end(); });

  it("no function in public grants EXECUTE to PUBLIC (a NULL ACL counts as open: that is the PostgreSQL default)", async () => {
    const [rows] = await owner.query<{ name: string }[]>(openFunctions);
    expect(rows.map(row => row.name)).toEqual([]);
  });

  it("the application role may execute exactly the helper functions it calls, and not the maintenance or trigger functions", async () => {
    const [rows] = await owner.query<{ name: string; allowed: boolean }[]>(
      `SELECT p.proname AS name, has_function_privilege('project_os_app', p.oid, 'EXECUTE') AS allowed FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY 1`);
    const allowed = rows.filter(row => Boolean(row.allowed)).map(row => row.name);
    expect(allowed).toEqual(["app_system", "app_tenant_ids", "app_user_id", "project_os_analyze", "project_os_cell_qc_accepted"]);
  });

  it("a function created now has no EXECUTE for PUBLIC and none for the application role until it is granted (probe rolled back)", async () => {
    await owner.query("BEGIN");
    try {
      await owner.query("CREATE FUNCTION public.zz_probe_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
      const [open] = await owner.query<{ name: string }[]>(openFunctions);
      expect(open.map(row => row.name)).toEqual([]);
      const [[app]] = await owner.query<{ allowed: boolean }[]>("SELECT has_function_privilege('project_os_app', 'public.zz_probe_fn()', 'EXECUTE') AS allowed");
      expect(Boolean(app.allowed)).toBe(false);
      await owner.query("GRANT EXECUTE ON FUNCTION public.zz_probe_fn() TO project_os_app");
      const [[after]] = await owner.query<{ allowed: boolean }[]>("SELECT has_function_privilege('project_os_app', 'public.zz_probe_fn()', 'EXECUTE') AS allowed");
      expect(Boolean(after.allowed)).toBe(true);
    } finally { await owner.query("ROLLBACK"); }
    const [[left]] = await owner.query<{ present: boolean }[]>("SELECT to_regproc('public.zz_probe_fn') IS NOT NULL AS present");
    expect(Boolean(left.present)).toBe(false);
  });

  it("the default for functions the owner creates next excludes PUBLIC (pg_default_acl, not a text match)", async () => {
    const [[row]] = await owner.query<{ closed: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclobjtype = 'f' AND d.defaclnamespace = 0
                       AND d.defaclrole = (SELECT proowner FROM pg_proc WHERE proname = 'app_system' AND pronamespace = 'public'::regnamespace)
                       AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0)) AS closed`);
    expect(Boolean(row.closed)).toBe(true);
  });

  it("every sequence is usable by the application role, and a table and a sequence created now are granted by the convention sweep (probe rolled back)", async () => {
    const [unusable] = await owner.query<{ name: string }[]>("SELECT c.relname AS name FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('project_os_app', c.oid, 'USAGE') END");
    expect(unusable.map(row => row.name)).toEqual([]);
    await owner.query("BEGIN");
    try {
      await owner.query("CREATE TABLE public.zz_grant_probe (id serial PRIMARY KEY, tenant_id varchar(36) NOT NULL)");
      await owner.query("SELECT project_os_apply_conventions()");
      const [[state]] = await owner.query<{ table_ok: boolean; seq_ok: boolean }[]>(
        "SELECT has_table_privilege('project_os_app', 'public.zz_grant_probe', 'SELECT,INSERT,UPDATE,DELETE') AS table_ok, has_sequence_privilege('project_os_app', 'public.zz_grant_probe_id_seq', 'USAGE') AS seq_ok");
      expect([Boolean(state.table_ok), Boolean(state.seq_ok)]).toEqual([true, true]);
    } finally { await owner.query("ROLLBACK"); }
  });
});
