import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { PMC_GUIDE_KINDS, PMC_IMPORT_GUIDE } from "../client/src/lib/pmcImportGuide";
import { LEDGER_MODULES } from "@shared/ledgerImportColumns";
import { EXPORT_LOCALES } from "@shared/exportLocale";

// Q-56 (6): «the import files did not import». Every template the platform itself hands out is imported back as it is, filled with its own example,
// through the path the screens use, on a real database, as the restricted role: the six general modules and the four operational ledgers
// (dataImports.template → direct upload → analysis), the project's base file (cash flow, bill of quantities, labour: the template → preview → save),
// and the seven PMC kinds (the example the import guide shows, written as a file → direct upload → analysis → confirm). Synthetic data only.
const SLUG = "q56-templates";
const P1 = "56c00000-0000-4000-8000-000000000001"; // the general and ledger modules, the base file
// per language, as a company works in one: a project for the PMC kinds that build on the catalogue, one for the weights table (it writes its own catalogue)
const PMC = { ar: ["56c00000-0000-4000-8000-0000000000a1", "56c00000-0000-4000-8000-0000000000a2"], en: ["56c00000-0000-4000-8000-0000000000e1", "56c00000-0000-4000-8000-0000000000e2"], ur: ["56c00000-0000-4000-8000-0000000000f1", "56c00000-0000-4000-8000-0000000000f2"] } as const;
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection; let s3: FakeS3; let tenantId = ""; let ownerId = 0;
const owner = () => appRouter.createCaller({ user: { id: ownerId, openId: "q56-templates", name: "Q56 Templates", email: "q56-templates@q56.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [id]);
    await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [id]);
    for (const table of ["data_imports", "audit_logs", "pmc_plan_months", "pmc_activity_baselines", "pmc_request_units", "pmc_requests", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_stages", "pmc_groups", "pmc_units", "pmc_blocks", "pmc_zones", "import_templates", "project_planned_labour", "boq_items", "time_entries", "employees", "purchase_orders", "cost_entries", "opening_balances", "materials", "contracts", "budget_lines", "schedule_activities", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId = 'q56-templates'");
}

type View = Awaited<ReturnType<ReturnType<typeof owner>["dataImports"]["progress"]>>;
type PmcReport = { errorCount: number; errors: Array<{ rowNumber: number; code: string; detail?: string }>; counts: { create: number; update: number; unchanged: number } };
const pmcReportOf = (view: View) => (view.external?.report as { pmc?: PmcReport } | undefined)?.pmc;
async function settle(projectId: string, importId: string): Promise<View> {
  for (const deadline = Date.now() + 60_000; ;) {
    const view = await owner().dataImports.progress({ tenantId, projectId, importId });
    if (view.status !== "analyzing" && view.status !== "importing") return view;
    if (Date.now() > deadline) throw new Error(`still ${view.status}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
async function directImport(projectId: string, moduleCode: string, name: string, bytes: Uint8Array, duplicateMode?: "update_existing") {
  const at = { tenantId, projectId };
  const target = await owner().dataImports.createUpload({ ...at, moduleCode: moduleCode as never, fileName: name, sourceFormat: "xlsx" });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const registered = await owner().dataImports.registerUpload({ ...at, moduleCode: moduleCode as never, fileName: name, sourceFormat: "xlsx", uploadKey: target.uploadKey, ...(duplicateMode ? { duplicateMode } : {}) });
  // a file the screen previews (the operational ledgers) is confirmed with the hash of the differences the person saw, as the screen sends it
  return { view: await settle(projectId, registered.id), confirm: async () => {
    const diff = await owner().dataImports.diff({ ...at, importId: registered.id }).catch(() => null);
    await owner().dataImports.confirm({ ...at, importId: registered.id, ...(diff?.supported ? { approvedDiffHash: diff.diffHash } : {}) });
    return settle(projectId, registered.id);
  } };
}
const xlsx = async (rows: Array<Array<string | number>>, sheetName = "Sheet1") => { const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet(sheetName); for (const row of rows) sheet.addRow(row); return new Uint8Array(await book.xlsx.writeBuffer()); };
const bytesOf = (file: { base64: string }) => new Uint8Array(Buffer.from(file.base64, "base64"));

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-56 (6): every template the platform hands out imports back as it is", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q56-templates', 'Q56 Templates', 'q56-templates@q56.example.test', 'user')");
    ownerId = (await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'q56-templates'"))[0][0].id;
    ({ tenantId } = await owner().tenant.create({ legalName: "Q56 Templates Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    for (const [id, code] of [[P1, "Q56-T1"], ...Object.values(PMC).flat().map((id, index) => [id, `Q56-P${index}`])]) await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, ?, 'Templates', 'villas', 'SAR', 'active')", [id, tenantId, code]);
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } await s3?.close(); });

  it("the six general modules and the four operational ledgers: each template, in each language, is read with 0 rejected rows and saved — in the order one names another (WBS → budget → contracts → materials → …)", async () => {
    const failures: string[] = []; const at = { tenantId, projectId: P1 };
    // what no template makes and the screens create first, each named by its own refusal when it is missing (NEGATIVE test below):
    // the warehouse the opening balances go into, the supplier an order names, and the employee's assignment the hours are booked against
    const before: Record<string, () => Promise<unknown>> = {
      openingBalances: () => owner().warehouses.create({ ...at, code: "WH-01", name: "Main store (synthetic)" }),
      purchaseOrders: () => owner().procurement.createSupplier({ tenantId, code: "SUP-001", legalName: "Supplier (synthetic)" }),
      timeEntries: async () => {
        const options = await owner().assignments.options(at);
        const resource = await owner().resources.create({ ...at, resourceCode: "LAB-01", name: "Crew (synthetic)", resourceType: "labor", plannedUnits: 10, allocatedUnits: 1, unitCost: 100, currency: "SAR" }) as { id: string };
        const employee = options.employees.find(item => item.employeeNumber === "E-1001");
        if (!employee) throw new Error("the employees template did not save E-1001");
        await owner().assignments.create({ ...at, employeeId: employee.id, projectResourceId: resource.id, plannedStartAt: new Date("2026-09-01"), plannedFinishAt: new Date("2026-09-30"), plannedHours: 80 });
        // and the day's attendance, approved (the hours screen's own rule: no hours on a day whose attendance is not approved)
        const day = await owner().employees.attendance.create({ ...at, employeeId: employee.id, attendanceDate: new Date("2026-09-15"), attendanceStatus: "present" }) as { id: string };
        await owner().employees.attendance.transition({ ...at, attendanceId: day.id, status: "submitted" });
        return owner().employees.attendance.transition({ ...at, attendanceId: day.id, status: "approved" });
      },
    };
    for (const moduleCode of ["wbs", "budget", "contracts", "materials", "openingBalances", "schedule", ...LEDGER_MODULES]) for (const locale of EXPORT_LOCALES) {
      if (locale === "ar") await before[moduleCode]?.();
      const file = await owner().dataImports.template({ moduleCode: moduleCode as never, locale });
      const run = await directImport(P1, moduleCode, `${moduleCode}-${locale}.xlsx`, bytesOf(file)); const view = run.view; const directImportConfirm = async (_: View) => run.confirm();
      const errors = view.analysis?.errors ?? [];
      if (view.status === "failed" || errors.length) { failures.push(`${moduleCode}/${locale}: ${view.status} ${view.failureReason ?? ""} ${errors.map(error => `${error.code}${error.field ? `(${error.field})` : ""}@${error.rowNumber}`).join(", ")}`); continue; }
      if (locale === "ar") { const done = await directImportConfirm(view).catch((error: Error) => ({ status: `refused ${error.message}`, failureReason: null })); if (done.status !== "completed") failures.push(`${moduleCode}/${locale} confirm: ${done.status} ${done.failureReason ?? ""}`); }
    }
    expect(failures).toEqual([]);
    // Q-65: the budget template's optional «Activity No.» column is saved with the line
    const [[line]] = await connection.query<{ activityNo: string | null }[]>("SELECT activity_no AS \"activityNo\" FROM budget_lines WHERE projectId = ? AND costCode = 'CIVIL'", [P1]);
    expect(line.activityNo).toBe("A1010");
  }, 300_000);

  it("Q-65: a later budget file WITHOUT the Activity No. column (or with it blank) changes the amounts and leaves the stored activity number; one that gives a number replaces it", async () => {
    const stored = async () => (await connection.query<{ activityNo: string | null; originalAmount: string }[]>("SELECT activity_no AS \"activityNo\", original_amount AS \"originalAmount\" FROM budget_lines WHERE projectId = ? AND costCode = 'CIVIL'", [P1]))[0][0];
    const run = await directImport(P1, "budget", "budget-no-activity.xlsx", await xlsx([["Cost Code", "Original Amount", "Current Amount"], ["CIVIL", 600000, 625000]]), "update_existing");
    expect(run.view.analysis?.errors ?? []).toEqual([]);
    await run.confirm();
    expect(await stored()).toMatchObject({ activityNo: "A1010", originalAmount: "600000.00" }); // the amounts moved, the activity number stayed
    const blank = await directImport(P1, "budget", "budget-blank-activity.xlsx", await xlsx([["Cost Code", "Original Amount", "Current Amount", "Activity No."], ["CIVIL", 610000, 625000, ""]]), "update_existing");
    await blank.confirm();
    expect(await stored()).toMatchObject({ activityNo: "A1010", originalAmount: "610000.00" }); // a blank cell never clears it either
    const given = await directImport(P1, "budget", "budget-new-activity.xlsx", await xlsx([["Cost Code", "Original Amount", "Current Amount", "Activity No."], ["CIVIL", 610000, 625000, "A2020"]]), "update_existing");
    await given.confirm();
    expect((await stored()).activityNo).toBe("A2020");
  }, 120_000);

  it("NEGATIVE: a template whose rows name what the project does not have yet is refused row by row with what is missing — never saved silently", async () => {
    const empty = "56c00000-0000-4000-8000-0000000000b1";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q56-EMPTY', 'Empty', 'villas', 'SAR', 'active')", [empty, tenantId]);
    const seen: Record<string, string[]> = {};
    for (const moduleCode of ["openingBalances", "costs", "purchaseOrders", "timeEntries"]) {
      const file = await owner().dataImports.template({ moduleCode: moduleCode as never, locale: "en" });
      const { view } = await directImport(empty, moduleCode, `${moduleCode}-empty.xlsx`, bytesOf(file));
      seen[moduleCode] = (view.analysis?.errors ?? []).map(error => `${error.code}(${error.field})`);
      expect(view.external?.canConfirm ?? false).toBe(false);
    }
    // the company's materials, supplier and employee exist (made in the test above); this project has no warehouse, WBS, contract or assignment
    expect(seen).toEqual({
      openingBalances: ["IMPORT_REFERENCE_NOT_FOUND(warehouseCode)"],
      costs: ["COST_WBS_NOT_FOUND(wbsCode)"],
      purchaseOrders: ["PO_CONTRACT_NOT_FOUND(contractCode)", "COST_WBS_NOT_FOUND(wbsCode)"],
      timeEntries: ["PROJECT_OS_TIME_ENTRY_ASSIGNMENT_INVALID(employeeNumber)"],
    });
  }, 120_000);

  it("the project's base file: the cash-flow, bill-of-quantities and labour templates, in each language, preview with no issue and save", async () => {
    const failures: string[] = [];
    for (const locale of EXPORT_LOCALES) {
      const at = { tenantId, projectId: P1 };
      for (const [name, template, preview, save] of [
        ["cashFlow", owner().projects.baseline.cashFlowTemplate, owner().projects.baseline.previewCashFlow, owner().projects.baseline.saveCashFlow],
        ["boq", owner().projects.baseline.boqTemplate, owner().projects.baseline.previewBoq, owner().projects.baseline.saveBoq],
        ["labour", owner().projects.baseline.labourTemplate, owner().projects.baseline.previewLabour, owner().projects.baseline.saveLabour],
      ] as const) {
        const file = await (template as (input: unknown) => Promise<{ base64: string }>)({ ...at, locale });
        const result = await (preview as (input: unknown) => Promise<{ refusal?: string | null; issues?: unknown[] }>)({ ...at, format: "xlsx", fileBase64: file.base64 });
        if (result.refusal || (result.issues ?? []).length) { failures.push(`${name}/${locale}: ${result.refusal ?? ""} ${JSON.stringify(result.issues)}`); continue; }
        await (save as (input: unknown) => Promise<unknown>)({ ...at, format: "xlsx", fileBase64: file.base64 }).catch(error => failures.push(`${name}/${locale} save: ${(error as Error).message}`));
      }
    }
    expect(failures).toEqual([]);
  }, 300_000);

  it("the seven PMC kinds: the example each guide shows, in each language, written as a file, is read with 0 rejected rows and saved", async () => {
    const failures: string[] = [];
    for (const language of ["ar", "en", "ur"] as const) {
      const guide = PMC_IMPORT_GUIDE[language]; const [catalogProject, weightsProject] = PMC[language];
      // the villas first (both projects): every other kind names them
      for (const projectId of [catalogProject, weightsProject]) {
        const run = await directImport(projectId, "pmc.locations", `locations-${language}.xlsx`, await xlsx(guide.locations.example, projectId === catalogProject ? `Villas ${language}` : `Villas2 ${language}`));
        const report = pmcReportOf(run.view);
        if (run.view.status !== "validated" || report?.errorCount) { failures.push(`locations/${language}: ${run.view.status} ${JSON.stringify(report?.errors)}`); continue; }
        if (run.view.external?.canConfirm) { const done = await run.confirm(); if (done.status !== "completed") failures.push(`locations/${language} confirm: ${done.status} ${done.failureReason}`); }
      }
      for (const kind of PMC_GUIDE_KINDS.filter(kind => kind !== "locations")) {
        const projectId = kind === "weights" ? weightsProject : catalogProject;
        const run = await directImport(projectId, `pmc.${kind}`, `${kind}-${language}.xlsx`, await xlsx(guide[kind].example));
        const report = pmcReportOf(run.view);
        if (run.view.status !== "validated" || report?.errorCount) { failures.push(`${kind}/${language}: ${run.view.status} ${run.view.failureReason ?? ""} ${JSON.stringify(report?.errors)}`); continue; }
        if (run.view.external?.canConfirm) { const done = await run.confirm(); if (done.status !== "completed") failures.push(`${kind}/${language} confirm: ${done.status} ${done.failureReason}`); }
      }
    }
    expect(failures).toEqual([]);
  }, 300_000);
});
