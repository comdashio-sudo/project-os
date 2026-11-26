// Q-51 batch 2a: applying the project workbook — the PMC sheets (units, activities and weights, baseline by dates, current progress, past inspection
// requests), in that order, through the PMC importer's own checks and writes (pmcImportService.prepareRows): no parallel path. Each sheet is read and
// checked first (domain/projectWorkbookReader.ts: version, headers, keys, examples ignored); then, in one transaction per sheet, prepared against the
// database as the earlier sheets left it and applied — a sheet with any error writes nothing and says why, by sheet, row and field, and the sheets
// after it are checked against what is really stored. Uploading the same workbook again updates (the importer compares with what is stored): no
// duplicate. The other sheets (budget, contracts, materials, stock, BOQ, the project's own data, the team) come in batch 2b and are reported
// «not applied yet». Permission: the PMC importer's own (project.pmc.manage on the project, the PMC feature), checked before anything is read.
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { auditLogs } from "../drizzle/schema";
import type { PmcImportError, PmcImportKind } from "./domain/pmcImport";
import { readProjectWorkbook, type WorkbookError } from "./domain/projectWorkbookReader";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";
import { authorize, prepareRows } from "./pmcImportService";

type Scope = { userId: number; tenantId: string; projectId: string };
/** The workbook's PMC sheets and the importer kind that reads each, in the order they are applied. */
export const WORKBOOK_PMC_SHEETS: ReadonlyArray<readonly [string, PmcImportKind]> = [["units", "locations"], ["activities", "catalog"], ["baseline", "baselineDates"], ["status", "status"], ["requests", "requests"]];
const MAX_BYTES = 3 * 1024 * 1024; // a workbook sent inside a request (CLAUDE.md §5); a larger one goes through the direct upload later
export type WorkbookSheetOutcome = {
  key: string; status: "empty" | "will_apply" | "applied" | "refused" | "not_applied_yet";
  rows: number; counts?: { create: number; update: number; unchanged: number };
  errors: Array<WorkbookError | (PmcImportError & { sheet: string })>;
};
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
        if (!kind) { outcomes.push({ key: sheet.key, status: "not_applied_yet", rows: sheet.rows.length, errors: [] }); continue; }
        // each sheet inside a savepoint: a refused one leaves nothing behind for the next, as in the save
        try { outcomes.push(await tx.transaction(inner => runPmcSheet(inner as unknown as Db, input, sheet.key, kind, sheet.rows, fileHash))); }
        catch (error) { if (!(error instanceof SheetRefused)) throw error; outcomes.push({ key: sheet.key, status: "refused", rows: sheet.rows.length, errors: error.errors.map(item => ({ ...item, sheet: sheet.key })) }); }
      }
      throw new PreviewRollback();
    });
  } catch (error) { if (!(error instanceof PreviewRollback)) throw error; }
  return { fileHash, sheets: outcomes.map(outcome => (outcome.status === "applied" ? { ...outcome, status: "will_apply" as const } : outcome)) };
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
    if (!kind) { outcomes.push({ key: sheet.key, status: "not_applied_yet", rows: sheet.rows.length, errors: [] }); continue; }
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
  return { sheets: outcomes };
}
