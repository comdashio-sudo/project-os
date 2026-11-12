import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// D-53 (a) on the test database, as the restricted application role, through the real procedure: a P6 schedule (two tasks and three milestones, imported shape:
// an external id), approved daily reports with villa completions, and an earned-value snapshot. The S-curve is compared with the schedule as imported, the month with the
// sum of its weeks, and the money with the permission that may see it. Synthetic data only.
const uuid = () => crypto.randomUUID();

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("monthly report data (D-53 a)", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let bare: Fixture; let owner: pg.Client;
  const wall = uuid(), slab = uuid();
  const actuals: Array<{ date: string; actual: number }> = [];

  beforeAll(async () => {
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    a = await createRoleFixture({ label: "monthly-a" }); bare = await createRoleFixture({ label: "monthly-bare" });
    const q = (text: string, values: unknown[]) => owner.query(text, values);
    const T = a.tenantId, P = a.projectId;
    const zone = uuid(), block = uuid(), group = uuid(), stage = uuid();
    await q("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone')", [zone, T, P]);
    await q("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'B1','Block')", [block, T, P, zone]);
    await q("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) SELECT gen_random_uuid()::text, $1, $2, $3, n, 'A' FROM generate_series(1, 10) n", [T, P, block]);
    const units = (await q("SELECT id FROM pmc_units WHERE project_id = $1 ORDER BY unit_number", [P])).rows.map((row: { id: string }) => row.id);
    await q("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'G','G')", [group, T, P]);
    await q("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,'S','S')", [stage, T, P, group]);
    await q("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$3,$4,$5,$6,'A','WALL','Walls',60), ($2,$3,$4,$5,$6,'A','SLAB','Slab',40)", [wall, slab, T, P, group, stage]);
    // the P6 schedule as the importer stores it: two tasks (1,000 in September; 3,000 across October and November) and three milestones
    const act = (code: string, type: string, start: string, finish: string, value: number, actualFinish: string | null) =>
      q("INSERT INTO activities (id, tenant_id, project_id, code, name, external_id, task_type, planned_start_at, planned_finish_at, planned_value, duration_hours, actual_finish_at) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,80,$10)", [uuid(), T, P, code, `x-${code}`, type, `${start}T08:00:00Z`, `${finish}T17:00:00Z`, value, actualFinish ? `${actualFinish}T12:00:00Z` : null]);
    await act("T1", "TT_Task", "2026-09-01", "2026-09-30", 1000, null);
    await act("T2", "TT_Task", "2026-10-01", "2026-11-30", 3000, null);
    await act("M-DONE-LATE", "TT_Mile", "2026-10-10", "2026-10-10", 0, "2026-10-14");
    await act("M-LATE", "TT_FinMile", "2026-09-20", "2026-09-20", 0, null);
    await act("M-AHEAD", "TT_Mile", "2026-12-15", "2026-12-15", 0, null);
    // approved dailies in October: each day a metred actual on SLAB, and villa completions on WALL (villa 0 twice: it counts once, in its first week)
    const report = async (date: string, lines: Array<[string, string | null, number | null, boolean]>) => {
      const id = uuid();
      await q("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status) VALUES ($1,$2,$3,$4,$5,'approved')", [id, T, P, date, a.owner.id]);
      for (const [activity, unit, actual, complete] of lines) await q("INSERT INTO site_daily_report_lines (id, tenant_id, project_id, report_id, line_type, pmc_activity_definition_id, pmc_unit_id, description, actual_quantity, reported_status) VALUES ($1,$2,$3,$4,'work',$5,$6,'line',$7,$8)", [uuid(), T, P, id, activity, unit, actual, complete ? "COMPLETE" : null]);
    };
    for (let d = 1; d <= 31; d++) {
      const date = `2026-10-${String(d).padStart(2, "0")}`;
      const actual = 10 + (d % 4);
      actuals.push({ date, actual });
      const villas: Array<[string, string | null, number | null, boolean]> = d <= 5 ? [[wall, units[d - 1], null, true]] : d === 20 ? [[wall, units[0], null, true]] : [];
      await report(date, [[slab, null, actual, false], ...villas]);
    }
    await q("INSERT INTO evm_snapshots (id, tenant_id, project_id, period_at, pv, ev, ac, bac, cv, sv, eac, etc, vac, eac_method, cpi, spi) VALUES ($1,$2,$3,'2026-10-31T20:00:00Z',2000,1800,1900,4000,-100,-200,4222.22,2322.22,-222.22,'bac_over_cpi',0.9474,0.9)", [uuid(), T, P]);
  });
  afterAll(async () => { await owner.end(); });

  const monthly = (fixture: Fixture, who: keyof Fixture["people"], month = "2026-10") => {
    const caller = fixture.callerFor(fixture.people[who]);
    return caller.reportPeriods.monthly({ tenantId: fixture.tenantId, projectId: fixture.projectId, month });
  };

  it("the planned S-curve is the imported P6 schedule, spread over its planned days; the actual one is the dailies' completions", async () => {
    const result = await monthly(a, "pm");
    expect(result.sCurve.plannedSource).toBe("p6");
    const point = (month: string) => result.sCurve.points.find(p => p.month === month)!;
    expect(point("2026-09").planned).toBe(25);
    expect(point("2026-10").planned).toBeCloseTo(((1000 + 3000 * (31 / 61)) / 4000) * 100, 3);
    // 5 villas first completed in October × WALL 60% ÷ 10 villas = 30% (villa 0's repeat on the 20th adds nothing)
    expect(point("2026-09").actual).toBe(0);
    expect(point("2026-10").actual).toBe(30);
    expect(result.sCurve.points.map(p => p.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("the month's figures are the sum of its weeks (actual quantities and villas first completed)", async () => {
    const result = await monthly(a, "pm");
    const caller = a.callerFor(a.people.pm);
    const weeks = await Promise.all(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"].map(anchor => caller.reportPeriods.get({ tenantId: a.tenantId, projectId: a.projectId, kind: "week", anchor })));
    const of = (r: typeof weeks[number], id: string) => r.activities.find(row => row.activityId === id);
    expect(weeks.reduce((sum, w) => sum + (of(w, slab)?.period.actual ?? 0), 0)).toBe(of(result, slab)!.period.actual);
    expect(of(result, slab)!.period.actual).toBe(actuals.reduce((sum, row) => sum + row.actual, 0));
    expect(weeks.reduce((sum, w) => sum + (of(w, wall)?.period.completedUnits ?? 0), 0)).toBe(of(result, wall)!.period.completedUnits);
    expect(of(result, wall)!.period.completedUnits).toBe(5);
  });

  it("milestones at the month's end, from the P6 schedule", async () => {
    const result = await monthly(a, "pm");
    expect(result.milestones.map(m => [m.code, m.state, m.varianceDays])).toEqual([["M-LATE", "late", 41], ["M-DONE-LATE", "done_late", 4], ["M-AHEAD", "ahead", null]]);
  });

  it("earned value only for the financial permission: the project manager sees the month's snapshot, the site engineer sees null and financialHidden", async () => {
    const pm = await monthly(a, "pm");
    expect(pm.financialHidden).toBe(false);
    expect(pm.earnedValue).toMatchObject({ asOf: "2026-10-31", pv: 2000, ev: 1800, ac: 1900, spi: 0.9, cpi: 0.9474 });
    const site = await monthly(a, "site");
    expect(site.financialHidden).toBe(true); expect(site.earnedValue).toBeNull();
    expect(site.sCurve.points.length).toBeGreaterThan(0); // the curves are not money
  });

  it("NEGATIVE: with no imported schedule the planned line is absent (null), never taken from the actuals; another company and a bad month are refused", async () => {
    const result = await monthly(bare, "pm");
    expect(result.sCurve.plannedSource).toBeNull();
    expect(result.sCurve.points.every(p => p.planned === null)).toBe(true);
    const caller = bare.callerFor(bare.owner);
    await expect(caller.reportPeriods.monthly({ tenantId: a.tenantId, projectId: a.projectId, month: "2026-10" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(monthly(a, "pm", "2026-13")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
