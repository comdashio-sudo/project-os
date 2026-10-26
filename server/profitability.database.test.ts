import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { captureScheduledProfitabilitySnapshots } from "./db";
import { grantOperationalPermissions } from "./testing/grantOperational";

// Synthetic fixtures only. Run through scripts/run-integration-database-test.mjs
// (a non-superuser app account is not required here: the tests exercise the
// application's own authorization, not the database grants).
const T = "20000000-0000-4000-8000-0000000000a1";
const T_FOREIGN = "20000000-0000-4000-8000-0000000000b1";
const P = "20000000-0000-4000-8000-0000000000a2";
const P2 = "20000000-0000-4000-8000-0000000000a3";
const P_FOREIGN = "20000000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: fixtureDb.Connection;
const ids = { manager: 0, low: 0, scoped: 0 };
const callerFor = (id: number, openId: string) => appRouter.createCaller({ user: { id, openId, name: openId, email: `${openId}@profit.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

async function clear() {
  const projectIds = [P, P2, P_FOREIGN];
  const tenantIds = [T, T_FOREIGN];
  await connection.query("DELETE FROM evm_wbs_snapshots WHERE tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM evm_snapshots WHERE tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", tenantIds);
  for (const table of ["progress_entries", "cost_entries", "budget_lines", "change_requests", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE projectId IN (?, ?, ?)`, projectIds);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?, ?)", projectIds);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", tenantIds);
  await connection.query("DELETE FROM users WHERE openId IN ('profit-manager','profit-low','profit-scoped')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Project profitability (FPAC) on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('profit-manager','Profit Manager','profit-manager@profit.example.test','user'),('profit-low','Profit Low','profit-low@profit.example.test','user'),('profit-scoped','Profit Scoped','profit-scoped@profit.example.test','user')");
    const [users] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'profit-%'");
    ids.manager = users.find(u => u.openId === "profit-manager")!.id;
    ids.low = users.find(u => u.openId === "profit-low")!.id;
    ids.scoped = users.find(u => u.openId === "profit-scoped")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Profit Tenant', 'profit-tenant'), (?, 'Profit Foreign Tenant', 'profit-foreign')", [T, T_FOREIGN]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, contractValue, status) VALUES (?, ?, 'PR-A', 'Profit project A', 'villas', 'SAR', 1200, 'active'), (?, ?, 'PR-A2', 'Profit project A2', 'villas', 'SAR', 500, 'active'), (?, ?, 'PR-F', 'Foreign project', 'villas', 'SAR', 900, 'active')", [P, T, P2, T, P_FOREIGN, T_FOREIGN]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('profit-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('profit-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_FOREIGN]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('profit-ent-a-exec', ?, 'profit-sub-a', 'EXECUTIVE', true, NOW()), ('profit-ent-a-project', ?, 'profit-sub-a', 'PROJECT', true, NOW()), ('profit-ent-b-project', ?, 'profit-sub-b', 'PROJECT', true, NOW())", [T, T, T_FOREIGN]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('profit-perm-exec-read','executive.read','Profit executive read','EXECUTIVE'),('profit-perm-project-read','project.read','Profit project read','PROJECT'),('profit-perm-project-write','project.write','Profit project write','PROJECT')");
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('executive.read','project.read','project.write')");
    const pid = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('profit-role-manager', ?, 'PROFIT_MANAGER','Profit manager','PROJECT'), ('profit-role-scoped', ?, 'PROFIT_SCOPED','Profit scoped','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('profit-role-manager', ?),('profit-role-manager', ?),('profit-role-manager', ?),('profit-role-scoped', ?),('profit-role-scoped', ?)", [pid("executive.read"), pid("project.read"), pid("project.write"), pid("executive.read"), pid("project.read")]);
    await grantOperationalPermissions(connection, "profit-role-manager");
    await grantOperationalPermissions(connection, "profit-role-scoped", ["project.cashflow.read"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('profit-m-manager', ?, ?, 'active'),('profit-m-low', ?, ?, 'active'),('profit-m-scoped', ?, ?, 'active')", [T, ids.manager, T, ids.low, T, ids.scoped]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES ('profit-mr-manager','profit-m-manager','profit-role-manager','company',NULL),('profit-mr-scoped','profit-m-scoped','profit-role-scoped','project',?)", [P]);
  }, 60_000);

  afterAll(async () => {
    // The scheduled run snapshots every active project in the database, not just ours.
    const [scheduled] = await connection.query<{ id: string }[]>("SELECT id FROM evm_snapshots WHERE periodAt = '2026-11-01 00:00:00'");
    if (scheduled.length) {
      const snapshotIds = scheduled.map(row => row.id);
      await connection.query("DELETE FROM audit_logs WHERE entityId IN (?)", [snapshotIds]);
      await connection.query("DELETE FROM evm_wbs_snapshots WHERE snapshotId IN (?)", [snapshotIds]);
      await connection.query("DELETE FROM evm_snapshots WHERE id IN (?)", [snapshotIds]);
    }
    await clear();
    await connection.end();
  });

  it("derives FPAC from posted cost, progress and approved change orders only", async () => {
    const manager = callerFor(ids.manager, "profit-manager");
    const wbs1 = await manager.wbs.create({ tenantId: T, projectId: P, code: "1", name: "Foundations", plannedValue: 600 });
    const wbs2 = await manager.wbs.create({ tenantId: T, projectId: P, code: "2", name: "Structure", plannedValue: 400 });
    await manager.budgets.create({ tenantId: T, projectId: P, wbsItemId: wbs1.id, costCode: "B1", originalAmount: 600, currentAmount: 600 });
    await manager.budgets.create({ tenantId: T, projectId: P, wbsItemId: wbs2.id, costCode: "B2", originalAmount: 400, currentAmount: 400 });
    await manager.costs.createActual({ tenantId: T, projectId: P, wbsItemId: wbs1.id, amount: 300, incurredAt: new Date("2026-09-01T00:00:00.000Z"), category: "materials" });
    await manager.costs.createActual({ tenantId: T, projectId: P, wbsItemId: wbs2.id, amount: 100, incurredAt: new Date("2026-09-02T00:00:00.000Z"), category: "labour" });
    await manager.progress.create({ tenantId: T, projectId: P, wbsItemId: wbs1.id, percentComplete: 50, reportedAt: new Date("2026-09-03T00:00:00.000Z") });
    await manager.progress.create({ tenantId: T, projectId: P, wbsItemId: wbs2.id, percentComplete: 25, reportedAt: new Date("2026-09-03T00:00:00.000Z") });
    // +100 approved counts; +50 still in review must not.
    const approved = await manager.changes.create({ tenantId: T, projectId: P, changeNumber: "CO-1", title: "Approved variation", description: "An approved variation order.", impactScheduleDays: 0, impactCost: 0, contractValueImpact: 100, currency: "SAR" });
    for (const nextStatus of ["submitted", "under_review", "approved"] as const) await manager.changes.transitionStatus({ tenantId: T, projectId: P, changeRequestId: approved.id, nextStatus });
    const pending = await manager.changes.create({ tenantId: T, projectId: P, changeNumber: "CO-2", title: "Pending variation", description: "A variation still in review.", impactScheduleDays: 0, impactCost: 0, contractValueImpact: 50, currency: "SAR" });
    for (const nextStatus of ["submitted", "under_review"] as const) await manager.changes.transitionStatus({ tenantId: T, projectId: P, changeRequestId: pending.id, nextStatus });

    const report = await manager.profitability.project({ tenantId: T, projectId: P, eacMethod: "ac_plus_remaining" });
    // AC = 300 + 100; EV = 600*50% + 400*25% = 400; ETC = BAC - EV = 600; EAC = AC + ETC = 1000.
    // Adjusted contract = 1200 + 100 (approved only) = 1300; FPAC = 1300 - 1000 = 300.
    expect(report.headline).toMatchObject({ status: "ok", data: { eac: 1000, fpac: 300, contract: { originalContractValue: 1200, approvedChanges: 100, adjustedContractValue: 1300 } } });
    expect(report.movement).toEqual({ status: "unavailable", reason: "NO_PREVIOUS_SNAPSHOT" });
    expect(report.drill.status).toBe("ok");

    const breakdown = await manager.profitability.costBreakdown({ tenantId: T, projectId: P });
    expect(breakdown.byCategory).toEqual(expect.arrayContaining([{ category: "materials", amount: 300 }, { category: "labour", amount: 100 }]));
  }, 60_000);

  it("explains movement since the last snapshot in three causes that add up", async () => {
    const manager = callerFor(ids.manager, "profit-manager");
    const first = await manager.controls.captureOperationalEvmSnapshot({ tenantId: T, projectId: P, periodAt: new Date("2026-09-30T00:00:00.000Z"), eacMethod: "ac_plus_remaining" });
    const [stored] = await connection.query<{ fpac: string; adjustedContractValue: string }[]>("SELECT fpac, adjustedContractValue FROM evm_snapshots WHERE id = ?", [first.id]);
    expect(Number(stored[0].fpac)).toBe(300);
    expect(Number(stored[0].adjustedContractValue)).toBe(1300);
    const [wbsRows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM evm_wbs_snapshots WHERE snapshotId = ?", [first.id]);
    expect(Number(wbsRows[0].n)).toBe(2);
    await expect(manager.profitability.history({ tenantId: T, projectId: P })).resolves.toEqual([expect.objectContaining({ fpac: 300, adjustedContractValue: 1300 })]);

    // Later: 100 more cost on the same progress, and a second approved variation of +50.
    const [[wbs1]] = await connection.query<{ id: string }[]>("SELECT id FROM wbs_items WHERE projectId = ? AND code = '1'", [P]);
    await manager.costs.createActual({ tenantId: T, projectId: P, wbsItemId: wbs1.id, amount: 100, incurredAt: new Date("2026-10-05T00:00:00.000Z"), category: "materials" });
    const second = await manager.changes.create({ tenantId: T, projectId: P, changeNumber: "CO-3", title: "Second approved", description: "A second approved variation.", impactScheduleDays: 0, impactCost: 0, contractValueImpact: 50, currency: "SAR" });
    for (const nextStatus of ["submitted", "under_review", "approved"] as const) await manager.changes.transitionStatus({ tenantId: T, projectId: P, changeRequestId: second.id, nextStatus });

    const report = await manager.profitability.project({ tenantId: T, projectId: P, eacMethod: "ac_plus_remaining" });
    // AC 500, ETC 600 (progress unchanged), EAC 1100; contract 1350; FPAC 250; was 300.
    expect(report.headline).toMatchObject({ status: "ok", data: { eac: 1100, fpac: 250 } });
    expect(report.movement.status).toBe("ok");
    if (report.movement.status !== "ok") return;
    expect(report.movement.data).toMatchObject({ fpacLast: 300, fpacNow: 250, delta: -50, causes: { contractValue: 50, actualCost: -100, forecastToComplete: 0 }, dominantCause: "actualCost" });
    const { contractValue, actualCost, forecastToComplete } = report.movement.data.causes;
    expect(Math.round((contractValue + actualCost + forecastToComplete) * 100) / 100).toBe(report.movement.data.delta);
  }, 60_000);

  it("refuses another tenant's project, a project outside the caller's scope, and callers without the permission", async () => {
    const manager = callerFor(ids.manager, "profit-manager");
    const low = callerFor(ids.low, "profit-low");
    const scoped = callerFor(ids.scoped, "profit-scoped");
    await expect(manager.profitability.project({ tenantId: T, projectId: P_FOREIGN })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(manager.profitability.costBreakdown({ tenantId: T, projectId: P_FOREIGN })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(low.profitability.project({ tenantId: T, projectId: P })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    await expect(low.profitability.portfolio({ tenantId: T })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    await expect(scoped.profitability.project({ tenantId: T, projectId: P2 })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    await expect(scoped.profitability.project({ tenantId: T, projectId: P })).resolves.toMatchObject({ project: { id: P } });
  }, 60_000);

  it("blocks the screen when the tenant has no PROJECT entitlement, and allows it again once restored", async () => {
    const manager = callerFor(ids.manager, "profit-manager");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE id = 'profit-ent-a-project'");
    try {
      await expect(manager.profitability.project({ tenantId: T, projectId: P })).rejects.toThrow("PROJECT_OS_PRODUCT_NOT_ENTITLED");
      await expect(manager.profitability.history({ tenantId: T, projectId: P })).rejects.toThrow("PROJECT_OS_PRODUCT_NOT_ENTITLED");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE id = 'profit-ent-a-project'");
    }
    await expect(manager.profitability.project({ tenantId: T, projectId: P })).resolves.toMatchObject({ project: { id: P } });
  }, 60_000);

  it("lists the portfolio with losing projects first and only the projects the caller may see", async () => {
    const manager = callerFor(ids.manager, "profit-manager");
    const scoped = callerFor(ids.scoped, "profit-scoped");
    // Project A2: contract 500 and a posted cost of 800 with no budget => a loss.
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('20000000-0000-4000-8000-0000000000c1', ?, ?, '1', 'Loss making work', 400)", [T, P2]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES ('20000000-0000-4000-8000-0000000000c2', ?, ?, '20000000-0000-4000-8000-0000000000c1', 'B', 400, 400)", [T, P2]);
    await manager.costs.createActual({ tenantId: T, projectId: P2, wbsItemId: "20000000-0000-4000-8000-0000000000c1", amount: 800, incurredAt: new Date("2026-09-10T00:00:00.000Z") });
    const all = await manager.profitability.portfolio({ tenantId: T });
    expect(all.projects.map(p => p.code)).toEqual(["PR-A2", "PR-A"]);
    expect(all.projects[0].fpac).toBeLessThan(0);
    expect(all.total).toMatchObject({ currency: "SAR" });
    expect(all.projects.some(p => p.projectId === P_FOREIGN)).toBe(false);
    const own = await scoped.profitability.portfolio({ tenantId: T });
    expect(own.projects.map(p => p.code)).toEqual(["PR-A"]);
  }, 60_000);

  it("captures one scheduled snapshot per active project per month and skips the repeat", async () => {
    const now = new Date("2026-11-15T10:00:00.000Z");
    const first = await captureScheduledProfitabilitySnapshots(now);
    expect(first.failed).toBe(0);
    expect(first.captured).toBeGreaterThanOrEqual(3);
    const second = await captureScheduledProfitabilitySnapshots(now);
    expect(second).toMatchObject({ captured: 0, failed: 0 });
    expect(second.skipped).toBe(first.captured + first.skipped);
    const [rows] = await connection.query<{ n: number; nullActor: number }[]>("SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE a.actorUserId IS NULL) AS nullActor FROM evm_snapshots s INNER JOIN audit_logs a ON a.entityId = s.id WHERE s.tenantId = ? AND s.periodAt = '2026-11-01 00:00:00' AND a.action = 'evm.operational_snapshot_created'", [T]);
    expect(Number(rows[0].n)).toBe(2);
    expect(Number(rows[0].nullActor)).toBe(2);
  }, 60_000);
});
