import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import ExcelJS from "exceljs";
import { appRouter } from "./routers";
import { MAX_DIRECT_UPLOAD_BYTES } from "./storage";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { seedOutsiderTenant } from "./testing/p6Isolation";

// Work order 7, export → edit → re-import on a real database: ids and versions in the export, the differences preview, the stale-version refusal, the approval hash, and who may do what.
// Synthetic fixtures only.
const T = "79100000-0000-4000-8000-0000000000a1";
const T2 = "79100000-0000-4000-8000-0000000000b1";
const P = "79100000-0000-4000-8000-0000000000a2";
const P2 = "79100000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { importer: 0, reader: 0, outsider: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@jobs.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };


async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenant]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'icy-%'");
}

type Caller = ReturnType<typeof callerFor>;
/** What the browser does: ask for the URL, PUT the bytes to it (a real HTTP PUT), register the upload, and wait for the analysis job. */
async function uploadWbs(caller: Caller, bytes: Buffer, name: string) {
  const target = await caller.dataImports.createUpload({ ...scope, moduleCode: "wbs", fileName: name, sourceFormat: "xlsx" });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const registered = await caller.dataImports.registerUpload({ ...scope, moduleCode: "wbs", fileName: name, sourceFormat: "xlsx", uploadKey: target.uploadKey, duplicateMode: "upsert" });
  const deadline = Date.now() + 60_000;
  for (;;) {
    const view = await caller.dataImports.progress({ ...scope, importId: registered.id });
    if (view.status !== "analyzing") return { id: registered.id, status: view.status };
    if (Date.now() > deadline) throw new Error("analysis did not finish");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const exportWbs = async (caller: Caller) => Buffer.from((await caller.dataImports.export({ ...scope, moduleCode: "wbs", format: "xlsx", locale: "en" })).base64, "base64");
async function editCell(bytes: Buffer, row: number, column: number, value: ExcelJS.CellValue) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  workbook.worksheets[0]!.getCell(row, column).value = value;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
const wbsRow = async (code: string) => (await connection.query<any[]>("SELECT name, plannedValue, updatedAt FROM wbs_items WHERE tenantId = ? AND code = ?", [T, code]))[0][0];

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("export → edit → re-import on a real database", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('icy-importer','Importer','icy-importer@cycle.example.test','user'),('icy-reader','Reader','icy-reader@cycle.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'icy-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.importer = idOf("icy-importer"); users.reader = idOf("icy-reader");
    // 7.4 (D-25): the other company, really another company with its own project, and a user there who holds every WBS permission THERE
    users.outsider = await seedOutsiderTenant(connection, { tenantId: T2, projectId: P2, prefix: "icy" });
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'cycle-tenant', 'cycle-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'CY-A', 'Cycle project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('icy-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('icy-ent', ?, 'icy-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.wbs.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('icy-r-importer', ?, 'ICY_IMPORTER','Importer','PROJECT'), ('icy-r-reader', ?, 'ICY_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'icy-r-importer', id FROM permissions WHERE code IN ('project.read','project.wbs.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'icy-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('icy-m-importer', ?, ?, 'active'), ('icy-m-reader', ?, ?, 'active')", [T, users.importer, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('icy-mr-importer','icy-m-importer','icy-r-importer','company'),('icy-mr-reader','icy-m-reader','icy-r-reader','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('icy-w1', ?, ?, '1.1', 'Site setup', 1000), ('icy-w2', ?, ?, '1.2', 'Excavation', 2500.5), ('icy-w3', ?, ?, '1.3', 'Piling', 4000)", [T, P, T, P, T, P]);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("NEGATIVE (7.4): a user of ANOTHER company, who may manage the WBS in his own, can neither export nor start an import in this project", async () => {
    const outsider = callerFor(users.outsider, "icy-outsider");
    await expect(outsider.dataImports.export({ ...scope, moduleCode: "wbs", format: "xlsx", locale: "en" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(outsider.dataImports.createUpload({ ...scope, moduleCode: "wbs", fileName: "wbs.xlsx", sourceFormat: "xlsx" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    // naming his own company with this project's id does not reach it either
    await expect(outsider.dataImports.export({ tenantId: T2, projectId: P, moduleCode: "wbs", format: "xlsx", locale: "en" })).rejects.toThrow(/PROJECT_OS_/);
    // and his own project is his to export: the refusal above is about the company, not about his permission
    const own = await outsider.dataImports.export({ tenantId: T2, projectId: P2, moduleCode: "wbs", format: "xlsx", locale: "en" });
    expect(own.fileName).toMatch(/\.xlsx$/);
  });

  it("a reader may export (read only) but may not preview or confirm an import", async () => {
    const reader = callerFor(users.reader, "icy-reader");
    expect((await exportWbs(reader)).length).toBeGreaterThan(0); // X-5: exporting needs no write permission
    const importer = callerFor(users.importer, "icy-importer");
    const uploaded = await uploadWbs(importer, await editCell(await exportWbs(importer), 2, 2, "Site setup (reader case)"), "wbs-export.xlsx"); // a different file from the one the next case uploads: an identical file is refused as already imported
    await expect(reader.dataImports.diff({ ...scope, importId: uploaded.id })).rejects.toThrow();
    await expect(reader.dataImports.confirm({ ...scope, importId: uploaded.id })).rejects.toThrow();
  });

  it("export then re-import with no edit shows zero changes and writes nothing; one edited cell shows exactly one change; the approved hash applies it", async () => {
    const importer = callerFor(users.importer, "icy-importer");
    const exported = await exportWbs(importer);
    const before = await wbsRow("1.1");

    const untouched = await uploadWbs(importer, exported, "untouched.xlsx");
    expect(untouched.status).toBe("validated");
    const noChange = await importer.dataImports.diff({ ...scope, importId: untouched.id });
    expect(noChange).toMatchObject({ supported: true, summary: { new: 0, modified: 0, unchanged: 3, conflict: 0, missing: 0 } });
    await importer.dataImports.confirm({ ...scope, importId: untouched.id, approvedDiffHash: noChange.supported ? noChange.diffHash : undefined });
    expect((await wbsRow("1.1")).updatedAt).toEqual(before.updatedAt); // an unchanged row is not rewritten, so its version does not move

    const edited = await uploadWbs(importer, await editCell(exported, 3, 3, 3100), "edited.xlsx"); // row 3 = code 1.2, column 3 = planned value
    const preview = await importer.dataImports.diff({ ...scope, importId: edited.id });
    expect(preview).toMatchObject({ supported: true, summary: { modified: 1, unchanged: 2, conflict: 0 } });
    if (!preview.supported) throw new Error("diff unsupported");
    expect(preview.entries).toEqual([expect.objectContaining({ key: "1.2", kind: "modified", changes: [{ field: "plannedValue", oldValue: "2500.50", newValue: "3100.00" }] })]);

    await expect(importer.dataImports.confirm({ ...scope, importId: edited.id, approvedDiffHash: "0".repeat(64) })).rejects.toThrow("PROJECT_OS_IMPORT_DIFF_CHANGED");
    expect(Number((await wbsRow("1.2")).plannedValue)).toBe(2500.5); // refused: nothing written
    await expect(importer.dataImports.confirm({ ...scope, importId: edited.id, approvedDiffHash: preview.diffHash })).resolves.toMatchObject({ status: "completed", updatedRows: 1, skippedRows: 2, createdRows: 0 });
    expect(Number((await wbsRow("1.2")).plannedValue)).toBe(3100);
    const [audit] = await connection.query<{ action: string }[]>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ? ORDER BY createdAt", [T, edited.id]);
    expect(audit.map(row => row.action)).toEqual(["data_import_uploaded", "data_import_completed"]);
  });

  it("a file exported before the platform changed a row is refused with a conflict, and nothing is overwritten", async () => {
    const importer = callerFor(users.importer, "icy-importer");
    const stale = await exportWbs(importer);
    await connection.query("UPDATE wbs_items SET name = 'Piling (revised in platform)' WHERE tenantId = ? AND code = '1.3'", [T]); // newer work, after the export
    const staleEdit = await uploadWbs(importer, await editCell(stale, 4, 2, "Piling (edited in Excel)"), "stale.xlsx");
    const preview = await importer.dataImports.diff({ ...scope, importId: staleEdit.id });
    expect(preview).toMatchObject({ supported: true, summary: { conflict: 1 } });
    await expect(importer.dataImports.confirm({ ...scope, importId: staleEdit.id })).rejects.toThrow("PROJECT_OS_IMPORT_VERSION_CONFLICT");
    expect((await wbsRow("1.3")).name).toBe("Piling (revised in platform)");
  });

  it("the server generates the blank template of a module, with an example row the importer accepts", async () => {
    const importer = callerFor(users.importer, "icy-importer");
    const template = await importer.dataImports.template({ moduleCode: "wbs", locale: "en" });
    const uploaded = await uploadWbs(importer, Buffer.from(template.base64, "base64"), "template.xlsx");
    expect(uploaded.status).toBe("validated");
  });

  it("a 20,000-row export re-imports through the background job with zero changes, and one edited cell is exactly one change", async () => {
    await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [T]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) SELECT 'icy-bulk-' || g, ?, ?, 'B-' || LPAD(g::text, 5, '0'), 'Package ' || g, g FROM generate_series(1, 20000) AS g", [T, P]);
    const importer = callerFor(users.importer, "icy-importer");
    const exported = await exportWbs(importer);
    const started = Date.now();
    const untouched = await uploadWbs(importer, exported, "bulk-untouched.xlsx");
    expect(untouched.status).toBe("validated");
    const same = await importer.dataImports.diff({ ...scope, importId: untouched.id });
    expect(same).toMatchObject({ supported: true, summary: { new: 0, modified: 0, unchanged: 20000, conflict: 0, missing: 0 }, entries: [] });
    const edited = await uploadWbs(importer, await editCell(exported, 12_000, 2, "Edited in Excel"), "bulk-edited.xlsx");
    const one = await importer.dataImports.diff({ ...scope, importId: edited.id });
    expect(one).toMatchObject({ supported: true, summary: { new: 0, modified: 1, unchanged: 19999, conflict: 0 } });
    expect(Date.now() - started).toBeLessThan(120_000);
  }, 180_000);
});
