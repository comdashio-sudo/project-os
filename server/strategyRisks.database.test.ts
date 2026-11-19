import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-21 (a), batch 5: the assumption-risk board through the real router — criterion (و): an assumption past its review date shows on the board — and who
// may read it. The ranking and the impact figures are proven on the pure function (server/domain/assumptionRisks.test.ts). Synthetic data only.
const SLUG = "q21-risk";
const SLUG_B = "q21-risk-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "exec", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21r-${key}`, name: `Q21R ${key}`, email: `q21r-${key}@q21r.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21ee0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "strategy_assumption_changes", "strategy_assumptions"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21r-%'");
}
const fields = (name: string, extra: { nextReviewAt?: string; confidence?: "high" | "medium" | "low"; sourceType?: "internal" | "external" | "management" } = {}) => ({
  name, unit: "percent" as const, sourceType: extra.sourceType ?? ("internal" as const), confidence: extra.confidence ?? ("medium" as const), reviewFrequency: "quarterly" as const,
  nextReviewAt: extra.nextReviewAt ?? "2099-01-01", values: { conservative: 20, base: 25, optimistic: 30 },
});

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (a) batch 5: the assumption-risk board", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21r-${key}`, `Q21R ${key}`, `q21r-${key}@q21r.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21r-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21r-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 Risk Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q21 Risk Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q21R-1', 'Risk one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.exec, roleId: await templateRole("EXECUTIVE"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    await owner.strategy.createAssumption({ tenantId, code: "winRate", ...fields("Synthetic win rate", { nextReviewAt: "2026-01-01" }) });
    await owner.strategy.createAssumption({ tenantId, code: "marketGrowth", ...fields("Synthetic market growth", { confidence: "low", sourceType: "management" }) });
    await owner.strategy.createAssumption({ tenantId, code: "collectionDays", ...fields("Synthetic collection days") });
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("(و) POSITIVE: the executive sees the overdue review, the low confidence and the weak source on the board; the clean one carries no flag", async () => {
    const board = await callerFor("exec").strategy.assumptionRisks({ tenantId });
    const flags = Object.fromEntries(board.rows.map(row => [row.key, row.flags]));
    expect(flags.winRate.reviewOverdue).toBe(true);
    expect(flags.marketGrowth).toEqual({ lowConfidence: true, reviewOverdue: false, weakSource: true });
    expect(flags.collectionDays).toEqual({ lowConfidence: false, reviewOverdue: false, weakSource: false });
    expect(board.counts).toEqual({ lowConfidence: 1, reviewOverdue: 1, weakSource: 1 });
    expect(board.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("NEGATIVE / ISOLATION: the site engineer and another company read no board", async () => {
    expect(await code(callerFor("site").strategy.assumptionRisks({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("ownerB").strategy.assumptionRisks({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
