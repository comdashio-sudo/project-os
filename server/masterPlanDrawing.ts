// Saved Master Plan drawing (G-189): the polygons of a drawing, the links a person confirmed from a polygon to a unit, and the drawing file itself
// with its versions. Same discipline as the rest of the Master Plan: tenant, project, the licence feature and the named permission are checked before
// anything is read or written, every query filters on tenant AND project, and every write leaves an audit row in its own transaction.
// A link or an unlink is one audit row each. The automatic proposals of the matcher are never written here; only what a person confirmed.
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, masterPlanDrawingLinks, masterPlanDrawingPolygons, masterPlanDrawingVersions, masterPlanDrawings, masterPlanSpatialEntities, masterPlanVersions } from "../drizzle/schema";
import { countPdfPages, detectDrawingKind, layoutProblem, type DrawingPolygonInput } from "./domain/masterPlanDrawing";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb } from "./db";
import { safeUploadFileName, takeDirectUpload } from "./directUploadKeys";
import { storageGetSignedUrl, storagePut } from "./storage";
import { calibrationProblem, parseBackground, parseCalibration, type DrawingBackground, type DrawingCalibration } from "../shared/masterPlanCalibration";

type Scope = { userId: number; tenantId: string; projectId: string };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Permission = "project.read" | "project.write";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });

/** The licence feature and the named permission, the tenant and the project. Returns the database to use. */
async function open(scope: Scope, permission: Permission): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantFeatureAccess({ userId: scope.userId, tenantId: scope.tenantId, product: "PROJECT", permission, featureCode: "MASTER_PLAN", scope: { type: "project", id: scope.projectId } });
  await assertProjectWithinTenant({ tenantId: scope.tenantId, projectId: scope.projectId });
  return db;
}

async function requireVersion(db: Db, scope: Scope, masterPlanVersionId: string) {
  const [version] = await db.select({ id: masterPlanVersions.id }).from(masterPlanVersions).where(and(eq(masterPlanVersions.id, masterPlanVersionId), eq(masterPlanVersions.tenantId, scope.tenantId), eq(masterPlanVersions.projectId, scope.projectId))).limit(1);
  if (!version) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
}

async function findDrawing(db: Db, scope: Scope, masterPlanVersionId: string) {
  const [drawing] = await db.select({ id: masterPlanDrawings.id, calibration: masterPlanDrawings.calibration, background: masterPlanDrawings.background }).from(masterPlanDrawings).where(and(eq(masterPlanDrawings.masterPlanVersionId, masterPlanVersionId), eq(masterPlanDrawings.tenantId, scope.tenantId), eq(masterPlanDrawings.projectId, scope.projectId))).limit(1);
  return drawing ?? null;
}

async function requireDrawing(db: Db, scope: Scope, masterPlanVersionId: string) {
  const drawing = await findDrawing(db, scope, masterPlanVersionId);
  if (!drawing) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_DRAWING_NOT_FOUND");
  return drawing.id;
}

async function requirePolygon(db: Db, scope: Scope, drawingId: string, polygonId: string) {
  const [polygon] = await db.select({ id: masterPlanDrawingPolygons.id, ref: masterPlanDrawingPolygons.ref }).from(masterPlanDrawingPolygons).where(and(eq(masterPlanDrawingPolygons.id, polygonId), eq(masterPlanDrawingPolygons.drawingId, drawingId), eq(masterPlanDrawingPolygons.tenantId, scope.tenantId), eq(masterPlanDrawingPolygons.projectId, scope.projectId))).limit(1);
  if (!polygon) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_NOT_FOUND");
  return polygon;
}

async function requireLink(db: Db, scope: Scope, drawingId: string, polygonId: string) {
  const [link] = await db.select({ id: masterPlanDrawingLinks.id, entityId: masterPlanDrawingLinks.entityId }).from(masterPlanDrawingLinks).where(and(eq(masterPlanDrawingLinks.polygonId, polygonId), eq(masterPlanDrawingLinks.drawingId, drawingId), eq(masterPlanDrawingLinks.tenantId, scope.tenantId), eq(masterPlanDrawingLinks.projectId, scope.projectId))).limit(1);
  if (!link) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_LINK_NOT_FOUND");
  return link;
}

