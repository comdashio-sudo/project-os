// Database side of project control (PMC). Every function checks tenant, project,
// the named PMC permission and the PMC licence feature before it touches a row,
// and every write leaves an audit row. The arithmetic is domain/pmc.ts.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  pmcActivityDefinitions,
  pmcActivityGroups,
  pmcActivityStages,
  pmcInspectionRequestUnits,
  pmcInspectionRequests,
  pmcInspectionSteps,
  pmcStatusFactors,
  pmcUnitActivityHistory,
  pmcUnitActivityProgress,
  pmcUnits,
  pmcVerificationStatuses,
} from "../drizzle/schema";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";
import { assertProjectWithinTenant, assertTenantFeatureAccess, ensureDefaultCommercialCatalog, getDb } from "./db";
import { calculateActivityCompletion, calculateProjectProgress, calculateUnitProgress, DEFAULT_STATUS_FACTORS, effectiveStatusFactors, type PmcUnitActivityStatus } from "./domain/pmc";

export const PMC_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"] as const;
export const PMC_INSPECTION_STEPS = ["CONFIGURATIONS", "MANAGER_APPROVAL", "TECHNICAL_ASSISTANT", "WAITING_CONSULTANT", "RESULT_RECEIVING"] as const;
export type PmcInspectionStepCode = (typeof PMC_INSPECTION_STEPS)[number];

type Scope = { userId: number; tenantId: string; projectId: string };
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });

async function authorize(input: Scope, permission: "project.pmc.read" | "project.pmc.update" | "project.pmc.manage") {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await ensureDefaultCommercialCatalog(db);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission, featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

// ------------------------------------------------------------ status factors

export async function getPmcStatusFactors(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  const rows = await db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, input));
  return effectiveFactors(rows);
}

const effectiveFactors = effectiveStatusFactors;

/** A later status can never earn less credit than an earlier one, and none can exceed 100%. */
export function assertValidFactors(factors: Record<PmcUnitActivityStatus, number>) {
  const ordered = PMC_STATUSES.map(status => factors[status]);
  const valid = ordered.every(value => Number.isFinite(value) && value >= 0 && value <= 1) && ordered.every((value, index) => index === 0 || value >= ordered[index - 1]);
  if (!valid) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_STATUS_FACTORS_INVALID");
}

export async function setPmcStatusFactors(input: Scope & { factors: Partial<Record<PmcUnitActivityStatus, number>> }) {
  const db = await authorize(input, "project.pmc.manage");
  const current = effectiveFactors(await db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, input)));
  const next = { ...current, ...input.factors };
  assertValidFactors(next);
  await db.transaction(async tx => {
    for (const status of Object.keys(input.factors) as PmcUnitActivityStatus[]) {
      await tx.insert(pmcStatusFactors).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, status, factor: String(next[status]), updatedByUserId: input.userId }).onConflictDoUpdate({ target: [pmcStatusFactors.projectId, pmcStatusFactors.status], set: { factor: String(next[status]), updatedByUserId: input.userId } });
    }
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.status_factors_changed", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ before: current, after: next }) });
    await syncPmcProgressToEvm(tx, input, new Date());
  });
  return next;
}

// ------------------------------------------------- verification / disbursement list

export async function listPmcVerificationStatuses(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  return db.select({ id: pmcVerificationStatuses.id, code: pmcVerificationStatuses.code, label: pmcVerificationStatuses.label, sortOrder: pmcVerificationStatuses.sortOrder, active: pmcVerificationStatuses.active, pending: pmcVerificationStatuses.pending }).from(pmcVerificationStatuses).where(mine(pmcVerificationStatuses, input)).orderBy(asc(pmcVerificationStatuses.sortOrder), asc(pmcVerificationStatuses.code));
}

/** The list is the tenant's decision: names are never fixed in code. A status in use can be deactivated but not deleted. */
export async function savePmcVerificationStatuses(input: Scope & { statuses: Array<{ code: string; label: string; sortOrder: number; active: boolean; pending?: boolean }> }) {
  const db = await authorize(input, "project.pmc.manage");
  const codes = input.statuses.map(status => status.code);
  if (new Set(codes).size !== codes.length) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_STATUS_CODE_DUPLICATE");
  await db.transaction(async tx => {
    for (const status of input.statuses) {
      await tx.insert(pmcVerificationStatuses).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, code: status.code, label: status.label, sortOrder: status.sortOrder, active: status.active, pending: status.pending ?? false }).onConflictDoUpdate({ target: [pmcVerificationStatuses.projectId, pmcVerificationStatuses.code], set: { label: status.label, sortOrder: status.sortOrder, active: status.active, pending: status.pending ?? false } });
    }
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.verification_statuses_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ codes }) });
  });
  return listPmcVerificationStatuses(input);
}

