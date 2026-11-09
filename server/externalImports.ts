// Imports that are not the general data importer but travel the same way (G-139): the PMC files, the master-plan mapping and the master-plan entities.
// Until now each of them carried the file inside the request (3 MB on Vercel). They now use the direct-upload path of `importJobs.ts`: a signed URL to Storage,
// then a background job with progress. This file is the adapter between that machinery and each importer's own analysis and write; the importers' rules are unchanged.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { LEDGER_MODULES, ledgerImportPermission } from "@shared/ledgerImportColumns";
import { masterPlanVersions } from "../drizzle/schema";
import { applyMasterPlanMappingFile, assertProjectWithinTenant, assertTenantFeatureAccess, getDb, importMasterPlanSpatialEntitiesFromFile } from "./db";
import { analyzeMasterPlanMappingFile, analyzeMasterPlanSpatialEntityFile } from "./domain/dataImport";
import { PMC_IMPORT_KINDS, type PmcImportKind } from "./domain/pmcImport";
import { analyzePmcImport, confirmPmcImport } from "./pmcImportService";
import { auditEmployeeRecordsRead, authorizeLedgerModule, isLedgerModule, ledgerPlanHash, planLedgerImport } from "./ledgerImports";
import { applyEquipmentImport, planEquipmentImport, readEquipmentRows } from "./equipmentImport";

export const EXTERNAL_MODULES = [...PMC_IMPORT_KINDS.map(kind => `pmc.${kind}` as const), "masterPlanMapping", "masterPlanSpatial", ...LEDGER_MODULES, "equipment"] as const;
export type ExternalModule = (typeof EXTERNAL_MODULES)[number];
export const isExternalModule = (code: string): code is ExternalModule => (EXTERNAL_MODULES as readonly string[]).includes(code);
/** Only spreadsheets: an XER file is the schedule importer's. */
export type ExternalFormat = "xlsx" | "csv";

export type ExternalContext = { masterPlanVersionId?: string };
export type ExternalScope = { userId: number; tenantId: string; projectId: string };
export type ExternalAnalysis = {
  totalRows: number; validRows: number;
  errors: Array<{ rowNumber: number; code: string; field?: string; detail?: string }>;
  /** What the screen shows next to the verdict (counts of what the file would create / change). Contains no file content. */
  report: Record<string, unknown>;
  /** False when the file is valid but changes nothing (the project already holds it). */
  canConfirm: boolean;
};

const pmcKindOf = (moduleCode: ExternalModule): PmcImportKind | null => (moduleCode.startsWith("pmc.") ? (moduleCode.slice(4) as PmcImportKind) : null);

/** The same permission and plan feature the module's own (in-request) procedure checks, so a person can upload for a module exactly when they could have imported it before. */
const gate = (moduleCode: ExternalModule) => (moduleCode === "equipment" ? { permission: "project.manage", featureCode: "DATA_IMPORT" } : isLedgerModule(moduleCode) ? { permission: ledgerImportPermission[moduleCode], featureCode: "DATA_IMPORT" } : pmcKindOf(moduleCode) ? { permission: "project.pmc.manage", featureCode: "PMC" } : moduleCode === "masterPlanMapping" ? { permission: "project.write", featureCode: "MASTER_PLAN" } : { permission: "project.write", featureCode: "MASTER_PLAN_ENTITIES" });

