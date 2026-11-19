// D-80 (D-3 part 6a): the PMC table editors of work order 21: units created in bulk for a block and a model, a model's activity weights saved together (they must
// total 100%, rule 4), and a units-by-activities status grid whose cells are changed one click at a time through setPmcUnitActivityStatus (which
// keeps the quality gate, the history and the EVM bridge). Same guard as every PMC function (pmcService.authorize: tenant, project, the named
// PMC permission and the PMC licence feature), every write in one transaction with its audit row. The import code is not used or changed here.
import { TRPCError } from "@trpc/server";
import { and, asc, between, eq, inArray } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcActivityGroups, pmcActivityStages, pmcBlocks, pmcUnitActivityProgress, pmcUnits, pmcZones, wbsItems } from "../drizzle/schema";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import type { ExportLocale } from "@shared/exportLocale";
import { validateActivityWeights } from "./domain/pmc";
import { isUniqueViolation } from "./_core/database";
import { syncPmcProgressToEvm } from "./pmcEvmBridge";
import { authorize, mine, type Scope } from "./pmcService";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });
export const MAX_UNITS_PER_REQUEST = 500;
export const MAX_GRID_UNITS = 200;

/** What the editors choose from: the blocks (with their zone) and, per model, its activities with their weights and the total. */
export async function getPmcStructure(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  const [zones, blocks, definitions, units] = await Promise.all([
    db.select({ id: pmcZones.id, code: pmcZones.code, name: pmcZones.name }).from(pmcZones).where(mine(pmcZones, input)).orderBy(asc(pmcZones.code)),
    db.select({ id: pmcBlocks.id, code: pmcBlocks.code, name: pmcBlocks.name, zoneId: pmcBlocks.zoneId }).from(pmcBlocks).where(mine(pmcBlocks, input)).orderBy(asc(pmcBlocks.code)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent, section: pmcActivityGroups.name, sub: pmcActivityStages.name, nameEn: pmcActivityDefinitions.nameEn, sectionEn: pmcActivityGroups.nameEn, subEn: pmcActivityStages.nameEn }).from(pmcActivityDefinitions).innerJoin(pmcActivityGroups, eq(pmcActivityGroups.id, pmcActivityDefinitions.groupId)).innerJoin(pmcActivityStages, eq(pmcActivityStages.id, pmcActivityDefinitions.stageId)).where(mine(pmcActivityDefinitions, input)).orderBy(asc(pmcActivityDefinitions.modelCode), asc(pmcActivityDefinitions.code)),
    db.select({ unitNumber: pmcUnits.unitNumber }).from(pmcUnits).where(mine(pmcUnits, input)),
  ]);
  const zoneCode = new Map(zones.map(zone => [zone.id, zone.code]));
  // Q-3: each activity carries its CSI section and sub-item (the group and stage), so the weights table reads as the owner keeps it
  // Q-49: and the optional English names (null when there is none)
  const models = new Map<string, Array<{ id: string; code: string; name: string; weightPercent: number; section: string; sub: string; nameEn: string | null; sectionEn: string | null; subEn: string | null }>>();
  for (const definition of definitions) models.set(definition.modelCode, [...(models.get(definition.modelCode) ?? []), { id: definition.id, code: definition.code, name: definition.name, weightPercent: Number(definition.weightPercent), section: definition.section, sub: definition.sub, nameEn: definition.nameEn, sectionEn: definition.sectionEn, subEn: definition.subEn }]);
  return {
    blocks: blocks.map(block => ({ id: block.id, code: block.code, name: block.name, zoneCode: zoneCode.get(block.zoneId) ?? "" })),
    models: Array.from(models, ([modelCode, activities]) => ({ modelCode, activities, totalWeight: Math.round(activities.reduce((sum, item) => sum + item.weightPercent, 0) * 10000) / 10000 })),
    unitCount: units.length,
    highestUnitNumber: units.reduce((max, unit) => Math.max(max, unit.unitNumber), 0),
  };
}

