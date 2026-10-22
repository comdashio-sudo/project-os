import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import pg from "pg";
import { getDb, pgErrorCode, runWithDbContext } from "./_core/database";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 6, item 2 — the audit trail is append-only in the DATABASE, not by convention: the application role holds SELECT and INSERT only
// (no UPDATE, DELETE, TRUNCATE), and triggers refuse UPDATE, DELETE and TRUNCATE for EVERYONE, the table's owner included, even with triggers
// switched off for the session. One negative test for each way of changing or erasing a row, each run as the party that could try it.
// Every statement below runs inside a transaction that is rolled back or is refused: the table is left exactly as it was ("داخل transaction مُلغاة").
const ownerUrl = process.env.TEST_DATABASE_URL;
const T = "00000000-0000-4000-8000-0000000000f1";
const OTHER = "00000000-0000-4000-8000-0000000000f2";
const ENTRY = "00000000-0000-4000-8000-0000000000f3";
const as = (tenantIds: string[]) => ({ userId: null, tenantIds, system: false });

describe.skipIf(!isTestDatabaseUrl(ownerUrl))("the audit trail is append-only in the database", () => {
  let owner: pg.Client;
  const total = async () => Number((await owner.query("SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id IN ($1, $2)", [T, OTHER])).rows[0].n);
  /** Runs one statement as the OWNER inside a transaction that is always rolled back, and returns the error it raised (null when it succeeded). */
  const ownerAttempt = async (statement: string, prelude: string[] = []) => {
    await owner.query("BEGIN");
    try { for (const setup of prelude) await owner.query(setup); await owner.query(statement); return null; }
    catch (error) { return error as Error & { code?: string }; }
    finally { await owner.query("ROLLBACK"); }
  };

  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerUrl });
    await owner.connect();
    // The fixture company rows, and one audit entry per company, are written (and later removed) as the owner with the guard lifted for those statements only.
    await owner.query("DELETE FROM companies WHERE id IN ($1, $2)", [T, OTHER]);
    await owner.query("INSERT INTO companies (id, legal_name, slug) VALUES ($1, 'Audit T', 'audit-t'), ($2, 'Audit O', 'audit-o')", [T, OTHER]);
    await owner.query("INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES ($1, $2, 'audit.fixture', 'probe')", [ENTRY, T]);
  });
  afterAll(async () => {
    await owner.query("BEGIN");
    for (const trigger of ["audit_logs_refuse_delete"]) await owner.query(`ALTER TABLE audit_logs DISABLE TRIGGER ${trigger}`);
    await owner.query("DELETE FROM audit_logs WHERE tenant_id IN ($1, $2)", [T, OTHER]);
    await owner.query("ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_delete");
    await owner.query("COMMIT");
    await owner.query("DELETE FROM companies WHERE id IN ($1, $2)", [T, OTHER]);
    await owner.end();
  });

  it("the application role may read and append its own company's entries (the two things it is for)", async () => {
    const id = randomUUID();
    await runWithDbContext(as([T]), async () => {
      const db = (await getDb())!;
      await db.execute(sql`INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES (${id}, ${T}, 'audit.appended', 'probe')`);
      expect((await db.execute(sql`SELECT id FROM audit_logs WHERE id IN (${id}, ${ENTRY})`)).rows.length).toBe(2);
    });
    expect(await total()).toBe(2);
  });

  it("the application role cannot append for another company, and cannot read another company's entries", async () => {
    await runWithDbContext(as([T]), async () => {
      const db = (await getDb())!;
      const refused = await db.execute(sql`INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES (${randomUUID()}, ${OTHER}, 'audit.forged', 'probe')`).then(() => null, error => error);
      expect(pgErrorCode(refused)).toBe("42501");
    });
    await runWithDbContext(as([OTHER]), async () => {
      const db = (await getDb())!;
      expect((await db.execute(sql`SELECT id FROM audit_logs WHERE id = ${ENTRY}`)).rows).toEqual([]);
    });
  });

  it("NEGATIVE — the application role cannot UPDATE an entry: no privilege (42501), and the row is unchanged", async () => {
    await runWithDbContext(as([T]), async () => {
      const db = (await getDb())!;
      const error = await db.execute(sql`UPDATE audit_logs SET action = 'tampered' WHERE id = ${ENTRY}`).then(() => null, e => e);
      expect(pgErrorCode(error)).toBe("42501");
    });
    expect((await owner.query("SELECT action FROM audit_logs WHERE id = $1", [ENTRY])).rows[0].action).toBe("audit.fixture");
  });

  it("NEGATIVE — the application role cannot DELETE an entry: no privilege (42501)", async () => {
    const before = await total();
    await runWithDbContext(as([T]), async () => {
      const db = (await getDb())!;
      const error = await db.execute(sql`DELETE FROM audit_logs WHERE id = ${ENTRY}`).then(() => null, e => e);
      expect(pgErrorCode(error)).toBe("42501");
    });
    expect(await total()).toBe(before);
  });

  it("NEGATIVE — the application role cannot TRUNCATE the trail, with or without a context: no privilege (42501)", async () => {
    const before = await total();
    const db = (await getDb())!;
    expect(pgErrorCode(await db.execute(sql`TRUNCATE audit_logs`).then(() => null, e => e))).toBe("42501");
    await runWithDbContext(as([T]), async () => {
      expect(pgErrorCode(await db.execute(sql`TRUNCATE audit_logs`).then(() => null, e => e))).toBe("42501");
    });
    expect(await total()).toBe(before);
  });

  it("NEGATIVE — the application role cannot give itself the privilege, switch the guards off, or drop them (it is not the owner)", async () => {
    const db = (await getDb())!;
    for (const statement of [
      "ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_refuse_update",
      "ALTER TABLE audit_logs DISABLE TRIGGER ALL",
      "DROP TRIGGER audit_logs_refuse_delete ON audit_logs",
      "ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY",
      "DROP TABLE audit_logs",
      "CREATE TABLE audit_logs_shadow (id integer)",
    ]) {
      const error = await db.execute(sql.raw(statement)).then(() => null, e => e);
      expect(pgErrorCode(error), statement).toBe("42501");
    }
  });

  it("NEGATIVE — the application role cannot give itself the privilege: the GRANT is a no-op (PostgreSQL only warns), and it still holds none", async () => {
    const db = (await getDb())!;
    await db.execute(sql.raw("GRANT UPDATE, DELETE, TRUNCATE ON audit_logs TO project_os_app")).then(() => null, () => null);
    const { rows } = await owner.query<{ priv: string; has: boolean }>("SELECT p AS priv, has_table_privilege('project_os_app', 'public.audit_logs', p) AS has FROM unnest(ARRAY['UPDATE','DELETE','TRUNCATE']) AS p");
    expect(rows.map(row => row.has)).toEqual([false, false, false]);
  });

  it("NEGATIVE — the OWNER cannot UPDATE an entry either: the trigger refuses it", async () => {
    const error = await ownerAttempt("UPDATE audit_logs SET action = 'tampered' WHERE id = '" + ENTRY + "'");
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/audit_logs is append-only: UPDATE is refused/);
  });

  it("NEGATIVE — the OWNER cannot DELETE an entry: the trigger refuses it", async () => {
    const error = await ownerAttempt("DELETE FROM audit_logs WHERE id = '" + ENTRY + "'");
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/audit_logs is append-only: DELETE is refused/);
  });

  it("NEGATIVE — the OWNER cannot TRUNCATE the trail: the statement trigger refuses it", async () => {
    const error = await ownerAttempt("TRUNCATE audit_logs");
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/audit_logs is append-only: TRUNCATE is refused/);
  });

  it("NEGATIVE — switching triggers off for the session (session_replication_role = replica) does not lift the guard", async () => {
    for (const statement of ["UPDATE audit_logs SET action = 'x'", "DELETE FROM audit_logs", "TRUNCATE audit_logs"]) {
      const error = await ownerAttempt(statement, ["SET LOCAL session_replication_role = replica"]);
      expect(error?.message, statement).toMatch(/audit_logs is append-only/);
    }
  });

  it("NEGATIVE — a cascade from a parent does not erase entries either (deleting the company is refused while its entries exist, or leaves them)", async () => {
    const error = await ownerAttempt("DELETE FROM companies WHERE id = '" + T + "'");
    // either the foreign key stops the delete, or (no foreign key) the entries are untouched; in both cases they survive
    expect(await total()).toBeGreaterThanOrEqual(1);
    if (error) expect(["23503", "42501"]).toContain(error.code);
  });

  it("the guards are the kind that survive a copy of the schema: all three triggers exist and fire ALWAYS (even when the session turns triggers off)", async () => {
    const { rows } = await owner.query<{ tgname: string; tgenabled: string }>("SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal ORDER BY tgname");
    expect(rows).toEqual([
      { tgname: "audit_logs_refuse_delete", tgenabled: "A" },
      { tgname: "audit_logs_refuse_truncate", tgenabled: "A" },
      { tgname: "audit_logs_refuse_update", tgenabled: "A" },
    ]);
    const { rows: privileges } = await owner.query<{ priv: string; has: boolean }>("SELECT p AS priv, has_table_privilege('project_os_app', 'public.audit_logs', p) AS has FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p");
    expect(Object.fromEntries(privileges.map(row => [row.priv, row.has]))).toEqual({ SELECT: true, INSERT: true, UPDATE: false, DELETE: false, TRUNCATE: false, REFERENCES: false, TRIGGER: false });
  });

  it("after every attempt above the trail holds exactly what was appended", async () => {
    expect((await owner.query("SELECT action FROM audit_logs WHERE tenant_id = $1 ORDER BY action", [T])).rows.map(row => row.action)).toEqual(["audit.appended", "audit.fixture"]);
  });
});
