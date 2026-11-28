// Import of PMC data from files, in two steps so that nothing is saved until a
// person has read the validation report: `analyze` writes nothing; `confirm`
// re-reads the same bytes (checked against the hash the person approved),
// re-checks them against the project as it is now, and applies the plan in one
// transaction. Re-importing a file the project already holds changes nothing.
import { cellsWithoutAcceptedInspection, loadTenantPolicy, ncrAcceptanceVerdict } from "./qualityGate";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { refreshStatisticsAfterBulkLoad } from "./bulkLoadStats";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { headerOverlap, headerSignature, PROFILE_MATCH } from "./domain/importProfiles";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";
import {
  auditLogs,
  importSourceProfiles,
  memberships,
  pmcActivityDefinitions,
  pmcActivityGroups,
  pmcActivityStages,
  pmcBaselines,
  pmcBlocks,
  pmcInspectionRequestUnits,
  pmcInspectionRequests,
  pmcInspectionSteps,
  pmcUnitActivityHistory,
  pmcUnitActivityProgress,
  pmcUnits,
  pmcVerificationStatuses,
  pmcZones,
  users,
  wbsItems,
} from "../drizzle/schema";
import { assertProjectWithinTenant, assertTenantFeatureAccess, ensureDefaultCommercialCatalog, getDb } from "./db";
import {
  monthStart,
  parsePmcImportFile,
  PMC_IMPORT_KINDS,
  pmcDateReading,
  pmcDefinitionKey,
  planBaseline,
  planBaselineDates,
  planCatalog,
  weightsToCatalogRows,
  planLocations,
  planRequests,
  planStatus,
  type PmcImportCounts,
  type PmcImportError,
  type ParsedFile,
  type PmcImportKind,
  type PmcStatus,
  type PmcImportEdits,
  type PmcAppliedEdit,
} from "./domain/pmcImport";
import { lockProjectCells, PMC_INSPECTION_STEPS } from "./pmcService";

export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Scope = { userId: number; tenantId: string; projectId: string };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REPORTED_ERRORS = 200;
const CHUNK = 500;
const chunks = <T,>(items: T[], size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) => items.slice(index * size, (index + 1) * size));
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

export type PmcImportReport = {
  kind: PmcImportKind;
  fileHash: string;
  totalRows: number;
  errorCount: number;
  errors: PmcImportError[];
  counts: PmcImportCounts;
  details: Record<string, unknown>;
  canConfirm: boolean;
};

export type Prepared = { report: PmcImportReport; apply: ((tx: Tx) => Promise<void>) | null; /** Q-66 (6): the file's headers and the profile it was read with, for remembering a choice */ source?: { headers: string[]; rememberedId: string | null } };

export async function authorize(input: Scope) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await ensureDefaultCommercialCatalog(db);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.pmc.manage", featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

function decode(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  return { bytes, fileHash: createHash("sha256").update(bytes).digest("hex") };
}

// Q-66 (grid): the review grid needs every reason, not the first MAX_REPORTED_ERRORS the stored report keeps — collected for the read that asks for them
const fullErrors = new AsyncLocalStorage<PmcImportError[][]>();
const report = (kind: PmcImportKind, fileHash: string, totalRows: number, errors: PmcImportError[], counts: PmcImportCounts, details: Record<string, unknown> = {}): PmcImportReport => {
  fullErrors.getStore()?.push(errors);
  return { kind, fileHash, totalRows, errorCount: errors.length, errors: errors.slice(0, MAX_REPORTED_ERRORS), counts, details, canConfirm: errors.length === 0 && counts.create + counts.update > 0 };
};

/**
 * Q-66 (6): the company's memory of its own files — when a person chose the columns of a PMC file (the mapping override) and the import was confirmed, that
 * choice is kept for this company and this kind under the file's header signature (import_source_profiles, kind «pmc_<kind>», never listed among the job
 * importer's templates). A later file of the same shape whose columns the reader could not settle by name alone is read with the remembered choice — said in
 * the report — and the person can still change it. A file the reader understands by itself is never read differently because of a profile.
 */
export const pmcProfileKind = (kind: PmcImportKind) => `pmc_${kind}`;
async function rememberedMapping(db: Db, tenantId: string, kind: PmcImportKind, headers: string[]): Promise<{ id: string; name: string; map: Record<string, string> } | null> {
  const mine = headerSignature(headers);
  if (!mine.length) return null;
  const profiles = await db.select({ id: importSourceProfiles.id, name: importSourceProfiles.name, headerSignature: importSourceProfiles.headerSignature, columnMapJson: importSourceProfiles.columnMapJson })
    .from(importSourceProfiles).where(and(eq(importSourceProfiles.tenantId, tenantId), eq(importSourceProfiles.kind, pmcProfileKind(kind))));
  let best: { id: string; name: string; map: Record<string, string>; score: number } | null = null;
  for (const profile of profiles) {
    let signature: string[]; let map: Record<string, string>;
    try { signature = JSON.parse(profile.headerSignature); map = JSON.parse(profile.columnMapJson); } catch { continue; }
    const score = headerOverlap(mine, signature);
    if (score >= PROFILE_MATCH && (!best || score > best.score)) best = { id: profile.id, name: profile.name, map, score };
  }
  if (!best) return null;
  // only the choices whose column this file has (a header the file lacks is not carried over)
  const offered = new Set(headers);
  const map = Object.fromEntries(Object.entries(best.map).filter(([, header]) => header === "ignore" || offered.has(header)));
  return Object.keys(map).length ? { id: best.id, name: best.name, map } : null;
}

