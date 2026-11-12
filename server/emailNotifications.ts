import { and, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import type { getDb } from "./db";
import { rowsAffected } from "./_core/database";
import {
  actions,
  changeRequests,
  claims,
  emailNotificationPreferences,
  emailOutbox,
  employeeTimeEntries,
  issues,
  memberships,
  membershipRoles,
  ncrs,
  payrollRuns,
  permissions,
  procurementRequisitions,
  progressEntries,
  projects,
  purchaseOrders,
  qualityInspections,
  rolePermissions,
  supportTickets,
  tenantEntitlements,
  users,
} from "../drizzle/schema";
import { createSmtpMailer, smtpSettingsFromEnv, type Mailer, type SmtpSettings } from "./_core/auth/mailer";
import { approvalsWaitingEmail, dailyDigestEmail, dailyMailWindow, EMAIL_KINDS, preferenceAllows, supportEscalationEmail, type ApprovalQueue, type BuiltEmail, type DigestProject, type EmailKind } from "./domain/emailNotifications";
import { logError } from "./_core/logger";
import { isReservedMailDomain, mailGateConfigFromEnv, notificationAllowance, pauseEnd, startOfUtcDay, type MailGateConfig } from "./emailGate";

// Work order 3, decision 6. Everything here is behind one switch: EMAIL_NOTIFICATIONS_ENABLED=true AND a configured sender (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM).
// While either is missing nothing is written to the outbox and nothing is sent, so switching it on later never delivers a backlog.
// This file takes the database as an argument and never imports db.ts: db.ts imports this file to queue escalations.

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Executor = Pick<Db, "select" | "insert" | "update">;

export type EmailEnv = { emailNotificationsEnabled: boolean; smtp: SmtpSettings | null; appBaseUrl: string };
// Read at the moment of use, not at start-up: the switch is an operator setting and a test must be able to flip it.
const currentEnv = (): EmailEnv => ({ emailNotificationsEnabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === "true", smtp: smtpSettingsFromEnv(), appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "") });

/** The one question every producer asks first. */
export function emailNotificationsActive(env: EmailEnv = currentEnv()) {
  return env.emailNotificationsEnabled && env.smtp !== null;
}

// A test replaces the sender so nothing can reach a real mailbox; production never sets it.
let senderOverride: Mailer | null | undefined;
export function useMailerForTests(mailer: Mailer | null | undefined) { senderOverride = mailer; }

export function mailerFromEnv(env: EmailEnv = currentEnv()): Mailer | null {
  if (!emailNotificationsActive(env)) return null;
  return senderOverride ?? (env.smtp ? createSmtpMailer(env.smtp) : null);
}

export const linkTo = (path: string) => { const base = currentEnv().appBaseUrl; return base ? `${base}${path}` : null; };

/** Queues one mail. False when the same mail (same dedupe key) was already queued: every producer can run twice safely. */
export async function enqueueEmail(executor: Executor, input: { tenantId: string; recipientUserId: number; kind: EmailKind; dedupeKey: string; mail: BuiltEmail }): Promise<boolean> {
  const dedupeKey = input.dedupeKey.slice(0, 160);
  const [existing] = await executor.select({ id: emailOutbox.id }).from(emailOutbox).where(and(eq(emailOutbox.tenantId, input.tenantId), eq(emailOutbox.recipientUserId, input.recipientUserId), eq(emailOutbox.kind, input.kind), eq(emailOutbox.dedupeKey, dedupeKey))).limit(1);
  if (existing) return false;
  // Two producers racing for the same key are stopped by the unique index; the loser's insert changes nothing.
  await executor.insert(emailOutbox).values({ id: crypto.randomUUID(), tenantId: input.tenantId, recipientUserId: input.recipientUserId, kind: input.kind, dedupeKey, subject: input.mail.subject.slice(0, 300), bodyText: input.mail.text, bodyHtml: input.mail.html }).onConflictDoNothing();
  return true;
}