export async function authorizeExternalImport(input: ExternalScope & { moduleCode: ExternalModule; context?: ExternalContext }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const { permission, featureCode } = gate(input.moduleCode);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission, featureCode, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (isLedgerModule(input.moduleCode)) await authorizeLedgerModule(input, input.moduleCode); // the HR modules also need the company-level HR permission, as the HR screens do
  else if (!pmcKindOf(input.moduleCode) && input.moduleCode !== "equipment") {
    const versionId = input.context?.masterPlanVersionId;
    if (!versionId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_CONTEXT_REQUIRED" });
    const [version] = await db.select({ id: masterPlanVersions.id }).from(masterPlanVersions).where(and(eq(masterPlanVersions.id, versionId), eq(masterPlanVersions.tenantId, input.tenantId), eq(masterPlanVersions.projectId, input.projectId))).limit(1);
    if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND" });
  }
  return db;
}

/** Reads and checks the file; writes nothing. */
export async function analyzeExternalImport(input: ExternalScope & { moduleCode: ExternalModule; format: ExternalFormat; bytes: Buffer }): Promise<ExternalAnalysis> {
  if (isLedgerModule(input.moduleCode)) {
    const db = await getDb();
    if (!db) throw new Error("Database connection is not available");
    const plan = await planLedgerImport(db, input, input.moduleCode, input.format, input.bytes);
    if (plan.readsEmployeeRecords) await auditEmployeeRecordsRead(db, input, input.moduleCode, "analysis", plan.totalRows);
    // a conflict (a posted cost edited in the sheet, an order that left draft, a row changed since the export) blocks the file exactly as a validation error does
    const conflicts = plan.entries.filter(item => item.kind === "conflict").map(item => ({ rowNumber: item.rowNumber, code: item.conflict ?? "IMPORT_CONFLICT" }));
    const errors = [...plan.errors, ...conflicts];
    const badRows = new Set(errors.map(error => error.rowNumber).filter(row => row > 0)).size;
    const count = (kind: string) => plan.entries.filter(item => item.kind === kind).length;
    return { totalRows: plan.totalRows, validRows: Math.max(0, plan.totalRows - badRows), errors, report: { ledger: { new: count("new"), modified: count("modified"), unchanged: count("unchanged"), conflict: conflicts.length, rejected: plan.errors.length, missing: plan.missing.length, hash: ledgerPlanHash(plan) } }, canConfirm: plan.apply !== null };
  }
  if (input.moduleCode === "equipment") {
    const db = await getDb();
    if (!db) throw new Error("Database connection is not available");
    const plan = await planEquipmentImport(db, input, await readEquipmentRows(input.bytes, input.format));
    const invalidRows = new Set(plan.errors.map(error => error.rowNumber).filter(row => row > 0)).size;
    return { totalRows: plan.totalRows, validRows: Math.max(0, plan.totalRows - invalidRows), errors: plan.errors, report: { equipment: { create: plan.creates.length, update: plan.updates.length, unchanged: plan.unchanged } }, canConfirm: !plan.errors.length && plan.creates.length + plan.updates.length > 0 };
  }
  const kind = pmcKindOf(input.moduleCode);
  if (kind) {
    const report = await analyzePmcImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, kind, format: input.format, bytes: input.bytes });
    const invalidRows = new Set(report.errors.map(error => error.rowNumber).filter(row => row > 0)).size;
    return { totalRows: report.totalRows, validRows: Math.max(0, report.totalRows - invalidRows), errors: report.errors, report: { pmc: report }, canConfirm: report.canConfirm };
  }
  const analysis = input.moduleCode === "masterPlanMapping" ? await analyzeMasterPlanMappingFile({ format: input.format, bytes: input.bytes }) : await analyzeMasterPlanSpatialEntityFile({ format: input.format, bytes: input.bytes });
  const total = analysis.validRows.length + new Set(analysis.errors.map(error => error.rowNumber).filter(row => row > 0)).size;
  return { totalRows: total, validRows: analysis.validRows.length, errors: analysis.errors, report: { mapping: analysis.mapping, rows: analysis.validRows.length }, canConfirm: analysis.errors.length === 0 && analysis.validRows.length > 0 };
}

/** The write. For PMC the approved hash is the stored file's own hash (the report the person read described exactly those bytes). */
export type ExternalResults = Array<{ rowNumber: number; key: string; action: "created" | "updated" | "skipped"; entityId: string | null }>;
export async function applyExternalImport(input: ExternalScope & { moduleCode: ExternalModule; format: ExternalFormat; bytes: Buffer; fileHash: string; importId: string; approvedDiffHash?: string; context?: ExternalContext }): Promise<{ createdRows: number; updatedRows: number; skippedRows: number; results?: ExternalResults }> {
  if (isLedgerModule(input.moduleCode)) {
    const db = await getDb();
    if (!db) throw new Error("Database connection is not available");
    // the plan is made again against the project as it is NOW: a conflict or a rejection since the preview stops the import, and so does any difference from what the person approved
    const plan = await planLedgerImport(db, input, input.moduleCode, input.format, input.bytes);
    if (plan.errors.length || plan.entries.some(item => item.kind === "conflict")) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VERSION_CONFLICT" });
    if (input.approvedDiffHash && input.approvedDiffHash !== ledgerPlanHash(plan)) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DIFF_CHANGED" });
    if (!plan.apply) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM" });
    const done = await plan.apply({ importId: input.importId, db });
    return { ...done.counts, results: done.results };
  }
  if (input.moduleCode === "equipment") {
    const db = await getDb();
    if (!db) throw new Error("Database connection is not available");
    return applyEquipmentImport(db, input, await readEquipmentRows(input.bytes, input.format));
  }
  const kind = pmcKindOf(input.moduleCode);
  if (kind) {
    const done = await confirmPmcImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, kind, format: input.format, bytes: input.bytes, approvedHash: input.fileHash });
    return { createdRows: done.counts.create, updatedRows: done.counts.update, skippedRows: done.counts.unchanged };
  }
  const masterPlanVersionId = input.context?.masterPlanVersionId;
  if (!masterPlanVersionId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_CONTEXT_REQUIRED" });
  const scope = { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, masterPlanVersionId, format: input.format, bytes: input.bytes };
  if (input.moduleCode === "masterPlanMapping") return { createdRows: 0, updatedRows: (await applyMasterPlanMappingFile(scope)).updatedRows, skippedRows: 0 };
  return { createdRows: (await importMasterPlanSpatialEntitiesFromFile(scope)).createdRows, updatedRows: 0, skippedRows: 0 };
}
