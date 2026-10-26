import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { buildMatrixWorkbook, MATRIX_ACTIVITIES, MATRIX_SHEET, MATRIX_UNITS } from "./domain/smartImport/matrixFixture";

// Work order 20, the unit-completion matrix: a SYNTHETIC workbook with the structure of a real monthly report (matrixFixture.ts; nothing real in it) goes through the smart import box,
// is recognised by its structure, and builds zone → block → unit, the models, the three-level activity catalogue with weights, and the status of every unit in every activity,
// in project control. The platform's own percentages are then compared with the sheet's own.
const T = "79000000-0000-4000-8000-0000000000e1";
const P = "79000000-0000-4000-8000-0000000000e2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { manager: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@matrix.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const one = async <R,>(sql: string, params: unknown[] = []) => (await connection.query<any[]>(sql, params))[0] as R[];
const n = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(sql, params))[0].n);

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM import_source_profiles WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [T]);
  await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE id = ?", [P]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'smx-%'");
}

type Caller = ReturnType<typeof callerFor>;
async function upload(caller: Caller, fileName: string, bytes: Uint8Array) {
  const target = await caller.smartImport.createUpload({ ...scope, fileName });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return target;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("unit-completion matrix through the smart import box, on a real database", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('smx-manager','Manager','smx-manager@matrix.example.test','user'),('smx-reader','Reader','smx-reader@matrix.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'smx-%'");
    users.manager = rows.find(r => r.openId === "smx-manager")!.id; users.reader = rows.find(r => r.openId === "smx-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Matrix Tenant', 'matrix-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'MX-A', 'Matrix project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('smx-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('smx-ent', ?, 'smx-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.wbs.manage", "project.pmc.read", "project.pmc.update", "project.pmc.manage"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('smx-r-manager', ?, 'SMX_MANAGER','Manager','PROJECT'), ('smx-r-reader', ?, 'SMX_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'smx-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read','project.pmc.update','project.pmc.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'smx-r-reader', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('smx-m-manager', ?, ?, 'active'), ('smx-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('smx-mr-manager','smx-m-manager','smx-r-manager','company'),('smx-mr-reader','smx-m-reader','smx-r-reader','company')");
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("recognises the shape, builds 491 units and 136 activities, writes nothing until approved, and the platform reproduces 100% of the sheet's percentages", async () => {
    const manager = callerFor(users.manager, "smx-manager");
    const month1 = await buildMatrixWorkbook({ completeBefore: 100, reportDate: new Date(Date.UTC(2026, 7, 31)) });
    const file = { name: "monthly-report-aug.xlsx", bytes: month1.bytes };
    const target = await upload(manager, file.name, file.bytes);

    const analysis = await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: file.name });
    expect(analysis.understanding.kind).toBe("unitMatrix");
    expect(analysis.understanding.sheet).toBe(MATRIX_SHEET); // the main sheet of six is chosen
    expect(analysis.understanding.sheetNames.length).toBe(6);
    const plan = analysis.matrixPlan!;
    expect(plan.errors).toEqual([]);
    expect(plan.canConfirm).toBe(true);
    expect(plan.summary).toMatchObject({ units: MATRIX_UNITS, activities: MATRIX_ACTIVITIES, zones: ["Z1", "Z2", "Z3"], blocks: 12, groups: 4, divisions: 8, reportDate: "2026-08-31", oracleCodes: MATRIX_UNITS });
    expect(plan.summary.models.length).toBe(6);
    expect(plan.summary.weightsTotalPercent).toBeCloseTo(100, 6);
    expect(plan.summary.ignored).toMatchObject({ totalsRow: 498, pivotRow: 504 });
    expect(plan.changes).toMatchObject({ newZones: 3, newBlocks: 12, newUnits: 491, newDefinitions: 6 * 136, completing: month1.truth.completeCells, erpCodesToSet: 491, regressed: 0 });
    expect(plan.match.units).toMatchObject({ compared: 491, matched: 491 });
    expect(plan.match.unitMatchShare).toBe(1);
    // the plan was counted by the database in a transaction that was rolled back: nothing is written
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [T])).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [T])).toBe(0);

    const confirmed = await manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: file.name, kind: "unitMatrix", forced: {} as never, approvedHash: plan.fileHash, profileName: "التقرير الشهري التجريبي" });
    expect(confirmed).toMatchObject({ status: "completed", module: "pmcMatrix", rowsSent: 491 });
    expect(confirmed.matrixChanges).toMatchObject({ newUnits: 491, completing: month1.truth.completeCells });

    expect(await n("SELECT COUNT(*) AS n FROM pmc_zones WHERE tenantId = ?", [T])).toBe(3);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_blocks WHERE tenantId = ?", [T])).toBe(12);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(491);
    expect(await n("SELECT COUNT(DISTINCT modelCode) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(6);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_activity_groups WHERE tenantId = ?", [T])).toBe(4);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_activity_stages WHERE tenantId = ?", [T])).toBe(8);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_activity_definitions WHERE tenantId = ?", [T])).toBe(6 * 136);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_activity_definitions WHERE tenantId = ? AND modelCode = 'MDL-A'", [T])).toBe(136);
    const weights = await one<{ modelCode: string; total: string }>("SELECT modelCode, SUM(weightPercent) AS total FROM pmc_activity_definitions WHERE tenantId = ? GROUP BY modelCode", [T]);
    for (const row of weights) expect(Number(row.total), row.modelCode).toBeCloseTo(100, 4);
    // the ERP code is the unit's foreign key
    const oracle = await one<{ unitNumber: number; externalCode: string }>("SELECT unitNumber, externalCode FROM pmc_units WHERE tenantId = ? ORDER BY unitNumber", [T]);
    expect(oracle.map(row => row.externalCode)).toEqual(month1.truth.oracleCodes);
    // every complete cell, with its history (null -> COMPLETE), dated at the report
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND status = 'COMPLETE'", [T])).toBe(month1.truth.completeCells);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_history WHERE tenantId = ? AND toStatus = 'COMPLETE' AND fromStatus IS NULL", [T])).toBe(month1.truth.completeCells);

    // the platform's own percentage of EVERY unit equals the sheet's
    const progress = await manager.pmc.progress(scope);
    const byNumber = new Map(progress.units.map(unit => [unit.unitNumber, unit.progressPercent]));
    let matched = 0;
    month1.truth.unitPercent.forEach((fraction, u) => { if (Math.abs((byNumber.get(u + 1) ?? NaN) - fraction * 100) <= 0.005) matched += 1; });
    console.log(`MATRIX ON THE PLATFORM: ${matched}/${MATRIX_UNITS} units' progress equals the sheet's own (pmc.progress); project progress ${progress.projectProgressPercent}`);
    expect(matched).toBe(MATRIX_UNITS);
    expect(progress.unitsWithoutNumber).toBe(0);

    // the original is kept and reachable from a unit; the import is recorded, audited
    const [firstUnit] = await one<{ id: string }>("SELECT id FROM pmc_units WHERE tenantId = ? AND unitNumber = 1", [T]);
    const link = await manager.smartImport.source({ ...scope, entityId: firstUnit.id });
    expect(link).toMatchObject({ found: true, fileName: file.name, kind: "unitMatrix" });
    if (!link.found) throw new Error("unreachable");
    expect(Buffer.from(await (await fetch(link.url)).arrayBuffer()).equals(Buffer.from(file.bytes))).toBe(true);
    expect(await n("SELECT COUNT(*) AS n FROM data_import_row_results WHERE importId = ?", [confirmed.importId])).toBe(491);
    const audit = await one<{ action: string }>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ?", [T, confirmed.importId]);
    expect(audit.map(row => row.action)).toContain("pmc.matrix_import_confirmed");
  }, 300_000);

  it("the NEXT month is a status update with a preview of the difference: «N activities completed in M villas», recognised by its saved profile", async () => {
    const manager = callerFor(users.manager, "smx-manager");
    const month1 = await buildMatrixWorkbook({ completeBefore: 100, reportDate: new Date(Date.UTC(2026, 7, 31)) });
    const month2 = await buildMatrixWorkbook({ reportDate: new Date(Date.UTC(2026, 8, 30)) });
    const before = month1.truth.completeCells; const after = month2.truth.completeCells;
    const target = await upload(manager, "monthly-report-sep.xlsx", month2.bytes);
    const analysis = await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "monthly-report-sep.xlsx" });
    expect(analysis.profile).toMatchObject({ name: "التقرير الشهري التجريبي", timesUsed: 1 });
    const plan = analysis.matrixPlan!;
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toMatchObject({ newZones: 0, newBlocks: 0, newUnits: 0, newDefinitions: 0, completing: after - before, regressed: 0, erpCodesToSet: 0 });
    expect(plan.changes.unitsTouched).toBeGreaterThan(0);
    expect(plan.changes.unchangedCells).toBe(before);
    console.log(`NEXT MONTH PREVIEW: this month ${plan.changes.completing} activities completed in ${plan.changes.unitsTouched} villas; ${plan.changes.unchangedCells} cells unchanged`);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND status = 'COMPLETE'", [T])).toBe(before); // still last month's

    await manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "monthly-report-sep.xlsx", kind: "unitMatrix", forced: {} as never, approvedHash: plan.fileHash, profileId: analysis.profile!.id });
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND status = 'COMPLETE'", [T])).toBe(after);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(491); // the villas were not duplicated
    expect(await n("SELECT COUNT(*) AS n FROM pmc_activity_definitions WHERE tenantId = ?", [T])).toBe(6 * 136);
    const progress = await manager.pmc.progress(scope);
    let matched = 0; const byNumber = new Map(progress.units.map(unit => [unit.unitNumber, unit.progressPercent]));
    month2.truth.unitPercent.forEach((fraction, u) => { if (Math.abs((byNumber.get(u + 1) ?? NaN) - fraction * 100) <= 0.005) matched += 1; });
    expect(matched).toBe(MATRIX_UNITS);
    expect((await manager.smartImport.profiles(scope)).find(profile => profile.name === "التقرير الشهري التجريبي")!.timesUsed).toBe(2);
    // the same file again changes nothing and says so
    await expect(manager.smartImport.confirm({ ...scope, uploadKey: (await upload(manager, "monthly-report-sep-again.xlsx", month2.bytes)).uploadKey, fileName: "monthly-report-sep-again.xlsx", kind: "unitMatrix", forced: {} as never })).rejects.toThrow();
  }, 300_000);

  it("refuses: weights that do not total 100%, an Oracle code changed silently, a reader without PMC management — and writes nothing", async () => {
    const manager = callerFor(users.manager, "smx-manager");
    const units = await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T]);
    const cells = await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [T]);

    const broken = await buildMatrixWorkbook({ brokenWeights: true });
    const brokenTarget = await upload(manager, "broken.xlsx", broken.bytes);
    const brokenAnalysis = await manager.smartImport.analyze({ ...scope, uploadKey: brokenTarget.uploadKey, fileName: "broken.xlsx" });
    expect(brokenAnalysis.matrixPlan!.canConfirm).toBe(false);
    expect(brokenAnalysis.matrixPlan!.errors.map(error => error.code)).toContain("MATRIX_WEIGHTS_NOT_100");
    await expect(manager.smartImport.confirm({ ...scope, uploadKey: brokenTarget.uploadKey, fileName: "broken.xlsx", kind: "unitMatrix", forced: {} as never })).rejects.toThrow("PROJECT_OS_IMPORT_VALIDATION_FAILED");

    const renamed = await buildMatrixWorkbook({ oracleOverride: { 4: "Z9-B99-999" }, reportDate: new Date(Date.UTC(2026, 9, 31)) });
    const renamedTarget = await upload(manager, "renamed.xlsx", renamed.bytes);
    const renamedAnalysis = await manager.smartImport.analyze({ ...scope, uploadKey: renamedTarget.uploadKey, fileName: "renamed.xlsx" });
    expect(renamedAnalysis.matrixPlan!.canConfirm).toBe(false);
    expect(renamedAnalysis.matrixPlan!.errors.map(error => error.code)).toContain("MATRIX_ORACLE_CODE_CHANGE_BLOCKED");

    const reader = callerFor(users.reader, "smx-reader");
    const readerTarget = await upload(reader, "reader.xlsx", renamed.bytes);
    await expect(reader.smartImport.analyze({ ...scope, uploadKey: readerTarget.uploadKey, fileName: "reader.xlsx" })).rejects.toThrow();
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(units);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [T])).toBe(cells);
  }, 300_000);
});
