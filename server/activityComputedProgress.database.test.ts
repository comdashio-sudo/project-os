import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { confirmP6Import } from "./p6Import";
import { deleteTenantData } from "./tenantData";
import { siteToday } from "./wo22Shared";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-71 (1) batch 2 on a real database: three villas, each with an activity in two schedule stages («Q Item» Q02 and Q06), and one villa the project does
// not have, through the platform's own P6 importer. Weights of model C: W1 60% (walls) linked to Q02, W2 40% (roof) linked to Q06. A villa's Q02 activity
// is computed from its W1 cells, its Q06 activity from its W2 cells — read-only, with its groups. Synthetic data only.
const VILLAS = [701, 702, 703];
const STAGES: Array<[string, string]> = [["Q02", "Blockwork"], ["Q06", "Roof"]];
const XER = () => {
  const all = [...VILLAS, 999];
  const wbs = ["%R\t1\t900\tY\t0\tQ71\tSynthetic villas\t", "%R\t2\t900\tN\t1\tB31\tBlock 31\t1", ...all.map((v, i) => `%R\t${10 + i}\t900\tN\t${i + 2}\tV${v}\tVilla ${v}\t2`)];
  const tasks: string[] = []; const assign: string[] = []; let id = 1000;
  all.forEach((v, i) => STAGES.forEach(([, name], j) => {
    id += 1;
    tasks.push(`%R\t${id}\t900\t${10 + i}\tTT_Task\tTK_NotStart\tV${v}.${j + 1}0\t${name} V${v}\t2026-01-0${j + 1} 00:00\t2026-02-0${j + 1} 00:00`);
    assign.push(`%R\t${id}\t3\t${301 + j}`);
  }));
  return ["ERMHDR\t25.12\t2026-01-01\tProject\tadmin\tadmin\tdb\tProject Management\tSAR",
    "%T\tPROJECT", "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tlast_recalc_date", "%R\t900\tQ71\t2026-01-01 00:00\t2026-06-30 00:00\t2026-01-01 00:00",
    "%T\tPROJWBS", "%F\twbs_id\tproj_id\tproj_node_flag\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id", ...wbs,
    "%T\tTASK", "%F\ttask_id\tproj_id\twbs_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date", ...tasks,
    "%T\tACTVTYPE", "%F\tactv_code_type_id\tactv_short_len\tseq_num\tactv_code_type\tactv_code_type_scope", "%R\t3\t8\t1\tQ Item\tAS_Project",
    "%T\tACTVCODE", "%F\tactv_code_id\tparent_actv_code_id\tactv_code_type_id\tactv_code_name\tshort_name\tseq_num", ...STAGES.map(([code, name], j) => `%R\t${301 + j}\t\t3\t${name}\t${code}\t${j}`),
    "%T\tTASKACTV", "%F\ttask_id\tactv_code_type_id\tactv_code_id", ...assign, "%E"].join("\r\n");
};

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-71 (1) batch 2: each P6 activity's progress computed from the villas' PMC cells", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const groupIds: Record<string, string> = {};
  const scope = () => ({ tenantId: a.tenantId, projectId: a.projectId });
  const byCode = async () => {
    const result = await a.callerFor(a.people.site).schedule.computedProgress(scope());
    const codes = new Map((await client.query("SELECT id, code FROM activities WHERE tenant_id = $1 AND project_id = $2", [a.tenantId, a.projectId])).rows.map(row => [row.id, row.code]));
    return { linked: result.linked, rows: Object.fromEntries(result.activities.map(row => [codes.get(row.activityId), row])) };
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q71p6a" }); b = await createRoleFixture({ label: "q71p6b" });
    for (const [code, name, weight] of [["W1", "Walls", 60], ["W2", "Roof", 40]] as const) {
      const g = randomUUID(); const s = randomUUID(); groupIds[code] = g;
      await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,$4,$5)", [g, a.tenantId, a.projectId, code, name]);
      await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,$5,$6)", [s, a.tenantId, a.projectId, g, `${code}-S`, name]);
      await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$2,$3,$4,$5,'C',$6,$7,$8)", [randomUUID(), a.tenantId, a.projectId, g, s, `${code}-A`, name, weight]);
    }
    const zone = randomUUID(); const block = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'31','Block 31')", [block, a.tenantId, a.projectId, zone]);
    for (const v of VILLAS) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1,$2,$3,$4,$5,'C')", [randomUUID(), a.tenantId, a.projectId, block, v]);
    // the project's own factor for «in progress» (the default is 0): the computed percent follows the project's factors
    await client.query("INSERT INTO pmc_status_factors (id, tenant_id, project_id, status, factor) VALUES ($1,$2,$3,'IN_PROGRESS',0.5)", [randomUUID(), a.tenantId, a.projectId]);
    await confirmP6Import({ userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId, bytes: new Uint8Array(Buffer.from(XER(), "utf8")), source: { key: "q71/schedule.xer", name: "schedule.xer" } });
  });
  afterAll(async () => {
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("before any stage is linked nothing is computed (linked: false), never a column of zeros", async () => {
    expect(await byCode()).toEqual({ linked: false, rows: {} });
  });

  it("POSITIVE: once linked, villa 701's Q02 follows its walls cell and its Q06 its roof cell; a cell moved by the site moves the activity", async () => {
    await a.callerFor(a.people.planner).schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.W1, stageCodes: ["Q02"], anchor: "span" }, { groupId: groupIds.W2, stageCodes: ["Q06"], anchor: "start" }] });
    await a.asOwner.pmc.updateProgress({ ...scope(), activityCode: "W1-A", villas: ["701"], status: "COMPLETE", date: siteToday() });
    await a.asOwner.pmc.updateProgress({ ...scope(), activityCode: "W2-A", villas: ["701", "702"], status: "IN_PROGRESS", date: siteToday() });
    const { linked, rows } = await byCode();
    expect(linked).toBe(true);
    expect(rows["V701.10"]).toMatchObject({ villa: 701, stage: "Q02", percent: 100, reason: null, groupCodes: ["W1"] });
    expect(rows["V701.20"]).toMatchObject({ villa: 701, stage: "Q06", percent: 50, reason: null, groupCodes: ["W2"] });
    expect(rows["V702.10"]).toMatchObject({ percent: 0, reason: null }); // linked and weighted, nothing done yet: a real 0
    expect(rows["V703.20"]).toMatchObject({ percent: 0, reason: null });
  });

  it("NEGATIVE: the villa the project does not have says so by name; a reader without PMC read and another company are refused", async () => {
    const { rows } = await byCode();
    expect(rows["V999.10"]).toMatchObject({ villa: 999, percent: null, reason: "VILLA_NOT_IN_PROJECT" });
    await expect(a.callerFor(a.people.hr).schedule.computedProgress(scope())).rejects.toThrow(/PROJECT_OS_(PERMISSION_DENIED|PMC_)/);
    await expect(b.asOwner.schedule.computedProgress(scope())).rejects.toThrow(/PROJECT_OS_(TENANT_ACCESS_DENIED|PERMISSION_DENIED)/);
  });
});
