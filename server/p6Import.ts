// A Primavera P6 export written into the project's schedule IN FULL: the WBS tree, the activities, their relationships, the resources and what is assigned to each activity,
// the activity codes and the calendars — not the activities alone. All of it in ONE transaction; `analyze` runs the same steps and rolls back, so the counts the person approves
// are the database's own. Re-importing a newer export of the same schedule updates by the source's own keys (activity code, WBS code, resource code, relationship pair) and never deletes:
// what the file no longer holds is counted as «absent» and left where it is.
// Money in the file is in the PROJECT's currency on the platform: the header's currency (P6's default is USD) is only compared, and a difference is said in the preview.
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  activities, activityCodeAssignments, activityCodeTypes, activityCodeValues, activityRelationships, activityResourceAssignments, auditLogs, dataImportRowResults, dataImportSources, dataImports,
  projectResources, projects, scheduleCalendars, wbsItems,
} from "../drizzle/schema";
import { refreshStatisticsAfterBulkLoad } from "./bulkLoadStats";
import { authorizeNewImport } from "./db";
import { parseXerFile, plannedCostByActivity, readP6, type P6Model } from "./domain/smartImport/p6Xer";

type Scope = { userId: number; tenantId: string; projectId: string };
export type EntityCount = { create: number; update: number; unchanged: number; absent: number };
const CHUNK = 500;
const chunks = <T,>(items: T[], size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) => items.slice(index * size, (index + 1) * size));
const ENTITIES = ["wbs", "activities", "calendars", "resources", "assignments", "relationships", "codeTypes", "codeValues", "codeAssignments"] as const;
type Entity = (typeof ENTITIES)[number];

export type P6Plan = {
  fileHash: string;
  header: P6Model["header"];
  project: P6Model["project"];
  currency: { file: string | null; project: string; differs: boolean };
  counts: Record<Entity, EntityCount>;
  skippedTables: P6Model["skippedTables"];
  issues: Array<{ code: string; detail?: string }>;
  warnings: string[];
  canConfirm: boolean;
  /** what an activity-level look at the file shows: how many have started / finished in the source, and what its cost adds up to (in the project's currency) */
  summary: { activities: number; started: number; finished: number; milestones: number; plannedCost: number };
};

class Rollback extends Error { constructor(readonly plan: P6Plan) { super("rollback"); } }
type Db = Awaited<ReturnType<typeof authorizeNewImport>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const same2 = (stored: unknown, wanted: number) => Math.abs(Number(stored ?? 0) - wanted) < 0.005;
const sameDate = (stored: Date | null, wanted: string | null) => (stored ? stored.getTime() : null) === (wanted ? new Date(`${wanted}Z`).getTime() : null);
const at = (iso: string | null) => (iso ? new Date(`${iso}Z`) : null);
const STATUS: Record<string, "not_started" | "in_progress" | "completed"> = { TK_NotStart: "not_started", TK_Active: "in_progress", TK_Complete: "completed" };

type Syncable = { id: string };
/** One entity: what exists (by the source's key) against what the file wants. Writes only what differs, in chunks; returns the counts. */
async function sync<E extends Syncable, D extends Syncable>(input: { desired: D[]; existing: Map<string, E>; key: (item: D) => string; same: (stored: E, wanted: D) => boolean; insert: (rows: D[]) => Promise<void>; update: (stored: E, wanted: D) => Promise<void> }): Promise<EntityCount> {
  const toCreate: D[] = []; let update = 0; let unchanged = 0; const seen = new Set<string>();
  for (const item of input.desired) {
    const stored = input.existing.get(input.key(item)); seen.add(input.key(item));
    if (!stored) toCreate.push(item);
    else if (input.same(stored, item)) unchanged += 1;
    else { await input.update(stored, item); update += 1; }
  }
  for (const batch of chunks(toCreate)) await input.insert(batch);
  return { create: toCreate.length, update, unchanged, absent: Array.from(input.existing.keys()).filter(key => !seen.has(key)).length };
}

