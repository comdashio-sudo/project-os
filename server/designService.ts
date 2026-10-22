// Technical and architectural coordination (work order 5, item 7): the drawing register with revisions, transmittals, design review comments and
// the consultant submittals with replies A/B/C/D. Every function checks the tenant, the project, the named permission (and, where it matters, the
// discipline authority) BEFORE it reads or writes, every query filters on tenant AND project, and every write leaves an audit row in the same
// transaction. The rules that need no database are domain/designCoordination.ts.
//
// Separation of duties here is a rule about PEOPLE, not only about powers: whoever issued a revision cannot approve it, whoever answered a
// review comment cannot close it, whoever sent a submittal cannot record the consultant's reply. It holds for the company owner too.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, designComments, designDrawingRevisions, designDrawings, designSubmittals, designTransmittalItems, designTransmittals } from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { isUniqueViolation } from "./_core/database";
import { commentTransitions, disciplineAuthority, replyRequiresResubmission, summariseDrawings, transmittalTransitions, type CommentStatus, type DesignDiscipline, type SubmittalReplyCode, type TransmittalStatus } from "./domain/designCoordination";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });
const isDuplicate = isUniqueViolation;
const duplicateAs = async <T>(work: () => Promise<T>): Promise<T> => { try { return await work(); } catch (error) { if (isDuplicate(error)) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DUPLICATE"); throw error; } };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: { tenantId: string; projectId: string }) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

/**
 * The one gate of this module: active membership, licensed PROJECT product, the permission, the project scope (assertTenantAccess), then the project
 * must belong to the tenant. `discipline` adds the authority over that discipline on top of the permission itself.
 */
export async function assertDesignAccess(input: { userId: number; tenantId: string; projectId: string }, permission: string | readonly string[], discipline?: DesignDiscipline) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  const scope = { type: "project" as const, id: input.projectId };
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope });
  if (discipline) assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: disciplineAuthority(discipline), scope });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

const audit = (tx: { insert: (table: typeof auditLogs) => { values: (row: typeof auditLogs.$inferInsert) => Promise<unknown> } }, input: { userId: number; tenantId: string; projectId: string }, action: string, entityType: string, entityId: string, extra: Record<string, unknown> = {}) =>
  tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType, entityId, metadata: JSON.stringify({ projectId: input.projectId, ...extra }) });

// ------------------------------------------------------------------ reads (project.read)

export async function listDesignDrawings(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await assertDesignAccess(input, "project.read");
  const rows = await db.select({ id: designDrawings.id, drawingNumber: designDrawings.drawingNumber, title: designDrawings.title, discipline: designDrawings.discipline, status: designDrawings.status, currentRevision: designDrawings.currentRevision, updatedAt: designDrawings.updatedAt }).from(designDrawings).where(mine(designDrawings, input)).orderBy(asc(designDrawings.discipline), asc(designDrawings.drawingNumber));
  const current = await db.select({ drawingId: designDrawingRevisions.drawingId, id: designDrawingRevisions.id }).from(designDrawingRevisions).where(and(mine(designDrawingRevisions, input), eq(designDrawingRevisions.isCurrent, true)));
  const currentRevisionId = new Map(current.map(row => [row.drawingId, row.id]));
  const counts = await db.select({ drawingId: designComments.drawingId, status: designComments.status, total: sql<number>`count(*)` }).from(designComments).where(mine(designComments, input)).groupBy(designComments.drawingId, designComments.status);
  const open = new Map<string, number>();
  for (const row of counts) if (row.status !== "closed") open.set(row.drawingId, (open.get(row.drawingId) ?? 0) + Number(row.total));
  return rows.map(row => ({ ...row, currentRevisionId: currentRevisionId.get(row.id) ?? null, unresolvedComments: open.get(row.id) ?? 0 }));
}

