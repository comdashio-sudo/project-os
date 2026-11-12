import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { projectErrorMessages } from "../shared/projectErrors";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// D-44 (b): the site's unit TRACKER through the smart import box, on a real database, as the restricted application role. The workbook is SYNTHETIC, generated here
// (1,230 villas, two models, three phases, the phase and block written once per block in vertically merged cells) and never committed. It is stored as the monthly
// report's cell status (pmc_unit_activity_progress), matched by name to the catalogue the project already has.
const T = "79000000-0000-4000-8000-0000000000f1";
const P = "79000000-0000-4000-8000-0000000000f2";
const T2 = "79000000-0000-4000-8000-0000000000f3";
const VILLAS = 1230;
const ACTIVITIES = ["Excavation", "Foundations", "Columns", "Slab", "Block work", "Plaster"];
const MODELS = ["MDL-A", "MDL-B"];
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { manager: 0, reader: 0, stranger: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@tracker.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const n = async (sql: string, params: unknown[] = []) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");

type Status = "Completed" | "On going" | "";
const baseStatus = (villa: number, activity: number): Status => { const v = (villa * 7 + activity * 3) % 10; return v < 4 ? "Completed" : v === 4 ? "On going" : ""; };
/** The synthetic tracker: villa i (1-based) is serial i, villa number 1000 + i, model by block, phase by a third of the villas, 30 villas per block. */
async function trackerWorkbook(status: (villa: number, activity: number) => string = baseStatus, edit?: (rows: string[][]) => void) {
  const rows: string[][] = [];
  for (let i = 1; i <= VILLAS; i++) { const block = Math.ceil(i / 30); rows.push([String(i), `PH${Math.ceil(i / 410)}`, `B${String(block).padStart(2, "0")}`, `V-${1000 + i}`, MODELS[block % 2], ...ACTIVITIES.map((_a, a) => status(i, a))]); }
  edit?.(rows);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Tracker");
  sheet.addRow(["Villa tracker (synthetic)"]);
  sheet.addRow(["م", "المرحلة", "البلوك", "رقم الفيلا", "النموذج", ...ACTIVITIES]);
  for (const row of rows) sheet.addRow(row.map((cell, c) => (c === 0 ? Number(cell) : cell)));
  // the phase and the block are written once per block, in a vertical merge (what the reader fills before anything reads the sheet)
  let merges = 0;
  for (let start = 0; start < rows.length; start += 30) {
    const top = start + 3; const bottom = Math.min(start + 30, rows.length) + 2;
    for (let r = top + 1; r <= bottom; r++) { sheet.getCell(r, 2).value = null; sheet.getCell(r, 3).value = null; }
    if (bottom > top) { sheet.mergeCells(top, 2, bottom, 2); sheet.mergeCells(top, 3, bottom, 3); merges += 2; }
  }
  return { bytes: new Uint8Array(await book.xlsx.writeBuffer()), merges, rows };
}
const truth = (rows: string[][], word: Status) => rows.reduce((sum, row) => sum + row.slice(5).filter(cell => cell === word).length, 0);

async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenant]);
    for (const table of ["pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [tenant]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenant]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [tenant]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenant]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'trk-%'");
}