async function run(tx: Tx, input: Scope, model: P6Model, fileHash: string, source: { key: string; name: string } | null, commit: boolean): Promise<P6Plan> {
  const [project] = await tx.select({ currency: projects.currency }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  const projectCurrency = project?.currency ?? "SAR";
  const cost = plannedCostByActivity(model);
  const summary = { activities: model.activities.length, started: model.activities.filter(a => a.actualStart).length, finished: model.activities.filter(a => a.actualFinish).length, milestones: model.activities.filter(a => /Mile/.test(a.taskType)).length, plannedCost: Math.round(Array.from(cost.values()).reduce((a, b) => a + b, 0) * 100) / 100 };
  const warnings = [...model.warnings];
  const currency = { file: model.header.currency, project: projectCurrency, differs: Boolean(model.header.currency) && model.header.currency !== projectCurrency };
  if (currency.differs) warnings.push(`XER_CURRENCY_DIFFERS:${model.header.currency}->${projectCurrency}`);
  if (model.skippedTables.length) warnings.push(`XER_TABLES_NOT_KEPT:${model.skippedTables.map(item => item.table).join(",")}`);
  const counts = Object.fromEntries(ENTITIES.map(name => [name, { create: 0, update: 0, unchanged: 0, absent: 0 }])) as Record<Entity, EntityCount>;
  const plan: P6Plan = { fileHash, header: model.header, project: model.project, currency, counts, skippedTables: model.skippedTables, issues: [...model.issues], warnings, canConfirm: false, summary };
  if (plan.issues.length) throw new Rollback(plan);
  const common = { tenantId: input.tenantId, projectId: input.projectId };
  const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
  const now = new Date();

  // ---- WBS (tree, with each node's own activities' cost)
  const existingWbs = new Map((await tx.select().from(wbsItems).where(mine(wbsItems))).map(row => [row.code, row]));
  const wbsId = new Map(model.wbs.map(node => [node.externalId, existingWbs.get(node.code)?.id ?? randomUUID()]));
  const directCost = new Map<string, number>(); for (const a of model.activities) directCost.set(a.wbsExternalId, (directCost.get(a.wbsExternalId) ?? 0) + (cost.get(a.code) ?? 0));
  counts.wbs = await sync({
    desired: model.wbs.map(node => ({ id: wbsId.get(node.externalId)!, code: node.code, name: node.name.slice(0, 255), parentId: node.parentExternalId ? wbsId.get(node.parentExternalId) ?? null : null, plannedValue: Math.round((directCost.get(node.externalId) ?? 0) * 100) / 100 })),
    existing: existingWbs, key: item => item.code,
    same: (stored, wanted) => stored.name === wanted.name && (stored.parentId ?? null) === wanted.parentId && same2(stored.plannedValue, wanted.plannedValue),
    insert: async rows => { await tx.insert(wbsItems).values(rows.map(row => ({ ...common, id: row.id, code: row.code, name: row.name, parentId: row.parentId, plannedValue: String(row.plannedValue) }))); },
    update: async (stored, wanted) => { await tx.update(wbsItems).set({ name: wanted.name, parentId: wanted.parentId, plannedValue: String(wanted.plannedValue), updatedAt: now }).where(eq(wbsItems.id, stored.id)); },
  });

  // ---- calendars
  const existingCalendars = new Map((await tx.select().from(scheduleCalendars).where(mine(scheduleCalendars))).map(row => [row.externalId, row]));
  const calendarId = new Map(model.calendars.map(item => [item.externalId, existingCalendars.get(item.externalId)?.id ?? randomUUID()]));
  counts.calendars = await sync({
    desired: model.calendars.map(item => ({ id: calendarId.get(item.externalId)!, externalId: item.externalId, name: item.name.slice(0, 255), type: item.type.slice(0, 40), isDefault: item.isDefault, day: item.hoursPerDay, week: item.hoursPerWeek, data: item.data })),
    existing: existingCalendars, key: item => item.externalId,
    same: (stored, wanted) => stored.name === wanted.name && stored.isDefault === wanted.isDefault && same2(stored.hoursPerDay, wanted.day) && same2(stored.hoursPerWeek, wanted.week) && (stored.definition ?? "") === wanted.data,
    insert: async rows => { await tx.insert(scheduleCalendars).values(rows.map(row => ({ ...common, id: row.id, externalId: row.externalId, name: row.name, calendarType: row.type || null, isDefault: row.isDefault, hoursPerDay: String(row.day), hoursPerWeek: String(row.week), definition: row.data || null }))); },
    update: async (stored, wanted) => { await tx.update(scheduleCalendars).set({ name: wanted.name, calendarType: wanted.type || null, isDefault: wanted.isDefault, hoursPerDay: String(wanted.day), hoursPerWeek: String(wanted.week), definition: wanted.data || null, updatedAt: now }).where(eq(scheduleCalendars.id, stored.id)); },
  });

  // ---- activities
  const existingActivities = new Map((await tx.select().from(activities).where(mine(activities))).map(row => [row.code, row]));
  const activityId = new Map(model.activities.map(item => [item.code, existingActivities.get(item.code)?.id ?? randomUUID()]));
  const wanted = model.activities.map(item => ({
    id: activityId.get(item.code)!, code: item.code, name: item.name.slice(0, 255), wbsItemId: wbsId.get(item.wbsExternalId) ?? null, status: STATUS[item.statusCode] ?? "not_started", plannedValue: Math.round((cost.get(item.code) ?? 0) * 100) / 100,
    plannedStart: item.plannedStart, plannedFinish: item.plannedFinish, actualStart: item.actualStart, actualFinish: item.actualFinish, externalId: item.externalId, taskType: item.taskType.slice(0, 24), calendarId: item.calendarExternalId ? calendarId.get(item.calendarExternalId) ?? null : null,
    duration: item.durationHours, remaining: item.remainingHours, percent: item.percentComplete, float: item.totalFloatHours, constraintType: item.constraintType?.slice(0, 24) ?? null, constraintDate: item.constraintDate,
  }));
  counts.activities = await sync({
    desired: wanted, existing: existingActivities, key: item => item.code,
    same: (s, w) => s.name === w.name && s.wbsItemId === w.wbsItemId && s.status === w.status && same2(s.plannedValue, w.plannedValue) && sameDate(s.plannedStartAt, w.plannedStart) && sameDate(s.plannedFinishAt, w.plannedFinish) && sameDate(s.actualStartAt, w.actualStart) && sameDate(s.actualFinishAt, w.actualFinish)
      && s.externalId === w.externalId && s.taskType === w.taskType && (s.calendarId ?? null) === w.calendarId && same2(s.durationHours, w.duration) && same2(s.remainingHours, w.remaining) && same2(s.percentComplete, w.percent) && (s.totalFloatHours === null ? w.float === null : w.float !== null && same2(s.totalFloatHours, w.float)),
    insert: async rows => { await tx.insert(activities).values(rows.map(w => ({ ...common, id: w.id, code: w.code, name: w.name, wbsItemId: w.wbsItemId, status: w.status, plannedValue: String(w.plannedValue), plannedStartAt: at(w.plannedStart), plannedFinishAt: at(w.plannedFinish), actualStartAt: at(w.actualStart), actualFinishAt: at(w.actualFinish), externalId: w.externalId, taskType: w.taskType, calendarId: w.calendarId, durationHours: String(w.duration), remainingHours: String(w.remaining), percentComplete: String(w.percent), totalFloatHours: w.float === null ? null : String(w.float), constraintType: w.constraintType, constraintDate: at(w.constraintDate) }))); },
    // earnedValue is the platform's own measure: a schedule update never overwrites it
    update: async (s, w) => { await tx.update(activities).set({ name: w.name, wbsItemId: w.wbsItemId, status: w.status, plannedValue: String(w.plannedValue), plannedStartAt: at(w.plannedStart), plannedFinishAt: at(w.plannedFinish), actualStartAt: at(w.actualStart), actualFinishAt: at(w.actualFinish), externalId: w.externalId, taskType: w.taskType, calendarId: w.calendarId, durationHours: String(w.duration), remainingHours: String(w.remaining), percentComplete: String(w.percent), totalFloatHours: w.float === null ? null : String(w.float), constraintType: w.constraintType, constraintDate: at(w.constraintDate), updatedAt: now }).where(eq(activities.id, s.id)); },
  });

  // ---- resources (the platform keeps them per project, with their planned units)
  const existingResources = new Map((await tx.select().from(projectResources).where(mine(projectResources))).map(row => [row.resourceCode, row]));
  const resourceId = new Map(model.resources.map(item => [item.code, existingResources.get(item.code)?.id ?? randomUUID()]));
  const units = new Map<string, { units: number; cost: number }>(); for (const a of model.assignments) { const u = units.get(a.resourceCode) ?? { units: 0, cost: 0 }; u.units += a.plannedUnits; u.cost += a.plannedCost; units.set(a.resourceCode, u); }
  counts.resources = await sync({
    desired: model.resources.map(item => { const u = units.get(item.code) ?? { units: 0, cost: 0 }; return { id: resourceId.get(item.code)!, code: item.code, name: item.name.slice(0, 255), type: item.type, plannedUnits: Math.round(u.units * 100) / 100, unitCost: u.units > 0 ? Math.round((u.cost / u.units) * 100) / 100 : 0 }; }),
    existing: existingResources, key: item => item.code,
    same: (s, w) => s.name === w.name && s.resourceType === w.type && same2(s.plannedUnits, w.plannedUnits) && same2(s.unitCost, w.unitCost) && s.currency === projectCurrency,
    insert: async rows => { await tx.insert(projectResources).values(rows.map(w => ({ ...common, id: w.id, resourceCode: w.code, name: w.name, resourceType: w.type, plannedUnits: String(w.plannedUnits), unitCost: String(w.unitCost), currency: projectCurrency, createdByUserId: input.userId }))); },
    update: async (s, w) => { await tx.update(projectResources).set({ name: w.name, resourceType: w.type, plannedUnits: String(w.plannedUnits), unitCost: String(w.unitCost), currency: projectCurrency, updatedAt: now }).where(eq(projectResources.id, s.id)); },
  });

  // ---- what is assigned to each activity
  const existingAssignments = new Map((await tx.select().from(activityResourceAssignments).where(mine(activityResourceAssignments))).map(row => [row.externalId, row]));
  counts.assignments = await sync({
    desired: model.assignments.map(item => ({ id: existingAssignments.get(item.externalId)?.id ?? randomUUID(), activityId: activityId.get(item.activityCode)!, resourceId: resourceId.get(item.resourceCode)!, ...item })),
    existing: existingAssignments, key: item => item.externalId,
    same: (s, w) => s.activityId === w.activityId && s.resourceId === w.resourceId && same2(s.plannedUnits, w.plannedUnits) && same2(s.actualUnits, w.actualUnits) && same2(s.remainingUnits, w.remainingUnits) && same2(s.plannedCost, w.plannedCost) && same2(s.actualCost, w.actualCost) && same2(s.remainingCost, w.remainingCost),
    insert: async rows => { await tx.insert(activityResourceAssignments).values(rows.map(w => ({ ...common, id: w.id, externalId: w.externalId, activityId: w.activityId, resourceId: w.resourceId, plannedUnits: String(w.plannedUnits), actualUnits: String(w.actualUnits), remainingUnits: String(w.remainingUnits), plannedCost: String(w.plannedCost), actualCost: String(w.actualCost), remainingCost: String(w.remainingCost) }))); },
    update: async (s, w) => { await tx.update(activityResourceAssignments).set({ activityId: w.activityId, resourceId: w.resourceId, plannedUnits: String(w.plannedUnits), actualUnits: String(w.actualUnits), remainingUnits: String(w.remainingUnits), plannedCost: String(w.plannedCost), actualCost: String(w.actualCost), remainingCost: String(w.remainingCost), updatedAt: now }).where(eq(activityResourceAssignments.id, s.id)); },
  });

  // ---- relationships (keyed by predecessor + successor + type)
  const existingRelations = new Map((await tx.select().from(activityRelationships).where(mine(activityRelationships))).map(row => [`${row.predecessorActivityId}|${row.successorActivityId}|${row.relationType}`, row]));
  const relations = new Map<string, { id: string; predecessorId: string; successorId: string; type: string; lag: number }>();
  for (const item of model.relationships) {
    const predecessorId = activityId.get(item.predecessorCode)!; const successorId = activityId.get(item.successorCode)!; const key = `${predecessorId}|${successorId}|${item.type}`;
    if (predecessorId === successorId) continue; // a link from an activity to itself carries no meaning (the table refuses it)
    relations.set(key, { id: existingRelations.get(key)?.id ?? randomUUID(), predecessorId, successorId, type: item.type, lag: item.lagHours });
  }
  counts.relationships = await sync({
    desired: Array.from(relations.values()), existing: existingRelations, key: item => `${item.predecessorId}|${item.successorId}|${item.type}`,
    same: (s, w) => same2(s.lagHours, w.lag),
    insert: async rows => { await tx.insert(activityRelationships).values(rows.map(w => ({ ...common, id: w.id, predecessorActivityId: w.predecessorId, successorActivityId: w.successorId, relationType: w.type, lagHours: String(w.lag) }))); },
    update: async (s, w) => { await tx.update(activityRelationships).set({ lagHours: String(w.lag), updatedAt: now }).where(eq(activityRelationships.id, s.id)); },
  });

  // ---- activity codes: types, their values (a tree), and which value each activity carries
  const existingTypes = new Map((await tx.select().from(activityCodeTypes).where(mine(activityCodeTypes))).map(row => [row.externalId, row]));
  const typeId = new Map(model.codeTypes.map(item => [item.externalId, existingTypes.get(item.externalId)?.id ?? randomUUID()]));
  counts.codeTypes = await sync({
    desired: model.codeTypes.map(item => ({ id: typeId.get(item.externalId)!, externalId: item.externalId, name: item.name.slice(0, 120), scope: item.scope.slice(0, 40), sequence: item.sequence })),
    existing: existingTypes, key: item => item.externalId, same: (s, w) => s.name === w.name && (s.scope ?? "") === w.scope && s.sequence === w.sequence,
    insert: async rows => { await tx.insert(activityCodeTypes).values(rows.map(w => ({ ...common, id: w.id, externalId: w.externalId, name: w.name, scope: w.scope || null, sequence: w.sequence }))); },
    update: async (s, w) => { await tx.update(activityCodeTypes).set({ name: w.name, scope: w.scope || null, sequence: w.sequence, updatedAt: now }).where(eq(activityCodeTypes.id, s.id)); },
  });
  const existingValues = new Map((await tx.select().from(activityCodeValues).where(mine(activityCodeValues))).map(row => [row.externalId, row]));
  const valueId = new Map(model.codeValues.map(item => [item.externalId, existingValues.get(item.externalId)?.id ?? randomUUID()]));
  counts.codeValues = await sync({
    desired: model.codeValues.filter(item => typeId.has(item.typeExternalId)).map(item => ({ id: valueId.get(item.externalId)!, externalId: item.externalId, typeId: typeId.get(item.typeExternalId)!, parentId: item.parentExternalId ? valueId.get(item.parentExternalId) ?? null : null, shortName: item.shortName.slice(0, 80), name: item.name.slice(0, 255), sequence: item.sequence })),
    existing: existingValues, key: item => item.externalId, same: (s, w) => s.codeTypeId === w.typeId && (s.parentId ?? null) === w.parentId && s.shortName === w.shortName && s.name === w.name && s.sequence === w.sequence,
    insert: async rows => { await tx.insert(activityCodeValues).values(rows.map(w => ({ ...common, id: w.id, externalId: w.externalId, codeTypeId: w.typeId, parentId: w.parentId, shortName: w.shortName, name: w.name, sequence: w.sequence }))); },
    update: async (s, w) => { await tx.update(activityCodeValues).set({ codeTypeId: w.typeId, parentId: w.parentId, shortName: w.shortName, name: w.name, sequence: w.sequence, updatedAt: now }).where(eq(activityCodeValues.id, s.id)); },
  });
  const existingCodeAssignments = new Map((await tx.select().from(activityCodeAssignments).where(mine(activityCodeAssignments))).map(row => [`${row.activityId}|${row.codeTypeId}`, row]));
  const wantedCodeAssignments = new Map<string, { id: string; activityId: string; typeId: string; valueId: string }>();
  for (const item of model.codeAssignments) {
    const activity = activityId.get(item.activityCode); const type = typeId.get(item.typeExternalId); const value = valueId.get(item.valueExternalId);
    if (!activity || !type || !value) continue;
    const key = `${activity}|${type}`; wantedCodeAssignments.set(key, { id: existingCodeAssignments.get(key)?.id ?? randomUUID(), activityId: activity, typeId: type, valueId: value });
  }
  counts.codeAssignments = await sync({
    desired: Array.from(wantedCodeAssignments.values()), existing: existingCodeAssignments, key: item => `${item.activityId}|${item.typeId}`, same: (s, w) => s.codeValueId === w.valueId,
    insert: async rows => { await tx.insert(activityCodeAssignments).values(rows.map(w => ({ ...common, id: w.id, activityId: w.activityId, codeTypeId: w.typeId, codeValueId: w.valueId }))); },
    update: async (s, w) => { await tx.update(activityCodeAssignments).set({ codeValueId: w.valueId, updatedAt: now }).where(eq(activityCodeAssignments.id, s.id)); },
  });

  plan.canConfirm = true;
  if (!commit) throw new Rollback(plan);
  if (source) {
    const importId = randomUUID();
    await tx.insert(dataImports).values({
      id: importId, ...common, moduleCode: "p6", templateCode: "p6_v1", sourceFormat: "xer", fileName: source.name, fileKey: source.key, fileHash, status: "completed",
      totalRows: model.activities.length, validRows: model.activities.length, invalidRows: 0, createdRows: counts.activities.create, updatedRows: counts.activities.update, skippedRows: counts.activities.unchanged,
      summaryJson: JSON.stringify({ p6: { header: model.header, counts, summary, currency } }), createdByUserId: input.userId, progressPercent: 100, completedAt: now,
    });
    await tx.insert(dataImportSources).values({ importId, ...common, sourceKey: source.key, sourceName: source.name, detectedKind: "xer", sheetName: null, mappingJson: JSON.stringify({ tables: Object.fromEntries(ENTITIES.map(name => [name, counts[name]])) }), mergedCellsFilled: 0 });
    let rowNumber = 0;
    for (const batch of chunks(model.activities)) await tx.insert(dataImportRowResults).values(batch.map(item => ({ id: randomUUID(), importId, rowNumber: (rowNumber += 1), rowKey: item.code.slice(0, 160), action: (existingActivities.has(item.code) ? "updated" : "created") as "created" | "updated", entityId: activityId.get(item.code)! })));
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "schedule.p6_import_confirmed", entityType: "data_import", entityId: importId, metadata: JSON.stringify({ projectId: input.projectId, fileHash, counts, currency }) });
    (plan as P6Plan & { importId?: string }).importId = importId;
  }
  return plan;
}

