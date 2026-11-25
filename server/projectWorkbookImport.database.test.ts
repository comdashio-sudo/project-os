import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
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
let connection: fixtureDb.Connection; let tenantId = "";
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
/** As the screen does: preview, then save the very file previewed with its fingerprint. */
const previewThenApply = async (key: (typeof KEYS)[number], fileBase64: string) => {
  const preview = await caller(key).dataImports.projectWorkbookPreview({ tenantId, projectId: P, fileBase64 });
  return caller(key).dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64, approvedHash: preview.fileHash });
};
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

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["audit_logs", "pmc_inspection_request_units", "pmc_inspection_steps", "pmc_inspection_requests", "pmc_plan_months", "pmc_baselines", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "evm_snapshots"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
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
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q51-${key}`, `Q51 ${key}`, `q51-${key}@q51.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q51-%'");
    for (const key of KEYS) ids[key] = (rows as Array<{ id: number; openId: string }>).find(row => row.openId === `q51-${key}`)!.id;
    ({ tenantId } = await caller("owner").tenant.create({ legalName: "Q51 Workbook Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await caller("outsider").tenant.create({ legalName: "Q51 Other Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q51-W', 'Workbook', 'villas', 'SAR', 'active')", [P, tenantId]);
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("review of #527 — PREVIEW: says what each sheet would do, computed as the save would (later sheets see earlier ones), and writes nothing; the save refuses another file than the one previewed", async () => {
    const before = [await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")];
    const file = await workbook(FULL);
    const preview = await caller("owner").dataImports.projectWorkbookPreview({ tenantId, projectId: P, fileBase64: file });
    const sheets = byKey(preview);
    for (const key of ["units", "activities", "baseline", "status", "requests"]) expect(sheets[key], key).toMatchObject({ status: "will_apply", errors: [] });
    expect(sheets.units).toMatchObject({ counts: { create: 2 } });
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")]).toEqual(before); // nothing written
    // NEGATIVE: a fingerprint that is not the previewed file's is refused, and nothing is written
    await expect(caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: await workbook({ units: FULL.units }), approvedHash: preview.fileHash })).rejects.toThrow("PROJECT_OS_PMC_IMPORT_FILE_CHANGED");
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")]).toEqual(before);
  });

  it("POSITIVE: one upload writes the PMC sheets in order; the same upload again updates and duplicates nothing", async () => {
    const file = await workbook(FULL);
    const first = byKey(await previewThenApply("owner", file));
    for (const key of ["units", "activities", "baseline", "status", "requests"]) expect(first[key], key).toMatchObject({ status: "applied", errors: [] });
    expect(first.units).toMatchObject({ counts: { create: 2, update: 0 } });
    expect(first.models).toMatchObject({ status: "not_applied_yet" }); // its models are read through the units and activities sheets
    expect(first.budget).toMatchObject({ status: "empty" });
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")]).toEqual([2, 3, 1]);
    const again = byKey(await previewThenApply("owner", file));
    expect(again.units).toMatchObject({ status: "applied", counts: { create: 0, update: 0, unchanged: 2 } });
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_inspection_requests")]).toEqual([2, 3, 1]);
  });

  it("NEGATIVE: a sheet with an error writes nothing and says where (sheet, row, field); the sound sheets are applied; a composite key left half-empty is refused before any write", async () => {
    const before = await count("pmc_inspection_requests");
    const result = byKey(await previewThenApply("owner", await workbook({
      ...FULL,
      requests: [{ requestCode: "WIR-Q51-2", activityCode: "A-01", unitNumbers: "999", requestedAt: "2027-02-10" }], // a villa the project does not have
      status: [{ unitNumber: 101, status: "COMPLETE" }], // the activity part of the key is missing
    })));
    expect(result.units).toMatchObject({ status: "applied" });
    expect(result.requests).toMatchObject({ status: "refused" });
    expect(result.requests.errors[0]).toMatchObject({ sheet: "requests", rowNumber: FIRST_DATA_ROW, code: "PMC_UNIT_NOT_FOUND" });
    expect(result.status).toMatchObject({ status: "refused", errors: [{ sheet: "status", row: FIRST_DATA_ROW, field: "activityCode", code: "WORKBOOK_KEY_MISSING" }] });
    expect(await count("pmc_inspection_requests")).toBe(before);
  });

  it("NEGATIVE: a file that is not a Dashio workbook is refused; another company cannot apply into this project", async () => {
    const plain = new ExcelJS.Workbook(); plain.addWorksheet("Sheet1").addRow(["x"]);
    await expect(previewThenApply("owner", Buffer.from(await plain.xlsx.writeBuffer()).toString("base64"))).rejects.toThrow("PROJECT_OS_WORKBOOK_NOT_RECOGNISED");
    const units = await count("pmc_units");
    await expect(caller("outsider").dataImports.projectWorkbookPreview({ tenantId, projectId: P, fileBase64: await workbook(FULL) })).rejects.toThrow();
    await expect(caller("outsider").dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64: await workbook(FULL), approvedHash: "0".repeat(64) })).rejects.toThrow();
    expect(await count("pmc_units")).toBe(units);
  });
});
