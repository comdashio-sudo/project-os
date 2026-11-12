import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// The tester's reproduction on #248 @ a1ebd84 (a villa complete on two days counted twice), kept as a regression test, with the operator's rule of 11-11:
// a villa is complete in the period of its FIRST approved completion only; the cumulative counts each villa once; a repeat later adds nothing.
const uuid = () => crypto.randomUUID();
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("QA 248 villa counted once", () => {
  let a: Awaited<ReturnType<typeof createRoleFixture>>; let owner: pg.Client; const act = uuid(); const act2 = uuid(); let units: string[] = [];
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    a = await createRoleFixture({ label: "qa248-villa" }); const q = (t: string, v: unknown[]) => owner.query(t, v); const T = a.tenantId, P = a.projectId;
    const zone = uuid(), block = uuid(), group = uuid(), stage = uuid();
    await q("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Z')", [zone, T, P]);
    await q("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'B1','B')", [block, T, P, zone]);
    await q("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) SELECT gen_random_uuid()::text, $1, $2, $3, n, 'A' FROM generate_series(1, 10) n", [T, P, block]);
    units = (await q("SELECT id FROM pmc_units WHERE project_id=$1 ORDER BY unit_number", [P])).rows.map((r: { id: string }) => r.id);
    await q("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'G','G')", [group, T, P]);
    await q("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,'S','S')", [stage, T, P, group]);
    await q("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$3,$4,$5,$6,'A','WALL','Walls',50), ($2,$3,$4,$5,$6,'A','SLAB','Slab',50)", [act, act2, T, P, group, stage]);
    const report = async (date: string, by: number, entries: Array<[string, string]>) => {
      const rep = uuid(); await q("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status) VALUES ($1,$2,$3,$4,$5,'approved')", [rep, T, P, date, by]);
      for (const [activity, unit] of entries) await q("INSERT INTO site_daily_report_lines (id, tenant_id, project_id, report_id, line_type, pmc_activity_definition_id, pmc_unit_id, description, reported_status) VALUES ($1,$2,$3,$4,'work',$5,$6,'line','COMPLETE')", [uuid(), T, P, rep, activity, unit]);
    };
    // week Sun 2026-10-11..Sat 10-17: villa 0 complete on 10-12 AND 10-13 (WALL); villa 1 only 10-12; villa 2 on 10-14 and 10-14 twice in the same report
    await report("2026-10-12", a.owner.id, [[act, units[0]], [act, units[1]], [act2, units[0]]]);
    await report("2026-10-13", a.people.pm.id, [[act, units[0]]]);
    await report("2026-10-14", a.owner.id, [[act, units[2]], [act, units[2]]]);
    // next week (10-18..10-24): villa 0 complete again on 10-19, villa 3 first time on 10-20
    await report("2026-10-19", a.owner.id, [[act, units[0]]]);
    await report("2026-10-20", a.owner.id, [[act, units[3]]]);
  });
  afterAll(async () => { await owner.end(); });
  const wall = async (kind: "week" | "month", anchor: string) => { const r = await a.callerFor(a.owner).reportPeriods.get({ tenantId: a.tenantId, projectId: a.projectId, kind, anchor }); return { wall: r.activities.find(x => x.activityId === act)!, slab: r.activities.find(x => x.activityId === act2)! }; };
  it("one villa complete on two days counts as 1", async () => {
    const w1 = await wall("week", "2026-10-11"); const w2 = await wall("week", "2026-10-18"); const m = await wall("month", "2026-10-01");
    const out = {
      week1: { period: w1.wall.period.completedUnits, cumulative: w1.wall.cumulative.completedUnits, daily: w1.wall.daily.map(d => [d.date, d.completedUnits]) , slab: w1.slab.period.completedUnits },
      week2: { period: w2.wall.period.completedUnits, cumulative: w2.wall.cumulative.completedUnits, daily: w2.wall.daily.map(d => [d.date, d.completedUnits]), pct: w2.wall.cumulative.completedPercentOfUnits },
      month: { period: m.wall.period.completedUnits, cumulative: m.wall.cumulative.completedUnits, pct: m.wall.cumulative.completedPercentOfUnits },
    };
    expect(out.month.pct).toBe(40); // 4 of 10 villas
    // distinct villas complete: week1 = villas 0,1,2 = 3 ; cumulative at end of week1 = 3 ; month = villas 0,1,2,3 = 4 ; cumulative at month end = 4
    expect(w1.wall.period.completedUnits).toBe(3);
    expect(w1.wall.cumulative.completedUnits).toBe(3);
    expect(m.wall.period.completedUnits).toBe(4);
    expect(m.wall.cumulative.completedUnits).toBe(4);
    expect(w2.wall.cumulative.completedUnits).toBe(4);
    expect(w2.wall.period.completedUnits).toBe(1); // villa 3 only: villa 0's repeat on 10-19 belongs to its first week
    expect(w2.wall.daily.map(d => [d.date, d.completedUnits])).toEqual([["2026-10-19", 1], ["2026-10-20", 1]]); // the daily series still shows what each day reported
    expect(w1.slab.period.completedUnits).toBe(1);
  });
});
