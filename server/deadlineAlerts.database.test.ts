import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { withSystemContext } from "./_core/database";
import { getDb } from "./db";
import { DEADLINES_NOTICE_CODE, enqueueDeadlineDigests } from "./deadlineAlerts";
import { appRouter } from "./routers";

// Q-26 (P-119) on a real database, as the restricted application role under the scheduler's system context. Each person receives ONE notice and ONE mail a
// day with what is overdue in the projects they answer for: late critical activities for the schedule's managers, overdue actions for their owner, overdue
// RFIs for the managers and the person who raised them, unanswered submittals for the managers, the consultant's answerers and the sender. Nothing twice the
// same day, nothing before the mailing hour, nothing for someone with nothing overdue, nothing across projects or companies. Synthetic data only.
const T = "50000000-0000-4000-8000-0000000026a1";
const T_OTHER = "50000000-0000-4000-8000-0000000026b1";
const P = "50000000-0000-4000-8000-0000000026a2";
const P2 = "50000000-0000-4000-8000-0000000026a3";
const P_OTHER = "50000000-0000-4000-8000-0000000026b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const names = ["pm", "sched", "site", "consult", "optout", "side", "idle", "other"] as const;
type Name = (typeof names)[number];
const users = {} as Record<Name, number>;
let connection: fixtureDb.Connection;
const callerFor = (name: Name) => appRouter.createCaller({ user: { id: users[name], openId: `q26-${name}`, name, email: `q26-${name}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const NOW = new Date(`${new Date().toISOString().slice(0, 10)}T05:00:00.000Z`); // 08:00 in Riyadh: the mailing hour has come
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const run = async (now: Date) => withSystemContext("test: the daily deadlines digest", async () => enqueueDeadlineDigests((await getDb())!, now, { mail: true }));

async function clear() {
  const t = [T, T_OTHER];
  for (const table of ["email_outbox", "email_notification_preferences", "internal_notifications", "audit_logs", "actions", "consultant_submittals", "rfis", "activities"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId LIKE 'q26-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-26 (P-119): the daily deadlines digest, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${names.map(n => `('q26-${n}','${n}','q26-${n}@pmc.example.test','user')`).join(",")}`);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q26-%'");
    for (const name of names) users[name] = rows.find(row => row.openId === `q26-${name}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q26 Deadlines Tenant', 'q26-a'), (?, 'Q26 Deadlines Other', 'q26-b')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q26-A', 'Deadlines project', 'villas', 'SAR', 'active'), (?, ?, 'Q26-S', 'Side project', 'villas', 'SAR', 'active'), (?, ?, 'Q26-B', 'Other company project', 'villas', 'SAR', 'active')", [P, T, P2, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q26-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q26-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q26-ent-a', ?, 'q26-sub-a', 'PROJECT', true, NOW()), ('q26-ent-b', ?, 'q26-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    const role = async (id: string, tenantId: string, code: string) => {
      await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES (?, ?, ?, ?, 'PROJECT')", [id, tenantId, id.toUpperCase().replace(/-/g, "_"), id]);
      // the permission row may not exist yet in a fresh test database: make sure it does, then grant it
      await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
      await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code = ?", [id, code]);
    };
    await role("q26-r-pm", T, "project.manage"); await role("q26-r-sched", T, "project.schedule.manage"); await role("q26-r-read", T, "project.read"); await role("q26-r-consult", T, "project.consultant.respond"); await role("q26-r-pm-b", T_OTHER, "project.manage");
    const member = async (name: Name, tenantId: string, roleId: string, projectId: string) => {
      await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, 'active')", [`q26-m-${name}`, tenantId, users[name]]);
      await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES (?, ?, ?, 'project', ?)", [`q26-mr-${name}`, `q26-m-${name}`, roleId, projectId]);
    };
    await member("pm", T, "q26-r-pm", P); await member("sched", T, "q26-r-sched", P); await member("site", T, "q26-r-read", P); await member("consult", T, "q26-r-consult", P);
    await member("optout", T, "q26-r-pm", P); await member("side", T, "q26-r-pm", P2); await member("idle", T, "q26-r-read", P2); await member("other", T_OTHER, "q26-r-pm-b", P_OTHER);
    await connection.query("INSERT INTO email_notification_preferences (id, tenantId, userId, kind, enabled) VALUES ('q26-pref', ?, ?, 'daily_digest', false)", [T, users.optout]);

    const activity = (id: string, tenantId: string, projectId: string, code: string, status: string, finish: Date, float: number | null) =>
      connection.query("INSERT INTO activities (id, tenantId, projectId, code, name, status, plannedFinishAt, totalFloatHours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, tenantId, projectId, code, `Activity ${code}`, status, finish, float]);
    await activity("q26-act-late", T, P, "A-LATE", "in_progress", ago(3), 0); // critical and late: the only one that counts in P
    await activity("q26-act-float", T, P, "A-FLOAT", "in_progress", ago(3), 40); // late but not critical
    await activity("q26-act-nofloat", T, P, "A-NOFLOAT", "not_started", ago(3), null); // float not known: never «critical»
    await activity("q26-act-done", T, P, "A-DONE", "completed", ago(3), 0); // complete
    await activity("q26-act-future", T, P, "A-FUTURE", "in_progress", new Date(NOW.getTime() + 2 * DAY), -8); // critical, not yet due
    await activity("q26-act-side", T, P2, "S-LATE", "in_progress", ago(1), 0);
    await activity("q26-act-other", T_OTHER, P_OTHER, "B-LATE", "in_progress", ago(1), 0);
    await connection.query("INSERT INTO actions (id, tenantId, projectId, title, priority, ownerMembershipId, dueAt, status) VALUES ('q26-x-late', ?, ?, 'Send the shoring method statement', 'high', 'q26-m-site', ?, 'open'), ('q26-x-done', ?, ?, 'Already done', 'low', 'q26-m-site', ?, 'completed'), ('q26-x-future', ?, ?, 'Not yet due', 'low', 'q26-m-site', ?, 'open')", [T, P, ago(2), T, P, ago(2), T, P, new Date(NOW.getTime() + DAY)]);
    await connection.query("INSERT INTO rfis (id, tenantId, projectId, rfiNumber, subject, question, status, dueAt, createdByUserId) VALUES ('q26-rfi-late', ?, ?, 'RFI-1', 'Rebar detail at the stair', 'Which bar?', 'submitted', ?, ?), ('q26-rfi-answered', ?, ?, 'RFI-2', 'Answered', 'Q', 'answered', ?, ?)", [T, P, ago(1), users.site, T, P, ago(1), users.site]);
    await connection.query("INSERT INTO consultant_submittals (id, tenantId, projectId, submittalType, submittalNumber, title, status, dueAt, sentAt, createdByUserId, sentByUserId) VALUES ('q26-sub-late', ?, ?, 'shop_drawing', 'SD-9', 'Stair shop drawing', 'sent', ?, ?, ?, ?)", [T, P, ago(5), ago(12), users.site, users.site]);
  }, 120_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const notices = async (name: Name) => (await connection.query<{ tenantId: string; projectId: string | null; payload: string }[]>("SELECT tenantId, projectId, payload FROM internal_notifications WHERE recipientUserId = ? AND notificationCode = ?", [users[name], DEADLINES_NOTICE_CODE]))[0];
  const mails = async (name: Name) => (await connection.query<{ tenantId: string; subject: string; bodyText: string; dedupeKey: string }[]>("SELECT tenantId, subject, bodyText, dedupeKey FROM email_outbox WHERE recipientUserId = ? AND dedupeKey LIKE 'deadlines:%'", [users[name]]))[0];

  it("NEGATIVE: before the mailing hour nothing is written", async () => {
    expect(await run(new Date(NOW.getTime() - 3 * 3_600_000))).toEqual({ notices: 0, mails: 0 }); // 02:00 UTC
    for (const name of names) expect(await notices(name)).toHaveLength(0);
  });

  it("POSITIVE: each person gets one notice with their own counts, and one mail unless they switched the daily summary off", async () => {
    await run(NOW);
    const counts = async (name: Name) => { const rows = await notices(name); expect(rows, name).toHaveLength(1); expect(rows[0].projectId).toBeNull(); const { day, ...rest } = JSON.parse(rows[0].payload); expect(day).toBe(NOW.toISOString().slice(0, 10)); return rest; };
    expect(await counts("pm")).toEqual({ activities: 1, actions: 0, rfis: 1, submittals: 1, total: 3 });
    expect(await counts("optout")).toEqual({ activities: 1, actions: 0, rfis: 1, submittals: 1, total: 3 });
    expect(await counts("sched")).toEqual({ activities: 1, actions: 0, rfis: 0, submittals: 0, total: 1 });
    expect(await counts("site")).toEqual({ activities: 0, actions: 1, rfis: 1, submittals: 1, total: 3 });
    expect(await counts("consult")).toEqual({ activities: 0, actions: 0, rfis: 0, submittals: 1, total: 1 });
    expect(await counts("side")).toEqual({ activities: 1, actions: 0, rfis: 0, submittals: 0, total: 1 });
    expect(await counts("other")).toEqual({ activities: 1, actions: 0, rfis: 0, submittals: 0, total: 1 });
    // nothing overdue in their projects: nothing written
    expect(await notices("idle")).toHaveLength(0);
    const pmMail = await mails("pm");
    expect(pmMail).toHaveLength(1);
    expect(pmMail[0].dedupeKey).toBe(`deadlines:${NOW.toISOString().slice(0, 10)}`);
    expect(pmMail[0].bodyText).toContain("A-LATE");
    expect(pmMail[0].bodyText).toContain("3 day(s) late");
    expect(pmMail[0].bodyText).toContain("RFI-1");
    expect(pmMail[0].bodyText).toContain("SD-9");
    for (const absent of ["A-FLOAT", "A-NOFLOAT", "A-DONE", "A-FUTURE", "RFI-2", "S-LATE", "B-LATE", "Send the shoring"]) expect(pmMail[0].bodyText, absent).not.toContain(absent);
    expect(await mails("optout")).toHaveLength(0);
    expect(await mails("idle")).toHaveLength(0);
    const otherMail = await mails("other");
    expect(otherMail).toHaveLength(1);
    expect(otherMail[0].tenantId).toBe(T_OTHER);
    expect(otherMail[0].bodyText).toContain("B-LATE");
    expect(otherMail[0].bodyText).not.toContain("A-LATE");
  });

  it("NEGATIVE: a second run the same day adds nothing", async () => {
    expect(await run(new Date(NOW.getTime() + 3_600_000))).toEqual({ notices: 0, mails: 0 });
    for (const name of ["pm", "site", "other"] as const) { expect(await notices(name)).toHaveLength(1); expect(await mails(name)).toHaveLength(1); }
  });

  it("the live read (executive.myDeadlines) is the digest's own rule, for the caller only; another company's member is refused", async () => {
    const mine = await callerFor("site").executive.myDeadlines({ tenantId: T });
    expect(mine.counts).toEqual({ activities: 0, actions: 1, rfis: 1, submittals: 1, total: 3 });
    expect(mine.projects.map(project => project.code)).toEqual(["Q26-A"]);
    expect(mine.projects[0].actions.map(action => [action.title, action.daysLate])).toEqual([["Send the shoring method statement", 2]]);
    expect(mine.projects[0].submittals.map(item => [item.number, item.daysLate])).toEqual([["SD-9", 5]]);
    expect((await callerFor("idle").executive.myDeadlines({ tenantId: T })).counts.total).toBe(0);
    await expect(callerFor("other").executive.myDeadlines({ tenantId: T })).rejects.toMatchObject({ message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  });
});
