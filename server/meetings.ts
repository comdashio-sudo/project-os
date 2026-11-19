// Q-25 (P-113): project meetings and their minutes. A meeting has a type, a time and place, the people who attended (members of the company, or named guests
// such as the consultant), the minutes item by item (topic, discussion, decision), and the actions it raised — ordinary `actions` rows with meeting_id, so
// each one appears in its owner's «مهامي» (Q-45 c). The minutes are recorded by whoever records the project's decisions (the project manager, the PMO on
// this project, the company manager: assertDecisionRecorder) and read by whoever reads the project. «Issued» minutes are final: nothing is added after.
// Carry-over: a meeting shows the actions of the project's EARLIER meetings that are still open — the closed ones stay where they were («ترحيل المفتوح فقط»).
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { actions, auditLogs, memberships, projectMeetingAttendees, projectMeetingItems, projectMeetings, users } from "../drizzle/schema";
import { assertActiveMember, assertDecisionRecorder, assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";

type Scope = { userId: number; tenantId: string; projectId: string };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const MEETING_TYPES = ["progress", "coordination", "safety", "client", "design", "other"] as const;
const fail = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });

async function access(input: Scope, write: boolean): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  if (write) assertDecisionRecorder(snapshot, input.tenantId, input.projectId);
  else assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: ["project.read", "project.manage"], scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
const mine = (input: Scope) => and(eq(projectMeetings.tenantId, input.tenantId), eq(projectMeetings.projectId, input.projectId));
const audit = (tx: Parameters<Parameters<Db["transaction"]>[0]>[0], input: Scope, action: string, entityId: string, metadata: Record<string, unknown>) =>
  tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType: "project_meeting", entityId, metadata: JSON.stringify({ projectId: input.projectId, ...metadata }) });

async function meetingOf(db: Db | Parameters<Parameters<Db["transaction"]>[0]>[0], input: Scope & { meetingId: string }, lock = false) {
  const query = db.select().from(projectMeetings).where(and(mine(input), eq(projectMeetings.id, input.meetingId))).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_MEETING_NOT_FOUND");
  return row;
}

export async function listProjectMeetings(input: Scope) {
  const db = await access(input, false);
  const rows = await db.select({ id: projectMeetings.id, meetingType: projectMeetings.meetingType, title: projectMeetings.title, heldAt: projectMeetings.heldAt, location: projectMeetings.location, status: projectMeetings.status, previousMeetingId: projectMeetings.previousMeetingId })
    .from(projectMeetings).where(mine(input)).orderBy(desc(projectMeetings.heldAt));
  const ids = rows.map(row => row.id);
  const open = ids.length ? await db.select({ meetingId: actions.meetingId, n: sql<number>`count(*)::int` }).from(actions)
    .where(and(eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId), inArray(actions.meetingId, ids), inArray(actions.status, ["open", "in_progress"]))).groupBy(actions.meetingId) : [];
  const openBy = new Map(open.map(row => [row.meetingId, Number(row.n)]));
  return rows.map(row => ({ ...row, openActions: openBy.get(row.id) ?? 0 }));
}

export async function getProjectMeeting(input: Scope & { meetingId: string }) {
  const db = await access(input, false);
  const meeting = await meetingOf(db, input);
  const attendees = await db.select({ id: projectMeetingAttendees.id, name: projectMeetingAttendees.name, organisation: projectMeetingAttendees.organisation, present: projectMeetingAttendees.present, membershipId: projectMeetingAttendees.membershipId })
    .from(projectMeetingAttendees).where(and(eq(projectMeetingAttendees.tenantId, input.tenantId), eq(projectMeetingAttendees.meetingId, meeting.id))).orderBy(asc(projectMeetingAttendees.name));
  const items = await db.select({ id: projectMeetingItems.id, itemNumber: projectMeetingItems.itemNumber, topic: projectMeetingItems.topic, discussion: projectMeetingItems.discussion, decision: projectMeetingItems.decision })
    .from(projectMeetingItems).where(and(eq(projectMeetingItems.tenantId, input.tenantId), eq(projectMeetingItems.meetingId, meeting.id))).orderBy(asc(projectMeetingItems.itemNumber));
  const actionFields = { id: actions.id, title: actions.title, priority: actions.priority, dueAt: actions.dueAt, status: actions.status, meetingId: actions.meetingId, ownerName: users.name };
  const raised = await db.select(actionFields).from(actions).leftJoin(memberships, eq(memberships.id, actions.ownerMembershipId)).leftJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId), eq(actions.meetingId, meeting.id))).orderBy(asc(actions.createdAt));
  // carried over: the still-open actions of this project's EARLIER meetings (by when they were held) — the closed ones are not brought forward
  const earlier = (await db.select({ id: projectMeetings.id }).from(projectMeetings).where(and(mine(input), lt(projectMeetings.heldAt, meeting.heldAt)))).map(row => row.id);
  const broughtForward = earlier.length ? await db.select(actionFields).from(actions).leftJoin(memberships, eq(memberships.id, actions.ownerMembershipId)).leftJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId), inArray(actions.meetingId, earlier), inArray(actions.status, ["open", "in_progress"]))).orderBy(asc(actions.dueAt)) : [];
  return { meeting, attendees, items, actions: raised, broughtForward };
}