async function disabledKinds(executor: Executor, tenantId: string, userIds: number[]) {
  const disabled = new Map<number, Set<EmailKind>>();
  if (!userIds.length) return disabled;
  const rows = await executor.select({ userId: emailNotificationPreferences.userId, kind: emailNotificationPreferences.kind }).from(emailNotificationPreferences).where(and(eq(emailNotificationPreferences.tenantId, tenantId), inArray(emailNotificationPreferences.userId, userIds), eq(emailNotificationPreferences.enabled, false)));
  for (const row of rows) disabled.set(row.userId, (disabled.get(row.userId) ?? new Set()).add(row.kind));
  return disabled;
}

/** Whether this person wants this kind of mail (no recorded choice means yes). */
export async function recipientsWhoWant(executor: Executor, tenantId: string, kind: EmailKind, userIds: number[]) {
  const disabled = await disabledKinds(executor, tenantId, userIds);
  return userIds.filter(id => preferenceAllows(disabled.get(id) ?? new Set(), kind));
}

type Holder = { userId: number; scopes: Array<{ type: "company" | "portfolio" | "program" | "project"; id: string | null }> };

/** Active members holding any of these permissions, with the scopes they hold them in. */
export async function permissionHolders(executor: Executor, tenantId: string, codes: readonly string[]): Promise<Holder[]> {
  const rows = await executor.select({ userId: memberships.userId, scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId })
    .from(memberships).innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id)).innerJoin(rolePermissions, eq(rolePermissions.roleId, membershipRoles.roleId)).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active"), inArray(permissions.code, [...codes])));
  const byUser = new Map<number, Holder>();
  for (const row of rows) { const holder = byUser.get(row.userId) ?? { userId: row.userId, scopes: [] }; holder.scopes.push({ type: row.scopeType, id: row.scopeId }); byUser.set(row.userId, holder); }
  return Array.from(byUser.values());
}

export type ProjectRow = { id: string; code: string; name: string; portfolioId: string | null; programId: string | null };
/** The projects a holder's scopes reach: the whole company, a portfolio, a program, or one project. */
export function projectsReachedBy(holder: Holder, all: readonly ProjectRow[]) {
  const reached = new Set<string>();
  for (const scope of holder.scopes) for (const project of all) {
    if (scope.type === "company" || (scope.type === "project" && scope.id === project.id) || (scope.type === "portfolio" && scope.id === project.portfolioId) || (scope.type === "program" && scope.id === project.programId)) reached.add(project.id);
  }
  return reached;
}

type QueueDefinition = { code: string; ar: string; en: string; permissions: readonly string[]; companyWide: boolean; count: (db: Executor, tenantId: string) => Promise<Map<string, number>> };
const countsBy = async (rows: Array<{ projectId: string | null; n: number }>) => new Map(rows.map(row => [row.projectId ?? "", Number(row.n)] as const));

