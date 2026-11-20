import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-27 (P-115): the project risk register — update (owner, response plan, status, review date), close with a reason, turn into an issue, and a history
// of every change. Writes take pmo.write on the project and readers pmo.read; another company sees nothing and changes nothing; every refusal writes
// nothing. Real database, real router, restricted application role. Synthetic data only.
const SLUG = "q27-risks";
const SLUG_B = "q27-risks-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "27a00000-0000-4000-8000-000000000001";
const P2 = "27a00000-0000-4000-8000-000000000002";
const PB = "27b00000-0000-4000-8000-000000000001";
const KEYS = ["owner", "pmo", "viewer", "site", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q27-${key}`, name: `Q27 ${key}`, email: `q27-${key}@q27.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let pmoMembership = ""; let ownerBMembership = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["risks", "issues", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q27-%'");
}
const roleId = async (tenant: string, roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenant, roleCode]))[0][0]!.id;
const membershipOf = async (tenant: string, key: Key) => (await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenant, ids[key]]))[0][0]!.id;
const writes = async () => (await connection.query<{ n: number }[]>("SELECT (SELECT count(*) FROM issues WHERE tenantId = ?) + (SELECT count(*) FROM audit_logs WHERE tenantId = ? AND (action LIKE 'pmo.risk_%' OR action LIKE 'pmo.issue_%')) AS n", [tenantId, tenantId]))[0][0].n;
const stored = async (id: string) => (await connection.query<{ status: string; probability: number; severity: number; ownerMembershipId: string | null; nextReviewAt: string | null; response: string | null; closureReason: string | null; issueId: string | null; closedAt: Date | null }[]>(
  "SELECT status, probability, severity, ownerMembershipId, to_char(nextReviewAt, 'YYYY-MM-DD') AS \"nextReviewAt\", response, closureReason, issueId, closedAt FROM risks WHERE id = ?", [id]))[0][0];
