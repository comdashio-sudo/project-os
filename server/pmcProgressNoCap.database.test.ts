import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-60 batch 2a (the owner, 26-11: «no artificial cap on the villas of one update»): 1,300 synthetic villas, one activity, updated in ONE entry — above 100
// villas the server first asks for the count, then writes every cell with its history and audit row in one transaction. Synthetic data only.
const VILLAS = 1300;

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-60: one progress update for the whole project (1,300 villas)", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client;
  const count = async (query: string) => Number((await client.query(query, [a.tenantId])).rows[0].n);
  const entry = (extra: Record<string, unknown> = {}) => ({ tenantId: a.tenantId, projectId: a.projectId, activityCode: "ACT01", modelCode: "C", status: "COMPLETE" as const, date: siteToday(), ...extra });

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q60n" });
    const zone = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'ZN06', 'Zone 6 (synthetic)')", [zone, a.tenantId, a.projectId]);
    const blocks = Array.from({ length: 26 }, () => randomUUID());
    for (const [index, block] of blocks.entries()) await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, $5, $5)", [block, a.tenantId, a.projectId, zone, `BLK ${index + 1}`]);
    // 1,250 villas of model C and 50 of model D, numbered 700–1999
    const rows = Array.from({ length: VILLAS }, (_unused, index) => [randomUUID(), a.tenantId, a.projectId, blocks[Math.floor(index / 50)], 700 + index, index < 1250 ? "C" : "D"]);
    for (let start = 0; start < rows.length; start += 500) {
      const chunk = rows.slice(start, start + 500);
      await client.query(`INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ${chunk.map((_row, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(", ")}`, chunk.flat());
    }
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, a.tenantId, a.projectId, group]);
    for (const model of ["C", "D"]) await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, $6, 'ACT01', 'Excavation', 100)", [randomUUID(), a.tenantId, a.projectId, group, stage, model]);
  });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("NEGATIVE: above 100 villas nothing is written until the count is confirmed; a wrong count and an unknown model are refused", async () => {
    const ask = await a.asOwner.pmc.updateProgress(entry()).then(() => null, (error: { message: string; cause?: { issues?: Array<{ code: string; detail?: string }> } }) => error);
    expect(ask?.message).toBe("PROJECT_OS_SITE_UPDATE_CONFIRM_COUNT");
    expect(ask?.cause?.issues).toEqual([{ code: "SITE_CONFIRM_COUNT", detail: "1250" }]); // every villa of model C
    await expect(a.asOwner.pmc.updateProgress(entry({ confirmCount: 1249 }))).rejects.toThrow("PROJECT_OS_SITE_UPDATE_CONFIRM_COUNT");
    await expect(a.asOwner.pmc.updateProgress(entry({ modelCode: "Z", confirmCount: 1 }))).rejects.toThrow("PROJECT_OS_SITE_UPDATE_INVALID");
    expect(await count("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenant_id = $1")).toBe(0);
  });

  it("POSITIVE: all 1,300 villas of the project in one entry (the range 700-1999), each cell with its history and audit row, the project at 100%", async () => {
    const started = Date.now();
    const saved = await a.asOwner.pmc.updateProgress(entry({ modelCode: undefined, range: "700-1999", confirmCount: VILLAS }));
    const seconds = (Date.now() - started) / 1000;
    expect(saved).toMatchObject({ changed: VILLAS, unchanged: 0, projectProgressPercent: 100 });
    expect(saved.villas).toHaveLength(VILLAS);
    expect(await count("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenant_id = $1 AND status = 'COMPLETE'")).toBe(VILLAS);
    expect(await count(`SELECT COUNT(*) AS n FROM pmc_unit_activity_history WHERE tenant_id = $1 AND note = 'batch ${saved.batchId}'`)).toBe(VILLAS);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'pmc.unit_activity_changed'")).toBe(VILLAS);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'pmc.progress_batch_updated'")).toBe(1);
    expect(seconds).toBeLessThan(30); // one transaction, a few statements per 500 cells
    // the same entry again changes nothing: every cell is already complete
    expect(await a.asOwner.pmc.updateProgress(entry({ modelCode: undefined, range: "700-1999", confirmCount: VILLAS }))).toMatchObject({ changed: 0, unchanged: VILLAS });
  });
});
