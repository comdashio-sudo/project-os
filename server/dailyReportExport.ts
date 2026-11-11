// D-47 (a): the daily report's exports. This part writes the labour sheet (Excel) in the five blocks of the specification (§4): indirect labour (each company day / night
// and totals), direct labour, the subcontractors' summary, the labour summary (direct / indirect × day / night per company) and each company's detail by role.
// Every figure comes from the report's own labour rows (siteReports.get, which also checks who may read it): nothing is typed, and every total is a SUM formula over the
// cells above it, stored with its computed result, so the file stays right when someone edits it and reads right before Excel recalculates. The file is written to
// storage under the company's prefix and handed back as a signed link (a request body is capped at 4.5 MB on Vercel); an audit row records each export.
// Word and PDF (the sections 0–10) are part (b).
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { auditLogs, projectCompanies } from "../drizzle/schema";
import { getDb } from "./db";
import { getSiteDailyReportForTenant } from "./siteReports";
import { storageGetSignedUrl, storagePut } from "./storage";
import type { ExportLocale } from "../shared/exportLocale";

type Scope = { userId: number; tenantId: string; projectId: string };
type LabourRow = { companyId: string; companyName: string; roleName: string; category: string; shift: string; headcount: number };
type Company = { id: string; name: string; role: "main" | "sub" };

const WORDS = {
  ar: { sheet: "العمالة", indirect: "العمالة غير المباشرة", direct: "العمالة المباشرة", subs: "ملخص مقاولي الباطن", summary: "ملخص العمالة", detail: "تفصيل", role: "الدور", company: "الشركة", day: "نهار", night: "ليل", total: "الإجمالي", directWord: "مباشر", indirectWord: "غير مباشر", report: "رقم التقرير", date: "التاريخ" },
  en: { sheet: "Labour", indirect: "Indirect labour", direct: "Direct labour", subs: "Subcontractors summary", summary: "Labour summary", detail: "Detail", role: "Role", company: "Company", day: "Day", night: "Night", total: "Total", directWord: "Direct", indirectWord: "Indirect", report: "Report no.", date: "Date" },
} as const;
// Urdu takes the English words, as the import templates do (shared/importTemplateHeaders.ts)
const words = (locale: ExportLocale) => (locale === "ar" ? WORDS.ar : WORDS.en);

/** A total: the formula over the given cells and the value it computes, so a reader that does not recalculate still sees the number. */
const sumOf = (refs: string[], values: number[]) => ({ formula: refs.length ? `SUM(${refs.join(",")})` : "0", result: values.reduce((a, b) => a + b, 0) });
const cellRef = (row: number, column: number) => `${columnLetter(column)}${row}`;
function columnLetter(column: number) { let out = ""; for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out; return out; }
const count = (rows: LabourRow[], where: (row: LabourRow) => boolean) => rows.filter(where).reduce((sum, row) => sum + row.headcount, 0);