/** What can wait for someone's approval, who may approve it, and how it is counted per project. Payroll is company-wide: it has no project. */
const approvalQueues: QueueDefinition[] = [
  { code: "time", ar: "إدخالات وقت للاعتماد", en: "time entries to approve", permissions: ["project.manage"], companyWide: false, count: async (db, tenantId) => countsBy(await db.select({ projectId: employeeTimeEntries.projectId, n: sql<number>`count(*)` }).from(employeeTimeEntries).where(and(eq(employeeTimeEntries.tenantId, tenantId), eq(employeeTimeEntries.status, "submitted"))).groupBy(employeeTimeEntries.projectId)) },
  { code: "payroll", ar: "دورات رواتب قيد الاعتماد", en: "payroll runs to approve", permissions: ["project.payroll.approve"], companyWide: true, count: async (db, tenantId) => countsBy((await db.select({ n: sql<number>`count(*)` }).from(payrollRuns).where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.status, "review")))).map(row => ({ projectId: null, n: row.n }))) },
  { code: "purchase_orders", ar: "أوامر شراء مقدَّمة", en: "submitted purchase orders", permissions: ["project.procurement.manage"], companyWide: false, count: async (db, tenantId) => countsBy(await db.select({ projectId: purchaseOrders.projectId, n: sql<number>`count(*)` }).from(purchaseOrders).where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.status, "submitted"))).groupBy(purchaseOrders.projectId)) },
  { code: "requisitions", ar: "طلبات مواد مقدَّمة", en: "submitted material requests", permissions: ["project.procurement.manage"], companyWide: false, count: async (db, tenantId) => countsBy(await db.select({ projectId: procurementRequisitions.projectId, n: sql<number>`count(*)` }).from(procurementRequisitions).where(and(eq(procurementRequisitions.tenantId, tenantId), eq(procurementRequisitions.status, "submitted"))).groupBy(procurementRequisitions.projectId)) },
  { code: "changes", ar: "طلبات تغيير بانتظار القرار", en: "change requests awaiting a decision", permissions: ["project.manage", "project.commitment.manage"], companyWide: false, count: async (db, tenantId) => countsBy(await db.select({ projectId: changeRequests.projectId, n: sql<number>`count(*)` }).from(changeRequests).where(and(eq(changeRequests.tenantId, tenantId), inArray(changeRequests.status, ["submitted", "under_review"]))).groupBy(changeRequests.projectId)) },
  { code: "claims", ar: "مطالبات بانتظار القرار", en: "claims awaiting a decision", permissions: ["project.commitment.manage"], companyWide: false, count: async (db, tenantId) => countsBy(await db.select({ projectId: claims.projectId, n: sql<number>`count(*)` }).from(claims).where(and(eq(claims.tenantId, tenantId), inArray(claims.status, ["submitted", "under_review"]))).groupBy(claims.projectId)) },
  { code: "inspections", ar: "فحوص جودة مقدَّمة", en: "submitted quality inspections", permissions: ["project.quality.manage"], companyWide: false, count: async (db, tenantId) => countsBy(await db.select({ projectId: qualityInspections.projectId, n: sql<number>`count(*)` }).from(qualityInspections).where(and(eq(qualityInspections.tenantId, tenantId), eq(qualityInspections.status, "submitted"))).groupBy(qualityInspections.projectId)) },
];

/** Companies that use the project product: nothing is mailed for one that does not. */
export async function activeTenantIds(db: Executor) {
  const rows = await db.select({ tenantId: tenantEntitlements.tenantId }).from(tenantEntitlements).where(and(eq(tenantEntitlements.productCode, "PROJECT"), eq(tenantEntitlements.active, true)));
  return Array.from(new Set(rows.map(row => row.tenantId)));
}

/** The queues each person may approve, with what is waiting in the projects they reach. One map entry per person with something waiting. */
export async function approvalsWaitingByUser(db: Executor, tenantId: string) {
  const all: ProjectRow[] = await db.select({ id: projects.id, code: projects.code, name: projects.name, portfolioId: projects.portfolioId, programId: projects.programId }).from(projects).where(eq(projects.tenantId, tenantId));
  const result = new Map<number, ApprovalQueue[]>();
  for (const queue of approvalQueues) {
    const perProject = await queue.count(db, tenantId);
    if (!Array.from(perProject.values()).some(count => count > 0)) continue;
    for (const holder of await permissionHolders(db, tenantId, queue.permissions)) {
      const count = queue.companyWide
        ? (holder.scopes.some(scope => scope.type === "company") ? perProject.get("") ?? 0 : 0)
        : Array.from(projectsReachedBy(holder, all)).reduce((sum, projectId) => sum + (perProject.get(projectId) ?? 0), 0);
      if (count > 0) result.set(holder.userId, [...(result.get(holder.userId) ?? []), { code: queue.code, ar: queue.ar, en: queue.en, count }]);
    }
  }
  return result;
}

