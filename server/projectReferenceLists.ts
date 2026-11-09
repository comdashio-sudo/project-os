// D-44 (a), P-35: the project's reference lists the daily report chooses from (migration 0022).
//   - labour roles (direct / indirect): listLabourRoles, seedDefaultLabourRoles (copies shared/defaultLabourRoles.ts; copying again adds nothing), saveLabourRole, setLabourRoleActive;
//   - equipment: listEquipment, saveEquipment (the owner is a company on THIS project: checked here, and made impossible otherwise by a composite foreign key), setEquipmentActive;
//   - what each site activity is measured in: listSiteActivityMeasures, setSiteActivityMeasure (anything but «villa» needs its whole quantity; a CHECK holds the same rule).
// Reading takes project.read, project.field.manage (the site engineer fills the daily report from these lists) or project.manage; writing takes project.manage.
// Nothing is deleted: a role or a machine is made inactive (reports will name it). The audit row is written in the same transaction as the change.
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, pmcSiteActivities, projectCompanies, projectEquipment, projectLabourRoles } from "../drizzle/schema";
import { DEFAULT_LABOUR_ROLES, type LabourCategory } from "../shared/defaultLabourRoles";
import type { InterfaceLanguage } from "../shared/interfaceLanguages";
import { projectGate } from "./projectProfile";

type Scope = { userId: number; tenantId: string; projectId: string };
const READ = ["project.read", "project.field.manage", "project.manage"] as const;
const WRITE = ["project.manage"] as const;
export const MEASURE_UNITS = ["villa", "lm", "m2", "piece"] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });
/** The PostgreSQL error code (and constraint) wherever drizzle put the driver's error. */
function pgError(error: unknown): { code?: string; constraint?: string } {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++, current = (current as { cause?: unknown }).cause) {
    const { code, constraint } = current as { code?: string; constraint?: string };
    if (code && /^[0-9A-Z]{5}$/.test(code)) return { code, constraint };
  }
  return {};
}
const audit = (input: Scope, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) =>
  ({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType, entityId, metadata: JSON.stringify({ projectId: input.projectId, ...metadata }) });

// ------------------------------------------------------------------ labour roles

export async function listLabourRoles(input: Scope) {
  const db = await projectGate(input, READ);
  return db.select({ id: projectLabourRoles.id, name: projectLabourRoles.name, category: projectLabourRoles.category, defaultKey: projectLabourRoles.defaultKey, active: projectLabourRoles.active, sortOrder: projectLabourRoles.sortOrder })
    .from(projectLabourRoles).where(mine(projectLabourRoles, input)).orderBy(asc(projectLabourRoles.category), asc(projectLabourRoles.sortOrder), asc(projectLabourRoles.name)) as Promise<Array<{ id: string; name: string; category: LabourCategory; defaultKey: string | null; active: boolean; sortOrder: number }>>;
}

/** Copies the default list in one language. A role already copied (same default key) or already named the same is skipped, so running it again adds nothing. */
export async function seedDefaultLabourRoles(input: Scope & { language: InterfaceLanguage }) {
  const db = await projectGate(input, WRITE);
  const added = await db.transaction(async tx => {
    const rows = await tx.insert(projectLabourRoles).values(DEFAULT_LABOUR_ROLES.map((role, index) => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, name: role[input.language], category: role.category, defaultKey: role.key, sortOrder: (index + 1) * 10 })))
      .onConflictDoNothing().returning({ id: projectLabourRoles.id });
    await tx.insert(auditLogs).values(audit(input, "project.labour_roles_seeded", "project", input.projectId, { language: input.language, added: rows.length, offered: DEFAULT_LABOUR_ROLES.length }));
    return rows.length;
  });
  return { added, offered: DEFAULT_LABOUR_ROLES.length };
}

