import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { confirmP6Import } from "./p6Import";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-61 (2) on a real database: a P6 file shaped like the owner's (… > PH1 > block B25 > villa V606, activities V606.Q02 …, activity codes «Villa Type»,
// «Block», «Q Item») goes through the platform's own P6 importer; the schedule is then set against the project's villas. Synthetic data only.
const XER = () => {
  const wbs: Array<[number, number | "", string, string, "Y" | "N"]> = [[1, "", "Q61", "Synthetic project", "Y"], [2, 1, "CN", "Construction", "N"], [3, 2, "PH1", "Phase 1", "N"],
    [4, 3, "B25", "Block 25", "N"], [5, 4, "V606", "Villa 606", "N"], [6, 4, "V607", "Villa 607", "N"], [7, 3, "B26", "Block 26", "N"], [8, 7, "V701", "Villa 701", "N"], [9, 2, "MOB", "Mobilisation", "N"]];
  const tasks: Array<[number, number, string, string]> = [[11, 5, "V606.Q02", "Excavation V606"], [12, 5, "V606.Q06", "Roof slab V606"], [13, 6, "V607.Q02", "Excavation V607"],
    [14, 8, "V701.Q02", "Excavation V701"], [15, 9, "V999.Q02", "Excavation V999"], [16, 9, "MOB-01", "Site set-up"]];
  // code types 1 Villa Type, 2 Block, 3 Q Item; values per type
  const values: Array<[number, number, string]> = [[101, 1, "type C"], [102, 1, "type D"], [201, 2, "B25"], [202, 2, "B26"], [301, 3, "Q02"], [302, 3, "Q06"]];
  const assign: Array<[number, number, number]> = [[11, 1, 101], [11, 2, 201], [11, 3, 301], [12, 1, 101], [12, 2, 201], [12, 3, 302], [13, 1, 102], [13, 2, 201], [13, 3, 301],
    [14, 1, 101], [14, 2, 202], [14, 3, 301], [15, 1, 101], [15, 3, 301]];
  return [
    "ERMHDR\t25.12\t2026-11-01\tProject\tadmin\tadmin\tdb\tProject Management\tSAR",
    "%T\tPROJECT", "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tlast_recalc_date", "%R\t900\tQ61\t2026-01-01 08:00\t2027-06-30 17:00\t2026-11-01 00:00",
    "%T\tPROJWBS", "%F\twbs_id\tproj_id\tproj_node_flag\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id", ...wbs.map(([id, parent, code, name, root], i) => `%R\t${id}\t900\t${root}\t${i}\t${code}\t${name}\t${parent}`),
    "%T\tTASK", "%F\ttask_id\tproj_id\twbs_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date",
    ...tasks.map(([id, w, code, name]) => `%R\t${id}\t900\t${w}\tTT_Task\tTK_NotStart\t${code}\t${name}\t2026-02-01 08:00\t2026-03-01 17:00`),
    "%T\tACTVTYPE", "%F\tactv_code_type_id\tactv_short_len\tseq_num\tactv_code_type\tactv_code_type_scope", "%R\t1\t8\t1\tVilla Type\tAS_Project", "%R\t2\t8\t2\tBlock\tAS_Project", "%R\t3\t8\t3\tQ Item\tAS_Project",
    "%T\tACTVCODE", "%F\tactv_code_id\tparent_actv_code_id\tactv_code_type_id\tactv_code_name\tshort_name\tseq_num", ...values.map(([id, type, short], i) => `%R\t${id}\t\t${type}\t${short}\t${short}\t${i}`),
    "%T\tTASKACTV", "%F\ttask_id\tactv_code_type_id\tactv_code_id", ...assign.map(([task, type, value]) => `%R\t${task}\t${type}\t${value}`),
    "%E",
  ].join("\r\n");
};

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-61 (2): the P6 schedule set against the project's villas", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q61a" }); b = await createRoleFixture({ label: "q61b" });
    // the project's villas: 606 and 607 in block 25 (both model C — the schedule says 607 is D), 701 in block 26, and 702 that no activity names
    const zone = randomUUID(); const b25 = randomUUID(); const b26 = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $3, $4, $5, '25', 'Block 25'), ($2, $3, $4, $5, '26', 'Block 26')", [b25, b26, a.tenantId, a.projectId, zone]);
    for (const [number, block, model] of [[606, b25, "C"], [607, b25, "C"], [701, b26, "C"], [702, b26, "D"]] as const)
      await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, $5, $6)", [randomUUID(), a.tenantId, a.projectId, block, number, model]);
    await confirmP6Import({ userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId, bytes: new Uint8Array(Buffer.from(XER(), "utf8")), source: { key: "q61/schedule.xer", name: "schedule.xer" } });
  });
  afterAll(async () => {
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: the project manager reads each villa's activities and Q items; mobilisation has no villa", async () => {
    const links = await a.callerFor(a.people.pm).schedule.villaLinks({ tenantId: a.tenantId, projectId: a.projectId });
    expect(links).toMatchObject({ villasInSchedule: 4, villasMatched: 3 });
    expect(links.linkedActivities).toBe(5); // the six P6 activities, less the site set-up (the fixture's own activities have no villa either)
    expect(links.villas).toEqual([
      { unitNumber: 606, activities: 2, inProject: true, qItems: ["Q02", "Q06"] }, { unitNumber: 607, activities: 1, inProject: true, qItems: ["Q02"] },
      { unitNumber: 701, activities: 1, inProject: true, qItems: ["Q02"] }, { unitNumber: 999, activities: 1, inProject: false, qItems: ["Q02"] },
    ]);
  });

  it("NEGATIVE: the differences are shown and nothing is changed; project.read without PMC read (accountant, procurement) and another company read nothing", async () => {
    const links = await a.callerFor(a.people.pm).schedule.villaLinks({ tenantId: a.tenantId, projectId: a.projectId });
    expect(links.mismatches).toEqual([{ unitNumber: 607, field: "model", schedule: "type D", project: "C", activities: 1 }]);
    expect(links.missingInProject).toEqual([999]);
    expect(links.withoutActivities).toEqual([702]);
    const { rows: [unit] } = await client.query("SELECT model_code FROM pmc_units WHERE tenant_id = $1 AND project_id = $2 AND unit_number = 607", [a.tenantId, a.projectId]);
    expect(unit.model_code).toBe("C"); // read only: the project's villa keeps its model
    // review of #550 (B): the villas are PMC data — project.read alone does not open them
    await expect(a.callerFor(a.people.accountant).schedule.villaLinks({ tenantId: a.tenantId, projectId: a.projectId })).rejects.toThrow(/PERMISSION|FORBIDDEN|denied/i);
    await expect(a.callerFor(a.people.procurement).schedule.villaLinks({ tenantId: a.tenantId, projectId: a.projectId })).rejects.toThrow(/PERMISSION|FORBIDDEN|denied/i);
    await expect(b.asOwner.schedule.villaLinks({ tenantId: a.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(b.asOwner.schedule.villaLinks({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
  });
});