/** Queues, once per person per day, a reminder of what waits for their approval. */
export async function enqueueApprovalReminders(db: Db, now: Date) {
  const window = dailyMailWindow(now); if (!window.open) return 0;
  let queued = 0;
  for (const tenantId of await activeTenantIds(db)) {
    const waiting = await approvalsWaitingByUser(db, tenantId);
    const wanting = new Set(await recipientsWhoWant(db, tenantId, "approvals_waiting", Array.from(waiting.keys())));
    for (const [userId, queues] of Array.from(waiting.entries())) {
      if (!wanting.has(userId)) continue;
      const mail = approvalsWaitingEmail({ queues, link: linkTo("/") }); if (!mail) continue;
      if (await enqueueEmail(db, { tenantId, recipientUserId: userId, kind: "approvals_waiting", dedupeKey: `approvals:${window.day}`, mail })) queued += 1;
    }
  }
  return queued;
}

/** Queues, once per project manager per day, a short summary of the projects they reach. Nothing to say means no mail. */
export async function enqueueDailyDigests(db: Db, now: Date) {
  const window = dailyMailWindow(now); if (!window.open) return 0;
  const todayStart = new Date(`${window.day}T00:00:00.000Z`); const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  let queued = 0;
  for (const tenantId of await activeTenantIds(db)) {
    const holders = await permissionHolders(db, tenantId, ["project.manage"]);
    if (!holders.length) continue;
    const all: ProjectRow[] = await db.select({ id: projects.id, code: projects.code, name: projects.name, portfolioId: projects.portfolioId, programId: projects.programId }).from(projects).where(and(eq(projects.tenantId, tenantId), notInArray(projects.status, ["cancelled", "closed"])));
    if (!all.length) continue;
    const count = async (rows: Array<{ projectId: string | null; n: number }>) => new Map(rows.map(row => [row.projectId ?? "", Number(row.n)] as const));
    const [overdue, critical, openNcr, progress] = await Promise.all([
      count(await db.select({ projectId: actions.projectId, n: sql<number>`count(*)` }).from(actions).where(and(eq(actions.tenantId, tenantId), inArray(actions.status, ["open", "in_progress"]), lt(actions.dueAt, now))).groupBy(actions.projectId)),
      count(await db.select({ projectId: issues.projectId, n: sql<number>`count(*)` }).from(issues).where(and(eq(issues.tenantId, tenantId), inArray(issues.status, ["open", "in_progress"]), eq(issues.priority, "critical"))).groupBy(issues.projectId)),
      count(await db.select({ projectId: ncrs.projectId, n: sql<number>`count(*)` }).from(ncrs).where(and(eq(ncrs.tenantId, tenantId), notInArray(ncrs.status, ["closed", "cancelled"]))).groupBy(ncrs.projectId)),
      count(await db.select({ projectId: progressEntries.projectId, n: sql<number>`count(*)` }).from(progressEntries).where(and(eq(progressEntries.tenantId, tenantId), eq(progressEntries.status, "submitted"), gte(progressEntries.measuredAt, yesterdayStart), lt(progressEntries.measuredAt, todayStart))).groupBy(progressEntries.projectId)),
    ]);
    const waitingPerProject = new Map<string, number>();
    for (const queue of approvalQueues.filter(item => !item.companyWide)) for (const [projectId, n] of Array.from((await queue.count(db, tenantId)).entries())) waitingPerProject.set(projectId, (waitingPerProject.get(projectId) ?? 0) + n);
    const wanting = new Set(await recipientsWhoWant(db, tenantId, "daily_digest", holders.map(holder => holder.userId)));
    for (const holder of holders) {
      if (!wanting.has(holder.userId)) continue;
      const reached = projectsReachedBy(holder, all);
      const digest: DigestProject[] = all.filter(project => reached.has(project.id)).map(project => ({ code: project.code, name: project.name, approvalsWaiting: waitingPerProject.get(project.id) ?? 0, overdueActions: overdue.get(project.id) ?? 0, openCriticalIssues: critical.get(project.id) ?? 0, openNcrs: openNcr.get(project.id) ?? 0, progressLoggedYesterday: progress.get(project.id) ?? 0 }));
      const mail = dailyDigestEmail({ date: window.day, projects: digest, link: linkTo("/") }); if (!mail) continue;
      if (await enqueueEmail(db, { tenantId, recipientUserId: holder.userId, kind: "daily_digest", dedupeKey: `digest:${window.day}`, mail })) queued += 1;
    }
  }
  return queued;
}

