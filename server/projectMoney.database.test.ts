import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-17 (205-1): a project's money (budget, cost, cash flow, earned value, contract values, BOQ rates, sub-contract values, tender prices) is for
// project.cashflow.read or for a power over that money, no longer for everyone who opens the project. On a real database, through the real router, as
// the restricted application role; the cash-flow reader holds it on ONE of two projects (scope), and a second company is never reached. Synthetic data only.
const SLUG = "q17-money";
const SLUG_B = "q17-money-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "viewer", "money", "contracts", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q17m-${key}`, name: `Q17 ${key}`, email: `q17m-${key}@q17.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = ["17a00000-0000-4000-8000-000000000001", "17a00000-0000-4000-8000-000000000002"];
const PB = "17b00000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let packageId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "project_commercial_invoices", "tender_packages", "subcontract_contracts", "boq_items", "commitments", "contracts", "cost_entries", "budget_lines", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q17m-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-17 (205-1): a project's money is for project.cashflow.read or a power over that money", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q17m-${key}`, `Q17 ${key}`, `q17m-${key}@q17.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q17m-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q17m-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q17 Money Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q17 Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, currentBudget, actualCost, forecastCost) VALUES (?, ?, 'Q17-1', 'Money one', 'villas', 'SAR', 'active', 900, 300, 950), (?, ?, 'Q17-2', 'Money two', 'villas', 'SAR', 'active', 500, 100, 520), (?, ?, 'Q17-B', 'Other company', 'villas', 'SAR', 'active', 700, 0, 700)", [P[0], tenantId, P[1], tenantId, PB, tenantB]);
    for (const projectId of P) {
      await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (gen_random_uuid(), ?, ?, 'W-1', 'Works', 800)", [tenantId, projectId]);
      await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, costCode, originalAmount, currentAmount) VALUES (gen_random_uuid(), ?, ?, 'C-1', 800, 800)", [tenantId, projectId]);
      await connection.query("INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty, contractValue) VALUES (gen_random_uuid(), ?, ?, 'K-1', 'Main works', 'Synthetic Contractor', 750)", [tenantId, projectId]);
      await connection.query("INSERT INTO commitments (id, tenantId, projectId, code, description, amount) VALUES (gen_random_uuid(), ?, ?, 'CM-1', 'Steel', 120)", [tenantId, projectId]);
      await connection.query("INSERT INTO boq_items (id, tenantId, projectId, code, description, unitOfMeasure, quantity, unitRate, totalAmount, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'B-1', 'Concrete', 'm3', 10, 40, 400, ?)", [tenantId, projectId, ids.owner]);
      await connection.query("INSERT INTO project_commercial_invoices (id, tenantId, projectId, invoiceNumber, invoiceDate, clientName, amount, vatAmount, totalAmount, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'INV-1', now(), 'Synthetic Client', 100, 15, 115, ?)", [tenantId, projectId, ids.owner]);
      await connection.query("INSERT INTO subcontract_contracts (id, tenantId, projectId, code, title, subcontractorName, contractValue, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'S-1', 'Finishes', 'Synthetic Sub', 210, ?)", [tenantId, projectId, ids.owner]);
    }
    packageId = (await connection.query<{ id: string }[]>("INSERT INTO tender_packages (id, tenantId, projectId, packageCode, title, estimateAmount, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'T-1', 'Facade', 330, ?) RETURNING id", [tenantId, P[0], ids.owner]))[0][0]!.id;
    const owner = callerFor("owner");
    const role = (roleCode: string, permissionCodes: string[]) => owner.tenant.createRole({ tenantId, code: roleCode, name: roleCode, productCode: "PROJECT", permissionCodes });
    const read = await role("Q17_READ", ["project.read"]);
    const money = await role("Q17_MONEY", ["project.read", "project.cashflow.read"]);
    const contractsRole = await role("Q17_CONTRACTS", ["project.read", "project.commitment.manage"]);
    const assign = async (key: Key, roleId: string, projectId: string) => {
      const [[member]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, ids[key]]);
      if (member) await owner.tenant.assignMembershipRole({ tenantId, membershipId: member.id, roleId, scopeType: "project", scopeId: projectId });
      else await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId, scopeType: "project", scopeId: projectId });
    };
    for (const projectId of P) await assign("viewer", read.id, projectId);
    // the money reader holds project.cashflow.read on the FIRST project only, and plain project.read on the second
    await assign("money", money.id, P[0]);
    await assign("money", read.id, P[1]);
    await assign("contracts", contractsRole.id, P[0]);
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the cash-flow reader sees the project's money where the permission is held", async () => {
    const controls = await callerFor("money").projects.getControls({ tenantId, projectId: P[0] });
    expect(controls.moneyVisible).toBe(true);
    expect(Number(controls.project.currentBudget)).toBe(900);
    expect(controls.budgets).toHaveLength(1);
    expect(Number(controls.wbs[0]!.plannedValue)).toBe(800);
    expect(controls.cashFlow).not.toBeNull();
    const register = await callerFor("money").projects.list({ tenantId });
    expect(Number(register.find(project => project.id === P[0])!.currentBudget)).toBe(900);
    expect(Number((await callerFor("money").contracts.getProjectRegister({ tenantId, projectId: P[0] })).contracts[0]!.contractValue)).toBe(750);
    expect(Number((await callerFor("money").boq.list({ tenantId, projectId: P[0] }))[0]!.unitRate)).toBe(40);
    expect(Number((await callerFor("money").subcontracts.list({ tenantId, projectId: P[0] }))[0]!.contractValue)).toBe(210);
    expect(await code(callerFor("money").tenders.comparison({ tenantId, projectId: P[0], packageId }))).toBe("no error");
    expect(Number((await callerFor("money").projectInvoices.list({ tenantId, projectId: P[0] }))[0]!.totalAmount)).toBe(115);
  });

  it("NEGATIVE: project.read alone opens the project and its work, but every amount arrives empty and the tender comparison is refused", async () => {
    const controls = await callerFor("viewer").projects.getControls({ tenantId, projectId: P[0] });
    expect(controls.moneyVisible).toBe(false);
    expect(controls.wbs.map(item => item.code)).toEqual(["W-1"]);
    expect(controls.wbs[0]!.plannedValue).toBeNull();
    expect({ budget: controls.project.currentBudget, actual: controls.project.actualCost, forecast: controls.project.forecastCost }).toEqual({ budget: null, actual: null, forecast: null });
    expect({ budgets: controls.budgets, costs: controls.costs, evm: controls.latestEvm, cashFlow: controls.cashFlow }).toEqual({ budgets: [], costs: [], evm: null, cashFlow: null });
    expect((await callerFor("viewer").projects.list({ tenantId })).every(project => project.currentBudget === null)).toBe(true);
    const register = await callerFor("viewer").contracts.getProjectRegister({ tenantId, projectId: P[0] });
    expect(register.contracts.map(row => [row.code, row.contractValue])).toEqual([["K-1", null]]);
    expect(register.commitments.map(row => row.amount)).toEqual([null]);
    expect((await callerFor("viewer").boq.list({ tenantId, projectId: P[0] })).map(row => [row.code, Number(row.quantity), row.unitRate, row.totalAmount])).toEqual([["B-1", 10, null, null]]);
    expect((await callerFor("viewer").subcontracts.list({ tenantId, projectId: P[0] }))[0]!.contractValue).toBeNull();
    const packages = await callerFor("viewer").tenders.packages({ tenantId, projectId: P[0] });
    expect(packages.moneyVisible).toBe(false);
    expect(packages.packages[0]!.estimateAmount).toBeNull();
    expect(await code(callerFor("viewer").tenders.comparison({ tenantId, projectId: P[0], packageId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await callerFor("viewer").projectInvoices.list({ tenantId, projectId: P[0] })).map(row => [row.invoiceNumber, row.amount, row.vatAmount, row.totalAmount])).toEqual([["INV-1", null, null, null]]);
  });

  it("SCOPE: the cash-flow permission held on the first project shows nothing of the second", async () => {
    const second = await callerFor("money").projects.getControls({ tenantId, projectId: P[1] });
    expect(second.moneyVisible).toBe(false);
    expect(second.budgets).toEqual([]);
    const register = await callerFor("money").projects.list({ tenantId });
    expect(register.find(project => project.id === P[1])!.currentBudget).toBeNull();
  });

  it("a power over the money itself is enough for that money only: the commitments manager sees contract values, not the budget", async () => {
    expect(Number((await callerFor("contracts").contracts.getProjectRegister({ tenantId, projectId: P[0] })).contracts[0]!.contractValue)).toBe(750);
    expect(Number((await callerFor("contracts").subcontracts.list({ tenantId, projectId: P[0] }))[0]!.contractValue)).toBe(210);
    const controls = await callerFor("contracts").projects.getControls({ tenantId, projectId: P[0] });
    expect(controls.moneyVisible).toBe(false);
    expect((await callerFor("contracts").boq.list({ tenantId, projectId: P[0] }))[0]!.unitRate).toBeNull();
  });

  it("ISOLATION: the cash-flow reader of one company reaches nothing of another", async () => {
    expect(await code(callerFor("money").projects.getControls({ tenantId: tenantB, projectId: PB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("money").contracts.getProjectRegister({ tenantId, projectId: PB }))).not.toBe("no error");
  });
});