/**
 * The reading of a PMC file every path shares — the analysis, the write and the review grid (Q-66 batch 1) — so the grid never shows a reading the import
 * does not use. `previewLimit`: how many rows the preview classes (the grid reads them all).
 */
async function readPmcFile(db: Db, input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv"; bytes: Uint8Array; mappingOverride?: Record<string, string>; edits?: PmcImportEdits; previewLimit?: number }) {
  const read = (mappingOverride?: Record<string, string>) => parsePmcImportFile({ kind: input.kind, format: input.format, bytes: input.bytes, mappingOverride, edits: input.edits, ...(input.previewLimit !== undefined ? { previewLimit: input.previewLimit } : {}) });
  let parsed = await read(input.mappingOverride);
  // Q-66 (6): columns the reader could not settle by name, in a file of a shape this company has mapped before → read with that remembered choice, when it reads better
  let remembered: { id: string; name: string; map: Record<string, string> } | null = null;
  if (!input.mappingOverride && parsed.errors.length && parsed.columns?.headers.length) {
    const found = await rememberedMapping(db, input.tenantId, input.kind, parsed.columns.headers);
    if (found) {
      const again = await read(found.map);
      if (again.errors.length < parsed.errors.length) { parsed = again; remembered = found; }
    }
  }
  return { parsed, remembered };
}

async function prepare(db: Db, input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv"; mappingOverride?: Record<string, string>; edits?: PmcImportEdits } & ({ base64: string } | { bytes: Buffer })): Promise<Prepared> {
  // `bytes`: the file came through the direct-upload path (a signed URL, up to MAX_DIRECT_UPLOAD_BYTES), so it was size-checked there and is not limited to a request body.
  const { bytes, fileHash } = "bytes" in input ? { bytes: input.bytes, fileHash: createHash("sha256").update(input.bytes).digest("hex") } : decode(input.base64);
  const { parsed, remembered } = await readPmcFile(db, { ...input, bytes });
  const none: PmcImportCounts = { create: 0, update: 0, unchanged: 0 };
  // Q-31 (P0-02): the report says which column each field was read from (and whether a person chose it), so the screen can show it and offer to change it
  const columns = { ...(parsed.columns ? { columns: parsed.columns } : {}), ...(remembered ? { rememberedMapping: { name: remembered.name, fields: Object.keys(remembered.map).filter(key => key !== "__others__") } } : {}) };
  if (parsed.errors.length) return { report: report(input.kind, fileHash, 0, parsed.errors, none, columns), apply: null };
  const prepared = await prepareRows(db, input, parsed, fileHash);
  // what the reader did quietly is said in the report too: totals lines skipped, sections filled down (Q-31 review of #370, Q-47)
  // Q-48: and the columns no field reads, with a few of their values, so a person sees each was seen and left aside
  const notes = parsed.notes && (parsed.notes.skippedTotals || parsed.notes.filledDown || parsed.notes.ignoredColumns?.length || parsed.notes.edits?.length || parsed.notes.replaced?.length || parsed.notes.ignoredRows?.length || parsed.notes.readRows?.length || parsed.notes.preview?.length || parsed.notes.outlineHeadings) ? parsed.notes : {};
  // Q-66 (4): how the file's numeric dates were read (day or month first), said in the report
  const dateReading = pmcDateReading(input.kind, parsed.rows);
  return { ...prepared, report: { ...prepared.report, details: { ...prepared.report.details, ...columns, ...notes, ...(dateReading ? { dateOrder: dateReading } : {}) } }, source: { headers: parsed.columns?.headers ?? parsed.headers, rememberedId: remembered?.id ?? null } };
}

