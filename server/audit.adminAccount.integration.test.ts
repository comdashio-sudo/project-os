import pg from "pg";
import { describe, expect, it } from "vitest";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Two accounts, two jobs. The OWNER role (DATABASE_URL here; `postgres` on Supabase) migrates and provisions; it is never the application's
// connection. The application role (TEST_APP_DATABASE_URL) can do none of the owner's things. This replaces the old separate audit administrator:
// on PostgreSQL the audit trail is protected by triggers that refuse change for everyone, so there is no account that may edit it.
const ownerUrl = process.env.DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = isTestDatabaseUrl(ownerUrl) && isTestDatabaseUrl(appUrl);

async function using<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
const failureCode = async (client: pg.Client, sql: string) => {
  await client.query("BEGIN");
  try { await client.query(sql); return null; } catch (error) { return (error as { code?: string }).code ?? "UNKNOWN"; } finally { await client.query("ROLLBACK"); }
};

describe("owner role versus application role", () => {
  it.skipIf(!enabled)("the owner connects and executes a read-only health query", async () => {
    const rows = await using(ownerUrl!, async client => (await client.query("SELECT 1 AS connected")).rows);
    expect(rows).toEqual([{ connected: 1 }]);
  }, 15_000);

  it.skipIf(!enabled)("the application role is not a superuser, cannot bypass row-level security, and cannot create or alter anything", async () => {
    await using(appUrl!, async client => {
      const flags = (await client.query("SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user")).rows[0];
      expect(flags).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
      expect(await failureCode(client, "CREATE TABLE zz_app_role_must_not_create (id int)")).toBe("42501");
      expect(await failureCode(client, "ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_refuse_update")).toBe("42501");
      expect(await failureCode(client, "DROP TABLE audit_logs")).toBe("42501");
      expect(await failureCode(client, "CREATE ROLE zz_must_not_exist")).toBe("42501");
    });
  }, 15_000);

  it.skipIf(!enabled)("the application role cannot read credentials (pg_authid) and cannot lift row-level security with a session setting", async () => {
    await using(appUrl!, async client => {
      expect(await failureCode(client, "SELECT rolpassword FROM pg_authid")).toBe("42501");
      expect(await failureCode(client, "SET session_replication_role = replica")).toBe("42501");
      expect((await client.query("SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create")).rows[0].can_create).toBe(false);
    });
  }, 15_000);

  it.skipIf(!enabled)("even the owner cannot edit the audit trail: the append-only triggers refuse UPDATE, DELETE and TRUNCATE", async () => {
    await using(ownerUrl!, async client => {
      await client.query("BEGIN");
      try {
        await client.query("INSERT INTO companies (id, legal_name, slug) VALUES ('00000000-0000-4000-8000-0000000c0001', 'Owner probe', 'owner-probe')");
        await client.query("INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES ('00000000-0000-4000-8000-0000000c0d01', '00000000-0000-4000-8000-0000000c0001', 'probe', 'probe')");
        for (const sql of ["UPDATE audit_logs SET action = 'x' WHERE id = '00000000-0000-4000-8000-0000000c0d01'", "DELETE FROM audit_logs WHERE id = '00000000-0000-4000-8000-0000000c0d01'", "TRUNCATE audit_logs"]) {
          await client.query("SAVEPOINT s");
          await expect(client.query(sql), sql).rejects.toMatchObject({ code: "42501", message: expect.stringContaining("append-only") });
          await client.query("ROLLBACK TO SAVEPOINT s");
        }
      } finally { await client.query("ROLLBACK"); }
    });
  }, 15_000);
});