async function inTransaction(input: Scope, model: P6Model, fileHash: string, source: { key: string; name: string } | null, commit: boolean): Promise<P6Plan & { importId?: string }> {
  const db = await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "schedule" });
  try { return await db.transaction(tx => run(tx, input, model, fileHash, source, commit)); }
  catch (error) { if (error instanceof Rollback) return error.plan; throw error; }
}

const read = (bytes: Uint8Array) => ({ model: readP6(parseXerFile(bytes)), fileHash: createHash("sha256").update(bytes).digest("hex") });

/** What the file would do, counted by the database in a transaction that is rolled back. Writes nothing. */
export async function analyzeP6Import(input: Scope & { bytes: Uint8Array }): Promise<P6Plan> {
  const { model, fileHash } = read(input.bytes);
  return inTransaction(input, model, fileHash, null, false);
}

export async function confirmP6Import(input: Scope & { bytes: Uint8Array; approvedHash?: string; source: { key: string; name: string } }): Promise<P6Plan & { importId?: string }> {
  const { model, fileHash } = read(input.bytes);
  if (input.approvedHash && input.approvedHash !== fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  const plan = await inTransaction(input, model, fileHash, input.source, true);
  if (!plan.canConfirm || plan.issues.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED", cause: plan.issues.slice(0, 20) });
  const db = await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "schedule" });
  void refreshStatisticsAfterBulkLoad(db, ["activities", "wbs_items", "activity_*"], model.activities.length);
  return plan;
}
