// Q-26 (P-119): deadline alerts. Once a day (the 7:00 Riyadh window of the daily cron), each person gets ONE in-app notice per company and, when e-mail is
// switched on and they have not switched off the daily summary, ONE mail — listing what is overdue in the projects they answer for:
//   - critical activities past their planned finish (not complete, total float <= 0; a missing float is «not known», never «critical»): for whoever manages
//     the project or its schedule (project.manage, project.schedule.manage, project.pmc.manage) in a scope that reaches the project;
//   - actions past their due date that are still open or in progress (meeting actions included — they are actions): for their owner only;
//   - RFIs awaiting an answer past their due date: for the project's managers and for the person who raised the RFI, while they may still read the project;
//   - consultant submittals sent and unanswered past their due date: for the project's managers, for whoever answers them (project.design.approve,
//     project.consultant.respond), and for the person who sent it, while they may still read the project.
// Nothing overdue for a person: nothing is written for them. Running twice the same day adds nothing (notice by code and day, mail by its dedupe key).
// The same rule answers the live read (deadlines.mine), so the screen and the digest never disagree. Every query is filtered by the company being processed.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { actions, activities, consultantSubmittals, internalNotifications, memberships, projects, rfis } from "../drizzle/schema";
import { activeTenantIds, enqueueEmail, linkTo, mailerFromEnv, permissionHolders, projectsReachedBy, recipientsWhoWant, type ProjectRow } from "./emailNotifications";
import { dailyMailWindow, deadlinesEmail } from "./domain/emailNotifications";
import { getDb, getTenantAccessSnapshot } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const DEADLINES_NOTICE_CODE = "DEADLINES_DAILY";
export const SCHEDULE_RECIPIENTS = ["project.manage", "project.schedule.manage", "project.pmc.manage"] as const;
export const MANAGERS = ["project.manage"] as const;
export const RFI_READERS = ["project.read", "project.manage"] as const;
export const SUBMITTAL_ANSWERERS = ["project.design.approve", "project.consultant.respond"] as const;
export const SUBMITTAL_READERS = ["project.read", "project.field.manage", "project.design.manage", "project.design.approve", "project.manage"] as const;
const DAY = 86_400_000;

export type OverdueActivity = { id: string; code: string; name: string; plannedFinishAt: Date; daysLate: number };
export type OverdueAction = { id: string; title: string; priority: string; dueAt: Date; daysLate: number };
export type OverdueRequest = { id: string; number: string; title: string; dueAt: Date; daysLate: number };
export type ProjectDeadlines = { projectId: string; code: string; name: string; activities: OverdueActivity[]; actions: OverdueAction[]; rfis: OverdueRequest[]; submittals: OverdueRequest[] };
/** Actions with no project (company actions) are listed under projectId "" (code and name empty). */
export type Deadlines = { projects: ProjectDeadlines[]; counts: { activities: number; actions: number; rfis: number; submittals: number; total: number } };

/** Whole calendar days (UTC) between the due moment and now: due yesterday at any hour = 1. */
export const daysLate = (due: Date, now: Date) => Math.max(1, Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())) / DAY));

const empty = (): Deadlines => ({ projects: [], counts: { activities: 0, actions: 0, rfis: 0, submittals: 0, total: 0 } });

/**
 * What is overdue in this company at `now`, and for whom. `onlyUserId` narrows the result to one person (the live read); the rule is the same.
 * Returns one Deadlines per person who has anything overdue.
 */
