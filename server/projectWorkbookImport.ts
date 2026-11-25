// Q-51 batch 2a: applying the project workbook — the PMC sheets (units, activities and weights, baseline by dates, current progress, past inspection
// requests), in that order, through the PMC importer's own checks and writes (pmcImportService.prepareRows): no parallel path. Each sheet is read and
// checked first (domain/projectWorkbookReader.ts: version, headers, keys, examples ignored); then, in one transaction per sheet, prepared against the
// database as the earlier sheets left it and applied — a sheet with any error writes nothing and says why, by sheet, row and field, and the sheets
// after it are checked against what is really stored. Uploading the same workbook again updates (the importer compares with what is stored): no
// duplicate. Batch 2b: budget, contracts, materials and opening stock go through the general importer's own analysis and confirmation
// (createAndAnalyzeDataImport → confirmAndImportData, «upsert»: a second upload updates), the bill of quantities through the base file's own preview
// and save (previewProjectBoq → saveProjectBoq), the project's contract value and dates through saveProjectContract — each with its own permission.
// The team is never invited from here: its rows are listed «awaiting confirmation» (a separate, explicit step). The models sheet feeds the others.
// Permission to start: the PMC importer's own (project.pmc.manage on the project, the PMC feature), checked before anything is read.
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { auditLogs } from "../drizzle/schema";
import type { PmcImportError, PmcImportKind } from "./domain/pmcImport";
import { readProjectWorkbook, type WorkbookError } from "./domain/projectWorkbookReader";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";
import { authorize, prepareRows } from "./pmcImportService";
import ExcelJS from "exceljs";
import { confirmAndImportData, createAndAnalyzeDataImport } from "./db";
import { previewProjectBoq, saveProjectBoq, saveProjectContract } from "./projectBaseline";
import { projectWorkbookSheets, type WorkbookSheet } from "./domain/projectWorkbook";
import type { ImportModuleCode } from "@shared/importTemplateHeaders";

type Scope = { userId: number; tenantId: string; projectId: string };
/** The workbook's PMC sheets and the importer kind that reads each, in the order they are applied. */
export const WORKBOOK_PMC_SHEETS: ReadonlyArray<readonly [string, PmcImportKind]> = [["units", "locations"], ["activities", "catalog"], ["baseline", "baselineDates"], ["status", "status"], ["requests", "requests"]];
const MAX_BYTES = 3 * 1024 * 1024; // a workbook sent inside a request (CLAUDE.md §5); a larger one goes through the direct upload later
export type WorkbookSheetOutcome = {
  key: string; status: "empty" | "applied" | "refused" | "awaiting_confirmation" | "feeds_other_sheets";
  rows: number; counts?: { create: number; update: number; unchanged: number };
  errors: Array<WorkbookError | (PmcImportError & { sheet: string })>;
};
/** The general importer's modules the workbook's sheets go to. */
const GENERAL_SHEETS: Record<string, ImportModuleCode> = { budget: "budget", contracts: "contracts", materials: "materials", stock: "openingBalances" };
type Row = { row: number; cells: Record<string, string> };
/** One sheet's rows as a plain file the existing importer reads (its English header row). The sheet name is unique, so the file's fingerprint
 *  differs on each upload: the general importer refuses the very same bytes twice, and a second upload of the workbook must update, not fail. */
async function plainFile(sheet: WorkbookSheet, rows: Row[]) {
  const book = new ExcelJS.Workbook(); const ws = book.addWorksheet(`${sheet.key}-${randomUUID().slice(0, 8)}`);
  ws.addRow(sheet.columns.map(column => column.en));
  for (const row of rows) ws.addRow(sheet.columns.map(column => { const value = row.cells[column.key]; return value !== "" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value || null; }));
  return Buffer.from(await book.xlsx.writeBuffer()).toString("base64");
}
/** A plain file's row N (header in row 1) is the workbook's row rows[N - 2].row. */
const workbookRow = (rows: Row[], fileRow: number) => rows[fileRow - 2]?.row ?? fileRow;

class SheetRefused extends Error { constructor(readonly errors: PmcImportError[]) { super("sheet refused"); } }

