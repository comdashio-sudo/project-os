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
let connection: fixtureDb.Connection; let tenantId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
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
    await callers.outsider.tenant.create({ legalName: "Other Planner Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
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
});
