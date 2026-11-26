import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-70 (1): the progress log — one row per entry a person made, not one per villa. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-70: the progress log", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const scopeOf = (fixture: Fixture) => ({ tenantId: fixture.tenantId, projectId: fixture.projectId });
  async function seed(fixture: Fixture) {
    const zone = randomUUID(); const block33 = randomUUID(); const block34 = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, fixture.tenantId, fixture.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 33', 'Block 33'), ($5, $2, $3, $4, 'BLK 34', 'Block 34')", [block33, fixture.tenantId, fixture.projectId, zone, block34]);
    for (const [number, block] of [[700, block33], [701, block33], [702, block34], [703, block34], [705, block34]] as const) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, $5, 'C')", [randomUUID(), fixture.tenantId, fixture.projectId, block, number]);
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, fixture.tenantId, fixture.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, fixture.tenantId, fixture.projectId, group]);
    await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, 'C', 'ACT01', 'Excavation', 100)", [randomUUID(), fixture.tenantId, fixture.projectId, group, stage]);
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q70a" }); b = await createRoleFixture({ label: "q70b" });
    await seed(a); await seed(b);
    const update = (villas: string[], status: "IN_PROGRESS" | "COMPLETE") => a.asOwner.pmc.updateProgress({ ...scopeOf(a), activityCode: "ACT01", villas, status, date: siteToday() });
    await update(["700", "701", "702", "703"], "COMPLETE");
    await update(["705"], "IN_PROGRESS");
    await a.asOwner.pmc.updateQcReceipts({ ...scopeOf(a), activityCode: "ACT01", villas: ["700", "701"], received: true, date: siteToday() });
    // company B writes in its own project: none of it may show in A's log
    await b.asOwner.pmc.updateProgress({ ...scopeOf(b), activityCode: "ACT01", villas: ["700", "701", "702"], status: "COMPLETE", date: siteToday() });
  });
  afterAll(async () => {
    for (const fixture of [a, b]) if (fixture) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: a save of 4 villas is ONE row (with its 4 villas, before → after, who and the source); a 1-villa save and a QC receipt are rows of their own", async () => {
    const log = await a.asOwner.pmc.progressLog({ ...scopeOf(a), from: siteToday(), to: siteToday() });
    const history = await client.query("SELECT count(*)::int AS n FROM pmc_unit_activity_history WHERE tenant_id = $1", [a.tenantId]);
    expect(history.rows[0].n).toBe(5); // five villa rows underneath …
    const manual = log.entries.filter(entry => entry.source === "manual");
    expect(manual).toHaveLength(2); // … two entries
    const four = manual.find(entry => entry.villaCount === 4)!;
    expect(four).toMatchObject({ activityCode: "ACT01", to: "COMPLETE", villas: ["700", "701", "702", "703"], blocks: ["BLK 33", "BLK 34"], byUserId: a.owner.id });
    expect(manual.find(entry => entry.villaCount === 1)).toMatchObject({ villas: ["705"], to: "IN_PROGRESS" });
    expect(log.entries.filter(entry => entry.source === "qc")).toEqual([expect.objectContaining({ villas: ["700", "701"], from: null, to: "RECEIVED" })]);
    expect(log.truncated).toBe(false);
    expect(log.filters.blocks).toEqual(["BLK 33", "BLK 34"]);
  });

  it("the server's filters: a block keeps only its own villas of an entry; a source, a person and an activity narrow the rows", async () => {
    const block = await a.asOwner.pmc.progressLog({ ...scopeOf(a), blockCode: "BLK 33", source: "manual" });
    expect(block.entries.map(entry => entry.villas)).toEqual([["700", "701"]]);
    expect((await a.asOwner.pmc.progressLog({ ...scopeOf(a), source: "qc" })).entries).toHaveLength(1);
    expect((await a.asOwner.pmc.progressLog({ ...scopeOf(a), byUserId: a.owner.id })).entries).toHaveLength(3);
    expect((await a.asOwner.pmc.progressLog({ ...scopeOf(a), activityCode: "ACT99" })).entries).toEqual([]);
    expect((await a.asOwner.pmc.progressLog({ ...scopeOf(a), to: "2000-01-01" })).entries).toEqual([]);
  });

  it("NEGATIVE: company isolation — B's entries never show in A's log, B cannot read A's project; a bad date and someone without the PMC read permission are refused", async () => {
    const log = await a.asOwner.pmc.progressLog(scopeOf(a));
    expect(log.entries.some(entry => entry.byUserId === b.owner.id)).toBe(false);
    expect(log.entries.reduce((sum, entry) => sum + entry.villaCount, 0)).toBe(7); // 4 + 1 + 2 QC: nothing of B's 3
    await expect(b.asOwner.pmc.progressLog(scopeOf(a))).rejects.toThrow();
    await expect(b.asOwner.pmc.progressLog({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(a.asOwner.pmc.progressLog({ ...scopeOf(a), from: "2026-13-01" })).rejects.toThrow("PROJECT_OS_PROGRESS_LOG_DATE_INVALID");
    await expect(a.asOwner.pmc.progressLog({ ...scopeOf(a), from: "2026-11-02", to: "2026-11-01" })).rejects.toThrow("PROJECT_OS_PROGRESS_LOG_DATE_INVALID");
    await expect(a.callerFor(a.people.hr).pmc.progressLog(scopeOf(a))).rejects.toThrow();
  });
});
