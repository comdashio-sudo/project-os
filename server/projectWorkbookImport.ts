// Q-51 batch 2a: applying the project workbook — the PMC sheets (units, activities and weights, baseline by dates, current progress, past inspection
// requests), in that order, through the PMC importer's own checks and writes (pmcImportService.prepareRows): no parallel path. Each sheet is read and
// checked first (domain/projectWorkbookReader.ts: version, headers, keys, examples ignored); then, in one transaction per sheet, prepared against the
// database as the earlier sheets left it and applied — a sheet with any error writes nothing and says why, by sheet, row and field, and the sheets
// after it are checked against what is really stored. Uploading the same workbook again updates (the importer compares with what is stored): no
// duplicate. Batch 2b: budget, contracts, materials and opening stock go through the general importer's own analysis and confirmation
// (createAndAnalyzeDataImport → confirmAndImportData, «upsert»: a second upload updates), the bill of quantities through the base file's own preview
// and save (previewProjectBoq → saveProjectBoq), the project's contract value and dates through saveProjectContract — each with its own permission.
// In the preview these sheets are only checked (the importer's pure analysis, the BOQ preview, the contract rules): nothing is stored.
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
import { analyzeImportFile } from "./domain/dataImport";
import { previewProjectBoq, saveProjectBoq, saveProjectContract } from "./projectBaseline";
import { projectWorkbookSheets, type WorkbookSheet } from "./domain/projectWorkbook";
import type { ImportModuleCode } from "@shared/importTemplateHeaders";

type Scope = { userId: number; tenantId: string; projectId: string };
/** The workbook's PMC sheets and the importer kind that reads each, in the order they are applied. */
export const WORKBOOK_PMC_SHEETS: ReadonlyArray<readonly [string, PmcImportKind]> = [["units", "locations"], ["activities", "catalog"], ["baseline", "baselineDates"], ["status", "status"], ["requests", "requests"]];
const MAX_BYTES = 3 * 1024 * 1024; // a workbook sent inside a request (CLAUDE.md §5); a larger one goes through the direct upload later
export type WorkbookSheetOutcome = {
  key: string; status: "empty" | "will_apply" | "applied" | "refused" | "awaiting_confirmation" | "feeds_other_sheets";
  rows: number; counts?: { create: number; update: number; unchanged: number };
  /** The sheet's name in each language, from the workbook's own table (added to every outcome before it is returned). */
  title?: { ar: string; en: string; ur: string };
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
const sheetSpec = (key: string) => projectWorkbookSheets().find(item => item.key === key)!;

class SheetRefused extends Error { constructor(readonly errors: PmcImportError[]) { super("sheet refused"); } }

class PreviewRollback extends Error { constructor() { super("preview"); } }

async function readUpload(input: Scope & { fileBase64: string }) {
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  const reading = await readProjectWorkbook(new Uint8Array(bytes));
  if (!reading.recognised) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_WORKBOOK_NOT_RECOGNISED" });
  return { reading, fileHash: createHash("sha256").update(bytes).digest("hex") };
}

type Db = Awaited<ReturnType<typeof authorize>>;
/** One PMC sheet, prepared against `tx` (which already holds what the earlier sheets wrote) and applied to it; a sheet with an error writes nothing. */
async function runPmcSheet(tx: Db, input: Scope, key: string, kind: PmcImportKind, rows: Array<{ row: number; cells: Record<string, string> }>, fileHash: string): Promise<WorkbookSheetOutcome> {
  const parsed = { headers: [], errors: [], rows: rows.map(row => ({ rowNumber: row.row, cells: row.cells as Record<string, unknown> })) };
  const prepared = await prepareRows(tx as unknown as Parameters<typeof prepareRows>[0], { ...input, kind }, parsed, fileHash);
  if (prepared.report.errorCount > 0 || !prepared.apply) throw new SheetRefused(prepared.report.errors);
  await prepared.apply(tx as never);
  if (kind === "status" || kind === "catalog" || kind === "locations") await syncPmcProgressToEvm(tx as never, input, new Date());
  return { key, status: "applied", rows: rows.length, counts: prepared.report.counts, errors: [] };
}

/** Review of #527 (Q-10/Q-3: «a validation report before saving»): what the workbook would do, sheet by sheet — the counts it would create, update
 *  or leave unchanged, or the errors that refuse a sheet — computed exactly as the save would, then rolled back: nothing is written. The save takes the
 *  file's fingerprint from this preview and refuses another file. */
export async function previewProjectWorkbook(input: Scope & { fileBase64: string }): Promise<{ fileHash: string; sheets: WorkbookSheetOutcome[] }> {
  const db = await authorize(input);
  const { reading, fileHash } = await readUpload(input);
  const pmcKind = new Map(WORKBOOK_PMC_SHEETS);
  const outcomes: WorkbookSheetOutcome[] = [];
  try {
    await db.transaction(async tx => {
      for (const sheet of reading.sheets) {
        const kind = pmcKind.get(sheet.key);
        if (sheet.status === "empty") { outcomes.push({ key: sheet.key, status: "empty", rows: 0, errors: [] }); continue; }
        if (sheet.status === "errors") { outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: sheet.errors }); continue; }
        if (!kind) { outcomes.push(await previewOtherSheet(input, sheet.key, sheet.rows)); continue; }
        // each sheet inside a savepoint: a refused one leaves nothing behind for the next, as in the save
        try { outcomes.push(await tx.transaction(inner => runPmcSheet(inner as unknown as Db, input, sheet.key, kind, sheet.rows, fileHash))); }
        catch (error) { if (!(error instanceof SheetRefused)) throw error; outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: error.errors.map(item => ({ ...item, sheet: sheet.key })) }); }
      }
      throw new PreviewRollback();
    });
  } catch (error) { if (!(error instanceof PreviewRollback)) throw error; }
  return { fileHash, sheets: titled(outcomes.map(outcome => (outcome.status === "applied" ? { ...outcome, status: "will_apply" as const } : outcome))) };
}

