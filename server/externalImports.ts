// Imports that are not the general data importer but travel the same way (G-139): the PMC files, the master-plan mapping and the master-plan entities.
// Until now each of them carried the file inside the request (3 MB on Vercel). They now use the direct-upload path of `importJobs.ts`: a signed URL to Storage,
// then a background job with progress. This file is the adapter between that machinery and each importer's own analysis and write; the importers' rules are unchanged.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { masterPlanVersions } from "../drizzle/schema";
import { applyMasterPlanMappingFile, assertProjectWithinTenant, assertTenantFeatureAccess, getDb, importMasterPlanSpatialEntitiesFromFile } from "./db";
import { analyzeMasterPlanMappingFile, analyzeMasterPlanSpatialEntityFile } from "./domain/dataImport";
import { PMC_IMPORT_KINDS, type PmcImportKind } from "./domain/pmcImport";
import { analyzePmcImport, confirmPmcImport } from "./pmcImportService";

export const EXTERNAL_MODULES = [...PMC_IMPORT_KINDS.map(kind => `pmc.${kind}` as const), "masterPlanMapping", "masterPlanSpatial"] as const;
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
const gate = (moduleCode: ExternalModule) => (pmcKindOf(moduleCode) ? { permission: "project.pmc.manage", featureCode: "PMC" } : moduleCode === "masterPlanMapping" ? { permission: "project.write", featureCode: "MASTER_PLAN" } : { permission: "project.write", featureCode: "MASTER_PLAN_ENTITIES" });

export async function authorizeExternalImport(input: ExternalScope & { moduleCode: ExternalModule; context?: ExternalContext }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const { permission, featureCode } = gate(input.moduleCode);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission, featureCode, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (!pmcKindOf(input.moduleCode)) {
    const versionId = input.context?.masterPlanVersionId;
    if (!versionId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_CONTEXT_REQUIRED" });
    const [version] = await db.select({ id: masterPlanVersions.id }).from(masterPlanVersions).where(and(eq(masterPlanVersions.id, versionId), eq(masterPlanVersions.tenantId, input.tenantId), eq(masterPlanVersions.projectId, input.projectId))).limit(1);
    if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND" });
  }
  return db;
}

/** Reads and checks the file; writes nothing. */
export async function analyzeExternalImport(input: ExternalScope & { moduleCode: ExternalModule; format: ExternalFormat; bytes: Buffer }): Promise<ExternalAnalysis> {
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
export async function applyExternalImport(input: ExternalScope & { moduleCode: ExternalModule; format: ExternalFormat; bytes: Buffer; fileHash: string; context?: ExternalContext }): Promise<{ createdRows: number; updatedRows: number; skippedRows: number }> {
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
