import fixtureDb from "./testing/pgCompat";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { exampleInput } from "./domain/devPlanner";
import { appRouter } from "./routers";

// Q-11 (b) on a real database, through the real router: who may run the development planner and export it. Synthetic data only.
const SLUG = "q11-planner";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@dp.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "site", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection; let tenantId = ""; let otherTenantId = "";
const PROJECT = "c1500000-0000-4000-8000-000000000001";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["project_planned_labour", "pmc_plan_months", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'dp-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("development planner: run and export (Q-11 b)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`dp-${key}`, `DP ${key}`, `dp-${key}@dp.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'dp-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `dp-${key}`)!.id; callers[key] = callerFor(ids[key], `dp-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Planner Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Other Planner Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DP-1', 'Planner Villas', 'villas', 'SAR', 'active')", [PROJECT, tenantId]);
    await callers.owner.tenant.administration({ tenantId });
    const [[site]] = await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'SITE_ENGINEER'", [tenantId]) as unknown as [{ id: string }[]];
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: site.id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the company owner runs the 120-villa plan and exports it as a workbook of four sheets", async () => {
    const plan = await callers.owner.devPlanner.run({ tenantId, plan: exampleInput() });
    expect(plan.labour.peak).toBe(629);
    const file = await callers.owner.devPlanner.export({ tenantId, plan: exampleInput(), locale: "ar" });
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(file.base64, "base64"));
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["الملخص", "الأنشطة", "العمالة", "المبيعات"]);
    expect(book.worksheets[2].rowCount - 1).toBe(plan.labour.months.length);
  });

  it("NEGATIVE: a site engineer (no planning permission) and another company's owner are refused from the server", async () => {
    expect(await code(callers.site.devPlanner.run({ tenantId, plan: exampleInput() }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.outsider.devPlanner.run({ tenantId, plan: exampleInput() }))).not.toBe("no error");
    expect(await code(callers.outsider.devPlanner.export({ tenantId, plan: exampleInput(), locale: "en" }))).not.toBe("no error");
  });

  it("Q-11 c POSITIVE: the owner applies the plan to a project — planned labour and the cash flow are filled (100%), audited as from the planner", async () => {
    const status = await callers.owner.devPlanner.applyToProject({ tenantId, projectId: PROJECT, plan: exampleInput(), constructionStart: "2027-11" });
    const labour = status.items.find(item => item.code === "labour")!; const cash = status.items.find(item => item.code === "cashFlow")!;
    expect(labour.state).toBe("uploaded");
    expect(Math.max(...(labour.detail.histogram ?? []).map(point => point.workers))).toBe(629);
    expect(cash.state).toBe("uploaded");
    expect(cash.detail.curve?.at(-1)?.cumulative).toBe(1);
    expect(cash.detail.curve?.[0].month).toBe("2027-11-01");
    const [[audit]] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action IN ('project.planned_labour_saved', 'project.cash_flow_saved') AND metadata LIKE '%planner%'", [tenantId]) as unknown as [{ n: number }[]];
    expect(Number(audit.n)).toBe(2);
  });

  it("Q-11 c NEGATIVE: a site engineer, another company, and a bad start month are refused, and nothing is written", async () => {
    const count = async () => Number(((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM project_planned_labour WHERE tenant_id = ?", [tenantId]))[0] as Array<{ n: number }>)[0].n);
    const before = await count();
    expect(await code(callers.site.devPlanner.applyToProject({ tenantId, projectId: PROJECT, plan: exampleInput(), constructionStart: "2027-11" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.outsider.devPlanner.applyToProject({ tenantId, projectId: PROJECT, plan: exampleInput(), constructionStart: "2027-11" }))).not.toBe("no error");
    expect(await code(callers.outsider.devPlanner.applyToProject({ tenantId: otherTenantId, projectId: PROJECT, plan: exampleInput(), constructionStart: "2027-11" }))).not.toBe("no error");
    expect(await code(callers.owner.devPlanner.applyToProject({ tenantId, projectId: PROJECT, plan: exampleInput(), constructionStart: "2027-13" }))).toBe("PROJECT_OS_CONTRACT_DATES_INVALID");
    expect(await count()).toBe(before);
    expect(Number(((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM project_planned_labour WHERE tenant_id = ?", [otherTenantId]))[0] as Array<{ n: number }>)[0].n)).toBe(0);
  });
});

