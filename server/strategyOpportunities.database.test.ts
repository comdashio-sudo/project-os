import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-21 (a), batch 4: the company's opportunities pipeline through the real router, on a real database, as the restricted role. Synthetic data only.
// The arithmetic of the summary is proven on the pure function (server/domain/strategyPipeline.test.ts); here: what is stored, what is refused, who reads.
const SLUG = "q21-opp";
const SLUG_B = "q21-opp-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "entrant", "exec", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21o-${key}`, name: `Q21O ${key}`, email: `q21o-${key}@q21o.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21ff0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let rivalId = ""; let foreignRivalId = "";
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "strategy_opportunities", "strategy_swot_items", "strategy_competitors"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21o-%'");
}
const opportunity = (codeValue: string, value: number, probability = 50) => ({ code: codeValue, name: `Synthetic tender ${codeValue}`, clientName: "Synthetic Developer", estimatedValue: value, probabilityPercent: probability, expectedAwardAt: "2027-02-01", durationMonths: 18 });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (a) batch 4: the opportunities pipeline", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21o-${key}`, `Q21O ${key}`, `q21o-${key}@q21o.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21o-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21o-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 Opp Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q21 Opp Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q21O-1', 'Opp one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    const role = await owner.tenant.createRole({ tenantId, code: "Q21O_ENTRANT", name: "Strategy entrant", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.manage"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.entrant, roleId: role.id, scopeType: "company" });
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.exec, roleId: await templateRole("EXECUTIVE"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const rival = { sector: "Villas", region: "Synthetic Region", projectTypes: "Villas", sourceNote: "Synthetic: tender board", collectedAt: "2026-11-01" };
    ({ id: rivalId } = await owner.strategy.createCompetitor({ tenantId, name: "Synthetic Rival Co.", ...rival }));
    ({ id: foreignRivalId } = await callerFor("ownerB").strategy.createCompetitor({ tenantId: tenantB, name: "Other company's rival", ...rival }));
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: opportunities are entered, kept up to date while open, decided — and the summary counts them: in play, weighted, actual win rate, lost to", async () => {
    const entrant = callerFor("entrant");
    const { id: a } = await entrant.strategy.createOpportunity({ tenantId, ...opportunity("T-01", 10_000_000, 30) });
    const { id: b } = await entrant.strategy.createOpportunity({ tenantId, ...opportunity("T-02", 4_000_000) });
    const { id: c } = await entrant.strategy.createOpportunity({ tenantId, ...opportunity("T-03", 6_000_000) });
    const { id: d } = await entrant.strategy.createOpportunity({ tenantId, ...opportunity("T-04", 2_000_000) });
    await entrant.strategy.updateOpportunity({ tenantId, opportunityId: b, ...opportunity("T-02", 4_000_000), status: "submitted" });
    await entrant.strategy.decideOpportunity({ tenantId, opportunityId: c, outcome: "won", decidedAt: today() });
    await entrant.strategy.decideOpportunity({ tenantId, opportunityId: d, outcome: "lost", decidedAt: today(), winnerCompetitorId: rivalId, winningValue: 1_900_000 });
    const summary = await callerFor("exec").strategy.pipeline({ tenantId });
    expect(summary.inPlay).toEqual({ count: 2, value: 14_000_000, weighted: 5_000_000 });
    expect([summary.winRate.decided, summary.winRate.won, summary.winRate.byCount, summary.winRate.byValue]).toEqual([2, 1, 50, 75]);
    expect(summary.lostTo).toEqual([{ competitorId: rivalId, competitorName: "Synthetic Rival Co.", count: 1, value: 1_900_000 }]);
    expect((await entrant.strategy.opportunities({ tenantId, status: "submitted" })).map(item => item.code)).toEqual(["T-02"]);
    expect(a).toBeTruthy();
  });

  it("NEGATIVE: a decided opportunity is not edited or decided again; a future date, a winner on a win, another company's competitor, a probability over 100 — refused", async () => {
    const entrant = callerFor("entrant");
    const byCode = async (value: string) => (await entrant.strategy.opportunities({ tenantId })).find(item => item.code === value)!;
    const won = await byCode("T-03"); const open = await byCode("T-01");
    expect(await code(entrant.strategy.updateOpportunity({ tenantId, opportunityId: won.id, ...opportunity("T-03", 9_000_000) }))).toBe("PROJECT_OS_STRATEGY_OPPORTUNITY_DECIDED");
    expect(await code(entrant.strategy.decideOpportunity({ tenantId, opportunityId: won.id, outcome: "lost", decidedAt: today() }))).toBe("PROJECT_OS_STRATEGY_OPPORTUNITY_DECIDED");
    expect(await code(entrant.strategy.decideOpportunity({ tenantId, opportunityId: open.id, outcome: "won", decidedAt: "2099-01-01" }))).toBe("PROJECT_OS_STRATEGY_DECIDED_AT_FUTURE");
    expect(await code(entrant.strategy.decideOpportunity({ tenantId, opportunityId: open.id, outcome: "won", decidedAt: today(), winnerCompetitorId: rivalId }))).toBe("PROJECT_OS_STRATEGY_WINNER_ONLY_WHEN_LOST");
    expect(await code(entrant.strategy.decideOpportunity({ tenantId, opportunityId: open.id, outcome: "lost", decidedAt: today(), winnerCompetitorId: foreignRivalId }))).toBe("PROJECT_OS_STRATEGY_COMPETITOR_NOT_FOUND");
    expect(await code(entrant.strategy.createOpportunity({ tenantId, ...opportunity("T-05", 1, 120) }))).toBe("PROJECT_OS_STRATEGY_VALUE_INVALID");
    expect(await code(entrant.strategy.createOpportunity({ tenantId, ...opportunity("T-01", 1) }))).toBe("PROJECT_OS_STRATEGY_OPPORTUNITY_CODE_EXISTS");
    expect([(await byCode("T-03")).estimatedValue, (await byCode("T-01")).status]).toEqual([6_000_000, "open"]);
  });

  it("the read-only executive writes nothing; the site engineer and another company read nothing", async () => {
    expect(await code(callerFor("exec").strategy.createOpportunity({ tenantId, ...opportunity("T-09", 1) }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").strategy.opportunities({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").strategy.pipeline({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("ownerB").strategy.pipeline({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
