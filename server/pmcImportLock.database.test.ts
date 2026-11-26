import pg from "pg";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { parsePmcImportFile } from "./domain/pmcImport";
import { prepareRows } from "./pmcImportService";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Review of #575 by programmer C: the PMC status import writes the project's cells like the site's saves, so it takes the same project lock and re-reads
// the cells inside its transaction. Here a site save creates a cell between the import's plan and its write — the moment the import used to insert the
// cell a second time and fail on the unique index. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-60: the status import under the project lock", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client; let act01 = "";
  const villas = ["700", "701", "702"];
  async function statusFile(status: string) {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("status");
    sheet.addRow(["Unit", "Activity", "Status"]); for (const villa of villas) sheet.addRow([Number(villa), "ACT01", status]);
    return new Uint8Array(await book.xlsx.writeBuffer());
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q60i" });
    const zone = randomUUID(); const block = randomUUID(); const group = randomUUID(); const stage = randomUUID(); act01 = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'BLK 33', 'Block 33')", [block, a.tenantId, a.projectId, zone]);
    for (const villa of villas) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, $5, 'C')", [randomUUID(), a.tenantId, a.projectId, block, Number(villa)]);
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Q01', 'Group 1')", [group, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'S1', 'Stage 1')", [stage, a.tenantId, a.projectId, group]);
    await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, 'C', 'ACT01', 'Excavation', 100)", [act01, a.tenantId, a.projectId, group, stage]);
  });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: a cell the site created after the file was planned is updated by the import, not inserted twice — one cell per villa, the history says both moves", async () => {
    const db = (await getDb())!;
    const scope = { userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId };
    const prepared = await prepareRows(db, { ...scope, kind: "status" }, await parsePmcImportFile({ kind: "status", format: "xlsx", bytes: await statusFile("Complete") }), "synthetic-hash");
    expect(prepared.apply).not.toBeNull();
    // between the plan and the write: the site starts villa 700
    await a.asOwner.pmc.updateProgress({ tenantId: a.tenantId, projectId: a.projectId, activityCode: "ACT01", villas: ["700"], status: "IN_PROGRESS", date: siteToday() });
    await db.transaction(tx => prepared.apply!(tx));
    const cells = await client.query("SELECT u.unit_number AS villa, p.status FROM pmc_unit_activity_progress p JOIN pmc_units u ON u.id = p.unit_id WHERE p.tenant_id = $1 AND p.activity_definition_id = $2 ORDER BY u.unit_number", [a.tenantId, act01]);
    expect(cells.rows).toEqual([{ villa: 700, status: "COMPLETE" }, { villa: 701, status: "COMPLETE" }, { villa: 702, status: "COMPLETE" }]);
    const history = await client.query("SELECT h.from_status AS \"from\", h.to_status AS \"to\" FROM pmc_unit_activity_history h JOIN pmc_unit_activity_progress p ON p.id = h.unit_activity_progress_id JOIN pmc_units u ON u.id = p.unit_id WHERE p.tenant_id = $1 AND u.unit_number = 700 ORDER BY h.changed_at", [a.tenantId]);
    expect(history.rows).toEqual([{ from: null, to: "IN_PROGRESS" }, { from: "IN_PROGRESS", to: "COMPLETE" }]);
  });

  it("NEGATIVE: a file with a villa the project does not have is still refused at the plan, and nothing is written", async () => {
    const db = (await getDb())!;
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("status");
    sheet.addRow(["Unit", "Activity", "Status"]); sheet.addRow([999, "ACT01", "Complete"]);
    const before = (await client.query("SELECT count(*)::int AS n FROM pmc_unit_activity_history WHERE tenant_id = $1", [a.tenantId])).rows[0].n;
    const prepared = await prepareRows(db, { userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId, kind: "status" }, await parsePmcImportFile({ kind: "status", format: "xlsx", bytes: new Uint8Array(await book.xlsx.writeBuffer()) }), "synthetic-hash-2");
    expect(prepared.apply).toBeNull();
    expect(prepared.report.errors.length).toBeGreaterThan(0);
    expect((await client.query("SELECT count(*)::int AS n FROM pmc_unit_activity_history WHERE tenant_id = $1", [a.tenantId])).rows[0].n).toBe(before);
  });
});
