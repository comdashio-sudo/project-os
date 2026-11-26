// Q-61 (2): the project's P6 schedule set against its villas — which villa each activity belongs to, the villas the schedule names that the project does not
// have, and the villas whose type or block in P6 differs from the project's. Read only (server/domain/scheduleVillas.ts decides); the live schedule's own
// villas are PMC data, so it is read with project.pmc.read and the PMC feature (pmcGate); every query by tenant and project, every join on the same company.
import { and, eq } from "drizzle-orm";
import { activities, activityCodeAssignments, activityCodeTypes, activityCodeValues, pmcBlocks, pmcUnits, wbsItems } from "../drizzle/schema";
import { getDb } from "./db";
import { linkScheduleToVillas, type ScheduleActivity } from "./domain/scheduleVillas";
import { pmcGate } from "./wo22Shared";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
/** The project's schedule (WBS, activities with their P6 codes) and villas, every query by tenant and project and every join on the same company. Also the
 * names of the code values («Q02» → «Blockwork»), for the stages of Q-61 (3). The caller has already checked the permission. */
export async function loadScheduleAndVillas(db: Db, scope: { tenantId: string; projectId: string }) {
  const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, scope.tenantId), eq(table.projectId as never, scope.projectId));
  const [wbs, rows, codes, villas] = await Promise.all([
    db.select({ id: wbsItems.id, parentId: wbsItems.parentId, code: wbsItems.code, name: wbsItems.name }).from(wbsItems).where(mine(wbsItems)),
    db.select({ id: activities.id, code: activities.code, name: activities.name, wbsItemId: activities.wbsItemId }).from(activities).where(mine(activities)),
    db.select({ activityId: activityCodeAssignments.activityId, type: activityCodeTypes.name, value: activityCodeValues.shortName, valueName: activityCodeValues.name })
      .from(activityCodeAssignments)
      .innerJoin(activityCodeTypes, and(eq(activityCodeTypes.id, activityCodeAssignments.codeTypeId), eq(activityCodeTypes.tenantId, activityCodeAssignments.tenantId)))
      .innerJoin(activityCodeValues, and(eq(activityCodeValues.id, activityCodeAssignments.codeValueId), eq(activityCodeValues.tenantId, activityCodeAssignments.tenantId)))
      .where(mine(activityCodeAssignments)),
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, blockCode: pmcBlocks.code, unitWeight: pmcUnits.unitWeight })
      .from(pmcUnits).innerJoin(pmcBlocks, and(eq(pmcBlocks.id, pmcUnits.blockId), eq(pmcBlocks.tenantId, pmcUnits.tenantId))).where(mine(pmcUnits)),
  ]);
  const codesOf = new Map<string, Record<string, string>>();
  const valueNames = new Map<string, string>();
  for (const row of codes) {
    (codesOf.get(row.activityId) ?? codesOf.set(row.activityId, {}).get(row.activityId)!)[row.type] = row.value;
    valueNames.set(row.value.trim().toUpperCase(), row.valueName);
  }
  const scheduleActivities: ScheduleActivity[] = rows.map(row => ({ ...row, codes: codesOf.get(row.id) ?? {} }));
  return { wbs, activities: scheduleActivities, villas, valueNames };
}

export async function getScheduleVillaLinks(input: { userId: number; tenantId: string; projectId: string }) {
  // PMC villa data (numbers, models, blocks): read with project.pmc.read and the PMC feature, like every other read of the villas (review of #550, B)
  const db = await pmcGate(input, "project.pmc.read");
  const { wbs, activities: scheduleActivities, villas } = await loadScheduleAndVillas(db, input);
  return linkScheduleToVillas({ wbs, activities: scheduleActivities, villas });
}
