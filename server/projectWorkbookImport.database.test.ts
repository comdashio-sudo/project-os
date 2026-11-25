import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { ENV } from "./_core/env";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { buildProjectWorkbook, FIRST_DATA_ROW, projectWorkbookSheets } from "./domain/projectWorkbook";

// Q-51 batch 2a on a real database, as the restricted role: a company fills the workbook's PMC sheets and uploads it once — units, activities and
// weights, baseline, current progress and past requests are written in order, one transaction per sheet; uploading again updates (no duplicate); a
// sheet with an error writes nothing and says where; another company cannot apply into this project. Synthetic data only.
const SLUG = "q51-workbook-import";
const P = "51b00000-0000-4000-8000-000000000001";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "outsider"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const caller = (key: (typeof KEYS)[number]) => appRouter.createCaller({ user: { id: ids[key], openId: `q51-${key}`, name: `Q51 ${key}`, email: `q51-${key}@q51.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
let connection: fixtureDb.Connection; let tenantId = ""; let s3: FakeS3;
const sheets = projectWorkbookSheets(); const spec = (key: string) => sheets.find(sheet => sheet.key === key)!;
async function workbook(fill: Record<string, Array<Record<string, string | number>>>) {
  const book = new ExcelJS.Workbook(); await book.xlsx.load((await buildProjectWorkbook({ locale: "ar" })).bytes as unknown as ArrayBuffer);
  for (const [key, rows] of Object.entries(fill)) {
    const sheet = spec(key); const ws = book.getWorksheet(sheet.ar)!;
    rows.forEach((row, index) => sheet.columns.forEach((column, col) => { if (row[column.key] !== undefined) ws.getCell(FIRST_DATA_ROW + index, col + 2).value = row[column.key]; }));
  }
  return Buffer.from(await book.xlsx.writeBuffer()).toString("base64");
}
const count = async (table: string) => Number(((await connection.query<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenantId = ? AND projectId = ?`, [tenantId, P]))[0] as Array<{ n: number }>)[0].n);
const byKey = (result: { sheets: Array<{ key: string }> }) => Object.fromEntries(result.sheets.map(sheet => [sheet.key, sheet]));

