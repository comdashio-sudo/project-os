// Q-10 (a): the project's «base file» — one checklist of what any project needs before the platform can plan it, and where each piece stands.
//   - getBaselineStatus: for each of the eight items, whether the project has it (uploaded), lacks it (missing) or may go without it (optional), with the count behind that word.
//     Read-only: one count per table, always filtered by company and project.
//   - saveProjectContract: the one item that is a form, not a file — the contract value and its start and end dates.
// Reading takes project.read or project.manage; writing takes project.manage. The audit row is written in the same transaction as the change. No import happens here:
// the checklist points at the importers that already exist (WBS, schedule, units, weights, BOQ) and the status is read from what they stored.
import { randomUUID } from "node:crypto";
import { and, asc, count, countDistinct, eq, inArray, notInArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activities, auditLogs, boqItems, pmcActivityDefinitions, pmcPlanMonths, pmcUnits, projectPlannedLabour, projects, wbsItems } from "../drizzle/schema";
import { projectGate } from "./projectProfile";
import { analyzeCashFlowFile, cashFlowRefusal, type CashFlowAnalysis } from "./domain/plannedCashFlow";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { analyzeBoqFile, boqRefusal, type BoqAnalysis } from "./domain/boqFile";
import { analyzeLabourFile, labourHistogram, labourRefusal, type LabourAnalysis } from "./domain/plannedLabour";

type Scope = { userId: number; tenantId: string; projectId: string };
const READ = ["project.read", "project.manage"] as const;
const WRITE = ["project.manage"] as const;

export const BASELINE_ITEMS = ["contract", "schedule", "cashFlow", "weights", "units", "boq", "wbs", "labour"] as const;
export type BaselineItemCode = (typeof BASELINE_ITEMS)[number];
export type BaselineState = "uploaded" | "missing" | "optional";
export type BaselineItem = { code: BaselineItemCode; state: BaselineState; count: number; detail: { contractValue?: string; plannedStartAt?: string | null; plannedFinishAt?: string | null; models?: number; curve?: Array<{ month: string; cumulative: number }>; histogram?: Array<{ month: string; workers: number }> } };

