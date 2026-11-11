// The unit-completion matrix, written into project control (PMC) through the importers PMC already has: locations (zone → block → unit), the catalogue (groups, divisions, activities,
// weights, per model), then one COMPLETE status per complete cell. All three run in ONE transaction, each seeing what the one before wrote, so a refusal anywhere writes nothing.
// `analyze` runs exactly the same steps and then rolls the transaction back: what the person approves is what a confirmation does, counted by the database itself.
// The unit's ERP (Oracle) code is kept on the unit as its foreign key. Computed columns, the totals row and the pivot table are never written, only compared (domain/smartImport/matrix.ts).
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, pmcActivityDefinitions, dataImportRowResults, dataImportSources, dataImports, pmcUnitActivityProgress, pmcUnits } from "../drizzle/schema";
import { refreshStatisticsAfterBulkLoad } from "./bulkLoadStats";
import { readGrid } from "./domain/smartImport/sheetReader";
import { detectMatrix, matrixBlockCode, reconcile, toPmcRows, validateMatrix, type MatchReport, type MatrixIssue, type MatrixModel } from "./domain/smartImport/matrix";
import { summariseMatrix, summariseTracker, type MatrixSummary } from "./domain/smartImport/understand";
import { detectTracker, normName, validateTracker, type TrackerModel } from "./domain/smartImport/tracker";
import { assertFileNotAlreadyImported } from "./db";
import type { PmcImportError } from "./domain/pmcImport";
import { authorize, prepareRows, type Db, type PmcImportReport, type Tx } from "./pmcImportService";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";

type Scope = { userId: number; tenantId: string; projectId: string };
const CHUNK = 50;
const chunks = <T,>(items: T[], size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) => items.slice(index * size, (index + 1) * size));

export type MatrixPlan = {
  fileHash: string;
  /** the activity names of the report: what a saved source profile is recognised by */
  activityNames: string[];
  summary: MatrixSummary;
  match: MatchReport;
  /** a problem that stops the import (weights not 100%, a duplicate code, a PMC rule): nothing is written while there is one */
  errors: Array<PmcImportError | (MatrixIssue & { rowNumber: number })>;
  steps: { locations: PmcImportReport | null; catalog: PmcImportReport | null; status: PmcImportReport | null };
  /** what this report changes, counted by the database: «N activities completed in M villas» */
  changes: { newZones: number; newBlocks: number; newUnits: number; newDefinitions: number; completing: number; unitsTouched: number; unchangedCells: number; erpCodesToSet: number; regressed: number; wirNumbers?: number; villaNumbersSet?: number };
  canConfirm: boolean;
};

class Rollback extends Error { constructor(readonly plan: MatrixPlan) { super("rollback"); } }

