import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// D-44 (b): the project's equipment list through the direct-upload import jobs (module «equipment»), on a real database, as the restricted application role.
// Synthetic list generated here; plates are made up (EQ-…).
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@eqi.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const SLUG = "eq-import";
const A = "a6000000-0000-4000-8000-000000000001";
const B = "a6000000-0000-4000-8000-000000000002";
const KEYS = ["owner", "manager", "engineer", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let s3: FakeS3;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);

/** 20 rows: 14 machines with a plate, and 6 rows of unplated items with a count (2 + 3 + 1 + 4 + 2 + 3 = 15). */
const LIST: Array<[string, number | "", string, string]> = [
  ...Array.from({ length: 14 }, (_v, i) => [["Excavator", "Loader", "Mobile crane", "Dump truck"][i % 4], "", `M-${i % 3}`, `EQ-${String(100 + i)}`] as [string, "", string, string]),
  ["Scaffold set", 2, "", ""], ["Concrete vibrator", 3, "", ""], ["Generator", 1, "100 kVA", ""], ["Water tank", 4, "", ""], ["Generator", 2, "60 kVA", ""], ["Compactor plate", 3, "", ""],
];
const UNPLATED = 15;
async function workbook(rows: Array<[string, number | string, string, string]>) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Equipment");
  sheet.addRow(["النوع", "العدد", "الطراز", "اللوحة أو المقاس"]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [id]);
    await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [id]);
    for (const table of ["data_imports", "project_equipment", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'eqi-%'");
}

type Caller = ReturnType<typeof callerFor>;
async function send(caller: Caller, name: string, bytes: Buffer, at: { tenantId: string; projectId: string }) {
  const target = await caller.dataImports.createUpload({ ...at, moduleCode: "equipment", fileName: name, sourceFormat: "xlsx" });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return caller.dataImports.registerUpload({ ...at, moduleCode: "equipment", fileName: name, sourceFormat: "xlsx", uploadKey: target.uploadKey });
}
async function settle(caller: Caller, importId: string) {
  for (const deadline = Date.now() + 60_000; ;) {
    const view = await caller.dataImports.progress({ tenantId, projectId: A, importId });
    if (view.status !== "analyzing" && view.status !== "importing") return view;
    if (Date.now() > deadline) throw new Error(`still ${view.status}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
async function importFile(caller: Caller, name: string, bytes: Buffer) {
  const registered = await send(caller, name, bytes, { tenantId, projectId: A });
  const analysed = await settle(caller, registered.id);
  return { id: registered.id, analysed, confirm: async () => { await caller.dataImports.confirm({ tenantId, projectId: A, importId: registered.id }); return settle(caller, registered.id); } };
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("equipment list import on a real database (D-44 b)", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`eqi-${key}`, `EQI ${key}`, `eqi-${key}@eqi.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'eqi-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `eqi-${key}`)!.id; callers[key] = callerFor(ids[key], `eqi-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Equipment Import Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Equipment Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'EQ-A', 'Equipment A', 'villas', 'SAR', 'active'), (?, ?, 'EQ-B', 'Equipment B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "EQI_MANAGER", name: "Project manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const field = await callers.owner.tenant.createRole({ tenantId, code: "EQI_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.read", "project.field.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } if (s3) await s3.close(); });

  it("a 20-row list imports once; the same list reordered adds nothing (one changed model is an update); the same bytes again are refused", async () => {
    const first = await importFile(callers.manager, "equipment.xlsx", await workbook(LIST));
    expect(first.analysed).toMatchObject({ status: "validated", totalRows: 20, validRows: 20 });
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ?", [tenantId])).toBe(0);
    expect(await first.confirm()).toMatchObject({ status: "completed", createdRows: 14 + UNPLATED, updatedRows: 0 });
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(14 + UNPLATED);
    const reordered = [...LIST].reverse().map(row => (row[3] === "EQ-105" ? ([row[0], row[1], "M-NEW", "eq-105"] as typeof row) : row));
    const secondBytes = await workbook(reordered);
    const second = await importFile(callers.manager, "equipment-again.xlsx", secondBytes);
    expect(await second.confirm()).toMatchObject({ status: "completed", createdRows: 0, updatedRows: 1, skippedRows: 13 + UNPLATED });
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ?", [tenantId])).toBe(14 + UNPLATED);
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ? AND plateOrSize = 'EQ-105' AND model = 'M-NEW'", [tenantId])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'project.equipment_imported'", [tenantId])).toBe(2);
    expect(await code(send(callers.manager, "equipment-copy.xlsx", secondBytes, { tenantId, projectId: A }))).toBe("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
  }, 180_000);

  it("a file with deliberate errors is refused whole with the row and the reason; nothing is written", async () => {
    const bad = await importFile(callers.manager, "equipment-bad.xlsx", await workbook([["Loader", "", "", "EQ-900"], ["", 2, "", ""], ["Loader", "", "", "eq-900"], ["Crane", 2, "", "EQ-901"], ["Pump", "two", "", ""]]));
    expect(bad.analysed).toMatchObject({ status: "uploaded", totalRows: 5 });
    const detail = await callers.manager.dataImports.detail({ tenantId, projectId: A, importId: bad.id });
    expect(detail.errors.map((error: { rowNumber: number; code: string }) => [error.rowNumber, error.code]).sort()).toEqual([[3, "IMPORT_REQUIRED_VALUE_MISSING"], [4, "IMPORT_DUPLICATE_FILE_KEY"], [5, "EQUIPMENT_COUNT_WITH_PLATE"], [6, "IMPORT_INVALID_NUMBER"]]);
    expect(await code(callers.manager.dataImports.confirm({ tenantId, projectId: A, importId: bad.id }))).toBe("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ? AND plateOrSize IN ('EQ-900', 'EQ-901')", [tenantId])).toBe(0);
  }, 120_000);

  it("refused: the site engineer (no project.manage), the manager of A on project B, and another company; nothing is written", async () => {
    const before = await count("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [tenantId]);
    const bytes = await workbook([["Roller", 1, "", "EQ-950"]]);
    expect(await code(callers.engineer.dataImports.createUpload({ tenantId, projectId: A, moduleCode: "equipment", fileName: "e.xlsx", sourceFormat: "xlsx" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(send(callers.manager, "b.xlsx", bytes, { tenantId, projectId: B }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(send(callers.otherOwner, "o.xlsx", bytes, { tenantId, projectId: A }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(send(callers.otherOwner, "o.xlsx", bytes, { tenantId: otherTenantId, projectId: A }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await count("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [tenantId])).toBe(before);
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ? AND plateOrSize = 'EQ-950'", [tenantId])).toBe(0);
  }, 120_000);
});