/** Queues a support escalation for the managers just notified in-app. Called inside the caller's transaction, after the in-app notices were written. */
export async function enqueueSupportEscalationEmails(executor: Executor, input: { tenantId: string; ticketId: string; reason: "urgent" | "assistant_could_not_answer" | "customer_replied"; notified: Array<{ notificationId: string; userId: number }> }) {
  if (!emailNotificationsActive() || !input.notified.length) return 0;
  const [ticket] = await executor.select({ subject: supportTickets.subject }).from(supportTickets).where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.tenantId, input.tenantId))).limit(1);
  const wanting = new Set(await recipientsWhoWant(executor, input.tenantId, "support_escalation", input.notified.map(item => item.userId)));
  let queued = 0;
  for (const item of input.notified) {
    if (!wanting.has(item.userId)) continue;
    const mail = supportEscalationEmail({ ticketSubject: ticket?.subject ?? "", reason: input.reason, link: linkTo(`/support/${input.tenantId}`) });
    if (await enqueueEmail(executor, { tenantId: input.tenantId, recipientUserId: item.userId, kind: "support_escalation", dedupeKey: `notice:${item.notificationId}`, mail })) queued += 1;
  }
  return queued;
}

const MAX_ATTEMPTS = 3;

/**
 * Sends what is queued, through the gate (server/emailGate.ts): urgent kinds first; at most the day's notification budget (the rest of the SMTP quota is kept for sign-in codes) and what
 * is over WAITS in the outbox for tomorrow; a runaway minute stops the sending for fifteen minutes; a reserved domain is never mailed in production. A person who left the company, or
 * has no address, is skipped; a failed send is retried on the next cycle up to three times.
 */