type UnitFile = { shape: "matrix"; model: MatrixModel; fileHash: string } | { shape: "tracker"; model: TrackerModel; fileHash: string };
/** The weighted matrix first; then (D-44 b) the site's unit tracker, which has no weights row and so is never mistaken for one. */
export async function readMatrix(bytes: Uint8Array): Promise<UnitFile> {
  const grid = await readGrid(bytes, "xlsx");
  if (!grid.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  for (const sheet of grid.sheets) { const detected = detectMatrix(sheet); if (detected.ok) return { shape: "matrix", model: detected.model, fileHash }; }
  for (const sheet of grid.sheets) { const detected = detectTracker(sheet); if (detected.ok) return { shape: "tracker", model: detected.model, fileHash }; }
  throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_MATRIX_NOT_RECOGNISED" });
}

const asError = (issue: MatrixIssue): PmcImportError & { rowNumber: number } => ({ rowNumber: issue.row ?? 0, code: issue.code, detail: issue.detail });

/** The three steps in order, inside `tx`. Returns the plan; `commit` decides whether the transaction is kept. */
async function run(tx: Tx, input: Scope, model: MatrixModel, fileHash: string, source: { key: string; name: string; bytes: Uint8Array } | null, commit: boolean): Promise<MatrixPlan> {
  const summary = summariseMatrix(model);
  const match = reconcile(model);
  const empty = { newZones: 0, newBlocks: 0, newUnits: 0, newDefinitions: 0, completing: 0, unitsTouched: 0, unchangedCells: 0, erpCodesToSet: 0, regressed: 0 };
  const plan: MatrixPlan = { fileHash, activityNames: model.activities.map(a => a.name), summary, match, errors: validateMatrix(model).map(asError), steps: { locations: null, catalog: null, status: null }, changes: empty, canConfirm: false };
  if (plan.errors.length) throw new Rollback(plan);
  const db = tx as unknown as Db;
  const rows = toPmcRows(model, model.reportDate);
  const stepInput = { ...input };

  const locations = await prepareRows(db, { ...stepInput, kind: "locations" }, { headers: [], rows: rows.locations, errors: [] }, fileHash);
  plan.steps.locations = locations.report;
  if (locations.report.errorCount || !locations.apply) { plan.errors.push(...locations.report.errors); throw new Rollback(plan); }
  await locations.apply(tx);

  // the ERP code: the unit's foreign key to the other system
  const stored = await tx.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, externalCode: pmcUnits.externalCode, villaLabel: pmcUnits.villaLabel }).from(pmcUnits).where(and(eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId)));
  const byNumber = new Map(stored.map(unit => [unit.unitNumber, unit]));
  const toSet = model.units.filter(unit => unit.oracleCode && byNumber.get(unit.serial) && byNumber.get(unit.serial)!.externalCode !== unit.oracleCode);
  for (const unit of toSet) {
    const existing = byNumber.get(unit.serial)!;
    if (existing.externalCode && existing.externalCode !== unit.oracleCode) { plan.errors.push({ rowNumber: unit.row, code: "MATRIX_ORACLE_CODE_CHANGE_BLOCKED", detail: `${existing.externalCode} -> ${unit.oracleCode}` }); }
  }
  if (plan.errors.length) throw new Rollback(plan);
  try {
    for (const batch of chunks(toSet)) await Promise.all(batch.map(unit => tx.update(pmcUnits).set({ externalCode: unit.oracleCode }).where(eq(pmcUnits.id, byNumber.get(unit.serial)!.id)).returning({ id: pmcUnits.id }).then(updated => { if (updated.length !== 1) throw new Error("MATRIX_ORACLE_CODE_NOT_WRITTEN"); })));
  } catch (error) {
    if ((error as { code?: string; cause?: { code?: string } })?.code === "23505" || (error as { cause?: { code?: string } })?.cause?.code === "23505") { plan.errors.push({ rowNumber: 0, code: "MATRIX_ORACLE_CODE_ALREADY_USED" }); throw new Rollback(plan); }
    throw error;
  }

  const catalog = await prepareRows(db, { ...stepInput, kind: "catalog" }, { headers: [], rows: rows.catalog, errors: [] }, fileHash);
  plan.steps.catalog = catalog.report;
  if (catalog.report.errorCount || !catalog.apply) { plan.errors.push(...catalog.report.errors); throw new Rollback(plan); }
  await catalog.apply(tx);

  // work order 22: the WIR number of each activity (the key the consultant's export shares), on every model's copy of it, and the villa number on each unit
  const wirOf = model.activities.filter(activity => activity.wir);
  for (const batch of chunks(wirOf)) await Promise.all(batch.map(activity => tx.update(pmcActivityDefinitions).set({ wirCode: activity.wir!.slice(0, 40) }).where(and(eq(pmcActivityDefinitions.tenantId, input.tenantId), eq(pmcActivityDefinitions.projectId, input.projectId), eq(pmcActivityDefinitions.code, activity.code)))));
  const freshUnits = await tx.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel }).from(pmcUnits).where(and(eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId)));
  const freshByNumber = new Map(freshUnits.map(unit => [unit.unitNumber, unit]));
  const toLabel = model.units.filter(unit => unit.villaLabel && freshByNumber.get(unit.serial) && freshByNumber.get(unit.serial)!.villaLabel !== unit.villaLabel);
  try {
    for (const batch of chunks(toLabel)) await Promise.all(batch.map(unit => tx.update(pmcUnits).set({ villaLabel: unit.villaLabel }).where(eq(pmcUnits.id, freshByNumber.get(unit.serial)!.id)).returning({ id: pmcUnits.id }).then(updated => { if (updated.length !== 1) throw new Error("MATRIX_VILLA_LABEL_NOT_SET"); })));
  } catch (error) {
    if ((error as { code?: string; cause?: { code?: string } })?.code === "23505" || (error as { cause?: { code?: string } })?.cause?.code === "23505") { plan.errors.push({ rowNumber: 0, code: "MATRIX_VILLA_NUMBER_DUPLICATE" }); throw new Rollback(plan); }
    throw error;
  }

  const status = await prepareRows(db, { ...stepInput, kind: "status" }, { headers: [], rows: rows.status, errors: [] }, fileHash);
  plan.steps.status = status.report;
  if (status.report.errorCount || !status.apply) { plan.errors.push(...status.report.errors); throw new Rollback(plan); }
  await status.apply(tx);

  // cells the platform already holds as COMPLETE that this report no longer shows: reported, never reverted (a report cannot silently take work away)
  const completeNow = new Set(model.units.flatMap(unit => unit.complete.flatMap((done, i) => (done ? [`${unit.serial}:${model.activities[i].code}`] : []))));
  const held = await tx.select({ unitNumber: pmcUnits.unitNumber, activityCode: pmcActivityDefinitions.code }).from(pmcUnitActivityProgress)
    .innerJoin(pmcUnits, eq(pmcUnits.id, pmcUnitActivityProgress.unitId)).innerJoin(pmcActivityDefinitions, eq(pmcActivityDefinitions.id, pmcUnitActivityProgress.activityDefinitionId))
    .where(and(eq(pmcUnitActivityProgress.tenantId, input.tenantId), eq(pmcUnitActivityProgress.projectId, input.projectId), eq(pmcUnitActivityProgress.status, "COMPLETE")));
  const regressed = held.filter(cell => !completeNow.has(`${cell.unitNumber}:${cell.activityCode}`)).length;

  const details = (plan.steps.status.details ?? {}) as { completing?: number; units?: number };
  const locDetails = (plan.steps.locations.details ?? {}) as { zones?: number; blocks?: number };
  plan.changes = {
    newZones: locDetails.zones ?? 0, newBlocks: locDetails.blocks ?? 0, newUnits: plan.steps.locations.counts.create, newDefinitions: plan.steps.catalog.counts.create,
    completing: details.completing ?? 0, unitsTouched: details.units ?? 0, unchangedCells: plan.steps.status.counts.unchanged, erpCodesToSet: toSet.length, regressed,
    wirNumbers: wirOf.length, villaNumbersSet: toLabel.length,
  };
  plan.canConfirm = true;

  if (commit) {
    const now = new Date();
    await syncPmcProgressToEvm(tx, input, now); // the WBS items linked to these activities take their progress from the cells, in this same transaction
    if (source) {
      const importId = randomUUID();
      await tx.insert(dataImports).values({
        id: importId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "pmcMatrix", templateCode: "pmcMatrix_v1", sourceFormat: "xlsx", fileName: source.name, fileKey: source.key, fileHash, status: "completed",
        totalRows: model.units.length, validRows: model.units.length, invalidRows: 0, createdRows: plan.changes.newUnits, updatedRows: Math.max(0, model.units.length - plan.changes.newUnits), skippedRows: 0,
        summaryJson: JSON.stringify({ matrix: { reportDate: model.reportDate, units: model.units.length, activities: model.activities.length, changes: plan.changes, match: { units: match.units.matched + "/" + match.units.compared, blocks: match.blocks.matched + "/" + match.blocks.compared, zones: match.zones.matched + "/" + match.zones.compared } } }),
        createdByUserId: input.userId, progressPercent: 100, completedAt: now,
      });
      await tx.insert(dataImportSources).values({ importId, tenantId: input.tenantId, projectId: input.projectId, sourceKey: source.key, sourceName: source.name, detectedKind: "unitMatrix", sheetName: model.sheet, mappingJson: JSON.stringify({ weightsRow: model.weightsRow, headerRows: model.headerRows, activities: model.activities.length, ignored: model.ignored }), mergedCellsFilled: 0 });
      const refreshed = await tx.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber }).from(pmcUnits).where(and(eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId)));
      const unitId = new Map(refreshed.map(unit => [unit.unitNumber, unit.id]));
      const known = new Set(stored.map(unit => unit.unitNumber));
      for (const batch of chunks(model.units, 500)) await tx.insert(dataImportRowResults).values(batch.map(unit => ({ id: randomUUID(), importId, rowNumber: unit.row, rowKey: (unit.oracleCode ?? String(unit.serial)).slice(0, 160), action: (known.has(unit.serial) ? "updated" : "created") as "created" | "updated", entityId: unitId.get(unit.serial) ?? null })));
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.matrix_import_confirmed", entityType: "data_import", entityId: importId, metadata: JSON.stringify({ projectId: input.projectId, fileHash, reportDate: model.reportDate, changes: plan.changes, matchUnits: `${match.units.matched}/${match.units.compared}` }) });
      (plan as MatrixPlan & { importId?: string }).importId = importId;
    }
    return plan;
  }
  throw new Rollback(plan);
}