/** Adds a role (no id) or renames / re-categorises one (id). One name per project, whatever the letter case (unique index on lower(name)). */
export async function saveLabourRole(input: Scope & { id?: string; name: string; category: LabourCategory; sortOrder?: number }) {
  const db = await projectGate(input, WRITE);
  const name = input.name.trim();
  if (!name) throw refuse("BAD_REQUEST", "PROJECT_OS_REFERENCE_NAME_MISSING");
  const id = input.id ?? randomUUID();
  try {
    await db.transaction(async tx => {
      if (input.id) {
        const updated = await tx.update(projectLabourRoles).set({ name, category: input.category, ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }), updatedAt: new Date() })
          .where(and(mine(projectLabourRoles, input), eq(projectLabourRoles.id, input.id))).returning({ id: projectLabourRoles.id });
        if (!updated.length) throw refuse("NOT_FOUND", "PROJECT_OS_LABOUR_ROLE_NOT_FOUND");
      } else await tx.insert(projectLabourRoles).values({ id, tenantId: input.tenantId, projectId: input.projectId, name, category: input.category, sortOrder: input.sortOrder ?? 0 });
      await tx.insert(auditLogs).values(audit(input, input.id ? "project.labour_role_updated" : "project.labour_role_added", "project_labour_role", id, { category: input.category }));
    });
  } catch (error) {
    if (pgError(error).code === "23505") throw refuse("CONFLICT", "PROJECT_OS_LABOUR_ROLE_EXISTS");
    throw error;
  }
  return { id };
}

export async function setLabourRoleActive(input: Scope & { id: string; active: boolean }) {
  const db = await projectGate(input, WRITE);
  await db.transaction(async tx => {
    const updated = await tx.update(projectLabourRoles).set({ active: input.active, updatedAt: new Date() }).where(and(mine(projectLabourRoles, input), eq(projectLabourRoles.id, input.id))).returning({ id: projectLabourRoles.id });
    if (!updated.length) throw refuse("NOT_FOUND", "PROJECT_OS_LABOUR_ROLE_NOT_FOUND");
    await tx.insert(auditLogs).values(audit(input, input.active ? "project.labour_role_activated" : "project.labour_role_deactivated", "project_labour_role", input.id, {}));
  });
  return { id: input.id, active: input.active };
}

// ------------------------------------------------------------------ equipment

export async function listEquipment(input: Scope) {
  const db = await projectGate(input, READ);
  return db.select({ id: projectEquipment.id, equipmentType: projectEquipment.equipmentType, model: projectEquipment.model, plateOrSize: projectEquipment.plateOrSize, ownerCompanyId: projectEquipment.ownerCompanyId, ownerName: projectCompanies.name, active: projectEquipment.active })
    .from(projectEquipment).leftJoin(projectCompanies, and(eq(projectCompanies.id, projectEquipment.ownerCompanyId), eq(projectCompanies.tenantId, projectEquipment.tenantId), eq(projectCompanies.projectId, projectEquipment.projectId)))
    .where(mine(projectEquipment, input)).orderBy(asc(projectEquipment.equipmentType), asc(projectEquipment.plateOrSize));
}