export async function applyProjectWorkbook(input: Scope & { fileBase64: string; approvedHash: string }): Promise<{ sheets: WorkbookSheetOutcome[] }> {
  const db = await authorize(input);
  const { reading, fileHash } = await readUpload(input);
  // only the very file the person previewed is saved
  if (fileHash !== input.approvedHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  const pmcKind = new Map(WORKBOOK_PMC_SHEETS);
  const outcomes: WorkbookSheetOutcome[] = [];
  for (const sheet of reading.sheets) {
    const kind = pmcKind.get(sheet.key);
    if (sheet.status === "empty") { outcomes.push({ key: sheet.key, status: "empty", rows: 0, errors: [] }); continue; }
    if (sheet.status === "errors") { outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: sheet.errors }); continue; }
    if (!kind) { outcomes.push(await applyOtherSheet(input, sheet.key, sheet.rows)); continue; }
    try {
      const outcome = await db.transaction(async tx => {
        const done = await runPmcSheet(tx as unknown as Db, input, sheet.key, kind, sheet.rows, fileHash);
        await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.import_confirmed", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ kind, source: "project_workbook", sheet: sheet.key, counts: done.counts, fileHash }) });
        return done;
      });
      outcomes.push(outcome);
    } catch (error) {
      if (!(error instanceof SheetRefused)) throw error;
      outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: error.errors.map(item => ({ ...item, sheet: sheet.key })) });
    }
  }
  return { sheets: titled(outcomes) };
}
const titled = (outcomes: WorkbookSheetOutcome[]) => outcomes.map(outcome => { const sheet = sheetSpec(outcome.key); return { ...outcome, title: { ar: sheet.ar, en: sheet.en, ur: sheet.ur } }; });

/** The contract rules saveProjectContract applies, checked without saving (the preview). */
function contractRefusal(cells: Record<string, string>): string | null {
  const value = Number(cells.contractValue);
  if (!Number.isFinite(value) || value <= 0 || value >= 1e15) return "PROJECT_OS_CONTRACT_VALUE_INVALID";
  const start = /^\d{4}-\d{2}-\d{2}$/.test(cells.plannedStartAt) ? cells.plannedStartAt : ""; const finish = /^\d{4}-\d{2}-\d{2}$/.test(cells.plannedFinishAt) ? cells.plannedFinishAt : "";
  return !start || !finish || finish < start ? "PROJECT_OS_CONTRACT_DATES_INVALID" : null;
}
const refused = (key: string, rows: Row[], errors: Array<{ rowNumber: number; code: string; field?: string; detail?: string }>): WorkbookSheetOutcome => ({ key, status: "refused", rows: rows.length, errors: errors.map(error => ({ sheet: key, ...error })) as WorkbookSheetOutcome["errors"] });