export async function flushEmailOutbox(db: Db, mailer: Mailer, options: { limit?: number; gate?: MailGateConfig; now?: Date } = {}) {
  const gate = options.gate ?? mailGateConfigFromEnv();
  const now = options.now ?? new Date();
  const summary = { sent: 0, failed: 0, skipped: 0, deferred: 0, pausedUntil: null as Date | null };
  const [{ n: sentToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(emailOutbox).where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, startOfUtcDay(now))));
  const recent = await db.select({ at: emailOutbox.sentAt }).from(emailOutbox).where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, new Date(now.getTime() - gate.pauseMs - 60_000))));
  const pausedUntil = pauseEnd(recent.map(row => row.at!).filter(Boolean), now, gate);
  const pending = await db.select({ id: emailOutbox.id, tenantId: emailOutbox.tenantId, recipientUserId: emailOutbox.recipientUserId, kind: emailOutbox.kind, subject: emailOutbox.subject, text: emailOutbox.bodyText, html: emailOutbox.bodyHtml, attempts: emailOutbox.attempts }).from(emailOutbox).where(and(inArray(emailOutbox.status, ["pending", "failed"]), lt(emailOutbox.attempts, MAX_ATTEMPTS), ne(emailOutbox.kind, "membership_invitation")))
    .orderBy(sql`CASE ${emailOutbox.kind} WHEN 'support_escalation' THEN 0 WHEN 'approvals_waiting' THEN 1 ELSE 2 END`, emailOutbox.createdAt).limit(options.limit ?? 50);
  if (pausedUntil) { summary.pausedUntil = pausedUntil; summary.deferred = pending.length; return summary; }
  let allowance = notificationAllowance(gate, sentToday);
  const sendTimes: number[] = [];
  for (const item of pending) {
    if (allowance <= 0) { summary.deferred += 1; continue; } // over today's budget: it stays pending and goes tomorrow, before anything newer of a lower priority
    if (sendTimes.length >= gate.perMinute && Date.now() - sendTimes[sendTimes.length - gate.perMinute] < 60_000) { summary.deferred += 1; continue; } // the runaway stop: the next cycle sees the burst and pauses
    // Claim the row before sending: another flush (the cron and a request can overlap) that loses this race skips it, so one mail is never sent twice.
    const claim = await db.update(emailOutbox).set({ attempts: sql`${emailOutbox.attempts} + 1` }).where(and(eq(emailOutbox.id, item.id), eq(emailOutbox.attempts, item.attempts), inArray(emailOutbox.status, ["pending", "failed"])));
    if (rowsAffected(claim) !== 1) continue;
    // an invitation row (no user, an address) is written already sent or refused by server/invitationEmail.ts and never waits here; a row without a user is never mailed
    if (item.recipientUserId === null) { await db.update(emailOutbox).set({ status: "skipped", lastError: "no user to resolve the address" }).where(eq(emailOutbox.id, item.id)); summary.skipped += 1; continue; }
    const [recipient] = await db.select({ email: users.email }).from(users).innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.tenantId, item.tenantId), eq(memberships.status, "active"))).where(eq(users.id, item.recipientUserId)).limit(1);
    if (!recipient?.email) { await db.update(emailOutbox).set({ status: "skipped", lastError: "no deliverable address or no longer a member" }).where(eq(emailOutbox.id, item.id)); summary.skipped += 1; continue; }
    if (gate.blockReservedDomains && isReservedMailDomain(recipient.email)) { await db.update(emailOutbox).set({ status: "skipped", lastError: "reserved domain: mail to it can never be delivered" }).where(eq(emailOutbox.id, item.id)); summary.skipped += 1; continue; }
    try {
      await mailer.send({ to: recipient.email, subject: item.subject, text: item.text, html: item.html });
      await db.update(emailOutbox).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(emailOutbox.id, item.id));
      summary.sent += 1; allowance -= 1; sendTimes.push(Date.now());
    } catch (error) {
      await db.update(emailOutbox).set({ status: "failed", lastError: (error instanceof Error ? error.message : "send failed").slice(0, 200) }).where(eq(emailOutbox.id, item.id));
      summary.failed += 1;
    }
  }
  return summary;
}

/** After a request committed: send what it queued, without making the person wait for the mail and without ever failing the request. */
const inFlight = new Set<Promise<unknown>>();
export function flushEmailSoon(db: Db) {
  const mailer = mailerFromEnv(); if (!mailer) return;
  const running = flushEmailOutbox(db, mailer).catch(error => logError("email.flush_failed", error)).finally(() => inFlight.delete(running));
  inFlight.add(running);
}
/** Waits for the sends `flushEmailSoon` started. For tests and for a clean shutdown. */
export async function settleEmailFlushes() { await Promise.all(Array.from(inFlight)); }

/** One pass of the scheduler: queue the morning mails when their hour has come, then send everything waiting. */
export async function runEmailNotificationCycle(input: { db: Db; now?: Date; mailer?: Mailer | null }) {
  const mailer = input.mailer === undefined ? mailerFromEnv() : input.mailer;
  if (!mailer) return { enabled: false as const };
  const now = input.now ?? new Date();
  const reminders = await enqueueApprovalReminders(input.db, now);
  const digests = await enqueueDailyDigests(input.db, now);
  const delivery = await flushEmailOutbox(input.db, mailer);
  return { enabled: true as const, reminders, digests, ...delivery };
}

export { EMAIL_KINDS };
