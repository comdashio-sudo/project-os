// Q-14 (a): the stalled villas of a project, read from what the site and QC wrote (pmc_unit_activity_progress, pmc_qc_receipts) and the project's work week
// (project_profiles.work_days). The threshold is per project (project_stall_settings, 3 working days by default), set by whoever manages the PMC catalogue.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcActivityGroups, pmcActivityStages, pmcBlocks, pmcQcReceipts, pmcUnitActivityProgress, pmcUnits, projectProfiles, projectStallSettings } from "../drizzle/schema";
import { classifyStalledUnits, DEFAULT_STALL_THRESHOLD, LONG_STALL_DAYS, riyadhDay, type StallActivity, type StallUnit } from "./domain/stalledUnits";
import { workDaysOf } from "./domain/reportPeriod";
import { authorize, mine, type Scope } from "./pmcService";
import { villaKey } from "./wo22Shared";

async function thresholdOf(db: Pick<Awaited<ReturnType<typeof authorize>>, "select">, input: { tenantId: string; projectId: string }) {
  const [row] = await db.select({ thresholdDays: projectStallSettings.thresholdDays }).from(projectStallSettings).where(mine(projectStallSettings, input)).limit(1);
  return row?.thresholdDays ?? DEFAULT_STALL_THRESHOLD;
}

export async function getStalledUnits(input: Scope & { now?: Date }) {
  const db = await authorize(input, "project.pmc.read");
  return computeStalledUnits(db, input, input.now ?? new Date());
}

type Reader = Pick<Awaited<ReturnType<typeof authorize>>, "select">;
/** The classification itself, for a caller already allowed to read the project: the screen (above) and the 7:00 digest (stalledUnitsDigest.ts). */
export async function computeStalledUnits(db: Reader, input: { tenantId: string; projectId: string }, now: Date) {
  const [units, blocks, definitions, groups, stages, cells, receipts, profile, threshold] = await Promise.all([
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode, blockId: pmcUnits.blockId }).from(pmcUnits).where(mine(pmcUnits, input)),
    db.select({ id: pmcBlocks.id, code: pmcBlocks.code }).from(pmcBlocks).where(mine(pmcBlocks, input)),
    db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, modelCode: pmcActivityDefinitions.modelCode, groupId: pmcActivityDefinitions.groupId, stageId: pmcActivityDefinitions.stageId }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ id: pmcActivityGroups.id, code: pmcActivityGroups.code }).from(pmcActivityGroups).where(mine(pmcActivityGroups, input)),
    db.select({ id: pmcActivityStages.id, code: pmcActivityStages.code }).from(pmcActivityStages).where(mine(pmcActivityStages, input)),
    db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status, changedAt: pmcUnitActivityProgress.lastChangedAt }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, input)),
    db.select({ unitId: pmcQcReceipts.unitId, updatedAt: pmcQcReceipts.updatedAt }).from(pmcQcReceipts).where(mine(pmcQcReceipts, input)),
    db.select({ workDays: projectProfiles.workDays }).from(projectProfiles).where(mine(projectProfiles, input)).limit(1),
    thresholdOf(db, input),
  ]);
  // the weights table's order: section, then sub-item, then activity code (the order the import reads them in)
  const groupCode = new Map(groups.map(group => [group.id, group.code])); const stageCode = new Map(stages.map(stage => [stage.id, stage.code]));
  const ordered = [...definitions].sort((a, b) => (groupCode.get(a.groupId) ?? "").localeCompare(groupCode.get(b.groupId) ?? "") || (stageCode.get(a.stageId) ?? "").localeCompare(stageCode.get(b.stageId) ?? "") || a.code.localeCompare(b.code));
  const activitiesByModel = new Map<string, StallActivity[]>();
  ordered.forEach((definition, order) => activitiesByModel.set(definition.modelCode, [...(activitiesByModel.get(definition.modelCode) ?? []), { id: definition.id, code: definition.code, name: definition.name, order }]));
  const blockCode = new Map(blocks.map(block => [block.id, block.code]));
  const cellsByUnit = new Map<string, StallUnit["cells"]>(); for (const cell of cells) cellsByUnit.set(cell.unitId, [...(cellsByUnit.get(cell.unitId) ?? []), { activityDefinitionId: cell.activityDefinitionId, status: cell.status, changedAt: cell.changedAt }]);
  const qcByUnit = new Map<string, Date[]>(); for (const receipt of receipts) qcByUnit.set(receipt.unitId, [...(qcByUnit.get(receipt.unitId) ?? []), receipt.updatedAt]);
  const rows = classifyStalledUnits({
    activitiesByModel, today: riyadhDay(now), workDays: workDaysOf(profile[0]?.workDays), threshold,
    units: units.map(unit => ({ unitId: unit.id, villa: villaKey(unit.villaLabel ?? unit.unitNumber), blockCode: blockCode.get(unit.blockId) ?? "", modelCode: unit.modelCode, cells: cellsByUnit.get(unit.id) ?? [], qcChangedAt: qcByUnit.get(unit.id) ?? [] })),
  });
  return { threshold, longDays: LONG_STALL_DAYS, counts: { stalled: rows.filter(row => row.state === "stalled").length, long: rows.filter(row => row.state === "long").length, active: rows.filter(row => row.state === "active").length }, rows };
}

export async function setStallThreshold(input: Scope & { thresholdDays: number }) {
  const db = await authorize(input, "project.pmc.manage");
  if (!Number.isInteger(input.thresholdDays) || input.thresholdDays < 1 || input.thresholdDays > 60) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STALL_THRESHOLD_INVALID" });
  return db.transaction(async tx => {
    const [existing] = await tx.select({ id: projectStallSettings.id, thresholdDays: projectStallSettings.thresholdDays }).from(projectStallSettings).where(mine(projectStallSettings, input)).limit(1);
    if (existing) await tx.update(projectStallSettings).set({ thresholdDays: input.thresholdDays, updatedByUserId: input.userId, updatedAt: new Date() }).where(and(eq(projectStallSettings.id, existing.id), mine(projectStallSettings, input)));
    else await tx.insert(projectStallSettings).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, thresholdDays: input.thresholdDays, updatedByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.stall_threshold_set", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ from: existing?.thresholdDays ?? DEFAULT_STALL_THRESHOLD, to: input.thresholdDays }) });
    return { thresholdDays: input.thresholdDays };
  });
}
