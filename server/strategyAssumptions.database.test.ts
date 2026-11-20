import pg from "pg";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { approvedValues, type ModelAssumption } from "./domain/strategyModel";
import { appRouter } from "./routers";

// Q-21 (a), batch 1 (docs/proposals/q21-strategy-mapping.md): the register of strategy assumptions. Criteria of the item tested here:
//   (a) changing an approved assumption without approval is refused by the server; an approved change writes one history row with both values, the reason,
//       who asked and who approved, and that row cannot be changed or deleted — by the database itself, the table owner included;
//   (b) at the register: a draft never reaches the values the model reads;
//   (h) isolation: the site engineer, the project manager and another company see nothing (refused by the server).
// Plus separation of duties: whoever entered, sent or asked does not approve. On a real database, through the real router, as the restricted role. Synthetic data only.
const SLUG = "q21-strat";
const SLUG_B = "q21-strat-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "entrant", "approver", "exec", "pm", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q21s-${key}`, name: `Q21 ${key}`, email: `q21s-${key}@q21.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21aa0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let winId = "";

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
  await connection.query("DELETE FROM users WHERE openId LIKE 'q21s-%'");
}
const fields = (base: number, extra: Partial<{ name: string }> = {}) => ({ name: extra.name ?? "Synthetic tender win rate", unit: "percent" as const, sourceType: "internal" as const, sourceNote: "Last 3 years of synthetic tenders", confidence: "medium" as const, reviewFrequency: "quarterly" as const, nextReviewAt: "2027-02-01", values: { conservative: base - 5, base, optimistic: base + 5 } });
const register = async (key: Key = "owner") => callerFor(key).strategy.assumptions({ tenantId });
const byCode = async (assumptionCode: string) => (await register()).find(item => item.code === assumptionCode)!;
const history = async () => callerFor("owner").strategy.assumptionChanges({ tenantId, assumptionId: winId });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-21 (a): the register of strategy assumptions, approval and its append-only history", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q21s-${key}`, `Q21 ${key}`, `q21s-${key}@q21.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q21s-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q21s-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q21 Strategy Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q21 Strategy Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q21-1', 'Strategy one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    const entrantRole = await owner.tenant.createRole({ tenantId, code: "Q21_ENTRANT", name: "Strategy entrant", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.manage"] });
    const approverRole = await owner.tenant.createRole({ tenantId, code: "Q21_APPROVER", name: "Strategy approver", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.approve"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.entrant, roleId: entrantRole.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.approver, roleId: approverRole.id, scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.exec, roleId: await templateRole("EXECUTIVE"), scopeType: "company" });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: await templateRole("PROJECT_MANAGER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the entrant enters a draft, corrects it and sends it; the entrant cannot approve it; the approver approves — one history row with the values", async () => {
    ({ id: winId } = await callerFor("entrant").strategy.createAssumption({ tenantId, code: "winRate", ...fields(20) }));
    await callerFor("entrant").strategy.updateDraft({ tenantId, assumptionId: winId, ...fields(25) });
    expect((await callerFor("entrant").strategy.submitAssumption({ tenantId, assumptionId: winId })).status).toBe("pending");
    expect(await code(callerFor("entrant").strategy.decideAssumption({ tenantId, assumptionId: winId, decision: "approve" }))).toBe("PROJECT_OS_PERMISSION_DENIED"); // no strategy.approve at all
    expect(await code(callerFor("owner").strategy.updateDraft({ tenantId, assumptionId: winId, ...fields(99) }))).toBe("PROJECT_OS_STRATEGY_ASSUMPTION_NOT_DRAFT");
    expect((await callerFor("approver").strategy.decideAssumption({ tenantId, assumptionId: winId, decision: "approve" })).status).toBe("approved");
    const win = await byCode("winRate");
    expect([win.status, win.values]).toEqual(["approved", { conservative: 20, base: 25, optimistic: 30 }]);
    const rows = await history();
    expect(rows.map(row => [row.kind, row.previous, row.next, row.requestedByUserId, row.decidedByUserId])).toEqual([["approved", null, { conservative: 20, base: 25, optimistic: 30 }, ids.entrant, ids.approver]]);
  });

  it("SEPARATION: whoever entered or sent a draft does not approve it, even holding strategy.approve (the owner here)", async () => {
    const { id } = await callerFor("owner").strategy.createAssumption({ tenantId, code: "collectionDays", ...fields(60, { name: "Synthetic collection days" }) });
    await callerFor("owner").strategy.submitAssumption({ tenantId, assumptionId: id });
    expect(await code(callerFor("owner").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" }))).toBe("PROJECT_OS_STRATEGY_SELF_APPROVAL");
    expect((await byCode("collectionDays")).status).toBe("pending");
  });

  it("SEPARATION (review of #397): whoever corrected a draft's values does not approve it — the entrant sends it, the editor is refused, someone else approves", async () => {
    const { id } = await callerFor("entrant").strategy.createAssumption({ tenantId, code: "probeEdit", ...fields(20, { name: "Synthetic probe" }) });
    await callerFor("owner").strategy.updateDraft({ tenantId, assumptionId: id, ...fields(99, { name: "Synthetic probe" }) });
    await callerFor("entrant").strategy.submitAssumption({ tenantId, assumptionId: id });
    expect(await code(callerFor("owner").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" }))).toBe("PROJECT_OS_STRATEGY_SELF_APPROVAL");
    expect((await byCode("probeEdit")).status).toBe("pending");
    // returning it stays open to the editor; once sent again, the editor still may not approve the values they wrote
    expect((await callerFor("owner").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "return" })).status).toBe("draft");
    await callerFor("entrant").strategy.submitAssumption({ tenantId, assumptionId: id });
    expect(await code(callerFor("owner").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" }))).toBe("PROJECT_OS_STRATEGY_SELF_APPROVAL");
    // POSITIVE: an approver who neither entered, corrected nor sent it approves it
    expect((await callerFor("approver").strategy.decideAssumption({ tenantId, assumptionId: id, decision: "approve" })).status).toBe("approved");
  });

  it("NEGATIVE (a): an approved assumption is not edited directly — refused, nothing written; a read-only executive writes nothing", async () => {
    expect(await code(callerFor("entrant").strategy.updateDraft({ tenantId, assumptionId: winId, ...fields(40) }))).toBe("PROJECT_OS_STRATEGY_ASSUMPTION_APPROVED_LOCKED");
    expect(await code(callerFor("exec").strategy.createAssumption({ tenantId, code: "execTry", ...fields(1) }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("exec").strategy.requestChange({ tenantId, assumptionId: winId, values: { conservative: 1, base: 1, optimistic: 1 }, reason: "no" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await byCode("winRate")).values.base).toBe(25);
    expect(await history()).toHaveLength(1);
  });

  it("(a) a change request: the approved value stays in force until someone else approves; then one row records both values, the reason, who asked and who approved", async () => {
    await callerFor("entrant").strategy.requestChange({ tenantId, assumptionId: winId, values: { conservative: 25, base: 30, optimistic: 35 }, reason: "Synthetic: last four tenders won" });
    const pending = await byCode("winRate");
    expect([pending.values.base, pending.pendingChange?.values.base, pending.pendingChange?.reason]).toEqual([25, 30, "Synthetic: last four tenders won"]);
    expect(await code(callerFor("entrant").strategy.requestChange({ tenantId, assumptionId: winId, values: { conservative: 1, base: 1, optimistic: 1 }, reason: "again" }))).toBe("PROJECT_OS_STRATEGY_CHANGE_ALREADY_PENDING");
    expect((await callerFor("approver").strategy.decideChange({ tenantId, assumptionId: winId, decision: "approve" })).changed).toBe(true);
    const win = await byCode("winRate");
    expect([win.values, win.pendingChange]).toEqual([{ conservative: 25, base: 30, optimistic: 35 }, null]);
    const [latest] = await history();
    expect([latest.kind, latest.previous?.base, latest.next?.base, latest.reason, latest.requestedByUserId, latest.decidedByUserId]).toEqual(["changed", 25, 30, "Synthetic: last four tenders won", ids.entrant, ids.approver]);
    const [[audit]] = await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'strategy_assumption.changed'", [tenantId, winId]);
    expect(audit.n).toBe(1);
  });

  it("a change asked by the owner is not approved by the owner; refused by someone else, the values stay and the refusal is recorded too", async () => {
    await callerFor("owner").strategy.requestChange({ tenantId, assumptionId: winId, values: { conservative: 40, base: 45, optimistic: 50 }, reason: "Synthetic optimism" });
    expect(await code(callerFor("owner").strategy.decideChange({ tenantId, assumptionId: winId, decision: "approve" }))).toBe("PROJECT_OS_STRATEGY_SELF_APPROVAL");
    expect((await callerFor("approver").strategy.decideChange({ tenantId, assumptionId: winId, decision: "reject" })).changed).toBe(false);
    expect((await byCode("winRate")).values.base).toBe(30);
    const [latest] = await history();
    expect([latest.kind, latest.previous?.base, latest.next?.base, latest.requestedByUserId, latest.decidedByUserId]).toEqual(["change_rejected", 30, 45, ids.owner, ids.approver]);
  });

  it("(a) the history is append-only in the database: UPDATE, DELETE and TRUNCATE are refused even for the table owner", async () => {
    const owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await owner.connect();
    try {
      const refused = (statement: string) => owner.query(statement, statement.includes("$1") ? [tenantId] : []).then(() => "no error", (error: Error) => error.message);
      expect(await refused("UPDATE strategy_assumption_changes SET reason = 'rewritten' WHERE tenant_id = $1")).toMatch(/strategy_assumption_changes is append-only: UPDATE is refused/);
      expect(await refused("DELETE FROM strategy_assumption_changes WHERE tenant_id = $1")).toMatch(/append-only: DELETE is refused/);
      expect(await refused("TRUNCATE strategy_assumption_changes")).toMatch(/append-only: TRUNCATE is refused/);
      // the triggers fire always, so switching ordinary triggers off does not lift them
      await owner.query("SET session_replication_role = replica");
      expect(await refused("DELETE FROM strategy_assumption_changes WHERE tenant_id = $1")).toMatch(/append-only/);
    } finally { await owner.end(); }
    expect(await history()).toHaveLength(3);
  });

  it("(b) at the register: a draft, a pending one and a retired one never reach the values the model reads", async () => {
    await callerFor("entrant").strategy.createAssumption({ tenantId, code: "grossMarginPercent", ...fields(12, { name: "Synthetic margin" }) });
    const toModel = (await register()).map((item): ModelAssumption => ({ key: item.code, status: item.status, values: item.values }));
    const { values } = approvedValues(toModel, "base");
    expect(values.winRate).toBe(30);
    expect(values.grossMarginPercent).toBeUndefined(); // draft
    expect(values.collectionDays).toBeUndefined(); // pending
    await callerFor("approver").strategy.retireAssumption({ tenantId, assumptionId: winId, reason: "Synthetic: replaced" });
    const afterRetire = approvedValues((await register()).map((item): ModelAssumption => ({ key: item.code, status: item.status, values: item.values })), "base");
    expect(afterRetire.values.winRate).toBeUndefined();
    expect((await history())[0].kind).toBe("retired");
  });

  it("(h) ISOLATION: the executive reads; the project manager, the site engineer and another company see nothing", async () => {
    expect((await register("exec")).map(item => item.code)).toContain("winRate");
    for (const key of ["pm", "site"] as const) {
      expect(await code(register(key)), key).toBe("PROJECT_OS_PERMISSION_DENIED");
      expect(await code(callerFor(key).strategy.assumptionChanges({ tenantId, assumptionId: winId })), key).toBe("PROJECT_OS_PERMISSION_DENIED");
    }
    expect(await code(callerFor("ownerB").strategy.assumptions({ tenantId }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await callerFor("ownerB").strategy.assumptions({ tenantId: tenantB })).toEqual([]);
    expect(await code(callerFor("ownerB").strategy.assumptionChanges({ tenantId: tenantB, assumptionId: winId }))).toBe("no error");
    expect(await callerFor("ownerB").strategy.assumptionChanges({ tenantId: tenantB, assumptionId: winId })).toEqual([]);
  });
  it("NEGATIVE (sibling of #496): two drafts with the same code at the same moment — one is kept, the other gets the translated refusal, not a raw database error", async () => {
    const entrant = callerFor("entrant");
    const outcomes = (await Promise.all([1, 2].map(() => code(entrant.strategy.createAssumption({ tenantId, code: "raceCode", ...fields(10, { name: "Synthetic race" }) }))))).sort();
    expect(outcomes).toEqual(["PROJECT_OS_STRATEGY_ASSUMPTION_CODE_EXISTS", "no error"]);
    expect((await register()).filter(item => item.code === "raceCode")).toHaveLength(1);
  });
});
