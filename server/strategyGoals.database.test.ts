import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-21 (a), batch 6 (unit 5): goals, initiatives and variances through the real router, on a real database, as the restricted role. Synthetic data only.
// Criterion (g): a difference between an assumption and the actual is recorded with the decision it calls for, and no goal changes by itself.
const SLUG = "q21-var";
const SLUG_B = "q21-var-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "entrant", "approver", "exec", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21v-${key}`, name: `Q21V ${key}`, email: `q21v-${key}@q21v.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21ee0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let winRateId = ""; let daysId = ""; let draftId = ""; let goalId = ""; let initiativeId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "strategy_variances", "strategy_initiatives", "strategy_goals", "strategy_opportunities", "strategy_assumption_changes", "strategy_assumptions"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21v-%'");
}
const assumption = (assumptionCode: string, unit: "percent" | "days", base: number) => ({
  code: assumptionCode, name: `Synthetic ${assumptionCode}`, unit, sourceType: "internal" as const, sourceNote: "Synthetic internal records", confidence: "medium" as const,
  reviewFrequency: "quarterly" as const, nextReviewAt: "2027-02-01", values: { conservative: base - 5, base, optimistic: base + 5 },
});
const goal = { code: "G-WIN", name: "Synthetic: win more tenders", unit: "percent" as const, targetValue: 35, periodStart: "2026-07-01", periodEnd: "2026-12-31" };
const variances = async () => callerFor("exec").strategy.variances({ tenantId });
const goalTarget = async () => (await callerFor("exec").strategy.goals({ tenantId })).find(item => item.id === goalId)!.targetValue;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (a) batch 6: goals, initiatives and variances", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21v-${key}`, `Q21V ${key}`, `q21v-${key}@q21v.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21v-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21v-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 Variance Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q21 Variance Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q21V-1', 'Variance one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    const entrantRole = await owner.tenant.createRole({ tenantId, code: "Q21V_ENTRANT", name: "Strategy entrant", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.manage"] });
    const approverRole = await owner.tenant.createRole({ tenantId, code: "Q21V_APPROVER", name: "Strategy approver", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.approve"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.entrant, roleId: entrantRole.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.approver, roleId: approverRole.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.exec, roleId: await templateRole("EXECUTIVE"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const entrant = callerFor("entrant");
    // two approved assumptions (the win rate, in percent; collection days) and one left as a draft
    for (const [target, item] of [["win", assumption("winRate", "percent", 25)], ["days", assumption("collectionDays", "days", 60)]] as const) {
      const { id } = await entrant.strategy.createAssumption({ tenantId, ...item });
      await entrant.strategy.submitAssumption({ tenantId, assumptionId: id });
      await callerFor("approver").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" });
      if (target === "win") winRateId = id; else daysId = id;
    }
    ({ id: draftId } = await entrant.strategy.createAssumption({ tenantId, ...assumption("marginDraft", "percent", 12) }));
    // opportunities decided in Q3 2026: one won, two lost (a withdrawn one is no contest) → actual win rate 1 / 3
    for (const [oppCode, outcome, decidedAt] of [["T-1", "won", "2026-07-15"], ["T-2", "lost", "2026-08-10"], ["T-3", "lost", "2026-09-20"], ["T-4", "withdrawn", "2026-09-25"]] as const) {
      const { id } = await entrant.strategy.createOpportunity({ tenantId, code: oppCode, name: `Synthetic tender ${oppCode}`, estimatedValue: 1_000_000, probabilityPercent: 40 });
      await entrant.strategy.decideOpportunity({ tenantId, opportunityId: id, outcome, decidedAt });
    }
    ({ id: goalId } = await entrant.strategy.createGoal({ tenantId, ...goal, assumptionId: winRateId }));
    ({ id: initiativeId } = await entrant.strategy.createInitiative({ tenantId, code: "I-BID", name: "Synthetic: a bid review board", goalId, ownerUserId: ids.exec, dueAt: "2027-03-31" }));
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("(g) POSITIVE: the actual win rate comes from the decided opportunities; both values, the difference and the sample are recorded; the decision «initiative» leaves the goal as it was", async () => {
    const recorded = await callerFor("entrant").strategy.recordVariance({ tenantId, assumptionId: winRateId, periodStart: "2026-07-01", periodEnd: "2026-09-30", actual: { source: "pipeline" }, recurring: true });
    // hand-computed: assumed 25 (the approved base value); actual 1 won of 3 decided = 33.3333; difference +8.3333 = +33.33% of the assumed
    expect(recorded).toMatchObject({ assumedValue: 25, actualValue: 33.3333, sampleSize: 3, difference: 8.3333, percentOfAssumed: 33.33 });
    expect(await callerFor("entrant").strategy.decideVariance({ tenantId, varianceId: recorded.id, decision: "initiative", initiativeId, reason: "Keep the bid board; the target stays" })).toEqual({ id: recorded.id, decision: "initiative" });
    const [row] = (await variances()).filter(item => item.id === recorded.id);
    expect([row.decision, row.initiativeId, row.recurring, row.actualSource, row.decidedByUserId]).toEqual(["initiative", initiativeId, true, "pipeline", ids.entrant]);
    expect(await goalTarget()).toBe(35);
  });

  it("(g) «adjust the assumption» opens a change request in the same step: the approved value stays in force until someone else approves; the goal does not move", async () => {
    const recorded = await callerFor("entrant").strategy.recordVariance({ tenantId, assumptionId: winRateId, periodStart: "2026-01-01", periodEnd: "2026-06-30", actual: { source: "manual", value: 20, sampleSize: 4 }, note: "Synthetic: from an older tender log" });
    expect(recorded).toMatchObject({ assumedValue: 25, actualValue: 20, sampleSize: 4, difference: -5, percentOfAssumed: -20 });
    await callerFor("entrant").strategy.decideVariance({ tenantId, varianceId: recorded.id, decision: "adjust_assumption", values: { conservative: 15, base: 20, optimistic: 25 }, reason: "Two periods below the assumption" });
    const win = (await callerFor("exec").strategy.assumptions({ tenantId })).find(item => item.id === winRateId)!;
    expect([win.status, win.values.base]).toEqual(["approved", 25]);
    // the one who asked does not approve it (#397); someone else does
    expect(await code(callerFor("entrant").strategy.decideChange({ tenantId, assumptionId: winRateId, decision: "approve" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    await callerFor("approver").strategy.decideChange({ tenantId, assumptionId: winRateId, decision: "approve" });
    expect((await callerFor("exec").strategy.assumptions({ tenantId })).find(item => item.id === winRateId)!.values.base).toBe(20);
    expect(await goalTarget()).toBe(35);
  });

  it("NEGATIVE: a decided variance is final; no actual is not a zero; a draft assumption, a non-percent assumption from the pipeline and a future period are refused — nothing written", async () => {
    const [decided] = (await variances()).filter(item => item.decision === "initiative");
    expect(await code(callerFor("entrant").strategy.decideVariance({ tenantId, varianceId: decided.id, decision: "initiative", initiativeId, reason: "again" }))).toBe("PROJECT_OS_STRATEGY_VARIANCE_DECIDED");
    const before = (await variances()).length;
    const entrant = callerFor("entrant");
    expect(await code(entrant.strategy.recordVariance({ tenantId, assumptionId: winRateId, periodStart: "2025-01-01", periodEnd: "2025-06-30", actual: { source: "pipeline" } }))).toBe("PROJECT_OS_STRATEGY_NO_ACTUAL");
    expect(await code(entrant.strategy.recordVariance({ tenantId, assumptionId: draftId, periodStart: "2026-07-01", periodEnd: "2026-09-30", actual: { source: "manual", value: 10, sampleSize: 2 } }))).toBe("PROJECT_OS_STRATEGY_ASSUMPTION_NOT_APPROVED");
    expect(await code(entrant.strategy.recordVariance({ tenantId, assumptionId: daysId, periodStart: "2026-07-01", periodEnd: "2026-09-30", actual: { source: "pipeline" } }))).toBe("PROJECT_OS_STRATEGY_ACTUAL_SOURCE_INVALID");
    expect(await code(entrant.strategy.recordVariance({ tenantId, assumptionId: daysId, periodStart: "2026-07-01", periodEnd: "2099-01-31", actual: { source: "manual", value: 75, sampleSize: 9 } }))).toBe("PROJECT_OS_STRATEGY_PERIOD_INVALID");
    expect((await variances()).length).toBe(before);
  });

  it("NEGATIVE: «adjust» while a change is already waiting is refused and the variance stays undecided (one transaction); an initiative of another company is not found", async () => {
    const entrant = callerFor("entrant");
    const { id: v1 } = await entrant.strategy.recordVariance({ tenantId, assumptionId: daysId, periodStart: "2026-07-01", periodEnd: "2026-09-30", actual: { source: "manual", value: 75, sampleSize: 9 } });
    await entrant.strategy.requestChange({ tenantId, assumptionId: daysId, values: { conservative: 70, base: 75, optimistic: 80 }, reason: "Synthetic: slower payers" });
    expect(await code(entrant.strategy.decideVariance({ tenantId, varianceId: v1, decision: "adjust_assumption", values: { conservative: 65, base: 70, optimistic: 75 }, reason: "x" }))).toBe("PROJECT_OS_STRATEGY_CHANGE_ALREADY_PENDING");
    expect((await variances()).find(item => item.id === v1)!.decision).toBeNull();
    const { id: foreign } = await callerFor("ownerB").strategy.createInitiative({ tenantId: tenantB, code: "I-B", name: "Other company's initiative" });
    expect(await code(entrant.strategy.decideVariance({ tenantId, varianceId: v1, decision: "initiative", initiativeId: foreign, reason: "x" }))).toBe("PROJECT_OS_STRATEGY_INITIATIVE_NOT_FOUND");
    expect(await code(entrant.strategy.createInitiative({ tenantId, code: "I-X", name: "Owned by an outsider", ownerUserId: ids.ownerB }))).toBe("PROJECT_OS_STRATEGY_OWNER_NOT_MEMBER");
  });

  it("a goal moves only when someone edits it, and the audit row carries the target before and after", async () => {
    await callerFor("entrant").strategy.updateGoal({ tenantId, goalId, ...goal, assumptionId: winRateId, targetValue: 40 });
    expect(await goalTarget()).toBe(40);
    const [audit] = (await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'strategy_goal.updated' AND entityId = ?", [tenantId, goalId]))[0];
    expect(JSON.parse(audit.metadata)).toMatchObject({ from: { target: 35 }, to: { target: 40 } });
    // an initiative's progress is kept up to date the same way
    await callerFor("entrant").strategy.updateInitiative({ tenantId, initiativeId, code: "I-BID", name: "Synthetic: a bid review board", goalId, ownerUserId: ids.exec, dueAt: "2027-03-31", status: "in_progress" });
    expect((await callerFor("exec").strategy.initiatives({ tenantId })).find(item => item.id === initiativeId)!.status).toBe("in_progress");
  });

  it("two saves of the same code at the same moment: one is kept, the other gets the translated refusal — not a raw database error (review of #495)", async () => {
    const entrant = callerFor("entrant");
    const pair = async (save: () => Promise<unknown>) => (await Promise.all([code(save()), code(save())])).sort();
    expect(await pair(() => entrant.strategy.createGoal({ tenantId, ...goal, code: "G-RACE" }))).toEqual(["PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS", "no error"]);
    expect(await pair(() => entrant.strategy.createInitiative({ tenantId, code: "I-RACE", name: "Synthetic: a race" }))).toEqual(["PROJECT_OS_STRATEGY_INITIATIVE_CODE_EXISTS", "no error"]);
    expect(await pair(() => entrant.strategy.createOpportunity({ tenantId, code: "T-RACE", name: "Synthetic tender race", estimatedValue: 1, probabilityPercent: 10 }))).toEqual(["PROJECT_OS_STRATEGY_OPPORTUNITY_CODE_EXISTS", "no error"]);
  });

  it("(h) ISOLATION: the executive reads and writes nothing; the site engineer and another company see nothing", async () => {
    expect((await callerFor("exec").strategy.initiatives({ tenantId })).map(item => item.code)).toEqual(["I-BID", "I-RACE"]);
    expect(await code(callerFor("exec").strategy.createGoal({ tenantId, ...goal, code: "G-X" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("exec").strategy.recordVariance({ tenantId, assumptionId: winRateId, periodStart: "2026-07-01", periodEnd: "2026-09-30", actual: { source: "pipeline" } }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").strategy.variances({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("site").strategy.goals({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("ownerB").strategy.variances({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await callerFor("ownerB").strategy.goals({ tenantId: tenantB })).toEqual([]);
  });
});