// ------------------------------------------------------------- unit-activity cell

/**
 * Sets the status of one cell (unit x activity). History records every status
 * change (from, to, who, when) in the same transaction; asking for the state the
 * cell is already in changes nothing and writes nothing.
 */
export async function setPmcUnitActivityStatus(input: Scope & { unitId: string; activityDefinitionId: string; status: PmcUnitActivityStatus; verificationStatusId?: string | null; note?: string }) {
  const db = await authorize(input, "project.pmc.update");
  const [unit] = await db.select({ id: pmcUnits.id, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(mine(pmcUnits, input), eq(pmcUnits.id, input.unitId))).limit(1);
  if (!unit) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND");
  const [activity] = await db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.id, input.activityDefinitionId))).limit(1);
  if (!activity) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
  // A unit only has the activities of its own model: this is what keeps completion at or below 100%.
  if (activity.modelCode !== unit.modelCode) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL");
  if (input.verificationStatusId) {
    const [status] = await db.select({ id: pmcVerificationStatuses.id, active: pmcVerificationStatuses.active }).from(pmcVerificationStatuses).where(and(mine(pmcVerificationStatuses, input), eq(pmcVerificationStatuses.id, input.verificationStatusId))).limit(1);
    if (!status) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_VERIFICATION_STATUS_NOT_FOUND");
    if (!status.active) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_VERIFICATION_STATUS_INACTIVE");
  }
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(pmcUnitActivityProgress).where(and(eq(pmcUnitActivityProgress.unitId, input.unitId), eq(pmcUnitActivityProgress.activityDefinitionId, input.activityDefinitionId), eq(pmcUnitActivityProgress.tenantId, input.tenantId), eq(pmcUnitActivityProgress.projectId, input.projectId))).for("update").limit(1);
    const verificationStatusId = input.verificationStatusId === undefined ? (existing?.verificationStatusId ?? null) : input.verificationStatusId;
    if (existing && existing.status === input.status && existing.verificationStatusId === verificationStatusId) return { progressId: existing.id, from: existing.status, to: input.status, changed: false as const, evm: null };
    const progressId = existing?.id ?? crypto.randomUUID();
    const now = new Date();
    if (existing) await tx.update(pmcUnitActivityProgress).set({ status: input.status, verificationStatusId, lastChangedByUserId: input.userId, lastChangedAt: now }).where(eq(pmcUnitActivityProgress.id, existing.id));
    else await tx.insert(pmcUnitActivityProgress).values({ id: progressId, tenantId: input.tenantId, projectId: input.projectId, unitId: input.unitId, activityDefinitionId: input.activityDefinitionId, status: input.status, verificationStatusId, lastChangedByUserId: input.userId, lastChangedAt: now });
    const from = existing?.status ?? null;
    if (from !== input.status) await tx.insert(pmcUnitActivityHistory).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, unitActivityProgressId: progressId, fromStatus: from, toStatus: input.status, changedByUserId: input.userId, changedAt: now, note: input.note });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.unit_activity_changed", entityType: "pmc_unit_activity_progress", entityId: progressId, metadata: JSON.stringify({ projectId: input.projectId, unitId: input.unitId, activityDefinitionId: input.activityDefinitionId, from, to: input.status, verificationStatusId }) });
    // Rule 7: the WBS items linked to activities take their progress from the cells, in this same transaction.
    const evm = await syncPmcProgressToEvm(tx, input, now);
    return { progressId, from, to: input.status, changed: true as const, evm };
  });
}

// ------------------------------------------------------------ progress (rules 1-4)

/**
 * Unit, project and activity progress from the records. A model whose weights do
 * not total 100% yields no number for its units (with the reason) rather than a
 * wrong one, and the other units are still reported.
 */