export async function createProjectMeeting(input: Scope & { meetingType: (typeof MEETING_TYPES)[number]; title: string; heldAt: Date; location?: string; previousMeetingId?: string; attendees: Array<{ membershipId?: string; name: string; organisation?: string; present?: boolean }> }) {
  const db = await access(input, true);
  if (input.previousMeetingId) await meetingOf(db, { ...input, meetingId: input.previousMeetingId }); // of this project, or not found
  for (const attendee of input.attendees) if (attendee.membershipId) await assertActiveMember(db, input.tenantId, attendee.membershipId, "PROJECT_OS_MEETING_ATTENDEE_INVALID");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(projectMeetings).values({ id, tenantId: input.tenantId, projectId: input.projectId, meetingType: input.meetingType, title: input.title, heldAt: input.heldAt, location: input.location?.trim() || null, previousMeetingId: input.previousMeetingId ?? null, createdByUserId: input.userId });
    if (input.attendees.length) await tx.insert(projectMeetingAttendees).values(input.attendees.map(attendee => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, meetingId: id, membershipId: attendee.membershipId ?? null, name: attendee.name, organisation: attendee.organisation?.trim() || null, present: attendee.present ?? true })));
    await audit(tx, input, "project.meeting_created", id, { meetingType: input.meetingType, attendees: input.attendees.length });
  });
  return { id, status: "draft" as const };
}

/** A minutes item, numbered after the last one; refused once the minutes are issued. */
export async function addProjectMeetingItem(input: Scope & { meetingId: string; topic: string; discussion?: string; decision?: string }) {
  const db = await access(input, true);
  return db.transaction(async tx => {
    const meeting = await meetingOf(tx, input, true);
    if (meeting.status === "issued") throw fail("CONFLICT", "PROJECT_OS_MEETING_ISSUED");
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${projectMeetingItems.itemNumber}), 0)::int + 1` }).from(projectMeetingItems).where(and(eq(projectMeetingItems.tenantId, input.tenantId), eq(projectMeetingItems.meetingId, meeting.id)));
    const id = crypto.randomUUID();
    await tx.insert(projectMeetingItems).values({ id, tenantId: input.tenantId, projectId: input.projectId, meetingId: meeting.id, itemNumber: Number(next), topic: input.topic, discussion: input.discussion?.trim() || null, decision: input.decision?.trim() || null });
    await audit(tx, input, "project.meeting_item_added", meeting.id, { itemNumber: Number(next) });
    return { id, itemNumber: Number(next) };
  });
}

/** An action the meeting raised: an ordinary action of the project (its owner sees it in «مهامي»), tied to the meeting; refused once the minutes are issued. */
export async function addProjectMeetingAction(input: Scope & { meetingId: string; title: string; ownerMembershipId: string; dueAt?: Date; priority: "low" | "medium" | "high" | "critical" }) {
  const db = await access(input, true);
  await assertActiveMember(db, input.tenantId, input.ownerMembershipId, "PROJECT_OS_ACTION_OWNER_INVALID");
  return db.transaction(async tx => {
    const meeting = await meetingOf(tx, input, true);
    if (meeting.status === "issued") throw fail("CONFLICT", "PROJECT_OS_MEETING_ISSUED");
    const id = crypto.randomUUID();
    await tx.insert(actions).values({ id, tenantId: input.tenantId, projectId: input.projectId, meetingId: meeting.id, title: input.title, priority: input.priority, dueAt: input.dueAt, ownerMembershipId: input.ownerMembershipId });
    await audit(tx, input, "project.meeting_action_added", meeting.id, { actionId: id, ownerMembershipId: input.ownerMembershipId });
    return { id };
  });
}

/** Issue the minutes: final from now on. Issuing twice is refused (rows = 0 is never taken for success). */
export async function issueProjectMeeting(input: Scope & { meetingId: string }) {
  const db = await access(input, true);
  return db.transaction(async tx => {
    const meeting = await meetingOf(tx, input, true);
    if (meeting.status === "issued") throw fail("CONFLICT", "PROJECT_OS_MEETING_ISSUED");
    const done = await tx.update(projectMeetings).set({ status: "issued", issuedAt: new Date() }).where(and(mine(input), eq(projectMeetings.id, meeting.id), eq(projectMeetings.status, "draft"))).returning({ id: projectMeetings.id });
    if (done.length !== 1) throw fail("CONFLICT", "PROJECT_OS_MEETING_ISSUED");
    await audit(tx, input, "project.meeting_issued", meeting.id, {});
    return { id: meeting.id, status: "issued" as const };
  });
}
