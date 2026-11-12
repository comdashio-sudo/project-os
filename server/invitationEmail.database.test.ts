import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { Mailer, OutgoingMail } from "./_core/auth/mailer";
import { flushEmailOutbox, useMailerForTests } from "./emailNotifications";
import { getDb } from "./db";
import { appRouter } from "./routers";

// Q-12 (c) on a real database, through the real router, as the restricted application role: an invitation is e-mailed in Arabic naming the company, the project and the role,
// with the acceptance link; the record of the send never holds the link; the outbox never re-sends it; with mail switched off nothing is sent and the invitation still stands;
// the manager of another company cannot invite into this one (no invitation, no mail). Synthetic data only (*.example.test).
const SLUG = "q12-invite-mail";
const PROJECT = "c1200000-0000-4000-8000-000000000001";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@im.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection; let tenantId = ""; let otherTenantId = ""; let roleId = "";
const sent: OutgoingMail[] = []; let failNext = false;
const mailer: Mailer = { async send(mail) { if (failNext) { failNext = false; throw new Error("SMTP rejected the message (503)"); } sent.push(mail); } };
const ENV_KEYS = ["EMAIL_NOTIFICATIONS_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "APP_BASE_URL", "EMAIL_DAILY_LIMIT", "EMAIL_BURST_PER_MINUTE"] as const;
const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
const turnOn = () => Object.assign(process.env, { EMAIL_NOTIFICATIONS_ENABLED: "true", SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "mailer", SMTP_PASSWORD: "test-only", EMAIL_FROM: "noreply@example.test", APP_BASE_URL: "https://app.example.test", EMAIL_DAILY_LIMIT: "1000000", EMAIL_BURST_PER_MINUTE: "1000000" });
const turnOff = () => { for (const key of ENV_KEYS) delete process.env[key]; };
const outbox = async () => (await connection.query<{ status: string; recipientEmail: string; bodyText: string; bodyHtml: string; subject: string }[]>("SELECT status, recipient_email AS \"recipientEmail\", body_text AS \"bodyText\", body_html AS \"bodyHtml\", subject FROM email_outbox WHERE tenant_id = ? AND kind = 'membership_invitation' ORDER BY created_at", [tenantId]))[0] as Array<{ status: string; recipientEmail: string; bodyText: string; bodyHtml: string; subject: string }>;
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["email_outbox", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'im-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the invitation e-mail (Q-12 c)", () => {
  beforeAll(async () => {
    useMailerForTests(mailer);
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`im-${key}`, `IM ${key}`, `im-${key}@im.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'im-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `im-${key}`)!.id; callers[key] = callerFor(ids[key], `im-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Example Builders Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Other Example Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'VIL-7', 'Example Villas', 'villas', 'SAR', 'active')", [PROJECT, tenantId]);
    ({ id: roleId } = await callers.owner.tenant.createRole({ tenantId, code: "IM_SITE", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.read", "project.field.manage"] }));
  });
  beforeEach(() => { sent.length = 0; failNext = false; turnOn(); });
  afterAll(async () => { useMailerForTests(undefined); turnOff(); Object.assign(process.env, Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined))); if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the invited address receives an Arabic mail naming the company, the project and the role, with the acceptance link; the record holds no link", async () => {
    const result = await callers.owner.tenant.createInvitation({ tenantId, email: "new.engineer@im.example.test", roleId, scopeType: "project", scopeId: PROJECT });
    expect(result).toMatchObject({ emailed: true, emailOutcome: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("new.engineer@im.example.test");
    expect(sent[0].subject).toBe("دعوة للانضمام إلى Example Builders Co. — مشروع VIL-7 · Example Villas");
    expect(sent[0].text).toContain("بدور «Site engineer»");
    expect(sent[0].text).toContain(`https://app.example.test/invite/accept?token=${encodeURIComponent(result.inviteToken)}`);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "sent", recipientEmail: "new.engineer@im.example.test" });
    expect(rows[0].bodyText + rows[0].bodyHtml).not.toContain(result.inviteToken);
  });

  it("a failed send is recorded as failed, the invitation still stands, and the outbox never re-sends it", async () => {
    failNext = true;
    const result = await callers.owner.tenant.createInvitation({ tenantId, email: "second@im.example.test", roleId, scopeType: "company" });
    expect(result).toMatchObject({ emailed: false, emailOutcome: "failed" });
    expect(await count("SELECT COUNT(*) AS n FROM membership_invitations WHERE tenant_id = ? AND email = ? AND status = 'pending'", [tenantId, "second@im.example.test"])).toBe(1);
    const summary = await flushEmailOutbox((await getDb())!, mailer);
    expect(sent).toHaveLength(0);
    expect(summary.sent).toBe(0);
  });

  it("NEGATIVE: with mail switched off nothing is sent or recorded, and the invitation still stands with its link for the inviter", async () => {
    turnOff();
    const before = (await outbox()).length;
    const result = await callers.owner.tenant.createInvitation({ tenantId, email: "third@im.example.test", roleId, scopeType: "company" });
    expect(result).toMatchObject({ emailed: false, emailOutcome: "disabled" });
    expect(result.inviteToken.length).toBeGreaterThanOrEqual(32);
    expect(sent).toHaveLength(0);
    expect((await outbox()).length).toBe(before);
  });

  it("NEGATIVE: the owner of another company cannot invite into this one, or onto its project from their own: no invitation and no mail", async () => {
    expect(await code(callers.outsider.tenant.createInvitation({ tenantId, email: "intruder@im.example.test", roleId, scopeType: "project", scopeId: PROJECT }))).not.toBe("no error");
    expect(await code(callers.outsider.tenant.createInvitation({ tenantId: otherTenantId, email: "intruder@im.example.test", roleId, scopeType: "project", scopeId: PROJECT }))).not.toBe("no error");
    expect(sent).toHaveLength(0);
    expect(await count("SELECT COUNT(*) AS n FROM membership_invitations WHERE email = ?", ["intruder@im.example.test"])).toBe(0);
  });

  it("the project's team page lists the project's pending invitations only (not company-wide ones); another company is refused", async () => {
    const waiting = await callers.owner.projects.team.invitations({ tenantId, projectId: PROJECT });
    expect(waiting.map(item => [item.email, item.roleName])).toEqual([["new.engineer@im.example.test", "Site engineer"]]);
    expect(await code(callers.outsider.projects.team.invitations({ tenantId, projectId: PROJECT }))).not.toBe("no error");
    expect(await code(callers.outsider.projects.team.invitations({ tenantId: otherTenantId, projectId: PROJECT }))).not.toBe("no error");
  });
});

