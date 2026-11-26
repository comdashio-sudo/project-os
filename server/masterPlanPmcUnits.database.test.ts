import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import * as storage from "./storage";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-62 (the owner, 26-11, on production) on a real database and through the real router: a project whose villas came only from the PMC «villa list» import,
// with a master plan whose version has no units of its own. The drawing screen saw no units, so nothing could be linked, coloured or saved. Synthetic data only.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0a6a1a20000000049454e44ae426082", "hex");
const square = (x: number, y: number, size = 10) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-62: the master plan works on the project's PMC villas", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  let versionId = ""; let planVersionId = ""; let otherVillaId = "";
  const villa: Record<number, string> = {};
  const scope = () => ({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId: versionId });

  async function saveShapes(masterPlanVersionId: string, refs: string[]) {
    const target = await a.asOwner.directUploads.create({ tenantId: a.tenantId, projectId: a.projectId, purpose: "masterPlanDrawing", fileName: "plan.png", contentType: "image/png" });
    storage.simulateBrowserUpload(target.uploadKey, PNG, "image/png");
    await a.asOwner.masterPlans.uploadDrawingVersion({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId, uploadKey: target.uploadKey, fileName: "plan.png" });
    return (await a.asOwner.masterPlans.saveDrawingLayout({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId, polygons: refs.map((ref, i) => ({ ref, label: "VILLAS", points: square(i * 20, 0) })) })).polygons;
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q62a" }); b = await createRoleFixture({ label: "q62b" });
    // the villas, as the «villa list» import writes them: zone, block, unit — and nothing in the master plan
    const zone = randomUUID(); const block = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 33', 'Block 33')", [block, a.tenantId, a.projectId, zone]);
    for (const [number, model] of [[700, "C"], [701, "D"], [702, "C"]] as const) {
      villa[number] = randomUUID();
      await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, $5, $6)", [villa[number], a.tenantId, a.projectId, block, number, model]);
    }
    // another company's villa, to try to link across companies
    const bZone = randomUUID(); const bBlock = randomUUID(); otherVillaId = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [bZone, b.tenantId, b.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, '1', 'Block 1')", [bBlock, b.tenantId, b.projectId, bZone]);
    await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, 900, 'A')", [otherVillaId, b.tenantId, b.projectId, bBlock]);
    // the owner's plan «Taraf 1-1» v1 (synthetic name): created, no units entered in it
    versionId = (await a.asOwner.masterPlans.create({ tenantId: a.tenantId, projectId: a.projectId, code: "Q62-PLAN", title: "Synthetic plan" })).versionId;
  });
  afterAll(async () => {
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: the drawing's units are the project's PMC villas (by number), and a shape links to a villa, is saved and comes back", async () => {
    const units = await a.asOwner.masterPlans.drawingUnits(scope());
    expect(units.source).toBe("pmc");
    expect(units.units.map(unit => [unit.code, unit.blockCode, unit.modelCode])).toEqual([["700", "BLK 33", "C"], ["701", "BLK 33", "D"], ["702", "BLK 33", "C"]]);
    const shapes = await saveShapes(versionId, ["S1", "S2"]);
    const linked = await a.asOwner.masterPlans.linkDrawingUnit({ ...scope(), polygonId: shapes[0].id, pmcUnitId: villa[700] });
    expect(linked).toMatchObject({ unitSource: "pmc", pmcUnitId: villa[700], unitId: villa[700] });
    const layout = await a.asOwner.masterPlans.drawingLayout(scope());
    expect(layout.links.map(link => ({ polygonId: link.polygonId, unitId: link.unitId, entityId: link.entityId }))).toEqual([{ polygonId: shapes[0].id, unitId: villa[700], entityId: null }]);
    const { rows: [audit] } = await client.query("SELECT metadata FROM audit_logs WHERE tenant_id = $1 AND action = 'master_plans.drawing_unit_linked'", [a.tenantId]);
    expect(JSON.parse(audit.metadata)).toMatchObject({ pmcUnitId: villa[700], unitSource: "pmc", unitCode: "700" });
    // the colouring reads the same villas by number: the site map knows 700
    const siteMap = await a.asOwner.pmc.siteMap({ tenantId: a.tenantId, projectId: a.projectId });
    expect(siteMap.units.map((unit: { unitNumber: number }) => unit.unitNumber)).toContain(700);
    // unlinking takes the villa off the shape (its own audit row)
    await a.asOwner.masterPlans.unlinkDrawingUnit({ ...scope(), polygonId: shapes[0].id });
    expect((await a.asOwner.masterPlans.drawingLayout(scope())).links).toEqual([]);
    await a.asOwner.masterPlans.linkDrawingUnit({ ...scope(), polygonId: shapes[0].id, pmcUnitId: villa[700] });
  });

  it("NEGATIVE: one villa on one shape; another company's villa, a plan unit named on a PMC drawing, and a reader are all refused", async () => {
    const layout = await a.asOwner.masterPlans.drawingLayout(scope());
    const free = layout.polygons.find(polygon => polygon.ref === "S2")!;
    await expect(a.asOwner.masterPlans.linkDrawingUnit({ ...scope(), polygonId: free.id, pmcUnitId: villa[700] })).rejects.toThrow(/PROJECT_OS_MASTER_PLAN_UNIT_ALREADY_LINKED|already/i);
    await expect(a.asOwner.masterPlans.linkDrawingUnit({ ...scope(), polygonId: free.id, pmcUnitId: otherVillaId })).rejects.toThrow();
    await expect(a.asOwner.masterPlans.linkDrawingUnit({ ...scope(), polygonId: free.id, entityId: villa[701] })).rejects.toThrow();
    await expect(a.asOwner.masterPlans.linkDrawingUnit({ ...scope(), polygonId: free.id })).rejects.toThrow();
    await expect(b.asOwner.masterPlans.drawingUnits(scope())).rejects.toThrow();
    await expect(b.asOwner.masterPlans.drawingUnits({ ...scope(), tenantId: b.tenantId })).rejects.toThrow();
    const { rows } = await client.query("SELECT count(*)::int AS n FROM master_plan_drawing_links WHERE tenant_id = $1", [a.tenantId]);
    expect(rows[0].n).toBe(1);
    // the database itself holds a link to exactly one unit: neither, or both, is refused
    await expect(client.query("UPDATE master_plan_drawing_links SET pmc_unit_id = NULL WHERE tenant_id = $1", [a.tenantId])).rejects.toThrow(/one_unit_check/);
  });

  it("an existing plan whose version holds its own units is unchanged: those units, linked by entityId; a villa id is refused there", async () => {
    const second = await a.asOwner.masterPlans.createVersion({ tenantId: a.tenantId, projectId: a.projectId, masterPlanId: (await a.asOwner.masterPlans.list({ tenantId: a.tenantId, projectId: a.projectId })).plans[0].id, versionKind: "revision" });
    planVersionId = second.id;
    const entity = await a.asOwner.masterPlans.createSpatialEntity({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId: planVersionId, code: "U-01", name: "Unit U-01", entityType: "unit", geometry: { x: 5, y: 5, width: 20, height: 20 }, status: "not_started", progressPercent: 0 });
    const units = await a.asOwner.masterPlans.drawingUnits({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId: planVersionId });
    expect(units).toMatchObject({ source: "plan", units: [{ id: entity.id, code: "U-01" }] });
    const shapes = await saveShapes(planVersionId, ["P1"]);
    await expect(a.asOwner.masterPlans.linkDrawingUnit({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId: planVersionId, polygonId: shapes[0].id, pmcUnitId: villa[701] })).rejects.toThrow();
    expect(await a.asOwner.masterPlans.linkDrawingUnit({ tenantId: a.tenantId, projectId: a.projectId, masterPlanVersionId: planVersionId, polygonId: shapes[0].id, entityId: entity.id })).toMatchObject({ unitSource: "plan", entityId: entity.id });
  });
});