/** The checks and the plan for rows that are already read (a file's rows, or the rows a unit-completion matrix was turned into). `db` may be a transaction: later kinds then see what earlier ones wrote. */
export async function prepareRows(db: Db, input: Scope & { kind: PmcImportKind; totalTolerance?: number }, parsed: ParsedFile, fileHash: string): Promise<Prepared> {
  const total = parsed.rows.length;
  const scope = input;

  // Q-3: the owner's weights table becomes catalogue rows (every model the villas use when the table names none) and is checked and saved by the catalogue's rules
  if (input.kind === "weights") {
    const models = (await db.selectDistinct({ modelCode: pmcUnits.modelCode }).from(pmcUnits).where(mine(pmcUnits, scope))).map(row => row.modelCode).sort();
    const translated = weightsToCatalogRows(parsed.rows, models, parsed.notes?.fileTotals ?? []);
    // Q-56 (5): a file with no activity-code column names its activities by their names, and the codes made from those names are not the codes an
    // earlier file saved (the owner's original carries «WIR.3.1.1»…, his edited copy none) — so every saved activity read as «omitted» and the whole file
    // was refused. Such a row takes the saved code of the activity of the same model with the same name (only where exactly one has it): a re-import
    // updates the activities instead of dropping them. A file that writes its codes is read as written; an activity with no saved twin is new.
    if (!parsed.rows.some(row => String(row.cells.activityCode ?? "").trim())) {
      const saved = await db.select({ modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope));
      const byName = new Map<string, string[]>();
      for (const definition of saved) { const key = `${definition.modelCode}\u0000${definition.name.trim()}`; byName.set(key, [...(byName.get(key) ?? []), definition.code]); }
      for (const row of translated.rows) {
        const codes = byName.get(`${String(row.cells.modelCode ?? "")}\u0000${String(row.cells.activityName ?? "").trim()}`);
        if (codes?.length === 1) row.cells.activityCode = codes[0];
      }
    }
    // Q-50 batch 5a: the file's own totals line against the sum read (said in the report, never a block: the 100% rule per model decides)
    const extra = { ignoredZeroWeight: translated.ignoredZeroWeight, scaledFromFractions: translated.scaledFromFractions, unitModels: models, ...(translated.totalChecks.length ? { totalChecks: translated.totalChecks } : {}) };
    if (translated.errors.length) return { report: report("weights", fileHash, total, translated.errors, { create: 0, update: 0, unchanged: 0 }, extra), apply: null };
    // Q-47 (owner decision 18-11): a weights total of 99.99–100.01 (rounded for display) is accepted as 100, and the report names those models
    const prepared = await prepareRows(db, { ...input, kind: "catalog", totalTolerance: 0.01 }, { headers: parsed.headers, rows: translated.rows, errors: [] }, fileHash);
    const planned = (prepared.report.details as { models?: Array<{ modelCode: string; totalWeight: number }> } | undefined)?.models ?? [];
    const roundedTotals = planned.filter(model => Math.abs(model.totalWeight - 100) > 0.0001).map(model => ({ modelCode: model.modelCode, totalWeight: model.totalWeight }));
    return { ...prepared, report: { ...prepared.report, kind: "weights", totalRows: total, details: { ...prepared.report.details, ...extra, ...(roundedTotals.length ? { roundedTotals } : {}) } } };
  }

  if (input.kind === "locations") {
    const [zones, blocks, units] = await Promise.all([
      db.select({ id: pmcZones.id, code: pmcZones.code }).from(pmcZones).where(mine(pmcZones, scope)),
      db.select({ id: pmcBlocks.id, code: pmcBlocks.code, zoneId: pmcBlocks.zoneId }).from(pmcBlocks).where(mine(pmcBlocks, scope)),
      db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, blockId: pmcUnits.blockId, modelCode: pmcUnits.modelCode, saleStatus: pmcUnits.saleStatus, unitWeight: pmcUnits.unitWeight, phase: pmcUnits.phase, package: pmcUnits.package, isMockup: pmcUnits.isMockup }).from(pmcUnits).where(mine(pmcUnits, scope)),
    ]);
    const zoneById = new Map(zones.map(zone => [zone.id, zone.code]));
    const blockById = new Map(blocks.map(block => [block.id, block.code]));
    const plan = planLocations(parsed.rows, {
      zones: new Map(zones.map(zone => [zone.code, { id: zone.id }])),
      blocks: new Map(blocks.map(block => [block.code, { id: block.id, zoneCode: zoneById.get(block.zoneId) ?? "" }])),
      units: new Map(units.map(unit => [unit.unitNumber, { id: unit.id, blockCode: blockById.get(unit.blockId) ?? "", modelCode: unit.modelCode, saleStatus: unit.saleStatus, unitWeight: Number(unit.unitWeight), phase: unit.phase, package: unit.package, isMockup: unit.isMockup }])),
    });
    const details = { zones: plan.newZones.length, blocks: plan.newBlocks.length };
    if (plan.errors.length) return { report: report("locations", fileHash, total, plan.errors, plan.counts, details), apply: null };
    return {
      report: report("locations", fileHash, total, [], plan.counts, details),
      apply: async tx => {
        const zoneIds = new Map(zones.map(zone => [zone.code, zone.id]));
        const blockIds = new Map(blocks.map(block => [block.code, block.id]));
        for (const zone of plan.newZones) { const id = crypto.randomUUID(); zoneIds.set(zone.code, id); await tx.insert(pmcZones).values({ id, tenantId: input.tenantId, projectId: input.projectId, code: zone.code, name: zone.name }); }
        for (const block of plan.newBlocks) { const id = crypto.randomUUID(); blockIds.set(block.code, id); await tx.insert(pmcBlocks).values({ id, tenantId: input.tenantId, projectId: input.projectId, zoneId: zoneIds.get(block.zoneCode)!, code: block.code, name: block.name }); }
        for (const batch of chunks(plan.newUnits)) await tx.insert(pmcUnits).values(batch.map(unit => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, blockId: blockIds.get(unit.blockCode)!, unitNumber: unit.unitNumber, modelCode: unit.modelCode, saleStatus: unit.saleStatus, unitWeight: String(unit.unitWeight), phase: unit.phase, package: unit.package, isMockup: unit.isMockup })));
        for (const unit of plan.updatedUnits) await tx.update(pmcUnits).set({ saleStatus: unit.saleStatus, unitWeight: String(unit.unitWeight), phase: unit.phase, package: unit.package, isMockup: unit.isMockup }).where(and(eq(pmcUnits.id, unit.id), eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId)));
      },
    };
  }

  if (input.kind === "catalog") {
    const [groups, stages, definitions, wbs] = await Promise.all([
      db.select({ id: pmcActivityGroups.id, code: pmcActivityGroups.code, nameEn: pmcActivityGroups.nameEn }).from(pmcActivityGroups).where(mine(pmcActivityGroups, scope)),
      db.select({ id: pmcActivityStages.id, code: pmcActivityStages.code, groupId: pmcActivityStages.groupId, nameEn: pmcActivityStages.nameEn }).from(pmcActivityStages).where(mine(pmcActivityStages, scope)),
      db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, nameEn: pmcActivityDefinitions.nameEn, weightPercent: pmcActivityDefinitions.weightPercent, groupId: pmcActivityDefinitions.groupId, stageId: pmcActivityDefinitions.stageId, wbsItemId: pmcActivityDefinitions.wbsItemId }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
      db.select({ id: wbsItems.id, code: wbsItems.code }).from(wbsItems).where(mine(wbsItems, scope)),
    ]);
    const groupCodeById = new Map(groups.map(group => [group.id, group.code]));
    const stageCodeById = new Map(stages.map(stage => [stage.id, stage.code]));
    const activityCodesByModel = new Map<string, Set<string>>();
    for (const definition of definitions) activityCodesByModel.set(definition.modelCode, (activityCodesByModel.get(definition.modelCode) ?? new Set()).add(definition.code));
    const plan = planCatalog(parsed.rows, {
      groups: new Map(groups.map(group => [group.code, { id: group.id, nameEn: group.nameEn }])),
      stages: new Map(stages.map(stage => [stage.code, { id: stage.id, groupCode: groupCodeById.get(stage.groupId) ?? "", nameEn: stage.nameEn }])),
      definitions: new Map(definitions.map(definition => [pmcDefinitionKey(definition.modelCode, definition.code), { id: definition.id, weightPercent: Number(definition.weightPercent), groupCode: groupCodeById.get(definition.groupId) ?? "", stageCode: stageCodeById.get(definition.stageId) ?? "", name: definition.name, wbsItemId: definition.wbsItemId, nameEn: definition.nameEn }])),
      activityCodesByModel,
      wbsItems: new Map(wbs.map(item => [item.code, item.id])),
      totalTolerance: input.totalTolerance,
    });
    // Q-49: names a mixed cell was split into (Arabic | English) are shown in the preview
    const details = { models: plan.models, groups: plan.newGroups.length, stages: plan.newStages.length, ...(plan.splitNames.length ? { splitNames: plan.splitNames } : {}) };
    if (plan.errors.length) return { report: report("catalog", fileHash, total, plan.errors, plan.counts, details), apply: null };
    return {
      report: report("catalog", fileHash, total, [], plan.counts, details),
      apply: async tx => {
        const groupIds = new Map(groups.map(group => [group.code, group.id]));
        const stageIds = new Map(stages.map(stage => [stage.code, stage.id]));
        for (const group of plan.newGroups) { const id = crypto.randomUUID(); groupIds.set(group.code, id); await tx.insert(pmcActivityGroups).values({ id, tenantId: input.tenantId, projectId: input.projectId, code: group.code, name: group.name, nameEn: group.nameEn }); }
        for (const stage of plan.newStages) { const id = crypto.randomUUID(); stageIds.set(stage.code, id); await tx.insert(pmcActivityStages).values({ id, tenantId: input.tenantId, projectId: input.projectId, groupId: groupIds.get(stage.groupCode)!, code: stage.code, name: stage.name, nameEn: stage.nameEn }); }
        for (const batch of chunks(plan.newDefinitions)) await tx.insert(pmcActivityDefinitions).values(batch.map(definition => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, groupId: groupIds.get(definition.groupCode)!, stageId: stageIds.get(definition.stageCode)!, wbsItemId: definition.wbsItemId, modelCode: definition.modelCode, code: definition.code, name: definition.name, nameEn: definition.nameEn, weightPercent: String(definition.weightPercent) })));
        // an English name the file did not give (null) keeps the stored one
        for (const definition of plan.updatedDefinitions) await tx.update(pmcActivityDefinitions).set({ name: definition.name, weightPercent: String(definition.weightPercent), groupId: groupIds.get(definition.groupCode)!, stageId: stageIds.get(definition.stageCode)!, wbsItemId: definition.wbsItemId, ...(definition.nameEn !== null ? { nameEn: definition.nameEn } : {}) }).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.id, definition.id)));
        for (const group of plan.updatedGroupNames) await tx.update(pmcActivityGroups).set({ nameEn: group.nameEn }).where(and(mine(pmcActivityGroups, input), eq(pmcActivityGroups.id, group.id)));
        for (const stage of plan.updatedStageNames) await tx.update(pmcActivityStages).set({ nameEn: stage.nameEn }).where(and(mine(pmcActivityStages, input), eq(pmcActivityStages.id, stage.id)));
      },
    };
  }

  // The remaining kinds all resolve units and activities.
  const [units, definitions] = await Promise.all([
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(mine(pmcUnits, scope)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
  ]);
  const unitMap = new Map(units.map(unit => [unit.unitNumber, { id: unit.id, modelCode: unit.modelCode }]));
  const byModel = new Map<string, Map<string, string>>();
  for (const definition of definitions) byModel.set(definition.modelCode, (byModel.get(definition.modelCode) ?? new Map()).set(definition.code, definition.id));
  const allActivityCodes = new Set(definitions.map(definition => definition.code));

  if (input.kind === "status") {
    const [verification, members, cells] = await Promise.all([
      db.select({ id: pmcVerificationStatuses.id, code: pmcVerificationStatuses.code }).from(pmcVerificationStatuses).where(and(mine(pmcVerificationStatuses, scope), eq(pmcVerificationStatuses.active, true))),
      db.select({ userId: users.id, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active"))),
      db.select({ id: pmcUnitActivityProgress.id, unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status, verificationStatusId: pmcUnitActivityProgress.verificationStatusId }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, scope)),
    ]);
    const plan = planStatus(parsed.rows, {
      units: unitMap,
      definitions: byModel,
      allActivityCodes,
      verificationStatuses: new Map(verification.map(status => [status.code, status.id])),
      engineers: new Map(members.flatMap(member => (member.email ? [[member.email.toLowerCase(), member.userId] as const] : []))),
      cells: new Map(cells.map(cell => [`${cell.unitId}:${cell.activityDefinitionId}`, { id: cell.id, status: cell.status as PmcStatus, verificationStatusId: cell.verificationStatusId }])),
    });
    // The company's quality policy (work order 12, item 7): under "block" a file cannot complete a cell that has no accepted inspection. The database holds the same rule;
    // asking here gives the reason, with the unit, before anything is written.
    if (!plan.errors.length && (await loadTenantPolicy(db, input.tenantId)).qcCompletionMode === "block") {
      const completing = plan.operations.filter(operation => operation.status === "COMPLETE" && operation.existing?.status !== "COMPLETE");
      const missing = await cellsWithoutAcceptedInspection(db, completing.map(operation => ({ unitId: operation.unitId, activityDefinitionId: operation.activityDefinitionId })));
      const missingKeys = new Set(missing.map(cell => `${cell.unitId}:${cell.activityDefinitionId}`));
      for (const operation of completing) if (missingKeys.has(`${operation.unitId}:${operation.activityDefinitionId}`)) plan.errors.push({ rowNumber: 0, code: "QC_NOT_ACCEPTED", field: "status", detail: `unit ${operation.unitNumber}` });
    }
    if (plan.errors.length) return { report: report("status", fileHash, total, plan.errors, plan.counts), apply: null };
    const statusDetails = { completing: plan.operations.filter(operation => operation.status === "COMPLETE" && operation.existing?.status !== "COMPLETE").length, units: new Set(plan.operations.map(operation => operation.unitNumber)).size };
    return {
      report: report("status", fileHash, total, [], plan.counts, statusDetails),
      apply: async tx => {
        const now = new Date();
        // review of #575 (C): the import is a writer of the project's cells like the site's saves, so it takes the same project lock before it locks any
        // cell row, and re-reads the cells inside the transaction — a cell another save created after the file was planned is updated, not inserted twice
        await lockProjectCells(tx, input.projectId);
        const fresh = new Map<string, { id: string; status: PmcStatus }>();
        for (const unitIds of chunks(Array.from(new Set(plan.operations.map(operation => operation.unitId))))) {
          const rows = await tx.select({ id: pmcUnitActivityProgress.id, unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(and(eq(pmcUnitActivityProgress.tenantId, input.tenantId), eq(pmcUnitActivityProgress.projectId, input.projectId), inArray(pmcUnitActivityProgress.unitId, unitIds))).for("update");
          for (const row of rows) fresh.set(`${row.unitId}:${row.activityDefinitionId}`, { id: row.id, status: row.status as PmcStatus });
        }
        const operations = plan.operations.map(operation => ({ ...operation, existing: fresh.get(`${operation.unitId}:${operation.activityDefinitionId}`) ?? null }));
        const creates = operations.filter(operation => !operation.existing);
        const created = creates.map(operation => ({ operation, id: crypto.randomUUID() }));
        for (const batch of chunks(created)) {
          await tx.insert(pmcUnitActivityProgress).values(batch.map(({ operation, id }) => ({ id, tenantId: input.tenantId, projectId: input.projectId, unitId: operation.unitId, activityDefinitionId: operation.activityDefinitionId, status: operation.status, verificationStatusId: operation.verificationStatusId, assignedUserId: operation.engineerUserId, lastChangedByUserId: operation.engineerUserId ?? input.userId, lastChangedAt: operation.changedAt ?? now })));
          await tx.insert(pmcUnitActivityHistory).values(batch.map(({ operation, id }) => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, unitActivityProgressId: id, fromStatus: null, toStatus: operation.status, changedByUserId: operation.engineerUserId ?? input.userId, changedAt: operation.changedAt ?? now, note: "import" })));
        }
        for (const operation of operations.filter(item => item.existing)) {
          const progressId = operation.existing!.id;
          await tx.update(pmcUnitActivityProgress).set({ status: operation.status, verificationStatusId: operation.verificationStatusId, ...(operation.engineerUserId ? { assignedUserId: operation.engineerUserId } : {}), lastChangedByUserId: operation.engineerUserId ?? input.userId, lastChangedAt: operation.changedAt ?? now }).where(eq(pmcUnitActivityProgress.id, progressId));
          if (operation.existing!.status !== operation.status) await tx.insert(pmcUnitActivityHistory).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, unitActivityProgressId: progressId, fromStatus: operation.existing!.status, toStatus: operation.status, changedByUserId: operation.engineerUserId ?? input.userId, changedAt: operation.changedAt ?? now, note: "import" });
        }
      },
    };
  }

  if (input.kind === "requests") {
    const existing = await db.select({ id: pmcInspectionRequests.id, requestCode: pmcInspectionRequests.requestCode, responseCode: pmcInspectionRequests.responseCode }).from(pmcInspectionRequests).where(mine(pmcInspectionRequests, scope));
    const plan = planRequests(parsed.rows, { units: unitMap, definitions: byModel, allActivityCodes, requests: new Map(existing.map(request => [request.requestCode, { id: request.id, responseCode: request.responseCode }])) });
    if (plan.errors.length) return { report: report("requests", fileHash, total, plan.errors, plan.counts), apply: null };
    // work order 14: an accepted answer is not imported while the company's NCR rule (default block) sees an open NCR on its units and activity
    const held: PmcImportError[] = [];
    for (const request of plan.creates) {
      if (!request.responseCode) continue;
      const verdict = await ncrAcceptanceVerdict(db, input.tenantId, request.unitIds, request.activityDefinitionId, request.responseCode);
      if (verdict.mode === "block" && verdict.openNcrs.length) held.push({ rowNumber: 0, code: "PMC_NCR_OPEN_BLOCKS_ACCEPTANCE", field: "responseCode", detail: `${request.requestCode}: ${verdict.openNcrs.slice(0, 5).join(",")}` });
    }
    for (const reply of plan.replies) {
      const [target] = await db.select({ activityDefinitionId: pmcInspectionRequests.activityDefinitionId }).from(pmcInspectionRequests).where(eq(pmcInspectionRequests.id, reply.id)).limit(1);
      const units = await db.select({ unitId: pmcInspectionRequestUnits.unitId }).from(pmcInspectionRequestUnits).where(eq(pmcInspectionRequestUnits.inspectionRequestId, reply.id));
      const verdict = target ? await ncrAcceptanceVerdict(db, input.tenantId, units.map(unit => unit.unitId), target.activityDefinitionId, reply.responseCode) : { mode: "off" as const, openNcrs: [] as string[] };
      if (verdict.mode === "block" && verdict.openNcrs.length) held.push({ rowNumber: 0, code: "PMC_NCR_OPEN_BLOCKS_ACCEPTANCE", field: "responseCode", detail: `${reply.requestCode}: ${verdict.openNcrs.slice(0, 5).join(",")}` });
    }
    if (held.length) return { report: report("requests", fileHash, total, held, plan.counts), apply: null };
    return {
      report: report("requests", fileHash, total, [], plan.counts),
      apply: async tx => {
        const now = new Date();
        for (const request of plan.creates) {
          const id = crypto.randomUUID();
          await tx.insert(pmcInspectionRequests).values({ id, tenantId: input.tenantId, projectId: input.projectId, requestCode: request.requestCode, activityDefinitionId: request.activityDefinitionId, contractorLabel: request.contractorLabel, consultantLabel: request.consultantLabel, responseCode: request.responseCode, requestedAt: request.requestedAt, notes: request.notes });
          for (const batch of chunks(request.unitIds)) await tx.insert(pmcInspectionRequestUnits).values(batch.map(unitId => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, inspectionRequestId: id, unitId })));
          // A request that already has its reply has been through every step; one without is at the first.
          await tx.insert(pmcInspectionSteps).values(PMC_INSPECTION_STEPS.map((stepCode, index) => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, inspectionRequestId: id, stepCode, stepOrder: index + 1, status: request.responseCode ? ("complete" as const) : index === 0 ? ("in_progress" as const) : ("pending" as const), completedAt: request.responseCode ? now : null })));
        }
        for (const reply of plan.replies) {
          await tx.update(pmcInspectionRequests).set({ responseCode: reply.responseCode }).where(eq(pmcInspectionRequests.id, reply.id));
          await tx.update(pmcInspectionSteps).set({ status: "complete", completedAt: now }).where(eq(pmcInspectionSteps.inspectionRequestId, reply.id));
        }
      },
    };
  }

  // baseline
  const stored = await db.select({ id: pmcBaselines.id, activityDefinitionId: pmcBaselines.activityDefinitionId, periodAt: pmcBaselines.periodAt, plannedPercent: pmcBaselines.plannedPercent }).from(pmcBaselines).where(mine(pmcBaselines, scope));
  const storedByDefinition = new Map<string, Map<string, { id: string; plannedPercent: number }>>();
  for (const row of stored) storedByDefinition.set(row.activityDefinitionId, (storedByDefinition.get(row.activityDefinitionId) ?? new Map()).set(monthStart(row.periodAt).toISOString(), { id: row.id, plannedPercent: Number(row.plannedPercent) }));
  const plan = (input.kind === "baselineDates" ? planBaselineDates : planBaseline)(parsed.rows, { definitions: new Map(definitions.map(definition => [pmcDefinitionKey(definition.modelCode, definition.code), definition.id])), stored: storedByDefinition });
  if (plan.errors.length) return { report: report(input.kind, fileHash, total, plan.errors, plan.counts), apply: null };
  return {
    report: report(input.kind, fileHash, total, [], plan.counts),
    apply: async tx => {
      for (const batch of chunks(plan.creates)) await tx.insert(pmcBaselines).values(batch.map(row => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, activityDefinitionId: row.activityDefinitionId, periodAt: row.periodAt, plannedPercent: String(row.plannedPercent) })));
      for (const row of plan.updates) await tx.update(pmcBaselines).set({ plannedPercent: String(row.plannedPercent) }).where(eq(pmcBaselines.id, row.id));
    },
  };
}

