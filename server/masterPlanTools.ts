// Master Plan tools (work order 5, item 9): the plan underlay's rotation and real size (G-135), moving an entity in the parent tree and
// editing its geometry (G-135/G-136), and sharing a saved view with the project (G-136). Same discipline as the rest of the Master Plan:
// tenant, project, the named permission and the licence feature are checked before anything is read or written, every query filters on tenant
// AND project, and every write leaves an audit row in its own transaction. The cycle rule is shared/masterPlanTools.ts.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { auditLogs, masterPlanSnapshots, masterPlanSpatialEntities, masterPlanVersions } from "../drizzle/schema";
import { normalizeRotation, wouldCreateCycle } from "@shared/masterPlanTools";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb } from "./db";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) => new TRPCError({ code, message });

/** Turn the plan underlay and tell the platform how big the plan area really is (metres). Both sizes are given or neither. */
export async function setMasterPlanVersionGeometry(input: { userId: number; tenantId: string; projectId: string; masterPlanVersionId: string; rotationDegrees: number; mapWidthMeters?: number | null; mapHeightMeters?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.write", featureCode: "MASTER_PLAN", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const width = input.mapWidthMeters ?? null; const height = input.mapHeightMeters ?? null;
  if ((width === null) !== (height === null)) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_CALIBRATION_INVALID");
  if (width !== null && (!Number.isFinite(width) || !Number.isFinite(height!) || width <= 0 || height! <= 0 || width > 100_000 || height! > 100_000)) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_CALIBRATION_INVALID");
  if (!Number.isFinite(input.rotationDegrees)) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_ROTATION_INVALID");
  const [version] = await db.select({ id: masterPlanVersions.id, rotationDegrees: masterPlanVersions.rotationDegrees, mapWidthMeters: masterPlanVersions.mapWidthMeters, mapHeightMeters: masterPlanVersions.mapHeightMeters }).from(masterPlanVersions).where(and(eq(masterPlanVersions.id, input.masterPlanVersionId), eq(masterPlanVersions.tenantId, input.tenantId), eq(masterPlanVersions.projectId, input.projectId))).limit(1);
  if (!version) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
  const rotationDegrees = normalizeRotation(input.rotationDegrees);
  await db.transaction(async tx => {
    await tx.update(masterPlanVersions).set({ rotationDegrees, mapWidthMeters: width === null ? null : String(width), mapHeightMeters: height === null ? null : String(height) }).where(and(eq(masterPlanVersions.id, input.masterPlanVersionId), eq(masterPlanVersions.tenantId, input.tenantId), eq(masterPlanVersions.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.version_geometry_set", entityType: "master_plan_version", entityId: input.masterPlanVersionId, metadata: JSON.stringify({ projectId: input.projectId, previous: { rotationDegrees: version.rotationDegrees, mapWidthMeters: version.mapWidthMeters, mapHeightMeters: version.mapHeightMeters }, rotationDegrees, mapWidthMeters: width, mapHeightMeters: height }) });
  });
  return { id: input.masterPlanVersionId, rotationDegrees, mapWidthMeters: width, mapHeightMeters: height };
}

/**
 * Move an entity in the parent tree and/or change its geometry. A parent must be another entity of the SAME version, never the entity itself or one of
 * its own descendants (the tree stays a tree). `parentEntityId: null` makes it a root; leaving it out leaves the parent alone.
 */
export async function updateMasterPlanEntityLayout(input: { userId: number; tenantId: string; projectId: string; entityId: string; parentEntityId?: string | null; geometry?: { x: number; y: number; width: number; height: number } }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.write", featureCode: "MASTER_PLAN_ENTITIES", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.parentEntityId === undefined && input.geometry === undefined) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_NOTHING_TO_CHANGE");
  const [entity] = await db.select({ id: masterPlanSpatialEntities.id, versionId: masterPlanSpatialEntities.masterPlanVersionId, parentEntityId: masterPlanSpatialEntities.parentEntityId, geometry: masterPlanSpatialEntities.geometry, code: masterPlanSpatialEntities.code }).from(masterPlanSpatialEntities).where(and(eq(masterPlanSpatialEntities.id, input.entityId), eq(masterPlanSpatialEntities.tenantId, input.tenantId), eq(masterPlanSpatialEntities.projectId, input.projectId))).limit(1);
  if (!entity) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_ENTITY_NOT_FOUND");
  const change: { parentEntityId?: string | null; geometry?: string } = {};
  if (input.geometry !== undefined) {
    const g = input.geometry;
    if (![g.x, g.y, g.width, g.height].every(Number.isFinite) || g.x < 0 || g.y < 0 || g.width <= 0 || g.height <= 0 || g.x + g.width > 100 || g.y + g.height > 100) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_GEOMETRY_INVALID");
    change.geometry = JSON.stringify(g);
  }
  if (input.parentEntityId !== undefined) {
    if (input.parentEntityId !== null) {
      const tree = await db.select({ id: masterPlanSpatialEntities.id, parentEntityId: masterPlanSpatialEntities.parentEntityId }).from(masterPlanSpatialEntities).where(and(eq(masterPlanSpatialEntities.masterPlanVersionId, entity.versionId), eq(masterPlanSpatialEntities.tenantId, input.tenantId), eq(masterPlanSpatialEntities.projectId, input.projectId)));
      if (!tree.some(item => item.id === input.parentEntityId)) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_PARENT_NOT_FOUND");
      if (wouldCreateCycle(new Map(tree.map(item => [item.id, item.parentEntityId])), input.entityId, input.parentEntityId)) throw refuse("CONFLICT", "PROJECT_OS_MASTER_PLAN_PARENT_CYCLE");
    }
    change.parentEntityId = input.parentEntityId;
  }
  await db.transaction(async tx => {
    await tx.update(masterPlanSpatialEntities).set(change).where(and(eq(masterPlanSpatialEntities.id, input.entityId), eq(masterPlanSpatialEntities.tenantId, input.tenantId), eq(masterPlanSpatialEntities.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.entity_layout_updated", entityType: "master_plan_entity", entityId: input.entityId, metadata: JSON.stringify({ projectId: input.projectId, code: entity.code, previousParentEntityId: entity.parentEntityId, parentEntityId: input.parentEntityId === undefined ? entity.parentEntityId : input.parentEntityId, previousGeometry: entity.geometry, geometry: change.geometry ?? entity.geometry }) });
  });
  return { id: input.entityId };
}

/** Share a saved view with everyone who can read this project's Master Plan, or take it back. Only the person who saved it decides. */
export async function setMasterPlanSnapshotSharing(input: { userId: number; tenantId: string; projectId: string; snapshotId: string; shared: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.read", featureCode: "MASTER_PLAN", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [snapshot] = await db.select({ id: masterPlanSnapshots.id, createdByUserId: masterPlanSnapshots.createdByUserId, label: masterPlanSnapshots.label, sharedWithProject: masterPlanSnapshots.sharedWithProject }).from(masterPlanSnapshots).where(and(eq(masterPlanSnapshots.id, input.snapshotId), eq(masterPlanSnapshots.tenantId, input.tenantId), eq(masterPlanSnapshots.projectId, input.projectId))).limit(1);
  // a view that is not yours and not shared with you does not exist for you: the answer is "not found", not "forbidden"
  if (!snapshot || (snapshot.createdByUserId !== input.userId && !snapshot.sharedWithProject)) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_FOUND");
  if (snapshot.createdByUserId !== input.userId) throw refuse("FORBIDDEN", "PROJECT_OS_MASTER_PLAN_SNAPSHOT_NOT_OWNER");
  await db.transaction(async tx => {
    await tx.update(masterPlanSnapshots).set({ sharedWithProject: input.shared }).where(and(eq(masterPlanSnapshots.id, input.snapshotId), eq(masterPlanSnapshots.tenantId, input.tenantId), eq(masterPlanSnapshots.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: input.shared ? "master_plans.snapshot_shared" : "master_plans.snapshot_unshared", entityType: "master_plan_snapshot", entityId: input.snapshotId, metadata: JSON.stringify({ projectId: input.projectId, label: snapshot.label }) });
  });
  return { id: input.snapshotId, shared: input.shared };
}