/** What a project must have (required) or may have (optional); labour is the only optional one. A required item with nothing behind it is «missing», an optional one «optional». */
const OPTIONAL: ReadonlySet<BaselineItemCode> = new Set<BaselineItemCode>(["labour"]);
const stateOf = (code: BaselineItemCode, count: number): BaselineState => (count > 0 ? "uploaded" : OPTIONAL.has(code) ? "optional" : "missing");
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export async function getBaselineStatus(input: Scope): Promise<{ items: BaselineItem[]; ready: number; required: number }> {
  const db = await projectGate(input, READ);
  const total = async (rows: Promise<Array<{ n: number }>>) => Number((await rows)[0]?.n ?? 0);
  const [[project], scheduleCount, planMonths, [weights], unitCount, boqCount, wbsCount, labourRows] = await Promise.all([
    db.select({ contractValue: projects.contractValue, plannedStartAt: projects.plannedStartAt, plannedFinishAt: projects.plannedFinishAt }).from(projects).where(and(eq(projects.tenantId, input.tenantId), eq(projects.id, input.projectId))).limit(1),
    total(db.select({ n: count() }).from(activities).where(mine(activities, input))),
    db.select({ month: pmcPlanMonths.month, cumulative: pmcPlanMonths.cumulativePercent }).from(pmcPlanMonths).where(mine(pmcPlanMonths, input)).orderBy(asc(pmcPlanMonths.month)),
    db.select({ n: count(), models: countDistinct(pmcActivityDefinitions.modelCode) }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    total(db.select({ n: count() }).from(pmcUnits).where(mine(pmcUnits, input))),
    total(db.select({ n: count() }).from(boqItems).where(mine(boqItems, input))),
    total(db.select({ n: count() }).from(wbsItems).where(mine(wbsItems, input))),
    db.select({ month: projectPlannedLabour.month, trade: projectPlannedLabour.trade, workers: projectPlannedLabour.workers }).from(projectPlannedLabour).where(mine(projectPlannedLabour, input)),
  ]);
  const contractValue = Number(project?.contractValue ?? 0);
  // the contract counts as given when it has a value and both dates (a value of zero or a missing date is not a contract)
  const contractGiven = contractValue > 0 && project?.plannedStartAt != null && project?.plannedFinishAt != null;
  const items: BaselineItem[] = [
    { code: "contract", state: contractGiven ? "uploaded" : "missing", count: contractGiven ? 1 : 0, detail: { contractValue: String(project?.contractValue ?? "0"), plannedStartAt: isoDay(project?.plannedStartAt ?? null), plannedFinishAt: isoDay(project?.plannedFinishAt ?? null) } },
    { code: "schedule", state: stateOf("schedule", scheduleCount), count: scheduleCount, detail: {} },
    // the planned S-curve: the cumulative share at the end of each month (a fraction, 1 = the whole contract)
    { code: "cashFlow", state: stateOf("cashFlow", planMonths.length), count: planMonths.length, detail: { curve: planMonths.map(row => ({ month: row.month, cumulative: Number(row.cumulative) })) } },
    { code: "weights", state: stateOf("weights", Number(weights?.n ?? 0)), count: Number(weights?.n ?? 0), detail: { models: Number(weights?.models ?? 0) } },
    { code: "units", state: stateOf("units", unitCount), count: unitCount, detail: {} },
    { code: "boq", state: stateOf("boq", boqCount), count: boqCount, detail: {} },
    { code: "wbs", state: stateOf("wbs", wbsCount), count: wbsCount, detail: {} },
    // planned labour (Q-10 d): optional; when given, the monthly histogram travels with the item
    { code: "labour", state: stateOf("labour", labourRows.length), count: labourRows.length, detail: { histogram: labourHistogram(labourRows) } },
  ];
  const required = items.filter(item => !OPTIONAL.has(item.code)).length;
  return { items, ready: items.filter(item => !OPTIONAL.has(item.code) && item.state === "uploaded").length, required };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (value: string) => { if (!DAY.test(value)) return null; const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null; };

/** The contract value and the planned start and finish. A value must be a positive number, both dates real days and the finish not before the start; each refusal has its own translated message. */
export async function saveProjectContract(input: Scope & { contractValue: number; plannedStartAt: string; plannedFinishAt: string }) {
  const db = await projectGate(input, WRITE);
  if (!Number.isFinite(input.contractValue) || input.contractValue <= 0 || input.contractValue >= 1e15) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONTRACT_VALUE_INVALID" });
  const start = parseDay(input.plannedStartAt); const finish = parseDay(input.plannedFinishAt);
  if (!start || !finish || finish < start) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONTRACT_DATES_INVALID" });
  await db.transaction(async tx => {
    const updated = await tx.update(projects).set({ contractValue: input.contractValue.toFixed(2), plannedStartAt: start, plannedFinishAt: finish, updatedAt: new Date() })
      .where(and(eq(projects.tenantId, input.tenantId), eq(projects.id, input.projectId))).returning({ id: projects.id });
    // zero rows is a stated outcome, not a silent success: the project is gone or belongs elsewhere
    if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_NOT_FOUND" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.contract_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ projectId: input.projectId, contractValue: input.contractValue.toFixed(2), plannedStartAt: input.plannedStartAt, plannedFinishAt: input.plannedFinishAt }) });
  });
  return getBaselineStatus(input);
}

// ------------------------------------------------------------------ Q-10 (b): the planned cash flow

const CASHFLOW_MAX_BYTES = 1024 * 1024; // a month and a share per row: a real file is a few kilobytes
const prefixed = (code: string) => `PROJECT_OS_${code}`;
async function readCashFlow(fileBase64: string, format: "xlsx" | "csv"): Promise<CashFlowAnalysis> {
  const bytes = Buffer.from(fileBase64, "base64");
  if (!bytes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  if (bytes.length > CASHFLOW_MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_TOO_LARGE" });
  return analyzeCashFlowFile(bytes, format);
}

/** The check report before anything is stored: the months read, the refused rows with their reason and value, the total and whether it may be saved. Writes nothing. */
export async function previewProjectCashFlow(input: Scope & { fileBase64: string; format: "xlsx" | "csv" }) {
  await projectGate(input, WRITE);
  const analysis = await readCashFlow(input.fileBase64, input.format);
  const refusal = cashFlowRefusal(analysis);
  return { ...analysis, fileError: analysis.fileError ? prefixed(analysis.fileError === "IMPORT_FILE_TOO_LARGE" ? analysis.fileError : analysis.fileError.startsWith("IMPORT_") ? "IMPORT_FILE_INVALID" : analysis.fileError) : null, refusal: refusal ? prefixed(refusal.startsWith("IMPORT_") ? "IMPORT_FILE_INVALID" : refusal) : null };
}

/** Store the planned months, replacing the project's previous plan: a month in the file is written (again), a month no longer in it is removed. Refused unless the total is 100%. */
export async function saveProjectCashFlow(input: Scope & { fileBase64: string; format: "xlsx" | "csv" }) {
  const db = await projectGate(input, WRITE);
  const analysis = await readCashFlow(input.fileBase64, input.format);
  const refusal = cashFlowRefusal(analysis);
  if (refusal) throw new TRPCError({ code: "BAD_REQUEST", message: prefixed(refusal.startsWith("IMPORT_") ? "IMPORT_FILE_INVALID" : refusal) });
  await db.transaction(async tx => {
    const months = analysis.months.map(row => row.month);
    await tx.delete(pmcPlanMonths).where(and(mine(pmcPlanMonths, input), notInArray(pmcPlanMonths.month, months)));
    for (const row of analysis.months) {
      const values = { plannedPercent: row.fraction.toFixed(8), cumulativePercent: row.cumulative.toFixed(8), plannedCost: null, importId: null };
      await tx.insert(pmcPlanMonths).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, month: row.month, ...values })
        .onConflictDoUpdate({ target: [pmcPlanMonths.projectId, pmcPlanMonths.month], set: values });
    }
    // the proof of the write is what is now stored: exactly the file's months, no more and no fewer
    const [stored] = await tx.select({ n: count() }).from(pmcPlanMonths).where(mine(pmcPlanMonths, input));
    if (Number(stored?.n ?? 0) !== months.length) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.cash_flow_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ months: months.length, first: months[0], last: months[months.length - 1] }) });
  });
  return getBaselineStatus(input);
}