const FULL = {
  models: [{ modelCode: "A" }, { modelCode: "B" }],
  units: [{ blockCode: "B1", unitNumber: 101, modelCode: "A" }, { blockCode: "B1", unitNumber: 102, modelCode: "B" }],
  activities: [
    { modelCode: "A", groupCode: "STR", stageCode: "S1", activityCode: "A-01", activityName: "صب الأسقف", weightPercent: 60 },
    { modelCode: "A", groupCode: "FIN", stageCode: "S2", activityCode: "A-02", activityName: "الدهان", weightPercent: 40 },
    { modelCode: "B", groupCode: "STR", stageCode: "S1", activityCode: "B-01", activityName: "صب الأسقف", weightPercent: 100 },
  ],
  baseline: [{ modelCode: "A", activityCode: "A-01", startDate: "2027-01-01", endDate: "2027-03-31" }],
  status: [{ unitNumber: 101, activityCode: "A-01", status: "IN_PROGRESS" }],
  requests: [{ requestCode: "WIR-Q51-1", activityCode: "A-01", unitNumbers: "101", requestedAt: "2027-01-10" }],
};
// batch 2b: the other sheets, through their own importers
const OTHERS = {
  project: [{ code: "Q51-W", name: "Workbook", contractValue: 25000000, currency: "SAR", plannedStartAt: "2027-01-01", plannedFinishAt: "2028-06-30" }],
  boq: [{ code: "BOQ-Q51-1", description: "Excavation (synthetic)", unitOfMeasure: "m3", quantity: 1200, unitRate: 18.5 }],
  budget: [{ costCode: "Q51-CIVIL", originalAmount: 500000, currentAmount: 525000 }],
  contracts: [{ code: "Q51-CON-1", title: "Civil works (synthetic)", counterparty: "Contractor (synthetic)", contractValue: 2500000, currency: "SAR" }],
  materials: [{ code: "Q51-MAT-1", description: "Concrete (synthetic)", unitOfMeasure: "m3", category: "Concrete" }],
  stock: [{ warehouseCode: "Q51-WH", materialCode: "Q51-MAT-1", quantity: 120, unitCost: 310 }],
  team: [{ email: "engineer@q51.example.test", roleCode: "SITE_ENGINEER", scope: "project", name: "Engineer (synthetic)" }],
};

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["warehouse_inventory_transactions", "project_warehouses", "project_material_overrides", "material_masters", "contracts", "budget_lines", "boq_items", "data_import_row_results", "data_import_errors", "data_imports", "membership_invitations", "audit_logs", "pmc_inspection_request_units", "pmc_inspection_steps", "pmc_inspection_requests", "pmc_plan_months", "pmc_baselines", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "evm_snapshots"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q51-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-51 batch 2a: applying the project workbook's PMC sheets", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q51-${key}`, `Q51 ${key}`, `q51-${key}@q51.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q51-%'");
    for (const key of KEYS) ids[key] = (rows as Array<{ id: number; openId: string }>).find(row => row.openId === `q51-${key}`)!.id;
    ({ tenantId } = await caller("owner").tenant.create({ legalName: "Q51 Workbook Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await caller("outsider").tenant.create({ legalName: "Q51 Other Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q51-W', 'Workbook', 'villas', 'SAR', 'active')", [P, tenantId]);
    await caller("owner").warehouses.create({ tenantId, projectId: P, code: "Q51-WH", name: "Store (synthetic)" }); // no sheet makes a warehouse: the screens do
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } await s3?.close(); });

  it("POSITIVE: one upload writes the PMC sheets in order; the same upload again updates and duplicates nothing", async () => {
    const file = await workbook(FULL);
    const first = byKey(await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: file }));
    for (const key of ["units", "activities", "baseline", "status", "requests"]) expect(first[key], key).toMatchObject({ status: "applied", errors: [] });
    expect(first.units).toMatchObject({ counts: { create: 2, update: 0 } });
    expect(first.models).toMatchObject({ status: "feeds_other_sheets" }); // its models are read through the units and activities sheets
    expect(first.budget).toMatchObject({ status: "empty" });
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")]).toEqual([2, 3, 1]);
    const again = byKey(await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: file }));
    expect(again.units).toMatchObject({ status: "applied", counts: { create: 0, update: 0, unchanged: 2 } });
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")]).toEqual([2, 3, 1]);
  });

  it("NEGATIVE: a sheet with an error writes nothing and says where (sheet, row, field); the sound sheets are applied; a composite key left half-empty is refused before any write", async () => {
    const before = await count("pmc_inspection_requests");
    const result = byKey(await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: await workbook({
      ...FULL,
      requests: [{ requestCode: "WIR-Q51-2", activityCode: "A-01", unitNumbers: "999", requestedAt: "2027-02-10" }], // a villa the project does not have
      status: [{ unitNumber: 101, status: "COMPLETE" }], // the activity part of the key is missing
    }) }));
    expect(result.units).toMatchObject({ status: "applied" });
    expect(result.requests).toMatchObject({ status: "refused" });
    expect(result.requests.errors[0]).toMatchObject({ sheet: "requests", rowNumber: FIRST_DATA_ROW, code: "PMC_UNIT_NOT_FOUND" });
    expect(result.status).toMatchObject({ status: "refused", errors: [{ sheet: "status", row: FIRST_DATA_ROW, field: "activityCode", code: "WORKBOOK_KEY_MISSING" }] });
    expect(await count("pmc_inspection_requests")).toBe(before);
  });

  it("NEGATIVE: a file that is not a Dashio workbook is refused; another company cannot apply into this project", async () => {
    const plain = new ExcelJS.Workbook(); plain.addWorksheet("Sheet1").addRow(["x"]);
    await expect(caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: Buffer.from(await plain.xlsx.writeBuffer()).toString("base64") })).rejects.toThrow("PROJECT_OS_WORKBOOK_NOT_RECOGNISED");
    const units = await count("pmc_units");
    await expect(caller("outsider").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: await workbook(FULL) })).rejects.toThrow();
    expect(await count("pmc_units")).toBe(units);
  });
  it("Q-51 batch 2b POSITIVE: project data, BOQ, budget, contracts, materials and opening stock go through their own importers; the team is only listed; a second upload duplicates nothing", async () => {
    const file = await workbook({ ...FULL, ...OTHERS });
    const first = byKey(await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: file }));
    for (const key of ["project", "boq", "budget", "contracts", "materials", "stock"]) expect(first[key], key).toMatchObject({ status: "applied", errors: [] });
    expect(first.team).toMatchObject({ status: "awaiting_confirmation", rows: 1 });
    expect(first.models).toMatchObject({ status: "feeds_other_sheets" });
    const tally = async () => [await count("budget_lines"), await count("contracts"), await count("boq_items"), Number(((await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM material_masters WHERE tenantId = ?", [tenantId]))[0] as Array<{ n: number }>)[0].n)];
    expect(await tally()).toEqual([1, 1, 1, 1]);
    // no invitation is sent from an upload
    expect(Number(((await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM membership_invitations WHERE tenantId = ?", [tenantId]))[0] as Array<{ n: number }>)[0].n)).toBe(0);
    const again = byKey(await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: await workbook({ ...FULL, ...OTHERS }) }));
    for (const key of ["budget", "contracts", "materials"]) expect(again[key], key).toMatchObject({ status: "applied" });
    expect(await tally()).toEqual([1, 1, 1, 1]);
  });

  it("Q-51 batch 2b NEGATIVE: a project row with a finish before its start, and a stock row naming a warehouse the project lacks, are refused as their sheets — the upload goes on", async () => {
    const result = byKey(await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: await workbook({
      project: [{ code: "Q51-W", name: "Workbook", contractValue: 25000000, currency: "SAR", plannedStartAt: "2028-06-30", plannedFinishAt: "2027-01-01" }],
      stock: [{ warehouseCode: "NO-SUCH-WH", materialCode: "Q51-MAT-1", quantity: 1, unitCost: 1 }],
      budget: [{ costCode: "Q51-CIVIL-2", originalAmount: 1000, currentAmount: 1000 }],
    }) }));
    expect(result.project).toMatchObject({ status: "refused", errors: [{ sheet: "project", code: "PROJECT_OS_CONTRACT_DATES_INVALID" }] });
    expect(result.stock).toMatchObject({ status: "refused" });
    expect(result.stock.errors[0]).toMatchObject({ sheet: "stock", rowNumber: FIRST_DATA_ROW, code: "IMPORT_REFERENCE_NOT_FOUND" });
    expect(result.budget).toMatchObject({ status: "applied" });
  });

});
