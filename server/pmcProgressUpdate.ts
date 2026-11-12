// Q-4: the site engineer's progress update on the WEIGHTS table (the catalogue the progress is computed from): one activity (by its code, so one choice covers every
// model that has it), several villas (a list, a range «268-272», or a whole block), one status (not started / in progress / complete) and its date, saved once.
// Everything is checked before anything is written, and the whole entry is refused, villa by villa, when one villa is wrong (unknown, or its model has no such
// activity), the date is in the future, or a field is missing. The cells are written by applyCellStatus — the same write as the single cell, with its history row
// (from, to, who, when) and its audit row — all in ONE transaction; the villa's and the project's progress are then read from the weights and returned.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcActivityGroups, pmcBlocks, pmcUnitActivityHistory, pmcUnitActivityProgress, pmcUnits, users } from "../drizzle/schema";
import { applyCellStatus, authorize, getPmcProgress, mine, type Scope } from "./pmcService";
import { expandVillaRange } from "./pmcSiteService";
import { siteToday, villaKey } from "./wo22Shared";

export const PROGRESS_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type ProgressIssue = { code: string; villa?: string; detail?: string };
export const MAX_VILLAS_PER_UPDATE = 500;
const refuse = (issues: ProgressIssue[]) => new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SITE_UPDATE_INVALID", cause: { issues } });

/** The activities of the weights table, once per code: its CSI section and its weight (the same code may weigh differently per model: the range is given). */
export async function listProgressActivities(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  const rows = await db.select({ code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent, section: pmcActivityGroups.name })
    .from(pmcActivityDefinitions).innerJoin(pmcActivityGroups, eq(pmcActivityGroups.id, pmcActivityDefinitions.groupId)).where(mine(pmcActivityDefinitions, input));
  const byCode = new Map<string, { code: string; name: string; section: string; minWeight: number; maxWeight: number }>();
  for (const row of rows) {
    const weight = Number(row.weightPercent); const known = byCode.get(row.code);
    if (!known) byCode.set(row.code, { code: row.code, name: row.name, section: row.section, minWeight: weight, maxWeight: weight });
    else { known.minWeight = Math.min(known.minWeight, weight); known.maxWeight = Math.max(known.maxWeight, weight); }
  }
  return Array.from(byCode.values()).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
}

export type ProgressUpdateInput = Scope & { activityCode: string; villas?: string[]; range?: string; blockCode?: string; status: ProgressStatus; date: string };

/** The checks every villa-batch shares (Q-4 progress, Q-5 QC): the fields, the date (not in the future, Riyadh's day), then the villas (a list, a range or a
 * block, never two at once) resolved against the project and the activity's models. Refused whole, villa by villa, before anything is written. */
export async function resolveVillaBatch(db: Awaited<ReturnType<typeof authorize>>, input: Scope & { activityCode: string; villas?: string[]; range?: string; blockCode?: string; date: string }, extra: ProgressIssue[] = []) {
  const issues: ProgressIssue[] = [...extra];
  if (!input.activityCode?.trim()) issues.push({ code: "SITE_FIELD_MISSING", detail: "activity" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) issues.push({ code: "SITE_FIELD_MISSING", detail: "date" });
  else if (input.date > siteToday()) issues.push({ code: "SITE_DATE_IN_FUTURE", detail: input.date });
  const chosen = [input.villas?.length ? 1 : 0, input.range ? 1 : 0, input.blockCode ? 1 : 0].reduce((a, b) => a + b, 0);
  if (chosen === 0) issues.push({ code: "SITE_FIELD_MISSING", detail: "villas" });
  else if (chosen > 1) issues.push({ code: "SITE_TARGET_AMBIGUOUS" });
  if (issues.length) throw refuse(issues);

  const [definitions, units] = await Promise.all([
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.code, input.activityCode.trim()))),
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode, blockId: pmcUnits.blockId }).from(pmcUnits).where(mine(pmcUnits, input)),
  ]);
  if (!definitions.length) throw refuse([{ code: "SITE_ACTIVITY_UNKNOWN", detail: input.activityCode }]);
  const definitionByModel = new Map(definitions.map(definition => [definition.modelCode, definition.id]));
  const byVilla = new Map(units.map(unit => [villaKey(unit.villaLabel ?? unit.unitNumber), unit]));
  let wanted: string[] = [];
  if (input.villas?.length) wanted = Array.from(new Set(input.villas.flatMap(item => item.split(/[,،;\s]+/)).filter(Boolean).map(villaKey)));
  if (input.range) { const expanded = expandVillaRange(input.range, Array.from(byVilla.keys())); if (!expanded) issues.push({ code: "SITE_RANGE_INVALID", detail: input.range }); else if (!expanded.length) issues.push({ code: "SITE_RANGE_EMPTY", detail: input.range }); else wanted = expanded; }
  if (input.blockCode) {
    const blocks = await db.select({ id: pmcBlocks.id, code: pmcBlocks.code, name: pmcBlocks.name }).from(pmcBlocks).where(mine(pmcBlocks, input));
    const block = blocks.find(item => item.code === input.blockCode || item.name === input.blockCode);
    if (!block) issues.push({ code: "SITE_BLOCK_UNKNOWN", detail: input.blockCode });
    else wanted = units.filter(unit => unit.blockId === block.id).map(unit => villaKey(unit.villaLabel ?? unit.unitNumber));
  }
  if (wanted.length > MAX_VILLAS_PER_UPDATE) issues.push({ code: "SITE_TOO_MANY_VILLAS", detail: String(MAX_VILLAS_PER_UPDATE) });
  const targets: Array<{ unitId: string; villa: string; activityDefinitionId: string }> = [];
  for (const villa of wanted) {
    const unit = byVilla.get(villa);
    if (!unit) { issues.push({ code: "SITE_VILLA_UNKNOWN", villa }); continue; }
    const activityDefinitionId = definitionByModel.get(unit.modelCode);
    if (!activityDefinitionId) { issues.push({ code: "SITE_ACTIVITY_NOT_FOR_TYPE", villa, detail: unit.modelCode }); continue; }
    targets.push({ unitId: unit.id, villa, activityDefinitionId });
  }
  if (issues.length || !targets.length) throw refuse(issues.length ? issues : [{ code: "SITE_FIELD_MISSING", detail: "villas" }]);
  return targets;
}

