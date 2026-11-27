import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Review of #557 by programmer C, notes 2 and 3: two bulk saves that create the same new cells at once, and the QC warning on the audit rows. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-60: the bulk progress write under concurrent saves and in QC warn mode", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client;
  const villas = Array.from({ length: 60 }, (_unused, index) => String(700 + index));
  const entry = (activityCode: string, list: string[], status: "IN_PROGRESS" | "COMPLETE") => ({ tenantId: a.tenantId, projectId: a.projectId, activityCode, villas: list, status, date: siteToday() });
  const definitions: Record<string, string> = {}; const units: Record<string, string> = {};

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q60f" });
    const zone = randomUUID(); const block = randomUUID(); const group = randomUUID(); const stage = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 33', 'Block 33')", [block, a.tenantId, a.projectId, zone]);
    for (const villa of villas) { units[villa] = randomUUID(); await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, $5, 'C')", [units[villa], a.tenantId, a.projectId, block, Number(villa)]); }
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, a.tenantId, a.projectId, group]);
    for (const code of ["ACT01", "ACT02", "ACT03", "ACT04", "ACT05", "ACT06", "ACT07", "QC01"]) { definitions[code] = randomUUID(); await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, 'C', $6, $6, 20)", [definitions[code], a.tenantId, a.projectId, group, stage, code]); }
  });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE (note 2): two saves of the same 60 new cells at the same moment both succeed — 60 cells, 60 history rows, no duplicate-key error", async () => {
    for (const code of ["ACT01", "ACT02", "ACT03"]) {
      const results = await Promise.allSettled([a.asOwner.pmc.updateProgress(entry(code, villas, "IN_PROGRESS")), a.asOwner.pmc.updateProgress(entry(code, villas, "IN_PROGRESS"))]);
      expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
      const changed = results.map(result => (result as PromiseFulfilledResult<{ changed: number }>).value.changed).sort((x, y) => x - y);
      expect(changed).toEqual([0, 60]); // the second waits for the first, then finds every cell already moved
      const cells = await client.query("SELECT count(*)::int AS n FROM pmc_unit_activity_progress WHERE tenant_id = $1 AND activity_definition_id = $2", [a.tenantId, definitions[code]]);
      expect(cells.rows[0].n).toBe(60);
    }
  });

  it("POSITIVE (review of #570): a single-cell write and a bulk save that create the same new cell at the same moment both succeed — one cell, never a duplicate-key error", async () => {
    for (const code of ["ACT05", "ACT06", "ACT07"]) {
      const results = await Promise.allSettled([
        a.asOwner.pmc.updateProgress(entry(code, villas, "IN_PROGRESS")),
        a.asOwner.pmc.setUnitActivityStatus({ tenantId: a.tenantId, projectId: a.projectId, unitId: units["730"], activityDefinitionId: definitions[code], status: "IN_PROGRESS" }),
      ]);
      expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
      const cells = await client.query("SELECT count(*)::int AS n FROM pmc_unit_activity_progress WHERE tenant_id = $1 AND activity_definition_id = $2", [a.tenantId, definitions[code]]);
      expect(cells.rows[0].n).toBe(60);
    }
  });

  it("NEGATIVE (note 3): in warn mode the QC_NOT_ACCEPTED flag is on the audit rows of the cells QC did not accept, and not on the accepted one", async () => {
    await a.asOwner.policy.set({ tenantId: a.tenantId, qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "off" });
    const request = randomUUID();
    await client.query("INSERT INTO pmc_inspection_requests (id, tenant_id, project_id, request_code, activity_definition_id, response_code, requested_at) VALUES ($1, $2, $3, 'IR-1', $4, 'A', now() - interval '1 day')", [request, a.tenantId, a.projectId, definitions.QC01]);
    await client.query("INSERT INTO pmc_inspection_request_units (id, tenant_id, project_id, inspection_request_id, unit_id) VALUES (gen_random_uuid(), $1, $2, $3, $4)", [a.tenantId, a.projectId, request, units["700"]]);
    const result = await a.asOwner.pmc.updateProgress(entry("QC01", ["700", "701", "702"], "COMPLETE"));
    expect(result.warnings).toEqual(["QC_NOT_ACCEPTED"]);
    const audits = await client.query("SELECT metadata FROM audit_logs WHERE tenant_id = $1 AND action = 'pmc.unit_activity_changed' AND metadata::jsonb ->> 'activityDefinitionId' = $2", [a.tenantId, definitions.QC01]);
    const flagged = Object.fromEntries(audits.rows.map(row => { const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata; return [meta.unitId, meta.warnings ?? []]; }));
    expect(flagged[units["700"]]).toEqual([]);
    expect(flagged[units["701"]]).toEqual(["QC_NOT_ACCEPTED"]);
    expect(flagged[units["702"]]).toEqual(["QC_NOT_ACCEPTED"]);
  });
});