export async function overdueByUser(db: Db, tenantId: string, now: Date, onlyUserId?: number): Promise<Map<number, Deadlines>> {
  const all: ProjectRow[] = await db.select({ id: projects.id, code: projects.code, name: projects.name, portfolioId: projects.portfolioId, programId: projects.programId })
    .from(projects).where(and(eq(projects.tenantId, tenantId), notInArray(projects.status, ["cancelled", "closed"])));
  const live = all.map(project => project.id);
  const byId = new Map(all.map(project => [project.id, project] as const));
  const [late, overdueActions, overdueRfis, overdueSubmittals] = await Promise.all([
    live.length ? db.select({ id: activities.id, projectId: activities.projectId, code: activities.code, name: activities.name, plannedFinishAt: activities.plannedFinishAt })
      .from(activities).where(and(eq(activities.tenantId, tenantId), inArray(activities.projectId, live), ne(activities.status, "completed"), isNull(activities.actualFinishAt),
        isNotNull(activities.plannedFinishAt), lt(activities.plannedFinishAt, now), isNotNull(activities.totalFloatHours), sql`${activities.totalFloatHours} <= 0`))
      .orderBy(asc(activities.plannedFinishAt)) : [],
    db.select({ id: actions.id, projectId: actions.projectId, title: actions.title, priority: actions.priority, dueAt: actions.dueAt, ownerUserId: memberships.userId })
      .from(actions).innerJoin(memberships, and(eq(memberships.id, actions.ownerMembershipId), eq(memberships.tenantId, actions.tenantId), eq(memberships.status, "active")))
      .where(and(eq(actions.tenantId, tenantId), inArray(actions.status, ["open", "in_progress"]), isNotNull(actions.dueAt), lt(actions.dueAt, now)))
      .orderBy(asc(actions.dueAt)),
    live.length ? db.select({ id: rfis.id, projectId: rfis.projectId, number: rfis.rfiNumber, title: rfis.subject, dueAt: rfis.dueAt, raisedBy: rfis.createdByUserId })
      .from(rfis).where(and(eq(rfis.tenantId, tenantId), inArray(rfis.projectId, live), inArray(rfis.status, ["submitted", "under_review"]), isNotNull(rfis.dueAt), lt(rfis.dueAt, now)))
      .orderBy(asc(rfis.dueAt)) : [],
    live.length ? db.select({ id: consultantSubmittals.id, projectId: consultantSubmittals.projectId, number: consultantSubmittals.submittalNumber, title: consultantSubmittals.title, dueAt: consultantSubmittals.dueAt, sentBy: consultantSubmittals.sentByUserId, createdBy: consultantSubmittals.createdByUserId })
      .from(consultantSubmittals).where(and(eq(consultantSubmittals.tenantId, tenantId), inArray(consultantSubmittals.projectId, live), eq(consultantSubmittals.status, "sent"), isNotNull(consultantSubmittals.dueAt), lt(consultantSubmittals.dueAt, now)))
      .orderBy(asc(consultantSubmittals.dueAt)) : [],
  ]);
  const result = new Map<number, Deadlines>();
  if (!late.length && !overdueActions.length && !overdueRfis.length && !overdueSubmittals.length) return result;

  // who reaches which project, by the permissions each kind asks for
  const reach = async (codes: readonly string[]) => {
    const map = new Map<number, Set<string>>();
    for (const holder of await permissionHolders(db, tenantId, codes)) if (onlyUserId === undefined || holder.userId === onlyUserId) map.set(holder.userId, projectsReachedBy(holder, all));
    return map;
  };
  const [scheduleReach, managerReach, rfiReach, answererReach, submittalReach] = await Promise.all([reach(SCHEDULE_RECIPIENTS), reach(MANAGERS), reach(RFI_READERS), reach(SUBMITTAL_ANSWERERS), reach(SUBMITTAL_READERS)]);
  const reaches = (map: Map<number, Set<string>>, userId: number, projectId: string) => map.get(userId)?.has(projectId) ?? false;
  const holdersOf = (map: Map<number, Set<string>>, projectId: string) => Array.from(map).filter(([, ids]) => ids.has(projectId)).map(([userId]) => userId);

  const slot = (userId: number, projectId: string | null) => {
    const digest = result.get(userId) ?? empty();
    result.set(userId, digest);
    const key = projectId ?? "";
    let entry = digest.projects.find(item => item.projectId === key);
    if (!entry) {
      const project = projectId ? byId.get(projectId) : undefined;
      entry = { projectId: key, code: project?.code ?? "", name: project?.name ?? "", activities: [], actions: [], rfis: [], submittals: [] };
      digest.projects.push(entry);
    }
    return { digest, entry };
  };

  for (const row of late) for (const userId of holdersOf(scheduleReach, row.projectId)) {
    const { digest, entry } = slot(userId, row.projectId);
    entry.activities.push({ id: row.id, code: row.code, name: row.name, plannedFinishAt: row.plannedFinishAt!, daysLate: daysLate(row.plannedFinishAt!, now) });
    digest.counts.activities += 1;
  }
  for (const row of overdueActions) {
    if (onlyUserId !== undefined && row.ownerUserId !== onlyUserId) continue;
    if (row.projectId && !byId.has(row.projectId)) continue; // the project is closed or cancelled
    const { digest, entry } = slot(row.ownerUserId, row.projectId);
    entry.actions.push({ id: row.id, title: row.title, priority: row.priority, dueAt: row.dueAt!, daysLate: daysLate(row.dueAt!, now) });
    digest.counts.actions += 1;
  }
  for (const row of overdueRfis) {
    const people = new Set(holdersOf(managerReach, row.projectId));
    if (reaches(rfiReach, row.raisedBy, row.projectId)) people.add(row.raisedBy);
    for (const userId of Array.from(people)) {
      const { digest, entry } = slot(userId, row.projectId);
      entry.rfis.push({ id: row.id, number: row.number, title: row.title, dueAt: row.dueAt!, daysLate: daysLate(row.dueAt!, now) });
      digest.counts.rfis += 1;
    }
  }
  for (const row of overdueSubmittals) {
    const people = new Set([...holdersOf(managerReach, row.projectId), ...holdersOf(answererReach, row.projectId)]);
    const sender = row.sentBy ?? row.createdBy;
    if (reaches(submittalReach, sender, row.projectId)) people.add(sender);
    for (const userId of Array.from(people)) {
      const { digest, entry } = slot(userId, row.projectId);
      entry.submittals.push({ id: row.id, number: row.number, title: row.title, dueAt: row.dueAt!, daysLate: daysLate(row.dueAt!, now) });
      digest.counts.submittals += 1;
    }
  }
  for (const digest of Array.from(result.values())) {
    digest.counts.total = digest.counts.activities + digest.counts.actions + digest.counts.rfis + digest.counts.submittals;
    digest.projects.sort((a: ProjectDeadlines, b: ProjectDeadlines) => a.code.localeCompare(b.code));
  }
  return result;
}

