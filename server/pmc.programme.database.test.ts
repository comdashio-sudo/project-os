import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { liveEvm, loadProfitabilityRows } from "./profitability";
import { appRouter } from "./routers";

// Programme (screen 10) and the PMC -> EVM bridge (work order rule 7) on a real database.
// Synthetic data only. Hand calculations: docs/PMC_PHASE_D_HAND_CHECKS.md.
const T = "70000000-0000-4000-8000-0000000000c1";
const T_OTHER = "70000000-0000-4000-8000-0000000000d1";
const P = "70000000-0000-4000-8000-0000000000c2";
const P_OTHER = "70000000-0000-4000-8000-0000000000d2";
const uid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [Z1, B1, G1, S1, D_WALLS, D_PAINT, W_WALLS, W_PAINT, W_FREE] = [101, 102, 103, 104, 105, 106, 107, 108, 109].map(uid);
const U = [1, 2, 3, 4].map(n => uid(200 + n));
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: mysql.Connection;
const users = { manager: 0, reader: 0, none: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const sheet = async (headers: string[], data: unknown[][]) => (await buildSpreadsheet({ sheetName: "data", headers, rows: data, format: "xlsx" })).toString("base64");
const monthStart = (back: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)).toISOString().slice(0, 10); };

async function clear() {
  const t = [T, T_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM progress_entries WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM project_commercial_invoices WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM budget_lines WHERE tenantId IN (?, ?)", t);
  for (const table of ["pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_verification_statuses", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [P, P_OTHER]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('pmcg-manager','pmcg-reader','pmcg-none')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC programme and EVM bridge on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pmcg-manager','Programme Manager','pmcg-manager@pmc.example.test','user'),('pmcg-reader','Programme Reader','pmcg-reader@pmc.example.test','user'),('pmcg-none','Programme None','pmcg-none@pmc.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pmcg-%'");
    const idOf = (openId: string) => rows.find(r => r.openId === openId)!.id;
    users.manager = idOf("pmcg-manager"); users.reader = idOf("pmcg-reader"); users.none = idOf("pmcg-none");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'PMC Programme Tenant', 'pmc-programme'), (?, 'PMC Programme Other', 'pmc-programme-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, contractValue) VALUES (?, ?, 'PG-A', 'Programme project', 'villas', 'SAR', 'active', 1000000), (?, ?, 'PG-B', 'Other project', 'villas', 'SAR', 'active', 0)", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pmcg-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pmcg-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pmcg-ent-a', ?, 'pmcg-sub-a', 'PROJECT', true, NOW()), ('pmcg-ent-b', ?, 'pmcg-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('pmcg-perm-read','project.pmc.read','project.pmc.read','PROJECT'),('pmcg-perm-update','project.pmc.update','project.pmc.update','PROJECT'),('pmcg-perm-manage','project.pmc.manage','project.pmc.manage','PROJECT')");
    const [perms] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('project.pmc.read','project.pmc.update','project.pmc.manage')");
    const perm = (code: string) => perms.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pmcg-role-manager', ?, 'PMCG_MANAGER','Manager','PROJECT'), ('pmcg-role-reader', ?, 'PMCG_READER','Reader','PROJECT'), ('pmcg-role-none', ?, 'PMCG_NONE','None','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pmcg-role-manager', ?),('pmcg-role-manager', ?),('pmcg-role-manager', ?),('pmcg-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pmcg-m-manager', ?, ?, 'active'),('pmcg-m-reader', ?, ?, 'active'),('pmcg-m-none', ?, ?, 'active')", [T, users.manager, T, users.reader, T, users.none]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pmcg-mr-manager','pmcg-m-manager','pmcg-role-manager','company'),('pmcg-mr-reader','pmcg-m-reader','pmcg-role-reader','company'),('pmcg-mr-none','pmcg-m-none','pmcg-role-none','company')");
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [Z1, T, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [B1, T, P, Z1]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1), (?, ?, ?, ?, 3, 'A', 1), (?, ?, ?, ?, 4, 'A', 1)", [U[0], T, P, B1, U[1], T, P, B1, U[2], T, P, B1, U[3], T, P, B1]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'CIV', 'Civil')", [G1, T, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [S1, T, P, G1]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'WBS-WALLS', 'Walls', 1000), (?, ?, ?, 'WBS-PAINT', 'Paint', 500), (?, ?, ?, 'WBS-FREE', 'Not linked to PMC', 300)", [W_WALLS, T, P, W_PAINT, T, P, W_FREE, T, P]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent, wbsItemId) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60, ?), (?, ?, ?, ?, ?, 'A', 'PAINT', 'Paint', 40, ?)", [D_WALLS, T, P, G1, S1, W_WALLS, D_PAINT, T, P, G1, S1, W_PAINT]);
    // The bridge looks at nothing but the cells, so the one project-wide budget line only keeps the EVM engine's BAC non-zero.
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES (?, ?, ?, ?, 'C-1', 1800, 1800)", [uid(900), T, P, W_WALLS]);
    await connection.query("INSERT INTO project_commercial_invoices (id, tenantId, projectId, invoiceNumber, invoiceDate, clientName, amount, vatAmount, totalAmount, currency, status, createdByUserId) VALUES (?, ?, ?, 'I-1', NOW(), 'Client', 100000, 15000, 115000, 'SAR', 'paid', ?), (?, ?, ?, 'I-2', NOW(), 'Client', 50000, 7500, 57500, 'SAR', 'issued', ?), (?, ?, ?, 'I-3', NOW(), 'Client', 20000, 3000, 23000, 'SAR', 'draft', ?), (?, ?, ?, 'I-4', NOW(), 'Client', 30000, 4500, 34500, 'SAR', 'void', ?)", [uid(901), T, P, users.manager, uid(902), T, P, users.manager, uid(903), T, P, users.manager, uid(904), T, P, users.manager]);
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const set = (unit: number, definition: string, status: "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE") => callerFor(users.manager, "pmcg-manager").pmc.setUnitActivityStatus({ ...scope, unitId: U[unit - 1], activityDefinitionId: definition, status });
  const liveEv = async () => { const db = (await getDb())!; const result = liveEvm(await loadProfitabilityRows(db, scope), new Date(Date.now() + 60_000), "ac_plus_remaining"); if ("error" in result) throw new Error(result.error); return result.ev; };

  it("moves the linked WBS items' progress and the EVM's earned value with every status change, and reports EV before and after", async () => {
    expect(await liveEv()).toBe(0);
    // WALLS is 1 of 4 units complete -> 25% of WBS-WALLS (1000) -> EV 250. WBS-PAINT has nothing yet: no entry is written.
    const first = await set(1, D_WALLS, "COMPLETE");
    expect(first.evm).toEqual({ linkedItems: 2, changed: [{ wbsItemId: W_WALLS, code: "WBS-WALLS", before: null, after: 25 }], evBefore: 0, evAfter: 250 });
    expect(await liveEv()).toBe(250);
    // The second change comes in the same second as the first: EVM keeps the first of equal timestamps, so the bridge stamps its entry later.
    const second = await set(2, D_WALLS, "COMPLETE");
    expect(second.evm).toMatchObject({ evBefore: 250, evAfter: 500, changed: [{ code: "WBS-WALLS", before: 25, after: 50 }] });
    expect(await liveEv()).toBe(500);
    const third = await set(3, D_WALLS, "COMPLETE");
    expect(third.evm).toMatchObject({ evBefore: 500, evAfter: 750 });
    expect(await liveEv()).toBe(750);
    // PAINT: u1 only -> 25% of 500 = 125; EV 750 + 125 = 875.
    const paint = await set(1, D_PAINT, "COMPLETE");
    expect(paint.evm).toEqual({ linkedItems: 2, changed: [{ wbsItemId: W_PAINT, code: "WBS-PAINT", before: null, after: 25 }], evBefore: 750, evAfter: 875 });
    expect(await liveEv()).toBe(875);
    // A status revised downward lowers EV again (WALLS 75% -> 50%: 875 - 250 = 625).
    const back = await set(3, D_WALLS, "IN_PROGRESS");
    expect(back.evm).toMatchObject({ evBefore: 875, evAfter: 625, changed: [{ code: "WBS-WALLS", before: 75, after: 50 }] });
    expect(await liveEv()).toBe(625);
  }, 60_000);

  it("writes nothing when a repeated status changes nothing, and leaves an unlinked WBS item alone", async () => {
    const [[before]] = await connection.query<{ n: number }[][]>("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ?", [P]);
    const repeated = await set(3, D_WALLS, "IN_PROGRESS");
    expect(repeated).toMatchObject({ changed: false, evm: null });
    const [[after]] = await connection.query<{ n: number }[][]>("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ?", [P]);
    expect(Number(after.n)).toBe(Number(before.n));
    const [[free]] = await connection.query<{ n: number }[][]>("SELECT COUNT(*) AS n FROM progress_entries WHERE wbsItemId = ?", [W_FREE]);
    expect(Number(free.n)).toBe(0);
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'pmc.evm_bridge_synced' ORDER BY createdAt DESC, id DESC", [T]);
    expect(audit.length).toBe(5); // one per status change that moved a WBS item, none for the repeat
    expect(audit.map(row => JSON.parse(row.metadata)).some(meta => meta.evBefore === 875 && meta.evAfter === 625)).toBe(true);
  }, 60_000);

  it("follows the status factors and a status import as well (the sibling paths that also move progress)", async () => {
    const manager = callerFor(users.manager, "pmcg-manager");
    // IN_PROGRESS and UNDER_REVIEW now earn 0.5 (a later status may never earn less than an earlier one): WALLS = (1 + 1 + 0.5) / 4 = 62.5% -> EV 625 + 1000 x (0.625 - 0.5) = 750.
    await manager.pmc.setStatusFactors({ ...scope, factors: { IN_PROGRESS: 0.5, UNDER_REVIEW: 0.5 } });
    expect(await liveEv()).toBe(750);
    // Importing u4's WALLS as Complete -> (1 + 1 + 0.5 + 1) / 4 = 87.5% -> EV 875 + 125 = 1000.
    const file = await sheet(["Unit", "Activity", "Status"], [[4, "WALLS", "Complete"]]);
    const analysed = await manager.pmc.analyzeImport({ ...scope, kind: "status", format: "xlsx", base64: file });
    expect(analysed.errorCount).toBe(0);
    await manager.pmc.confirmImport({ ...scope, kind: "status", format: "xlsx", base64: file, approvedHash: analysed.fileHash });
    expect(await liveEv()).toBe(1000);
  }, 60_000);

  it("draws the S-curve from the imported baseline, with the actual equal to the project's progress and the three money cards from the invoices", async () => {
    const manager = callerFor(users.manager, "pmcg-manager");
    // WALLS planned 20 / 50 / 80 and PAINT 0 / 25 / 50 over the last three months.
    const file = await sheet(["Model", "Activity", "Month", "Planned"], [["A", "WALLS", monthStart(2), 20], ["A", "WALLS", monthStart(1), 50], ["A", "WALLS", monthStart(0), 80], ["A", "PAINT", monthStart(2), 0], ["A", "PAINT", monthStart(1), 25], ["A", "PAINT", monthStart(0), 50]]);
    const analysed = await manager.pmc.analyzeImport({ ...scope, kind: "baseline", format: "xlsx", base64: file });
    expect(analysed.errorCount).toBe(0);
    await manager.pmc.confirmImport({ ...scope, kind: "baseline", format: "xlsx", base64: file, approvedHash: analysed.fileHash });
    const result = await manager.pmc.programme(scope);
    // Planned = 0.6 x WALLS + 0.4 x PAINT: 12, 30 + 10 = 40, 48 + 20 = 68.
    expect(result.months.map(m => [m.month, m.planned])).toEqual([[monthStart(2), 12], [monthStart(1), 40], [monthStart(0), 68]]);
    expect(result.months.map(m => m.plannedInMonth)).toEqual([12, 28, 28]);
    // Actual: everything happened this month. WALLS (1 + 1 + 0.5 + 1) / 4 x 60 = 52.5, PAINT 1 / 4 x 40 = 10 -> 62.5.
    expect(result.months.map(m => m.actual)).toEqual([0, 0, 62.5]);
    expect(result.months.map(m => m.variance)).toEqual([-12, -40, -5.5]);
    expect(result).toMatchObject({ hasBaseline: true, plannedToDate: 68, actualToDate: 62.5, progressFromCells: 62.5, cellsWithoutHistory: 0 });
    // Cards: contract 1,000,000; paid 100,000 (the draft and void invoices are not counted); confirmed 150,000; target 68%.
    expect(result.cards).toEqual({ currency: "SAR", contractValue: 1000000, paid: { amount: 100000, percent: 10 }, confirmed: { amount: 150000, percent: 15 }, target: { amount: 680000, percent: 68 } });
  }, 60_000);

  it("draws the same curve from a baseline given as start and end dates (G-042), and refuses a file whose end precedes its start", async () => {
    const manager = callerFor(users.manager, "pmcg-manager");
    // PAINT now runs from the first day of two months ago to the last day of this month; WALLS keeps its monthly points (20 / 50 / 80).
    const now = new Date();
    const first = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1);
    const last = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const DAY = 86_400_000;
    const total = (last - first) / DAY + 1;
    const byEndOf = (back: number) => Math.round((((Math.min(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0), last) - first) / DAY + 1) / total) * 1_000_000) / 10_000;
    const file = await sheet(["Model", "Activity", "Start", "End"], [["A", "PAINT", iso(first), iso(last)]]);
    const analysed = await manager.pmc.analyzeImport({ ...scope, kind: "baselineDates", format: "xlsx", base64: file });
    expect(analysed.errorCount).toBe(0);
    expect(analysed.counts).toEqual({ create: 0, update: 3, unchanged: 0 }); // the three months already held monthly points
    await manager.pmc.confirmImport({ ...scope, kind: "baselineDates", format: "xlsx", base64: file, approvedHash: analysed.fileHash });
    const result = await manager.pmc.programme(scope);
    const r4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
    const expected = [2, 1, 0].map(back => r4(0.6 * [20, 50, 80][2 - back] + 0.4 * byEndOf(back)));
    expect(result.months.map(m => m.planned)).toEqual(expected);
    expect(expected[2]).toBe(r4(48 + 40)); // by the end of this month PAINT is complete: 0.6 x 80 + 0.4 x 100
    // the same file with the end before the start is refused whole, and nothing is saved
    const bad = await sheet(["Model", "Activity", "Start", "End"], [["A", "PAINT", iso(last), iso(first)]]);
    const refused = await manager.pmc.analyzeImport({ ...scope, kind: "baselineDates", format: "xlsx", base64: bad });
    expect(refused.errors.map(error => error.code)).toEqual(["PMC_BASELINE_END_BEFORE_START"]);
    await expect(manager.pmc.confirmImport({ ...scope, kind: "baselineDates", format: "xlsx", base64: bad, approvedHash: refused.fileHash })).rejects.toThrow("PROJECT_OS_IMPORT_VALIDATION_FAILED");
    expect((await manager.pmc.programme(scope)).months.map(m => m.planned)).toEqual(expected);
  }, 60_000);

  it("lets a reader see the programme but not change a status, closes it to a role without the permission and to another tenant's project, and writes no EVM entry for a refused change", async () => {
    const [[before]] = await connection.query<{ n: number }[][]>("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ?", [P]);
    const reader = callerFor(users.reader, "pmcg-reader");
    await expect(reader.pmc.programme(scope)).resolves.toMatchObject({ hasBaseline: true });
    await expect(reader.pmc.setUnitActivityStatus({ ...scope, unitId: U[3], activityDefinitionId: D_PAINT, status: "COMPLETE" })).rejects.toThrow();
    await expect(callerFor(users.none, "pmcg-none").pmc.programme(scope)).rejects.toThrow();
    await expect(callerFor(users.manager, "pmcg-manager").pmc.programme({ tenantId: T_OTHER, projectId: P_OTHER })).rejects.toThrow();
    await expect(callerFor(users.manager, "pmcg-manager").pmc.programme({ tenantId: T, projectId: P_OTHER })).rejects.toThrow();
    const [[after]] = await connection.query<{ n: number }[][]>("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ?", [P]);
    expect(Number(after.n)).toBe(Number(before.n));
  }, 60_000);
});
