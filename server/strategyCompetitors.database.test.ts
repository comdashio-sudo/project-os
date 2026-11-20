import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-21 (a), batch 3: competitors and SWOT. A competitor names its source and the date it was gathered; a SWOT point carries its evidence and may name a
// competitor and an assumption of the same company. Nothing is deleted — archived points leave the default list. Real database, real router, restricted
// application role, synthetic data only.
const SLUG = "q21-swot";
const SLUG_B = "q21-swot-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "entrant", "exec", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21w-${key}`, name: `Q21W ${key}`, email: `q21w-${key}@q21w.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21dd0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let competitorId = ""; let assumptionId = ""; let foreignCompetitorId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "strategy_swot_items", "strategy_competitors", "strategy_assumption_changes", "strategy_assumptions"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21w-%'");
}
const rival = (name: string, extra: { sourceNote?: string | null; sourceUrl?: string | null; collectedAt?: string } = {}) => ({
  name, sector: "Residential villas", region: "Synthetic Region", projectTypes: "Villa compounds", sizeValue: 250_000_000, sizeEvidence: "estimate" as const,
  sourceNote: extra.sourceNote === undefined ? "Synthetic: tender board notice" : extra.sourceNote, sourceUrl: extra.sourceUrl ?? null, collectedAt: extra.collectedAt ?? "2026-11-01",
});

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (a) batch 3: competitors and SWOT", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21w-${key}`, `Q21W ${key}`, `q21w-${key}@q21w.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21w-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21w-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 SWOT Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q21 SWOT Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q21W-1', 'SWOT one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    const role = await owner.tenant.createRole({ tenantId, code: "Q21W_ENTRANT", name: "Strategy entrant", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.manage"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.entrant, roleId: role.id, scopeType: "company" });
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.exec, roleId: await templateRole("EXECUTIVE"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    ({ id: assumptionId } = await owner.strategy.createAssumption({ tenantId, code: "winRate", name: "Synthetic win rate", unit: "percent", sourceType: "internal", confidence: "medium", reviewFrequency: "quarterly", values: { conservative: 20, base: 25, optimistic: 30 } }));
    ({ id: foreignCompetitorId } = await callerFor("ownerB").strategy.createCompetitor({ tenantId: tenantB, ...rival("Other company's rival") }));
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the entrant records a competitor with its source and date, and SWOT points with their evidence, linked to it and to an assumption", async () => {
    const entrant = callerFor("entrant");
    ({ id: competitorId } = await entrant.strategy.createCompetitor({ tenantId, ...rival("Synthetic Builders Co.", { sourceUrl: "https://tenders.example.test/notice-17" }) }));
    await entrant.strategy.createSwot({ tenantId, kind: "strength", statement: "Faster villa handover", evidence: "Synthetic: 3 of our last 4 handovers early", assumptionId });
    await entrant.strategy.createSwot({ tenantId, kind: "threat", statement: "Rival undercuts on price", evidence: "Synthetic: lost 2 tenders by under 3%", competitorId, assumptionId });
    const [competitor] = await entrant.strategy.competitors({ tenantId });
    expect([competitor.name, competitor.sizeValue, competitor.sizeEvidence, competitor.sourceUrl, competitor.collectedAt]).toEqual(["Synthetic Builders Co.", 250000000, "estimate", "https://tenders.example.test/notice-17", "2026-11-01"]);
    const swot = await callerFor("exec").strategy.swot({ tenantId });
    expect(swot.map(item => [item.kind, item.competitor?.name ?? null, item.assumption?.code ?? null])).toEqual([["strength", null, "winRate"], ["threat", "Synthetic Builders Co.", "winRate"]]);
    expect((await entrant.strategy.swot({ tenantId, competitorId })).map(item => item.statement)).toEqual(["Rival undercuts on price"]);
    const [[audit]] = await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action IN ('strategy_competitor.created', 'strategy_swot.created')", [tenantId]);
    expect(audit.n).toBe(3);
  });

  it("NEGATIVE: no source, a date still to come, a duplicate name, a point without evidence, or a link to another company's competitor — all refused, nothing written", async () => {
    const entrant = callerFor("entrant");
    expect(await code(entrant.strategy.createCompetitor({ tenantId, ...rival("Sourceless Co.", { sourceNote: null }) }))).toBe("PROJECT_OS_STRATEGY_SOURCE_REQUIRED");
    expect(await code(entrant.strategy.createCompetitor({ tenantId, ...rival("Future Co.", { collectedAt: "2099-01-01" }) }))).toBe("PROJECT_OS_STRATEGY_COLLECTED_AT_FUTURE");
    expect(await code(entrant.strategy.createCompetitor({ tenantId, ...rival("Synthetic Builders Co.") }))).toBe("PROJECT_OS_STRATEGY_COMPETITOR_EXISTS");
    expect(await code(entrant.strategy.createSwot({ tenantId, kind: "weakness", statement: "Thin bench of planners", evidence: "   " }))).toBe("PROJECT_OS_STRATEGY_SWOT_EVIDENCE_REQUIRED");
    expect(await code(entrant.strategy.createSwot({ tenantId, kind: "threat", statement: "Cross-company link", evidence: "Synthetic", competitorId: foreignCompetitorId }))).toBe("PROJECT_OS_STRATEGY_COMPETITOR_NOT_FOUND");
    expect((await entrant.strategy.competitors({ tenantId })).map(item => item.name)).toEqual(["Synthetic Builders Co."]);
    expect(await entrant.strategy.swot({ tenantId })).toHaveLength(2);
  });

  it("archiving leaves the default list and keeps the row; the read-only executive cannot write", async () => {
    const entrant = callerFor("entrant");
    const strength = (await entrant.strategy.swot({ tenantId })).find(item => item.kind === "strength")!;
    await entrant.strategy.updateSwot({ tenantId, swotId: strength.id, kind: "strength", statement: strength.statement, evidence: strength.evidence, archived: true });
    expect((await entrant.strategy.swot({ tenantId })).map(item => item.kind)).toEqual(["threat"]);
    expect((await entrant.strategy.swot({ tenantId, includeArchived: true })).find(item => item.id === strength.id)?.archived).toBe(true);
    expect(await code(callerFor("exec").strategy.createSwot({ tenantId, kind: "opportunity", statement: "New district", evidence: "Synthetic" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("exec").strategy.updateCompetitor({ tenantId, competitorId, ...rival("Renamed") }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("NEGATIVE (sibling of #496): two saves of the same name at the same moment — one is kept, the other gets the translated refusal, not a raw database error", async () => {
    const entrant = callerFor("entrant");
    const pair = async (first: Promise<unknown>, second: Promise<unknown>) => (await Promise.all([code(first), code(second)])).sort();
    expect(await pair(entrant.strategy.createCompetitor({ tenantId, ...rival("Race Co.") }), entrant.strategy.createCompetitor({ tenantId, ...rival("Race Co.") })))
      .toEqual(["PROJECT_OS_STRATEGY_COMPETITOR_EXISTS", "no error"]);
    // a rename race: two different competitors renamed to one free name at once
    const { id: left } = await entrant.strategy.createCompetitor({ tenantId, ...rival("Left Synthetic Co.") });
    const { id: right } = await entrant.strategy.createCompetitor({ tenantId, ...rival("Right Synthetic Co.") });
    expect(await pair(entrant.strategy.updateCompetitor({ tenantId, competitorId: left, ...rival("Merged Synthetic Co.") }), entrant.strategy.updateCompetitor({ tenantId, competitorId: right, ...rival("Merged Synthetic Co.") })))
      .toEqual(["PROJECT_OS_STRATEGY_COMPETITOR_EXISTS", "no error"]);
    expect((await entrant.strategy.competitors({ tenantId })).filter(item => item.name === "Race Co." || item.name === "Merged Synthetic Co.").length).toBe(2);
  });

  it("ISOLATION: the site engineer and another company read nothing", async () => {
    expect(await code(callerFor("site").strategy.competitors({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").strategy.swot({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("ownerB").strategy.competitors({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect((await callerFor("ownerB").strategy.competitors({ tenantId: tenantB })).map(item => item.name)).toEqual(["Other company's rival"]);
  });
});
