import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-70 (4): the villa card's history — every change on every item (who, when, before → after, QC), the model's items and the villa's progress. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-70: the villa card history", () => {
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
    a = await createRoleFixture({ label: "q70w" }); b = await createRoleFixture({ label: "q70x" });
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

  const unitOf = async (fixture: Fixture, villa: number) => (await client.query("SELECT id FROM pmc_units WHERE tenant_id = $1 AND unit_number = $2", [fixture.tenantId, villa])).rows[0].id as string;

  it("POSITIVE: the whole villa's timeline names the activity and who moved it, the QC receipt is an event of its own, and the model's items carry their status and the villa's progress", async () => {
    const card = await a.asOwner.cells.card({ ...scopeOf(a), unitId: await unitOf(a, 700) });
    const changes = card.events.filter(event => event.kind === "status_change");
    expect(changes.map(event => [event.title, event.detail.activity])).toEqual(expect.arrayContaining([["— → IN_PROGRESS", "ACT01 — Excavation"], ["IN_PROGRESS → COMPLETE", "ACT01 — Excavation"], ["— → IN_PROGRESS", "ACT02 — Footings"]]));
    expect(changes.every(event => typeof event.detail.by === "string" && event.detail.by.length > 0)).toBe(true);
    expect(card.events.filter(event => event.kind === "qc_receipt").map(event => [event.title, event.detail.activity, event.detail.receivedOn])).toEqual([["— → RECEIVED", "ACT01 — Excavation", siteToday()]]);
    expect(card.items).toEqual([
      { code: "ACT01", name: "Excavation", weightPercent: 40, status: "COMPLETE", completedOn: expect.any(String), qcReceived: true },
      { code: "ACT02", name: "Footings", weightPercent: 60, status: "IN_PROGRESS", completedOn: null, qcReceived: null },
    ]);
    expect(card.progressPercent).toBe(40); // ACT01 complete (40), ACT02 in progress earns 0 with the default factors
  });

  it("one activity of the villa keeps its own timeline and no items table", async () => {
    const definitions = (await client.query("SELECT id FROM pmc_activity_definitions WHERE tenant_id = $1 AND model_code = 'C' AND code = 'ACT02'", [a.tenantId])).rows;
    const card = await a.asOwner.cells.card({ ...scopeOf(a), unitId: await unitOf(a, 700), activityDefinitionId: definitions[0].id });
    expect(card.items).toBeNull();
    expect(card.events.filter(event => event.kind === "status_change").map(event => event.detail.activity)).toEqual(["ACT02 — Footings"]);
    expect(card.events.filter(event => event.kind === "qc_receipt")).toEqual([]);
  });

  it("NEGATIVE: company isolation — B's moves on its own villa 700 never show on A's card, and B cannot open A's villa", async () => {
    const card = await a.asOwner.cells.card({ ...scopeOf(a), unitId: await unitOf(a, 700) });
    expect(card.events.some(event => event.kind === "status_change" && event.title === "— → COMPLETE")).toBe(false); // B completed ACT02 straight away
    await expect(b.asOwner.cells.card({ ...scopeOf(a), unitId: await unitOf(a, 700) })).rejects.toThrow();
    await expect(b.asOwner.cells.card({ tenantId: b.tenantId, projectId: b.projectId, unitId: await unitOf(a, 700) })).rejects.toThrow();
  });
});
