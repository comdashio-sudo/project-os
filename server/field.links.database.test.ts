import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// Work order 12, items 4 to 7: the site's daily report, the consultant's submittals, quality, and the rules that tie them to a unit and an activity.
// Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "field-links";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@field.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const KEYS = ["owner", "engineer", "pm", "coord"] as const;
const id = (n: number) => `f6000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = id(1); const WBS = id(10); const ZONE = id(20); const BLOCK = id(21); const U1 = id(22); const U2 = id(23); const GROUP = id(24); const STAGE = id(25); const WALLS = id(26); const PAINT = id(27);
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
// a 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let connection: fixtureDb.Connection; let s3: FakeS3;
let tenantId = ""; let cement = ""; let warehouse = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};
const scope = () => ({ tenantId, projectId: P });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id: company } of companies) {
    for (const table of ["site_daily_report_photos", "site_daily_report_lines", "site_daily_reports", "consultant_submittals", "submittal_reply_codes", "tenant_policies", "material_issues", "cost_entries", "warehouse_inventory_transactions", "client_requests", "project_warehouses", "material_masters", "ncrs",
      "pmc_unit_activity_history", "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "progress_entries", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "wbs_items", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'fld-%'");
}
const cellStatus = async (unit: string, activity: string) => { const [rows] = await connection.query<{ status: string }[]>("SELECT status FROM pmc_unit_activity_progress WHERE unitId = ? AND activityDefinitionId = ?", [unit, activity]); return rows[0]?.status ?? null; };
const setPolicy = (qcCompletionMode: "off" | "warn" | "block", materialApprovalMode: "off" | "warn" | "block" = "warn") => callers.owner.policy.set({ tenantId, qcCompletionMode, qcAcceptedCodes: ["A", "B"], materialApprovalMode });
/** An inspection request for the unit and activity, answered with `response`. */
async function inspect(unit: string, activity: string, response: "A" | "B" | "C" | "UR" | null, code: string, at = new Date()) {
  const requestId = crypto.randomUUID();
  await connection.query("INSERT INTO pmc_inspection_requests (id, tenantId, projectId, requestCode, activityDefinitionId, responseCode, requestedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [requestId, tenantId, P, code, activity, response, at]);
  await connection.query("INSERT INTO pmc_inspection_request_units (id, tenantId, projectId, inspectionRequestId, unitId) VALUES (gen_random_uuid(), ?, ?, ?, ?)", [tenantId, P, requestId, unit]);
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the daily report, submittals, quality and their links on a real database", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`fld-${key}`, `Field ${key}`, `fld-${key}@field.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'fld-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `fld-${key}`)!.id; callers[key] = callerFor(userIds[key], `fld-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Field Links Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'FL-1', 'Villas', 'villas', 'SAR', 'active')", [P, tenantId]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    const roleOf = (code: string) => administration.roles.find(role => role.code === code)!.id;
    const invite = async (key: typeof KEYS[number], role: string) => {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `fld-${key}@field.example.test`, roleId: roleOf(role), scopeType: "project", scopeId: P });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    };
    await invite("engineer", "SITE_ENGINEER"); await invite("pm", "PROJECT_MANAGER"); await invite("coord", "PROJECT_COORDINATOR");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'WBS-1', 'Masonry', 100000)", [WBS, tenantId, P]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1)", [U1, tenantId, P, BLOCK, U2, tenantId, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'FIN', 'Finishing')", [GROUP, tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [STAGE, tenantId, P, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, wbsItemId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60), (?, ?, ?, ?, ?, ?, 'A', 'PAINT', 'Paint', 40)", [WALLS, tenantId, P, GROUP, STAGE, WBS, PAINT, tenantId, P, GROUP, STAGE, WBS]);
    await callers.owner.materials.createMaster({ tenantId, code: "TILE-1", description: "Porcelain tile", unitOfMeasure: "m2", category: "finishes" });
    const [[material]] = await connection.query<{ id: string }[]>("SELECT id FROM material_masters WHERE tenantId = ? AND code = 'TILE-1'", [tenantId]);
    cement = material.id;
    await callers.owner.warehouses.create({ tenantId, projectId: P, code: "WH-1", name: "Store" });
    const [warehouses] = await connection.query<{ id: string }[]>("SELECT id FROM project_warehouses WHERE tenantId = ?", [tenantId]); warehouse = warehouses[0].id;
    await callers.owner.warehouses.recordInventory({ tenantId, projectId: P, warehouseId: warehouse, materialId: cement, transactionType: "receipt", quantityDelta: 100, unitCost: 50, occurredAt: new Date() });
  }, 240_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  // ----------------------------------------------------------------------------------------------------------------------------- item 4
  it("daily report: the engineer writes and submits it, the project manager's approval moves the cells, and nobody approves their own", async () => {
    await setPolicy("off");
    const bad = { ...scope(), reportDate: today, lines: [{ lineType: "labour" as const, label: "Masons" }] };
    await expect(callers.engineer.siteReports.save(bad)).rejects.toThrow("PROJECT_OS_SITE_REPORT_LINE_INVALID");
    await expect(callers.engineer.siteReports.save({ ...scope(), reportDate: "2099-01-01", lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_DATE_FUTURE");
    const saved = await callers.engineer.siteReports.save({
      ...scope(), reportDate: daysAgo(1), weather: "clear", temperatureC: 31.5, summary: "Masonry in block B1", obstacles: "Late cement delivery",
      lines: [
        { lineType: "labour", label: "Masons", quantity: 8, hours: 9, pmcActivityDefinitionId: WALLS },
        { lineType: "equipment", label: "Mixer", quantity: 2, pmcActivityDefinitionId: WALLS },
        { lineType: "work", description: "Walls of unit 1", pmcUnitId: U1, pmcActivityDefinitionId: WALLS, reportedStatus: "IN_PROGRESS" },
        { lineType: "work", description: "Paint of unit 2 done", pmcUnitId: U2, pmcActivityDefinitionId: PAINT, reportedStatus: "COMPLETE" },
      ],
    });
    expect(saved.status).toBe("draft");
    // an engineer cannot approve; the person who wrote it cannot either (here a PM who prepared their own report)
    await expect(callers.engineer.siteReports.submit({ ...scope(), reportId: saved.id })).resolves.toMatchObject({ status: "submitted" });
    await expect(callers.engineer.siteReports.review({ ...scope(), reportId: saved.id, decision: "approve" })).rejects.toThrow("Required permission is not granted.");
    await expect(callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(1), lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_LOCKED");
    const own = await callers.pm.siteReports.save({ ...scope(), reportDate: daysAgo(1), summary: "PM's own", lines: [] });
    await callers.pm.siteReports.submit({ ...scope(), reportId: own.id });
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: own.id, decision: "approve" })).rejects.toThrow("PROJECT_OS_SITE_REPORT_SELF_REVIEW");
    // nothing moved yet
    expect(await cellStatus(U1, WALLS)).toBeNull();
    const preview = await callers.pm.siteReports.review({ ...scope(), reportId: saved.id, decision: "approve", dryRun: true });
    expect(preview.applied.map(cell => cell.to).sort()).toEqual(["COMPLETE", "IN_PROGRESS"]);
    expect(await cellStatus(U1, WALLS)).toBeNull(); // a dry run writes nothing
    const approved = await callers.pm.siteReports.review({ ...scope(), reportId: saved.id, decision: "approve" });
    expect(approved).toMatchObject({ status: "approved", skipped: [] });
    expect(approved.applied).toHaveLength(2);
    expect(await cellStatus(U1, WALLS)).toBe("IN_PROGRESS");
    expect(await cellStatus(U2, PAINT)).toBe("COMPLETE");
    const [history] = await connection.query<{ note: string }[]>("SELECT note FROM pmc_unit_activity_history WHERE tenantId = ? AND note LIKE 'Daily report%'", [tenantId]);
    expect(history).toHaveLength(2);
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: saved.id, decision: "approve" })).rejects.toThrow("PROJECT_OS_SITE_REPORT_NOT_SUBMITTED");
    const detail = await callers.engineer.siteReports.get({ ...scope(), reportId: saved.id });
    expect(detail.report).toMatchObject({ status: "approved", weather: "clear" });
    expect(detail.lines).toHaveLength(4);
  });

  it("a report only moves a cell forward, a rejected report goes back to its writer, and a rejection needs a reason", async () => {
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(2), lines: [{ lineType: "work", description: "Paint again", pmcUnitId: U2, pmcActivityDefinitionId: PAINT, reportedStatus: "IN_PROGRESS" }] });
    await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id });
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "reject" })).rejects.toThrow("PROJECT_OS_SITE_REPORT_REJECT_REASON_REQUIRED");
    const approved = await callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" });
    expect(approved.applied).toHaveLength(0);
    expect(approved.skipped).toEqual([{ unitId: U2, activityDefinitionId: PAINT, reason: "NOT_FORWARD", current: "COMPLETE", reported: "IN_PROGRESS" }]);
    expect(await cellStatus(U2, PAINT)).toBe("COMPLETE"); // not taken back
    const second = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(3), summary: "Rainy day", lines: [] });
    await callers.engineer.siteReports.submit({ ...scope(), reportId: second.id });
    await callers.pm.siteReports.review({ ...scope(), reportId: second.id, decision: "reject", note: "Add the labour count" });
    const again = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(3), summary: "Rainy day", lines: [{ lineType: "labour", label: "Masons", quantity: 0.5 }] });
    expect(again.id).toBe(second.id); // the same report, back to draft
    await expect(callers.engineer.siteReports.submit({ ...scope(), reportId: second.id })).resolves.toMatchObject({ status: "submitted" });
  });

  it("a photo goes straight to storage and becomes part of the report; an image-looking file that is not an image is refused", async () => {
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(4), summary: "With photos", lines: [] });
    const put = async (bytes: Buffer, name: string) => {
      const upload = await callers.engineer.directUploads.create({ ...scope(), purpose: "sitePhoto", fileName: name, contentType: "image/png" });
      const response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: bytes });
      expect(response.status).toBe(200);
      return upload.uploadKey;
    };
    const ok = await callers.engineer.siteReports.attachPhoto({ ...scope(), reportId: report.id, uploadKey: await put(PNG, "wall.png"), fileName: "wall.png", caption: "North wall" });
    expect(ok).toMatchObject({ contentType: "image/png", sizeBytes: PNG.length });
    await expect(callers.engineer.siteReports.attachPhoto({ ...scope(), reportId: report.id, uploadKey: await put(Buffer.from("not an image at all"), "fake.png"), fileName: "fake.png" })).rejects.toThrow("PROJECT_OS_SITE_REPORT_PHOTO_INVALID");
    const detail = await callers.engineer.siteReports.get({ ...scope(), reportId: report.id });
    expect(detail.photos).toHaveLength(1);
    expect(detail.photos[0].url).toContain("http");
    // an upload made for another purpose is not a photo
    const documentUpload = await callers.engineer.directUploads.create({ ...scope(), purpose: "document", fileName: "doc.png", contentType: "image/png" }).catch(() => null);
    if (documentUpload) { await fetch(documentUpload.uploadUrl, { method: "PUT", headers: documentUpload.headers, body: PNG }); await expect(callers.engineer.siteReports.attachPhoto({ ...scope(), reportId: report.id, uploadKey: documentUpload.uploadKey, fileName: "doc.png" })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID"); }
  });

  // ----------------------------------------------------------------------------------------------------------------------------- item 5
  it("submittals: numbered, revised, sent and answered with the company's own codes; the days at the consultant are counted", async () => {
    const created = await callers.engineer.submittals.create({ ...scope(), submittalType: "material_approval", submittalNumber: "MAT-001", title: "Porcelain tile", materialId: cement, pmcActivityDefinitionId: PAINT });
    expect(created).toMatchObject({ submittalNumber: "MAT-001", revision: 0 });
    await expect(callers.engineer.submittals.create({ ...scope(), submittalType: "sample", submittalNumber: "MAT-001", title: "dup" })).rejects.toThrow("PROJECT_OS_SUBMITTAL_NUMBER_EXISTS");
    await expect(callers.engineer.submittals.create({ ...scope(), submittalType: "material_approval", submittalNumber: "MAT-002", title: "no material" })).rejects.toThrow("PROJECT_OS_SUBMITTAL_MATERIAL_REQUIRED");
    await callers.engineer.submittals.send({ ...scope(), submittalId: created.id, sentAt: new Date(Date.now() - 6 * 86_400_000) });
    const open = (await callers.engineer.submittals.list(scope())).find(row => row.id === created.id)!;
    expect(open.status).toBe("sent"); expect(open.daysAtConsultant).toBe(6);
    // the one who sent does not record the answer; the codes are the company's
    await expect(callers.engineer.submittals.reply({ ...scope(), submittalId: created.id, replyCode: "A" })).rejects.toThrow("Required permission is not granted.");
    await expect(callers.coord.submittals.reply({ ...scope(), submittalId: created.id, replyCode: "Z" })).rejects.toThrow("PROJECT_OS_SUBMITTAL_REPLY_CODE_UNKNOWN");
    const sentByCoord = await callers.coord.submittals.create({ ...scope(), submittalType: "shop_drawing", submittalNumber: "SD-001", title: "Slab drawing" });
    await callers.coord.submittals.send({ ...scope(), submittalId: sentByCoord.id });
    await expect(callers.coord.submittals.reply({ ...scope(), submittalId: sentByCoord.id, replyCode: "A" })).rejects.toThrow("PROJECT_OS_SUBMITTAL_SELF_REPLY");
    const replied = await callers.pm.submittals.reply({ ...scope(), submittalId: created.id, replyCode: "c", replyNote: "Provide the test report", repliedAt: new Date(Date.now() - 2 * 86_400_000) });
    expect(replied).toMatchObject({ status: "replied", replyCode: "C", approved: false });
    const answered = (await callers.pm.submittals.list(scope())).find(row => row.id === created.id)!;
    expect(answered.daysAtConsultant).toBe(4); // sent 6 days ago, answered 2 days ago
    // C does not approve: it is resubmitted as revision 1, the old one closes
    const second = await callers.engineer.submittals.create({ ...scope(), submittalType: "material_approval", submittalNumber: "ignored", title: "Porcelain tile r1", resubmissionOfId: created.id });
    expect(second).toMatchObject({ submittalNumber: "MAT-001", revision: 1 });
    const [old] = await connection.query<{ status: string }[]>("SELECT status FROM consultant_submittals WHERE id = ?", [created.id]);
    expect(old[0].status).toBe("closed");
    await expect(callers.engineer.submittals.create({ ...scope(), submittalType: "material_approval", submittalNumber: "x", title: "again", resubmissionOfId: created.id })).rejects.toThrow("PROJECT_OS_SUBMITTAL_RESUBMISSION_INVALID");
  });

  it("the company names its own reply codes and says which approve; at least one of each is required", async () => {
    const codes = await callers.coord.submittals.replyCodes(scope());
    expect(codes.map(code => [code.code, code.approved])).toEqual([["A", true], ["B", true], ["C", false], ["D", false]]);
    await expect(callers.owner.submittals.saveReplyCodes({ tenantId, codes: [{ code: "OK", labelAr: "معتمد", labelEn: "Approved", approved: true, active: true }, { code: "OK2", labelAr: "معتمد", labelEn: "Approved too", approved: true, active: true }] })).rejects.toThrow("PROJECT_OS_SUBMITTAL_CODES_NEED_BOTH");
    await expect(callers.pm.submittals.saveReplyCodes({ tenantId, codes: [{ code: "OK", labelAr: "معتمد", labelEn: "Approved", approved: true, active: true }, { code: "NO", labelAr: "مرفوض", labelEn: "Rejected", approved: false, active: true }] })).rejects.toThrow();
    const saved = await callers.owner.submittals.saveReplyCodes({ tenantId, codes: [
      { code: "A", labelAr: "معتمد", labelEn: "Approved", approved: true, active: true }, { code: "B", labelAr: "معتمد بملاحظات", labelEn: "Approved as noted", approved: true, active: true },
      { code: "C", labelAr: "أعد التقديم", labelEn: "Revise and resubmit", approved: false, active: true }, { code: "R", labelAr: "مرفوض نهائيًا", labelEn: "Final rejection", approved: false, active: true },
    ] });
    expect(saved.filter(code => code.active).map(code => code.code)).toEqual(["A", "B", "C", "R"]);
    expect(saved.find(code => code.code === "D")!.active).toBe(false); // retired, not deleted
    const sd = (await callers.pm.submittals.list(scope())).find(row => row.submittalNumber === "SD-001")!;
    await expect(callers.pm.submittals.reply({ ...scope(), submittalId: sd.id, replyCode: "D" })).rejects.toThrow("PROJECT_OS_SUBMITTAL_REPLY_CODE_UNKNOWN");
    await expect(callers.pm.submittals.reply({ ...scope(), submittalId: sd.id, replyCode: "R" })).resolves.toMatchObject({ approved: false });
  });

  // ----------------------------------------------------------------------------------------------------------------------------- items 6 and 7
  it("an activity is not COMPLETE before the consultant accepted an inspection of that unit and activity: the company chooses off, warn or block", async () => {
    const complete = (unit: string) => callers.pm.pmc.setUnitActivityStatus({ ...scope(), unitId: unit, activityDefinitionId: WALLS, status: "COMPLETE" });
    await setPolicy("block");
    await expect(complete(U2)).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED"); // no inspection at all
    await inspect(U2, WALLS, "C", "IR-1", new Date(Date.now() - 3 * 86_400_000));
    await expect(complete(U2)).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED"); // answered, not accepted
    await inspect(U2, WALLS, null, "IR-2", new Date(Date.now() - 2 * 86_400_000));
    await expect(complete(U2)).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED"); // a newer request still waiting does not make the older C an acceptance
    await inspect(U2, WALLS, "B", "IR-3", new Date(Date.now() - 86_400_000));
    expect((await complete(U2)).warnings).toEqual([]); // accepted (B counts), completes
    expect(await cellStatus(U2, WALLS)).toBe("COMPLETE");
    // another unit is still not accepted: the rule is on the cell, not the activity
    await expect(complete(U1)).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED");
    // warn: the person is told, and it goes through
    await setPolicy("warn");
    const warned = await complete(U1);
    expect(warned.warnings).toEqual([{ code: "QC_NOT_ACCEPTED" }]);
    expect(await cellStatus(U1, WALLS)).toBe("COMPLETE");
  });

  it("'block' holds on every road to COMPLETE: the daily report's approval, and the database itself", async () => {
    await connection.query("DELETE FROM pmc_unit_activity_progress WHERE tenantId = ? AND unitId = ? AND activityDefinitionId = ?", [tenantId, U1, WALLS]);
    await setPolicy("block");
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(6), lines: [{ lineType: "work", description: "Walls of unit 1 done", pmcUnitId: U1, pmcActivityDefinitionId: WALLS, reportedStatus: "COMPLETE" }] });
    await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id });
    const dry = await callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve", dryRun: true });
    expect(dry.notAccepted).toEqual([{ unitId: U1, activityDefinitionId: WALLS }]);
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED");
    expect(await cellStatus(U1, WALLS)).toBeNull();
    const [still] = await connection.query<{ status: string }[]>("SELECT status FROM site_daily_reports WHERE id = ?", [report.id]);
    expect(still[0].status).toBe("submitted"); // the refusal rolled the whole approval back
    // the database refuses on its own, for a path that goes around the application (as the application's restricted role)
    const appConnection = await fixtureDb.createConnection(process.env.TEST_APP_DATABASE_URL ?? process.env.DATABASE_URL!);
    try {
      await appConnection.query("SELECT set_config('app.system', 'on', false)");
      await expect(appConnection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status) VALUES (gen_random_uuid(), ?, ?, ?, ?, 'COMPLETE')", [tenantId, P, U1, WALLS])).rejects.toThrow(/QC_NOT_ACCEPTED/);
    } finally { await appConnection.end(); }
    // once the inspection is accepted the same approval goes through
    await inspect(U1, WALLS, "A", "IR-4");
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).resolves.toMatchObject({ status: "approved" });
    expect(await cellStatus(U1, WALLS)).toBe("COMPLETE");
  });

  it("a material whose approval submittal was not approved is flagged at the warehouse; 'block' refuses it", async () => {
    await setPolicy("off", "warn");
    const unapproved = await callers.owner.warehouses.issueToCell({ ...scope(), warehouseId: warehouse, materialId: cement, pmcUnitId: U1, pmcActivityDefinitionId: PAINT, issuedQuantity: 1, issuedAt: new Date() });
    expect(unapproved.warnings).toEqual([{ code: "MATERIAL_NOT_APPROVED", state: "not_approved" }]); // revision 1 was created but never sent
    const second = (await callers.pm.submittals.list(scope())).find(row => row.submittalNumber === "MAT-001" && row.revision === 1)!;
    await callers.engineer.submittals.send({ ...scope(), submittalId: second.id });
    await setPolicy("off", "block");
    await expect(callers.owner.warehouses.issueToCell({ ...scope(), warehouseId: warehouse, materialId: cement, pmcUnitId: U1, pmcActivityDefinitionId: PAINT, issuedQuantity: 1, issuedAt: new Date() })).rejects.toThrow("PROJECT_OS_MATERIAL_NOT_APPROVED");
    await callers.pm.submittals.reply({ ...scope(), submittalId: second.id, replyCode: "A" });
    const approved = await callers.owner.warehouses.issueToCell({ ...scope(), warehouseId: warehouse, materialId: cement, pmcUnitId: U1, pmcActivityDefinitionId: PAINT, issuedQuantity: 1, issuedAt: new Date() });
    expect(approved.warnings).toEqual([]);
    // issueToWork, the older road in, ends at the same place
    await expect(callers.owner.warehouses.issueToWork({ ...scope(), warehouseId: warehouse, materialId: cement, wbsItemId: WBS, issuedQuantity: 1, issuedAt: new Date() })).resolves.toMatchObject({ warnings: [] });
  });

  it("the card of a unit and activity shows one timeline: reports, submittals, inspections, NCRs, material and status changes — with no money", async () => {
    await callers.pm.ncrs.create({ ...scope(), ncrNumber: "NCR-1", title: "Honeycombing", description: "Honeycombing in the wall", pmcUnitId: U1, pmcActivityDefinitionId: WALLS });
    await expect(callers.pm.ncrs.create({ ...scope(), ncrNumber: "NCR-2", title: "Wrong place", description: "wrong place", pmcUnitId: crypto.randomUUID() })).rejects.toThrow("PROJECT_OS_PMC_UNIT_NOT_FOUND");
    const card = await callers.engineer.cells.card({ ...scope(), unitId: U1, activityDefinitionId: WALLS });
    expect(card.unit.number).toBe(1);
    expect(card.activity?.code).toBe("WALLS");
    expect(card.status).toBe("COMPLETE");
    expect(card.qc).toEqual({ policy: "off", accepted: true });
    expect(card.openNcrs).toBe(1);
    const kinds = new Set(card.events.map(event => event.kind));
    for (const kind of ["daily_report", "inspection", "ncr", "status_change"]) expect(kinds.has(kind as never)).toBe(true);
    expect(card.events.map(event => event.at)).toEqual(card.events.map(event => event.at).slice().sort().reverse());
    expect(JSON.stringify(card)).not.toMatch(/totalCost|unitCost|amount/);
    const paint = await callers.engineer.cells.card({ ...scope(), unitId: U1, activityDefinitionId: PAINT });
    expect(paint.events.some(event => event.kind === "material_issue")).toBe(true); // the tile issued into unit 1's paint
    expect(paint.events.some(event => event.kind === "submittal")).toBe(true); // the material approval linked to PAINT
    await expect(callers.engineer.cells.card({ ...scope(), unitId: U1, activityDefinitionId: crypto.randomUUID() })).rejects.toThrow("PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
  });

  it("policy: only a company manager reads or changes it, and a bad code list is refused", async () => {
    await expect(callers.engineer.policy.set({ tenantId, qcCompletionMode: "block", qcAcceptedCodes: ["A"], materialApprovalMode: "block" })).rejects.toThrow();
    await expect(callers.owner.policy.set({ tenantId, qcCompletionMode: "block", qcAcceptedCodes: ["a-b"], materialApprovalMode: "off" })).rejects.toThrow("PROJECT_OS_POLICY_CODES_INVALID");
    expect(await callers.owner.policy.get({ tenantId })).toMatchObject({ qcCompletionMode: "off", materialApprovalMode: "block" });
  });
});
