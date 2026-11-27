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
    // Q-67 (6): a saved DXF drawing (no picture) of company a: villas 700 and 702 linked, one shape linked to nothing, one shape with unreadable points
    const plan = randomUUID(); const version = randomUUID(); const drawing = randomUUID();
    await client.query("INSERT INTO master_plans (id, tenant_id, project_id, code, title, created_by_user_id) VALUES ($1, $2, $3, 'MP-1', 'Plan (synthetic)', $4)", [plan, a.tenantId, a.projectId, a.owner.id]);
    await client.query("INSERT INTO master_plan_versions (id, tenant_id, project_id, master_plan_id, version_number, version_kind, uploaded_by_user_id) VALUES ($1, $2, $3, $4, 1, 'original', $5)", [version, a.tenantId, a.projectId, plan, a.owner.id]);
    await client.query("INSERT INTO master_plan_drawings (id, tenant_id, project_id, master_plan_version_id, created_by_user_id) VALUES ($1, $2, $3, $4, $5)", [drawing, a.tenantId, a.projectId, version, a.owner.id]);
    const unitId = async (number: number) => (await client.query("SELECT id FROM pmc_units WHERE tenant_id = $1 AND unit_number = $2", [a.tenantId, number])).rows[0].id as string;
    const square = (x: number) => JSON.stringify([{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }]);
    for (const [ref, points, villa] of [["p700", square(0), 700], ["p702", square(20), 702], ["free", square(40), null], ["bad", "not json", 701]] as const) {
      const polygon = randomUUID();
      await client.query("INSERT INTO master_plan_drawing_polygons (id, tenant_id, project_id, drawing_id, ref, label, points) VALUES ($1, $2, $3, $4, $5, '', $6)", [polygon, a.tenantId, a.projectId, drawing, ref, points]);
      if (villa) await client.query("INSERT INTO master_plan_drawing_links (id, tenant_id, project_id, drawing_id, polygon_id, pmc_unit_id, confirmed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [randomUUID(), a.tenantId, a.projectId, drawing, polygon, await unitId(villa), a.owner.id]);
    }
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

  it("Q-67 (6) POSITIVE: the map's shapes are the drawing's shapes linked to a villa, with the villa; a DXF is read y-up; a shape linked to nothing or unreadable is left off", async () => {
    const map = await a.asOwner.pmc.progressMapShapes(scopeOf(a));
    expect(map.yUp).toBe(true);
    expect(map.shapes.map(shape => shape.villa).sort()).toEqual(["700", "702"]);
    expect(map.shapes.find(shape => shape.villa === "702")!.points[1]).toEqual({ x: 30, y: 0 });
  });

  it("Q-67 (6) NEGATIVE: a project with no linked drawing has no map; another company and a person without the PMC read are refused", async () => {
    expect(await b.asOwner.pmc.progressMapShapes(scopeOf(b))).toEqual({ shapes: [], yUp: false });
    await expect(b.asOwner.pmc.progressMapShapes(scopeOf(a))).rejects.toThrow();
    await expect(b.asOwner.pmc.progressMapShapes({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(a.callerFor(a.people.hr).pmc.progressMapShapes(scopeOf(a))).rejects.toThrow();
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