/** The template: the two columns and three example months (synthetic), in the language of the screen. */
export async function cashFlowTemplate(input: Scope & { locale: "ar" | "en" | "ur" }) {
  await projectGate(input, READ);
  const headers = input.locale === "ar" ? ["الشهر", "النسبة"] : input.locale === "ur" ? ["مہینہ", "فیصد"] : ["Month", "Percent"];
  const bytes = await buildSpreadsheet({ sheetName: "Cash flow", headers, rows: [["2027-01", "20%"], ["2027-02", "50%"], ["2027-03", "30%"]], format: "xlsx" });
  return { fileName: "planned-cash-flow.xlsx", base64: bytes.toString("base64") };
}

// ------------------------------------------------------------------ Q-10 (c): the bill of quantities

// the same authority as adding one BOQ item by hand (createBoqItemForTenant)
const BOQ_WRITE = ["project.wbs.manage"] as const;
const BOQ_MAX_BYTES = 3 * 1024 * 1024; // the request ceiling of a file sent inside a request (CLAUDE.md §5)
const fileCode = (code: string) => prefixed(code.startsWith("IMPORT_") && code !== "IMPORT_FILE_TOO_LARGE" ? "IMPORT_FILE_INVALID" : code);
async function readBoq(fileBase64: string, format: "xlsx" | "csv"): Promise<BoqAnalysis> {
  const bytes = Buffer.from(fileBase64, "base64");
  if (!bytes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  if (bytes.length > BOQ_MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_TOO_LARGE" });
  return analyzeBoqFile(bytes, format);
}

/** The check report: the items read, the refused rows, the total, and how many codes are new and how many already exist (and would be updated). Writes nothing. */
export async function previewProjectBoq(input: Scope & { fileBase64: string; format: "xlsx" | "csv" }) {
  const db = await projectGate(input, BOQ_WRITE);
  const analysis = await readBoq(input.fileBase64, input.format);
  const refusal = boqRefusal(analysis);
  const codes = analysis.items.map(item => item.code);
  const existing = codes.length ? (await db.select({ code: boqItems.code }).from(boqItems).where(and(mine(boqItems, input), inArray(boqItems.code, codes)))).length : 0;
  return { count: analysis.items.length, items: analysis.items.slice(0, 20), issues: analysis.issues, totalAmount: analysis.totalAmount, newCount: analysis.items.length - existing, updateCount: existing, fileError: analysis.fileError ? fileCode(analysis.fileError) : null, refusal: refusal ? fileCode(refusal) : null };
}

/** Write the file's items: a new code is added, an existing code (same project) is updated in place. Nothing is deleted: an item no longer in the file stays (a certificate may cite it). */
export async function saveProjectBoq(input: Scope & { fileBase64: string; format: "xlsx" | "csv" }) {
  const db = await projectGate(input, BOQ_WRITE);
  const analysis = await readBoq(input.fileBase64, input.format);
  const refusal = boqRefusal(analysis);
  if (refusal) throw new TRPCError({ code: "BAD_REQUEST", message: fileCode(refusal) });
  await db.transaction(async tx => {
    let written = 0;
    for (const item of analysis.items) {
      const values = { description: item.description, unitOfMeasure: item.unitOfMeasure, quantity: String(item.quantity), unitRate: String(item.unitRate), totalAmount: item.totalAmount.toFixed(2), updatedAt: new Date() };
      const rows = await tx.insert(boqItems).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, code: item.code, createdByUserId: input.userId, ...values })
        .onConflictDoUpdate({ target: [boqItems.projectId, boqItems.code], set: values, setWhere: eq(boqItems.tenantId, input.tenantId) }).returning({ id: boqItems.id });
      written += rows.length;
    }
    // the proof of the write is one returned row per item; fewer means a code belongs to a row this company may not touch
    if (written !== analysis.items.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_BOQ_CODE_EXISTS" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.boq_imported", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ items: analysis.items.length, totalAmount: analysis.totalAmount }) });
  });
  return getBaselineStatus(input);
}