// ------------------------------------------------------------------ D-44 (b): the site's unit tracker
// Stored as the monthly report's cell status (pmc_unit_activity_progress), the owner's decision of 2026-11-09: «Completed» -> COMPLETE, «On going» -> IN_PROGRESS, empty -> not written.
// The key is the villa number: a villa the project already has keeps its unit (and its number); a new one takes the file's serial. The columns are matched by name to the
// activities of each villa's model (the catalogue comes from the weighted matrix, never from a tracker). A COMPLETE cell is never taken back: «On going» on it is counted, not written.
async function runTracker(tx: Tx, input: Scope, model: TrackerModel, fileHash: string, source: { key: string; name: string } | null, commit: boolean): Promise<MatrixPlan> {
  const db = tx as unknown as Db;
  const changes = { newZones: 0, newBlocks: 0, newUnits: 0, newDefinitions: 0, completing: 0, unitsTouched: 0, unchangedCells: 0, erpCodesToSet: 0, regressed: 0, villaNumbersSet: 0 };
  const plan: MatrixPlan = { fileHash, activityNames: model.activities.map(a => a.name), summary: summariseTracker(model), match: summariseTracker(model).match, errors: validateTracker(model).map(asError), steps: { locations: null, catalog: null, status: null }, changes, canConfirm: false };
  // every problem of the file is gathered before anything is refused, so one report names them all (row and reason)
  const mine = <T extends { tenantId: never; projectId: never }>(table: T) => and(eq(table.tenantId, input.tenantId as never), eq(table.projectId, input.projectId as never));
  const [units, definitions] = await Promise.all([
    tx.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel }).from(pmcUnits).where(mine(pmcUnits as never)),
    tx.select({ modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions as never)),
  ]);
  const byLabel = new Map(units.flatMap(unit => (unit.villaLabel ? [[unit.villaLabel, unit] as const] : [])));
  const byNumber = new Map(units.map(unit => [unit.unitNumber, unit]));
  const catalogue = new Map<string, Map<string, string>>();
  for (const d of definitions) catalogue.set(d.modelCode, (catalogue.get(d.modelCode) ?? new Map()).set(normName(d.name), d.code));
  const numberOf = new Map<number, number>(); const reported = new Set<string>();
  for (const unit of model.units) {
    const known = byLabel.get(unit.villaLabel!);
    if (known) numberOf.set(unit.row, known.unitNumber);
    else if (byNumber.has(unit.serial)) plan.errors.push({ rowNumber: unit.row, code: "TRACKER_SERIAL_TAKEN", detail: `${unit.serial} (${byNumber.get(unit.serial)!.villaLabel ?? "-"})` });
    else numberOf.set(unit.row, unit.serial);
    const activities = catalogue.get(unit.modelCode);
    if (!activities) { plan.errors.push({ rowNumber: unit.row, code: "TRACKER_MODEL_UNKNOWN", detail: unit.modelCode }); continue; }
    unit.statuses.forEach((status, i) => {
      const key = `${model.activities[i].name}|${unit.modelCode}`;
      if (status && !activities.has(normName(model.activities[i].name)) && !reported.has(key)) { reported.add(key); plan.errors.push({ rowNumber: unit.row, code: "TRACKER_ACTIVITY_NOT_IN_CATALOGUE", detail: `${model.activities[i].name} (${unit.modelCode})` }); }
    });
  }
  if (plan.errors.length) throw new Rollback(plan);

  const locationRows = model.units.map(unit => ({ rowNumber: unit.row, cells: { zoneCode: unit.stage, zoneName: unit.stage, blockCode: matrixBlockCode({ zone: unit.stage, block: unit.block }), blockName: unit.block, unitNumber: numberOf.get(unit.row)!, modelCode: unit.modelCode } }));
  const locations = await prepareRows(db, { ...input, kind: "locations" }, { headers: [], rows: locationRows, errors: [] }, fileHash);
  plan.steps.locations = locations.report;
  if (locations.report.errorCount || !locations.apply) { plan.errors.push(...locations.report.errors); throw new Rollback(plan); }
  await locations.apply(tx);
  const fresh = await tx.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel }).from(pmcUnits).where(mine(pmcUnits as never));
  const freshByNumber = new Map(fresh.map(unit => [unit.unitNumber, unit]));
  const toLabel = model.units.filter(unit => freshByNumber.get(numberOf.get(unit.row)!)?.villaLabel !== unit.villaLabel);
  for (const batch of chunks(toLabel)) await Promise.all(batch.map(unit => tx.update(pmcUnits).set({ villaLabel: unit.villaLabel }).where(eq(pmcUnits.id, freshByNumber.get(numberOf.get(unit.row)!)!.id))));

  const held = new Set((await tx.select({ unitNumber: pmcUnits.unitNumber, code: pmcActivityDefinitions.code }).from(pmcUnitActivityProgress)
    .innerJoin(pmcUnits, eq(pmcUnits.id, pmcUnitActivityProgress.unitId)).innerJoin(pmcActivityDefinitions, eq(pmcActivityDefinitions.id, pmcUnitActivityProgress.activityDefinitionId))
    .where(and(eq(pmcUnitActivityProgress.tenantId, input.tenantId), eq(pmcUnitActivityProgress.projectId, input.projectId), eq(pmcUnitActivityProgress.status, "COMPLETE")))).map(cell => `${cell.unitNumber}:${cell.code}`));
  const statusRows: Array<{ rowNumber: number; cells: Record<string, unknown> }> = [];
  for (const unit of model.units) unit.statuses.forEach((status, i) => {
    if (!status) return;
    const unitNumber = numberOf.get(unit.row)!; const activityCode = catalogue.get(unit.modelCode)!.get(normName(model.activities[i].name))!;
    if (status === "IN_PROGRESS" && held.has(`${unitNumber}:${activityCode}`)) { changes.regressed += 1; return; }
    statusRows.push({ rowNumber: unit.row, cells: { unitNumber, activityCode, status: status === "COMPLETE" ? "Complete" : "In Progress" } });
  });
  const status = await prepareRows(db, { ...input, kind: "status" }, { headers: [], rows: statusRows, errors: [] }, fileHash);
  plan.steps.status = status.report;
  if (status.report.errorCount) { plan.errors.push(...status.report.errors); throw new Rollback(plan); }
  if (status.apply) await status.apply(tx);
  const details = (status.report.details ?? {}) as { completing?: number; units?: number };
  const locDetails = (locations.report.details ?? {}) as { zones?: number; blocks?: number };
  Object.assign(changes, { newZones: locDetails.zones ?? 0, newBlocks: locDetails.blocks ?? 0, newUnits: locations.report.counts.create, completing: details.completing ?? 0, unitsTouched: details.units ?? 0, unchangedCells: status.report.counts.unchanged, villaNumbersSet: toLabel.length });
  plan.canConfirm = true;
  if (!commit) throw new Rollback(plan);

  const now = new Date();
  await syncPmcProgressToEvm(tx, input, now);
  if (source) {
    await assertFileNotAlreadyImported(db as never, { tenantId: input.tenantId, fileHash });
    const importId = randomUUID();
    await tx.insert(dataImports).values({
      id: importId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "pmcMatrix", templateCode: "pmcTracker_v1", sourceFormat: "xlsx", fileName: source.name, fileKey: source.key, fileHash, status: "completed",
      totalRows: model.units.length, validRows: model.units.length, invalidRows: 0, createdRows: changes.newUnits, updatedRows: Math.max(0, model.units.length - changes.newUnits), skippedRows: 0,
      summaryJson: JSON.stringify({ tracker: { units: model.units.length, activities: model.activities.length, changes } }), createdByUserId: input.userId, progressPercent: 100, completedAt: now,
    });
    await tx.insert(dataImportSources).values({ importId, tenantId: input.tenantId, projectId: input.projectId, sourceKey: source.key, sourceName: source.name, detectedKind: "unitTracker", sheetName: model.sheet, mappingJson: JSON.stringify({ headerRow: model.headerRow, activities: model.activities.length }), mergedCellsFilled: model.mergedFilled });
    const known = new Set(units.map(unit => unit.unitNumber));
    const refreshed = await tx.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber }).from(pmcUnits).where(mine(pmcUnits as never));
    const unitId = new Map(refreshed.map(unit => [unit.unitNumber, unit.id]));
    for (const batch of chunks(model.units, 500)) await tx.insert(dataImportRowResults).values(batch.map(unit => ({ id: randomUUID(), importId, rowNumber: unit.row, rowKey: (unit.villaLabel ?? String(unit.serial)).slice(0, 160), action: (known.has(numberOf.get(unit.row)!) ? "updated" : "created") as "created" | "updated", entityId: unitId.get(numberOf.get(unit.row)!) ?? null })));
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.tracker_import_confirmed", entityType: "data_import", entityId: importId, metadata: JSON.stringify({ projectId: input.projectId, fileHash, changes }) });
    (plan as MatrixPlan & { importId?: string }).importId = importId;
  }
  return plan;
}

