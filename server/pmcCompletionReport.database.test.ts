import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-70 (2): the completion report — one row per villa × activity of its model, computed from what the site wrote. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-70: the completion report", () => {
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
    a = await createRoleFixture({ label: "q70r" }); b = await createRoleFixture({ label: "q70s" });
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

  it("POSITIVE: entering 4 villas shows 4 completed rows with their start and completion day; every villa × activity of its own model is a row (4×2 + 1×1 = 9)", async () => {
    const report = await a.asOwner.pmc.completionReport(scopeOf(a));
    expect(report.total).toBe(9);
    const act01 = report.rows.filter(row => row.activityCode === "ACT01" && row.modelCode === "C");
    expect(act01.map(row => [row.villa, row.status, row.startedOn, row.completedOn])).toEqual(["700", "701", "702", "703"].map(villa => [villa, "COMPLETE", siteToday(), siteToday()]));
    expect(act01[0]).toMatchObject({ blockCode: "BLK 33", phase: "PH1", weightPercent: 40, qcReceived: true, qcOn: siteToday(), lastBy: expect.any(String) });
    expect(report.rows.find(row => row.villa === "700" && row.activityCode === "ACT02")).toMatchObject({ status: "IN_PROGRESS", startedOn: siteToday(), completedOn: null });
    expect(report.rows.find(row => row.villa === "701" && row.activityCode === "ACT02")).toMatchObject({ status: "NOT_STARTED", startedOn: null, completedOn: null, qcReceived: null, lastBy: null });
    expect(report.rows.filter(row => row.villa === "800").map(row => row.activityCode)).toEqual(["ACT01"]);
    expect(report.filters).toEqual({ blocks: ["BLK 33", "BLK 34"], phases: ["PH1", "PH2"], activities: [{ code: "ACT01", name: "Excavation" }, { code: "ACT02", name: "Footings" }] });
  });

  it("pages read in turn are the whole report (what the export writes); the filters narrow on the server", async () => {
    const whole = (await a.asOwner.pmc.completionReport(scopeOf(a))).rows;
    const pages: typeof whole = []; let next: number | null = 0;
    while (next !== null) { const page = await a.asOwner.pmc.completionReport({ ...scopeOf(a), offset: next, limit: 4 }); pages.push(...page.rows); next = page.nextOffset; }
    expect(pages).toEqual(whole);
    expect((await a.asOwner.pmc.completionReport({ ...scopeOf(a), phase: "ph2", activityCode: "ACT01" })).rows.map(row => row.villa)).toEqual(["702", "703", "800"]);
    expect((await a.asOwner.pmc.completionReport({ ...scopeOf(a), status: "NOT_STARTED" })).total).toBe(4); // 701–703 ACT02 and 800 ACT01
    expect((await a.asOwner.pmc.completionReport({ ...scopeOf(a), villa: "Villa 701" })).rows.map(row => row.activityCode)).toEqual(["ACT01", "ACT02"]);
    expect((await a.asOwner.pmc.completionReport({ ...scopeOf(a), blockCode: "BLK 33" })).total).toBe(4);
  });

  it("NEGATIVE: company isolation — B's completions never show in A's report and B cannot read A's project; a villa that is no number and someone without the PMC read permission are refused", async () => {
    const report = await a.asOwner.pmc.completionReport({ ...scopeOf(a), activityCode: "ACT02" });
    expect(report.rows.filter(row => row.status === "COMPLETE")).toEqual([]); // B completed ACT02 on its own 700 and 701
    await expect(b.asOwner.pmc.completionReport(scopeOf(a))).rejects.toThrow();
    await expect(b.asOwner.pmc.completionReport({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(a.asOwner.pmc.completionReport({ ...scopeOf(a), villa: "abc" })).rejects.toThrow("PROJECT_OS_COMPLETION_FILTER_INVALID");
    await expect(a.callerFor(a.people.hr).pmc.completionReport(scopeOf(a))).rejects.toThrow();
  });
});