/** Units `from`..`to` in one block and one model. All or nothing: a number already in the project refuses the whole range (CONFLICT, with the numbers). */
export async function createPmcUnits(input: Scope & { blockId: string; modelCode: string; from: number; to: number }) {
  const db = await authorize(input, "project.pmc.manage");
  if (!Number.isInteger(input.from) || !Number.isInteger(input.to) || input.from < 1 || input.to < input.from || input.to - input.from + 1 > MAX_UNITS_PER_REQUEST) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_UNIT_RANGE_INVALID");
  const [block] = await db.select({ id: pmcBlocks.id }).from(pmcBlocks).where(and(mine(pmcBlocks, input), eq(pmcBlocks.id, input.blockId))).limit(1);
  if (!block) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_BLOCK_NOT_FOUND");
  const [model] = await db.select({ id: pmcActivityDefinitions.id }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.modelCode, input.modelCode))).limit(1);
  if (!model) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_MODEL_NOT_FOUND");
  const numbers = Array.from({ length: input.to - input.from + 1 }, (_, index) => input.from + index);
  return db.transaction(async tx => {
    const taken = await tx.select({ unitNumber: pmcUnits.unitNumber }).from(pmcUnits).where(and(mine(pmcUnits, input), between(pmcUnits.unitNumber, input.from, input.to)));
    if (taken.length) throw refuse("CONFLICT", "PROJECT_OS_PMC_UNITS_EXIST");
    // two requests for overlapping ranges at once: the unique (project, unit number) index lets one win; the other gets the same answer, not a raw 23505
    await tx.insert(pmcUnits).values(numbers.map(unitNumber => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, blockId: input.blockId, unitNumber, modelCode: input.modelCode })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.units_created", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ blockId: input.blockId, modelCode: input.modelCode, from: input.from, to: input.to, count: numbers.length }) });
    // new units start NOT_STARTED, so project progress (rule 2, weighted by unit) moves: the WBS items linked to activities follow in this transaction
    await syncPmcProgressToEvm(tx, input, new Date());
    return { created: numbers.length, from: input.from, to: input.to };
  }).catch(error => { if (isUniqueViolation(error) || isUniqueViolation((error as { cause?: unknown })?.cause)) throw refuse("CONFLICT", "PROJECT_OS_PMC_UNITS_EXIST"); throw error; });
}

/** Every activity of the model with its new weight, saved together. Rule 4: they must total exactly 100%, or nothing is saved. */
export async function savePmcActivityWeights(input: Scope & { modelCode: string; weights: Array<{ activityDefinitionId: string; weightPercent: number }> }) {
  const db = await authorize(input, "project.pmc.manage");
  const definitions = await db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.modelCode, input.modelCode)));
  if (!definitions.length) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_MODEL_NOT_FOUND");
  const sent = new Map(input.weights.map(item => [item.activityDefinitionId, item.weightPercent]));
  if (sent.size !== input.weights.length || sent.size !== definitions.length || definitions.some(definition => !sent.has(definition.id))) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_WEIGHTS_INCOMPLETE");
  try {
    validateActivityWeights(definitions.map(definition => ({ activityCode: definition.code, weightPercent: sent.get(definition.id)! })));
  } catch {
    throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_WEIGHTS_NOT_100");
  }
  const now = new Date();
  await db.transaction(async tx => {
    for (const definition of definitions) await tx.update(pmcActivityDefinitions).set({ weightPercent: String(sent.get(definition.id)), updatedAt: now }).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.id, definition.id)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.activity_weights_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ modelCode: input.modelCode, before: Object.fromEntries(definitions.map(definition => [definition.code, Number(definition.weightPercent)])), after: Object.fromEntries(definitions.map(definition => [definition.code, sent.get(definition.id)])) }) });
    // the weights are what a unit's progress is made of (rule 1): the linked WBS items follow in this transaction
    await syncPmcProgressToEvm(tx, input, now);
  });
  return { modelCode: input.modelCode, saved: definitions.length };
}

/**
 * Q-49: an activity's English name, set or cleared (null) from the catalogue screen. The activity is its code: every model's definition of that code takes
 * the name (one activity, one English name). Display only — codes, weights and relations are not touched. Same guard as the weights (project.pmc.manage),
 * one transaction with its audit row (before and after); a code the project does not have is NOT_FOUND, never a silent «0 rows».
 */
export async function savePmcActivityEnglishName(input: Scope & { activityCode: string; nameEn: string | null }) {
  const db = await authorize(input, "project.pmc.manage");
  const nameEn = input.nameEn?.trim() ? input.nameEn.trim() : null;
  return db.transaction(async tx => {
    const definitions = await tx.select({ id: pmcActivityDefinitions.id, nameEn: pmcActivityDefinitions.nameEn }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.code, input.activityCode)));
    if (!definitions.length) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
    const changed = await tx.update(pmcActivityDefinitions).set({ nameEn, updatedAt: new Date() }).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.code, input.activityCode))).returning({ id: pmcActivityDefinitions.id });
    if (changed.length !== definitions.length) throw refuse("CONFLICT", "PROJECT_OS_PMC_ACTIVITY_CHANGED");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.activity_english_name_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ activityCode: input.activityCode, before: Array.from(new Set(definitions.map(definition => definition.nameEn ?? null))), after: nameEn, definitions: changed.length }) });
    return { activityCode: input.activityCode, nameEn, saved: changed.length };
  });
}

