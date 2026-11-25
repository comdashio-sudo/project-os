import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-21 (a), batch 2: the market study. A market indicator is an assumption of the «market» module, classified confirmed / estimate / analysis, and it
// names where it came from (a link or a note). It goes through the same draft → approval path as any assumption. Real database, real router,
// restricted application role, synthetic data only (links on example.test).
const SLUG = "q21-market";
const SLUG_B = "q21-market-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "entrant", "approver", "pm", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21m-${key}`, name: `Q21M ${key}`, email: `q21m-${key}@q21m.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21cc0000-0000-4000-8000-000000000001";
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21m-%'");
}
const indicator = (extra: { name: string; evidence?: "confirmed" | "estimate" | "analysis"; sourceNote?: string | null; sourceUrl?: string | null; base?: number }) => ({
  name: extra.name, unit: "percent" as const, sourceType: "external" as const, sourceNote: extra.sourceNote ?? null, sourceUrl: extra.sourceUrl ?? null, module: "market" as const,
  evidence: extra.evidence ?? "estimate", confidence: "medium" as const, reviewFrequency: "quarterly" as const, nextReviewAt: "2027-03-01",
  values: { conservative: (extra.base ?? 5) - 2, base: extra.base ?? 5, optimistic: (extra.base ?? 5) + 2 },
});
const market = async (key: Key = "owner") => callerFor(key).strategy.assumptions({ tenantId, module: "market" });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (a) batch 2: market indicators with their source and classification", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21m-${key}`, `Q21M ${key}`, `q21m-${key}@q21m.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21m-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21m-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 Market Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q21 Market Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q21M-1', 'Market one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    const entrant = await owner.tenant.createRole({ tenantId, code: "Q21M_ENTRANT", name: "Market entrant", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.manage"] });
    const approver = await owner.tenant.createRole({ tenantId, code: "Q21M_APPROVER", name: "Market approver", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.approve"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.entrant, roleId: entrant.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.approver, roleId: approver.id, scopeType: "company" });
    const [[pmRole]] = await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'PROJECT_MANAGER'", [tenantId]);
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: pmRole.id, scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: market indicators are entered with their classification and source, and the market list holds them alone", async () => {
    const entrant = callerFor("entrant");
    await entrant.strategy.createAssumption({ tenantId, code: "marketGrowth", ...indicator({ name: "Synthetic construction market growth", evidence: "confirmed", sourceUrl: "https://stats.example.test/construction-2026", base: 6 }) });
    await entrant.strategy.createAssumption({ tenantId, code: "villaDemand", ...indicator({ name: "Synthetic villa demand", evidence: "estimate", sourceNote: "Synthetic sales-team survey, Q3" }) });
    await entrant.strategy.createAssumption({ tenantId, code: "winRate", name: "Synthetic win rate", unit: "percent", sourceType: "internal", sourceNote: null, confidence: "medium", reviewFrequency: "quarterly", values: { conservative: 20, base: 25, optimistic: 30 } });
    expect((await market()).map(item => [item.code, item.module, item.evidence, item.sourceUrl, item.sourceNote])).toEqual([
      ["marketGrowth", "market", "confirmed", "https://stats.example.test/construction-2026", null],
      ["villaDemand", "market", "estimate", null, "Synthetic sales-team survey, Q3"],
    ]);
    const general = await callerFor("owner").strategy.assumptions({ tenantId, module: "general" });
    expect(general.map(item => [item.code, item.module, item.evidence])).toEqual([["winRate", "general", "estimate"]]);
  });

  it("NEGATIVE: a market indicator without a source, or with a link that is not https, is refused and writes nothing", async () => {
    const entrant = callerFor("entrant");
    expect(await code(entrant.strategy.createAssumption({ tenantId, code: "noSource", ...indicator({ name: "Synthetic sourceless figure" }) }))).toBe("PROJECT_OS_STRATEGY_MARKET_SOURCE_REQUIRED");
    expect(await code(entrant.strategy.createAssumption({ tenantId, code: "plainHttp", ...indicator({ name: "Synthetic insecure link", sourceUrl: "http://stats.example.test/x" }) }))).toBe("PROJECT_OS_STRATEGY_SOURCE_URL_INVALID");
    // a draft cannot lose its source either
    const { id } = (await market()).find(item => item.code === "villaDemand")!;
    expect(await code(entrant.strategy.updateDraft({ tenantId, assumptionId: id, ...indicator({ name: "Synthetic villa demand", sourceNote: "   " }) }))).toBe("PROJECT_OS_STRATEGY_MARKET_SOURCE_REQUIRED");
    expect((await market()).map(item => item.code)).toEqual(["marketGrowth", "villaDemand"]);
  });

  it("the classification is corrected on a draft and kept through approval", async () => {
    const entrant = callerFor("entrant");
    const { id } = (await market()).find(item => item.code === "villaDemand")!;
    await entrant.strategy.updateDraft({ tenantId, assumptionId: id, ...indicator({ name: "Synthetic villa demand", evidence: "analysis", sourceNote: "Synthetic: derived from permits and sales" }) });
    await entrant.strategy.submitAssumption({ tenantId, assumptionId: id });
    await callerFor("approver").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" });
    const approved = (await market()).find(item => item.code === "villaDemand")!;
    expect([approved.status, approved.evidence, approved.sourceNote]).toEqual(["approved", "analysis", "Synthetic: derived from permits and sales"]);
  });

  it("ISOLATION: the project manager and another company read no market indicator", async () => {
    expect(await code(market("pm"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(market("ownerB"))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