/** The daily step: one notice and (mail switched on, daily summary wanted) one mail per person with anything overdue, per company. */
export async function enqueueDeadlineDigests(db: Db, now: Date, options: { mail?: boolean } = {}) {
  const window = dailyMailWindow(now);
  const result = { notices: 0, mails: 0 };
  if (!window.open) return result;
  const mail = options.mail ?? Boolean(mailerFromEnv());
  for (const tenantId of await activeTenantIds(db)) {
    const byUser = await overdueByUser(db, tenantId, now);
    if (!byUser.size) continue;
    const wanting = new Set(await recipientsWhoWant(db, tenantId, "daily_digest", Array.from(byUser.keys())));
    for (const [userId, digest] of Array.from(byUser)) {
      const [seen] = await db.select({ id: internalNotifications.id }).from(internalNotifications).where(and(eq(internalNotifications.tenantId, tenantId), eq(internalNotifications.recipientUserId, userId), isNull(internalNotifications.projectId), eq(internalNotifications.notificationCode, DEADLINES_NOTICE_CODE), sql`${internalNotifications.payload}::jsonb ->> 'day' = ${window.day}`)).limit(1);
      if (!seen) {
        await db.insert(internalNotifications).values({ id: randomUUID(), tenantId, recipientUserId: userId, projectId: null, notificationCode: DEADLINES_NOTICE_CODE, entityType: "company", entityId: tenantId, payload: JSON.stringify({ day: window.day, ...digest.counts }) });
        result.notices += 1;
      }
      if (!mail || !wanting.has(userId)) continue;
      const built = deadlinesEmail({ date: window.day, projects: digest.projects, link: linkTo(`/my-work/${tenantId}`) });
      if (built && (await enqueueEmail(db, { tenantId, recipientUserId: userId, kind: "daily_digest", dedupeKey: `deadlines:${window.day}`, mail: built }))) result.mails += 1;
    }
  }
  return result;
}

/** deadlines.mine: what is overdue for the signed-in person in this company, now, by the digest's own rule. Any active member may ask about themselves. */
export async function getMyDeadlinesForTenant(input: { userId: number; tenantId: string; now?: Date }): Promise<Deadlines> {
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot || snapshot.membershipStatus !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return (await overdueByUser(db, input.tenantId, input.now ?? new Date(), input.userId)).get(input.userId) ?? empty();
}
