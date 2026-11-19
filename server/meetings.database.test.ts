import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-25 (P-113): project meetings and their minutes, on a real database, through the real router, as the restricted role. The project manager records a
// meeting (attendees, minutes items numbered in order, actions with an owner); a reader of the project reads it and cannot write it; the actions appear in
// their owner's «مهامي»; the next meeting brings forward the OPEN actions only; issued minutes take nothing more; another company and another project see nothing.
const SLUG = "q25-meet"; const SLUG_B = "q25-meet-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P1 = "25aa0000-0000-4000-8000-000000000001"; const P2 = "25aa0000-0000-4000-8000-000000000002";
const KEYS = ["owner", "pm", "site", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q25-${key}`, name: `Q25 ${key}`, email: `q25-${key}@q25.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; const memberships = {} as Record<"pm" | "site", string>;

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["actions", "project_meeting_items", "project_meeting_attendees", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("UPDATE project_meetings SET previousMeetingId = NULL WHERE tenantId = ?", [id]).catch(() => undefined);
      await connection.query("DELETE FROM project_meetings WHERE tenantId = ?", [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q25-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-25: project meetings, their minutes and actions", () => {
  let first = ""; let second = ""; let openAction = ""; let doneAction = "";
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q25-${key}`, `Q25 ${key}`, `q25-${key}@q25.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q25-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q25-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q25 Meetings Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q25 Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q25-1', 'Meetings one', 'villas', 'SAR', 'active'), (?, ?, 'Q25-2', 'Meetings two', 'villas', 'SAR', 'active')", [P1, tenantId, P2, tenantId]);
    await owner.tenant.administration({ tenantId });
    const role = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: await role("PROJECT_MANAGER"), scopeType: "project", scopeId: P1 });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await role("SITE_ENGINEER"), scopeType: "project", scopeId: P1 });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const [members] = await connection.query<{ id: string; userId: number }[]>("SELECT id, userId FROM memberships WHERE tenantId = ?", [tenantId]);
    memberships.pm = members.find(row => row.userId === ids.pm)!.id; memberships.site = members.find(row => row.userId === ids.site)!.id;
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("the project manager records a meeting: attendees (a member and a named guest), minutes items numbered 1, 2, actions with an owner; a reader reads it, and cannot write it", async () => {
    const pm = callerFor("pm");
    ({ id: first } = await pm.meetings.create({ tenantId, projectId: P1, meetingType: "progress", title: "Weekly progress 1", heldAt: new Date("2026-11-10T07:00:00Z"), location: "Site office", attendees: [{ membershipId: memberships.pm, name: "Q25 pm" }, { name: "Consultant engineer (synthetic)", organisation: "Consultant Co. (synthetic)" }] }));
    expect((await pm.meetings.addItem({ tenantId, projectId: P1, meetingId: first, topic: "Block B progress", decision: "Recover two days by Saturday" })).itemNumber).toBe(1);
    expect((await pm.meetings.addItem({ tenantId, projectId: P1, meetingId: first, topic: "Concrete supply" })).itemNumber).toBe(2);
    ({ id: openAction } = await pm.meetings.addAction({ tenantId, projectId: P1, meetingId: first, title: "Send the recovery plan", ownerMembershipId: memberships.site, dueAt: new Date("2026-11-14T00:00:00Z"), priority: "high" }));
    ({ id: doneAction } = await pm.meetings.addAction({ tenantId, projectId: P1, meetingId: first, title: "Confirm the pump booking", ownerMembershipId: memberships.pm, priority: "medium" }));
    const read = await callerFor("site").meetings.get({ tenantId, projectId: P1, meetingId: first });
    expect([read.attendees.length, read.items.map(item => item.topic), read.actions.map(action => [action.title, action.ownerName])]).toEqual([2, ["Block B progress", "Concrete supply"], [["Send the recovery plan", "Q25 site"], ["Confirm the pump booking", "Q25 pm"]]]);
    expect(await code(callerFor("site").meetings.addItem({ tenantId, projectId: P1, meetingId: first, topic: "Not mine to write" }))).toMatch(/PERMISSION_DENIED/);
    expect(await code(callerFor("site").meetings.create({ tenantId, projectId: P1, meetingType: "other", title: "Not mine", heldAt: new Date(), attendees: [] }))).toMatch(/PERMISSION_DENIED/);
    // the action is the owner's: it shows in «مهامي» (Q-45 c)
    expect((await callerFor("site").executive.myWork({ tenantId })).actions.map(action => action.title)).toContain("Send the recovery plan");
  });

  it("the next meeting brings forward the OPEN actions only; the one completed stays behind", async () => {
    await connection.query("UPDATE actions SET status = 'completed' WHERE id = ?", [doneAction]);
    ({ id: second } = await callerFor("pm").meetings.create({ tenantId, projectId: P1, meetingType: "progress", title: "Weekly progress 2", heldAt: new Date("2026-11-17T07:00:00Z"), previousMeetingId: first, attendees: [] }));
    const next = await callerFor("pm").meetings.get({ tenantId, projectId: P1, meetingId: second });
    expect(next.broughtForward.map(action => action.id)).toEqual([openAction]);
    expect((await callerFor("pm").meetings.list({ tenantId, projectId: P1 })).map(row => [row.title, row.openActions])).toEqual([["Weekly progress 2", 0], ["Weekly progress 1", 1]]);
  });

  it("issued minutes take nothing more (item, action), and are not issued twice", async () => {
    const pm = callerFor("pm");
    expect((await pm.meetings.issue({ tenantId, projectId: P1, meetingId: first })).status).toBe("issued");
    expect(await code(pm.meetings.addItem({ tenantId, projectId: P1, meetingId: first, topic: "Late item" }))).toBe("PROJECT_OS_MEETING_ISSUED");
    expect(await code(pm.meetings.addAction({ tenantId, projectId: P1, meetingId: first, title: "Late action", ownerMembershipId: memberships.pm, priority: "low" }))).toBe("PROJECT_OS_MEETING_ISSUED");
    expect(await code(pm.meetings.issue({ tenantId, projectId: P1, meetingId: first }))).toBe("PROJECT_OS_MEETING_ISSUED");
    expect(Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action LIKE 'project.meeting_%' AND entityId = ?", [tenantId, first]))[0][0].n)).toBe(6); // created, 2 items, 2 actions, issued
  });

  it("ISOLATION: another company is refused; a meeting asked for under another project is not found; the database refuses an action tied to a meeting of another project", async () => {
    expect(await code(callerFor("ownerB").meetings.get({ tenantId, projectId: P1, meetingId: first }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("owner").meetings.get({ tenantId, projectId: P2, meetingId: first }))).toBe("PROJECT_OS_MEETING_NOT_FOUND");
    expect(await code(callerFor("owner").meetings.create({ tenantId, projectId: P2, meetingType: "progress", title: "Follows another project's", heldAt: new Date(), previousMeetingId: first, attendees: [] }))).toBe("PROJECT_OS_MEETING_NOT_FOUND");
    await expect(connection.query("INSERT INTO actions (id, tenantId, projectId, meetingId, title, priority, status) VALUES (?, ?, ?, ?, 'Crossing', 'low', 'open')", [crypto.randomUUID(), tenantId, P2, first])).rejects.toThrow(/actions_meeting_fk/);
  });
});