export async function listDesignRevisions(input: { userId: number; tenantId: string; projectId: string; drawingId: string }) {
  const db = await assertDesignAccess(input, "project.read");
  return db.select({ id: designDrawingRevisions.id, revision: designDrawingRevisions.revision, description: designDrawingRevisions.description, isCurrent: designDrawingRevisions.isCurrent, issuedAt: designDrawingRevisions.issuedAt, approvedAt: designDrawingRevisions.approvedAt }).from(designDrawingRevisions).where(and(mine(designDrawingRevisions, input), eq(designDrawingRevisions.drawingId, input.drawingId))).orderBy(desc(designDrawingRevisions.issuedAt));
}

export async function listDesignTransmittals(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await assertDesignAccess(input, "project.read");
  const rows = await db.select().from(designTransmittals).where(mine(designTransmittals, input)).orderBy(desc(designTransmittals.createdAt));
  const items = rows.length ? await db.select({ transmittalId: designTransmittalItems.transmittalId, drawingNumber: designDrawings.drawingNumber, revision: designDrawingRevisions.revision }).from(designTransmittalItems).innerJoin(designDrawingRevisions, eq(designTransmittalItems.revisionId, designDrawingRevisions.id)).innerJoin(designDrawings, eq(designDrawingRevisions.drawingId, designDrawings.id)).where(and(eq(designTransmittalItems.tenantId, input.tenantId), eq(designTransmittalItems.projectId, input.projectId))) : [];
  return rows.map(row => ({ id: row.id, transmittalNumber: row.transmittalNumber, direction: row.direction, counterparty: row.counterparty, subject: row.subject, status: row.status, sentAt: row.sentAt, acknowledgedAt: row.acknowledgedAt, items: items.filter(item => item.transmittalId === row.id).map(item => `${item.drawingNumber} / ${item.revision}`) }));
}

export async function listDesignComments(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await assertDesignAccess(input, "project.read");
  return db.select({ id: designComments.id, commentNumber: designComments.commentNumber, drawingNumber: designDrawings.drawingNumber, revision: designDrawingRevisions.revision, raisedBy: designComments.raisedBy, severity: designComments.severity, commentText: designComments.commentText, status: designComments.status, responseText: designComments.responseText, dueAt: designComments.dueAt, createdAt: designComments.createdAt })
    .from(designComments).innerJoin(designDrawings, eq(designComments.drawingId, designDrawings.id)).innerJoin(designDrawingRevisions, eq(designComments.revisionId, designDrawingRevisions.id))
    .where(mine(designComments, input)).orderBy(desc(designComments.createdAt));
}

export async function listDesignSubmittals(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await assertDesignAccess(input, "project.read");
  return db.select({ id: designSubmittals.id, submittalNumber: designSubmittals.submittalNumber, title: designSubmittals.title, discipline: designSubmittals.discipline, status: designSubmittals.status, submittedAt: designSubmittals.submittedAt, dueAt: designSubmittals.dueAt, replyCode: designSubmittals.replyCode, replyNote: designSubmittals.replyNote, repliedAt: designSubmittals.repliedAt, resubmissionOfId: designSubmittals.resubmissionOfId })
    .from(designSubmittals).where(mine(designSubmittals, input)).orderBy(desc(designSubmittals.createdAt));
}