type Caller = ReturnType<typeof callerFor>;
async function upload(caller: Caller, fileName: string, bytes: Uint8Array, at = scope) {
  const target = await caller.smartImport.createUpload({ ...at, fileName });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return target;
}
async function importTracker(caller: Caller, fileName: string, bytes: Uint8Array) {
  const target = await upload(caller, fileName, bytes);
  const analysis = await caller.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName });
  return { target, analysis, confirm: () => caller.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName, kind: "unitMatrix", forced: {} as never, approvedHash: analysis.matrixPlan!.fileHash }) };
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the site's unit tracker through the smart import box (D-44 b)", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('trk-manager','Manager','trk-manager@tracker.example.test','user'),('trk-reader','Reader','trk-reader@tracker.example.test','user'),('trk-stranger','Stranger','trk-stranger@tracker.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'trk-%'");
    for (const key of ["manager", "reader", "stranger"] as const) users[key] = rows.find(r => r.openId === `trk-${key}`)!.id;
    for (const [tenant, slug] of [[T, "tracker-tenant"], [T2, "tracker-other"]] as const) {
      await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, ?, ?)", [tenant, slug, slug]);
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`${slug}-sub`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`${slug}-ent`, tenant, `${slug}-sub`]);
    }
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'TRK-A', 'Tracker project', 'villas', 'SAR', 'active')", [P, T]);
    for (const c of ["project.read", "project.wbs.manage", "project.pmc.read", "project.pmc.update", "project.pmc.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [c, c]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('trk-r-manager', ?, 'TRK_MANAGER','Manager','PROJECT'), ('trk-r-reader', ?, 'TRK_READER','Reader','PROJECT'), ('trk-r-stranger', ?, 'TRK_STRANGER','Stranger','PROJECT')", [T, T, T2]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'trk-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read','project.pmc.update','project.pmc.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'trk-r-reader', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'trk-r-stranger', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.pmc.read','project.pmc.update','project.pmc.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('trk-m-manager', ?, ?, 'active'), ('trk-m-reader', ?, ?, 'active'), ('trk-m-stranger', ?, ?, 'active')", [T, users.manager, T, users.reader, T2, users.stranger]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('trk-mr-manager','trk-m-manager','trk-r-manager','company'),('trk-mr-reader','trk-m-reader','trk-r-reader','company'),('trk-mr-stranger','trk-m-stranger','trk-r-stranger','company')");
    // the catalogue the tracker is matched against (in a real project it comes from the weighted matrix): both models, six activities each, 100% in all
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES ('trk-g1', ?, ?, 'G01', 'Structure')", [T, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES ('trk-s1', ?, ?, 'trk-g1', 'D01', 'Structure')", [T, P]);
    for (const model of MODELS) for (const [a, name] of ACTIVITIES.entries()) await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (UUID(), ?, ?, 'trk-g1', 'trk-s1', ?, ?, ?, ?)", [T, P, model, `ACT-${a + 1}`, name.toUpperCase(), a < 4 ? 16.6667 : 16.6666]);
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("recognises 1,230 villas (merged phase and block cells filled), writes nothing until approved, then stores every status once", async () => {
    const manager = callerFor(users.manager, "trk-manager");
    const file = await trackerWorkbook();
    const run = await importTracker(manager, "tracker-1.xlsx", file.bytes);
    expect(run.analysis.understanding.kind).toBe("unitMatrix");
    const plan = run.analysis.matrixPlan!;
    expect(plan.errors).toEqual([]);
    expect(plan.summary).toMatchObject({ shape: "tracker", units: VILLAS, activities: ACTIVITIES.length, zones: ["PH1", "PH2", "PH3"], blocks: 41 });
    expect(plan.changes).toMatchObject({ newUnits: VILLAS, newZones: 3, newBlocks: 41, completing: truth(file.rows, "Completed"), regressed: 0 });
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [T])).toBe(0);

    const confirmed = await run.confirm();
    expect(confirmed).toMatchObject({ status: "completed", module: "pmcMatrix", rowsSent: VILLAS });
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(VILLAS);
    expect(await n("SELECT COUNT(DISTINCT villaLabel) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(VILLAS);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_blocks WHERE tenantId = ?", [T])).toBe(41);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND status = 'COMPLETE'", [T])).toBe(truth(file.rows, "Completed"));
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND status = 'IN_PROGRESS'", [T])).toBe(truth(file.rows, "On going"));
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ?", [T])).toBe(truth(file.rows, "Completed") + truth(file.rows, "On going"));
    // the merged cells were filled before reading, and the import says so
    expect(await n("SELECT mergedCellsFilled AS n FROM data_import_sources WHERE importId = ?", [confirmed.importId])).toBeGreaterThan(VILLAS);
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.tracker_import_confirmed'", [T])).toBe(1);
  }, 300_000);

  it("the next tracker updates without duplicating: same 1,230 villas, more cells complete, a complete cell is never taken back; the same file twice is refused", async () => {
    const manager = callerFor(users.manager, "trk-manager");
    const doneCell = Array.from({ length: VILLAS }, (_v, i) => i + 1).find(villa => baseStatus(villa, 0) === "Completed")!;
    const next = (villa: number, a: number) => (villa === doneCell && a === 0 ? "On going" : villa <= 100 && baseStatus(villa, a) === "On going" ? "Completed" : baseStatus(villa, a));
    const file = await trackerWorkbook(next);
    const moved = Array.from({ length: 100 }, (_v, i) => i + 1).reduce((sum, villa) => sum + ACTIVITIES.filter((_a, a) => baseStatus(villa, a) === "On going").length, 0);
    const run = await importTracker(manager, "tracker-2.xlsx", file.bytes);
    expect(run.analysis.matrixPlan!.changes).toMatchObject({ newUnits: 0, newZones: 0, newBlocks: 0, completing: moved, regressed: 1 });
    await run.confirm();
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(VILLAS);
    const first = await trackerWorkbook();
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND status = 'COMPLETE'", [T])).toBe(truth(first.rows, "Completed") + moved);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress p INNER JOIN pmc_units u ON u.id = p.unitId INNER JOIN pmc_activity_definitions d ON d.id = p.activityDefinitionId WHERE p.tenantId = ? AND u.villaLabel = ? AND d.code = 'ACT-1' AND p.status = 'COMPLETE'", [T, String(1000 + doneCell)])).toBe(1);
    // exactly the same bytes again: refused, nothing written
    const again = await importTracker(manager, "tracker-2-again.xlsx", file.bytes);
    expect(await code(again.confirm())).toBe("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.tracker_import_confirmed'", [T])).toBe(2);
  }, 300_000);

  it("a file with deliberate errors is refused whole, with the row and the reason of each; nothing is written", async () => {
    const manager = callerFor(users.manager, "trk-manager");
    const file = await trackerWorkbook(baseStatus, rows => { rows[9][3] = rows[8][3]; rows[19][4] = "MDL-Z"; rows[29][6] = "Half done"; });
    const before = { progress: await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_history WHERE tenantId = ?", [T]), imports: await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [T]) };
    const run = await importTracker(manager, "tracker-bad.xlsx", file.bytes);
    const errors = run.analysis.matrixPlan!.errors.map(error => ({ rowNumber: error.rowNumber, code: error.code }));
    // the data starts on sheet row 3 (a title, then the header), so villa i sits on row i + 2
    expect(errors).toEqual(expect.arrayContaining([{ rowNumber: 12, code: "TRACKER_VILLA_DUPLICATE" }, { rowNumber: 22, code: "TRACKER_MODEL_UNKNOWN" }, { rowNumber: 32, code: "TRACKER_STATUS_UNKNOWN" }]));
    expect(run.analysis.matrixPlan!.canConfirm).toBe(false);
    expect(await code(run.confirm())).toBe("PROJECT_OS_IMPORT_VALIDATION_FAILED");
    expect(await n("SELECT COUNT(*) AS n FROM pmc_unit_activity_history WHERE tenantId = ?", [T])).toBe(before.progress);
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [T])).toBe(before.imports);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(VILLAS);
  }, 300_000);

  it("refused: a reader without PMC management, and a user of another company; nothing is written", async () => {
    const reader = callerFor(users.reader, "trk-reader");
    const stranger = callerFor(users.stranger, "trk-stranger");
    const file = await trackerWorkbook((villa, a) => (villa < 50 ? "Completed" : baseStatus(villa, a)));
    const target = await upload(reader, "tracker-reader.xlsx", file.bytes);
    expect(await code(reader.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "tracker-reader.xlsx" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(reader.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "tracker-reader.xlsx", kind: "unitMatrix", forced: {} as never }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(stranger.smartImport.createUpload({ ...scope, fileName: "x.xlsx" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(stranger.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "tracker-reader.xlsx" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.tracker_import_confirmed'", [T])).toBe(2);
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T2])).toBe(0);
  }, 300_000);

  it("a small tracker (the 500 found in test): 1 villa is analysed as a tracker; 2 rows that are not one, with the tracker chosen, are refused with a translated code", async () => {
    const manager = callerFor(users.manager, "trk-manager");
    const one = await trackerWorkbook(baseStatus, rows => rows.splice(1));
    const run = await importTracker(manager, "tracker-one.xlsx", one.bytes);
    expect(run.analysis.understanding.kind).toBe("unitMatrix");
    expect(run.analysis.matrixPlan!.summary).toMatchObject({ shape: "tracker", units: 1 });
    expect(run.analysis.matrixPlan!.errors).toEqual([]);
    const two = await trackerWorkbook(() => "Half done", rows => rows.splice(2));
    const target = await upload(manager, "tracker-two.xlsx", two.bytes);
    expect(await code(manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "tracker-two.xlsx", kind: "unitMatrix" }))).toBe("PROJECT_OS_SMART_IMPORT_KIND_NOT_DETECTED");
    expect(projectErrorMessages.PROJECT_OS_SMART_IMPORT_KIND_NOT_DETECTED.ar).toContain("لم يُكتب شيء");
    expect(await code(manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "tracker-two.xlsx", kind: "unitMatrix", forced: {} as never, approvedHash: "0".repeat(64) }))).toBe("PROJECT_OS_MATRIX_NOT_RECOGNISED");
    expect(await n("SELECT COUNT(*) AS n FROM pmc_units WHERE tenantId = ?", [T])).toBe(VILLAS);
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.tracker_import_confirmed'", [T])).toBe(2);
  }, 300_000);
});