/** The labour workbook of one report. Pure: the rows in, the bytes out. */
export async function buildLabourWorkbook(input: { reportNumber: string | null; reportDate: string; locale: ExportLocale; companies: Company[]; labour: LabourRow[] }) {
  const w = words(input.locale);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(w.sheet, { views: [{ rightToLeft: input.locale === "ar" }] });
  const bold = (row: ExcelJS.Row) => { row.font = { bold: true }; };
  const companies = input.companies.filter(company => input.labour.some(row => row.companyId === company.id));
  let r = 1;
  const put = (values: Array<ExcelJS.CellValue>) => { const row = sheet.getRow(r); values.forEach((value, i) => { row.getCell(i + 1).value = value; }); r += 1; return row; };
  bold(put([w.report, input.reportNumber ?? "", w.date, input.reportDate]));
  r += 1;

  // blocks 1 and 2: a role per row, each company's day and night, then the totals across companies, then a totals row
  for (const [title, category] of [[w.indirect, "indirect"], [w.direct, "direct"]] as const) {
    bold(put([title]));
    bold(put([w.role, ...companies.flatMap(company => [`${company.name} — ${w.day}`, `${company.name} — ${w.night}`]), `${w.total} ${w.day}`, `${w.total} ${w.night}`, w.total]));
    const roles = Array.from(new Set(input.labour.filter(row => row.category === category).map(row => row.roleName)));
    const first = r;
    for (const role of roles) {
      const values = companies.flatMap(company => (["day", "night"] as const).map(shift => count(input.labour, row => row.category === category && row.roleName === role && row.companyId === company.id && row.shift === shift)));
      const dayCols = companies.map((_c, i) => 2 + i * 2); const nightCols = companies.map((_c, i) => 3 + i * 2); const totalCol = 2 + companies.length * 2;
      put([role, ...values,
        sumOf(dayCols.map(c => cellRef(r, c)), values.filter((_v, i) => i % 2 === 0)), sumOf(nightCols.map(c => cellRef(r, c)), values.filter((_v, i) => i % 2 === 1)),
        sumOf([cellRef(r, totalCol), cellRef(r, totalCol + 1)], [values.reduce((a, b) => a + b, 0)])]);
    }
    const columns = companies.length * 2 + 3;
    const totals = Array.from({ length: columns }, (_v, i) => { const c = i + 2; const vals = roles.map((_role, k) => { const v = sheet.getRow(first + k).getCell(c).value; return typeof v === "number" ? v : (v as { result?: number })?.result ?? 0; }); return sumOf(roles.length ? [`${cellRef(first, c)}:${cellRef(r - 1, c)}`] : [], vals); });
    bold(put([w.total, ...totals]));
    r += 1;
  }

  // block 3: each subcontractor's direct, indirect and total
  bold(put([w.subs])); bold(put([w.company, w.directWord, w.indirectWord, w.total]));
  const subs = companies.filter(company => company.role === "sub"); const subFirst = r;
  for (const company of subs) { const d = count(input.labour, row => row.companyId === company.id && row.category === "direct"); const i = count(input.labour, row => row.companyId === company.id && row.category === "indirect"); put([company.name, d, i, sumOf([cellRef(r, 2), cellRef(r, 3)], [d, i])]); }
  bold(put([w.total, ...[2, 3, 4].map(c => sumOf(subs.length ? [`${cellRef(subFirst, c)}:${cellRef(r - 1, c)}`] : [], subs.map(company => c === 2 ? count(input.labour, row => row.companyId === company.id && row.category === "direct") : c === 3 ? count(input.labour, row => row.companyId === company.id && row.category === "indirect") : count(input.labour, row => row.companyId === company.id))))]));
  r += 1;

  // block 4: per company, direct and indirect by shift
  bold(put([w.summary])); bold(put([w.company, `${w.directWord} ${w.day}`, `${w.directWord} ${w.night}`, `${w.indirectWord} ${w.day}`, `${w.indirectWord} ${w.night}`, w.total]));
  const cell = (company: Company, category: string, shift: string) => count(input.labour, row => row.companyId === company.id && row.category === category && row.shift === shift);
  const sumFirst = r;
  for (const company of companies) { const v = [cell(company, "direct", "day"), cell(company, "direct", "night"), cell(company, "indirect", "day"), cell(company, "indirect", "night")]; put([company.name, ...v, sumOf([`${cellRef(r, 2)}:${cellRef(r, 5)}`], v)]); }
  bold(put([w.total, ...[2, 3, 4, 5, 6].map(c => sumOf(companies.length ? [`${cellRef(sumFirst, c)}:${cellRef(r - 1, c)}`] : [], companies.map(company => c === 6 ? count(input.labour, row => row.companyId === company.id) : cell(company, c < 4 ? "direct" : "indirect", c % 2 === 0 ? "day" : "night"))))]));
  r += 1;

  // block 5: each company's roles, day / night / total
  for (const company of companies) {
    bold(put([`${w.detail} — ${company.name}`])); bold(put([w.role, w.day, w.night, w.total]));
    const roles = Array.from(new Set(input.labour.filter(row => row.companyId === company.id).map(row => row.roleName))); const first = r;
    for (const role of roles) { const d = count(input.labour, row => row.companyId === company.id && row.roleName === role && row.shift === "day"); const n = count(input.labour, row => row.companyId === company.id && row.roleName === role && row.shift === "night"); put([role, d, n, sumOf([cellRef(r, 2), cellRef(r, 3)], [d, n])]); }
    bold(put([w.total, ...[2, 3, 4].map(c => sumOf([`${cellRef(first, c)}:${cellRef(r - 1, c)}`], roles.map(role => count(input.labour, row => row.companyId === company.id && row.roleName === role && (c === 4 || row.shift === (c === 2 ? "day" : "night"))))))]));
    r += 1;
  }
  sheet.columns.forEach(column => { column.width = 18; });
  sheet.getColumn(1).width = 34;
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** siteReports.export: the report read through the same gate as reading it, the file written to storage, a signed link back, an audit row. */
export async function exportSiteDailyReport(input: Scope & { reportId: string; format: "xlsx"; locale: ExportLocale }) {
  const read = await getSiteDailyReportForTenant(input); // tenant, project and read permission are checked here
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const companies = (await db.select({ id: projectCompanies.id, name: projectCompanies.name, role: projectCompanies.role }).from(projectCompanies)
    .where(and(eq(projectCompanies.tenantId, input.tenantId), eq(projectCompanies.projectId, input.projectId)))) as Company[];
  companies.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "main" ? -1 : 1));
  const bytes = await buildLabourWorkbook({ reportNumber: read.report.reportNumber, reportDate: read.report.reportDate, locale: input.locale, companies, labour: read.labour as LabourRow[] });
  const name = `${(read.report.reportNumber ?? read.report.reportDate).replace(/[^A-Za-z0-9-]/g, "_")}-labour.xlsx`;
  const stored = await storagePut(`tenants/${input.tenantId}/projects/${input.projectId}/exports/daily/${read.report.id}/${randomUUID()}-${name}`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "site_report.exported", entityType: "site_daily_report", entityId: read.report.id, metadata: JSON.stringify({ projectId: input.projectId, format: input.format, locale: input.locale, bytes: bytes.length }) });
  return { fileName: name, url: await storageGetSignedUrl(stored.key), bytes: bytes.length };
}