/** The design-phase board: counts the database computes (no row is loaded to be counted), reduced by the pure summary. */
export async function getDesignDashboard(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await assertDesignAccess(input, "project.read");
  const now = new Date();
  const [drawingRows, commentRows, overdueComments, submittalRows, replyRows, overdueSubmittals, transmittalRows, replyTime] = await Promise.all([
    db.select({ discipline: designDrawings.discipline, status: designDrawings.status, total: sql<number>`count(*)` }).from(designDrawings).where(mine(designDrawings, input)).groupBy(designDrawings.discipline, designDrawings.status),
    db.select({ status: designComments.status, total: sql<number>`count(*)` }).from(designComments).where(mine(designComments, input)).groupBy(designComments.status),
    db.select({ total: sql<number>`count(*)` }).from(designComments).where(and(mine(designComments, input), inArray(designComments.status, ["open", "responded"]), sql`${designComments.dueAt} < ${now}`)),
    db.select({ status: designSubmittals.status, total: sql<number>`count(*)` }).from(designSubmittals).where(mine(designSubmittals, input)).groupBy(designSubmittals.status),
    db.select({ code: designSubmittals.replyCode, total: sql<number>`count(*)` }).from(designSubmittals).where(and(mine(designSubmittals, input), sql`${designSubmittals.replyCode} is not null`)).groupBy(designSubmittals.replyCode),
    db.select({ total: sql<number>`count(*)` }).from(designSubmittals).where(and(mine(designSubmittals, input), eq(designSubmittals.status, "submitted"), sql`${designSubmittals.dueAt} < ${now}`)),
    db.select({ status: designTransmittals.status, total: sql<number>`count(*)` }).from(designTransmittals).where(mine(designTransmittals, input)).groupBy(designTransmittals.status),
    db.select({ days: sql<string | null>`avg(extract(epoch from (${designSubmittals.repliedAt} - ${designSubmittals.submittedAt}))) / 86400` }).from(designSubmittals).where(and(mine(designSubmittals, input), sql`${designSubmittals.repliedAt} is not null`)),
  ]);
  const count = (rows: ReadonlyArray<{ status: string; total: number }>, status: string) => Number(rows.find(row => row.status === status)?.total ?? 0);
  return {
    drawings: summariseDrawings(drawingRows.map(row => ({ discipline: row.discipline, status: row.status, total: Number(row.total) }))),
    comments: { open: count(commentRows, "open"), responded: count(commentRows, "responded"), closed: count(commentRows, "closed"), overdue: Number(overdueComments[0]?.total ?? 0) },
    submittals: { draft: count(submittalRows, "draft"), awaitingReply: count(submittalRows, "submitted"), replied: count(submittalRows, "replied"), closed: count(submittalRows, "closed"), overdue: Number(overdueSubmittals[0]?.total ?? 0), averageReplyDays: replyTime[0]?.days == null ? null : Math.round(Number(replyTime[0].days) * 10) / 10, replies: { A: Number(replyRows.find(row => row.code === "A")?.total ?? 0), B: Number(replyRows.find(row => row.code === "B")?.total ?? 0), C: Number(replyRows.find(row => row.code === "C")?.total ?? 0), D: Number(replyRows.find(row => row.code === "D")?.total ?? 0) } },
    transmittals: { draft: count(transmittalRows, "draft"), sent: count(transmittalRows, "sent"), acknowledged: count(transmittalRows, "acknowledged") },
  };
}

// ------------------------------------------------------------------ drawings and revisions

async function loadDrawing(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: { tenantId: string; projectId: string }, drawingId: string) {
  const [drawing] = await db.select().from(designDrawings).where(and(mine(designDrawings, input), eq(designDrawings.id, drawingId))).limit(1);
  if (!drawing) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_DRAWING_NOT_FOUND");
  return drawing;
}

export async function registerDesignDrawing(input: { userId: number; tenantId: string; projectId: string; drawingNumber: string; title: string; discipline: DesignDiscipline; revision: string; description?: string }) {
  const db = await assertDesignAccess(input, "project.design.manage", input.discipline);
  const drawingId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(designDrawings).values({ id: drawingId, tenantId: input.tenantId, projectId: input.projectId, drawingNumber: input.drawingNumber, title: input.title, discipline: input.discipline, currentRevision: input.revision, createdByUserId: input.userId });
    await tx.insert(designDrawingRevisions).values({ id: revisionId, tenantId: input.tenantId, projectId: input.projectId, drawingId, revision: input.revision, description: input.description, issuedByUserId: input.userId });
    await audit(tx, input, "design.drawing_registered", "design_drawing", drawingId, { drawingNumber: input.drawingNumber, discipline: input.discipline, revision: input.revision });
  }));
  return { id: drawingId, revisionId, status: "registered" as const };
}

