import mysql from "./testing/pgCompat";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { seedDemoData } from "../scripts/lib/demoData.mjs";
import { getDb } from "./db";
import { countTenantData, deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// The freeze that starts an erasure, against requests that are really running at the same moment: after it commits, every write that begins is
// refused (explicitly, not silently), two erasures cannot both run, and a request that was already in flight when the freeze came is swept up
// by the next pass. Synthetic company only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("freezing a company before its data is erased", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let connection: mysql.Connection;
  const made: Fixture[] = [];
  const fresh = async () => {
    const fixture = await createRoleFixture({ label: "freeze" }); made.push(fixture);
    await seedDemoData({ caller: fixture.asOwner, connection, tenantId: fixture.tenantId, projectId: fixture.projectId, user: fixture.owner.row }).catch(() => undefined);
    return fixture;
  };
  let counter = 0;
  const writesFor = (f: Fixture) => {
    const owner = f.callerFor(f.owner); const base = { tenantId: f.tenantId, projectId: f.projectId };
    const n = () => `${f.run}${++counter}`;
    return [
      () => owner.warehouses.create({ ...base, code: `W${n()}`, name: "Store" }),
      () => owner.procurement.createSupplier({ tenantId: f.tenantId, code: `S${n()}`, legalName: "Supplier Co." }),
      () => owner.budgets.create({ ...base, costCode: `B${n()}`, originalAmount: 10, currentAmount: 10 }),
      () => owner.costs.createActual({ ...base, amount: 5 + counter / 1000, incurredAt: new Date() }),
      () => owner.wbs.create({ ...base, code: `X${n()}`, name: "Package" }),
      () => owner.activities.create({ ...base, code: `A${n()}`, name: "Activity", plannedStartAt: new Date(), plannedFinishAt: new Date(Date.now() + 86_400_000) }),
      () => owner.fieldReports.create({ ...base, reportNumber: `FR${n()}`, reportType: "daily", reportedAt: new Date(), shift: "day", workforceCount: 3, summary: "Daily report text" }),
    ];
  };
  const refusal = (error: unknown) => error instanceof Error && /not licensed|Active tenant membership|Required permission|PROJECT_OS_(TENANT_ACCESS_DENIED|PRODUCT_NOT_ENTITLED|PERMISSION_DENIED|PROJECT_NOT_FOUND)/.test(error.message);

  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
  }, 60_000);
  afterAll(async () => {
    for (const f of made) {
      await deleteTenantData({ db: (await getDb())!, tenantId: f.tenantId, actorUserId: f.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [f.tenantId]);
      await connection.query("DELETE FROM companies WHERE id = ?", [f.tenantId]);
    }
    await connection.query("DELETE FROM users WHERE openId LIKE 'deleted:%' AND id NOT IN (SELECT actorUserId FROM audit_logs WHERE actorUserId IS NOT NULL)").catch(() => undefined);
    await connection.end();
  }, 120_000);

  it("every write that begins after the freeze is refused, while eight writers hammer the company; nothing survives; the writers had been succeeding until then", async () => {
    const f = await fresh();
    const writes = writesFor(f);
    const log: Array<{ at: number; ok: boolean; error?: unknown }> = [];
    let stop = false;
    const loops = Array.from({ length: 8 }, (_, i) => (async () => {
      while (!stop) {
        const at = performance.now();
        try { await writes[(i + log.length) % writes.length](); log.push({ at, ok: true }); } catch (error) { log.push({ at, ok: false, error }); }
      }
    })());
    await new Promise(resolve => setTimeout(resolve, 700)); // let the writers get going
    let frozenAt = 0;
    const afterFreeze: Array<{ ok: boolean; error?: unknown }> = [];
    const report = await deleteTenantData({
      db: (await getDb())!, tenantId: f.tenantId, actorUserId: f.owner.id, storageDelete: async () => undefined,
      observe: {
        afterFreeze: async () => {
          frozenAt = performance.now();
          // 3 rounds x 7 kinds, all at once, after the commit
          await Promise.all(Array.from({ length: 3 }, () => writes).flat().map(write => write().then(() => afterFreeze.push({ ok: true }), error => afterFreeze.push({ ok: false, error }))));
        },
      },
    });
    stop = true; await Promise.all(loops);

    expect(afterFreeze.length).toBe(21);
    expect(afterFreeze.filter(item => item.ok).length, "a write that began after the freeze was accepted").toBe(0);
    expect(afterFreeze.every(item => refusal(item.error)), `refused for the wrong reason: ${afterFreeze.map(item => (item.error as Error)?.message).filter(Boolean).slice(0, 2).join(" | ")}`).toBe(true);
    expect(log.filter(item => item.ok && item.at < frozenAt).length, "the writers never wrote anything before the freeze, so the test proves nothing").toBeGreaterThan(10);
    expect(log.filter(item => item.at >= frozenAt && item.ok).length, "a loop write that began after the freeze was accepted").toBe(0);
    for (const item of log.filter(entry => !entry.ok)) expect(refusal(item.error), (item.error as Error)?.message).toBe(true);
    expect(report.verification).toBe("PASS");
    expect((await countTenantData((await getDb())!, f.tenantId)).totalRows).toBe(0);
  }, 180_000);

  it("the freeze is one committed step: products off, status suspended, and the freeze on the record, all visible at the first moment the erasure can read", async () => {
    const f = await fresh();
    let seen: Record<string, unknown> = {};
    await deleteTenantData({
      db: (await getDb())!, tenantId: f.tenantId, actorUserId: f.owner.id, storageDelete: async () => undefined,
      observe: {
        afterFreeze: async () => {
          const [[company]] = await connection.query<mysql.RowDataPacket[]>("SELECT status FROM companies WHERE id = ?", [f.tenantId]);
          const [[active]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM tenant_entitlements WHERE tenantId = ? AND active = true", [f.tenantId]);
          const [[recorded]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'tenant.deletion_frozen'", [f.tenantId]);
          const [[rows]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM projects WHERE tenantId = ?", [f.tenantId]);
          seen = { status: company.status, active: Number(active.n), recorded: Number(recorded.n), stillThere: Number(rows.n) };
        },
      },
    });
    expect(seen).toEqual({ status: "suspended", active: 0, recorded: 1, stillThere: 1 }); // frozen first, nothing erased yet
  }, 120_000);

  it("two erasures at once: only one runs; the other is told it is already in progress (and never both)", async () => {
    const f = await fresh();
    const db = (await getDb())!;
    const run = () => deleteTenantData({ db, tenantId: f.tenantId, actorUserId: f.owner.id, storageDelete: async () => undefined });
    const settled = await Promise.allSettled([run(), run()]);
    const fulfilled = settled.filter(item => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof run>>>[];
    const rejected = settled.filter(item => item.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.some(item => item.value.verification === "PASS")).toBe(true);
    for (const item of rejected) expect(String(item.reason?.message)).toContain("PROJECT_OS_DELETION_IN_PROGRESS");
    expect((await countTenantData(db, f.tenantId)).totalRows).toBe(0);
  }, 180_000);

  it("a second erasure that starts while the first is mid-flight is refused as in progress", async () => {
    const f = await fresh();
    const db = (await getDb())!;
    let second: unknown = null;
    const first = await deleteTenantData({
      db, tenantId: f.tenantId, actorUserId: f.owner.id, storageDelete: async () => undefined,
      observe: { afterFreeze: async () => { second = await deleteTenantData({ db, tenantId: f.tenantId, actorUserId: f.owner.id }).then(() => "ran", error => String(error.message)); } },
    });
    expect(second).toBe("PROJECT_OS_DELETION_IN_PROGRESS");
    expect(first.verification).toBe("PASS");
  }, 120_000);

  it("a request that was already in flight when the freeze came is swept up by the next pass (a straggler row is written after the first sweep)", async () => {
    const f = await fresh();
    let straggler = false;
    const report = await deleteTenantData({
      db: (await getDb())!, tenantId: f.tenantId, actorUserId: f.owner.id, storageDelete: async () => undefined,
      observe: {
        afterErase: async pass => {
          if (pass !== 1 || straggler) return; straggler = true;
          await connection.query("INSERT INTO suppliers (id, tenantId, code, legalName, createdByUserId) VALUES (?, ?, 'LATE', 'Late Co.', ?)", [randomUUID(), f.tenantId, f.owner.id]);
        },
      },
    });
    expect(straggler).toBe(true);
    expect(report.passes).toBeGreaterThanOrEqual(2);
    expect(report.verification).toBe("PASS");
    expect((await countTenantData((await getDb())!, f.tenantId)).totalRows).toBe(0);
  }, 120_000);
});
