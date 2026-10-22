import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createSupportTicketForTenant, replyToSupportTicket } from "./db";
import { appRouter } from "./routers";

// G-108: a support ticket that asks for a person reaches the tenant's managers through the internal notifications.
const T = "76000000-0000-4000-8000-0000000000a1";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
const users = { managerA: 0, managerB: 0, customer: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@support.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

async function clear() {
  for (const table of ["internal_notifications", "support_messages", "support_tickets", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'sup-%'");
}
// The router always lets the assistant answer, and with no knowledge article (or no model) it defers to a person, which
// is itself an escalation. These two calls switch the assistant off so each rule is tested alone.
const newTicket = (userId: number, priority: "low" | "normal" | "high" | "urgent", subject: string) => createSupportTicketForTenant({ userId, tenantId: T, subject, category: "general", priority, body: `${subject} body`, autoRespond: false });
const reply = (userId: number, ticketId: string, body: string) => replyToSupportTicket({ userId, tenantId: T, ticketId, body, autoRespond: false });
const open = async (userId: number) => { const [rows] = await connection.query<{ entityId: string; payload: string }[]>("SELECT entityId, payload FROM internal_notifications WHERE tenantId = ? AND recipientUserId = ? AND notificationCode = 'SUPPORT_TICKET_ESCALATED' AND acknowledgedAt IS NULL ORDER BY createdAt", [T, userId]); return rows; };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("support escalation notifies the owner (G-108)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const keys = ["managerA", "managerB", "customer"];
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES (?, 'A', 'sup-a@support.example.test', 'user'), (?, 'B', 'sup-b@support.example.test', 'user'), (?, 'C', 'sup-c@support.example.test', 'user')", keys.map(key => `sup-${key}`));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'sup-%'");
    for (const key of keys) users[key as keyof typeof users] = rows.find(row => row.openId === `sup-${key}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Support Tenant', 'support-escalation')", [T]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), 'tenant.manage', 'tenant.manage', 'EXECUTIVE'), (UUID(), 'project.read', 'project.read', 'PROJECT')");
    await connection.query("INSERT INTO roles (id, tenantId, code, name) VALUES ('sup-r-mgr', ?, 'SUP_MGR', 'Manager'), ('sup-r-cus', ?, 'SUP_CUS', 'Customer')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'sup-r-mgr', id FROM permissions WHERE code = 'tenant.manage'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'sup-r-cus', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('sup-m-a', ?, ?, 'active'), ('sup-m-b', ?, ?, 'active'), ('sup-m-c', ?, ?, 'active')", [T, users.managerA, T, users.managerB, T, users.customer]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('sup-mr-a','sup-m-a','sup-r-mgr','company'),('sup-mr-b','sup-m-b','sup-r-mgr','company'),('sup-mr-c','sup-m-c','sup-r-cus','company')");
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("does not notify for an ordinary ticket the assistant can be left to answer", async () => {
    const customer = callerFor(users.customer, "sup-customer");
    await newTicket(users.customer, "normal", "How do I export");
    expect(await open(users.managerA)).toEqual([]);
    expect(await open(users.managerB)).toEqual([]);
  });

  it("notifies every manager when a ticket is urgent, and only the managers", async () => {
    const customer = callerFor(users.customer, "sup-customer");
    const { id } = await newTicket(users.customer, "urgent", "Cannot sign in");
    for (const manager of [users.managerA, users.managerB]) expect((await open(manager)).map(row => [row.entityId, JSON.parse(row.payload).reason])).toEqual([[id, "urgent"]]);
    expect(await open(users.customer)).toEqual([]);
  });

  it("notifies when the assistant cannot answer (through the router), without adding a second open notice for the same ticket", async () => {
    const customer = callerFor(users.customer, "sup-customer");
    const { id } = await customer.support.create({ tenantId: T, subject: "Billing question", category: "billing", priority: "normal", body: "Why was I charged twice?" }); // assistant on, no articles: defers to a person
    expect((await open(users.managerA)).map(row => row.entityId)).toContain(id);
    const before = (await open(users.managerA)).length;
    await customer.support.reply({ tenantId: T, ticketId: id, body: "Any news on this?" });
    expect((await open(users.managerA)).length).toBe(before); // still one open notice for that ticket
  });

  it("notifies again after the manager acknowledged, when the customer replies", async () => {
    const customer = callerFor(users.customer, "sup-customer");
    const managerA = callerFor(users.managerA, "sup-managerA");
    const { id } = await newTicket(users.customer, "normal", "Report layout");
    expect((await open(users.managerA)).map(row => row.entityId)).not.toContain(id); // not escalated yet
    await reply(users.customer, id, "Following up.");
    const mine = (await open(users.managerA)).filter(row => row.entityId === id);
    expect(mine.map(row => JSON.parse(row.payload).reason)).toEqual(["customer_replied"]);
    const list = await managerA.notifications.list({ tenantId: T });
    const notice = list.find(row => row.entityId === id)!;
    await managerA.notifications.acknowledge({ tenantId: T, notificationId: notice.id });
    expect((await open(users.managerA)).filter(row => row.entityId === id)).toEqual([]);
    await reply(users.customer, id, "Still waiting.");
    expect((await open(users.managerA)).filter(row => row.entityId === id)).toHaveLength(1);
  });

  it("does not notify when the manager is the one replying", async () => {
    const customer = callerFor(users.customer, "sup-customer");
    const managerA = callerFor(users.managerA, "sup-managerA");
    const { id } = await newTicket(users.customer, "normal", "Agent reply case");
    await reply(users.managerA, id, "Here is the answer.");
    expect((await open(users.managerB)).map(row => row.entityId)).not.toContain(id);
  });
});