/**
 * Q-66 (6) (I3 28-11): the company's remembered PMC column choices, to see and to forget — the kind, the field ← column map, how often each was used and when it
 * last changed. Whoever imports PMC files (project.pmc.manage) sees and deletes them; the company's own only (tenant filter). A deleted choice is simply not
 * remembered any more: the next file of that shape asks for its columns again. Deleting writes its audit row in the same transaction; a choice that is gone
 * (another person deleted it) is refused by name, never taken for success.
 */
export async function listPmcColumnProfiles(input: Scope) {
  const db = await authorize(input);
  const rows = await db.select({ id: importSourceProfiles.id, kind: importSourceProfiles.kind, columnMapJson: importSourceProfiles.columnMapJson, headerSignature: importSourceProfiles.headerSignature, timesUsed: importSourceProfiles.timesUsed, updatedAt: importSourceProfiles.updatedAt })
    .from(importSourceProfiles).where(and(eq(importSourceProfiles.tenantId, input.tenantId), inArray(importSourceProfiles.kind, PMC_IMPORT_KINDS.map(pmcProfileKind))));
  const parse = <T,>(text: string, fallback: T): T => { try { return JSON.parse(text) as T; } catch { return fallback; } };
  return rows.map(row => ({ id: row.id, kind: row.kind.replace(/^pmc_/, "") as PmcImportKind, mapping: parse<Record<string, string>>(row.columnMapJson, {}), headers: parse<string[]>(row.headerSignature, []).length, timesUsed: row.timesUsed, updatedAt: row.updatedAt }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function deletePmcColumnProfile(input: Scope & { profileId: string }) {
  const db = await authorize(input);
  return db.transaction(async tx => {
    const [gone] = await tx.delete(importSourceProfiles).where(and(eq(importSourceProfiles.id, input.profileId), eq(importSourceProfiles.tenantId, input.tenantId), inArray(importSourceProfiles.kind, PMC_IMPORT_KINDS.map(pmcProfileKind))))
      .returning({ id: importSourceProfiles.id, kind: importSourceProfiles.kind });
    if (!gone) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_IMPORT_TEMPLATE_NOT_FOUND" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.column_profile_deleted", entityType: "import_source_profile", entityId: gone.id, metadata: JSON.stringify({ projectId: input.projectId, kind: gone.kind }) });
    return { id: gone.id };
  });
}

/** Keeps (or counts) the column choice of a confirmed PMC import. A choice is saved only when a person made one (the mapping override). */
async function rememberMapping(tx: Tx, input: Scope & { kind: PmcImportKind; userId: number; mappingOverride?: Record<string, string> }, source: { headers: string[]; rememberedId: string | null } | null): Promise<{ id: string; saved: boolean } | null> {
  const chosen = Object.fromEntries(Object.entries(input.mappingOverride ?? {}).filter(([, header]) => typeof header === "string" && header.trim() !== ""));
  if (Object.keys(chosen).length && source?.headers.length) {
    const signature = headerSignature(source.headers);
    // one profile per company, kind and file shape: its name is made from the signature, so the same shape chosen again replaces the earlier choice
    const name = `PMC ${input.kind} ${createHash("sha256").update(JSON.stringify(signature)).digest("hex").slice(0, 10)}`;
    const [row] = await tx.insert(importSourceProfiles).values({ id: crypto.randomUUID(), tenantId: input.tenantId, name, kind: pmcProfileKind(input.kind), headerSignature: JSON.stringify(signature), columnMapJson: JSON.stringify(chosen), timesUsed: 1, createdByUserId: input.userId })
      .onConflictDoUpdate({ target: [importSourceProfiles.tenantId, importSourceProfiles.name], set: { columnMapJson: JSON.stringify(chosen), headerSignature: JSON.stringify(signature), timesUsed: sql`${importSourceProfiles.timesUsed} + 1`, updatedAt: sql`now()` }, setWhere: eq(importSourceProfiles.kind, pmcProfileKind(input.kind)) })
      .returning({ id: importSourceProfiles.id });
    // a name another kind took (it cannot: the kind is in the name) would be left untouched, and nothing is remembered
    return row ? { id: row.id, saved: true } : null;
  }
  if (source?.rememberedId) {
    // a profile deleted since the analysis counts nothing: the audit row then names no profile instead of one that is gone (rows = 0 is never taken for success)
    const [counted] = await tx.update(importSourceProfiles).set({ timesUsed: sql`${importSourceProfiles.timesUsed} + 1`, updatedAt: sql`now()` }).where(and(eq(importSourceProfiles.id, source.rememberedId), eq(importSourceProfiles.tenantId, input.tenantId))).returning({ id: importSourceProfiles.id });
    return counted ? { id: counted.id, saved: false } : null;
  }
  return null;
}

/** Q-50 batch 4: the corrections a report carries (each with the file's value and the one used), for the audit row of the write. */
const correctionsOf = (report: PmcImportReport) => {
  const details = report.details as { edits?: PmcAppliedEdit[]; replaced?: unknown[]; ignoredRows?: number[]; readRows?: number[] };
  return { ...(details.edits?.length ? { edits: details.edits } : {}), ...(details.replaced?.length ? { replaced: details.replaced } : {}), ...(details.ignoredRows?.length ? { ignoredRows: details.ignoredRows } : {}), ...(details.readRows?.length ? { readRows: details.readRows } : {}) };
};

/**
 * Q-66 batch 1 (adviser's I68): the review grid of a stored PMC file — every row read by the importer's own reader with the same columns and corrections,
 * each cell with what the reader did and each reason on its cell, through the same checks as the analysis. Reads only: nothing is written, and the
 * report the person confirms is still the analysis's.
 */
export async function gridOfPmcImport(input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv"; bytes: Buffer; mappingOverride?: Record<string, string>; edits?: PmcImportEdits }) {
  const db = await authorize(input);
  const fileHash = createHash("sha256").update(input.bytes).digest("hex");
  const { parsed } = await readPmcFile(db, { ...input, previewLimit: Number.MAX_SAFE_INTEGER });
  const fields = (parsed.columns?.fields ?? []).filter(field => field.header).map(field => ({ key: field.key, header: field.header!, required: field.required }));
  const sheets = parsed.notes?.sheets ?? [];
  if (parsed.errors.length) return { fields, preview: [] as NonNullable<NonNullable<ParsedFile["notes"]>["preview"]>, errors: parsed.errors, edits: [] as PmcAppliedEdit[], scaledFromFractions: false, ignoredColumns: [] as string[], sheets };
  const collected: PmcImportError[][] = [];
  const prepared = await fullErrors.run(collected, () => prepareRows(db, input, parsed, fileHash));
  const details = prepared.report.details as { scaledFromFractions?: boolean };
  return {
    fields, preview: parsed.notes?.preview ?? [], errors: collected.at(-1) ?? prepared.report.errors, edits: parsed.notes?.edits ?? [], scaledFromFractions: Boolean(details.scaledFromFractions),
    ignoredColumns: (parsed.notes?.ignoredColumns ?? []).map(column => column.header), sheets,
  };
}

/** Reads and checks a file; writes nothing. */
/** `bytes` instead of `base64`: the file came through the direct-upload path (read from Storage by the background job). */
export async function analyzePmcImport(input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv"; mappingOverride?: Record<string, string>; edits?: PmcImportEdits } & ({ base64: string } | { bytes: Buffer })): Promise<PmcImportReport> {
  const db = await authorize(input);
  return (await prepare(db, input)).report;
}

/**
 * Applies a file the person has seen analysed. `approvedHash` is the hash from
 * that report: if the bytes differ, or the project changed so that the file no
 * longer passes, nothing is saved.
 */
export async function confirmPmcImport(input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv"; approvedHash: string; mappingOverride?: Record<string, string>; edits?: PmcImportEdits } & ({ base64: string } | { bytes: Buffer })) {
  const db = await authorize(input);
  const prepared = await prepare(db, input);
  if (prepared.report.fileHash !== input.approvedHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  if (prepared.report.errorCount > 0 || !prepared.apply) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" });
  const apply = prepared.apply;
  await db.transaction(async tx => {
    await apply(tx);
    // Statuses, catalog weights/links and the unit list all move PMC progress; the other kinds do not.
    if (input.kind === "status" || input.kind === "catalog" || input.kind === "weights" || input.kind === "locations") await syncPmcProgressToEvm(tx, input, new Date());
    // Q-66 (6): the columns a person chose are remembered for this company's next file of this shape (same transaction: no import, no memory); a file read
    // with a remembered choice counts one more use of it
    const remembered = await rememberMapping(tx, input, prepared.source ?? null);
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.import_confirmed", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ ...(remembered ? { columnProfile: remembered } : {}), kind: input.kind, fileHash: prepared.report.fileHash, counts: prepared.report.counts, totalRows: prepared.report.totalRows, ...correctionsOf(prepared.report) }) });
  });
  void refreshStatisticsAfterBulkLoad(db, ["pmc_*"], prepared.report.totalRows); // never blocks (bulkLoadStats.ts)
  return { kind: input.kind, counts: prepared.report.counts, totalRows: prepared.report.totalRows, fileHash: prepared.report.fileHash };
}

