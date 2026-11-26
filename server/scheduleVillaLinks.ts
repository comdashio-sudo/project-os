// Q-61 (2): the project's P6 schedule set against its villas — which villa each activity belongs to, the villas the schedule names that the project does not
// have, and the villas whose type or block in P6 differs from the project's. Read only (server/domain/scheduleVillas.ts decides); the live schedule's own
// permission (project.read or project.manage on the project); every query by tenant and project, every join on the same company.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { activities, activityCodeAssignments, activityCodeTypes, activityCodeValues, pmcBlocks, pmcUnits, wbsItems } from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { linkScheduleToVillas, type ScheduleActivity } from "./domain/scheduleVillas";

export async function getScheduleVillaLinks(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: ["project.read", "project.manage"], scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

  const [wbs, rows, codes, villas] = await Promise.all([
    db.select({ id: wbsItems.id, parentId: wbsItems.parentId, code: wbsItems.code, name: wbsItems.name }).from(wbsItems).where(mine(wbsItems)),
    db.select({ id: activities.id, code: activities.code, name: activities.name, wbsItemId: activities.wbsItemId }).from(activities).where(mine(activities)),
    db.select({ activityId: activityCodeAssignments.activityId, type: activityCodeTypes.name, value: activityCodeValues.shortName })
      .from(activityCodeAssignments)
      .innerJoin(activityCodeTypes, and(eq(activityCodeTypes.id, activityCodeAssignments.codeTypeId), eq(activityCodeTypes.tenantId, activityCodeAssignments.tenantId)))
      .innerJoin(activityCodeValues, and(eq(activityCodeValues.id, activityCodeAssignments.codeValueId), eq(activityCodeValues.tenantId, activityCodeAssignments.tenantId)))
      .where(mine(activityCodeAssignments)),
    db.select({ unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, blockCode: pmcBlocks.code })
      .from(pmcUnits).innerJoin(pmcBlocks, and(eq(pmcBlocks.id, pmcUnits.blockId), eq(pmcBlocks.tenantId, pmcUnits.tenantId))).where(mine(pmcUnits)),
  ]);
  const codesOf = new Map<string, Record<string, string>>();
  for (const row of codes) (codesOf.get(row.activityId) ?? codesOf.set(row.activityId, {}).get(row.activityId)!)[row.type] = row.value;
  const scheduleActivities: ScheduleActivity[] = rows.map(row => ({ ...row, codes: codesOf.get(row.id) ?? {} }));
  return linkScheduleToVillas({ wbs, activities: scheduleActivities, villas });
}
