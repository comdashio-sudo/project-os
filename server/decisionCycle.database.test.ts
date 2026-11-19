import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-45 (a, adviser 18-11): the simplified decision cycle — recorded (draft) by the project manager or the PMO on the project or the company manager, with a
// decision owner who is a member of the company → submitted by whoever recorded it → approved or rejected by the owner ALONE (the text, and a reason to
// reject, are mandatory; the date is the server's) → implemented. Nothing goes back; every step writes an audit row in its transaction; every refusal
// writes nothing. Real database, real router, restricted application role. Synthetic data only.
const SLUG = "q45a-decisions";
const SLUG_B = "q45a-decisions-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "45a00000-0000-4000-8000-000000000001";
const P2 = "45a00000-0000-4000-8000-000000000002";
const PB = "45b00000-0000-4000-8000-000000000001";
const KEYS = ["owner", "pm", "pmo", "site", "decider", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q45a-${key}`, name: `Q45 ${key}`, email: `q45a-${key}@q45a.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let deciderMembership = ""; let ownerBMembership = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["decisions", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q45a-%'");
}
const roleId = async (tenant: string, roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenant, roleCode]))[0][0]!.id;
const membershipOf = async (tenant: string, key: Key) => (await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenant, ids[key]]))[0][0]!.id;
const writes = async () => (await connection.query<{ n: number }[]>("SELECT (SELECT count(*) FROM decisions WHERE tenantId = ?) + (SELECT count(*) FROM audit_logs WHERE tenantId = ? AND action LIKE 'executive.decision_%') AS n", [tenantId, tenantId]))[0][0].n;
const row = async (id: string) => (await connection.query<{ status: string; decision: string | null; decidedAt: Date | null }[]>("SELECT status, decision, decidedAt FROM decisions WHERE id = ?", [id]))[0][0];
const base = { problem: "Façade supplier is late", options: "Wait two weeks, or switch supplier" };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-45 (a): the decision cycle — recorded, submitted, decided by its owner alone, implemented", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q45a-${key}`, `Q45 ${key}`, `q45a-${key}@q45a.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q45a-%'");
    for (const key of KEYS) ids[key] = rows.find(item => item.openId === `q45a-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q45 Decisions Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q45 Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q45-1', 'One', 'villas', 'SAR', 'active'), (?, ?, 'Q45-2', 'Two', 'villas', 'SAR', 'active'), (?, ?, 'Q45-B', 'Other', 'villas', 'SAR', 'active')", [P, tenantId, P2, tenantId, PB, tenantB]);
    await owner.tenant.administration({ tenantId });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: await roleId(tenantId, "PROJECT_MANAGER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pmo, roleId: await roleId(tenantId, "PMO_LEAD"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await roleId(tenantId, "SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.decider, roleId: await roleId(tenantId, "EXECUTIVE"), scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    deciderMembership = await membershipOf(tenantId, "decider");
    ownerBMembership = await membershipOf(tenantB, "ownerB");
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("recording: the project manager, the PMO and the company manager record; the site engineer, another company and an owner from another company are refused, and nothing is written", async () => {
    for (const key of ["pm", "pmo", "owner"] as const) expect((await callerFor(key).executive.createDecision({ tenantId, projectId: P, ...base, decisionOwnerMembershipId: deciderMembership })).id).toBeTruthy();
    const before = await writes();
    expect(await code(callerFor("site").executive.createDecision({ tenantId, projectId: P, ...base }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("pm").executive.createDecision({ tenantId, projectId: P2, ...base }))).not.toBe("no error"); // the project manager of P only
    expect(await code(callerFor("ownerB").executive.createDecision({ tenantId, projectId: P, ...base }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("pm").executive.createDecision({ tenantId, projectId: P, ...base, decisionOwnerMembershipId: ownerBMembership }))).toBe("PROJECT_OS_DECISION_OWNER_INVALID");
    expect(await writes()).toBe(before);
  });

  it("POSITIVE: the full cycle, each step by the right person, with an audit row per step; the text and the date are written at the decision", async () => {
    const { id } = await callerFor("pm").executive.createDecision({ tenantId, projectId: P, ...base, recommendation: "Switch supplier", decisionOwnerMembershipId: deciderMembership, costImpact: 12000, scheduleImpactDays: -10, riskImpact: "New supplier unproven" });
    expect(await callerFor("pm").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "submitted" })).toMatchObject({ status: "submitted" });
    expect(await callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "approved", decision: "Switch to the second supplier" })).toMatchObject({ previousStatus: "submitted", status: "approved" });
    const decided = await row(id);
    expect([decided.status, decided.decision, Boolean(decided.decidedAt)]).toEqual(["approved", "Switch to the second supplier", true]);
    expect(await callerFor("pm").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "implemented" })).toMatchObject({ status: "implemented" });
    const [audit] = await connection.query<{ action: string }[]>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ? ORDER BY createdAt", [tenantId, id]);
    expect(audit.map(item => item.action)).toEqual(["executive.decision_created", "executive.decision_transitioned", "executive.decision_transitioned", "executive.decision_transitioned"]);
  });

  it("NEGATIVE: only the recorder submits; only the owner decides; text and a rejection's reason are mandatory; nothing goes back or skips; another project's id is not found — each refused, nothing written", async () => {
    const { id } = await callerFor("pm").executive.createDecision({ tenantId, projectId: P, ...base, decisionOwnerMembershipId: deciderMembership });
    let before = await writes();
    expect(await code(callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "submitted" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("pm").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "approved", decision: "Skip ahead" }))).toBe("PROJECT_OS_DECISION_TRANSITION_INVALID");
    expect(await writes()).toBe(before);
    await callerFor("pm").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "submitted" });
    before = await writes();
    for (const key of ["pm", "owner", "pmo"] as const) expect(await code(callerFor(key).executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "approved", decision: "Not mine to decide" }))).toBe("PROJECT_OS_DECISION_OWNER_ONLY");
    expect(await code(callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "rejected" }))).toBe("PROJECT_OS_DECISION_REASON_REQUIRED");
    expect(await code(callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "approved", decision: " " }))).toBe("PROJECT_OS_DECISION_TEXT_REQUIRED");
    expect(await code(callerFor("decider").executive.transitionDecision({ tenantId, projectId: P2, decisionId: id, nextStatus: "rejected", decision: "Wrong project" }))).toBe("PROJECT_OS_DECISION_NOT_FOUND");
    expect(await code(callerFor("ownerB").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "rejected", decision: "Stranger" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await writes()).toBe(before);
    expect(await callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "rejected", decision: "Cost too high" })).toMatchObject({ status: "rejected" });
    expect((await row(id)).decision).toBe("Cost too high");
    before = await writes();
    for (const next of ["implemented", "submitted", "approved"] as const) expect(await code(callerFor("decider").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: next, decision: "Again" }))).toBe("PROJECT_OS_DECISION_TRANSITION_INVALID");
    expect(await writes()).toBe(before);
  });

  it("NEGATIVE: a decision with no owner cannot be submitted until it names one", async () => {
    const { id } = await callerFor("pm").executive.createDecision({ tenantId, projectId: P, ...base });
    const before = await writes();
    expect(await code(callerFor("pm").executive.transitionDecision({ tenantId, projectId: P, decisionId: id, nextStatus: "submitted" }))).toBe("PROJECT_OS_DECISION_OWNER_REQUIRED");
    expect((await row(id)).status).toBe("draft");
    expect(await writes()).toBe(before);
  });
});