export async function applyProjectWorkbook(input: Scope & { fileBase64: string }): Promise<{ sheets: WorkbookSheetOutcome[] }> {
  const db = await authorize(input);
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  const reading = await readProjectWorkbook(new Uint8Array(bytes));
  if (!reading.recognised) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_WORKBOOK_NOT_RECOGNISED" });
  const pmcKind = new Map(WORKBOOK_PMC_SHEETS);
  const outcomes: WorkbookSheetOutcome[] = [];
  for (const sheet of reading.sheets) {
    const kind = pmcKind.get(sheet.key);
    if (sheet.status === "empty") { outcomes.push({ key: sheet.key, status: "empty", rows: 0, errors: [] }); continue; }
    if (sheet.status === "errors") { outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: sheet.errors }); continue; }
    if (!kind) { outcomes.push(await applyOtherSheet(input, sheet.key, sheet.rows)); continue; }
    const parsed = { headers: [], errors: [], rows: sheet.rows.map(row => ({ rowNumber: row.row, cells: row.cells as Record<string, unknown> })) };
    const fileHash = createHash("sha256").update(JSON.stringify([sheet.key, parsed.rows])).digest("hex");
    try {
      const counts = await db.transaction(async tx => {
        const prepared = await prepareRows(tx as unknown as Parameters<typeof prepareRows>[0], { ...input, kind }, parsed, fileHash);
        if (prepared.report.errorCount > 0 || !prepared.apply) throw new SheetRefused(prepared.report.errors);
        await prepared.apply(tx);
        if (kind === "status" || kind === "catalog" || kind === "locations") await syncPmcProgressToEvm(tx, input, new Date());
        await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.import_confirmed", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ kind, source: "project_workbook", sheet: sheet.key, counts: prepared.report.counts, fileHash }) });
        return prepared.report.counts;
      });
      outcomes.push({ key: sheet.key, status: "applied", rows: sheet.rows.length, counts, errors: [] });
    } catch (error) {
      if (!(error instanceof SheetRefused)) throw error;
      outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: error.errors.map(item => ({ ...item, sheet: sheet.key })) });
    }
  }
  return { sheets: outcomes };
}

/** A refusal the existing save throws (its own checks: a contract value, dates, a duplicate file…) is that sheet's error, never the whole upload's. */
async function applyOtherSheet(input: Scope, key: string, rows: Row[]): Promise<WorkbookSheetOutcome> {
  try { return await applyOtherSheetOrThrow(input, key, rows); } catch (error) {
    if (!(error instanceof TRPCError) || error.code !== "BAD_REQUEST" && error.code !== "CONFLICT") throw error;
    return { key, status: "refused", rows: rows.length, errors: [{ sheet: key, rowNumber: rows[0]?.row ?? 0, code: error.message } as WorkbookSheetOutcome["errors"][number]] };
  }
}
async function applyOtherSheetOrThrow(input: Scope, key: string, rows: Row[]): Promise<WorkbookSheetOutcome> {
  const sheet = projectWorkbookSheets().find(item => item.key === key)!;
  if (key === "models") return { key, status: "feeds_other_sheets", rows: rows.length, errors: [] };
  // the team is never invited from an upload: a person confirms each invitation separately
  if (key === "team") return { key, status: "awaiting_confirmation", rows: rows.length, errors: [] };
  const moduleCode = GENERAL_SHEETS[key];
  if (moduleCode) {
    const analysis = await createAndAnalyzeDataImport({ ...input, moduleCode, fileName: `project-workbook-${key}.xlsx`, sourceFormat: "xlsx", base64: await plainFile(sheet, rows), duplicateMode: "upsert" });
    if (analysis.errors.length) return { key, status: "refused", rows: rows.length, errors: analysis.errors.map(error => ({ sheet: key, rowNumber: workbookRow(rows, error.rowNumber), code: error.code, field: error.field, detail: "detail" in error ? error.detail : undefined })) as WorkbookSheetOutcome["errors"] };
    await confirmAndImportData({ ...input, importId: analysis.id });
    return { key, status: "applied", rows: rows.length, errors: [] };
  }
  if (key === "boq") {
    const file = { ...input, format: "xlsx" as const, fileBase64: await plainFile(sheet, rows) };
    const preview = await previewProjectBoq(file) as { refusal?: string | null; issues?: Array<{ rowNumber: number; code: string; value?: string }> };
    if (preview.refusal || (preview.issues ?? []).length) return { key, status: "refused", rows: rows.length, errors: (preview.issues ?? []).map(issue => ({ sheet: key, rowNumber: workbookRow(rows, issue.rowNumber), code: issue.code, detail: issue.value })).concat(preview.refusal && !(preview.issues ?? []).length ? [{ sheet: key, rowNumber: 0, code: preview.refusal, detail: undefined }] : []) as WorkbookSheetOutcome["errors"] };
    await saveProjectBoq(file);
    return { key, status: "applied", rows: rows.length, errors: [] };
  }
  if (key === "project") {
    // one row: the contract value and its planned dates go through the base file's own save (its checks, its permission, its audit row)
    const [first] = rows;
    await saveProjectContract({ ...input, contractValue: Number(first.cells.contractValue), plannedStartAt: first.cells.plannedStartAt, plannedFinishAt: first.cells.plannedFinishAt });
    return { key, status: "applied", rows: rows.length, errors: [] };
  }
  return { key, status: "feeds_other_sheets", rows: rows.length, errors: [] };
}
