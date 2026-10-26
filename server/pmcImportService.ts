// Import of PMC data from files, in two steps so that nothing is saved until a
// person has read the validation report: `analyze` writes nothing; `confirm`
// re-reads the same bytes (checked against the hash the person approved),
// re-checks them against the project as it is now, and applies the plan in one
// transaction. Re-importing a file the project already holds changes nothing.
import { cellsWithoutAcceptedInspection, loadTenantPolicy, ncrAcceptanceVerdict } from "./qualityGate";
import { createHash } from "node:crypto";
import { refreshStatisticsAfterBulkLoad } from "./bulkLoadStats";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";
import {
  auditLogs,
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
  pmcDefinitionKey,
  planBaseline,
  planBaselineDates,
  planCatalog,
  planLocations,
  planRequests,
  planStatus,
  type PmcImportCounts,
  type PmcImportError,
  type ParsedFile,
  type PmcImportKind,
  type PmcStatus,
} from "./domain/pmcImport";
import { PMC_INSPECTION_STEPS } from "./pmcService";

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

export type Prepared = { report: PmcImportReport; apply: ((tx: Tx) => Promise<void>) | null };

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

const report = (kind: PmcImportKind, fileHash: string, totalRows: number, errors: PmcImportError[], counts: PmcImportCounts, details: Record<string, unknown> = {}): PmcImportReport => ({ kind, fileHash, totalRows, errorCount: errors.length, errors: errors.slice(0, MAX_REPORTED_ERRORS), counts, details, canConfirm: errors.length === 0 && counts.create + counts.update > 0 });

async function prepare(db: Db, input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv" } & ({ base64: string } | { bytes: Buffer })): Promise<Prepared> {
  // `bytes`: the file came through the direct-upload path (a signed URL, up to MAX_DIRECT_UPLOAD_BYTES), so it was size-checked there and is not limited to a request body.
  const { bytes, fileHash } = "bytes" in input ? { bytes: input.bytes, fileHash: createHash("sha256").update(input.bytes).digest("hex") } : decode(input.base64);
  const parsed = await parsePmcImportFile({ kind: input.kind, format: input.format, bytes });
  const none: PmcImportCounts = { create: 0, update: 0, unchanged: 0 };
  if (parsed.errors.length) return { report: report(input.kind, fileHash, 0, parsed.errors, none), apply: null };
  return prepareRows(db, input, parsed, fileHash);
}