export async function addDesignRevision(input: { userId: number; tenantId: string; projectId: string; drawingId: string; revision: string; description?: string }) {
  const db = await assertDesignAccess(input, "project.design.manage");
  const drawing = await loadDrawing(db, input, input.drawingId);
  assertTenantAccess((await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId }))!, { tenantId: input.tenantId, product: "PROJECT", permission: disciplineAuthority(drawing.discipline), scope: { type: "project", id: input.projectId } });
  if (drawing.status === "cancelled") throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DRAWING_CANCELLED");
  const revisionId = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    // the previous revision stops being current, and a new revision voids any approval: what was approved is not what is on the table now
    await tx.update(designDrawingRevisions).set({ isCurrent: false }).where(and(mine(designDrawingRevisions, input), eq(designDrawingRevisions.drawingId, input.drawingId)));
    await tx.insert(designDrawingRevisions).values({ id: revisionId, tenantId: input.tenantId, projectId: input.projectId, drawingId: input.drawingId, revision: input.revision, description: input.description, issuedByUserId: input.userId });
    await tx.update(designDrawings).set({ currentRevision: input.revision, status: "registered" }).where(and(mine(designDrawings, input), eq(designDrawings.id, input.drawingId)));
    await audit(tx, input, "design.revision_added", "design_drawing", input.drawingId, { drawingNumber: drawing.drawingNumber, previousRevision: drawing.currentRevision, revision: input.revision, previousStatus: drawing.status });
  }));
  return { id: input.drawingId, revisionId, revision: input.revision, status: "registered" as const };
}

export async function cancelDesignDrawing(input: { userId: number; tenantId: string; projectId: string; drawingId: string }) {
  const db = await assertDesignAccess(input, "project.design.manage");
  const drawing = await loadDrawing(db, input, input.drawingId);
  assertTenantAccess((await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId }))!, { tenantId: input.tenantId, product: "PROJECT", permission: disciplineAuthority(drawing.discipline), scope: { type: "project", id: input.projectId } });
  if (drawing.status === "cancelled") throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DRAWING_CANCELLED");
  await db.transaction(async tx => {
    await tx.update(designDrawings).set({ status: "cancelled" }).where(and(mine(designDrawings, input), eq(designDrawings.id, input.drawingId)));
    await audit(tx, input, "design.drawing_cancelled", "design_drawing", input.drawingId, { drawingNumber: drawing.drawingNumber, previousStatus: drawing.status });
  });
  return { id: input.drawingId, status: "cancelled" as const };
}

/** Approval for construction. Needs project.design.approve (never held with design.manage), a drawing under review, no unresolved comment, and an approver who did not issue the revision. */
export async function approveDesignDrawing(input: { userId: number; tenantId: string; projectId: string; drawingId: string }) {
  const db = await assertDesignAccess(input, "project.design.approve");
  const drawing = await loadDrawing(db, input, input.drawingId);
  if (drawing.status !== "under_review") throw refuse("CONFLICT", "PROJECT_OS_DESIGN_APPROVAL_STATE_INVALID");
  const [revision] = await db.select().from(designDrawingRevisions).where(and(mine(designDrawingRevisions, input), eq(designDrawingRevisions.drawingId, input.drawingId), eq(designDrawingRevisions.isCurrent, true))).limit(1);
  if (!revision) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_REVISION_NOT_FOUND");
  if (revision.issuedByUserId === input.userId) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_SELF_APPROVAL");
  const [unresolved] = await db.select({ total: sql<number>`count(*)` }).from(designComments).where(and(mine(designComments, input), eq(designComments.drawingId, input.drawingId), eq(designComments.revisionId, revision.id), inArray(designComments.status, ["open", "responded"])));
  if (Number(unresolved?.total ?? 0) > 0) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_OPEN_COMMENTS");
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(designDrawingRevisions).set({ approvedAt: now, approvedByUserId: input.userId }).where(eq(designDrawingRevisions.id, revision.id));
    await tx.update(designDrawings).set({ status: "approved" }).where(and(mine(designDrawings, input), eq(designDrawings.id, input.drawingId)));
    await audit(tx, input, "design.drawing_approved", "design_drawing", input.drawingId, { drawingNumber: drawing.drawingNumber, revision: revision.revision, issuedByUserId: revision.issuedByUserId });
  });
  return { id: input.drawingId, revision: revision.revision, status: "approved" as const };
}