export type EquipmentInput = Scope & { id?: string; equipmentType: string; model: string | null; plateOrSize: string | null; ownerCompanyId: string | null };
/** Adds a machine (no id) or edits one (id). The owner, when given, must be a company on this project; a plate or size is unique per project, whatever the letter case. */
export async function saveEquipment(input: EquipmentInput) {
  const db = await projectGate(input, WRITE);
  const equipmentType = input.equipmentType.trim();
  if (!equipmentType) throw refuse("BAD_REQUEST", "PROJECT_OS_REFERENCE_NAME_MISSING");
  const values = { equipmentType, model: input.model?.trim() || null, plateOrSize: input.plateOrSize?.trim() || null, ownerCompanyId: input.ownerCompanyId };
  if (input.ownerCompanyId) {
    const [owner] = await db.select({ id: projectCompanies.id }).from(projectCompanies).where(and(mine(projectCompanies, input), eq(projectCompanies.id, input.ownerCompanyId))).limit(1);
    if (!owner) throw refuse("BAD_REQUEST", "PROJECT_OS_EQUIPMENT_OWNER_NOT_ON_PROJECT");
  }
  const id = input.id ?? randomUUID();
  try {
    await db.transaction(async tx => {
      if (input.id) {
        const updated = await tx.update(projectEquipment).set({ ...values, updatedAt: new Date() }).where(and(mine(projectEquipment, input), eq(projectEquipment.id, input.id))).returning({ id: projectEquipment.id });
        if (!updated.length) throw refuse("NOT_FOUND", "PROJECT_OS_EQUIPMENT_NOT_FOUND");
      } else await tx.insert(projectEquipment).values({ id, tenantId: input.tenantId, projectId: input.projectId, ...values });
      await tx.insert(auditLogs).values(audit(input, input.id ? "project.equipment_updated" : "project.equipment_added", "project_equipment", id, { ownerCompanyId: values.ownerCompanyId }));
    });
  } catch (error) {
    const { code } = pgError(error);
    if (code === "23505") throw refuse("CONFLICT", "PROJECT_OS_EQUIPMENT_PLATE_EXISTS");
    if (code === "23503") throw refuse("BAD_REQUEST", "PROJECT_OS_EQUIPMENT_OWNER_NOT_ON_PROJECT");
    throw error;
  }
  return { id };
}

export async function setEquipmentActive(input: Scope & { id: string; active: boolean }) {
  const db = await projectGate(input, WRITE);
  await db.transaction(async tx => {
    const updated = await tx.update(projectEquipment).set({ active: input.active, updatedAt: new Date() }).where(and(mine(projectEquipment, input), eq(projectEquipment.id, input.id))).returning({ id: projectEquipment.id });
    if (!updated.length) throw refuse("NOT_FOUND", "PROJECT_OS_EQUIPMENT_NOT_FOUND");
    await tx.insert(auditLogs).values(audit(input, input.active ? "project.equipment_activated" : "project.equipment_deactivated", "project_equipment", input.id, {}));
  });
  return { id: input.id, active: input.active };
}

// ------------------------------------------------------------------ what each site activity is measured in

export async function listSiteActivityMeasures(input: Scope) {
  const db = await projectGate(input, READ);
  const rows = await db.select({ id: pmcSiteActivities.id, code: pmcSiteActivities.code, name: pmcSiteActivities.name, measureUnit: pmcSiteActivities.measureUnit, totalQuantity: pmcSiteActivities.totalQuantity })
    .from(pmcSiteActivities).where(mine(pmcSiteActivities, input)).orderBy(asc(pmcSiteActivities.sortOrder));
  return rows.map(row => ({ ...row, measureUnit: row.measureUnit as MeasureUnit, totalQuantity: row.totalQuantity === null ? null : Number(row.totalQuantity) }));
}

/** «villa» keeps no quantity (the count of villas is the units themselves); lm / m2 / piece need a whole quantity above zero. */
export async function setSiteActivityMeasure(input: Scope & { siteActivityId: string; measureUnit: MeasureUnit; totalQuantity: number | null }) {
  const db = await projectGate(input, WRITE);
  const totalQuantity = input.measureUnit === "villa" ? null : input.totalQuantity;
  if (input.measureUnit !== "villa" && !(typeof totalQuantity === "number" && Number.isFinite(totalQuantity) && totalQuantity > 0)) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_ACTIVITY_QUANTITY_REQUIRED");
  await db.transaction(async tx => {
    const updated = await tx.update(pmcSiteActivities).set({ measureUnit: input.measureUnit, totalQuantity: totalQuantity === null ? null : String(totalQuantity), updatedAt: new Date() })
      .where(and(mine(pmcSiteActivities, input), eq(pmcSiteActivities.id, input.siteActivityId))).returning({ id: pmcSiteActivities.id });
    if (!updated.length) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_SITE_ACTIVITY_NOT_FOUND");
    await tx.insert(auditLogs).values(audit(input, "project.site_activity_measure_set", "pmc_site_activity", input.siteActivityId, { measureUnit: input.measureUnit, totalQuantity }));
  });
  return { id: input.siteActivityId, measureUnit: input.measureUnit, totalQuantity };
}
