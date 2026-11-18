import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-45 (c, adviser 18-11): «مهامي» — the actions I own that are open, and the decisions whose next step is mine; and «إنجاز المهمة» by the action's owner
// alone, with an audit row. Each person sees only their own; another company sees nothing. Built on the decision cycle of Q-45 (a).
// (Header of the decision cycle test, reused:) the simplified decision cycle — recorded (draft) by the project manager or the PMO on the project or the company manager, with a
// decision owner who is a member of the company → submitted by whoever recorded it → approved or rejected by the owner ALONE (the text, and a reason to
// reject, are mandatory; the date is the server's) → implemented. Nothing goes back; every step writes an audit row in its transaction; every refusal
// writes nothing. Real database, real router, restricted application role. Synthetic data only.
const SLUG = "q45c-mywork";
const SLUG_B = "q45c-mywork-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "45c00000-0000-4000-8000-000000000001";
const PB = "45d00000-0000-4000-8000-000000000001";
const KEYS = ["owner", "pm", "pmo", "site", "decider", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q45c-${key}`, name: `Q45 ${key}`, email: `q45c-${key}@q45a.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let deciderMembership = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["decisions", "actions", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q45c-%'");
}
const roleId = async (tenant: string, roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenant, roleCode]))[0][0]!.id;
const membershipOf = async (tenant: string, key: Key) => (await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenant, ids[key]]))[0][0]!.id;
const base = { problem: "Façade supplier is late", options: "Wait two weeks, or switch supplier" };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-45 (c): «مهامي» and «إنجاز المهمة»", () => {
  let pmMembership = ""; let siteMembership = "";
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q45c-${key}`, `Q45 ${key}`, `q45c-${key}@q45c.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q45c-%'");
    for (const key of KEYS) ids[key] = rows.find(item => item.openId === `q45c-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q45 MyWork Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q45 Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q45C-1', 'One', 'villas', 'SAR', 'active'), (?, ?, 'Q45C-B', 'Other', 'villas', 'SAR', 'active')", [P, tenantId, PB, tenantB]);
    await owner.tenant.administration({ tenantId });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: await roleId(tenantId, "PROJECT_MANAGER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await roleId(tenantId, "SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.decider, roleId: await roleId(tenantId, "EXECUTIVE"), scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    deciderMembership = await membershipOf(tenantId, "decider"); pmMembership = await membershipOf(tenantId, "pm"); siteMembership = await membershipOf(tenantId, "site");
    // actions: two for the site engineer (one overdue), one for the project manager, one already done for the site engineer (owners set directly: the PMO form has no owner field)
    for (const [title, due] of [["Fix the shoring", -2], ["Order rebar", 5], ["Approve the method statement", 3], ["Old one", -10]] as const) await callerFor("owner").pmo.createAction({ tenantId, projectId: P, title, priority: "high", dueAt: new Date(Date.now() + due * 86_400_000) });
    await connection.query("UPDATE actions SET ownerMembershipId = ? WHERE tenantId = ? AND title IN ('Fix the shoring', 'Order rebar', 'Old one')", [siteMembership, tenantId]);
    await connection.query("UPDATE actions SET ownerMembershipId = ? WHERE tenantId = ? AND title = 'Approve the method statement'", [pmMembership, tenantId]);
    await connection.query("UPDATE actions SET status = 'completed' WHERE tenantId = ? AND title = 'Old one'", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("each person sees only their own open actions, overdue flagged, soonest first; another company sees nothing", async () => {
    const site = await callerFor("site").executive.myWork({ tenantId });
    expect(site.actions.map(action => [action.title, action.overdue, action.projectCode])).toEqual([["Fix the shoring", true, "Q45C-1"], ["Order rebar", false, "Q45C-1"]]);
    expect((await callerFor("pm").executive.myWork({ tenantId })).actions.map(action => action.title)).toEqual(["Approve the method statement"]);
    expect((await callerFor("decider").executive.myWork({ tenantId })).actions).toEqual([]);
    expect(await code(callerFor("ownerB").executive.myWork({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });

  it("decisions appear where the next step is mine: the recorder sees a draft to submit, the owner a submitted one to decide, both an approved one to implement", async () => {
    const { id } = await callerFor("pm").executive.createDecision({ tenantId, projectId: P, ...base, decisionOwnerMembershipId: deciderMembership });
    expect((await callerFor("pm").executive.myWork({ tenantId })).decisions.map(item => [item.id, item.steps])).toEqual([[id, ["submitted"]]]);
    expect((await callerFor("decider").executive.myWork({ tenantId })).decisions).toEqual([]);
    await callerFor("pm").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "submitted" });
    expect((await callerFor("pm").executive.myWork({ tenantId })).decisions).toEqual([]);
    expect((await callerFor("decider").executive.myWork({ tenantId })).decisions.map(item => [item.id, item.steps])).toEqual([[id, ["approved", "rejected"]]]);
    await callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "approved", decision: "Go" });
    for (const key of ["pm", "decider"] as const) expect((await callerFor(key).executive.myWork({ tenantId })).decisions.map(item => item.steps)).toEqual([["implemented"]]);
    expect((await callerFor("site").executive.myWork({ tenantId })).decisions).toEqual([]);
  });

  it("POSITIVE «إنجاز المهمة»: the owner marks it done with an audit row and it leaves the list; NEGATIVE: someone else, twice, another company — refused, nothing written", async () => {
    const [[shoring]] = await connection.query<{ id: string }[]>("SELECT id FROM actions WHERE tenantId = ? AND title = 'Fix the shoring'", [tenantId]);
    const audits = async () => (await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmo.action_completed'", [tenantId]))[0][0].n;
    expect(await code(callerFor("pm").executive.completeMyAction({ tenantId, actionId: shoring.id }))).toBe("PROJECT_OS_ACTION_OWNER_ONLY");
    expect(await code(callerFor("owner").executive.completeMyAction({ tenantId, actionId: shoring.id }))).toBe("PROJECT_OS_ACTION_OWNER_ONLY");
    expect(await code(callerFor("ownerB").executive.completeMyAction({ tenantId, actionId: shoring.id }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await audits()).toBe(0);
    expect(await callerFor("site").executive.completeMyAction({ tenantId, actionId: shoring.id })).toMatchObject({ previousStatus: "open", status: "completed" });
    expect(await audits()).toBe(1);
    expect((await callerFor("site").executive.myWork({ tenantId })).actions.map(action => action.title)).toEqual(["Order rebar"]);
    expect(await code(callerFor("site").executive.completeMyAction({ tenantId, actionId: shoring.id }))).toBe("PROJECT_OS_ACTION_NOT_OPEN");
    expect(await audits()).toBe(1);
  });
});