export async function getPmcProgress(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  const [units, definitions, groups, stages, cells, factorRows] = await Promise.all([
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, unitWeight: pmcUnits.unitWeight }).from(pmcUnits).where(mine(pmcUnits, input)).orderBy(asc(pmcUnits.unitNumber)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent, groupId: pmcActivityDefinitions.groupId, stageId: pmcActivityDefinitions.stageId }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ id: pmcActivityGroups.id, code: pmcActivityGroups.code, name: pmcActivityGroups.name }).from(pmcActivityGroups).where(mine(pmcActivityGroups, input)),
    db.select({ id: pmcActivityStages.id, code: pmcActivityStages.code, name: pmcActivityStages.name }).from(pmcActivityStages).where(mine(pmcActivityStages, input)),
    db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, input)),
    db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, input)),
  ]);
  const factors = effectiveFactors(factorRows);
  const statusOf = new Map(cells.map(cell => [`${cell.unitId}:${cell.activityDefinitionId}`, cell.status as PmcUnitActivityStatus]));
  const definitionsByModel = new Map<string, typeof definitions>();
  for (const definition of definitions) definitionsByModel.set(definition.modelCode, [...(definitionsByModel.get(definition.modelCode) ?? []), definition]);

  const unitRows = units.map(unit => {
    const modelDefinitions = definitionsByModel.get(unit.modelCode) ?? [];
    try {
      const progressPercent = calculateUnitProgress({ statusFactors: factors, activities: modelDefinitions.map(definition => ({ weightPercent: Number(definition.weightPercent), status: statusOf.get(`${unit.id}:${definition.id}`) ?? "NOT_STARTED" })) });
      return { unitId: unit.id, unitNumber: unit.unitNumber, modelCode: unit.modelCode, unitWeight: Number(unit.unitWeight), progressPercent, reason: null as string | null };
    } catch {
      return { unitId: unit.id, unitNumber: unit.unitNumber, modelCode: unit.modelCode, unitWeight: Number(unit.unitWeight), progressPercent: null as number | null, reason: modelDefinitions.length === 0 ? "MODEL_HAS_NO_ACTIVITIES" : "MODEL_WEIGHTS_NOT_100" };
    }
  });
  const counted = unitRows.filter((row): row is typeof row & { progressPercent: number } => row.progressPercent !== null);
  const project = counted.length === 0 ? null : calculateProjectProgress(counted.map(row => ({ progressPercent: row.progressPercent, unitWeight: row.unitWeight })));

  const unitsByModel = new Map<string, string[]>();
  for (const unit of units) unitsByModel.set(unit.modelCode, [...(unitsByModel.get(unit.modelCode) ?? []), unit.id]);
  const groupById = new Map(groups.map(group => [group.id, group]));
  const stageById = new Map(stages.map(stage => [stage.id, stage]));
  const activityRows = definitions.map(definition => {
    const included = unitsByModel.get(definition.modelCode) ?? [];
    const completed = included.filter(unitId => statusOf.get(`${unitId}:${definition.id}`) === "COMPLETE").length;
    return { activityDefinitionId: definition.id, modelCode: definition.modelCode, code: definition.code, name: definition.name, weightPercent: Number(definition.weightPercent), groupCode: groupById.get(definition.groupId)?.code ?? null, stageCode: stageById.get(definition.stageId)?.code ?? null, includedUnits: included.length, completedUnits: completed, completionPercent: calculateActivityCompletion(completed, included.length) };
  });
  return { generatedAt: new Date(), factors, projectProgressPercent: project, unitsWithoutNumber: unitRows.length - counted.length, units: unitRows, activities: activityRows };
}

// ---------------------------------------------------------------- inspections

export async function createPmcInspectionRequest(input: Scope & { requestCode: string; activityDefinitionId: string; unitIds: string[]; contractorLabel?: string; consultantLabel?: string; requestedAt: Date; notes?: string }) {
  const db = await authorize(input, "project.pmc.update");
  const unitIds = Array.from(new Set(input.unitIds));
  if (unitIds.length === 0) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_INSPECTION_UNITS_REQUIRED");
  const [activity] = await db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.id, input.activityDefinitionId))).limit(1);
  if (!activity) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
  const units = await db.select({ id: pmcUnits.id, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(mine(pmcUnits, input), inArray(pmcUnits.id, unitIds)));
  if (units.length !== unitIds.length) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND");
  if (units.some(unit => unit.modelCode !== activity.modelCode)) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL");
  const [duplicate] = await db.select({ id: pmcInspectionRequests.id }).from(pmcInspectionRequests).where(and(mine(pmcInspectionRequests, input), eq(pmcInspectionRequests.requestCode, input.requestCode))).limit(1);
  if (duplicate) throw refuse("CONFLICT", "PROJECT_OS_PMC_INSPECTION_CODE_DUPLICATE");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(pmcInspectionRequests).values({ id, tenantId: input.tenantId, projectId: input.projectId, requestCode: input.requestCode, activityDefinitionId: input.activityDefinitionId, contractorLabel: input.contractorLabel, consultantLabel: input.consultantLabel, requestedAt: input.requestedAt, notes: input.notes });
    await tx.insert(pmcInspectionRequestUnits).values(unitIds.map(unitId => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, inspectionRequestId: id, unitId })));
    await tx.insert(pmcInspectionSteps).values(PMC_INSPECTION_STEPS.map((stepCode, index) => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, inspectionRequestId: id, stepCode, stepOrder: index + 1, status: index === 0 ? ("in_progress" as const) : ("pending" as const) })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.inspection_created", entityType: "pmc_inspection_request", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, requestCode: input.requestCode, units: unitIds.length }) });
  });
  return { id, requestCode: input.requestCode, units: unitIds.length };
}

