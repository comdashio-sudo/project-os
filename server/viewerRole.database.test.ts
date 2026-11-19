import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-39 (P1-07): a management viewer — the Executive template with project.read and pmo.read, company-wide — reads the company and writes nothing.
// Every write and approval below is refused by the server, and nothing is written. Real database, real router, restricted application role.
const SLUG = "q39-viewer";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "39390000-0000-4000-8000-000000000001";
const KEYS = ["owner", "viewer"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q39-${key}`, name: `Q39 ${key}`, email: `q39-${key}@q39.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let wbsId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["progress_entries", "cost_entries", "budget_lines", "activities", "field_reports", "wbs_items", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q39-%'");
}
const writes = async () => (await connection.query<{ n: number }[]>("SELECT (SELECT count(*) FROM wbs_items WHERE tenantId = ?) + (SELECT count(*) FROM budget_lines WHERE tenantId = ?) + (SELECT count(*) FROM cost_entries WHERE tenantId = ?) + (SELECT count(*) FROM activities WHERE tenantId = ?) + (SELECT count(*) FROM progress_entries WHERE tenantId = ?) + (SELECT count(*) FROM field_reports WHERE tenantId = ?) + (SELECT count(*) FROM membership_invitations WHERE tenantId = ?) AS n", Array(7).fill(tenantId)))[0][0].n;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-39: the management viewer reads and never writes or approves", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q39-${key}`, `Q39 ${key}`, `q39-${key}@q39.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q39-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q39-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q39 Viewer Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q39-1', 'Viewer project', 'villas', 'SAR', 'active')", [P, tenantId]);
    ({ id: wbsId } = await owner.wbs.create({ tenantId, projectId: P, code: "1", name: "Works" }));
    await owner.tenant.administration({ tenantId });
    const [[executive]] = await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'EXECUTIVE'", [tenantId]);
    const read = await owner.tenant.createRole({ tenantId, code: "Q39_READ", name: "Project viewer", productCode: "PROJECT", permissionCodes: ["project.read"] });
    const pmo = await owner.tenant.createRole({ tenantId, code: "Q39_PMO", name: "PMO viewer", productCode: "PMO", permissionCodes: ["pmo.read"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: executive.id, scopeType: "company" });
    const [[member]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, ids.viewer]);
    for (const role of [read, pmo]) await owner.tenant.assignMembershipRole({ tenantId, membershipId: member.id, roleId: role.id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("reads the project register, the executive dashboard and the PMO dashboard (positive)", async () => {
    const viewer = callerFor("viewer");
    expect((await viewer.projects.list({ tenantId })).map(project => project.code)).toEqual(["Q39-1"]);
    expect((await viewer.dashboards.executive({ tenantId })).projects).toHaveLength(1);
    expect((await viewer.dashboards.pmo({ tenantId })).projects).toHaveLength(1);
  });

  it("NEGATIVE: every write and approval is refused, and nothing is written", async () => {
    const viewer = callerFor("viewer"); const before = await writes(); const at = new Date(Date.now() - 86_400_000);
    const attempts: Record<string, () => Promise<unknown>> = {
      "wbs.create": () => viewer.wbs.create({ tenantId, projectId: P, code: "2", name: "Not mine" }),
      "budgets.create": () => viewer.budgets.create({ tenantId, projectId: P, costCode: "B1", originalAmount: 100, currentAmount: 100 }),
      "costs.createActual": () => viewer.costs.createActual({ tenantId, projectId: P, amount: 10, incurredAt: at }),
      "activities.create": () => viewer.activities.create({ tenantId, projectId: P, code: "A1", name: "Activity", plannedStartAt: at, plannedFinishAt: new Date() }),
      "progress.create": () => viewer.progress.create({ tenantId, projectId: P, wbsItemId: wbsId, percentComplete: 10, reportedAt: at }),
      "fieldReports.create": () => viewer.fieldReports.create({ tenantId, projectId: P, reportNumber: "FR-1", reportType: "daily", reportedAt: at, shift: "day", workforceCount: 3, summary: "Not mine to write" }),
      "tenant.createRole": () => viewer.tenant.createRole({ tenantId, code: "Q39_X", name: "Escalate", productCode: "PROJECT", permissionCodes: ["project.manage"] }),
      "tenant.administration": () => viewer.tenant.administration({ tenantId }),
    };
    for (const [path, attempt] of Object.entries(attempts)) expect([path, await code(attempt())]).not.toEqual([path, "no error"]);
    expect(await writes()).toBe(before);
  });
});
