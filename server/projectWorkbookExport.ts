// Q-51 batch 3: the project workbook pre-filled with what the project already holds, so a company completes what is missing and uploads it again
// (the save compares with what is stored: what was downloaded comes back «unchanged»). This batch fills the PMC sheets the workbook applies first —
// the models, the units (with their zone and block) and the activities and weights (with their group and stage) — read with the PMC importer's own
// permission (the person who will edit the file and upload it again), always by tenant and project. The other sheets stay blank until later batches.
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcActivityGroups, pmcActivityStages, pmcBlocks, pmcUnits, pmcZones, wbsItems } from "../drizzle/schema";
import { buildProjectWorkbook, type WorkbookLocale } from "./domain/projectWorkbook";
import { authorize } from "./pmcImportService";

type Scope = { userId: number; tenantId: string; projectId: string };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const weight = (value: string | null) => (value === null ? null : Number(value));

export async function exportFilledProjectWorkbook(input: Scope & { locale: WorkbookLocale }) {
  const db = await authorize(input);
  const units = await db.select({ zoneCode: pmcZones.code, zoneName: pmcZones.name, blockCode: pmcBlocks.code, blockName: pmcBlocks.name, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, saleStatus: pmcUnits.saleStatus, unitWeight: pmcUnits.unitWeight })
    .from(pmcUnits).innerJoin(pmcBlocks, and(eq(pmcBlocks.id, pmcUnits.blockId), eq(pmcBlocks.tenantId, pmcUnits.tenantId))).innerJoin(pmcZones, and(eq(pmcZones.id, pmcBlocks.zoneId), eq(pmcZones.tenantId, pmcBlocks.tenantId)))
    .where(mine(pmcUnits, input)).orderBy(asc(pmcUnits.unitNumber));
  const activities = await db.select({ modelCode: pmcActivityDefinitions.modelCode, groupCode: pmcActivityGroups.code, groupName: pmcActivityGroups.name, groupNameEn: pmcActivityGroups.nameEn, stageCode: pmcActivityStages.code, stageName: pmcActivityStages.name, stageNameEn: pmcActivityStages.nameEn, activityCode: pmcActivityDefinitions.code, activityName: pmcActivityDefinitions.name, activityNameEn: pmcActivityDefinitions.nameEn, weightPercent: pmcActivityDefinitions.weightPercent, wbsCode: wbsItems.code })
    .from(pmcActivityDefinitions).innerJoin(pmcActivityGroups, and(eq(pmcActivityGroups.id, pmcActivityDefinitions.groupId), eq(pmcActivityGroups.tenantId, pmcActivityDefinitions.tenantId))).innerJoin(pmcActivityStages, and(eq(pmcActivityStages.id, pmcActivityDefinitions.stageId), eq(pmcActivityStages.tenantId, pmcActivityDefinitions.tenantId)))
    // review of #534: the activity's WBS item, so the link comes back with the file (an empty cell would unlink it); optional, so a left join on the same company
    .leftJoin(wbsItems, and(eq(wbsItems.id, pmcActivityDefinitions.wbsItemId), eq(wbsItems.tenantId, pmcActivityDefinitions.tenantId)))
    .where(mine(pmcActivityDefinitions, input)).orderBy(asc(pmcActivityDefinitions.modelCode), asc(pmcActivityDefinitions.code));
  const models = Array.from(new Set([...units.map(unit => unit.modelCode), ...activities.map(activity => activity.modelCode)])).sort().map(modelCode => ({ modelCode }));
  const file = await buildProjectWorkbook({ locale: input.locale, fill: {
    models,
    units: units.map(unit => ({ ...unit, unitWeight: weight(unit.unitWeight) })),
    activities: activities.map(activity => ({ ...activity, weightPercent: weight(activity.weightPercent) })),
  } });
  // like every export of project data: the audit row says who took what out (G-110)
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_export_generated", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ export: "project_workbook_filled", locale: input.locale, models: models.length, units: units.length, activities: activities.length }) });
  return { fileName: file.fileName.replace(".xlsx", "-filled.xlsx"), contentType: file.contentType, base64: file.bytes.toString("base64") };
}