const newRisk = (projectId: string, riskCode: string, probability = 3, severity = 4) => callerFor("pmo").pmo.createRisk({ tenantId, projectId, code: riskCode, title: `Risk ${riskCode}`, probability, severity });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-27 (P-115): the project risk register — update, close, turn into an issue, history", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q27-${key}`, `Q27 ${key}`, `q27-${key}@q27.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q27-%'");
    for (const key of KEYS) ids[key] = rows.find(item => item.openId === `q27-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q27 Risks Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q27 Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q27-1', 'One', 'villas', 'SAR', 'active'), (?, ?, 'Q27-2', 'Two', 'villas', 'SAR', 'active'), (?, ?, 'Q27-B', 'Other', 'villas', 'SAR', 'active')", [P, tenantId, P2, tenantId, PB, tenantB]);
    await owner.tenant.administration({ tenantId });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pmo, roleId: await roleId(tenantId, "PMO_LEAD"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: await roleId(tenantId, "MANAGEMENT_VIEWER"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await roleId(tenantId, "SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    pmoMembership = await membershipOf(tenantId, "pmo");
    ownerBMembership = await membershipOf(tenantB, "ownerB");
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: an update sets the owner, response plan, review date and status, and its history row holds each change as before → after", async () => {
    const { id } = await newRisk(P, "R-01");
    const result = await callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { ownerMembershipId: pmoMembership, response: "Second supplier on standby", nextReviewAt: "2026-12-01", status: "mitigating", probability: 2 } });
    expect(result.changed.sort()).toEqual(["nextReviewAt", "ownerMembershipId", "probability", "response", "status"]);
    expect(await stored(id)).toMatchObject({ status: "mitigating", probability: 2, severity: 4, ownerMembershipId: pmoMembership, nextReviewAt: "2026-12-01", response: "Second supplier on standby" });
    const history = await callerFor("viewer").pmo.riskHistory({ tenantId, projectId: P, riskId: id });
    expect(history.map(item => item.action)).toEqual(["pmo.risk_updated", "pmo.risk_created"]);
    expect(history[0]!.changes).toMatchObject({ probability: { from: 3, to: 2 }, status: { from: "open", to: "mitigating" }, nextReviewAt: { from: null, to: "2026-12-01" } });
    expect(history[0]!.actorName).toBe("Q27 pmo");
    // the same values again: nothing changes, nothing is written
    const before = await writes();
    expect((await callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { status: "mitigating", probability: 2 } })).changed).toEqual([]);
    expect(await writes()).toBe(before);
  });

  it("POSITIVE: the list carries score, band, the 5×5 matrix of live risks (each cell = its risks) and the overdue review list", async () => {
    const late = await newRisk(P, "R-02", 5, 5);
    await callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: late.id, patch: { nextReviewAt: "2026-01-01" } });
    const shut = await newRisk(P, "R-03", 5, 5);
    await callerFor("pmo").pmo.closeRisk({ tenantId, projectId: P, riskId: shut.id, reason: "Supplier delivered" });
    const list = await callerFor("viewer").pmo.projectRisks({ tenantId, projectId: P });
    const live = list.risks.filter(item => item.status !== "closed");
    for (let p = 1; p <= 5; p += 1) for (let s = 1; s <= 5; s += 1) expect(list.matrix.cells[p - 1]![s - 1]).toBe(live.filter(item => item.probability === p && item.severity === s).length);
    expect(list.matrix.cells[4]![4]).toBe(1); // R-02 only: R-03 is closed
    expect(list.matrix.live).toBe(live.length);
    expect(list.risks.find(item => item.code === "R-02")).toMatchObject({ score: 25, level: "critical", reviewOverdue: true });
    expect(list.overdueIds).toEqual([late.id]);
    expect(list.risks.every(item => item.code.startsWith("R-"))).toBe(true); // this project's risks only
  });

  it("POSITIVE: turning a risk into an issue opens the issue, links it, closes the risk — once", async () => {
    const { id } = await newRisk(P, "R-04");
    const { issueId } = await callerFor("pmo").pmo.convertRiskToIssue({ tenantId, projectId: P, riskId: id, issueCode: "I-04", priority: "high" });
    expect(await stored(id)).toMatchObject({ status: "closed", issueId, closureReason: "issue:I-04" });
    const [[issue]] = await connection.query<{ code: string; title: string; status: string; projectId: string }[]>("SELECT code, title, status, projectId FROM issues WHERE id = ?", [issueId]);
    expect(issue).toEqual({ code: "I-04", title: "Risk R-04", status: "open", projectId: P });
    const before = await writes();
    expect(await code(callerFor("pmo").pmo.convertRiskToIssue({ tenantId, projectId: P, riskId: id, issueCode: "I-05", priority: "high" }))).toBe("PROJECT_OS_RISK_CLOSED");
    // an issue code already used in the project: refused whole — the risk stays open, no issue
    const other = await newRisk(P, "R-05");
    const afterCreate = await writes();
    expect(await code(callerFor("pmo").pmo.convertRiskToIssue({ tenantId, projectId: P, riskId: other.id, issueCode: "I-04", priority: "low" }))).toBe("PROJECT_OS_ISSUE_CODE_EXISTS");
    expect(await stored(other.id)).toMatchObject({ status: "open", issueId: null });
    expect(await writes()).toBe(afterCreate);
    expect(afterCreate - before).toBe(1); // only R-05's own creation row
  });

  it("NEGATIVE: a closed risk is not changed, closing needs a reason, a bad owner or score is refused — and nothing is written", async () => {
    const { id } = await newRisk(P, "R-06");
    const before = await writes();
    expect(await code(callerFor("pmo").pmo.closeRisk({ tenantId, projectId: P, riskId: id, reason: "" }))).not.toBe("no error");
    expect(await code(callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { ownerMembershipId: ownerBMembership } }))).toBe("PROJECT_OS_RISK_OWNER_INVALID");
    expect(await code(callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { probability: 6 } }))).not.toBe("no error");
    expect(await code(callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { status: "closed" } as never }))).not.toBe("no error"); // closing goes through closeRisk
    expect(await writes()).toBe(before);
    await callerFor("pmo").pmo.closeRisk({ tenantId, projectId: P, riskId: id, reason: "No longer applies" });
    const closed = await writes();
    expect(await code(callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_RISK_CLOSED");
    expect(await code(callerFor("pmo").pmo.closeRisk({ tenantId, projectId: P, riskId: id, reason: "Again" }))).toBe("PROJECT_OS_RISK_CLOSED");
    expect(await writes()).toBe(closed);
    expect(await stored(id)).toMatchObject({ status: "closed", closureReason: "No longer applies", probability: 3 });
  });

  it("PERMISSIONS: the read-only viewer reads but does not write; the site engineer neither; nothing is written", async () => {
    const { id } = await newRisk(P, "R-07");
    const before = await writes();
    expect((await callerFor("viewer").pmo.projectRisks({ tenantId, projectId: P })).risks.length).toBeGreaterThan(0);
    expect(await code(callerFor("viewer").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("viewer").pmo.closeRisk({ tenantId, projectId: P, riskId: id, reason: "Viewer tries" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("viewer").pmo.convertRiskToIssue({ tenantId, projectId: P, riskId: id, issueCode: "I-07", priority: "low" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").pmo.projectRisks({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await writes()).toBe(before);
    expect(await stored(id)).toMatchObject({ probability: 3, status: "open" });
  });

  it("ISOLATION: another company cannot read, change or see the history; a risk of project 1 is not found through project 2", async () => {
    const { id } = await newRisk(P, "R-08");
    const before = await writes();
    expect(await code(callerFor("ownerB").pmo.projectRisks({ tenantId, projectId: P }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("ownerB").pmo.updateRisk({ tenantId, projectId: P, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("ownerB").pmo.riskHistory({ tenantId, projectId: P, riskId: id }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    // the other company's owner, in their own company, naming this company's project: not their project
    expect(await code(callerFor("ownerB").pmo.updateRisk({ tenantId: tenantB, projectId: P, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callerFor("ownerB").pmo.updateRisk({ tenantId: tenantB, projectId: PB, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_RISK_NOT_FOUND");
    expect(await code(callerFor("pmo").pmo.updateRisk({ tenantId, projectId: P2, riskId: id, patch: { probability: 1 } }))).toBe("PROJECT_OS_RISK_NOT_FOUND");
    expect(await code(callerFor("pmo").pmo.riskHistory({ tenantId, projectId: P2, riskId: id }))).toBe("PROJECT_OS_RISK_NOT_FOUND");
    expect((await callerFor("ownerB").pmo.projectRisks({ tenantId: tenantB, projectId: PB })).risks).toEqual([]);
    expect(await writes()).toBe(before);
    expect(await stored(id)).toMatchObject({ probability: 3 });
  });
});
