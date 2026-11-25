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
  key: string; status: "empty" | "applied" | "refused" | "not_applied_yet";
  rows: number; counts?: { create: number; update: number; unchanged: number };
  errors: Array<WorkbookError | (PmcImportError & { sheet: string })>;
};
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
    if (!kind) { outcomes.push({ key: sheet.key, status: "not_applied_yet", rows: sheet.rows.length, errors: [] }); continue; }
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