// ------------------------------------------------------------------ transmittals

export async function createDesignTransmittal(input: { userId: number; tenantId: string; projectId: string; transmittalNumber: string; direction: "outgoing" | "incoming"; counterparty: string; subject: string; revisionIds: string[] }) {
  const db = await assertDesignAccess(input, "project.design.manage");
  if (!input.revisionIds.length) throw refuse("BAD_REQUEST", "PROJECT_OS_DESIGN_TRANSMITTAL_EMPTY");
  const revisionIds = Array.from(new Set(input.revisionIds));
  const found = await db.select({ id: designDrawingRevisions.id, discipline: designDrawings.discipline, status: designDrawings.status }).from(designDrawingRevisions).innerJoin(designDrawings, eq(designDrawingRevisions.drawingId, designDrawings.id)).where(and(mine(designDrawingRevisions, input), inArray(designDrawingRevisions.id, revisionIds)));
  if (found.length !== revisionIds.length) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_REVISION_NOT_FOUND");
  if (found.some(item => item.status === "cancelled")) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DRAWING_CANCELLED");
  const snapshot = (await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId }))!;
  for (const discipline of Array.from(new Set(found.map(item => item.discipline)))) assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: disciplineAuthority(discipline), scope: { type: "project", id: input.projectId } });
  const id = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(designTransmittals).values({ id, tenantId: input.tenantId, projectId: input.projectId, transmittalNumber: input.transmittalNumber, direction: input.direction, counterparty: input.counterparty, subject: input.subject, createdByUserId: input.userId });
    await tx.insert(designTransmittalItems).values(revisionIds.map(revisionId => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, transmittalId: id, revisionId })));
    await audit(tx, input, "design.transmittal_created", "design_transmittal", id, { transmittalNumber: input.transmittalNumber, direction: input.direction, items: revisionIds.length });
  }));
  return { id, status: "draft" as const };
}

export async function transitionDesignTransmittal(input: { userId: number; tenantId: string; projectId: string; transmittalId: string; nextStatus: TransmittalStatus }) {
  const db = await assertDesignAccess(input, "project.design.manage");
  const [transmittal] = await db.select().from(designTransmittals).where(and(mine(designTransmittals, input), eq(designTransmittals.id, input.transmittalId))).limit(1);
  if (!transmittal) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_TRANSMITTAL_NOT_FOUND");
  if (!transmittalTransitions[transmittal.status].includes(input.nextStatus)) throw refuse("BAD_REQUEST", "PROJECT_OS_DESIGN_TRANSMITTAL_TRANSITION_INVALID");
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(designTransmittals).set(input.nextStatus === "sent" ? { status: "sent", sentAt: now } : { status: "acknowledged", acknowledgedAt: now }).where(and(mine(designTransmittals, input), eq(designTransmittals.id, input.transmittalId)));
    if (input.nextStatus === "sent") {
      // sending the current revision of a drawing puts it under review (a revision that is no longer current, or an approved drawing, is left alone)
      const items = await tx.select({ revisionId: designTransmittalItems.revisionId }).from(designTransmittalItems).where(eq(designTransmittalItems.transmittalId, input.transmittalId));
      const revisions = items.length ? await tx.select({ drawingId: designDrawingRevisions.drawingId }).from(designDrawingRevisions).where(and(inArray(designDrawingRevisions.id, items.map(item => item.revisionId)), eq(designDrawingRevisions.isCurrent, true))) : [];
      if (transmittal.direction === "outgoing" && revisions.length) await tx.update(designDrawings).set({ status: "under_review" }).where(and(mine(designDrawings, input), inArray(designDrawings.id, revisions.map(item => item.drawingId)), eq(designDrawings.status, "registered")));
    }
    await audit(tx, input, "design.transmittal_status_transitioned", "design_transmittal", input.transmittalId, { transmittalNumber: transmittal.transmittalNumber, previousStatus: transmittal.status, nextStatus: input.nextStatus });
  });
  return { id: input.transmittalId, previousStatus: transmittal.status, status: input.nextStatus };
}

