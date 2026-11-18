import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-39 (adviser 18-11): the ready-made «مشاهد الإدارة» (MANAGEMENT_VIEWER) template — project.read and pmo.read only. Held alone, company-wide, it reads the
// project register, a project's pages and the PMO dashboard (positive); it sees no money (budget, actual and forecast null, moneyVisible false), no pay
// and not the executive dashboard; and every write and approval is refused with nothing written (negative). A company that existed before the template
// gets it at the next administration read, with an audit row per permission (the template-sync path, no migration), and a second company is untouched.
// Real database, real router, restricted application role. Synthetic data only.
const SLUG = "q39-mv";
const SLUG_B = "q39-mv-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "39a90000-0000-4000-8000-000000000001";
const PB = "39b90000-0000-4000-8000-000000000001";
const KEYS = ["owner", "viewer", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q39mv-${key}`, name: `Q39 ${key}`, email: `q39mv-${key}@q39mv.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let wbsId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["progress_entries", "cost_entries", "budget_lines", "activities", "field_reports", "wbs_items", "audit_logs", "membership_invitations", "risks", "decisions", "evm_snapshots", "change_requests"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q39mv-%'");
}
const writes = async () => (await connection.query<{ n: number }[]>("SELECT (SELECT count(*) FROM wbs_items WHERE tenantId = ?) + (SELECT count(*) FROM budget_lines WHERE tenantId = ?) + (SELECT count(*) FROM cost_entries WHERE tenantId = ?) + (SELECT count(*) FROM activities WHERE tenantId = ?) + (SELECT count(*) FROM progress_entries WHERE tenantId = ?) + (SELECT count(*) FROM field_reports WHERE tenantId = ?) + (SELECT count(*) FROM membership_invitations WHERE tenantId = ?) + (SELECT count(*) FROM roles WHERE tenantId = ?) AS n", Array(8).fill(tenantId)))[0][0].n;
const templatePermissions = async (tenant: string) => (await connection.query<{ code: string }[]>("SELECT p.code FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId INNER JOIN permissions p ON p.id = rp.permissionId WHERE r.tenantId = ? AND r.code = 'MANAGEMENT_VIEWER' ORDER BY p.code", [tenant]))[0].map(row => row.code);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-39: the «مشاهد الإدارة» template reads the projects and the PMO view, sees no money, writes and approves nothing", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q39mv-${key}`, `Q39 ${key}`, `q39mv-${key}@q39mv.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q39mv-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q39mv-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q39 MV Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q39 MV Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, currentBudget, actualCost, forecastCost) VALUES (?, ?, 'Q39M-1', 'Viewer project', 'villas', 'SAR', 'active', 900, 400, 950), (?, ?, 'Q39M-B', 'Other company', 'villas', 'SAR', 'active', 700, 100, 700)", [P, tenantId, PB, tenantB]);
    ({ id: wbsId } = await callerFor("owner").wbs.create({ tenantId, projectId: P, code: "1", name: "Works" }));
    // the company as it was BEFORE this change: no MANAGEMENT_VIEWER role at all
    await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ? AND code = 'MANAGEMENT_VIEWER')", [tenantId]);
    await connection.query("DELETE FROM roles WHERE tenantId = ? AND code = 'MANAGEMENT_VIEWER'", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("a new company is born with the template, carrying exactly pmo.read and project.read", async () => {
    expect(await templatePermissions(tenantB)).toEqual(["pmo.read", "project.read"]);
  });

  it("POSITIVE (rollout): an existing company gets the template at the next administration read, with an audit row per permission; the other company is untouched", async () => {
    expect(await templatePermissions(tenantId)).toEqual([]);
    const auditB = async () => (await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = 'role_template.permission_added'", [tenantB]))[0][0].n;
    const beforeB = await auditB();
    await callerFor("owner").tenant.administration({ tenantId });
    expect(await templatePermissions(tenantId)).toEqual(["pmo.read", "project.read"]);
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'role_template.permission_added'", [tenantId]);
    expect(audit.map(row => JSON.parse(row.metadata) as { role: string; permission: string }).filter(row => row.role === "MANAGEMENT_VIEWER").map(row => row.permission).sort()).toEqual(["pmo.read", "project.read"]);
    expect(await auditB()).toBe(beforeB);
    const [[role]] = await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'MANAGEMENT_VIEWER'", [tenantId]);
    await callerFor("owner").tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: role.id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });

  it("POSITIVE: reads the project register, the project's controls and the PMO dashboard", async () => {
    const viewer = callerFor("viewer");
    expect((await viewer.projects.list({ tenantId })).map(project => project.code)).toEqual(["Q39M-1"]);
    expect((await viewer.projects.getControls({ tenantId, projectId: P })).project.code).toBe("Q39M-1");
    expect((await viewer.dashboards.pmo({ tenantId })).projects).toHaveLength(1);
  });

  it("NEGATIVE (money): no budget, actual or forecast in the register or the controls; no cash flow, no profitability, no executive dashboard", async () => {
    // not vacuous: the company owner sees the same project's money
    expect(Number((await callerFor("owner").projects.list({ tenantId }))[0].currentBudget)).toBe(900);
    const viewer = callerFor("viewer");
    const [listed] = await viewer.projects.list({ tenantId });
    expect([listed.currentBudget, listed.actualCost, listed.forecastCost]).toEqual([null, null, null]);
    const controls = await viewer.projects.getControls({ tenantId, projectId: P });
    expect(controls.moneyVisible).toBe(false);
    expect([controls.project.currentBudget, controls.project.actualCost, controls.project.forecastCost]).toEqual([null, null, null]);
    expect(controls.budgets).toEqual([]);
    expect(controls.costs).toEqual([]);
    expect(await code(viewer.dashboards.executive({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(viewer.profitability.portfolio({ tenantId }))).not.toBe("no error");
  });

  it("NEGATIVE (money, review on #385): the PMO dashboard gives the viewer no EAC or VAC and no cost in an open change's line; the company owner still sees both", async () => {
    await connection.query("INSERT INTO evm_snapshots (id, tenantId, projectId, periodAt, pv, ev, ac, bac, cv, sv, eac, etc, vac, cpi, spi, eacMethod) VALUES (?, ?, ?, now(), 100, 90, 95, 1000, -5, -10, 1055, 960, -55, 0.947, 0.9, ?)", [crypto.randomUUID(), tenantId, P, "manual"]);
    await connection.query("INSERT INTO change_requests (id, tenantId, projectId, changeNumber, title, description, impactScheduleDays, impactCost, currency, status, createdByUserId) VALUES (?, ?, ?, 'CR-1', 'Extra slab', 'A synthetic change', 20, 50000, 'SAR', 'submitted', ?)", [crypto.randomUUID(), tenantId, P, ids.owner]);
    const read = async (key: Key) => { const dashboard = await callerFor(key).dashboards.pmo({ tenantId }); return { evm: dashboard.planningOverview.projects.find(project => project.id === P)!.evm, change: dashboard.todayExceptions.find(item => item.id.startsWith("change:")) }; };
    const viewer = await read("viewer");
    expect([viewer.evm?.eac, viewer.evm?.vac]).toEqual([null, null]);
    expect(viewer.evm?.cpi).toBeCloseTo(0.947, 3); // ratios stay
    expect(viewer.change?.detail).toBe("CR-1 · Extra slab · 20d");
    const owner = await read("owner");
    expect([owner.evm?.eac, owner.evm?.vac]).toEqual([1055, -55]);
    expect(owner.change?.detail).toContain("50000");
    // sibling path (same review): the levels opened with pmo.read / project.read carry no amounts for the viewer — EVM, expected profit, stock value
    for (const level of [(await callerFor("viewer").scopes.portfolio({ tenantId })).projects[0], (await callerFor("viewer").scopes.project({ tenantId, projectId: P })).project]) {
      expect([level.evm, level.expectedProfit, level.stock.value]).toEqual([{ value: null, reason: "MONEY_HIDDEN" }, { value: null, reason: "MONEY_HIDDEN" }, null]);
    }
    expect((await callerFor("owner").scopes.project({ tenantId, projectId: P })).project.stock.value).toBe(0);
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
      "tenant.createRole": () => viewer.tenant.createRole({ tenantId, code: "Q39M_X", name: "Escalate", productCode: "PROJECT", permissionCodes: ["project.manage"] }),
      "tenant.administration": () => viewer.tenant.administration({ tenantId }),
      "executive.createDecision": () => viewer.executive.createDecision({ tenantId, projectId: P, problem: "Not mine to decide", options: "None for the viewer" }),
    };
    for (const [path, attempt] of Object.entries(attempts)) expect([path, await code(attempt())]).not.toEqual([path, "no error"]);
    expect(await writes()).toBe(before);
  });

  it("ISOLATION: the viewer reaches nothing of another company", async () => {
    expect(await code(callerFor("viewer").projects.list({ tenantId: tenantB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
