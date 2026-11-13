import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { readGrid } from "./domain/smartImport/sheetReader";
import { detectMatrix } from "./domain/smartImport/matrix";
import { buildWo22ConsultantExport, buildWo22MonthlyReport, buildWo22SiteWorkbook, isSiteDone, WO22_CATALOG, WO22_SITE, WO22_VILLAS, wo22Truth, type Wo22Truth } from "./domain/smartImport/wo22Fixture";
import { COMPARISON_COLUMNS, COMPARISON_COLUMNS_EN } from "./wo22Exports";
import { siteToday } from "./wo22Shared";

// Work order 22, end to end on a real database: the monthly report (with its WIR row) builds the villas and the catalogue; the consultant's export gives the consultant's state
// (twice: the second week's preview says what is new); the site's old workbook brings the site's history once; the owner confirms the links; the comparison shows the two kinds of
// difference, the three percentages differ as the sources do, and an action on a difference changes the numbers. SYNTHETIC files only (domain/smartImport/wo22Fixture.ts).
const T = "7a000009-0000-4000-8000-0000000000a1";
const P = "7b000000-0000-4000-8000-0000000000a2";
/** Another company, whose own manager holds every PMC permission there — and none in T. */
const T2 = "7a000010-0000-4000-8000-0000000000b1";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
let truth: Wo22Truth;
const users = { manager: 0, engineer: 0, reader: 0, outsider: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@wo22.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext);
const scope = { tenantId: T, projectId: P };
const n = async (sql: string, params: unknown[] = []) => Number(((await connection.query<any[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM import_source_profiles WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["site_daily_report_lines", "site_daily_reports", "pmc_cell_notes", "pmc_site_cell_events", "pmc_site_cells", "pmc_site_activity_links", "pmc_site_activities", "pmc_consultant_cell_events", "pmc_consultant_cells", "pmc_consultant_columns", "pmc_plan_months", "pmc_contractors",
    "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [T]);
  await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [T]);
  for (const tenant of [T, T2]) {
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenant]);
  }
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T2]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T2]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T2]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE id = ?", [P]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'w22-%'");
}

