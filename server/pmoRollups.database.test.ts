import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-45 (b, adviser 18-11): the PMO dashboard's overdue and critical activities per project, and every signal added up per program and portfolio — each number
// from the database. «Critical» = P6 total float ≤ 0; a project with no float on any activity is null («غير متاح»), never 0. A PMO lead scoped to one
// project sees that project only, and the totals add up only what it may see. Another company sees nothing. Real database, real router, restricted role.
const SLUG = "q45b-pmo";
const SLUG_B = "q45b-pmo-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P1 = "45e00000-0000-4000-8000-000000000001";
const P2 = "45e00000-0000-4000-8000-000000000002";
const KEYS = ["owner", "pmoOne", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q45b-${key}`, name: `Q45B ${key}`, email: `q45b-${key}@q45b.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let tenantId = ""; let programId = ""; let portfolioId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["activities", "actions", "risks", "issues", "purchase_orders", "cost_entries", "budget_lines", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      await connection.query("UPDATE projects SET programId = NULL, portfolioId = NULL WHERE tenantId = ?", [id]).catch(() => undefined);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects", "programs", "portfolios"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q45b-%'");
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-45 (b): PMO overdue and critical activities, and the program and portfolio roll-ups", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q45b-${key}`, `Q45B ${key}`, `q45b-${key}@q45b.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q45b-%'");
    for (const key of KEYS) ids[key] = rows.find(item => item.openId === `q45b-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q45B PMO Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q45B Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q45B-1', 'P6 project', 'villas', 'SAR', 'active'), (?, ?, 'Q45B-2', 'Hand project', 'villas', 'SAR', 'active')", [P1, tenantId, P2, tenantId]);
    ({ id: portfolioId } = await owner.pmo.createPortfolio({ tenantId, code: "PF-1", name: "Housing" }));
    ({ id: programId } = await owner.pmo.createProgram({ tenantId, portfolioId, code: "PG-1", name: "Villas" }));
    for (const projectId of [P1, P2]) await owner.pmo.linkProject({ tenantId, projectId, programId, portfolioId });
    // P1 (from P6): 2 overdue (one of them critical), 1 critical on time, 1 complete-and-past (counts as neither), 1 with positive float
    // P2 (by hand): 1 overdue, no float on any activity → critical «not available»
    const insert = (projectId: string, codeValue: string, status: string, finish: Date | null, float: number | null) => connection.query("INSERT INTO activities (id, tenantId, projectId, code, name, status, plannedFinishAt, totalFloatHours) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), tenantId, projectId, codeValue, codeValue, status, finish, float]);
    await insert(P1, "A1", "in_progress", day(-3), -8);
    await insert(P1, "A2", "not_started", day(-1), 16);
    await insert(P1, "A3", "not_started", day(5), 0);
    await insert(P1, "A4", "completed", day(-9), -4);
    await insert(P1, "A5", "not_started", day(9), 40);
    await insert(P2, "B1", "in_progress", day(-2), null);
    await insert(P2, "B2", "not_started", day(4), null);
    await owner.tenant.administration({ tenantId });
    const [[pmoRole]] = await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'PMO_LEAD'", [tenantId]);
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pmoOne, roleId: pmoRole.id, scopeType: "project", scopeId: P1 });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("per project: overdue = planned finish passed and not complete; critical = float ≤ 0 and not complete; a project with no float is «not available» (null), not 0", async () => {
    const planning = await callerFor("owner").dashboards.pmoPlanning({ tenantId });
    const byCode = Object.fromEntries(planning.activitySignals.map(row => [planning.projects.find(project => project.id === row.projectId)!.code, [row.overdueActivities, row.criticalActivities]]));
    expect(byCode).toEqual({ "Q45B-1": [2, 2], "Q45B-2": [1, null] });
  });

  it("per program and portfolio: the signals of their projects added up; critical adds only the projects where it is known", async () => {
    const planning = await callerFor("owner").dashboards.pmoPlanning({ tenantId });
    for (const totals of [planning.programTotals.find(row => row.programId === programId)!, planning.portfolioTotals.find(row => row.portfolioId === portfolioId)!]) {
      expect(totals).toMatchObject({ projects: 2, overdueActivities: 3, criticalActivities: 2 });
    }
  });

  it("SCOPE: a PMO lead on P1 alone sees P1 only, and the totals add up only what it may see; another company is refused", async () => {
    const planning = await callerFor("pmoOne").dashboards.pmoPlanning({ tenantId });
    expect(planning.activitySignals.map(row => row.projectId)).toEqual([P1]);
    expect(planning.programTotals.find(row => row.programId === programId)).toMatchObject({ projects: 1, overdueActivities: 2, criticalActivities: 2 });
    expect(await code(callerFor("ownerB").dashboards.pmoPlanning({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
  it("procurement and cost (third batch): the order COUNT for every reader; the amounts only for whoever may see the project's money — the PMO lead gets null, never 0", async () => {
    await connection.query("INSERT INTO purchase_orders (id, tenantId, projectId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, 'PO-1', 'Supplier A', now(), 1200, 'SAR', 'Rebar', 'issued', ?), (?, ?, ?, 'PO-2', 'Supplier B', now(), 800, 'SAR', 'Cement', 'received', ?)", [crypto.randomUUID(), tenantId, P1, ids.owner, crypto.randomUUID(), tenantId, P1, ids.owner]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, costCode, originalAmount, currentAmount) VALUES (?, ?, ?, 'B1', 9000, 9000)", [crypto.randomUUID(), tenantId, P1]);
    await connection.query("INSERT INTO cost_entries (id, tenantId, projectId, amount, entryType, status, incurredAt) VALUES (?, ?, ?, 4000, 'actual', 'posted', now()), (?, ?, ?, 999, 'actual', 'draft', now())", [crypto.randomUUID(), tenantId, P1, crypto.randomUUID(), tenantId, P1]);
    const ownerRow = (await callerFor("owner").dashboards.pmoPlanning({ tenantId })).commercialSignals.find(row => row.projectId === P1)!;
    expect(ownerRow).toMatchObject({ openPurchaseOrders: 1, openPurchaseOrderAmount: 1200, budget: 9000, actualCost: 4000 }); // the received order and the draft cost do not count
    const pmoRow = (await callerFor("pmoOne").dashboards.pmoPlanning({ tenantId })).commercialSignals.find(row => row.projectId === P1)!;
    expect(pmoRow).toMatchObject({ openPurchaseOrders: 1, openPurchaseOrderAmount: null, budget: null, actualCost: null });
  });
});
