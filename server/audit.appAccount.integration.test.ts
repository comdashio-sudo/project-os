import pg from "pg";
import { describe, expect, it } from "vitest";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// The restricted application role, connected to for real. TEST_APP_DATABASE_URL is the test database addressed as project_os_app.
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = isTestDatabaseUrl(appUrl);

async function asApp<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: appUrl });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
/** The SQLSTATE of a failed statement, inside a transaction that is always rolled back. */
async function failureCode(client: pg.Client, sql: string): Promise<string | null> {
  await client.query("BEGIN");
  try { await client.query(sql); return null; } catch (error) { return (error as { code?: string }).code ?? "UNKNOWN"; } finally { await client.query("ROLLBACK"); }
}

describe("restricted audit application account (project_os_app)", () => {
  it.skipIf(!enabled)("connects with the supplied secret and executes a read-only health query", async () => {
    const rows = await asApp(async client => (await client.query("SELECT 1 AS connected, current_user AS who")).rows);
    expect(rows).toEqual([{ connected: 1, who: "project_os_app" }]);
  }, 15_000);

  it.skipIf(!enabled)("holds SELECT and INSERT on audit_logs and nothing else: no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER", async () => {
    const held = await asApp(async client => (await client.query(
      "SELECT p, has_table_privilege(current_user, 'public.audit_logs', p) AS yes FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p")).rows);
    expect(Object.fromEntries(held.map(row => [row.p, row.yes]))).toEqual({ SELECT: true, INSERT: true, UPDATE: false, DELETE: false, TRUNCATE: false, REFERENCES: false, TRIGGER: false });
  }, 15_000);

  it.skipIf(!enabled)("is refused UPDATE, DELETE and TRUNCATE on audit_logs by the database itself (42501), whatever the context", async () => {
    await asApp(async client => {
      for (const sql of ["UPDATE audit_logs SET action = action WHERE false", "DELETE FROM audit_logs WHERE false", "TRUNCATE audit_logs"]) {
        expect(await failureCode(client, sql), sql).toBe("42501");
        // the same with the all-tenants system context switched on: the privilege, not the row filter, is what refuses
        await client.query("BEGIN");
        try { await client.query("SELECT set_config('app.system', 'on', true)"); await client.query(sql); expect.unreachable(sql); } catch (error) { expect((error as { code?: string }).code, sql).toBe("42501"); } finally { await client.query("ROLLBACK"); }
      }
    });
  }, 15_000);

  it.skipIf(!enabled)("can append to audit_logs for a tenant it may see, and cannot append for one it may not (row-level security)", async () => {
    await asApp(async client => {
      await client.query("BEGIN");
      try {
        // two companies, created in the system context (a company is a system act), then the role is narrowed to tenant A
        await client.query("SELECT set_config('app.system', 'on', true)");
        await client.query("INSERT INTO companies (id, legal_name, slug) VALUES ('00000000-0000-4000-8000-0000000a0001', 'Audit probe A', 'audit-probe-a'), ('00000000-0000-4000-8000-0000000b0001', 'Audit probe B', 'audit-probe-b')");
        await client.query("SELECT set_config('app.system', 'off', true), set_config('app.tenant_ids', '00000000-0000-4000-8000-0000000a0001', true)");
        const own = await client.query("INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES ('00000000-0000-4000-8000-0000000a0d01', '00000000-0000-4000-8000-0000000a0001', 'probe.append', 'probe') RETURNING id");
        expect(own.rowCount).toBe(1);
        await expect(client.query("INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES ('00000000-0000-4000-8000-0000000b0d01', '00000000-0000-4000-8000-0000000b0001', 'probe.append', 'probe')")).rejects.toMatchObject({ code: "42501" });
      } finally { await client.query("ROLLBACK"); }
    });
  }, 15_000);
});