/**
 * Q-49: the catalogue as a file that imports back — the catalogue template's own columns, each name beside its English one. Importing it again changes
 * nothing; an English name typed into it is an update, never a duplicate activity (planCatalog). The headers are the importer's own words: Arabic for
 * Arabic and Urdu, English for English. Read permission only: it is the project's own catalogue.
 */
const CATALOG_HEADERS = {
  ar: ["النموذج", "رمز المجموعة", "اسم المجموعة", "اسم المجموعة بالإنجليزية", "رمز المرحلة", "اسم المرحلة", "اسم المرحلة بالإنجليزية", "رمز النشاط", "اسم النشاط", "اسم النشاط بالإنجليزية", "الوزن", "رمز WBS"],
  en: ["Model", "Group code", "Group name", "Group name (EN)", "Stage code", "Stage name", "Stage name (EN)", "Activity code", "Activity name", "Activity name (EN)", "Weight", "WBS code"],
} as const;
export async function exportPmcCatalog(input: Scope & { locale: ExportLocale }) {
  const db = await authorize(input, "project.pmc.read");
  const rows = await db.select({ modelCode: pmcActivityDefinitions.modelCode, groupCode: pmcActivityGroups.code, groupName: pmcActivityGroups.name, groupNameEn: pmcActivityGroups.nameEn, stageCode: pmcActivityStages.code, stageName: pmcActivityStages.name, stageNameEn: pmcActivityStages.nameEn, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, nameEn: pmcActivityDefinitions.nameEn, weightPercent: pmcActivityDefinitions.weightPercent, wbsCode: wbsItems.code })
    .from(pmcActivityDefinitions)
    .innerJoin(pmcActivityGroups, and(eq(pmcActivityGroups.id, pmcActivityDefinitions.groupId), mine(pmcActivityGroups, input)))
    .innerJoin(pmcActivityStages, and(eq(pmcActivityStages.id, pmcActivityDefinitions.stageId), mine(pmcActivityStages, input)))
    .leftJoin(wbsItems, and(eq(wbsItems.id, pmcActivityDefinitions.wbsItemId), mine(wbsItems, input)))
    .where(mine(pmcActivityDefinitions, input)).orderBy(asc(pmcActivityDefinitions.modelCode), asc(pmcActivityDefinitions.code));
  const headers = CATALOG_HEADERS[input.locale === "en" ? "en" : "ar"];
  const bytes = await buildSpreadsheet({ sheetName: input.locale === "en" ? "Catalogue" : "الدليل", headers: [...headers], format: "xlsx",
    rows: rows.map(row => [row.modelCode, row.groupCode, row.groupName, row.groupNameEn ?? "", row.stageCode, row.stageName, row.stageNameEn ?? "", row.code, row.name, row.nameEn ?? "", Number(row.weightPercent), row.wbsCode ?? ""]) });
  return { fileName: "pmc-catalogue.xlsx", base64: Buffer.from(bytes).toString("base64"), rows: rows.length };
}

/** Units of one block (or a unit range) by the activities of their model, with each cell's status; at most MAX_GRID_UNITS units. */
export async function getPmcStatusGrid(input: Scope & { blockId?: string; from?: number; to?: number }) {
  const db = await authorize(input, "project.pmc.read");
  const conditions = [mine(pmcUnits, input)];
  if (input.blockId) conditions.push(eq(pmcUnits.blockId, input.blockId));
  if (input.from !== undefined && input.to !== undefined) conditions.push(between(pmcUnits.unitNumber, input.from, input.to));
  const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(...conditions)).orderBy(asc(pmcUnits.unitNumber)).limit(MAX_GRID_UNITS + 1);
  const shown = units.slice(0, MAX_GRID_UNITS);
  const modelCodes = Array.from(new Set(shown.map(unit => unit.modelCode)));
  const [definitions, cells] = shown.length ? await Promise.all([
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), inArray(pmcActivityDefinitions.modelCode, modelCodes))).orderBy(asc(pmcActivityDefinitions.code)),
    db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(and(mine(pmcUnitActivityProgress, input), inArray(pmcUnitActivityProgress.unitId, shown.map(unit => unit.id)))),
  ]) : [[], []];
  return { units: shown, truncated: units.length > MAX_GRID_UNITS, activities: definitions, cells };
}
