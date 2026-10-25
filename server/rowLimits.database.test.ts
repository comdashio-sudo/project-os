import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { getPmcScreen } from "./pmcScreensService";
import { grantOperationalPermissions } from "./testing/grantOperational";

// Work order 18, section 0 item 5 (docs/TASLEEM_LESSONS.md section 3, point 6): a number computed over a list must be computed over ALL of it. The other platform's API cut every
// answer at 1,000 rows without a word, so a project of 1,200 units showed as 1,000 and the progress was divided by 1,200: a wrong figure and no error. This application reads its
// database directly (no row cap in the middle), but a LIMIT written into one of its own queries would do the same. This file builds a project of 1,200 units and 1,200 posted cost
// lines (more than every LIMIT in the server: 100, 200, 300, 500, 2,000) and checks that progress, earned value, actual cost, forecast and profit are the ones a hand calculation gives.
// Synthetic data only; the rows are inserted by the owner in bulk with generate_series and removed afterwards.
const T = "70000000-0000-4000-8000-0000000000a1";
const P = "70000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [Z1, B1, G1, S1, D_WALLS, D_PAINT, WBS1] = [1, 2, 3, 4, 5, 6, 7].map(n => uid(100 + n));
const UNITS = 1200;
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: fixtureDb.Connection;
let userId = 0;
const caller = () => appRouter.createCaller({ user: { id: userId, openId: "rowlim-manager", name: "Row Limits", email: "rowlim@limits.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

async function clear() {
  for (const table of ["pmc_unit_activity_progress", "pmc_units", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_blocks", "pmc_zones", "progress_entries", "cost_entries", "budget_lines", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE id = ?", [P]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId = 'rowlim-manager'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("a project of 1,200 units and 1,200 cost lines: every figure is computed over all of it", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('rowlim-manager','Row Limits','rowlim@limits.example.test','user')");
    userId = (await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'rowlim-manager'"))[0][0].id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Row Limits Tenant', 'row-limits')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, contractValue, status) VALUES (?, ?, 'RL-1', 'Row limits project', 'villas', 'SAR', 30000, 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('rowlim-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('rowlim-ent', ?, 'rowlim-sub', 'PROJECT', true, NOW())", [T]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('rowlim-role', ?, 'ROWLIM','Row limits','PROJECT')", [T]);
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('rowlim-perm-read','project.read','project.read','PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT IGNORE INTO role_permissions (roleId, permissionId) SELECT 'rowlim-role', id FROM permissions WHERE code = 'project.read'");
    await grantOperationalPermissions(connection, "rowlim-role", ["project.pmc.read", "project.cashflow.read", "project.wbs.manage", "project.budget.manage", "project.cost.enter", "project.progress.manage", "project.evm.manage"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('rowlim-m', ?, ?, 'active')", [T, userId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('rowlim-mr','rowlim-m','rowlim-role','company')");

    // 1,200 units, two activities (WALLS 60 %, PAINT 40 %). Units 1-900 have WALLS complete, units 1-300 have PAINT complete: progress = (900 x 60 + 300 x 40) / 1,200 = 55 %.
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [Z1, T, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [B1, T, P, Z1]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'CIV', 'Civil')", [G1, T, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [S1, T, P, G1]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60), (?, ?, ?, ?, ?, 'A', 'PAINT', 'Paint', 40)", [D_WALLS, T, P, G1, S1, D_PAINT, T, P, G1, S1]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) SELECT 'rowlim-u-' || n, ?, ?, ?, n, 'A', 1 FROM generate_series(1, ?) AS n", [T, P, B1, UNITS]);
    await connection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status) SELECT 'rowlim-cw-' || n, ?, ?, 'rowlim-u-' || n, ?, CASE WHEN n <= 900 THEN 'COMPLETE' ELSE 'NOT_STARTED' END::pmc_unit_activity_progress_status FROM generate_series(1, ?) AS n", [T, P, D_WALLS, UNITS]);
    await connection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status) SELECT 'rowlim-cp-' || n, ?, ?, 'rowlim-u-' || n, ?, CASE WHEN n <= 300 THEN 'COMPLETE' ELSE 'NOT_STARTED' END::pmc_unit_activity_progress_status FROM generate_series(1, ?) AS n", [T, P, D_PAINT, UNITS]);

    // Money: one WBS item with a 20,000 budget at 50 % progress; 1,200 posted actual cost lines of 10 (700 materials, 500 labour) = 12,000.
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, '1', 'Everything', 20000)", [WBS1, T, P]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES ('rowlim-b1', ?, ?, ?, 'B1', 20000, 20000)", [T, P, WBS1]);
    await connection.query("INSERT INTO progress_entries (id, tenantId, projectId, wbsItemId, progressPercent, status, measuredAt) VALUES ('rowlim-p1', ?, ?, ?, 50, 'submitted', '2026-09-03 00:00:00')", [T, P, WBS1]);
    await connection.query("INSERT INTO cost_entries (id, tenantId, projectId, wbsItemId, amount, entryType, status, incurredAt, category) SELECT 'rowlim-c-' || n, ?, ?, ?, 10, 'actual', 'posted', '2026-09-01 00:00:00'::timestamptz + (n || ' minutes')::interval, CASE WHEN n <= 700 THEN 'materials' ELSE 'labour' END::cost_entries_category FROM generate_series(1, 1200) AS n", [T, P, WBS1]);
  }, 120_000);

  afterAll(async () => { await clear(); await connection.end(); });

  it("the seed is what the test says it is: 1,200 units, 2,400 cells and 1,200 cost lines, all in the database", async () => {
    const count = async (sql: string) => Number((await connection.query<{ n: number }[]>(sql, [T]))[0][0].n);
    expect(await count("SELECT count(*) AS n FROM pmc_units WHERE tenantId = ?")).toBe(1200);
    expect(await count("SELECT count(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?")).toBe(2400);
    expect(await count("SELECT count(*) AS n FROM cost_entries WHERE tenantId = ?")).toBe(1200);
  });

  it("PMC progress counts all 1,200 units: 55 %, not the 1,000-unit figure (50.00 %) and not a division by the wrong total", async () => {
    const progress = await caller().pmc.progress({ tenantId: T, projectId: P });
    expect(progress.units).toHaveLength(UNITS);
    expect(progress.projectProgressPercent).toBe(55);
    expect(progress.activities.find(activity => activity.code === "WALLS")).toMatchObject({ completedUnits: 900, includedUnits: UNITS });
    expect(progress.activities.find(activity => activity.code === "PAINT")).toMatchObject({ completedUnits: 300, includedUnits: UNITS });
  });

  it("the PMC screens read every cell: the zone screen counts 2,400 cells, 1,200 of them complete", async () => {
    const { data } = await getPmcScreen({ userId, tenantId: T, projectId: P, screen: "zones", now: new Date("2026-10-15T12:00:00.000Z") });
    expect(data.rows.reduce((sum, row) => sum + row.cells, 0)).toBe(2400);
    expect(data.rows.reduce((sum, row) => sum + row.completeCells, 0)).toBe(1200);
  });

  it("profit and forecast use every cost line: AC 12,000, EV 10,000, EAC 22,000, FPAC 8,000 (a cut at 500 lines would give AC 5,000 and FPAC 15,000)", async () => {
    const report = await caller().profitability.project({ tenantId: T, projectId: P, eacMethod: "ac_plus_remaining" });
    expect(report.headline).toMatchObject({ status: "ok", data: { eac: 22000, fpac: 8000 } });
  });

  it("the cost breakdown sums every posted line by category and shows the newest 100: 7,000 + 5,000 over 1,200 lines (it used to add up only the newest 500)", async () => {
    const breakdown = await caller().profitability.costBreakdown({ tenantId: T, projectId: P });
    expect([...breakdown.byCategory].sort((a, b) => a.category.localeCompare(b.category))).toEqual([{ category: "labour", amount: 5000 }, { category: "materials", amount: 7000 }]);
    expect(breakdown.totalLines).toBe(1200);
    expect(breakdown.truncated).toBe(true);
    expect(breakdown.lines).toHaveLength(100);
    expect(breakdown.byCategory.reduce((sum, row) => sum + row.amount, 0)).toBe(12000);
  });
});