/** A unique-key clash from the database, whether the driver reports it directly or wrapped in the ORM's error. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}

const polygonView = (row: { id: string; ref: string; label: string; points: string }) => ({ id: row.id, ref: row.ref, label: row.label, points: JSON.parse(row.points) as { x: number; y: number }[] });

async function versionsOf(db: Db, scope: Scope, drawingId: string) {
  return db.select({ id: masterPlanDrawingVersions.id, versionNumber: masterPlanDrawingVersions.versionNumber, fileName: masterPlanDrawingVersions.fileName, mimeType: masterPlanDrawingVersions.mimeType, sizeBytes: masterPlanDrawingVersions.sizeBytes, pageCount: masterPlanDrawingVersions.pageCount, checksumSha256: masterPlanDrawingVersions.checksumSha256, uploadedByUserId: masterPlanDrawingVersions.uploadedByUserId, createdAt: masterPlanDrawingVersions.createdAt }).from(masterPlanDrawingVersions).where(and(eq(masterPlanDrawingVersions.drawingId, drawingId), eq(masterPlanDrawingVersions.tenantId, scope.tenantId), eq(masterPlanDrawingVersions.projectId, scope.projectId))).orderBy(desc(masterPlanDrawingVersions.versionNumber));
}

/** The saved layout of one version's drawing: its latest file version, every version, the polygons and the confirmed links. */
export async function getMasterPlanDrawingLayout(input: Scope & { masterPlanVersionId: string }) {
  const db = await open(input, "project.read");
  await requireVersion(db, input, input.masterPlanVersionId);
  const drawing = await findDrawing(db, input, input.masterPlanVersionId);
  if (!drawing) return { drawingId: null, latestVersion: null, versions: [], polygons: [], links: [], calibration: null, background: null, backgroundUrl: null };
  const [versions, polygons, links] = await Promise.all([
    versionsOf(db, input, drawing.id),
    db.select({ id: masterPlanDrawingPolygons.id, ref: masterPlanDrawingPolygons.ref, label: masterPlanDrawingPolygons.label, points: masterPlanDrawingPolygons.points }).from(masterPlanDrawingPolygons).where(and(eq(masterPlanDrawingPolygons.drawingId, drawing.id), eq(masterPlanDrawingPolygons.tenantId, input.tenantId), eq(masterPlanDrawingPolygons.projectId, input.projectId))).orderBy(asc(masterPlanDrawingPolygons.ref)),
    db.select({ polygonId: masterPlanDrawingLinks.polygonId, entityId: masterPlanDrawingLinks.entityId, confirmedByUserId: masterPlanDrawingLinks.confirmedByUserId, confirmedAt: masterPlanDrawingLinks.confirmedAt }).from(masterPlanDrawingLinks).where(and(eq(masterPlanDrawingLinks.drawingId, drawing.id), eq(masterPlanDrawingLinks.tenantId, input.tenantId), eq(masterPlanDrawingLinks.projectId, input.projectId))),
  ]);
  const background = parseBackground(drawing.background);
  // The picture under the shapes: a short-lived link to the newest file, only for a raster drawing (a DXF is drawn from its shapes).
  const backgroundUrl = background && versions[0] ? await latestFileUrl(db, input, versions[0].id) : null;
  return { drawingId: drawing.id, latestVersion: versions[0] ?? null, versions, polygons: polygons.map(polygonView), links, calibration: parseCalibration(drawing.calibration), background, backgroundUrl };
}

async function latestFileUrl(db: Db, scope: Scope, versionId: string) {
  const [row] = await db.select({ storageKey: masterPlanDrawingVersions.storageKey }).from(masterPlanDrawingVersions).where(and(eq(masterPlanDrawingVersions.id, versionId), eq(masterPlanDrawingVersions.tenantId, scope.tenantId), eq(masterPlanDrawingVersions.projectId, scope.projectId))).limit(1);
  return row ? storageGetSignedUrl(row.storageKey) : null;
}

/** Store the two-point calibration of the drawing (Q-7). Points that coincide or a distance that is not a positive number of metres are refused. */
export async function saveMasterPlanDrawingCalibration(input: Scope & { masterPlanVersionId: string; calibration: DrawingCalibration }) {
  const db = await open(input, "project.write");
  await requireVersion(db, input, input.masterPlanVersionId);
  const drawingId = await requireDrawing(db, input, input.masterPlanVersionId);
  const problem = calibrationProblem(input.calibration);
  if (problem) throw refuse("BAD_REQUEST", `PROJECT_OS_MASTER_PLAN_CALIBRATION_${problem}`);
  const calibration = { a: input.calibration.a, b: input.calibration.b, meters: input.calibration.meters };
  await db.transaction(async tx => {
    const updated = await tx.update(masterPlanDrawings).set({ calibration: JSON.stringify(calibration), updatedAt: new Date() }).where(and(eq(masterPlanDrawings.id, drawingId), eq(masterPlanDrawings.tenantId, input.tenantId), eq(masterPlanDrawings.projectId, input.projectId))).returning({ id: masterPlanDrawings.id });
    if (updated.length !== 1) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_DRAWING_NOT_FOUND");
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.drawing_calibrated", entityType: "master_plan_drawing", entityId: drawingId, metadata: JSON.stringify({ projectId: input.projectId, masterPlanVersionId: input.masterPlanVersionId, ...calibration }) });
  });
  return { drawingId, calibration };
}

