import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-60 batch 2c: a whole construction phase (PH1–PH4, from the villa register's Phase column) chosen at once in the progress update. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-60: the progress update by phase", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client;
  const entry = (extra: Record<string, unknown>) => ({ tenantId: a.tenantId, projectId: a.projectId, activityCode: "ACT01", status: "COMPLETE" as const, date: siteToday(), ...extra });
  const complete = async () => (await client.query("SELECT u.unit_number FROM pmc_unit_activity_progress p JOIN pmc_units u ON u.id = p.unit_id WHERE p.tenant_id = $1 AND p.status = 'COMPLETE' ORDER BY u.unit_number", [a.tenantId])).rows.map(row => row.unit_number);

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q60p" });
    const zone = randomUUID(); const block = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 33', 'Block 33')", [block, a.tenantId, a.projectId, zone]);
    for (const [number, phase] of [[700, "PH1"], [701, "PH1"], [702, "PH2"], [703, null]] as const) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code, phase) VALUES ($1, $2, $3, $4, $5, 'C', $6)", [randomUUID(), a.tenantId, a.projectId, block, number, phase]);
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, a.tenantId, a.projectId, group]);
    await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, 'C', 'ACT01', 'Excavation', 100)", [randomUUID(), a.tenantId, a.projectId, group, stage]);
  });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: «ph1» (any case) completes exactly the villas of PH1, nothing else", async () => {
    expect(await a.asOwner.pmc.updateProgress(entry({ phase: "ph1" }))).toMatchObject({ changed: 2, unchanged: 0 });
    expect(await complete()).toEqual([700, 701]);
  });

  it("NEGATIVE: a phase no villa has is refused by name, and a phase together with a block is refused as ambiguous — nothing written", async () => {
    await expect(a.asOwner.pmc.updateProgress(entry({ phase: "PH9" }))).rejects.toThrow("PROJECT_OS_SITE_UPDATE_INVALID");
    await expect(a.asOwner.pmc.updateProgress(entry({ phase: "PH2", blockCode: "BLK 33" }))).rejects.toThrow("PROJECT_OS_SITE_UPDATE_INVALID");
    expect(await complete()).toEqual([700, 701]);
  });
});