export async function updatePmcProgress(input: ProgressUpdateInput) {
  const db = await authorize(input, "project.pmc.update");
  const targets = await resolveVillaBatch(db, input, PROGRESS_STATUSES.includes(input.status) ? [] : [{ code: "SITE_FIELD_MISSING", detail: "status" }]);

  // the date the engineer chose is the moment of the change (noon of that day in Riyadh; today keeps the real time)
  const changedAt = input.date === siteToday() ? new Date() : new Date(`${input.date}T09:00:00Z`);
  const batchId = randomUUID();
  const result = await db.transaction(async tx => {
    let changed = 0; const warnings = new Set<string>();
    for (const target of targets) {
      const cell = await applyCellStatus(tx, { ...input, unitId: target.unitId, activityDefinitionId: target.activityDefinitionId, status: input.status, note: `batch ${batchId}` }, changedAt);
      if (cell.changed) changed += 1;
      for (const warning of cell.warnings) warnings.add(warning.code);
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.progress_batch_updated", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ batchId, activityCode: input.activityCode, status: input.status, date: input.date, villas: targets.length, changed }) });
    return { changed, unchanged: targets.length - changed, warnings: Array.from(warnings) };
  });
  const progress = await getPmcProgress(input);
  const percentByUnit = new Map(progress.units.map(unit => [unit.unitId, unit.progressPercent]));
  return { ...result, batchId, projectProgressPercent: progress.projectProgressPercent, villas: targets.map(target => ({ villa: target.villa, progressPercent: percentByUnit.get(target.unitId) ?? null })) };
}

/** The latest changes (who, when, from → to), newest first; for one villa when asked. */
export async function listPmcProgressHistory(input: Scope & { villa?: string; limit?: number }) {
  const db = await authorize(input, "project.pmc.read");
  let unitIds: string[] | null = null;
  if (input.villa) {
    const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel }).from(pmcUnits).where(mine(pmcUnits, input));
    unitIds = units.filter(unit => villaKey(unit.villaLabel ?? unit.unitNumber) === villaKey(input.villa)).map(unit => unit.id);
    if (!unitIds.length) return [];
  }
  const where = and(mine(pmcUnitActivityHistory, input), unitIds ? inArray(pmcUnitActivityProgress.unitId, unitIds) : undefined);
  return db.select({ at: pmcUnitActivityHistory.changedAt, from: pmcUnitActivityHistory.fromStatus, to: pmcUnitActivityHistory.toStatus, by: users.name, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, activityCode: pmcActivityDefinitions.code, activityName: pmcActivityDefinitions.name })
    .from(pmcUnitActivityHistory)
    .innerJoin(pmcUnitActivityProgress, eq(pmcUnitActivityProgress.id, pmcUnitActivityHistory.unitActivityProgressId))
    .innerJoin(pmcUnits, eq(pmcUnits.id, pmcUnitActivityProgress.unitId))
    .innerJoin(pmcActivityDefinitions, eq(pmcActivityDefinitions.id, pmcUnitActivityProgress.activityDefinitionId))
    .leftJoin(users, eq(users.id, pmcUnitActivityHistory.changedByUserId))
    .where(where).orderBy(desc(pmcUnitActivityHistory.changedAt)).limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
}