/** Every stored version of the drawing, newest first. Nothing is ever removed. */
export async function listMasterPlanDrawingVersions(input: Scope & { masterPlanVersionId: string }) {
  const db = await open(input, "project.read");
  await requireVersion(db, input, input.masterPlanVersionId);
  const drawing = await findDrawing(db, input, input.masterPlanVersionId);
  return { drawingId: drawing?.id ?? null, versions: drawing ? await versionsOf(db, input, drawing.id) : [] };
}

/**
 * Replace the drawing's polygons with the given set. A polygon with an `id` is updated; one without is added; one that is left out is removed,
 * and a polygon that still carries a confirmed link cannot be removed (the link is unlinked first, with its own audit row).
 */
export async function saveMasterPlanDrawingLayout(input: Scope & { masterPlanVersionId: string; polygons: DrawingPolygonInput[]; background?: DrawingBackground | null }) {
  const db = await open(input, "project.write");
  await requireVersion(db, input, input.masterPlanVersionId);
  const drawingId = await requireDrawing(db, input, input.masterPlanVersionId);
  if (layoutProblem(input.polygons)) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_DRAWING_LAYOUT_INVALID");
  const givenIds = input.polygons.flatMap(polygon => (polygon.id === undefined ? [] : [polygon.id]));
  if (new Set(givenIds).size !== givenIds.length) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_DRAWING_LAYOUT_INVALID");
  const existing = await db.select({ id: masterPlanDrawingPolygons.id }).from(masterPlanDrawingPolygons).where(and(eq(masterPlanDrawingPolygons.drawingId, drawingId), eq(masterPlanDrawingPolygons.tenantId, input.tenantId), eq(masterPlanDrawingPolygons.projectId, input.projectId)));
  const existingIds = new Set(existing.map(row => row.id));
  for (const polygon of input.polygons) if (polygon.id !== undefined && !existingIds.has(polygon.id)) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_NOT_FOUND");
  const keptIds = new Set(givenIds);
  const removedIds = existing.map(row => row.id).filter(id => !keptIds.has(id));
  if (removedIds.length > 0) {
    const [linked] = await db.select({ id: masterPlanDrawingLinks.id }).from(masterPlanDrawingLinks).where(and(eq(masterPlanDrawingLinks.drawingId, drawingId), eq(masterPlanDrawingLinks.tenantId, input.tenantId), eq(masterPlanDrawingLinks.projectId, input.projectId), inArray(masterPlanDrawingLinks.polygonId, removedIds))).limit(1);
    if (linked) throw refuse("CONFLICT", "PROJECT_OS_MASTER_PLAN_DRAWING_POLYGON_LINKED");
  }
  const added = input.polygons.filter(polygon => polygon.id === undefined).length;
  const updated = input.polygons.length - added;
  try {
    await db.transaction(async tx => {
      // A DXF clears the raster background (null); leaving it out keeps what is stored.
      if (input.background !== undefined) await tx.update(masterPlanDrawings).set({ background: input.background ? JSON.stringify(input.background) : null, updatedAt: new Date() }).where(and(eq(masterPlanDrawings.id, drawingId), eq(masterPlanDrawings.tenantId, input.tenantId), eq(masterPlanDrawings.projectId, input.projectId)));
      if (removedIds.length > 0) await tx.delete(masterPlanDrawingPolygons).where(and(inArray(masterPlanDrawingPolygons.id, removedIds), eq(masterPlanDrawingPolygons.drawingId, drawingId), eq(masterPlanDrawingPolygons.tenantId, input.tenantId), eq(masterPlanDrawingPolygons.projectId, input.projectId)));
      for (const polygon of input.polygons) {
        if (polygon.id === undefined) continue;
        await tx.update(masterPlanDrawingPolygons).set({ ref: polygon.ref, label: polygon.label, points: JSON.stringify(polygon.points), updatedAt: new Date() }).where(and(eq(masterPlanDrawingPolygons.id, polygon.id), eq(masterPlanDrawingPolygons.drawingId, drawingId), eq(masterPlanDrawingPolygons.tenantId, input.tenantId), eq(masterPlanDrawingPolygons.projectId, input.projectId)));
      }
      for (const polygon of input.polygons) {
        if (polygon.id !== undefined) continue;
        await tx.insert(masterPlanDrawingPolygons).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, drawingId, ref: polygon.ref, label: polygon.label, points: JSON.stringify(polygon.points) });
      }
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.drawing_layout_saved", entityType: "master_plan_drawing", entityId: drawingId, metadata: JSON.stringify({ projectId: input.projectId, masterPlanVersionId: input.masterPlanVersionId, polygonCount: input.polygons.length, added, updated, removed: removedIds.length }) });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_DRAWING_LAYOUT_INVALID");
    throw error;
  }
  const saved = await db.select({ id: masterPlanDrawingPolygons.id, ref: masterPlanDrawingPolygons.ref, label: masterPlanDrawingPolygons.label, points: masterPlanDrawingPolygons.points }).from(masterPlanDrawingPolygons).where(and(eq(masterPlanDrawingPolygons.drawingId, drawingId), eq(masterPlanDrawingPolygons.tenantId, input.tenantId), eq(masterPlanDrawingPolygons.projectId, input.projectId))).orderBy(asc(masterPlanDrawingPolygons.ref));
  return { drawingId, polygons: saved.map(polygonView) };
}

