import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { buildProjectWorkbook, FIRST_DATA_ROW, projectWorkbookSheets } from "./domain/projectWorkbook";

// Q-51 batch 3 on a real database, as the restricted role (setup as in the batch 2a test). Synthetic data only.
const SLUG = "q51-workbook-filled";
const P = "51c00000-0000-4000-8000-000000000001";
const OTHER_P = "51c00000-0000-4000-8000-000000000002";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "outsider"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const caller = (key: (typeof KEYS)[number]) => appRouter.createCaller({ user: { id: ids[key], openId: `q51f-${key}`, name: `Q51 ${key}`, email: `q51f-${key}@q51.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
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
/** As the screen does: preview, then save the very file previewed with its fingerprint. */
const previewThenApply = async (key: (typeof KEYS)[number], fileBase64: string) => {
  const preview = await caller(key).dataImports.projectWorkbookPreview({ tenantId, projectId: P, fileBase64 });
  return caller(key).dataImports.projectWorkbookApply({ tenantId, projectId: P, fileBase64, approvedHash: preview.fileHash });
};
const byKey = (result: { sheets: Array<{ key: string }> }) => Object.fromEntries(result.sheets.map(sheet => [sheet.key, sheet]));

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["audit_logs", "pmc_inspection_request_units", "pmc_inspection_steps", "pmc_inspection_requests", "pmc_plan_months", "pmc_baselines", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "evm_snapshots"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q51f-%'");
}


// Q-51 batch 3: the workbook downloaded pre-filled is exactly what the project holds — uploading it unchanged changes nothing.
const ROUND = {
  models: [{ modelCode: "A" }, { modelCode: "B" }],
  units: [{ zoneCode: "Z1", blockCode: "B1", unitNumber: 101, modelCode: "A" }, { zoneCode: "Z1", blockCode: "B2", unitNumber: 102, modelCode: "B" }],
  activities: [
    { modelCode: "A", groupCode: "STR", stageCode: "S1", activityCode: "A-01", activityName: "صب الأسقف", weightPercent: 60 },
    { modelCode: "A", groupCode: "FIN", stageCode: "S2", activityCode: "A-02", activityName: "الدهان", weightPercent: 40 },
    { modelCode: "B", groupCode: "STR", stageCode: "S1", activityCode: "B-01", activityName: "صب الأسقف", weightPercent: 100 },
  ],
};
async function readFilled(base64: string, locale: "ar" | "en" = "ar") {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(base64, "base64") as unknown as ArrayBuffer);
  const out: Record<string, Array<Record<string, string>>> = {};
  for (const key of ["models", "units", "activities"]) {
    const sheet = spec(key); const ws = book.getWorksheet(sheet[locale])!; out[key] = [];
    for (let row = FIRST_DATA_ROW; row <= ws.rowCount; row++) {
      const cells = Object.fromEntries(sheet.columns.map((column, col) => [column.key, String(ws.getCell(row, col + 2).value ?? "")]));
      if (Object.values(cells).some(Boolean)) out[key].push(cells);
    }
  }
  return out;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-51 batch 3: the project workbook pre-filled with what the project holds", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q51f-${key}`, `Q51F ${key}`, `q51f-${key}@q51f.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q51f-%'");
    for (const key of KEYS) ids[key] = (rows as Array<{ id: number; openId: string }>).find(row => row.openId === `q51f-${key}`)!.id;
    ({ tenantId } = await caller("owner").tenant.create({ legalName: "Q51F Workbook Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await caller("outsider").tenant.create({ legalName: "Q51F Other Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q51F-W', 'Workbook', 'villas', 'SAR', 'active'), (?, ?, 'Q51F-X', 'Other', 'villas', 'SAR', 'active')", [P, tenantId, OTHER_P, tenantId]);
    // this project's data, entered through the workbook itself; a second project of the same company holds a unit that must never appear
    const applied = byKey(await previewThenApply("owner", await workbook(ROUND)));
    for (const key of ["units", "activities"]) expect(applied[key], key).toMatchObject({ status: "applied" });
    const otherFile = await workbook({ models: [{ modelCode: "X" }], units: [{ blockCode: "BX", unitNumber: 999, modelCode: "X" }] });
    const otherPreview = await caller("owner").dataImports.projectWorkbookPreview({ tenantId, projectId: OTHER_P, fileBase64: otherFile });
    await caller("owner").dataImports.projectWorkbookApply({ tenantId, projectId: OTHER_P, fileBase64: otherFile, approvedHash: otherPreview.fileHash });
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the filled workbook holds this project's models, units and activities (never another project's), and uploading it unchanged previews as all unchanged", async () => {
    const filled = await caller("owner").dataImports.projectWorkbookFilled({ tenantId, projectId: P, locale: "ar" });
    expect(filled.fileName).toMatch(/-filled\.xlsx$/);
    const read = await readFilled(filled.base64);
    expect(read.models.map(row => row.modelCode)).toEqual(["A", "B"]);
    expect(read.units.map(row => [row.zoneCode, row.blockCode, row.unitNumber, row.modelCode])).toEqual([["Z1", "B1", "101", "A"], ["Z1", "B2", "102", "B"]]);
    expect(read.activities.map(row => [row.modelCode, row.groupCode, row.stageCode, row.activityCode, row.activityName, Number(row.weightPercent)])).toEqual([
      ["A", "STR", "S1", "A-01", "صب الأسقف", 60], ["A", "FIN", "S2", "A-02", "الدهان", 40], ["B", "STR", "S1", "B-01", "صب الأسقف", 100],
    ]);
    expect(JSON.stringify(read)).not.toContain("999");
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'data_export_generated' AND entityId = ?", [tenantId, P]);
    expect((audit as Array<{ metadata: string }>).map(row => JSON.parse(row.metadata))).toEqual([{ export: "project_workbook_filled", locale: "ar", models: 2, units: 2, activities: 3 }]);
    const preview = byKey(await caller("owner").dataImports.projectWorkbookPreview({ tenantId, projectId: P, fileBase64: filled.base64 }));
    for (const key of ["units", "activities"]) expect(preview[key], key).toMatchObject({ status: "will_apply", errors: [], counts: { create: 0, update: 0 } });
    for (const key of ["baseline", "status", "requests", "budget", "boq"]) expect(preview[key].status, key).toBe("empty");
  });

  it("NEGATIVE: another company cannot download this project's filled workbook, and an empty project's filled workbook holds no rows", async () => {
    await expect(caller("outsider").dataImports.projectWorkbookFilled({ tenantId, projectId: P, locale: "en" })).rejects.toThrow();
    const [[refused]] = await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = 'data_export_generated' AND actorUserId = ?", [tenantId, ids.outsider]);
    expect(Number(refused.n)).toBe(0); // a refused download takes nothing out and records nothing
    const empty = "51c00000-0000-4000-8000-000000000003";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q51F-E', 'Empty', 'villas', 'SAR', 'active')", [empty, tenantId]);
    const filled = await caller("owner").dataImports.projectWorkbookFilled({ tenantId, projectId: empty, locale: "en" });
    const read = await readFilled(filled.base64, "en");
    expect([read.models, read.units, read.activities]).toEqual([[], [], []]);
  });
  it("review of #534 — an activity linked to a WBS item: the filled workbook carries its WBS code, and uploading it unchanged keeps the link (previews 0 updates, saves nothing changed)", async () => {
    const wbsId = "51c00000-0000-4000-8000-0000000000aa";
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'W-1', 'WBS item (synthetic)')", [wbsId, tenantId, P]);
    await connection.query("UPDATE pmc_activity_definitions SET wbsItemId = ? WHERE tenantId = ? AND projectId = ? AND code = 'A-01'", [wbsId, tenantId, P]);
    try {
      const filled = await caller("owner").dataImports.projectWorkbookFilled({ tenantId, projectId: P, locale: "ar" });
      const read = await readFilled(filled.base64);
      expect(read.activities.find(row => row.activityCode === "A-01")?.wbsCode).toBe("W-1");
      expect(read.activities.filter(row => row.activityCode !== "A-01").every(row => row.wbsCode === "")).toBe(true); // no link: an empty cell, as stored
      const preview = byKey(await caller("owner").dataImports.projectWorkbookPreview({ tenantId, projectId: P, fileBase64: filled.base64 }));
      expect(preview.activities).toMatchObject({ status: "will_apply", errors: [], counts: { create: 0, update: 0 } });
      await previewThenApply("owner", filled.base64);
      const [[row]] = await connection.query<{ wbsItemId: string | null }[]>("SELECT wbsItemId FROM pmc_activity_definitions WHERE tenantId = ? AND projectId = ? AND code = 'A-01'", [tenantId, P]);
      expect(row.wbsItemId).toBe(wbsId);
    } finally {
      await connection.query("UPDATE pmc_activity_definitions SET wbsItemId = NULL WHERE tenantId = ? AND projectId = ?", [tenantId, P]);
      await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbsId]);
    }
  });
});
