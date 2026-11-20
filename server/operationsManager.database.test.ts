import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { operationalRoleDefinitions } from "./domain/operationalRoles";
import { appRouter } from "./routers";

// Q-53 (adviser 20-11): the operations manager (OPERATIONS_MANAGER) follows every project of the company — its progress and its cost, budget and cash flow —
// but not its profitability (project.profit.read), the company's margins (executive.read) or anyone's pay, and enters no field data. Proven against the real
// routers on a real database: what the role reads, what the server refuses it, that a second company's project stays out of reach, that the finance manager
// keeps the profitability it had, and that migration 0046 gives project.profit.read to a role that held project.cashflow.read. Synthetic data only.
const SLUGS = ["ops-manager-a", "ops-manager-b"];
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@ops.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const DENIED = "PROJECT_OS_PERMISSION_DENIED";
const NIL = "00000000-0000-4000-8000-000000000000";
const KEYS = ["ownerA", "ownerB", "ops", "finance", "custom", "costEntry"] as const;

let connection: fixtureDb.Connection;
const userIds: Record<string, number> = {};
const callers: Record<string, ReturnType<typeof callerFor>> = {};
let tenantA = ""; let tenantB = "";
const projectA = "f5300000-0000-4000-8000-0000000000a1";
const projectB = "f5300000-0000-4000-8000-0000000000b1";
const roleIds: Record<string, string> = {};
const a = () => ({ tenantId: tenantA, projectId: projectA });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", SLUGS);
  for (const { id } of companies) {
    for (const table of ["cost_entries", "budget_lines", "wbs_items", "field_reports"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM membership_invitations WHERE tenantId = ?", [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'ops53-%'");
}

async function invite(owner: ReturnType<typeof callerFor>, tenantId: string, key: string, roleId: string) {
  const invitation = await owner.tenant.createInvitation({ tenantId, email: `ops53-${key}@ops.example.test`, roleId, scopeType: "company" });
  await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-53: the operations manager's template on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`ops53-${key}`, `Ops ${key}`, `ops53-${key}@ops.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'ops53-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `ops53-${key}`)!.id; callers[key] = callerFor(userIds[key], `ops53-${key}`); }
    ({ tenantId: tenantA } = await callers.ownerA.tenant.create({ legalName: "Ops A Co.", slug: SLUGS[0], packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callers.ownerB.tenant.create({ legalName: "Ops B Co.", slug: SLUGS[1], packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'OPS-A', 'Ops villas A', 'villas', 'SAR', 'active'), (?, ?, 'OPS-B', 'Ops villas B', 'villas', 'SAR', 'active')", [projectA, tenantA, projectB, tenantB]);
    const administration = await callers.ownerA.tenant.administration({ tenantId: tenantA }); // installs the ready-made roles, as the administrator's first visit does
    for (const role of administration.roles) roleIds[role.code] = role.id;
    await callers.ownerB.tenant.administration({ tenantId: tenantB });
    await invite(callers.ownerA, tenantA, "ops", roleIds.OPERATIONS_MANAGER);
    await invite(callers.ownerA, tenantA, "finance", roleIds.FINANCE_MANAGER);
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("the template is installed as a PROJECT role with exactly its powers: cash flow, never profitability, executive, pay or a field write", async () => {
    const administration = await callers.ownerA.tenant.administration({ tenantId: tenantA });
    const role = administration.roles.find(item => item.code === "OPERATIONS_MANAGER")!;
    const definition = operationalRoleDefinitions.find(item => item.code === "OPERATIONS_MANAGER")!;
    expect(role.productCode).toBe("PROJECT");
    const codes = role.permissions.map(item => item.code).sort();
    expect(codes).toEqual([...definition.permissions].sort());
    expect(codes).toContain("project.cashflow.read");
    for (const refused of ["project.profit.read", "executive.read", "project.payroll.sensitive.read", "project.hr.sensitive.read", "project.field.manage", "project.progress.manage", "project.pmc.update", "project.hse.manage", "project.ncr.manage"]) expect(codes, refused).not.toContain(refused);
    // the finance manager, the project manager and the cost controller hold project.cashflow.read and so carry project.profit.read too
    for (const holder of ["FINANCE_MANAGER", "PROJECT_MANAGER", "COST_CONTROLLER"]) expect(administration.roles.find(item => item.code === holder)!.permissions.map(item => item.code), holder).toContain("project.profit.read");
  });

  it("reads every project, its money and its cash flow (positive)", async () => {
    const list = await callers.ops.projects.list({ tenantId: tenantA });
    expect(list.map(item => item.id)).toContain(projectA);
    const controls = await callers.ops.projects.getControls(a());
    expect(controls.moneyVisible).toBe(true);
    const cashFlow = await callers.ops.profitability.cashFlow(a());
    expect(cashFlow).toBeTruthy();
    // the cost of the project (where it came from) stays readable: cost is not profit
    await expect(callers.ops.profitability.costBreakdown(a())).resolves.toBeTruthy();
  });

  it("is refused the project's profitability, its history, the portfolio's profit, the executive dashboard and pay — by the server (negative)", async () => {
    await expect(callers.ops.profitability.project(a())).rejects.toThrow(DENIED);
    await expect(callers.ops.profitability.history(a())).rejects.toThrow(DENIED);
    await expect(callers.ops.profitability.portfolio({ tenantId: tenantA })).rejects.toThrow(DENIED);
    await expect(callers.ops.dashboards.executive({ tenantId: tenantA })).rejects.toThrow(DENIED);
    await expect(callers.ops.employees.payroll.details({ tenantId: tenantA, payrollRunId: NIL })).rejects.toThrow(DENIED);
    await expect(callers.ops.employees.payroll.salaryStructure.get({ tenantId: tenantA, employeeId: NIL })).rejects.toThrow(DENIED);
    // the levels dashboard that carries the EVM carries no expected profit for this role
    const level = await callers.ops.scopes.project(a());
    expect(level.project.expectedProfit).toEqual({ value: null, reason: "MONEY_HIDDEN" });
    // the finance manager keeps the profitability it had before Q-53
    await expect(callers.finance.profitability.project(a())).resolves.toBeTruthy();
    await expect(callers.finance.profitability.history(a())).resolves.toEqual([]);
  });

  it("enters no field data: the daily field report and an HSE observation are refused, and nothing is written", async () => {
    await expect(callers.ops.fieldReports.create({ ...a(), reportNumber: "OPS-FR-1", reportType: "daily", reportedAt: new Date("2026-11-20T08:00:00Z"), shift: "day", workforceCount: 3, summary: "Synthetic site summary" })).rejects.toThrow(DENIED);
    await expect(callers.ops.hse.create({ ...a(), observationNumber: "OPS-HSE-1", title: "Probe", description: "Synthetic observation", category: "safety", severity: "low" })).rejects.toThrow(DENIED);
    const [written] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM field_reports WHERE tenantId = ?", [tenantA]);
    expect(Number(written[0].n)).toBe(0);
  });

  it("stays inside its own company: the other company's project is refused (isolation)", async () => {
    await expect(callers.ops.projects.getControls({ tenantId: tenantB, projectId: projectB })).rejects.toThrow();
    await expect(callers.ops.profitability.cashFlow({ tenantId: tenantB, projectId: projectB })).rejects.toThrow();
    // its own company's id with the other company's project: the project is not this company's
    await expect(callers.ops.profitability.cashFlow({ tenantId: tenantA, projectId: projectB })).rejects.toThrow();
    const list = await callers.ops.projects.list({ tenantId: tenantA });
    expect(list.map(item => item.id)).not.toContain(projectB);
  });

  it("the expected profit on the levels dashboard follows project.profit.read alone: a cost-entry role sees the EVM but not the profit (narrowing), the company owner (who holds it) sees it", async () => {
    const created = await callers.ownerA.tenant.createRole({ tenantId: tenantA, code: "OPS53_COST_ENTRY", name: "Cost entry (synthetic)", productCode: "PROJECT", permissionCodes: ["project.read", "project.cost.enter"] });
    await invite(callers.ownerA, tenantA, "costEntry", (created as { id: string }).id);
    const costEntry = await callers.costEntry.scopes.project(a());
    expect(costEntry.project.expectedProfit).toEqual({ value: null, reason: "MONEY_HIDDEN" });
    expect(costEntry.project.evm).not.toEqual({ value: null, reason: "MONEY_HIDDEN" });
    // the finance manager holds project.profit.read but not project.read, which opens this level; the owner holds both
    const owner = await callers.ownerA.scopes.project(a());
    expect(owner.project.expectedProfit).not.toEqual({ value: null, reason: "MONEY_HIDDEN" });
  });

  it("migration 0046 gives project.profit.read to a role that held project.cashflow.read, with an audit row, and a second run adds nothing", async () => {
    const created = await callers.ownerA.tenant.createRole({ tenantId: tenantA, code: "OPS53_CASH_READER", name: "Cash reader (synthetic)", productCode: "PROJECT", permissionCodes: ["project.read", "project.cashflow.read"] });
    const roleId = (created as { id: string }).id;
    const codesOf = async () => (await connection.query<{ code: string }[]>("SELECT p.code FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permissionId WHERE rp.roleId = ?", [roleId]))[0].map(row => row.code).sort();
    expect(await codesOf()).toEqual(["project.cashflow.read", "project.read"]);
    // the data statements of the migration, as scripts/migrate.mjs runs them (the lock timeout is the runner's), on the owner's connection
    const statements = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0046_profit_read_permission.sql"), "utf8").split("--> statement-breakpoint").map(text => text.replace(/^\s*--.*$/gm, "").trim()).filter(text => text && !/^SET LOCAL/i.test(text));
    expect(statements).toHaveLength(2);
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      for (const statement of statements) await client.query(statement);
      expect(await codesOf()).toEqual(["project.cashflow.read", "project.profit.read", "project.read"]);
      const audits = async () => Number((await client.query("SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND entity_id = $2 AND action = 'role_template.permission_added'", [tenantA, roleId])).rows[0].n);
      expect(await audits()).toBe(1);
      for (const statement of statements) await client.query(statement);
      expect(await audits()).toBe(1);
      // a role without project.cashflow.read is not touched (negative)
      const viewer = (await client.query("SELECT count(*)::int AS n FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.tenant_id = $1 AND r.code = 'MANAGEMENT_VIEWER' AND p.code = 'project.profit.read'", [tenantA])).rows[0].n;
      expect(Number(viewer)).toBe(0);
    } finally { await client.end(); }
    // the role now opens the profitability report through the server (the backfilled power is the one the server checks)
    await invite(callers.ownerA, tenantA, "custom", roleId);
    await expect(callers.custom.profitability.project(a())).resolves.toBeTruthy();
  });
});
