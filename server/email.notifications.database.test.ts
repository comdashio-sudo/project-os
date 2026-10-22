import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { Mailer, OutgoingMail } from "./_core/auth/emailCode";
import { getDb } from "./db";
import { emailNotificationsActive, flushEmailOutbox, runEmailNotificationCycle, settleEmailFlushes, useMailerForTests } from "./emailNotifications";
import { appRouter } from "./routers";

// Work order 3, decision 6: e-mail for escalations, for what waits on a person's approval, and a daily summary for a project manager,
// all behind one switch. Synthetic fixtures and a fake sender: nothing here can reach a real mailbox.
const T = "7a000000-0000-4000-8000-0000000000a1";
const T2 = "7a000000-0000-4000-8000-0000000000b1";
const P1 = "7a000000-0000-4000-8000-0000000000a2";
const P2 = "7a000000-0000-4000-8000-0000000000a3";
const Q1 = "7a000000-0000-4000-8000-0000000000b2";
const uid = (n: number) => `7a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
const names = ["pm", "pm1", "approver", "buyer", "support", "optout", "noaddr", "left", "other", "reporter"] as const;
const users = {} as Record<(typeof names)[number], number>;
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@mail.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const smtpVariables = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;
const saved = { enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED, smtp: Object.fromEntries(smtpVariables.map(name => [name, process.env[name]])), from: process.env.EMAIL_FROM, base: process.env.APP_BASE_URL };
const sent: OutgoingMail[] = [];
const history: OutgoingMail[] = []; // everything sent in this file, in order: the later tests read what the earlier ones caused
let failNext = 0;
const mailer: Mailer = { async send(mail) { if (failNext > 0) { failNext -= 1; throw new Error("Resend rejected the message (503)"); } sent.push(mail); history.push(mail); } };
const turnOn = () => { process.env.EMAIL_NOTIFICATIONS_ENABLED = "true"; process.env.SMTP_HOST = "smtp.example.test"; process.env.SMTP_PORT = "587"; process.env.SMTP_USER = "mailer"; process.env.SMTP_PASSWORD = "test-password-not-real"; process.env.EMAIL_FROM = "no-reply@mail.example.test"; process.env.APP_BASE_URL = "https://app.example.test"; }; // secret-scan:allow fake value
const turnOff = () => { delete process.env.EMAIL_NOTIFICATIONS_ENABLED; for (const name of smtpVariables) delete process.env[name]; delete process.env.EMAIL_FROM; delete process.env.APP_BASE_URL; };

async function clear() {
  const t = [T, T2];
  await connection.query("DELETE FROM email_outbox WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM email_notification_preferences WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM internal_notifications WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM support_messages WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM support_tickets WHERE tenantId IN (?, ?)", t);
  for (const table of ["employee_time_entries", "employee_assignments", "project_resources", "employees", "payroll_runs", "purchase_orders", "ncrs", "actions", "issues", "progress_entries"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId LIKE 'eml-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("e-mail notifications behind one switch, on a real database", () => {
  beforeAll(async () => {
    useMailerForTests(mailer);
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${names.map(n => `('eml-${n}','${n}',${n === "noaddr" ? "NULL" : `'eml-${n}@mail.example.test'`},'user')`).join(",")}`);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'eml-%'");
    for (const name of names) users[name] = rows.find(row => row.openId === `eml-${name}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Mail Tenant', 'mail-tenant'), (?, 'Mail Other', 'mail-other')", [T, T2]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'ML-1', 'Mail project one', 'villas', 'SAR', 'active'), (?, ?, 'ML-2', 'Mail project two', 'villas', 'SAR', 'active'), (?, ?, 'OT-1', 'Other tenant project', 'villas', 'SAR', 'active')", [P1, T, P2, T, Q1, T2]);
    for (const [tenant, tag] of [[T, "a"], [T2, "b"]] as const) {
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`eml-sub-${tag}`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`eml-ent-${tag}`, tenant, `eml-sub-${tag}`]);
    }
    const codes = ["project.read", "project.manage", "project.payroll.approve", "project.procurement.manage", "tenant.manage"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    const roles: Array<[string, string, string[]]> = [["pm", "EML_PM", ["project.read", "project.manage"]], ["approver", "EML_APPROVER", ["project.read", "project.payroll.approve"]], ["buyer", "EML_BUYER", ["project.read", "project.procurement.manage"]], ["support", "EML_SUPPORT", ["project.read", "tenant.manage"]], ["plain", "EML_PLAIN", ["project.read"]]];
    for (const [key, code, list] of roles) {
      for (const tenant of [T, T2]) {
        const id = `eml-r-${key}-${tenant === T ? "a" : "b"}`;
        await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES (?, ?, ?, ?, 'PROJECT')", [id, tenant, code, code]);
        await connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${list.map(() => "?").join(",")})`, [id, ...list]);
      }
    }
    const member = async (name: (typeof names)[number], role: string, tenant = T, status = "active", scope: [string, string | null] = ["company", null]) => {
      const tag = tenant === T ? "a" : "b";
      await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, ?)", [`eml-m-${name}-${tag}`, tenant, users[name], status]);
      await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES (?, ?, ?, ?, ?)", [`eml-mr-${name}-${tag}`, `eml-m-${name}-${tag}`, `eml-r-${role}-${tag}`, scope[0], scope[1]]);
    };
    await member("pm", "pm"); await member("pm1", "pm", T, "active", ["project", P1]); await member("approver", "approver"); await member("buyer", "buyer"); await member("support", "support");
    await member("optout", "pm"); await member("noaddr", "pm"); await member("left", "pm", T, "suspended"); await member("reporter", "plain");
    await member("other", "pm", T2); // a project manager of another company
    // work waiting in company T: 2 time entries in P1, 1 in P2; a payroll run in review; a submitted purchase order in P2
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, createdByUserId) VALUES (?, ?, 'EM-1', 'Mail Employee', 'Mason', 'Site', '2024-01-01', 'active', ?), (?, ?, 'EM-2', 'Other Employee', 'Mason', 'Site', '2024-01-01', 'active', ?)", [uid(100), T, users.pm, uid(101), T2, users.other]);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, plannedUnits, allocatedUnits, unitCost, currency, createdByUserId) VALUES (?, ?, ?, 'EM-RES', 'Labour', 'labor', 100, 0, 10, 'SAR', ?), (?, ?, ?, 'EM-RES2', 'Labour', 'labor', 100, 0, 10, 'SAR', ?), (?, ?, ?, 'EM-RES3', 'Labour', 'labor', 100, 0, 10, 'SAR', ?)", [uid(110), T, P1, users.pm, uid(111), T, P2, users.pm, uid(112), T2, Q1, users.other]);
    for (const [id, tenant, project, resource, employee] of [[uid(120), T, P1, uid(110), uid(100)], [uid(121), T, P2, uid(111), uid(100)], [uid(122), T2, Q1, uid(112), uid(101)]] as const)
      await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, '2026-11-01', '2026-11-30', 100, 'active', ?)", [id, tenant, project, employee, resource, users.pm]);
    for (const [id, tenant, assignment, employee, project, date] of [[uid(130), T, uid(120), uid(100), P1, "2026-11-01"], [uid(131), T, uid(120), uid(100), P1, "2026-11-02"], [uid(132), T, uid(121), uid(100), P2, "2026-11-03"], [uid(133), T2, uid(122), uid(101), Q1, "2026-11-01"]] as const)
      await connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, 8, 'submitted', ?)", [id, tenant, assignment, employee, project, date, users.pm]);
    await connection.query("INSERT INTO payroll_runs (id, tenantId, periodStart, periodEnd, status, createdByUserId) VALUES (?, ?, '2026-11-01', '2026-11-30', 'review', ?)", [uid(140), T, users.pm]);
    await connection.query("INSERT INTO purchase_orders (id, tenantId, projectId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, 'PO-EML', 'Supplier', NOW(), 100, 'SAR', 'x', 'submitted', ?)", [uid(150), T, P2, users.pm]);
    // project facts for the digest: one open NCR and one overdue action in P1, one critical issue in P2, progress logged on 2026-11-02 in P1
    await connection.query("INSERT INTO ncrs (id, tenantId, projectId, ncrNumber, title, description, status, createdByUserId) VALUES (?, ?, ?, 'NCR-EML', 'Cracked slab', 'x', 'open', ?)", [uid(160), T, P1, users.pm]);
    await connection.query("INSERT INTO actions (id, tenantId, projectId, title, status, dueAt) VALUES (?, ?, ?, 'Overdue action', 'open', '2026-10-01 00:00:00')", [uid(161), T, P1]);
    await connection.query("INSERT INTO issues (id, tenantId, projectId, code, title, priority, status) VALUES (?, ?, ?, 'ISS-EML', 'Crane down', 'critical', 'open')", [uid(162), T, P2]);
    await connection.query("INSERT INTO progress_entries (id, tenantId, projectId, progressPercent, status, measuredAt) VALUES (?, ?, ?, 10, 'submitted', '2026-11-02 09:00:00')", [uid(163), T, P1]);
    await connection.query("INSERT INTO email_notification_preferences (id, tenantId, userId, kind, enabled) VALUES (?, ?, ?, 'daily_digest', false)", [uid(170), T, users.optout]);
  }, 60_000);
  afterAll(async () => { useMailerForTests(undefined); turnOff(); Object.assign(process.env, Object.fromEntries(Object.entries({ EMAIL_NOTIFICATIONS_ENABLED: saved.enabled, ...saved.smtp, EMAIL_FROM: saved.from, APP_BASE_URL: saved.base }).filter(([, value]) => value !== undefined))); await clear(); await connection.end(); });
  beforeEach(() => { sent.length = 0; failNext = 0; });
  const sentMails = () => history;

  const db = async () => (await getDb())!;
  const outbox = async (where = "1=1") => { const [rows] = await connection.query<any[]>(`SELECT kind, status, attempts, recipientUserId, subject, bodyText, lastError FROM email_outbox WHERE tenantId IN ('${T}','${T2}') AND ${where}`); return rows; };
  const to = (name: (typeof names)[number]) => `eml-${name}@mail.example.test`;
  const morning = new Date("2026-11-03T05:00:00.000Z");

  it("is off until the switch is on AND a sender is configured: no cycle, no queue, no mail", async () => {
    turnOff();
    expect(emailNotificationsActive()).toBe(false);
    expect(await runEmailNotificationCycle({ db: await db(), now: morning })).toEqual({ enabled: false });
    process.env.EMAIL_NOTIFICATIONS_ENABLED = "true"; // the switch without a sender is still off
    expect(emailNotificationsActive()).toBe(false);
    expect(await runEmailNotificationCycle({ db: await db(), now: morning })).toEqual({ enabled: false });
    delete process.env.EMAIL_NOTIFICATIONS_ENABLED; process.env.SMTP_HOST = "smtp.example.test"; process.env.SMTP_PORT = "587"; process.env.SMTP_USER = "mailer"; process.env.SMTP_PASSWORD = "k"; process.env.EMAIL_FROM = "x@example.test"; // a sender without the switch is off too
    expect(emailNotificationsActive()).toBe(false);
    turnOff();
    expect(await outbox()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("an escalation while it is off writes the in-app notice and queues no e-mail, so switching it on later sends no backlog", async () => {
    const { createSupportTicketForTenant } = await import("./db");
    await createSupportTicketForTenant({ userId: users.reporter, tenantId: T, subject: "Cannot export while off", category: "technical", priority: "urgent", body: "Please help", autoRespond: false });
    const [[notice]] = await connection.query<any[]>("SELECT COUNT(*) AS n FROM internal_notifications WHERE tenantId = ? AND notificationCode = 'SUPPORT_TICKET_ESCALATED'", [T]);
    expect(notice.n).toBe(1); // one manager (the support user) was told in the app
    expect(await outbox()).toEqual([]);
    await connection.query("UPDATE internal_notifications SET acknowledgedAt = NOW() WHERE tenantId = ?", [T]);
  });

  it("before the morning hour it queues no daily mail; from 07:00 Riyadh it queues one reminder per person and one digest per project manager", async () => {
    turnOn();
    expect(await runEmailNotificationCycle({ db: await db(), now: new Date("2026-11-03T03:30:00.000Z"), mailer })).toMatchObject({ enabled: true, reminders: 0, digests: 0, sent: 0 });
    const result = await runEmailNotificationCycle({ db: await db(), now: morning, mailer });
    // approvals: pm (company: 3 time entries + 1 purchase order = 4), pm1 (project one only: 2), approver (1 payroll run), buyer (1 purchase order), optout and noaddr (as pm: 4)
    // digests: pm, pm1 and noaddr (skipped when sending): optout turned the digest off; left is suspended; reporter cannot manage projects
    expect(result).toMatchObject({ enabled: true });
    const approvals = await outbox(`kind = 'approvals_waiting' AND tenantId = '${T}'`);
    expect(approvals.map(row => row.recipientUserId).sort()).toEqual([users.pm, users.pm1, users.approver, users.buyer, users.optout, users.noaddr].sort());
    const digests = await outbox(`kind = 'daily_digest' AND tenantId = '${T}'`);
    expect(digests.map(row => row.recipientUserId).sort()).toEqual([users.pm, users.pm1, users.noaddr].sort()); // noaddr is queued and then skipped at send: the address is looked up when sending, not when queueing
    expect(sent.filter(mail => !mail.to.startsWith("eml-other@")).length).toBe(approvals.length + digests.length - 2); // everything queued for this company but the two mails of the person with no address, who is skipped
    expect(sent.map(mail => mail.to)).not.toContain("null");
  });

  it("each person is told only what they may approve, in the projects they reach, counted exactly", async () => {
    const mailTo = (name: (typeof names)[number], subjectPart: string) => history.find(mail => mail.to === to(name) && mail.subject.includes(subjectPart))!;
    expect(mailTo("pm", "بانتظار اعتمادك").text).toContain("• إدخالات وقت للاعتماد: 3"); // company scope: 2 + 1
    expect(mailTo("pm1", "بانتظار اعتمادك").text).toContain("• time entries to approve: 2"); // project one only
    expect(mailTo("pm1", "بانتظار اعتمادك").text).not.toContain("purchase orders");
    expect(mailTo("approver", "بانتظار اعتمادك").text).toContain("• payroll runs to approve: 1");
    expect(mailTo("approver", "بانتظار اعتمادك").text).not.toContain("time entries");
    expect(mailTo("buyer", "بانتظار اعتمادك").text).toContain("• submitted purchase orders: 1");
    expect(mailTo("buyer", "بانتظار اعتمادك").text).not.toContain("time entries");
    expect(history.some(mail => mail.to === to("reporter"))).toBe(false); // a member with no approval power gets nothing
    expect(history.some(mail => mail.to === to("left"))).toBe(false); // a suspended member gets nothing
  });

  it("the project manager's digest has counts per project they reach, and never an amount or a name of pay", async () => {
    const digest = history.find(mail => mail.to === to("pm") && mail.subject.includes("الملخص اليومي"))!;
    expect(digest.text).toContain("ML-1 · Mail project one: awaiting approval 2 · overdue actions 1 · open critical issues 0 · open NCRs 1 · progress logged yesterday 1");
    expect(digest.text).toContain("ML-2 · Mail project two: awaiting approval 2 · overdue actions 0 · open critical issues 1 · open NCRs 0 · progress logged yesterday 0"); // 1 time entry + 1 purchase order
    expect(digest.text).not.toMatch(/OT-1|Other tenant/); // another company's project never appears
    const projectOne = history.find(mail => mail.to === to("pm1") && mail.subject.includes("الملخص اليومي"))!;
    expect(projectOne.text).toContain("ML-1");
    expect(projectOne.text).not.toContain("ML-2"); // a project-scoped manager sees only their project
    expect(digest.text).not.toMatch(/SAR|salary|amount|راتب/);
    expect(digest.text).toContain("https://app.example.test/");
  });

  it("another company's manager gets their own company's counts and nothing of ours", async () => {
    sent.length = 0;
    await runEmailNotificationCycle({ db: await db(), now: new Date("2026-11-04T05:00:00.000Z"), mailer });
    const theirs = sent.filter(mail => mail.to === to("other"));
    expect(theirs.length).toBeGreaterThan(0);
    for (const mail of theirs) expect(mail.text).not.toMatch(/ML-1|ML-2|PO-EML|Mail project/);
    expect(theirs.find(mail => mail.subject.includes("بانتظار اعتمادك"))!.text).toContain("• time entries to approve: 1");
  });

  it("a person with no address is skipped, not retried forever", async () => {
    const rows = await outbox(`recipientUserId = ${users.noaddr}`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.status === "skipped")).toBe(true);
  });

  it("runs twice in a day and mails once: the same cycle again changes nothing", async () => {
    const before = (await outbox()).length;
    sent.length = 0;
    const again = await runEmailNotificationCycle({ db: await db(), now: new Date("2026-11-04T09:00:00.000Z"), mailer });
    expect(again).toMatchObject({ enabled: true, reminders: 0, digests: 0, sent: 0 });
    expect((await outbox()).length).toBe(before);
    expect(sent).toEqual([]);
  });

  it("an escalation is mailed to the managers who want it, exactly once per in-app notice, and a person who opted out still gets the in-app notice only", async () => {
    const { createSupportTicketForTenant } = await import("./db");
    sent.length = 0;
    await createSupportTicketForTenant({ userId: users.reporter, tenantId: T, subject: "Export fails <b>now</b>", category: "technical", priority: "urgent", body: "Please help", autoRespond: false });
    await settleEmailFlushes(); // the request itself starts the send; wait for it
    await flushEmailOutbox(await db(), mailer);
    const escalations = sent.filter(mail => mail.subject.startsWith("تصعيد دعم"));
    expect(escalations.map(mail => mail.to)).toEqual([to("support")]);
    expect(escalations[0].html).not.toContain("<b>now</b>"); // the ticket's own words are escaped
    expect(escalations[0].text).toContain("Export fails");
    await flushEmailOutbox(await db(), mailer);
    expect(sent.filter(mail => mail.subject.startsWith("تصعيد دعم")).length).toBe(1); // flushing again sends nothing more
    // the manager opts out: the next escalation (another ticket) is still told in the app, not by mail
    await callerFor(users.support, "eml-support").notifications.setEmailPreference({ tenantId: T, kind: "support_escalation", enabled: false });
    sent.length = 0;
    await createSupportTicketForTenant({ userId: users.reporter, tenantId: T, subject: "Second urgent", category: "technical", priority: "urgent", body: "Again", autoRespond: false });
    await settleEmailFlushes();
    await flushEmailOutbox(await db(), mailer);
    expect(sent.filter(mail => mail.subject.startsWith("تصعيد دعم"))).toEqual([]);
    const [[notices]] = await connection.query<any[]>("SELECT COUNT(*) AS n FROM internal_notifications WHERE tenantId = ? AND notificationCode = 'SUPPORT_TICKET_ESCALATED' AND recipientUserId = ?", [T, users.support]);
    expect(notices.n).toBe(3); // the one from the switched-off test and these two
    turnOff();
  });

  it("a failed send is kept and retried, with only the sender's status line stored, and stops after three attempts", async () => {
    turnOn();
    await connection.query("UPDATE email_outbox SET status = 'skipped' WHERE status IN ('pending', 'failed') AND tenantId IN (?, ?)", [T, T2]); // earlier tests' leftovers are not this test's business
    const { enqueueEmail } = await import("./emailNotifications");
    await enqueueEmail(await db(), { tenantId: T, recipientUserId: users.pm, kind: "approvals_waiting", dedupeKey: "retry-test", mail: { subject: "Retry", text: "Retry body", html: "<p>Retry body</p>" } });
    failNext = 1;
    expect(await flushEmailOutbox(await db(), mailer)).toMatchObject({ sent: 0, failed: 1 });
    const failed = (await outbox("dedupeKey = 'retry-test'"))[0];
    expect(failed).toMatchObject({ status: "failed", attempts: 1, lastError: "Resend rejected the message (503)" });
    expect(failed.lastError).not.toMatch(/test-key|eml-pm|@/); // no key and no address in the error
    expect(await flushEmailOutbox(await db(), mailer)).toMatchObject({ sent: 1, failed: 0 });
    expect((await outbox("dedupeKey = 'retry-test'"))[0]).toMatchObject({ status: "sent", attempts: 2 });
    await enqueueEmail(await db(), { tenantId: T, recipientUserId: users.pm, kind: "approvals_waiting", dedupeKey: "give-up", mail: { subject: "Give up", text: "x", html: "x" } });
    failNext = 10;
    for (let attempt = 0; attempt < 5; attempt += 1) await flushEmailOutbox(await db(), mailer);
    expect((await outbox("dedupeKey = 'give-up'"))[0]).toMatchObject({ status: "failed", attempts: 3 }); // three tries, then it is left alone
    turnOff();
  });

  it("keeps each person's choices to themselves: a person reads and changes only their own, and the change is audited", async () => {
    turnOff();
    const reporter = callerFor(users.reporter, "eml-reporter");
    expect(await reporter.notifications.emailPreferences({ tenantId: T })).toEqual({ active: false, preferences: { support_escalation: true, approvals_waiting: true, daily_digest: true } });
    await reporter.notifications.setEmailPreference({ tenantId: T, kind: "daily_digest", enabled: false });
    expect((await reporter.notifications.emailPreferences({ tenantId: T })).preferences.daily_digest).toBe(false);
    expect((await callerFor(users.pm, "eml-pm").notifications.emailPreferences({ tenantId: T })).preferences.daily_digest).toBe(true); // someone else's choice is not mine
    const [audit] = await connection.query<any[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'notifications.email_preference_set' AND actorUserId = ?", [T, users.reporter]);
    expect(JSON.parse(audit[0].metadata)).toEqual({ kind: "daily_digest", enabled: false });
    await expect(callerFor(users.other, "eml-other").notifications.emailPreferences({ tenantId: T })).rejects.toThrow(); // not a member of this company
    await expect(callerFor(users.other, "eml-other").notifications.setEmailPreference({ tenantId: T, kind: "daily_digest", enabled: false })).rejects.toThrow();
  });
});
