import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, pgErrorCode, runWithDbContext, withSystemContext, type DbContext } from "./_core/database";
import fixtureDb, { type Connection } from "./testing/pgCompat";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 6, item 3 — row-level security as the second layer of tenant isolation, proved as the RESTRICTED application role (project_os_app),
// through the same connection layer the server uses (server/_core/database.ts), with a positive AND a negative case for each policy shape:
//   tenant tables (tenant_id), the company table itself (id), child tables (rows that reach their company through a parent), global tables
//   (no company), the audit trail (read + insert only), and the default: no context, no company row.
// The first server layer (every query filtered by tenant, checked in db.ts) is unchanged and tested elsewhere; here every query is written WITHOUT a
// tenant filter on purpose, which is what a forgotten filter looks like.
process.env.DATABASE_POOL_MAX = "1"; // one connection: proves a context never leaks to the next statement that reuses it
process.env.TEST_DB_NO_FALLBACK = "true"; // a direct call with no request around it must see nothing here (the other suites play the server's own jobs)

const ownerUrl = process.env.TEST_DATABASE_URL;
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b1";
const ids = {
  projectA: "00000000-0000-4000-8000-0000000000a2", projectB: "00000000-0000-4000-8000-0000000000b2",
  roleA: "00000000-0000-4000-8000-0000000000a3", roleB: "00000000-0000-4000-8000-0000000000b3",
  membershipA: "00000000-0000-4000-8000-0000000000a4", membershipB: "00000000-0000-4000-8000-0000000000b4",
  mrA: "00000000-0000-4000-8000-0000000000a5", mrB: "00000000-0000-4000-8000-0000000000b5",
  importA: "00000000-0000-4000-8000-0000000000a6", importB: "00000000-0000-4000-8000-0000000000b6",
  errorA: "00000000-0000-4000-8000-0000000000a7", errorB: "00000000-0000-4000-8000-0000000000b7",
  auditA: "00000000-0000-4000-8000-0000000000a8", auditB: "00000000-0000-4000-8000-0000000000b8",
  permission: "00000000-0000-4000-8000-0000000000c1",
};
let owner: Connection;
let userA = 0; let userB = 0; let shared = 0;
const asA = (): DbContext => ({ userId: userA, tenantIds: [A], system: false });
const asB = (): DbContext => ({ userId: userB, tenantIds: [B], system: false });
const asBoth = (): DbContext => ({ userId: shared, tenantIds: [A, B], system: false });
const count = async (table: string): Promise<number> => {
  const db = (await getDb())!;
  const { rows } = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${scopeOf(table)}`));
  return Number((rows[0] as { n: number }).n);
};
// only the fixture's own rows, so other tests' leftovers cannot change the counts
const scopeOf = (table: string) => ({
  companies: `id IN ('${A}','${B}')`, projects: `id IN ('${ids.projectA}','${ids.projectB}')`, roles: `id IN ('${ids.roleA}','${ids.roleB}')`,
  memberships: `id IN ('${ids.membershipA}','${ids.membershipB}')`, membership_roles: `id IN ('${ids.mrA}','${ids.mrB}')`,
  data_imports: `id IN ('${ids.importA}','${ids.importB}')`, data_import_errors: `id IN ('${ids.errorA}','${ids.errorB}')`,
  audit_logs: `id IN ('${ids.auditA}','${ids.auditB}')`, role_permissions: `role_id IN ('${ids.roleA}','${ids.roleB}')`,
  permissions: `id = '${ids.permission}'`,
} as Record<string, string>)[table] ?? "1=1";

async function cleanup() {
  await owner.query("DELETE FROM data_import_errors WHERE id IN (?, ?)", [ids.errorA, ids.errorB]);
  await owner.query("DELETE FROM data_imports WHERE id IN (?, ?)", [ids.importA, ids.importB]);
  await owner.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [A, B]);
  await owner.query("DELETE FROM membership_roles WHERE id IN (?, ?)", [ids.mrA, ids.mrB]);
  await owner.query("DELETE FROM role_permissions WHERE roleId IN (?, ?)", [ids.roleA, ids.roleB]);
  await owner.query("DELETE FROM memberships WHERE id IN (?, ?)", [ids.membershipA, ids.membershipB]);
  await owner.query("DELETE FROM roles WHERE id IN (?, ?)", [ids.roleA, ids.roleB]);
  await owner.query("DELETE FROM projects WHERE id IN (?, ?)", [ids.projectA, ids.projectB]);
  await owner.query("DELETE FROM permissions WHERE id = ?", [ids.permission]);
  await owner.query("DELETE FROM companies WHERE id IN (?, ?)", [A, B]);
  await owner.query("DELETE FROM users WHERE openId LIKE 'rls-test-%'");
}

describe.skipIf(!isTestDatabaseUrl(ownerUrl))("row-level security: the second layer of tenant isolation (as the restricted application role)", () => {
  beforeAll(async () => {
    owner = await fixtureDb.createConnection(ownerUrl!);
    await cleanup();
    userA = ((await owner.query("INSERT INTO users (openId, name, email) VALUES ('rls-test-a', 'A', 'a@rls.example.test')"))[0] as { insertId: number }).insertId;
    userB = ((await owner.query("INSERT INTO users (openId, name, email) VALUES ('rls-test-b', 'B', 'b@rls.example.test')"))[0] as { insertId: number }).insertId;
    shared = ((await owner.query("INSERT INTO users (openId, name, email) VALUES ('rls-test-shared', 'S', 's@rls.example.test')"))[0] as { insertId: number }).insertId;
    await owner.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'RLS A', 'rls-a'), (?, 'RLS B', 'rls-b')", [A, B]);
    await owner.query("INSERT INTO projects (id, tenantId, code, name, projectType, lifecycleStage, status, currency) VALUES (?, ?, 'RLS-A', 'A project', 'infrastructure', 'planning', 'active', 'SAR'), (?, ?, 'RLS-B', 'B project', 'infrastructure', 'planning', 'active', 'SAR')", [ids.projectA, A, ids.projectB, B]);
    await owner.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES (?, ?, 'RLS_ROLE', 'A role', 'EXECUTIVE'), (?, ?, 'RLS_ROLE', 'B role', 'EXECUTIVE')", [ids.roleA, A, ids.roleB, B]);
    await owner.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, 'active'), (?, ?, ?, 'active')", [ids.membershipA, A, userA, ids.membershipB, B, userB]);
    await owner.query("INSERT INTO membership_roles (id, membershipId, roleId) VALUES (?, ?, ?), (?, ?, ?)", [ids.mrA, ids.membershipA, ids.roleA, ids.mrB, ids.membershipB, ids.roleB]);
    await owner.query("INSERT INTO permissions (id, code, name, productCode) VALUES (?, 'rls.probe', 'probe', 'EXECUTIVE')", [ids.permission]);
    await owner.query("INSERT INTO role_permissions (roleId, permissionId) VALUES (?, ?), (?, ?)", [ids.roleA, ids.permission, ids.roleB, ids.permission]);
    await owner.query("INSERT INTO data_imports (id, tenantId, projectId, moduleCode, templateCode, sourceFormat, fileName, fileKey, fileHash, createdByUserId) VALUES (?, ?, ?, 'wbs', 'wbs-v1', 'xlsx', 'a.xlsx', 'k/a', ?, ?), (?, ?, ?, 'wbs', 'wbs-v1', 'xlsx', 'b.xlsx', 'k/b', ?, ?)", [ids.importA, A, ids.projectA, "a".repeat(64), userA, ids.importB, B, ids.projectB, "b".repeat(64), userB]);
    await owner.query("INSERT INTO data_import_errors (id, importId, rowNumber, code, severity) VALUES (?, ?, 1, 'X', 'error'), (?, ?, 1, 'X', 'error')", [ids.errorA, ids.importA, ids.errorB, ids.importB]);
    await owner.query("INSERT INTO audit_logs (id, tenantId, actorUserId, action, entityType) VALUES (?, ?, ?, 'rls.fixture', 'probe'), (?, ?, ?, 'rls.fixture', 'probe')", [ids.auditA, A, userA, ids.auditB, B, userB]);
  });
  afterAll(async () => { await cleanup(); await owner.end(); });

  it("is the restricted application role, which can neither bypass row-level security nor own a table", async () => {
    const db = (await getDb())!;
    const { rows } = await db.execute(sql`SELECT current_user AS who, r.rolsuper, r.rolbypassrls, (SELECT count(*)::int FROM pg_tables WHERE tableowner = current_user) AS owned FROM pg_roles r WHERE r.rolname = current_user`);
    expect(rows[0]).toMatchObject({ who: "project_os_app", rolsuper: false, rolbypassrls: false, owned: 0 });
  });

  it("every table in the schema has row-level security on, and every table with a tenant_id has a policy for the application role", async () => {
    const [bare] = await owner.query<{ relname: string }[]>("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity");
    expect(bare).toEqual([]);
    const [unpoliced] = await owner.query<{ relname: string }[]>("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)");
    expect(unpoliced).toEqual([]);
    const [tenantTables] = await owner.query<{ n: number }[]>("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenant_id'");
    expect(Number(tenantTables[0].n)).toBeGreaterThan(90);
  });

  it("NO context, no company row: every tenant table, child table and the company table read as empty", async () => {
    expect(await Promise.all(["companies", "projects", "roles", "memberships", "membership_roles", "role_permissions", "data_imports", "data_import_errors", "audit_logs"].map(count))).toEqual(Array(9).fill(0));
  });

  it("a company context sees its own rows and NOT the other company's (positive and negative, tenant tables and the company itself)", async () => {
    await runWithDbContext(asA(), async () => {
      expect(await Promise.all(["companies", "projects", "roles", "memberships", "audit_logs"].map(count))).toEqual([1, 1, 1, 1, 1]);
      const db = (await getDb())!;
      const { rows } = await db.execute(sql`SELECT id FROM projects WHERE id IN (${ids.projectA}, ${ids.projectB})`); // no tenant filter: a forgotten one
      expect(rows).toEqual([{ id: ids.projectA }]);
    });
    await runWithDbContext(asB(), async () => {
      const db = (await getDb())!;
      const { rows } = await db.execute(sql`SELECT id FROM companies WHERE id IN (${A}, ${B})`);
      expect(rows).toEqual([{ id: B }]);
    });
  });

  it("child tables follow their parent's company: membership roles, role permissions, import errors", async () => {
    await runWithDbContext(asA(), async () => {
      expect(await Promise.all(["membership_roles", "role_permissions", "data_import_errors", "data_imports"].map(count))).toEqual([1, 1, 1, 1]);
      const db = (await getDb())!;
      expect((await db.execute(sql`SELECT id FROM data_import_errors WHERE id IN (${ids.errorA}, ${ids.errorB})`)).rows).toEqual([{ id: ids.errorA }]);
    });
    await runWithDbContext(asBoth(), async () => {
      expect(await Promise.all(["membership_roles", "role_permissions", "data_import_errors"].map(count))).toEqual([2, 2, 2]);
    });
  });

  it("a user in two companies sees both, and a system context (jobs, sign-up) sees every company", async () => {
    await runWithDbContext(asBoth(), async () => { expect(await count("projects")).toBe(2); });
    await withSystemContext("test: a job that works across companies", async () => { expect(await Promise.all(["companies", "projects", "audit_logs"].map(count))).toEqual([2, 2, 2]); });
  });

  it("a write for the OTHER company is refused (insert), and an update or delete of its rows touches nothing (negative)", async () => {
    await runWithDbContext(asA(), async () => {
      const db = (await getDb())!;
      const insertForB = await db.execute(sql`INSERT INTO projects (id, tenant_id, code, name, project_type, lifecycle_stage, status, currency) VALUES (${randomUUID()}, ${B}, 'RLS-X', 'x', 'infrastructure', 'planning', 'active', 'SAR')`).then(() => null, error => error);
      expect(pgErrorCode(insertForB)).toBe("42501"); // new row violates row-level security policy
      expect(String((insertForB as Error).cause ?? insertForB)).toMatch(/row-level security/);
      const updated = await db.execute(sql`UPDATE projects SET name = 'taken over' WHERE id = ${ids.projectB}`);
      expect(updated.rowCount).toBe(0);
      const deleted = await db.execute(sql`DELETE FROM projects WHERE id = ${ids.projectB}`);
      expect(deleted.rowCount).toBe(0);
      // moving own row to the other company is a write for the other company too
      const moved = await db.execute(sql`UPDATE projects SET tenant_id = ${B} WHERE id = ${ids.projectA}`).then(() => null, error => error);
      expect(pgErrorCode(moved)).toBe("42501");
    });
    const [rows] = await owner.query<{ id: string; name: string; tenantId: string }[]>("SELECT id, name, tenantId FROM projects WHERE id IN (?, ?) ORDER BY id", [ids.projectA, ids.projectB]);
    expect(rows).toEqual([{ id: ids.projectA, name: "A project", tenantId: A }, { id: ids.projectB, name: "B project", tenantId: B }]);
  });

  it("its own company's rows can be written and removed (positive)", async () => {
    const id = randomUUID();
    await runWithDbContext(asA(), async () => {
      const db = (await getDb())!;
      await db.execute(sql`INSERT INTO projects (id, tenant_id, code, name, project_type, lifecycle_stage, status, currency) VALUES (${id}, ${A}, 'RLS-OK', 'ok', 'infrastructure', 'planning', 'active', 'SAR')`);
      expect((await db.execute(sql`UPDATE projects SET name = 'renamed' WHERE id = ${id}`)).rowCount).toBe(1);
      expect((await db.execute(sql`DELETE FROM projects WHERE id = ${id}`)).rowCount).toBe(1);
    });
  });

  it("a child row cannot be attached to the other company's parent", async () => {
    await runWithDbContext(asA(), async () => {
      const db = (await getDb())!;
      const attach = await db.execute(sql`INSERT INTO data_import_errors (id, import_id, row_number, code, severity) VALUES (${randomUUID()}, ${ids.importB}, 9, 'X', 'error')`).then(() => null, error => error);
      expect(pgErrorCode(attach)).toBe("42501");
      const own = await db.execute(sql`INSERT INTO data_import_errors (id, import_id, row_number, code, severity) VALUES (${randomUUID()}, ${ids.importA}, 9, 'X', 'error')`);
      expect(own.rowCount).toBe(1);
    });
  });

  it("only a system context can create a company (sign-up); a company context cannot invent one", async () => {
    const id = randomUUID();
    await runWithDbContext(asA(), async () => {
      const db = (await getDb())!;
      const refused = await db.execute(sql`INSERT INTO companies (id, legal_name, slug) VALUES (${id}, 'Invented', ${`invented-${id.slice(0, 8)}`})`).then(() => null, error => error);
      expect(pgErrorCode(refused)).toBe("42501");
    });
    await withSystemContext("test: sign-up creates a company", async () => {
      const db = (await getDb())!;
      await db.execute(sql`INSERT INTO companies (id, legal_name, slug) VALUES (${id}, 'Created', ${`created-${id.slice(0, 8)}`})`);
    });
    await owner.query("DELETE FROM companies WHERE id = ?", [id]);
  });

  it("a company context can change its OWN company row (erasure suspends and tombstones it) and never another company's, nor move its row to another id", async () => {
    await runWithDbContext(asA(), async () => {
      const db = (await getDb())!;
      const own = await db.execute(sql`UPDATE companies SET status = 'suspended' WHERE id = ${A} AND status = 'active'`);
      expect(own.rowCount).toBe(1);
      const other = await db.execute(sql`UPDATE companies SET status = 'suspended' WHERE id = ${B}`);
      expect(other.rowCount).toBe(0); // filtered by the policy: B's row is not visible to A, so nothing matched (rows=0 here MEANS refused by the policy, proven by the owner's read below)
      const moved = await db.execute(sql`UPDATE companies SET id = ${B} WHERE id = ${A}`).then(() => null, error => error);
      expect(pgErrorCode(moved)).toBeTruthy(); // the new row would be B's: the check refuses (42501), or the key is already taken (23505) — either way it does not move
    });
    const [rows] = await owner.query<{ id: string; status: string }[]>("SELECT id, status FROM companies WHERE id IN (?, ?) ORDER BY id", [A, B]);
    expect(Object.fromEntries(rows.map(row => [row.id, row.status]))).toEqual({ [A]: "suspended", [B]: "active" });
    await owner.query("UPDATE companies SET status = 'active' WHERE id = ?", [A]);
  });

  it("the context lasts one statement or transaction: the next statement on the SAME connection sees nothing again", async () => {
    await runWithDbContext(asA(), async () => { expect(await count("projects")).toBe(1); });
    expect(await count("projects")).toBe(0); // pool of one connection: this statement reused it
    const db = (await getDb())!;
    const { rows } = await db.execute(sql`SELECT current_setting('app.tenant_ids', true) AS tenants, current_setting('app.system', true) AS system`);
    expect(rows[0]).toEqual({ tenants: "", system: "" });
  });

  it("holds inside a transaction too: the company's rows are visible, the other company's are not, and a write for it rolls the transaction back", async () => {
    await runWithDbContext(asA(), async () => {
      const db = (await getDb())!;
      await db.transaction(async tx => {
        expect((await tx.execute(sql`SELECT id FROM projects WHERE id IN (${ids.projectA}, ${ids.projectB})`)).rows).toEqual([{ id: ids.projectA }]);
        expect(((await tx.execute(sql`UPDATE projects SET name = 'inside tx' WHERE id = ${ids.projectA}`)).rowCount)).toBe(1);
      });
      const failing = await db.transaction(async tx => {
        await tx.execute(sql`UPDATE projects SET name = 'will roll back' WHERE id = ${ids.projectA}`);
        await tx.execute(sql`INSERT INTO projects (id, tenant_id, code, name, project_type, lifecycle_stage, status, currency) VALUES (${randomUUID()}, ${B}, 'RLS-Y', 'y', 'infrastructure', 'planning', 'active', 'SAR')`);
      }).then(() => null, error => error);
      expect(pgErrorCode(failing)).toBe("42501");
    });
    const [afterRows] = await owner.query<{ name: string }[]>("SELECT name FROM projects WHERE id = ?", [ids.projectA]);
    expect(afterRows[0].name).toBe("inside tx"); // the failed transaction's rename did not survive
    await owner.query("UPDATE projects SET name = 'A project' WHERE id = ?", [ids.projectA]);
  });

  it("global tables (no company) stay readable to the application role, so sign-in and the catalogue work without a context", async () => {
    expect(await count("permissions")).toBe(1);
  });

  it("the Data API roles of a Supabase project hold no privilege on any table or function, and no policy names them", async () => {
    const [roles] = await owner.query<{ rolname: string }[]>("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')");
    for (const { rolname } of roles) {
      const [tables] = await owner.query<{ n: number }[]>("SELECT count(*)::int AS n FROM pg_tables t WHERE t.schemaname = 'public' AND (has_table_privilege(?, format('%I.%I', t.schemaname, t.tablename), 'SELECT') OR has_table_privilege(?, format('%I.%I', t.schemaname, t.tablename), 'INSERT') OR has_table_privilege(?, format('%I.%I', t.schemaname, t.tablename), 'UPDATE') OR has_table_privilege(?, format('%I.%I', t.schemaname, t.tablename), 'DELETE'))", [rolname, rolname, rolname, rolname]);
      expect(Number(tables[0].n), `${rolname} table privileges`).toBe(0);
    }
    const [policies] = await owner.query<{ policyname: string; roles: string }[]>("SELECT policyname, array_to_string(roles, ',') AS roles FROM pg_policies WHERE schemaname = 'public'");
    expect(policies.length).toBeGreaterThan(100);
    expect(policies.filter(policy => policy.roles !== "project_os_app")).toEqual([]);
  });

  it("a table added later is classified by the sweep: with no tenant_id and no listing, the migration fails instead of leaving it open", async () => {
    await owner.query("CREATE TABLE zz_rls_probe_unclassified (id integer PRIMARY KEY)");
    try {
      const attempt = await owner.query("SELECT project_os_apply_conventions()").then(() => null, error => error as Error);
      expect(String(attempt?.message)).toMatch(/not classified in project_os_apply_conventions/);
    } finally {
      await owner.query("DROP TABLE zz_rls_probe_unclassified");
    }
    const [swept] = await owner.query<{ n: number }[]>("SELECT project_os_apply_conventions() AS n");
    expect(Number(swept[0].n)).toBeGreaterThan(100); // and the sweep is clean again once the probe is gone
  });
});
