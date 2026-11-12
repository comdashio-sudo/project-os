// Q-12 (c): the invitation is e-mailed to the invited address, in Arabic first, naming the company, the project (when the invitation is for one) and the role.
// The token exists only here, in memory, and in the mail: the invitation stores its hash, and the outbox row recording the send has the link withheld — so the mail cannot be
// re-sent from the outbox (flushEmailOutbox never takes this kind) and a database copy never holds a live invitation. The day's mail budget and the reserved-domain rule of
// the gate (server/emailGate.ts) apply. Whatever happens, the invitation itself stands: a mail not sent is reported as `emailed: false` and the person shares the link by hand.
import { and, eq, gte, sql } from "drizzle-orm";
import { companies, emailOutbox, projects, roles } from "../drizzle/schema";
import type { getDb } from "./db";
import { membershipInvitationEmail } from "./domain/emailNotifications";
import { mailerFromEnv } from "./emailNotifications";
import { isReservedMailDomain, mailGateConfigFromEnv, notificationAllowance, startOfUtcDay } from "./emailGate";
import { logError } from "./_core/logger";

export type InvitationMailInput = { tenantId: string; invitationId: string; email: string; inviteToken: string; roleId: string; scopeType: string; scopeId: string | null; expiresAt: Date };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type InvitationMailOutcome = "sent" | "disabled" | "over_budget" | "reserved_domain" | "failed";

const appBase = () => (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
const WITHHELD = "[the invitation link is withheld from the record]";

// Takes the database as an argument and never imports db.ts (db.ts calls this), like server/emailNotifications.ts.
export async function sendInvitationEmail(db: Db, input: InvitationMailInput): Promise<InvitationMailOutcome> {
  const mailer = mailerFromEnv();
  if (!mailer || !appBase()) return "disabled";
  const gate = mailGateConfigFromEnv();
  const record = (status: "sent" | "failed" | "skipped", subject: string, lastError: string | null) => db.insert(emailOutbox).values({
    id: crypto.randomUUID(), tenantId: input.tenantId, recipientUserId: null, recipientEmail: input.email, kind: "membership_invitation", dedupeKey: `invitation:${input.invitationId}`,
    subject: subject.slice(0, 300), bodyText: WITHHELD, bodyHtml: WITHHELD, status, attempts: status === "skipped" ? 0 : 1, lastError, sentAt: status === "sent" ? new Date() : null,
  });
  const [company] = await db.select({ name: companies.legalName }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
  const [role] = await db.select({ name: roles.name }).from(roles).where(and(eq(roles.id, input.roleId), eq(roles.tenantId, input.tenantId))).limit(1);
  const [project] = input.scopeType === "project" && input.scopeId ? await db.select({ name: projects.name, code: projects.code }).from(projects).where(and(eq(projects.id, input.scopeId), eq(projects.tenantId, input.tenantId))).limit(1) : [];
  const mail = membershipInvitationEmail({
    companyName: company?.name ?? "", projectName: project ? `${project.code} · ${project.name}` : null, roleName: role?.name ?? "",
    link: `${appBase()}/invite/accept?token=${encodeURIComponent(input.inviteToken)}`, expiresOn: input.expiresAt.toISOString().slice(0, 10),
  });
  if (gate.blockReservedDomains && isReservedMailDomain(input.email)) { await record("skipped", mail.subject, "reserved domain: mail to it can never be delivered"); return "reserved_domain"; }
  const [{ n: sentToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(emailOutbox).where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, startOfUtcDay(new Date()))));
  if (notificationAllowance(gate, sentToday) <= 0) { await record("skipped", mail.subject, "over today's mail budget: share the link by hand"); return "over_budget"; }
  try {
    await mailer.send({ to: input.email, subject: mail.subject, text: mail.text, html: mail.html });
    await record("sent", mail.subject, null);
    return "sent";
  } catch (error) {
    logError("invitation.email_failed", error, { invitationId: input.invitationId });
    await record("failed", mail.subject, (error instanceof Error ? error.message : "send failed").slice(0, 200));
    return "failed";
  }
}