type Caller = ReturnType<typeof callerFor>;
async function importFile(caller: Caller, fileName: string, bytes: Uint8Array) {
  const target = await caller.smartImport.createUpload({ ...scope, fileName });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const analysis = await caller.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName });
  return { target, analysis, confirm: (hash: string) => caller.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName, kind: analysis.understanding.kind as never, forced: {}, approvedHash: hash }) };
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("work order 22: site ↔ consultant ↔ monthly report, on a real database", () => {
  beforeAll(async () => {
    truth = wo22Truth();
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('w22-manager','Manager','w22-manager@wo22.example.test','user'),('w22-engineer','Engineer','w22-engineer@wo22.example.test','user'),('w22-reader','Reader','w22-reader@wo22.example.test','user'),('w22-outsider','Outsider','w22-outsider@wo22.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'w22-%'");
    for (const key of ["manager", "engineer", "reader", "outsider"] as const) users[key] = rows.find(r => r.openId === `w22-${key}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'WO22 Tenant', 'wo22-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'W22', 'Synthetic villas', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('w22-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('w22-ent', ?, 'w22-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.wbs.manage", "project.pmc.read", "project.pmc.update", "project.pmc.manage", "project.budget.manage"];
    for (const c of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [c, c]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('w22-r-manager', ?, 'W22_MANAGER','Manager','PROJECT'), ('w22-r-engineer', ?, 'W22_ENGINEER','Engineer','PROJECT'), ('w22-r-reader', ?, 'W22_READER','Reader','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'w22-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read','project.pmc.update','project.pmc.manage','project.budget.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'w22-r-engineer', id FROM permissions WHERE code IN ('project.read','project.pmc.read','project.pmc.update')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'w22-r-reader', id FROM permissions WHERE code IN ('project.read','project.pmc.read')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('w22-m-manager', ?, ?, 'active'), ('w22-m-engineer', ?, ?, 'active'), ('w22-m-reader', ?, ?, 'active')", [T, users.manager, T, users.engineer, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('w22-mr-manager','w22-m-manager','w22-r-manager','company'),('w22-mr-engineer','w22-m-engineer','w22-r-engineer','company'),('w22-mr-reader','w22-m-reader','w22-r-reader','company')");
    // the other company: its manager is a full PMC manager there
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'WO22 Other Tenant', 'wo22-other-tenant')", [T2]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('w22-sub-2', ?, 'ALL-IN-ONE', 'active', NOW())", [T2]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('w22-ent-2', ?, 'w22-sub-2', 'PROJECT', true, NOW())", [T2]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('w22-r-outsider', ?, 'W22_MANAGER','Manager','PROJECT')", [T2]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'w22-r-outsider', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read','project.pmc.update','project.pmc.manage','project.budget.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('w22-m-outsider', ?, ?, 'active')", [T2, users.outsider]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('w22-mr-outsider','w22-m-outsider','w22-r-outsider','company')");
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  const manager = () => callerFor(users.manager, "w22-manager");
  // the consultant's second week: 25 cells received that the first export did not show
  const weekTwo = () => { const next = truth.consultant.map(row => [...row]); let added = 0; for (let u = 0; u < WO22_VILLAS && added < 25; u += 7) for (let k = 0; k < WO22_CATALOG && added < 25; k += 11) if (!next[u][k]) { next[u][k] = true; added += 1; } return next; };

  it("1. the monthly report builds 390 villas and the 128-activity catalogue, and keeps each activity's WIR and each villa's number", async () => {
    const report = await importFile(manager(), "monthly-report.xlsx", await buildWo22MonthlyReport(truth));
    expect(report.analysis.understanding.kind).toBe("unitMatrix");
    expect(report.analysis.matrixPlan!.canConfirm).toBe(true);
    await report.confirm(report.analysis.matrixPlan!.fileHash);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ? AND villaLabel IS NOT NULL", [T])).toBe(WO22_VILLAS);
    expect(await n("SELECT COUNT(DISTINCT code) AS n FROM pmc_activity_definitions WHERE tenantId = ? AND wirCode IS NOT NULL", [T])).toBe(WO22_CATALOG);
  }, 300_000);

  it("2. the consultant's export links 116 columns by WIR, leaves the 12 different numbers to the owner, and its second week says what is new", async () => {
    const first = await importFile(manager(), "consultant-week1.xlsx", await buildWo22ConsultantExport(truth));
    expect(first.analysis.understanding.kind).toBe("consultantExport");
    const plan = first.analysis.consultantPlan!;
    expect(plan).toMatchObject({ units: WO22_VILLAS, columns: WO22_CATALOG, linkedByWir: WO22_CATALOG - 12, unknownVillas: [], noLongerReceived: 0 });
    expect(plan.unlinked).toHaveLength(12);
    expect(plan.newlyReceived).toBe(truth.consultant.flat().filter(Boolean).length);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_consultant_cells WHERE tenantId = ?", [T])).toBe(0); // the preview wrote nothing
    await first.confirm(plan.fileHash);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_consultant_cells WHERE tenantId = ?", [T])).toBe(WO22_VILLAS * WO22_CATALOG);
    // the owner matches the twelve once; the name suggestion offers the right activity first
    const columns = await manager().pmcSite.consultantColumns(scope);
    const defs = (await connection.query<any[]>("SELECT DISTINCT code, wirCode FROM pmc_activity_definitions WHERE tenantId = ?", [T]))[0] as Array<{ code: string; wirCode: string }>;
    const codeOfWir = new Map(defs.map(def => [def.wirCode, def.code]));
    const links = plan.unlinked.map(item => {
      const k = truth.catalog.findIndex(activity => activity.consultantWir === item.wir);
      expect(item.suggestions[0].activityCode).toBe(codeOfWir.get(truth.catalog[k].wir));
      return { columnId: columns.find(column => column.sourceKey === item.key)!.id, activityCode: item.suggestions[0].activityCode };
    });
    expect(await manager().pmcSite.linkConsultantColumns({ ...scope, links })).toMatchObject({ linked: 12 });
    // week two: «this week N items were received»
    const second = await importFile(manager(), "consultant-week2.xlsx", await buildWo22ConsultantExport(truth, { received: weekTwo(), exportDate: "2026-10-12" }));
    expect(second.analysis.consultantPlan).toMatchObject({ newlyReceived: 25, noLongerReceived: 0, linkedByWir: 0, unlinked: [], newColumns: 0 });
    await second.confirm(second.analysis.consultantPlan!.fileHash);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_consultant_cell_events WHERE tenantId = ? AND observedOn = '2026-10-12'", [T])).toBe(25);
    // the same file again is refused
    expect(await code(second.confirm(second.analysis.consultantPlan!.fileHash))).toBe("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
  }, 300_000);

  it("3. the site's old workbook comes in once: 44,460 cells with their dates, the history entered by «مُستورد», and a report of what was refused", async () => {
    const workbook = await buildWo22SiteWorkbook(truth);
    const site = await importFile(manager(), "site-sheet.xlsx", workbook);
    expect(site.analysis.understanding.kind).toBe("siteWorkbook");
    const plan = site.analysis.siteLegacyPlan!;
    expect(plan.errors).toEqual([]);
    expect(plan).toMatchObject({ activities: WO22_SITE, cells: WO22_VILLAS * WO22_SITE, suggestedLinks: WO22_CATALOG, unlinkedSiteActivities: 0, unlinkedCatalogActivities: 0, contractors: 5, planMonths: 24, summaryMismatches: [], financialVillas: WO22_VILLAS });
    expect(plan.rejectedByReason).toMatchObject({ SITE_DATE_IN_FUTURE: truth.legacy.futureLogRows + truth.legacy.futureDailyRows, SITE_VILLA_UNKNOWN: truth.legacy.unknownVillaLogRows });
    expect(plan.photosNotAvailable).toBeGreaterThan(0);
    await site.confirm(plan.fileHash);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cells WHERE tenantId = ?", [T])).toBe(WO22_VILLAS * WO22_SITE);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ? AND (enteredByLabel <> 'مُستورد' OR enteredByUserId IS NOT NULL)", [T])).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ? AND enteredByLabel LIKE '%@%'", [T])).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM site_daily_reports WHERE tenantId = ? AND sourceLabel = 'مُستورد'", [T])).toBeGreaterThan(0);
    expect(await n("SELECT COUNT(*) AS n FROM site_daily_report_lines WHERE tenantId = ? AND wbsCode = 'DC-01'", [T])).toBe(20);
    // once only
    const again = await importFile(manager(), "site-sheet-again.xlsx", workbook);
    expect(await code(again.confirm(plan.fileHash))).toMatch(/PROJECT_OS_(IMPORT_DUPLICATE_DETECTED|SITE_LEGACY_ALREADY_IMPORTED)/);
  }, 600_000);

  it("4. the owner confirms the suggested site ↔ catalogue links once (one site activity may stand for two catalogue activities)", async () => {
    const activities = await manager().pmcSite.activities(scope);
    expect(activities).toHaveLength(WO22_SITE);
    expect(activities.filter(activity => activity.links.length === 2)).toHaveLength(14);
    const result = await manager().pmcSite.confirmLinks({ ...scope, links: activities.map(activity => ({ siteActivityId: activity.id, activityCodes: activity.links.map(link => link.activityCode) })) });
    expect(result.confirmed).toBe(WO22_SITE);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_activity_links WHERE tenantId = ? AND confirmed = true", [T])).toBe(WO22_CATALOG);
  }, 120_000);

  const received2 = () => weekTwo();
  const expectedDifferences = () => {
    const consultant = received2(); let a = 0; let b = 0;
    truth.villas.forEach((_v, u) => truth.catalog.forEach((activity, k) => { const done = isSiteDone(truth.siteStatus[u][activity.site]); if (done && !consultant[u][k]) a += 1; if (!done && consultant[u][k]) b += 1; }));
    return { a, b };
  };

  it("5. the three percentages differ as the sources do, and the comparison finds both kinds of difference", async () => {
    const percentages = await manager().pmcSite.percentages(scope);
    const consultantShare = received2().reduce((sum, row) => sum + row.reduce((s, done, k) => s + (done ? truth.catalog[k].weight : 0), 0), 0) / WO22_VILLAS;
    expect(percentages.project.monthly).toBeCloseTo(truth.percentages.monthly, 3);
    expect(percentages.project.consultant).toBeCloseTo(consultantShare, 3);
    expect(percentages.project.site).toBeCloseTo(truth.percentages.site, 3);
    expect(percentages.byZone).toHaveLength(4);
    expect(percentages.byUnit).toHaveLength(WO22_VILLAS);
    const comparison = await manager().pmcSite.comparison({ ...scope, limit: 50 });
    const { a, b } = expectedDifferences();
    expect(comparison.totals).toEqual({ siteDoneNotReceived: a, receivedNotDone: b });
    expect(comparison.summary.reduce((sum, item) => sum + item.compared, 0)).toBe(WO22_VILLAS * WO22_CATALOG);
    expect(comparison.rows[0]).toMatchObject({ zone: expect.any(String), block: expect.any(String), villa: expect.any(String), modelCode: expect.stringMatching(/^R[123]$/), wir: expect.stringMatching(/^WIR-/) });
    expect(comparison.rows.every(row => row.ageDays !== null && row.ageDays >= 0)).toBe(true);
  }, 120_000);

  it("6. an engineer updates several villas in one entry (a range, a list, a block) — and every wrong entry is refused before anything is written", async () => {
    const engineer = callerFor(users.engineer, "w22-engineer");
    const activity = (await engineer.pmcSite.activities(scope))[5];
    const before = await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ?", [T]);
    const today = siteToday();
    const audited = () => n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.site_status_updated'", [T]);
    const auditBefore = await audited();
    const range = await engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, range: "268-272", status: "IN_PROGRESS", date: today });
    expect(await audited()).toBe(auditBefore + 1); // one audit row per write, in the write's own transaction
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.site_status_updated' AND metadata LIKE ?", [T, `%${range.batchId}%`])).toBe(1);
    expect(range.villas).toEqual(["268", "270", "272"]);
    expect(range.updated + range.unchanged).toBe(3);
    const block = await engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, blockCode: "B02", status: "DONE", date: today });
    expect(block.villas).toHaveLength(15);
    expect(await audited()).toBe(auditBefore + 2);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ? AND batchId = ?", [T, block.batchId])).toBe(block.updated);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ? AND enteredByUserId = ?", [T, users.engineer])).toBe(range.updated + block.updated); // the person's own account, not an e-mail typed in
    const counted = await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ?", [T]);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const refusals = await Promise.all([
      engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, villas: ["268", "99999"], status: "DONE", date: today }).catch(error => error.cause?.issues),
      engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, villas: ["268"], status: "DONE", date: tomorrow }).catch(error => error.cause?.issues),
      engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, status: "DONE", date: today }).catch(error => error.cause?.issues),
      engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, villas: ["268"], range: "268-272", blockCode: "B02", status: "DONE", date: today }).catch(error => error.cause?.issues),
      engineer.pmcSite.update({ ...scope, siteActivityId: activity.id, range: "268-272", blockCode: "B02", status: "DONE", date: today }).catch(error => error.cause?.issues),
    ]);
    expect(refusals[0]).toEqual([{ code: "SITE_VILLA_UNKNOWN", villa: "99999" }]);
    expect(refusals[1]).toEqual([{ code: "SITE_DATE_IN_FUTURE", detail: tomorrow }]);
    expect(refusals[2]).toEqual([{ code: "SITE_FIELD_MISSING", detail: "villas" }]);
    expect(refusals[3]).toEqual([{ code: "SITE_TARGET_AMBIGUOUS" }]); // more than one way of choosing the villas: refused, never «the last one wins»
    expect(refusals[4]).toEqual([{ code: "SITE_TARGET_AMBIGUOUS" }]);
    expect(await audited()).toBe(auditBefore + 2); // no audit row for a refusal either
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ?", [T])).toBe(counted); // nothing written by any refusal
    expect(counted).toBeGreaterThan(before);
    // a reader may look but not write
    expect(await code(callerFor(users.reader, "w22-reader").pmcSite.update({ ...scope, siteActivityId: activity.id, villas: ["268"], status: "DONE", date: today }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    // another company's manager, full PMC rights in their own company: refused here, on a read and on a write, and on this project named under their own company
    const outsider = callerFor(users.outsider, "w22-outsider");
    expect(await code(outsider.pmcSite.comparison({ ...scope, limit: 1 }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(outsider.pmcSite.update({ ...scope, siteActivityId: activity.id, villas: ["268"], status: "DONE", date: today }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(outsider.pmcSite.percentages({ tenantId: T2, projectId: P }))).not.toBe("no error");
    expect(await code(outsider.pmcSite.update({ tenantId: T2, projectId: P, siteActivityId: activity.id, villas: ["268"], status: "DONE", date: today }))).not.toBe("no error");
    expect(await n("SELECT COUNT(*) AS n FROM pmc_site_cell_events WHERE tenantId = ?", [T])).toBe(counted);
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ?", [T2])).toBe(0);
    const history = await engineer.pmcSite.history({ ...scope, unitId: (await connection.query<any[]>("SELECT id FROM pmc_units WHERE tenantId = ? AND villaLabel = '268'", [T]))[0][0].id, siteActivityId: activity.id });
    expect(history[0]).toMatchObject({ toStatus: "IN_PROGRESS", source: "site", enteredByUserId: users.engineer });
  }, 120_000);

  it("7. an action on a set of differences changes the numbers: «update the site» closes them, «create an inspection request» opens requests", async () => {
    const before = await manager().pmcSite.comparison({ ...scope, kind: "received_not_done", limit: 5 });
    const items = before.rows.map(row => ({ unitId: row.unitId, activityCode: row.activityCode }));
    const sitePercentBefore = (await manager().pmcSite.percentages(scope)).project.site;
    const actAudits = (action: string) => n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [T, action]);
    const siteAuditsBefore = await actAudits("pmc.differences_site_updated");
    const updated = await manager().pmcSite.act({ ...scope, action: "update_site", items });
    expect(await actAudits("pmc.differences_site_updated")).toBe(siteAuditsBefore + 1);
    expect(updated.updated).toBeGreaterThanOrEqual(5);
    const after = await manager().pmcSite.comparison({ ...scope, limit: 1 });
    expect(after.totals.receivedNotDone).toBe(before.totals.receivedNotDone - 5);
    expect((await manager().pmcSite.percentages(scope)).project.site).toBeGreaterThan(sitePercentBefore);
    // the same items again: no longer that difference — refused whole
    expect(await code(manager().pmcSite.act({ ...scope, action: "update_site", items }))).toBe("PROJECT_OS_PMC_DIFFERENCE_CHANGED");
    expect(await actAudits("pmc.differences_site_updated")).toBe(siteAuditsBefore + 1); // the refusal wrote no audit row
    const doneNotReceived = await manager().pmcSite.comparison({ ...scope, kind: "site_done_not_received", limit: 4 });
    const requested = await manager().pmcSite.act({ ...scope, action: "create_inspection", items: doneNotReceived.rows.map(row => ({ unitId: row.unitId, activityCode: row.activityCode })) });
    expect(requested.requests.length).toBeGreaterThan(0);
    expect(await actAudits("pmc.differences_inspection_requested")).toBe(1);
    expect(requested.requests.reduce((sum, request) => sum + request.units, 0)).toBe(4);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_inspection_requests WHERE tenantId = ?", [T])).toBe(requested.requests.length);
    // a note on a difference is kept and shown
    const row = doneNotReceived.rows[0];
    await manager().pmcSite.saveNote({ ...scope, unitId: row.unitId, activityCode: row.activityCode, note: "المقاول سيسلّم يوم الأحد" });
    const noted = await manager().pmcSite.comparison({ ...scope, villa: row.villa, kind: "site_done_not_received" });
    expect(noted.rows.find(item => item.activityCode === row.activityCode)?.note).toBe("المقاول سيسلّم يوم الأحد");
  }, 120_000);

  it("8. the comparison exports with the columns of the file it replaces; the monthly report exports in its own shape and reads back", async () => {
    const comparison = await manager().pmcSite.exportComparison(scope);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(comparison.base64, "base64"));
    expect(wb.worksheets[0].name).toBe("ملخص");
    const section = wb.worksheets[1];
    expect((section.getRow(1).values as unknown[]).slice(1)).toEqual(COMPARISON_COLUMNS);
    expect(section.views[0]?.rightToLeft).toBe(true);
    const all = await manager().pmcSite.comparison({ ...scope, limit: 1 });
    expect(wb.worksheets.slice(1).reduce((sum, ws) => sum + ws.rowCount - 1, 0)).toBe(all.totals.siteDoneNotReceived + all.totals.receivedNotDone);
    // the English screen gets the same file with English headers, read left to right; the rows are the same
    const english = await manager().pmcSite.exportComparison({ ...scope, language: "en" });
    const wbEn = new ExcelJS.Workbook(); await wbEn.xlsx.load(Buffer.from(english.base64, "base64"));
    expect(wbEn.worksheets[0].name).toBe("Summary");
    expect((wbEn.worksheets[0].getRow(1).values as unknown[])[1]).toBe("Section");
    expect((wbEn.worksheets[1].getRow(1).values as unknown[]).slice(1)).toEqual(COMPARISON_COLUMNS_EN);
    expect(wbEn.worksheets[1].views[0]?.rightToLeft).toBe(false);
    expect(wbEn.worksheets.slice(1).reduce((sum, ws) => sum + ws.rowCount - 1, 0)).toBe(all.totals.siteDoneNotReceived + all.totals.receivedNotDone);
    expect(String((wbEn.worksheets[1].getRow(2).values as unknown[])[12])).toMatch(/^(Finished on site|Received by the consultant)/);
    expect(english.rows).toBe(comparison.rows);
    for (const source of ["monthly", "site"] as const) {
      const exported = await manager().pmcSite.exportMonthlyReport({ ...scope, source, reportDate: truth.reportDate });
      const grid = await readGrid(Buffer.from(exported.base64, "base64"), "xlsx"); if (!grid.ok) throw new Error(grid.code);
      const detected = detectMatrix(grid.sheets[0]);
      expect(detected.ok).toBe(true);
      if (!detected.ok) return;
      expect(detected.model).toMatchObject({ reportDate: truth.reportDate, wirRow: 6 });
      expect(detected.model.units).toHaveLength(WO22_VILLAS);
      expect(detected.model.activities).toHaveLength(WO22_CATALOG);
      if (source === "monthly") expect(detected.model.units.reduce((sum, unit) => sum + unit.complete.filter(Boolean).length, 0)).toBe(truth.monthly.flat().filter(Boolean).length);
    }
  }, 300_000);

  it("9. riyals only with the financial permission; the S-curve has the planned months and the site's actual line", async () => {
    const value = await manager().pmcSite.earnedValue(scope);
    expect(value.total.villasWithoutPrice).toBe(0);
    expect(value.total.earnedValue).toBeGreaterThan(0);
    expect(value.total.earnedValue).toBeLessThan(value.total.contractValue);
    expect(await manager().pmcSite.canSeeFinancials(scope)).toBe(true);
    expect(await callerFor(users.engineer, "w22-engineer").pmcSite.canSeeFinancials(scope)).toBe(false);
    expect(await code(callerFor(users.engineer, "w22-engineer").pmcSite.earnedValue(scope))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const curve = await manager().pmcSite.curve(scope);
    expect(curve.points).toHaveLength(24);
    expect(curve.points[curve.points.length - 1].plannedCumulative).toBeCloseTo(1, 6);
    expect(curve.points.filter(point => point.actualCumulative !== null).length).toBeGreaterThan(0);
    expect(curve.deviationToDate).not.toBeNull();
  }, 120_000);
});