/** The checks and the plan for rows that are already read (a file's rows, or the rows a unit-completion matrix was turned into). `db` may be a transaction: later kinds then see what earlier ones wrote. */
export async function prepareRows(db: Db, input: Scope & { kind: PmcImportKind }, parsed: ParsedFile, fileHash: string): Promise<Prepared> {
  const total = parsed.rows.length;
  const scope = input;

  if (input.kind === "locations") {
    const [zones, blocks, units] = await Promise.all([
      db.select({ id: pmcZones.id, code: pmcZones.code }).from(pmcZones).where(mine(pmcZones, scope)),
      db.select({ id: pmcBlocks.id, code: pmcBlocks.code, zoneId: pmcBlocks.zoneId }).from(pmcBlocks).where(mine(pmcBlocks, scope)),
      db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, blockId: pmcUnits.blockId, modelCode: pmcUnits.modelCode, saleStatus: pmcUnits.saleStatus, unitWeight: pmcUnits.unitWeight }).from(pmcUnits).where(mine(pmcUnits, scope)),
    ]);
    const zoneById = new Map(zones.map(zone => [zone.id, zone.code]));
    const blockById = new Map(blocks.map(block => [block.id, block.code]));
    const plan = planLocations(parsed.rows, {
      zones: new Map(zones.map(zone => [zone.code, { id: zone.id }])),
      blocks: new Map(blocks.map(block => [block.code, { id: block.id, zoneCode: zoneById.get(block.zoneId) ?? "" }])),
      units: new Map(units.map(unit => [unit.unitNumber, { id: unit.id, blockCode: blockById.get(unit.blockId) ?? "", modelCode: unit.modelCode, saleStatus: unit.saleStatus, unitWeight: Number(unit.unitWeight) }])),
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
        for (const batch of chunks(plan.newUnits)) await tx.insert(pmcUnits).values(batch.map(unit => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, blockId: blockIds.get(unit.blockCode)!, unitNumber: unit.unitNumber, modelCode: unit.modelCode, saleStatus: unit.saleStatus, unitWeight: String(unit.unitWeight) })));
        for (const unit of plan.updatedUnits) await tx.update(pmcUnits).set({ saleStatus: unit.saleStatus, unitWeight: String(unit.unitWeight) }).where(eq(pmcUnits.id, unit.id));
      },
    };
  }

  if (input.kind === "catalog") {
    const [groups, stages, definitions, wbs] = await Promise.all([
      db.select({ id: pmcActivityGroups.id, code: pmcActivityGroups.code }).from(pmcActivityGroups).where(mine(pmcActivityGroups, scope)),
      db.select({ id: pmcActivityStages.id, code: pmcActivityStages.code, groupId: pmcActivityStages.groupId }).from(pmcActivityStages).where(mine(pmcActivityStages, scope)),
      db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent, groupId: pmcActivityDefinitions.groupId, stageId: pmcActivityDefinitions.stageId, wbsItemId: pmcActivityDefinitions.wbsItemId }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
      db.select({ id: wbsItems.id, code: wbsItems.code }).from(wbsItems).where(mine(wbsItems, scope)),
    ]);
    const groupCodeById = new Map(groups.map(group => [group.id, group.code]));
    const stageCodeById = new Map(stages.map(stage => [stage.id, stage.code]));
    const activityCodesByModel = new Map<string, Set<string>>();
    for (const definition of definitions) activityCodesByModel.set(definition.modelCode, (activityCodesByModel.get(definition.modelCode) ?? new Set()).add(definition.code));
    const plan = planCatalog(parsed.rows, {
      groups: new Map(groups.map(group => [group.code, { id: group.id }])),
      stages: new Map(stages.map(stage => [stage.code, { id: stage.id, groupCode: groupCodeById.get(stage.groupId) ?? "" }])),
      definitions: new Map(definitions.map(definition => [pmcDefinitionKey(definition.modelCode, definition.code), { id: definition.id, weightPercent: Number(definition.weightPercent), groupCode: groupCodeById.get(definition.groupId) ?? "", stageCode: stageCodeById.get(definition.stageId) ?? "", name: definition.name, wbsItemId: definition.wbsItemId }])),
      activityCodesByModel,
      wbsItems: new Map(wbs.map(item => [item.code, item.id])),
    });
    const details = { models: plan.models, groups: plan.newGroups.length, stages: plan.newStages.length };
    if (plan.errors.length) return { report: report("catalog", fileHash, total, plan.errors, plan.counts, details), apply: null };
    return {
      report: report("catalog", fileHash, total, [], plan.counts, details),
      apply: async tx => {
        const groupIds = new Map(groups.map(group => [group.code, group.id]));
        const stageIds = new Map(stages.map(stage => [stage.code, stage.id]));
        for (const group of plan.newGroups) { const id = crypto.randomUUID(); groupIds.set(group.code, id); await tx.insert(pmcActivityGroups).values({ id, tenantId: input.tenantId, projectId: input.projectId, code: group.code, name: group.name }); }
        for (const stage of plan.newStages) { const id = crypto.randomUUID(); stageIds.set(stage.code, id); await tx.insert(pmcActivityStages).values({ id, tenantId: input.tenantId, projectId: input.projectId, groupId: groupIds.get(stage.groupCode)!, code: stage.code, name: stage.name }); }
        for (const batch of chunks(plan.newDefinitions)) await tx.insert(pmcActivityDefinitions).values(batch.map(definition => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, groupId: groupIds.get(definition.groupCode)!, stageId: stageIds.get(definition.stageCode)!, wbsItemId: definition.wbsItemId, modelCode: definition.modelCode, code: definition.code, name: definition.name, weightPercent: String(definition.weightPercent) })));
        for (const definition of plan.updatedDefinitions) await tx.update(pmcActivityDefinitions).set({ name: definition.name, weightPercent: String(definition.weightPercent), groupId: groupIds.get(definition.groupCode)!, stageId: stageIds.get(definition.stageCode)!, wbsItemId: definition.wbsItemId }).where(eq(pmcActivityDefinitions.id, definition.id));
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
        const creates = plan.operations.filter(operation => !operation.existing);
        const created = creates.map(operation => ({ operation, id: crypto.randomUUID() }));
        for (const batch of chunks(created)) {
          await tx.insert(pmcUnitActivityProgress).values(batch.map(({ operation, id }) => ({ id, tenantId: input.tenantId, projectId: input.projectId, unitId: operation.unitId, activityDefinitionId: operation.activityDefinitionId, status: operation.status, verificationStatusId: operation.verificationStatusId, assignedUserId: operation.engineerUserId, lastChangedByUserId: operation.engineerUserId ?? input.userId, lastChangedAt: operation.changedAt ?? now })));
          await tx.insert(pmcUnitActivityHistory).values(batch.map(({ operation, id }) => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, unitActivityProgressId: id, fromStatus: null, toStatus: operation.status, changedByUserId: operation.engineerUserId ?? input.userId, changedAt: operation.changedAt ?? now, note: "import" })));
        }
        for (const operation of plan.operations.filter(item => item.existing)) {
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

/** Reads and checks a file; writes nothing. */
/** `bytes` instead of `base64`: the file came through the direct-upload path (read from Storage by the background job). */
export async function analyzePmcImport(input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv" } & ({ base64: string } | { bytes: Buffer })): Promise<PmcImportReport> {
  const db = await authorize(input);
  return (await prepare(db, input)).report;
}

/**
 * Applies a file the person has seen analysed. `approvedHash` is the hash from
 * that report: if the bytes differ, or the project changed so that the file no
 * longer passes, nothing is saved.
 */
export async function confirmPmcImport(input: Scope & { kind: PmcImportKind; format: "xlsx" | "csv"; approvedHash: string } & ({ base64: string } | { bytes: Buffer })) {
  const db = await authorize(input);
  const prepared = await prepare(db, input);
  if (prepared.report.fileHash !== input.approvedHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  if (prepared.report.errorCount > 0 || !prepared.apply) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" });
  const apply = prepared.apply;
  await db.transaction(async tx => {
    await apply(tx);
    // Statuses, catalog weights/links and the unit list all move PMC progress; the other kinds do not.
    if (input.kind === "status" || input.kind === "catalog" || input.kind === "locations") await syncPmcProgressToEvm(tx, input, new Date());
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.import_confirmed", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ kind: input.kind, fileHash: prepared.report.fileHash, counts: prepared.report.counts, totalRows: prepared.report.totalRows }) });
  });
  void refreshStatisticsAfterBulkLoad(db, ["pmc_*"], prepared.report.totalRows); // never blocks (bulkLoadStats.ts)
  return { kind: input.kind, counts: prepared.report.counts, totalRows: prepared.report.totalRows, fileHash: prepared.report.fileHash };
}