export async function boqTemplate(input: Scope & { locale: "ar" | "en" | "ur" }) {
  await projectGate(input, READ);
  const headers = input.locale === "ar" ? ["رقم البند", "وصف البند", "الوحدة", "الكمية", "سعر الوحدة"] : input.locale === "ur" ? ["آئٹم نمبر", "تفصیل", "اکائی", "مقدار", "شرح"] : ["Item no.", "Description", "Unit", "Quantity", "Unit rate"];
  const bytes = await buildSpreadsheet({ sheetName: "BOQ", headers, rows: [["A-01", "Excavation (example)", "m3", 1200, 18.5], ["A-02", "Plain concrete (example)", "m3", 85, 320]], format: "xlsx" });
  return { fileName: "boq.xlsx", base64: bytes.toString("base64") };
}

// ------------------------------------------------------------------ Q-10 (d): the planned labour histogram

async function readLabour(fileBase64: string, format: "xlsx" | "csv"): Promise<LabourAnalysis> {
  const bytes = Buffer.from(fileBase64, "base64");
  if (!bytes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  if (bytes.length > CASHFLOW_MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_TOO_LARGE" });
  return analyzeLabourFile(bytes, format);
}

/** The check report: rows read, refused rows, the monthly histogram and its peak. Writes nothing. */
export async function previewProjectLabour(input: Scope & { fileBase64: string; format: "xlsx" | "csv" }) {
  await projectGate(input, WRITE);
  const analysis = await readLabour(input.fileBase64, input.format);
  const refusal = labourRefusal(analysis);
  return { count: analysis.rows.length, issues: analysis.issues, histogram: analysis.histogram, peak: analysis.peak, fileError: analysis.fileError ? fileCode(analysis.fileError) : null, refusal: refusal ? fileCode(refusal) : null };
}

/** Replace the project's planned labour with the file's rows: the plan is one file, so a row no longer in it goes. */
export async function saveProjectLabour(input: Scope & { fileBase64: string; format: "xlsx" | "csv" }) {
  const db = await projectGate(input, WRITE);
  const analysis = await readLabour(input.fileBase64, input.format);
  const refusal = labourRefusal(analysis);
  if (refusal) throw new TRPCError({ code: "BAD_REQUEST", message: fileCode(refusal) });
  await db.transaction(async tx => {
    await tx.delete(projectPlannedLabour).where(mine(projectPlannedLabour, input));
    const inserted = await tx.insert(projectPlannedLabour).values(analysis.rows.map(row => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, month: row.month, trade: row.trade, workers: row.workers }))).returning({ id: projectPlannedLabour.id });
    // the proof of the write is one returned row per row of the file
    if (inserted.length !== analysis.rows.length) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.planned_labour_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ rows: analysis.rows.length, peak: analysis.peak }) });
  });
  return getBaselineStatus(input);
}

export async function labourTemplate(input: Scope & { locale: "ar" | "en" | "ur" }) {
  await projectGate(input, READ);
  const headers = input.locale === "ar" ? ["الشهر", "المهنة", "العمالة"] : input.locale === "ur" ? ["مہینہ", "پیشہ", "مزدور"] : ["Month", "Trade", "Workers"];
  const bytes = await buildSpreadsheet({ sheetName: "Labour", headers, rows: [["2027-01", "Masons", 20], ["2027-01", "Carpenters", 12], ["2027-02", "Masons", 35]], format: "xlsx" });
  return { fileName: "planned-labour.xlsx", base64: bytes.toString("base64") };
}
