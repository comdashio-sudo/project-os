import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";
import { getPmcScreen, loadPmcDataset, SCREENS_READING_HISTORY } from "./pmcScreensService";
import { PMC_SCREEN_NAMES } from "./domain/pmcScreenExport";

// Q-68 (3): a PMC screen that never reads the status history is not made to wait for it — and its answer is the same as with the history loaded. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-68 (3): PMC screens load only what they read", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client;
  const scope = () => ({ userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId });
  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q68h" });
    const zone = randomUUID(); const block = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 1', 'Block 1')", [block, a.tenantId, a.projectId, zone]);
    for (const number of [11, 12]) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code, unit_weight) VALUES ($1, $2, $3, $4, $5, 'C', 1)", [randomUUID(), a.tenantId, a.projectId, block, number]);
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, a.tenantId, a.projectId, group]);
    await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, 'C', 'ACT01', 'Excavation', 100)", [randomUUID(), a.tenantId, a.projectId, group, stage]);
    await a.asOwner.pmc.updateProgress({ tenantId: a.tenantId, projectId: a.projectId, activityCode: "ACT01", villas: ["11", "12"], status: "IN_PROGRESS", date: siteToday() });
    await a.asOwner.pmc.updateProgress({ tenantId: a.tenantId, projectId: a.projectId, activityCode: "ACT01", villas: ["11"], status: "COMPLETE", date: siteToday() });
  });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("the loader reads the history only when asked to — and every screen that does not read it answers exactly as it does with the history loaded", async () => {
    const db = (await getDb())!;
    const now = new Date();
    expect((await loadPmcDataset(db, scope(), now)).history.length).toBeGreaterThan(0); // the default is the whole set, as before
    expect((await loadPmcDataset(db, scope(), now, { history: false })).history).toEqual([]);
    const without = PMC_SCREEN_NAMES.filter(name => !SCREENS_READING_HISTORY.has(name));
    expect(without.length).toBeGreaterThanOrEqual(5);
    for (const screen of without) {
      const light = await getPmcScreen({ ...scope(), screen, now });
      const full = await getPmcScreen({ ...scope(), screen, now, withHistory: true });
      expect(light.data, screen).toEqual(full.data);
      expect(light.freshness, screen).toEqual(full.freshness);
    }
  });

  it("NEGATIVE: the screens that DO read the history still get it — the latest updates show the changes, never an empty list", async () => {
    const updates = await getPmcScreen({ ...scope(), screen: "latestUpdates", now: new Date() });
    expect((updates.data as { totals: { updates: number } }).totals.updates).toBeGreaterThan(0); // the changes are there (two villas started, one completed)
    expect(["latestUpdates", "weekly", "monthly"].every(name => SCREENS_READING_HISTORY.has(name as never))).toBe(true);
  });
});
