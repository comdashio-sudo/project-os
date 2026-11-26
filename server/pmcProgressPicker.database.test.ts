import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-67 (2)(3): the villas the field screens choose from (pmc.progressPicker) and the models of each activity (pmc.progressActivities). Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-67: the field screens' villa picker", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const scopeOf = (fixture: Fixture) => ({ tenantId: fixture.tenantId, projectId: fixture.projectId });

  const seed = async (fixture: Fixture, villas: Array<[number, string, string | null, string]>) => {
    const zone = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, fixture.tenantId, fixture.projectId]);
    const blocks = new Map<string, string>();
    for (const [, block] of villas) if (!blocks.has(block)) { const id = randomUUID(); blocks.set(block, id); await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, $5, $5)", [id, fixture.tenantId, fixture.projectId, zone, block]); }
    for (const [number, block, phase, model] of villas) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code, phase) VALUES ($1, $2, $3, $4, $5, $6, $7)", [randomUUID(), fixture.tenantId, fixture.projectId, blocks.get(block), number, model, phase]);
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q03', 'Concrete')", [group, fixture.tenantId, fixture.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, fixture.tenantId, fixture.projectId, group]);
    // ACT01 only in model C (D has none); ACT02 in both
    for (const [model, code, weight] of [["C", "ACT01", 40], ["C", "ACT02", 60], ["D", "ACT02", 100]] as const)
      await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)", [randomUUID(), fixture.tenantId, fixture.projectId, group, stage, model, code, weight]);
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q67a" }); b = await createRoleFixture({ label: "q67b" });
    await seed(a, [[702, "BLK 34", "PH2", "D"], [700, "BLK 33", "PH1", "C"], [701, "BLK 33", "PH1", "C"], [703, "BLK 34", null, "C"]]);
    await seed(b, [[900, "BLK 99", "PH9", "C"]]);
    await a.asOwner.pmc.updateProgress({ ...scopeOf(a), activityCode: "ACT01", villas: ["701"], status: "COMPLETE", date: siteToday() });
  });
  afterAll(async () => {
    for (const fixture of [a, b]) if (fixture) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: the project's villas in number order with block, phase and model; the phases, blocks and models with their villa counts", async () => {
    const picker = await a.asOwner.pmc.progressPicker(scopeOf(a));
    expect(picker.villas).toEqual([
      { villa: "700", number: 700, block: "BLK 33", phase: "PH1", model: "C", status: null }, { villa: "701", number: 701, block: "BLK 33", phase: "PH1", model: "C", status: null },
      { villa: "702", number: 702, block: "BLK 34", phase: "PH2", model: "D", status: null }, { villa: "703", number: 703, block: "BLK 34", phase: null, model: "C", status: null },
    ]);
    expect(picker.blocks).toEqual([{ code: "BLK 33", villas: 2 }, { code: "BLK 34", villas: 2 }]);
    expect(picker.phases).toEqual([{ code: "PH1", villas: 2 }, { code: "PH2", villas: 1 }]);
    expect(picker.models).toEqual([{ code: "C", villas: 3 }, { code: "D", villas: 1 }]);
  });

  it("POSITIVE: with an activity, each villa's status of it (a villa never touched is «not started»); each activity names its section code and its models", async () => {
    const picker = await a.asOwner.pmc.progressPicker({ ...scopeOf(a), activityCode: "ACT01" });
    expect(picker.villas.map(villa => [villa.villa, villa.status])).toEqual([["700", "NOT_STARTED"], ["701", "COMPLETE"], ["702", "NOT_STARTED"], ["703", "NOT_STARTED"]]);
    const activities = await a.asOwner.pmc.progressActivities(scopeOf(a));
    expect(activities.map(item => [item.code, item.sectionCode, item.models])).toEqual([["ACT01", "Q03", ["C"]], ["ACT02", "Q03", ["C", "D"]]]);
  });

  it("NEGATIVE: another company sees nothing of this project, and a person without the PMC read is refused; this project's lists hold no villa of the other company", async () => {
    await expect(b.asOwner.pmc.progressPicker(scopeOf(a))).rejects.toThrow();
    await expect(b.asOwner.pmc.progressPicker({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(a.callerFor(a.people.hr).pmc.progressPicker(scopeOf(a))).rejects.toThrow();
    const picker = await a.asOwner.pmc.progressPicker(scopeOf(a));
    expect(picker.villas.some(villa => villa.villa === "900")).toBe(false);
    expect(picker.blocks.some(block => block.code === "BLK 99")).toBe(false);
  });
});