// ------------------------------------------------------------------ review comments

export async function raiseDesignComment(input: { userId: number; tenantId: string; projectId: string; drawingId: string; commentNumber: string; raisedBy: string; severity: "minor" | "major" | "critical"; commentText: string; dueAt?: Date }) {
  const db = await assertDesignAccess(input, "project.design.manage");
  const drawing = await loadDrawing(db, input, input.drawingId);
  assertTenantAccess((await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId }))!, { tenantId: input.tenantId, product: "PROJECT", permission: disciplineAuthority(drawing.discipline), scope: { type: "project", id: input.projectId } });
  if (drawing.status === "cancelled") throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DRAWING_CANCELLED");
  if (drawing.status === "approved") throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DRAWING_APPROVED");
  const [revision] = await db.select({ id: designDrawingRevisions.id }).from(designDrawingRevisions).where(and(mine(designDrawingRevisions, input), eq(designDrawingRevisions.drawingId, input.drawingId), eq(designDrawingRevisions.isCurrent, true))).limit(1);
  if (!revision) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_REVISION_NOT_FOUND");
  const id = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(designComments).values({ id, tenantId: input.tenantId, projectId: input.projectId, drawingId: input.drawingId, revisionId: revision.id, commentNumber: input.commentNumber, raisedBy: input.raisedBy, severity: input.severity, commentText: input.commentText, dueAt: input.dueAt, createdByUserId: input.userId });
    await audit(tx, input, "design.comment_raised", "design_comment", id, { commentNumber: input.commentNumber, drawingNumber: drawing.drawingNumber, severity: input.severity });
  }));
  return { id, status: "open" as const };
}

/** open → responded (the coordinator answers) · responded → closed (the approver accepts the answer; never the one who gave it) · responded → open (answer refused). */
export async function transitionDesignComment(input: { userId: number; tenantId: string; projectId: string; commentId: string; nextStatus: CommentStatus; responseText?: string }) {
  const responding = input.nextStatus === "responded";
  const db = await assertDesignAccess(input, responding ? "project.design.manage" : "project.design.approve");
  const [comment] = await db.select().from(designComments).where(and(mine(designComments, input), eq(designComments.id, input.commentId))).limit(1);
  if (!comment) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_COMMENT_NOT_FOUND");
  if (!commentTransitions[comment.status].includes(input.nextStatus)) throw refuse("BAD_REQUEST", "PROJECT_OS_DESIGN_COMMENT_TRANSITION_INVALID");
  if (responding && !input.responseText?.trim()) throw refuse("BAD_REQUEST", "PROJECT_OS_DESIGN_COMMENT_RESPONSE_REQUIRED");
  if (input.nextStatus === "closed" && comment.respondedByUserId === input.userId) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_SELF_CLOSE");
  const now = new Date();
  const change = responding ? { status: "responded" as const, responseText: input.responseText!.trim(), respondedAt: now, respondedByUserId: input.userId }
    : input.nextStatus === "closed" ? { status: "closed" as const, closedAt: now, closedByUserId: input.userId }
    : { status: "open" as const, responseText: null, respondedAt: null, respondedByUserId: null };
  await db.transaction(async tx => {
    await tx.update(designComments).set(change).where(and(mine(designComments, input), eq(designComments.id, input.commentId)));
    await audit(tx, input, "design.comment_status_transitioned", "design_comment", input.commentId, { commentNumber: comment.commentNumber, previousStatus: comment.status, nextStatus: input.nextStatus });
  });
  return { id: input.commentId, previousStatus: comment.status, status: input.nextStatus };
}

// ------------------------------------------------------------------ submittals to the consultant

