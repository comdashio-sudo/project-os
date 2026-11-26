import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { confirmP6Import } from "./p6Import";
import { getPlannedCurve } from "./plannedCurveService";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-61 (4) on a real database, shaped as the adviser asked: 40 villas (two blocks, the second a month later), each with its activities in three schedule
// stages («Q Item» Q02, Q06, Q20) and one villa the project does not have, through the platform's own P6 importer (the first import is the baseline). Weights
// of model C: W1 40% across Q02, W2 30% at the start of Q06 (factory production), W3 30% at the finish of Q20. Synthetic data only.
const VILLAS = Array.from({ length: 40 }, (_, i) => 601 + i);
const STAGES: Array<[string, string, number, number]> = [["Q02", "Substructure works", 0, 40], ["Q06", "Roof installation", 40, 60], ["Q20", "Boundary fences", 60, 75]]; // code, name, start day, finish day
const day0 = Date.UTC(2026, 0, 1);
const at = (days: number) => new Date(day0 + days * 86_400_000);
const stamp = (date: Date) => `${date.toISOString().slice(0, 10)} 00:00`;
const XER = (shiftDays = 0) => {
  const all = [...VILLAS, 999];
  const wbs = ["%R\t1\t900\tY\t0\tQ64\tSynthetic villas\t", "%R\t2\t900\tN\t1\tB25\tBlock 25\t1", "%R\t3\t900\tN\t2\tB26\tBlock 26\t1", ...all.map((v, i) => `%R\t${10 + i}\t900\tN\t${i + 3}\tV${v}\tVilla ${v}\t${v < 621 || v === 999 ? 2 : 3}`)];
  const tasks: string[] = []; const assign: string[] = []; let id = 1000;
  all.forEach((v, i) => STAGES.forEach(([, name, s, f], j) => {
    id += 1; const offset = (v >= 621 && v !== 999 ? 31 : 0) + shiftDays;
    tasks.push(`%R\t${id}\t900\t${10 + i}\tTT_Task\tTK_NotStart\tV${v}.${j + 1}0\t${name} V${v}\t${stamp(at(s + offset))}\t${stamp(at(f + offset))}`);
    assign.push(`%R\t${id}\t3\t${301 + j}`);
  }));
  return ["ERMHDR\t25.12\t2026-01-01\tProject\tadmin\tadmin\tdb\tProject Management\tSAR",
    "%T\tPROJECT", "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tlast_recalc_date", "%R\t900\tQ64\t2026-01-01 00:00\t2026-06-30 00:00\t2026-01-01 00:00",
    "%T\tPROJWBS", "%F\twbs_id\tproj_id\tproj_node_flag\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id", ...wbs,
    "%T\tTASK", "%F\ttask_id\tproj_id\twbs_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date", ...tasks,
    "%T\tACTVTYPE", "%F\tactv_code_type_id\tactv_short_len\tseq_num\tactv_code_type\tactv_code_type_scope", "%R\t3\t8\t1\tQ Item\tAS_Project",
    "%T\tACTVCODE", "%F\tactv_code_id\tparent_actv_code_id\tactv_code_type_id\tactv_code_name\tshort_name\tseq_num", ...STAGES.map(([code, name], j) => `%R\t${301 + j}\t\t3\t${name}\t${code}\t${j}`),
    "%T\tTASKACTV", "%F\ttask_id\tactv_code_type_id\tactv_code_id", ...assign, "%E"].join("\r\n");
};

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-61 (4): the planned curve per villa and project from the P6 baseline", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const groupIds: Record<string, string> = {};
  const scope = () => ({ tenantId: a.tenantId, projectId: a.projectId });

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q64a" }); b = await createRoleFixture({ label: "q64b" });
    for (const [code, name, weight] of [["W1", "Substructure", 40], ["W2", "Factory production", 30], ["W3", "Boundary fences", 30], ["W4", "Unused", 0]] as const) {
      const g = randomUUID(); const s = randomUUID(); groupIds[code] = g;
      await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,$4,$5)", [g, a.tenantId, a.projectId, code, name]);
      await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,$5,$6)", [s, a.tenantId, a.projectId, g, `${code}-S`, name]);
      await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$2,$3,$4,$5,'C',$6,$7,$8)", [randomUUID(), a.tenantId, a.projectId, g, s, `${code}-A`, name, weight]);
    }
    const zone = randomUUID(); const b25 = randomUUID(); const b26 = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$3,$4,$5,'25','Block 25'), ($2,$3,$4,$5,'26','Block 26')", [b25, b26, a.tenantId, a.projectId, zone]);
    for (const v of VILLAS) await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1,$2,$3,$4,$5,'C')", [randomUUID(), a.tenantId, a.projectId, v < 621 ? b25 : b26, v]);
    await confirmP6Import({ userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId, bytes: new Uint8Array(Buffer.from(XER(), "utf8")), source: { key: "q64/baseline.xer", name: "baseline.xer" } });
  });
  afterAll(async () => {
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("NEGATIVE: with a weighted group not linked the curve is not computed, and the group is named", async () => {
    await a.callerFor(a.people.planner).schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.W1, stageCodes: ["Q02"], anchor: "span" }, { groupId: groupIds.W2, stageCodes: ["Q06"], anchor: "start" }] });
    const result = await a.callerFor(a.people.site).schedule.plannedCurve(scope());
    expect(result).toMatchObject({ ready: false, reason: "LINKS_INCOMPLETE", readiness: { unlinked: ["W3"] } });
  });

  it("POSITIVE: a villa's curve equals the hand calculation; the project ends at 100; the later block a month behind; the villa the project lacks is left out", async () => {
    await a.callerFor(a.people.planner).schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.W3, stageCodes: ["Q20"], anchor: "end" }] });
    const result = await a.callerFor(a.people.site).schedule.plannedCurve(scope());
    if (!result.ready) throw new Error(`not ready: ${result.reason}`);
    expect(result.months).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    const v601 = result.villas.find(row => row.unitNumber === 601)!;
    // Jan end: Q02 31 of 40 days × 40 = 31. Feb end: Q02 done (40) + Q06 started on day 40 = Feb 10 (30) = 70. Mar end: Q20 finished on day 75 = Mar 17 → 100
    expect(v601.curve.map(point => point.planned)).toEqual([31, 70, 100, 100]);
    const v621 = result.villas.find(row => row.unitNumber === 621)!;
    // a month later (day 31): Jan 0; Feb end ≈ day 59 → (59 − 31) of 40 × 40 = 28; Mar end ≈ day 90 → 40 + 30 (Q06 from day 71) = 70; Apr → 100
    expect(v621.curve.map(point => point.planned)).toEqual([0, 28, 70, 100]);
    expect(result.project.at(-1)!.planned).toBe(100);
    expect(result.project.map(point => point.planned)).toEqual([15.5, 49, 85, 100]); // 20 villas each way, equal unit weight
    expect(result.villas.map(row => row.unitNumber)).not.toContain(999);
    expect(result.villas).toHaveLength(40);
    expect(result.gaps).toEqual([]);
    expect(result.blocks.map(row => row.key)).toEqual(["25", "26"]);
  });

  it("a later import that moves every date does not move the plan: the baseline's dates are read, not the activities' current ones", async () => {
    const before = await a.callerFor(a.people.site).schedule.plannedCurve(scope());
    await confirmP6Import({ userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId, bytes: new Uint8Array(Buffer.from(XER(45), "utf8")), source: { key: "q64/later.xer", name: "later.xer" } });
    const after = await a.callerFor(a.people.site).schedule.plannedCurve(scope());
    if (!before.ready || !after.ready) throw new Error("not ready");
    expect(after.baseline.id).toBe(before.baseline.id);
    expect(after.project).toEqual(before.project);
  });

  it("NEGATIVE: without project.pmc.read, or from another company, the curve is refused", async () => {
    await expect(a.callerFor(a.people.accountant).schedule.plannedCurve(scope())).rejects.toThrow();
    await expect(b.asOwner.schedule.plannedCurve(scope())).rejects.toThrow();
    await expect(b.asOwner.schedule.plannedCurve({ tenantId: b.tenantId, projectId: a.projectId })).rejects.toThrow();
  });

  it("planned today against the site's actual: with no site activities set up there is no actual (null), never «everyone behind»", async () => {
    const result = await getPlannedCurve({ userId: a.owner.id, ...scope(), now: at(20) });
    if (!result.ready) throw new Error("not ready");
    expect(result.villas.find(row => row.unitNumber === 601)!.plannedNow).toBe(20); // 20 of 40 days × 40
    expect(result.projectActual).toBeNull();
    expect(result.behind).toEqual([]);
  });

  it("POSITIVE: planned today against the site's actual — a villa ahead is not behind, its neighbours with nothing done are, a villa not yet planned is not", async () => {
    // the site's own list: two activities of half a villa each; villa 601 has the first done
    const sa1 = randomUUID(); const sa2 = randomUUID();
    await client.query("INSERT INTO pmc_site_activities (id, tenant_id, project_id, code, csi_name, name, weight, sort_order) VALUES ($1,$3,$4,'SA1','03','Foundations (synthetic)',0.5,1), ($2,$3,$4,'SA2','09','Finishes (synthetic)',0.5,2)", [sa1, sa2, a.tenantId, a.projectId]);
    const { rows: [unit] } = await client.query("SELECT id FROM pmc_units WHERE tenant_id = $1 AND project_id = $2 AND unit_number = 601", [a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_site_cells (id, tenant_id, project_id, unit_id, site_activity_id, status, status_on, done_on) VALUES ($1,$2,$3,$4,$5,'DONE','2026-01-20','2026-01-20')", [randomUUID(), a.tenantId, a.projectId, unit.id, sa1]);
    const result = await getPlannedCurve({ userId: a.owner.id, ...scope(), now: at(20) });
    if (!result.ready) throw new Error("not ready");
    expect(result.villas.find(row => row.unitNumber === 601)).toMatchObject({ plannedNow: 20, actual: 50, gap: 30 });
    expect(result.villas.find(row => row.unitNumber === 621)).toMatchObject({ plannedNow: 0, actual: 0, gap: 0 });
    expect(result.behind).toHaveLength(19); // the rest of block 25: planned 20, nothing done
    expect(result.behind[0]).toMatchObject({ blockCode: "25", plannedNow: 20, actual: 0, gap: -20 });
    expect(result.behind.map(row => row.unitNumber)).not.toContain(601);
    expect(result.projectNow).toBe(10); // (20 × 20 + 0 × 20) / 40
    expect(result.projectActual).toBe(1.25); // 50 / 40
  });
});

