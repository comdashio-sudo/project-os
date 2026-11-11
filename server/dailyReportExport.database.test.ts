import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// D-47 (a) on a real database, through the real router, as the restricted application role: the labour sheet of a made-up report is generated, fetched from storage by
// its signed link, opened, and every block's totals are checked against the report's own computed totals; the totals are SUM formulas. Who may not export is refused.
const SLUG = "daily-export";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@dx.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "aa000000-0000-4000-8000-000000000001";
const B = "aa000000-0000-4000-8000-000000000002";
const KEYS = ["owner", "manager", "engineer", "hseOnly", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let s3: FakeS3;
let tenantId = ""; let otherTenantId = "";
const at = (projectId = A) => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["site_daily_report_labour", "site_daily_report_equipment", "site_daily_report_lines", "site_daily_reports", "project_report_counters", "project_labour_roles", "project_companies", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'dx-%'");
}

/** The value a cell shows: a number, or a formula's stored result. */
const valueOf = (cell: ExcelJS.Cell) => (typeof cell.value === "number" ? cell.value : (cell.value as { result?: number } | null)?.result ?? null);
/** The rows of the first sheet as [label, ...cells], with the row object for formulas. */
const rowsOf = (sheet: ExcelJS.Worksheet) => { const out: Array<{ label: string; row: ExcelJS.Row }> = []; sheet.eachRow(row => out.push({ label: String(row.getCell(1).value ?? ""), row })); return out; };
/** The «Total» row that closes the block titled `title`. */
function blockTotal(sheet: ExcelJS.Worksheet, title: string) {
  const rows = rowsOf(sheet); const start = rows.findIndex(item => item.label === title);
  expect(start, title).toBeGreaterThanOrEqual(0);
  return rows.slice(start + 1).find(item => item.label === "الإجمالي")!.row;
}
const lastValue = (row: ExcelJS.Row) => valueOf(row.getCell(row.cellCount));

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the daily report's labour sheet export on a real database (D-47 a)", () => {
  let reportId = ""; let reportOnB = "";
  const companiesOf = { main: "", subA: "", subB: "" };
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`dx-${key}`, `DX ${key}`, `dx-${key}@dx.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'dx-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `dx-${key}`)!.id; callers[key] = callerFor(ids[key], `dx-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Daily Export Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Export Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DX-A', 'Export A', 'villas', 'SAR', 'active'), (?, ?, 'DX-B', 'Export B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "DX_MANAGER", name: "Project manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const field = await callers.owner.tenant.createRole({ tenantId, code: "DX_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    const hse = await callers.owner.tenant.createRole({ tenantId, code: "DX_HSE", name: "HSE", productCode: "PROJECT", permissionCodes: ["project.hse.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.hseOnly, roleId: hse.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    companiesOf.main = (await callers.manager.projects.companies.save({ ...at(), name: "Main Contractor (example)", role: "main" })).id;
    companiesOf.subA = (await callers.manager.projects.companies.save({ ...at(), name: "Sub Alpha (example)", role: "sub" })).id;
    companiesOf.subB = (await callers.manager.projects.companies.save({ ...at(), name: "Sub Beta (example)", role: "sub" })).id;
    await callers.manager.projects.labourRoles.seedDefaults({ ...at(), language: "ar" });
    const roles = await callers.manager.projects.labourRoles.list(at());
    const role = (key: string) => roles.find(item => item.defaultKey === key)!.id;
    const cell = (company: string, roleKey: string, shift: "day" | "night", headcount: number) => ({ companyId: company, labourRoleId: role(roleKey), shift, headcount });
    reportId = (await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-05", summary: "Export day", lines: [], labour: [
      cell(companiesOf.main, "mason", "day", 14), cell(companiesOf.main, "mason", "night", 6), cell(companiesOf.main, "site_engineer", "day", 3), cell(companiesOf.main, "hse_officer", "day", 2),
      cell(companiesOf.subA, "steel_fixer", "day", 11), cell(companiesOf.subA, "steel_fixer", "night", 5), cell(companiesOf.subA, "general_foreman", "day", 1),
      cell(companiesOf.subB, "electrician", "day", 7), cell(companiesOf.subB, "plumber", "day", 4), cell(companiesOf.subB, "mep_supervisor", "night", 1),
    ] })).id;
    reportOnB = (await callers.owner.siteReports.save({ ...at(B), reportDate: "2026-11-05", summary: "B", lines: [] })).id;
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } if (s3) await s3.close(); });

  it("the labour sheet opens, carries the five blocks, and every block's totals equal the report's own computed totals, as SUM formulas", async () => {
    const exported = await callers.engineer.siteReports.export({ ...at(), reportId, format: "xlsx", locale: "ar" });
    expect(exported.fileName).toMatch(/-labour\.xlsx$/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await (await fetch(exported.url)).arrayBuffer()) as never);
    const sheet = book.worksheets[0];
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true });
    const { totals } = await callers.engineer.siteReports.get({ ...at(), reportId });
    expect(totals.labour).toMatchObject({ total: 54, direct: 47, indirect: 7 });
    // block 1 (indirect) and block 2 (direct): the grand total in the last column, and the formula behind it
    const indirect = blockTotal(sheet, "العمالة غير المباشرة"); const direct = blockTotal(sheet, "العمالة المباشرة");
    expect(lastValue(indirect)).toBe(totals.labour.indirect);
    expect(lastValue(direct)).toBe(totals.labour.direct);
    expect((indirect.getCell(indirect.cellCount).value as { formula?: string }).formula).toMatch(/^SUM\(/);
    // block 3: the subcontractors only (14 + 6 + 3 + 2 of the main contractor are not in it)
    expect(lastValue(blockTotal(sheet, "ملخص مقاولي الباطن"))).toBe(totals.labour.byCompany.filter(item => item.companyId !== companiesOf.main).reduce((sum, item) => sum + item.headcount, 0));
    // block 4: direct day + direct night + indirect day + indirect night per company, and the grand total
    const summary = blockTotal(sheet, "ملخص العمالة");
    expect([2, 3, 4, 5, 6].map(c => valueOf(summary.getCell(c)))).toEqual([36, 11, 6, 1, totals.labour.total]);
    // block 5: each company's detail equals its own total
    for (const item of totals.labour.byCompany) expect(lastValue(blockTotal(sheet, `تفصيل — ${item.companyName}`)), item.companyName).toBe(item.headcount);
    expect(Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'site_report.exported' AND entityId = ?", [tenantId, reportId]))[0][0].n)).toBe(1);
  });

  it("English headers and a left-to-right sheet in English", async () => {
    const exported = await callers.manager.siteReports.export({ ...at(), reportId, format: "xlsx", locale: "en" });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await (await fetch(exported.url)).arrayBuffer()) as never);
    expect(book.worksheets[0].name).toBe("Labour");
    expect(rowsOf(book.worksheets[0]).map(item => item.label)).toEqual(expect.arrayContaining(["Indirect labour", "Direct labour", "Subcontractors summary", "Labour summary"]));
  });

  it("refused: a role without read on the project, another company, A's people on project B, and A's report read from B; nothing is written", async () => {
    const before = Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'site_report.exported'", [tenantId]))[0][0].n);
    expect(await code(callers.hseOnly.siteReports.export({ ...at(), reportId, format: "xlsx", locale: "ar" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.otherOwner.siteReports.export({ ...at(), reportId, format: "xlsx", locale: "ar" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.siteReports.export({ tenantId: otherTenantId, projectId: A, reportId, format: "xlsx", locale: "ar" }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.engineer.siteReports.export({ ...at(B), reportId: reportOnB, format: "xlsx", locale: "ar" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.owner.siteReports.export({ ...at(B), reportId, format: "xlsx", locale: "ar" }))).toBe("PROJECT_OS_SITE_REPORT_NOT_FOUND");
    expect(Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'site_report.exported'", [tenantId]))[0][0].n)).toBe(before);
  });
});