/** Confirm that a polygon of the drawing is this unit. One polygon holds one unit and one unit sits on one polygon. */
export async function linkMasterPlanDrawingUnit(input: Scope & { masterPlanVersionId: string; polygonId: string; entityId: string }) {
  const db = await open(input, "project.write");
  await requireVersion(db, input, input.masterPlanVersionId);
  const drawingId = await requireDrawing(db, input, input.masterPlanVersionId);
  const polygon = await requirePolygon(db, input, drawingId, input.polygonId);
  const [unit] = await db.select({ id: masterPlanSpatialEntities.id, code: masterPlanSpatialEntities.code }).from(masterPlanSpatialEntities).where(and(eq(masterPlanSpatialEntities.id, input.entityId), eq(masterPlanSpatialEntities.masterPlanVersionId, input.masterPlanVersionId), eq(masterPlanSpatialEntities.entityType, "unit"), eq(masterPlanSpatialEntities.tenantId, input.tenantId), eq(masterPlanSpatialEntities.projectId, input.projectId))).limit(1);
  if (!unit) throw refuse("NOT_FOUND", "PROJECT_OS_MASTER_PLAN_UNIT_NOT_FOUND");
  const [onShape] = await db.select({ id: masterPlanDrawingLinks.id }).from(masterPlanDrawingLinks).where(and(eq(masterPlanDrawingLinks.polygonId, polygon.id), eq(masterPlanDrawingLinks.tenantId, input.tenantId), eq(masterPlanDrawingLinks.projectId, input.projectId))).limit(1);
  if (onShape) throw refuse("CONFLICT", "PROJECT_OS_MASTER_PLAN_LINK_EXISTS");
  const [onUnit] = await db.select({ id: masterPlanDrawingLinks.id }).from(masterPlanDrawingLinks).where(and(eq(masterPlanDrawingLinks.drawingId, drawingId), eq(masterPlanDrawingLinks.entityId, unit.id), eq(masterPlanDrawingLinks.tenantId, input.tenantId), eq(masterPlanDrawingLinks.projectId, input.projectId))).limit(1);
  if (onUnit) throw refuse("CONFLICT", "PROJECT_OS_MASTER_PLAN_UNIT_ALREADY_LINKED");
  const id = randomUUID();
  try {
    await db.transaction(async tx => {
      await tx.insert(masterPlanDrawingLinks).values({ id, tenantId: input.tenantId, projectId: input.projectId, drawingId, polygonId: polygon.id, entityId: unit.id, confirmedByUserId: input.userId });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.drawing_unit_linked", entityType: "master_plan_drawing_link", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, masterPlanVersionId: input.masterPlanVersionId, drawingId, polygonId: polygon.id, polygonRef: polygon.ref, entityId: unit.id, unitCode: unit.code }) });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw refuse("CONFLICT", "PROJECT_OS_MASTER_PLAN_LINK_EXISTS");
    throw error;
  }
  return { id, polygonId: polygon.id, entityId: unit.id };
}

/** Take a confirmed link away. The link row is deleted; its audit row says which polygon and which unit it had. */
export async function unlinkMasterPlanDrawingUnit(input: Scope & { masterPlanVersionId: string; polygonId: string }) {
  const db = await open(input, "project.write");
  await requireVersion(db, input, input.masterPlanVersionId);
  const drawingId = await requireDrawing(db, input, input.masterPlanVersionId);
  const polygon = await requirePolygon(db, input, drawingId, input.polygonId);
  const link = await requireLink(db, input, drawingId, polygon.id);
  await db.transaction(async tx => {
    await tx.delete(masterPlanDrawingLinks).where(and(eq(masterPlanDrawingLinks.id, link.id), eq(masterPlanDrawingLinks.tenantId, input.tenantId), eq(masterPlanDrawingLinks.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.drawing_unit_unlinked", entityType: "master_plan_drawing_link", entityId: link.id, metadata: JSON.stringify({ projectId: input.projectId, masterPlanVersionId: input.masterPlanVersionId, drawingId, polygonId: polygon.id, polygonRef: polygon.ref, entityId: link.entityId }) });
  });
  return { polygonId: polygon.id, entityId: link.entityId };
}

/**
 * Store a drawing file as the next version of this version's drawing. The browser has already put the bytes in Storage (direct upload, purpose
 * `masterPlanDrawing`); this reads them back, checks what they are, hashes them, counts the pages and keeps them under a tenant- and project-scoped key.
 * The earlier versions are never touched.
 */
export async function uploadMasterPlanDrawingVersion(input: Scope & { masterPlanVersionId: string; uploadKey: string; fileName: string }) {
  const db = await open(input, "project.write");
  await requireVersion(db, input, input.masterPlanVersionId);
  const upload = await takeDirectUpload({ tenantId: input.tenantId, projectId: input.projectId, purpose: "masterPlanDrawing", uploadKey: input.uploadKey });
  try {
    const bytes = upload.bytes;
    const kind = detectDrawingKind(bytes);
    if (!kind) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_DRAWING_FILE_INVALID");
    const pageCount = kind.kind === "pdf" ? await countPdfPages(bytes) : 1;
    if (pageCount < 1) throw refuse("BAD_REQUEST", "PROJECT_OS_MASTER_PLAN_DRAWING_FILE_INVALID");
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const drawingId = await ensureDrawing(db, input, input.masterPlanVersionId);
    const [latest] = await db.select({ versionNumber: masterPlanDrawingVersions.versionNumber }).from(masterPlanDrawingVersions).where(and(eq(masterPlanDrawingVersions.drawingId, drawingId), eq(masterPlanDrawingVersions.tenantId, input.tenantId), eq(masterPlanDrawingVersions.projectId, input.projectId))).orderBy(desc(masterPlanDrawingVersions.versionNumber)).limit(1);
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const id = randomUUID();
    const stored = await storagePut(`tenants/${input.tenantId}/projects/${input.projectId}/master-plan-drawings/${drawingId}/v${versionNumber}/${safeUploadFileName(input.fileName)}`, bytes, kind.mimeType);
    await db.transaction(async tx => {
      await tx.insert(masterPlanDrawingVersions).values({ id, tenantId: input.tenantId, projectId: input.projectId, drawingId, versionNumber, fileName: input.fileName, mimeType: kind.mimeType, sizeBytes: bytes.length, pageCount, checksumSha256, storageKey: stored.key, uploadedByUserId: input.userId });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "master_plans.drawing_version_uploaded", entityType: "master_plan_drawing_version", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, masterPlanVersionId: input.masterPlanVersionId, drawingId, versionNumber, pageCount, sizeBytes: bytes.length, checksumSha256 }) });
    });
    return { drawingId, id, versionNumber, mimeType: kind.mimeType, pageCount, checksumSha256 };
  } finally {
    await upload.discard();
  }
}

/** The drawing of a version, created by its first upload. A second upload at the same time finds the row the first one made. */
async function ensureDrawing(db: Db, scope: Scope, masterPlanVersionId: string): Promise<string> {
  await db.insert(masterPlanDrawings).values({ id: randomUUID(), tenantId: scope.tenantId, projectId: scope.projectId, masterPlanVersionId, createdByUserId: scope.userId }).onConflictDoNothing({ target: masterPlanDrawings.masterPlanVersionId });
  return requireDrawing(db, scope, masterPlanVersionId);
}
