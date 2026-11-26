import fixtureDb from "./testing/pgCompat";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// I57 (the adviser's decision, 26-11 05:30): a company that approved one strategy assumption could not be erased, because the change history refuses DELETE
// for every role. 0054 lets that history go only inside the erasure's own transaction (project_os.erasing_tenant, SET LOCAL), for that company's rows, after
// its freeze; UPDATE and TRUNCATE stay refused always. Two companies side by side; synthetic people and values only (*.example.test).
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("I57: erasing a company with an approved strategy assumption", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client; let connection: fixtureDb.Connection;
  const outcome = (work: Promise<unknown>) => work.then(() => "no error", (error: Error) => error.message);
  const changes = async (tenantId: string) => Number((await client.query("SELECT COUNT(*)::int AS n FROM strategy_assumption_changes WHERE tenant_id = $1", [tenantId])).rows[0].n);

  // an approved assumption and the history row its approval writes (as strategyAssumptions.ts decideStrategyAssumption does), written as the table owner
  const seedApproved = async (fixture: Fixture) => {
    const assumptionId = randomUUID();
    await client.query(`INSERT INTO strategy_assumptions (id, tenant_id, code, name, unit, source_type, confidence, review_frequency, status, value_conservative, value_base, value_optimistic, created_by_user_id, approved_by_user_id, approved_at)
      VALUES ($1, $2, 'I57-RATE', 'Win rate (synthetic)', 'percent', 'internal', 'medium', 'quarterly', 'approved', 10, 20, 30, $3, $3, now())`, [assumptionId, fixture.tenantId, fixture.owner.id]);
    await client.query(`INSERT INTO strategy_assumption_changes (id, tenant_id, assumption_id, kind, new_conservative, new_base, new_optimistic, decided_by_user_id) VALUES ($1, $2, $3, 'approved', 10, 20, 30, $4)`,
      [randomUUID(), fixture.tenantId, assumptionId, fixture.owner.id]);
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    a = await createRoleFixture({ label: "i57a" });
    b = await createRoleFixture({ label: "i57b" });
    await seedApproved(a); await seedApproved(b);
  });

  afterAll(async () => {
    // test database only: remove what this file made, including the audit rows and tombstones the restricted account could not remove
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [fixture.tenantId]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [fixture.tenantId]).catch(() => undefined);
    }
    await connection?.end(); await client?.end();
  });

  it("NEGATIVE: without the erasure's flag DELETE is refused; with it, still refused while the company is active; UPDATE and TRUNCATE refused always", async () => {
    expect(await outcome(client.query("DELETE FROM strategy_assumption_changes WHERE tenant_id = $1", [a.tenantId]))).toMatch(/append-only: DELETE is refused/);
    await client.query("BEGIN");
    await client.query("SELECT set_config('project_os.erasing_tenant', $1, true)", [a.tenantId]);
    expect(await outcome(client.query("DELETE FROM strategy_assumption_changes WHERE tenant_id = $1", [a.tenantId]))).toMatch(/append-only: DELETE is refused/); // A is still active
    await client.query("ROLLBACK");
    await client.query("BEGIN");
    await client.query("SELECT set_config('project_os.erasing_tenant', $1, true)", [a.tenantId]);
    expect(await outcome(client.query("UPDATE strategy_assumption_changes SET reason = 'rewritten' WHERE tenant_id = $1", [a.tenantId]))).toMatch(/append-only: UPDATE is refused/);
    await client.query("ROLLBACK");
    expect(await outcome(client.query("TRUNCATE strategy_assumption_changes"))).toMatch(/append-only: TRUNCATE is refused|cannot truncate a table referenced/);
    expect(await changes(a.tenantId)).toBe(1);
  });

  it("NEGATIVE: once A is frozen, the flag for another company does not remove A's rows, and the flag does not outlive its transaction", async () => {
    // A no longer active, as the freeze leaves it (the erasure below freezes it itself and writes tenant.deletion_frozen)
    await client.query("UPDATE companies SET status = 'suspended' WHERE id = $1", [a.tenantId]);
    await client.query("BEGIN");
    await client.query("SELECT set_config('project_os.erasing_tenant', $1, true)", [b.tenantId]);
    expect(await outcome(client.query("DELETE FROM strategy_assumption_changes WHERE tenant_id = $1", [a.tenantId]))).toMatch(/append-only: DELETE is refused/);
    await client.query("ROLLBACK");
    // set inside a transaction that commits: gone afterwards, so a later DELETE in the same session is refused
    await client.query("BEGIN");
    await client.query("SELECT set_config('project_os.erasing_tenant', $1, true)", [a.tenantId]);
    await client.query("COMMIT");
    expect((await client.query("SELECT current_setting('project_os.erasing_tenant', true) AS flag")).rows[0].flag || "").toBe("");
    expect(await outcome(client.query("DELETE FROM strategy_assumption_changes WHERE tenant_id = $1", [a.tenantId]))).toMatch(/append-only: DELETE is refused/);
    expect(await changes(a.tenantId)).toBe(1);
  });

  it("POSITIVE: erasing A removes its assumptions and their history (PASS); B's history is untouched; A's audit rows are kept", async () => {
    const report = await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined });
    expect(report.verification).toBe("PASS");
    expect(await changes(a.tenantId)).toBe(0);
    expect(Number((await client.query("SELECT COUNT(*)::int AS n FROM strategy_assumptions WHERE tenant_id = $1", [a.tenantId])).rows[0].n)).toBe(0);
    expect(await changes(b.tenantId)).toBe(1);
    expect(Number((await client.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'tenant.deletion_frozen'", [a.tenantId])).rows[0].n)).toBeGreaterThan(0);
  });
});
