import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// D-45 (c), P-39 (2) on a real database, through the real router, as the restricted application role: the day's inspections read from the WIRs and RFIs (never typed),
// a photo placed on a zone or a unit of the same project, and the approval chain prepare → review → approve (D-42 b) in its order and by the people who hold its steps,
// with the reported cell status applied at the final approval only. Synthetic data only (*.example.test).
const SLUG = "daily-approval";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@dap.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a9000000-0000-4000-8000-000000000001";
const B = "a9000000-0000-4000-8000-000000000002";
const UNIT_A = "a9000000-0000-4000-8000-0000000000a1";
const UNIT_B = "a9000000-0000-4000-8000-0000000000b1";
const DEF_A = "a9000000-0000-4000-8000-0000000000d1";
const DAY = "2026-11-03";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const KEYS = ["owner", "preparer", "engineer2", "reviewer", "readOnlyReviewer", "approver", "otherManager", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let s3: FakeS3;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const at = (projectId = A) => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["site_daily_report_photos", "site_daily_report_lines", "site_daily_reports", "project_report_counters", "project_report_approvers", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_inspection_requests", "rfis",
      "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'dap-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the daily report's inspections, photos and approval chain on a real database (D-45 c)", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`dap-${key}`, `DAP ${key}`, `dap-${key}@dap.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'dap-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `dap-${key}`)!.id; callers[key] = callerFor(ids[key], `dap-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Daily Approval Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Approval Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DAP-A', 'Approval A', 'villas', 'SAR', 'active'), (?, ?, 'DAP-B', 'Approval B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "DAP_MANAGER", name: "Project manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const field = await callers.owner.tenant.createRole({ tenantId, code: "DAP_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    // the reviewer writes the review step, so holds a write permission on the field; a reader named as reviewer is refused
    const qc = await callers.owner.tenant.createRole({ tenantId, code: "DAP_QC", name: "QA/QC", productCode: "PROJECT", permissionCodes: ["project.read", "project.field.manage"] });
    const reader = await callers.owner.tenant.createRole({ tenantId, code: "DAP_READER", name: "Reader", productCode: "PROJECT", permissionCodes: ["project.read"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.readOnlyReviewer, roleId: reader.id, scopeType: "project", scopeId: A });
    for (const key of ["preparer", "engineer2"] as const) await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.reviewer, roleId: qc.id, scopeType: "project", scopeId: A });
    for (const key of ["approver", "otherManager"] as const) await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: manager.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const [members] = await connection.query<{ id: string; userId: number }[]>("SELECT id, userId FROM memberships WHERE tenantId = ?", [tenantId]);
    const member = (key: (typeof KEYS)[number]) => members.find(row => row.userId === ids[key])!.id;
    await callers.owner.projects.approvers.set({ ...at(), step: "prepare", membershipId: member("preparer") });
    await callers.owner.projects.approvers.set({ ...at(), step: "review", membershipId: member("reviewer") });
    await callers.owner.projects.approvers.set({ ...at(), step: "approve", membershipId: member("approver") });
    // one villa and one activity on A, one villa on B (the cell the report moves at approval)
    for (const [project, unit, tag] of [[A, UNIT_A, "a"], [B, UNIT_B, "b"]] as const) {
      await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [`dap-z-${tag}`, tenantId, project]);
      await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B01', 'Block 1')", [`dap-b-${tag}`, tenantId, project, `dap-z-${tag}`]);
      await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, ?, 1, 'MDL-A', 'available', 1)", [unit, tenantId, project, `dap-b-${tag}`]);
    }
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES ('dap-g', ?, ?, 'G01', 'Structure')", [tenantId, A]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES ('dap-s', ?, ?, 'dap-g', 'D01', 'Structure')", [tenantId, A]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, 'dap-g', 'dap-s', 'MDL-A', 'ACT-1', 'Block work', 100)", [DEF_A, tenantId, A]);
    // the day's inspections (and one the day before, which is not this day's)
    const wir = (codeText: string, response: string | null, when: string) => connection.query("INSERT INTO pmc_inspection_requests (id, tenantId, projectId, requestCode, activityDefinitionId, responseCode, requestedAt) VALUES (UUID(), ?, ?, ?, ?, ?, ?)", [tenantId, A, codeText, DEF_A, response, when]);
    await wir("WIR-001", "A", `${DAY}T06:00:00Z`); await wir("WIR-002", "B", `${DAY}T07:00:00Z`); await wir("WIR-003", "C", `${DAY}T08:00:00Z`); await wir("WIR-004", null, `${DAY}T09:00:00Z`); await wir("WIR-005", "UR", `${DAY}T20:30:00Z`); // 23:30 on site: still this day
    await wir("WIR-000", "A", `${DAY}T22:00:00Z`); // 01:00 the next day on site
    const rfi = (num: string, status: string, when: string) => connection.query("INSERT INTO rfis (id, tenantId, projectId, rfiNumber, subject, question, status, submittedAt, createdByUserId) VALUES (UUID(), ?, ?, ?, 'Question (example)', 'What is the detail? (example)', ?, ?, ?)", [tenantId, A, num, status, when, ids.owner]);
    await rfi("RFI-01", "submitted", `${DAY}T05:00:00Z`); await rfi("RFI-02", "answered", `${DAY}T06:00:00Z`); await rfi("RFI-03", "cancelled", `${DAY}T07:00:00Z`); await rfi("RFI-04", "answered", "2026-11-02T07:00:00Z");
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } if (s3) await s3.close(); });

  let reportId = "";
  it("the day's inspections are read from the WIRs and RFIs by their state, on the site's day; a field sent with the report is not stored", async () => {
    reportId = (await callers.preparer.siteReports.save({ ...at(), reportDate: DAY, summary: "Day with inspections", lines: [{ lineType: "work", pmcUnitId: UNIT_A, pmcActivityDefinitionId: DEF_A, reportedStatus: "IN_PROGRESS", description: "Block work villa 1" }], ...({ inspections: { wir: { submitted: 99 } } } as object) })).id;
    const read = await callers.reviewer.siteReports.get({ ...at(), reportId });
    expect(read.inspections.wir).toMatchObject({ submitted: 5, approved: 2, rejected: 1, pending: 2 });
    expect(read.inspections.wir.items.map(item => item.code)).toEqual(["WIR-001", "WIR-002", "WIR-003", "WIR-004", "WIR-005"]);
    expect(read.inspections.rfi).toMatchObject({ submitted: 3, approved: 1, rejected: 1, pending: 1 });
  });

  it("a photo is placed on a zone or on a unit of the project; a unit of another project is refused (and impossible in the database)", async () => {
    const put = async () => {
      const upload = await callers.preparer.directUploads.create({ ...at(), purpose: "sitePhoto", fileName: "wall.png", contentType: "image/png" });
      expect((await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: PNG })).status).toBe(200);
      return upload.uploadKey;
    };
    await callers.preparer.siteReports.attachPhoto({ ...at(), reportId, uploadKey: await put(), fileName: "wall.png", caption: "North wall", zone: "Zone 1", pmcUnitId: UNIT_A });
    expect(await code(callers.preparer.siteReports.attachPhoto({ ...at(), reportId, uploadKey: await put(), fileName: "wall.png", pmcUnitId: UNIT_B }))).toBe("PROJECT_OS_PMC_UNIT_NOT_FOUND");
    expect((await callers.preparer.siteReports.get({ ...at(), reportId })).photos).toEqual([expect.objectContaining({ zone: "Zone 1", pmcUnitId: UNIT_A, caption: "North wall" })]);
    await expect(connection.query("INSERT INTO site_daily_report_photos (id, tenantId, projectId, reportId, storageKey, fileName, contentType, sizeBytes, pmcUnitId, createdByUserId) VALUES (UUID(), ?, ?, ?, 'k-dap-x', 'x.png', 'image/png', 1, ?, ?)", [tenantId, A, reportId, UNIT_B, ids.preparer])).rejects.toThrow(/site_daily_report_photos_unit_fk/);
  });

  it("the chain goes prepare → review → approve, each by the person who holds the step; out of order or by someone else is refused and changes nothing", async () => {
    // another engineer may write a report but not send it: the project named who prepares
    const other = await callers.engineer2.siteReports.save({ ...at(), reportDate: "2026-11-02", summary: "Not the preparer's", lines: [] });
    expect(await code(callers.engineer2.siteReports.submit({ ...at(), reportId: other.id }))).toBe("PROJECT_OS_SITE_REPORT_NOT_YOUR_STEP");
    await callers.preparer.siteReports.submit({ ...at(), reportId });
    // approval before the review, and the review by the wrong person
    expect(await code(callers.approver.siteReports.review({ ...at(), reportId, decision: "approve" }))).toBe("PROJECT_OS_SITE_REPORT_STEP_OUT_OF_ORDER");
    expect(await code(callers.approver.siteReports.check({ ...at(), reportId, decision: "pass" }))).toBe("PROJECT_OS_SITE_REPORT_NOT_YOUR_STEP");
    expect(await count("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [tenantId])).toBe(0);
    // the reviewer returns it, the preparer corrects and sends it again, the reviewer passes it
    expect(await code(callers.reviewer.siteReports.check({ ...at(), reportId, decision: "return" }))).toBe("PROJECT_OS_SITE_REPORT_REJECT_REASON_REQUIRED");
    expect(await callers.reviewer.siteReports.check({ ...at(), reportId, decision: "return", note: "Add the villa number" })).toMatchObject({ status: "rejected" });
    await callers.preparer.siteReports.save({ ...at(), reportDate: DAY, summary: "Day with inspections, villa 1", lines: [{ lineType: "work", pmcUnitId: UNIT_A, pmcActivityDefinitionId: DEF_A, reportedStatus: "IN_PROGRESS", description: "Block work villa 1" }] });
    await callers.preparer.siteReports.submit({ ...at(), reportId });
    // a reviewer with read access only, named on the step, cannot write it: nothing changes
    const [members] = await connection.query<{ id: string; userId: number }[]>("SELECT id, userId FROM memberships WHERE tenantId = ?", [tenantId]);
    const memberOf = (key: (typeof KEYS)[number]) => members.find(row => row.userId === ids[key])!.id;
    await callers.owner.projects.approvers.set({ ...at(), step: "review", membershipId: memberOf("readOnlyReviewer") });
    expect(await code(callers.readOnlyReviewer.siteReports.check({ ...at(), reportId, decision: "pass" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_reports WHERE id = ? AND status = 'submitted' AND checkedAt IS NULL", [reportId])).toBe(1);
    await callers.owner.projects.approvers.set({ ...at(), step: "review", membershipId: memberOf("reviewer") });
    await callers.reviewer.siteReports.check({ ...at(), reportId, decision: "pass", note: "Checked on site" });
    expect(await code(callers.reviewer.siteReports.check({ ...at(), reportId, decision: "pass" }))).toBe("PROJECT_OS_SITE_REPORT_STEP_OUT_OF_ORDER");
    // the approval by someone with project.manage who does not hold the step, then by the one who does
    expect(await code(callers.otherManager.siteReports.review({ ...at(), reportId, decision: "approve" }))).toBe("PROJECT_OS_SITE_REPORT_NOT_YOUR_STEP");
    expect(await count("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [tenantId])).toBe(0);
    expect(await callers.approver.siteReports.review({ ...at(), reportId, decision: "approve" })).toMatchObject({ status: "approved" });
    // the reported status is applied at the final approval, not before
    expect(await count("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND unitId = ? AND status = 'IN_PROGRESS'", [tenantId, UNIT_A])).toBe(1);
    const { approval } = await callers.reviewer.siteReports.get({ ...at(), reportId });
    expect(approval.prepare).toMatchObject({ holder: ids.preparer, by: ids.preparer });
    expect(approval.review).toMatchObject({ holder: ids.reviewer, by: ids.reviewer, note: "Checked on site" });
    expect(approval.approve).toMatchObject({ holder: ids.approver, by: ids.approver });
    const times = [approval.prepare.at, approval.review.at, approval.approve.at].map(value => new Date(value as unknown as string).getTime());
    expect(times.every(Number.isFinite) && times[0] <= times[1] && times[1] <= times[2]).toBe(true);
    const actions = (await connection.query<{ action: string }[]>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ? ORDER BY createdAt", [tenantId, reportId]))[0].map(row => row.action);
    expect(actions.filter(action => ["site_report.submitted", "site_report.returned", "site_report.reviewed", "site_report.approved"].includes(action))).toEqual(["site_report.submitted", "site_report.returned", "site_report.submitted", "site_report.reviewed", "site_report.approved"]);
  });

  it("isolation: another company reads nothing; project B has no chain and its reviewer has nothing to review", async () => {
    expect(await code(callers.otherOwner.siteReports.get({ ...at(), reportId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.siteReports.check({ tenantId: otherTenantId, projectId: A, reportId, decision: "pass" }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    const onB = await callers.owner.siteReports.save({ ...at(B), reportDate: DAY, summary: "On B", lines: [] });
    await callers.owner.siteReports.submit({ ...at(B), reportId: onB.id });
    expect(await code(callers.owner.siteReports.check({ ...at(B), reportId: onB.id, decision: "pass" }))).toBe("PROJECT_OS_SITE_REPORT_STEP_OUT_OF_ORDER");
    expect((await callers.owner.siteReports.get({ ...at(B), reportId: onB.id })).inspections.wir.submitted).toBe(0);
  });
});