/** Moves a request along its five steps: only the step in progress can be completed, and it hands the request to the next. */
export async function advancePmcInspectionStep(input: Scope & { inspectionRequestId: string; stepCode: PmcInspectionStepCode; outcome: "complete" | "rejected"; nextHolderLabel?: string }) {
  const db = await authorize(input, "project.pmc.update");
  return db.transaction(async tx => {
    const steps = await tx.select().from(pmcInspectionSteps).where(and(mine(pmcInspectionSteps, input), eq(pmcInspectionSteps.inspectionRequestId, input.inspectionRequestId))).orderBy(asc(pmcInspectionSteps.stepOrder)).for("update");
    if (steps.length === 0) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_INSPECTION_NOT_FOUND");
    const step = steps.find(item => item.stepCode === input.stepCode);
    if (!step || step.status !== "in_progress") throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_INSPECTION_STEP_NOT_ACTIVE");
    const now = new Date();
    await tx.update(pmcInspectionSteps).set({ status: input.outcome, completedAt: now }).where(eq(pmcInspectionSteps.id, step.id));
    const next = steps.find(item => item.stepOrder === step.stepOrder + 1);
    if (input.outcome === "complete" && next) await tx.update(pmcInspectionSteps).set({ status: "in_progress", holderLabel: input.nextHolderLabel ?? next.holderLabel }).where(eq(pmcInspectionSteps.id, next.id));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.inspection_step_advanced", entityType: "pmc_inspection_request", entityId: input.inspectionRequestId, metadata: JSON.stringify({ projectId: input.projectId, step: input.stepCode, outcome: input.outcome }) });
    return { stepCode: input.stepCode, outcome: input.outcome, nextStepCode: input.outcome === "complete" ? (next?.stepCode ?? null) : null };
  });
}

/** Records the consultant's reply (A, B, C or UR). Allowed only once the request has reached its last step. */
export async function respondPmcInspection(input: Scope & { inspectionRequestId: string; responseCode: "A" | "B" | "C" | "UR" }) {
  const db = await authorize(input, "project.pmc.update");
  return db.transaction(async tx => {
    const [request] = await tx.select({ id: pmcInspectionRequests.id, responseCode: pmcInspectionRequests.responseCode }).from(pmcInspectionRequests).where(and(mine(pmcInspectionRequests, input), eq(pmcInspectionRequests.id, input.inspectionRequestId))).for("update").limit(1);
    if (!request) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_INSPECTION_NOT_FOUND");
    if (request.responseCode) throw refuse("CONFLICT", "PROJECT_OS_PMC_INSPECTION_ALREADY_ANSWERED");
    const [last] = await tx.select().from(pmcInspectionSteps).where(and(mine(pmcInspectionSteps, input), eq(pmcInspectionSteps.inspectionRequestId, input.inspectionRequestId), eq(pmcInspectionSteps.stepCode, "RESULT_RECEIVING"))).limit(1);
    if (!last || last.status !== "in_progress") throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_INSPECTION_NOT_AT_RESULT_STEP");
    await tx.update(pmcInspectionRequests).set({ responseCode: input.responseCode }).where(eq(pmcInspectionRequests.id, request.id));
    await tx.update(pmcInspectionSteps).set({ status: "complete", completedAt: new Date() }).where(eq(pmcInspectionSteps.id, last.id));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.inspection_answered", entityType: "pmc_inspection_request", entityId: request.id, metadata: JSON.stringify({ projectId: input.projectId, responseCode: input.responseCode }) });
    return { responseCode: input.responseCode };
  });
}

export async function listPmcInspectionRequests(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  const [requests, units, steps] = await Promise.all([
    db.select().from(pmcInspectionRequests).where(mine(pmcInspectionRequests, input)).orderBy(desc(pmcInspectionRequests.requestedAt)),
    db.select({ inspectionRequestId: pmcInspectionRequestUnits.inspectionRequestId, unitId: pmcInspectionRequestUnits.unitId }).from(pmcInspectionRequestUnits).where(mine(pmcInspectionRequestUnits, input)),
    db.select().from(pmcInspectionSteps).where(mine(pmcInspectionSteps, input)).orderBy(asc(pmcInspectionSteps.stepOrder)),
  ]);
  return requests.map(request => ({ ...request, unitIds: units.filter(unit => unit.inspectionRequestId === request.id).map(unit => unit.unitId), steps: steps.filter(step => step.inspectionRequestId === request.id) }));
}