async function inTransaction(input: Scope, file: UnitFile, source: Parameters<typeof run>[4], commit: boolean): Promise<MatrixPlan> {
  const db = await authorize(input); // PMC licence feature + project.pmc.manage, tenant and project
  try { return await db.transaction(tx => (file.shape === "tracker" ? runTracker(tx, input, file.model, file.fileHash, source, commit) : run(tx, input, file.model, file.fileHash, source, commit))); }
  catch (error) { if (error instanceof Rollback) return error.plan; throw error; }
}

/** What the file would do, counted by the database in a transaction that is rolled back. Writes nothing. */
export async function analyzeMatrixImport(input: Scope & { bytes: Uint8Array }): Promise<MatrixPlan> {
  return inTransaction(input, await readMatrix(input.bytes), null, false);
}

/** The approved file, in one transaction. `approvedHash` is the hash the person saw; a different file, or a project that changed so the file no longer passes, writes nothing. */
export async function confirmMatrixImport(input: Scope & { bytes: Uint8Array; approvedHash?: string; source: { key: string; name: string } }): Promise<MatrixPlan & { importId?: string }> {
  const file = await readMatrix(input.bytes);
  if (input.approvedHash && input.approvedHash !== file.fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  const plan = await inTransaction(input, file, { ...input.source, bytes: input.bytes }, true) as MatrixPlan & { importId?: string };
  if (!plan.canConfirm || plan.errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED", cause: plan.errors.slice(0, 20) });
  const db = await authorize(input);
  void refreshStatisticsAfterBulkLoad(db, ["pmc_*"], file.model.units.length * file.model.activities.length);
  return plan;
}

export { matrixBlockCode };
