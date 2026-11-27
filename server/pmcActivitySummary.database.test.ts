import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-70 (3): the activity summary — per activity, block and phase, by the PMC rules. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-70: the activity summary", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const scopeOf = (fixture: Fixture) => ({ tenantId: fixture.tenantId, projectId: fixture.projectId });
  async function seed(fixture: Fixture) {
    const zone = randomUUID(); const block33 = randomUUID(); const block34 = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, fixture.tenantId, fixture.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 33', 'Block 33'), ($5, $2, $3, $4, 'BLK 34', 'Block 34')", [block33, fixture.tenantId, fixture.projectId, zone, block34]);
    for (const [number, block, phase, model] of [[700, block33, "PH1", "C"], [701, block33, "PH1", "C"], [702, block34, "PH2", "C"], [703, block34, "PH2", "C"], [800, block34, "PH2", "D"]] as const) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code, phase) VALUES ($1, $2, $3, $4, $5, $6, $7)", [randomUUID(), fixture.tenantId, fixture.projectId, block, number, model, phase]);
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, fixture.tenantId, fixture.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, fixture.tenantId, fixture.projectId, group]);
    // model C has two activities; model D only ACT01 — its villa has one row, not two
    for (const [model, code, name, weight] of [["C", "ACT01", "Excavation", 40], ["C", "ACT02", "Footings", 60], ["D", "ACT01", "Excavation", 100]] as const) await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [randomUUID(), fixture.tenantId, fixture.projectId, group, stage, model, code, name, weight]);
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q70u" }); b = await createRoleFixture({ label: "q70v" });
    await seed(a); await seed(b);
    const update = (fixture: Fixture, villas: string[], activityCode: string, status: "IN_PROGRESS" | "COMPLETE") => fixture.asOwner.pmc.updateProgress({ ...scopeOf(fixture), activityCode, villas, status, date: siteToday() });
    await update(a, ["700", "701", "702", "703"], "ACT01", "IN_PROGRESS");
    await update(a, ["700", "701", "702", "703"], "ACT01", "COMPLETE");
    await update(a, ["700"], "ACT02", "IN_PROGRESS");
    await a.asOwner.pmc.updateQcReceipts({ ...scopeOf(a), activityCode: "ACT01", villas: ["700"], received: true, date: siteToday() });
    await update(b, ["700", "701"], "ACT02", "COMPLETE");
  });
  afterAll(async () => {
    for (const fixture of [a, b]) if (fixture) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: the project's number is the PMC page's own; each activity counts the villas of every model that has it; blocks and phases add up", async () => {
    const summary = await a.asOwner.pmc.activitySummary(scopeOf(a));
    const pmc = await a.asOwner.pmc.progress(scopeOf(a));
    expect(summary.project.progressPercent).toBeCloseTo(Number(pmc.projectProgressPercent), 2);
    // ACT01: 700–703 (C) complete, 800 (D) not started → 4 of 5; ACT02: 700 in progress, 701–703 not started
    expect(summary.activities.map(row => [row.code, row.villas, row.complete, row.inProgress, row.notStarted, row.completionPercent])).toEqual([["ACT01", 5, 4, 0, 1, 80], ["ACT02", 4, 0, 1, 3, 0]]);
    expect(summary.blocks.map(row => [row.key, row.villas, row.completeCells, row.totalCells])).toEqual([["BLK 33", 2, 2, 4], ["BLK 34", 3, 2, 5]]);
    expect(summary.phases.map(row => row.key)).toEqual(["PH1", "PH2"]);
    expect(summary.filters).toEqual({ blocks: ["BLK 33", "BLK 34"], phases: ["PH1", "PH2"] });
  });

  it("a block or a phase narrows everything on the server", async () => {
    const block = await a.asOwner.pmc.activitySummary({ ...scopeOf(a), blockCode: "BLK 33" });
    expect(block.project.villas).toBe(2);
    expect(block.activities.map(row => [row.code, row.villas, row.complete])).toEqual([["ACT01", 2, 2], ["ACT02", 2, 0]]);
    expect((await a.asOwner.pmc.activitySummary({ ...scopeOf(a), phase: "ph2" })).project.villas).toBe(3);
  });

  it("NEGATIVE: company isolation — B's completions never count in A's summary and B cannot read A's project; someone without the PMC read permission is refused", async () => {
    const summary = await a.asOwner.pmc.activitySummary(scopeOf(a));
    expect(summary.activities.find(row => row.code === "ACT02")!.complete).toBe(0); // B completed ACT02 on its own 700 and 701
    await expect(b.asOwner.pmc.activitySummary(scopeOf(a))).rejects.toThrow();
    await expect(b.asOwner.pmc.activitySummary({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(a.callerFor(a.people.hr).pmc.activitySummary(scopeOf(a))).rejects.toThrow();
  });
  it("Q-72 (2): a period's achievement is the progress at its end minus the progress at its start, from the history; before anything happened it is 0; an inverted or start-less period is refused", async () => {
    // put the history back in time: ACT01 went in progress 10 days ago and complete 3 days ago; ACT02 was started today
    await client.query(`UPDATE pmc_unit_activity_history h SET changed_at = now() - interval '10 days' FROM pmc_unit_activity_progress c JOIN pmc_activity_definitions d ON d.id = c.activity_definition_id WHERE h.unit_activity_progress_id = c.id AND h.tenant_id = $1 AND d.code = 'ACT01' AND h.to_status = 'IN_PROGRESS'`, [a.tenantId]);
    await client.query(`UPDATE pmc_unit_activity_history h SET changed_at = now() - interval '3 days' FROM pmc_unit_activity_progress c JOIN pmc_activity_definitions d ON d.id = c.activity_definition_id WHERE h.unit_activity_progress_id = c.id AND h.tenant_id = $1 AND d.code = 'ACT01' AND h.to_status = 'COMPLETE'`, [a.tenantId]);
    const day = (offset: number) => new Date(Date.now() + 3 * 3_600_000 - offset * 86_400_000).toISOString().slice(0, 10);
    const plain = await a.asOwner.pmc.activitySummary(scopeOf(a));
    expect(plain.period).toBeNull(); // without a period the summary is what it was
    // the 5 days up to yesterday: ACT01 was in progress at the start and complete at the end
    const week = (await a.asOwner.pmc.activitySummary({ ...scopeOf(a), from: day(5), to: day(1) })).period!;
    expect(week.project.deltaPercent).toBeGreaterThan(0);
    expect(week.project.deltaPercent).toBeCloseTo(week.project.endPercent! - week.project.startPercent!, 2);
    expect(week.activities.find(row => row.code === "ACT01")!.deltaEarnedPercent).toBeGreaterThan(0);
    expect(week.activities.find(row => row.code === "ACT02")!.deltaEarnedPercent).toBe(0); // ACT02 started today, after the period
    // a period that ends today reaches the project's current number
    const upToToday = (await a.asOwner.pmc.activitySummary({ ...scopeOf(a), from: day(5) })).period!;
    expect(upToToday.project.endPercent).toBe(plain.project.progressPercent);
    // a period before anything happened changes nothing
    const before = (await a.asOwner.pmc.activitySummary({ ...scopeOf(a), from: day(40), to: day(30) })).period!;
    expect(before.project.deltaPercent).toBe(0);
    // refused with the reason
    await expect(a.asOwner.pmc.activitySummary({ ...scopeOf(a), from: day(1), to: day(5) })).rejects.toThrow(/PROJECT_OS_PERIOD_INVERTED/);
    await expect(a.asOwner.pmc.activitySummary({ ...scopeOf(a), to: day(1) })).rejects.toThrow(/PROJECT_OS_PERIOD_FROM_REQUIRED/);
    // company isolation holds for a period too
    await expect(b.asOwner.pmc.activitySummary({ ...scopeOf(a), from: day(5) })).rejects.toThrow();
  });
  it("Q-72 (4): the engineer in charge of a block or a phase — set by whoever manages PMC, an active member of the company only, read beside the row; cleared; another company and an outsider are refused", async () => {
    const set = (fixture: Fixture, scopeType: "block" | "phase", scopeKey: string, engineerUserId: number | null) => fixture.asOwner.pmc.setScopeEngineer({ ...scopeOf(fixture), scopeType, scopeKey, engineerUserId });
    expect((await a.asOwner.pmc.activitySummary(scopeOf(a))).blocks.every(row => row.engineer === null)).toBe(true); // nobody named yet: null, not a guess
    await set(a, "block", "BLK 33", a.owner.id);
    await set(a, "phase", "ph2", a.owner.id); // the phase is matched without regard to case and stored as the villas write it
    const named = await a.asOwner.pmc.activitySummary(scopeOf(a));
    expect(named.blocks.map(row => [row.key, row.engineer?.userId ?? null])).toEqual([["BLK 33", a.owner.id], ["BLK 34", null]]);
    expect(named.phases.map(row => [row.key, row.engineer?.userId ?? null])).toEqual([["PH1", null], ["PH2", a.owner.id]]);
    const [audit] = (await client.query("SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'pmc.scope_engineer_set'", [a.tenantId])).rows;
    expect(audit.n).toBe(2);
    // refused with the reason, nothing written: a person who is not a member of the company, a block that does not exist
    await expect(set(a, "block", "BLK 34", b.owner.id)).rejects.toThrow(/PROJECT_OS_PMC_SCOPE_ENGINEER_NOT_A_MEMBER/);
    await expect(set(a, "block", "BLK 99", a.owner.id)).rejects.toThrow(/PROJECT_OS_PMC_SCOPE_UNKNOWN/);
    await expect(set(a, "phase", "PH9", a.owner.id)).rejects.toThrow(/PROJECT_OS_PMC_SCOPE_UNKNOWN/);
    expect((await a.asOwner.pmc.activitySummary(scopeOf(a))).blocks.find(row => row.key === "BLK 34")!.engineer).toBeNull();
    // another company cannot name an engineer on this project; a role without the PMC permission cannot either
    await expect(b.asOwner.pmc.setScopeEngineer({ ...scopeOf(a), scopeType: "block", scopeKey: "BLK 34", engineerUserId: b.owner.id })).rejects.toThrow();
    await expect(a.callerFor(a.people.hr).pmc.setScopeEngineer({ ...scopeOf(a), scopeType: "block", scopeKey: "BLK 34", engineerUserId: a.owner.id })).rejects.toThrow();
    // the people who can be named: the company's active members, for whoever manages PMC only
    expect((await a.asOwner.pmc.scopeEngineerCandidates(scopeOf(a))).map(row => row.userId)).toContain(a.owner.id);
    await expect(a.callerFor(a.people.hr).pmc.scopeEngineerCandidates(scopeOf(a))).rejects.toThrow();
    // clearing removes it
    await set(a, "block", "BLK 33", null);
    expect((await a.asOwner.pmc.activitySummary(scopeOf(a))).blocks.every(row => row.engineer === null)).toBe(true);
  });
});
