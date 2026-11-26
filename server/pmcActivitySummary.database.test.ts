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
});
