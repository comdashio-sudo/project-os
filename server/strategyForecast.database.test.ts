import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-21 (c): strategy.forecast through the real router, on a real database, as the restricted role. The model reads the company's APPROVED assumptions
// and its backlog (active or on-hold projects: adjusted contract value − issued or paid invoices). Values computed by hand. Synthetic data only.
const SLUG = "q21-fc";
const SLUG_B = "q21-fc-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "entrant", "approver", "exec", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21f-${key}`, name: `Q21F ${key}`, email: `q21f-${key}@q21f.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P_ACTIVE = "21f00000-0000-4000-8000-000000000001";
const P_OPEN = "21f00000-0000-4000-8000-000000000002";
const P_CLOSED = "21f00000-0000-4000-8000-000000000003";
const P_OTHER = "21f00000-0000-4000-8000-000000000004";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "project_commercial_invoices", "change_requests", "strategy_assumption_changes", "strategy_assumptions"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21f-%'");
}
// the twelve model inputs; all approved except where noted
const MODEL: Array<[string, "percent" | "sar" | "months" | "days" | "count", number]> = [
  ["tendersPerYear", "count", 12], ["averageTenderValue", "sar", 10_000_000], ["winRate", "percent", 25], ["awardLagMonths", "months", 2], ["executionMonths", "months", 12],
  ["advancePercent", "percent", 10], ["retentionPercent", "percent", 5], ["retentionReleaseMonths", "months", 12], ["collectionDays", "days", 60], ["vatPercent", "percent", 15],
  ["grossMarginPercent", "percent", 12], ["overheadsMonthly", "sar", 300_000],
];
const plannedFinish = (monthsAhead: number) => { const now = new Date(Date.now() + 3 * 3_600_000); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 15)).toISOString(); };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (c): the forecast on approved assumptions and the backlog", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21f-${key}`, `Q21F ${key}`, `q21f-${key}@q21f.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21f-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21f-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 Forecast Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q21 Forecast Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    // active: 12,000,000 + 1,000,000 approved change (a rejected 500,000 ignored) − 3,000,000 issued BEFORE VAT (its 450,000 VAT is not contract value; a 2,000,000 draft ignored) = 10,000,000, finishing in 9 months
    // on hold, no planned finish: 4,000,000 left, unscheduled. Closed: never backlog. Another company's active project: never seen.
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, contractValue, plannedFinishAt) VALUES (?, ?, 'Q21F-A', 'Forecast active', 'villas', 'SAR', 'active', 12000000, ?), (?, ?, 'Q21F-H', 'Forecast on hold', 'villas', 'SAR', 'on_hold', 4000000, NULL), (?, ?, 'Q21F-C', 'Forecast closed', 'villas', 'SAR', 'closed', 50000000, ?), (?, ?, 'Q21F-X', 'Other company', 'villas', 'SAR', 'active', 90000000, ?)",
      [P_ACTIVE, tenantId, plannedFinish(9), P_OPEN, tenantId, P_CLOSED, tenantId, plannedFinish(6), P_OTHER, tenantB, plannedFinish(6)]);
    await connection.query("INSERT INTO change_requests (id, tenantId, projectId, changeNumber, title, description, status, contractValueImpact, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'CR-1', 'Synthetic', 'Synthetic', 'approved', 1000000, ?), (gen_random_uuid(), ?, ?, 'CR-2', 'Synthetic', 'Synthetic', 'rejected', 500000, ?)",
      [tenantId, P_ACTIVE, ids.owner, tenantId, P_ACTIVE, ids.owner]);
    await connection.query("INSERT INTO project_commercial_invoices (id, tenantId, projectId, invoiceNumber, invoiceDate, clientName, amount, vatAmount, totalAmount, status, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'INV-1', '2026-06-30', 'Synthetic client', 3000000, 450000, 3450000, 'issued', ?), (gen_random_uuid(), ?, ?, 'INV-2', '2026-07-31', 'Synthetic client', 2000000, 0, 2000000, 'draft', ?)",
      [tenantId, P_ACTIVE, ids.owner, tenantId, P_ACTIVE, ids.owner]);
    const owner = callerFor("owner");
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    const entrantRole = await owner.tenant.createRole({ tenantId, code: "Q21F_ENTRANT", name: "Strategy entrant", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.manage"] });
    const approverRole = await owner.tenant.createRole({ tenantId, code: "Q21F_APPROVER", name: "Strategy approver", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.approve"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.entrant, roleId: entrantRole.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.approver, roleId: approverRole.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.exec, roleId: await templateRole("EXECUTIVE"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P_ACTIVE });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const entrant = callerFor("entrant");
    for (const [assumptionCode, unit, base] of MODEL) {
      const { id } = await entrant.strategy.createAssumption({ tenantId, code: assumptionCode, name: `Synthetic ${assumptionCode}`, unit, sourceType: "internal", sourceNote: "Synthetic internal records", confidence: "medium", reviewFrequency: "quarterly", values: { conservative: base * 0.8, base, optimistic: base * 1.2 } });
      await entrant.strategy.submitAssumption({ tenantId, assumptionId: id });
      await callerFor("approver").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" });
    }
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the backlog is the hand-computed 10,000,000 over 9+1 months, the on-hold project is counted as unscheduled, and the model uses only approved values", async () => {
    const forecast = await callerFor("exec").strategy.forecast({ tenantId, horizonMonths: 24 });
    expect(forecast.horizonMonths).toBe(24);
    expect(forecast.backlog.scheduled).toEqual({ count: 1, remainingValue: 10_000_000 });
    expect(forecast.backlog.unscheduled).toEqual({ count: 1, remainingValue: 4_000_000 });
    const base = forecast.scenarios.base;
    expect(base.missing).toEqual([]);
    expect(base.totals.backlogRevenue).toBe(10_000_000);
    expect(base.months[0].backlogRevenue).toBe(1_000_000);
    expect(base.months[10].backlogRevenue).toBe(0);
    expect(base.used.winRate).toBe(25);
    // the scenarios keep their order: conservative ≤ base ≤ optimistic in revenue
    expect(forecast.scenarios.conservative.totals.revenue).toBeLessThanOrEqual(base.totals.revenue);
    expect(base.totals.revenue).toBeLessThanOrEqual(forecast.scenarios.optimistic.totals.revenue);

    // a draft change does not move a number until it is approved
    const winRate = (await callerFor("exec").strategy.assumptions({ tenantId })).find(item => item.code === "winRate")!;
    await callerFor("entrant").strategy.requestChange({ tenantId, assumptionId: winRate.id, values: { conservative: 30, base: 40, optimistic: 50 }, reason: "Synthetic" });
    expect((await callerFor("exec").strategy.forecast({ tenantId, horizonMonths: 24 })).scenarios.base.totals.revenue).toBe(base.totals.revenue);
    await callerFor("approver").strategy.decideChange({ tenantId, assumptionId: winRate.id, decision: "approve" });
    const after = await callerFor("exec").strategy.forecast({ tenantId, horizonMonths: 24 });
    expect(after.scenarios.base.used.winRate).toBe(40);
    expect(after.scenarios.base.totals.revenue).toBeGreaterThan(base.totals.revenue);
  });

  it("NEGATIVE: a site engineer and another company's owner are refused by the server; the other company's project and the closed project never enter the backlog", async () => {
    expect(await code(callerFor("site").strategy.forecast({ tenantId }))).toMatch(/PROJECT_OS_|FORBIDDEN|permission/i);
    expect(await code(callerFor("ownerB").strategy.forecast({ tenantId }))).toMatch(/PROJECT_OS_|FORBIDDEN|permission/i);
    // the other company reads its own: one active project, no approved assumptions → backlog only, and the model says what is missing
    const other = await callerFor("ownerB").strategy.forecast({ tenantId: tenantB, horizonMonths: 12 });
    expect(other.backlog.scheduled).toEqual({ count: 1, remainingValue: 90_000_000 });
    expect(other.scenarios.base.missing.length).toBeGreaterThan(0);
    const ours = await callerFor("exec").strategy.forecast({ tenantId });
    expect(ours.backlog.scheduled.remainingValue + ours.backlog.unscheduled.remainingValue).toBe(14_000_000);
  });
});