/** Batch 2b preview of the sheets that are not PMC: checked as their save would check them, nothing stored. */
async function previewOtherSheet(input: Scope, key: string, rows: Row[]): Promise<WorkbookSheetOutcome> {
  if (key === "models") return { key, status: "feeds_other_sheets", rows: rows.length, errors: [] };
  if (key === "team") return { key, status: "awaiting_confirmation", rows: rows.length, errors: [] };
  const moduleCode = GENERAL_SHEETS[key];
  if (moduleCode) {
    const analysis = await analyzeImportFile({ moduleCode, format: "xlsx", bytes: new Uint8Array(Buffer.from(await plainFile(sheetSpec(key), rows), "base64")) });
    return analysis.errors.length ? refused(key, rows, analysis.errors.map(error => ({ rowNumber: workbookRow(rows, error.rowNumber), code: error.code, field: error.field, detail: "detail" in error ? error.detail : undefined }))) : { key, status: "will_apply", rows: rows.length, errors: [] };
  }
  if (key === "boq") {
    const preview = await previewProjectBoq({ ...input, format: "xlsx", fileBase64: await plainFile(sheetSpec(key), rows) }) as { refusal?: string | null; issues?: Array<{ rowNumber: number; code: string; value?: string }> };
    const issues = (preview.issues ?? []).map(issue => ({ rowNumber: workbookRow(rows, issue.rowNumber), code: issue.code, detail: issue.value }));
    if (issues.length) return refused(key, rows, issues);
    return preview.refusal ? refused(key, rows, [{ rowNumber: 0, code: preview.refusal }]) : { key, status: "will_apply", rows: rows.length, errors: [] };
  }
  if (key === "project") { const refusal = contractRefusal(rows[0].cells); return refusal ? refused(key, rows, [{ rowNumber: rows[0].row, code: refusal }]) : { key, status: "will_apply", rows: rows.length, errors: [] }; }
  return { key, status: "feeds_other_sheets", rows: rows.length, errors: [] };
}

/** A refusal the existing save throws (its own checks: a contract value, dates, a duplicate file…) is that sheet's error, never the whole upload's. */
async function applyOtherSheet(input: Scope, key: string, rows: Row[]): Promise<WorkbookSheetOutcome> {
  try { return await applyOtherSheetOrThrow(input, key, rows); } catch (error) {
    if (!(error instanceof TRPCError) || error.code !== "BAD_REQUEST" && error.code !== "CONFLICT") throw error;
    return refused(key, rows, [{ rowNumber: rows[0]?.row ?? 0, code: error.message }]);
  }
}
async function applyOtherSheetOrThrow(input: Scope, key: string, rows: Row[]): Promise<WorkbookSheetOutcome> {
  if (key === "models") return { key, status: "feeds_other_sheets", rows: rows.length, errors: [] };
  // the team is never invited from an upload: a person confirms each invitation separately
  if (key === "team") return { key, status: "awaiting_confirmation", rows: rows.length, errors: [] };
  const moduleCode = GENERAL_SHEETS[key];
  if (moduleCode) {
    const analysis = await createAndAnalyzeDataImport({ ...input, moduleCode, fileName: `project-workbook-${key}.xlsx`, sourceFormat: "xlsx", base64: await plainFile(sheetSpec(key), rows), duplicateMode: "upsert" });
    if (analysis.errors.length) return refused(key, rows, analysis.errors.map(error => ({ rowNumber: workbookRow(rows, error.rowNumber), code: error.code, field: error.field, detail: "detail" in error ? error.detail : undefined })));
    await confirmAndImportData({ ...input, importId: analysis.id });
    return { key, status: "applied", rows: rows.length, errors: [] };
  }
  if (key === "boq") {
    const file = { ...input, format: "xlsx" as const, fileBase64: await plainFile(sheetSpec(key), rows) };
    const preview = await previewOtherSheet(input, key, rows);
    if (preview.status === "refused") return preview;
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