export async function createDesignSubmittal(input: { userId: number; tenantId: string; projectId: string; submittalNumber: string; title: string; discipline: DesignDiscipline; drawingId?: string; resubmissionOfId?: string; dueAt?: Date }) {
  const db = await assertDesignAccess(input, "project.design.manage", input.discipline);
  if (input.drawingId) { const drawing = await loadDrawing(db, input, input.drawingId); if (drawing.status === "cancelled") throw refuse("CONFLICT", "PROJECT_OS_DESIGN_DRAWING_CANCELLED"); }
  if (input.resubmissionOfId) {
    const [original] = await db.select({ status: designSubmittals.status, replyCode: designSubmittals.replyCode }).from(designSubmittals).where(and(mine(designSubmittals, input), eq(designSubmittals.id, input.resubmissionOfId))).limit(1);
    if (!original) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_SUBMITTAL_NOT_FOUND");
    // only a submittal the consultant sent back (C or D) is resubmitted; A and B were accepted
    if (original.status === "draft" || original.status === "submitted" || !original.replyCode || !replyRequiresResubmission(original.replyCode as SubmittalReplyCode)) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_RESUBMISSION_INVALID");
  }
  const id = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(designSubmittals).values({ id, tenantId: input.tenantId, projectId: input.projectId, submittalNumber: input.submittalNumber, title: input.title, discipline: input.discipline, drawingId: input.drawingId, resubmissionOfId: input.resubmissionOfId, dueAt: input.dueAt, createdByUserId: input.userId });
    await audit(tx, input, "design.submittal_created", "design_submittal", id, { submittalNumber: input.submittalNumber, discipline: input.discipline, resubmissionOfId: input.resubmissionOfId ?? null });
  }));
  return { id, status: "draft" as const };
}

/** draft → submitted (the coordinator sends it) · submitted → replied with A/B/C/D (the approver records the consultant's answer; never the sender) · replied → closed. */
export async function transitionDesignSubmittal(input: { userId: number; tenantId: string; projectId: string; submittalId: string; nextStatus: "submitted" | "replied" | "closed"; replyCode?: SubmittalReplyCode; replyNote?: string }) {
  const replying = input.nextStatus === "replied";
  const db = await assertDesignAccess(input, replying ? "project.design.approve" : "project.design.manage");
  const [submittal] = await db.select().from(designSubmittals).where(and(mine(designSubmittals, input), eq(designSubmittals.id, input.submittalId))).limit(1);
  if (!submittal) throw refuse("NOT_FOUND", "PROJECT_OS_DESIGN_SUBMITTAL_NOT_FOUND");
  const allowed: Record<string, readonly string[]> = { draft: ["submitted"], submitted: ["replied"], replied: ["closed"], closed: [] };
  if (!allowed[submittal.status].includes(input.nextStatus)) throw refuse("BAD_REQUEST", "PROJECT_OS_DESIGN_SUBMITTAL_TRANSITION_INVALID");
  if (input.nextStatus === "submitted") {
    const snapshot = (await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId }))!;
    assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: disciplineAuthority(submittal.discipline), scope: { type: "project", id: input.projectId } });
  }
  if (replying) {
    if (!input.replyCode) throw refuse("BAD_REQUEST", "PROJECT_OS_DESIGN_REPLY_CODE_REQUIRED");
    if (submittal.submittedByUserId === input.userId) throw refuse("CONFLICT", "PROJECT_OS_DESIGN_SELF_REPLY");
  }
  const now = new Date();
  const change = input.nextStatus === "submitted" ? { status: "submitted" as const, submittedAt: now, submittedByUserId: input.userId }
    : replying ? { status: "replied" as const, replyCode: input.replyCode!, replyNote: input.replyNote?.trim() || null, repliedAt: now, repliedByUserId: input.userId }
    : { status: "closed" as const };
  await db.transaction(async tx => {
    await tx.update(designSubmittals).set(change).where(and(mine(designSubmittals, input), eq(designSubmittals.id, input.submittalId)));
    await audit(tx, input, "design.submittal_status_transitioned", "design_submittal", input.submittalId, { submittalNumber: submittal.submittalNumber, previousStatus: submittal.status, nextStatus: input.nextStatus, replyCode: input.replyCode ?? null });
  });
  return { id: input.submittalId, previousStatus: submittal.status, status: input.nextStatus, replyCode: input.replyCode ?? null };
}
