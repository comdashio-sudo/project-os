import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// D-48 on the test database, as the restricted application role, through the real procedure: a project of 1,230 units with six weeks of daily reports.
// Every expected figure is added up HERE from the rows the test wrote (not read back through the engine), so "matches the dailies" is a real comparison.
// Synthetic data only.
const uuid = () => crypto.randomUUID();
const isFriday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 5;
const daysBetween = (from: string, to: string) => { const out: string[] = []; for (let at = Date.parse(`${from}T00:00:00Z`); at <= Date.parse(`${to}T00:00:00Z`); at += 86_400_000) out.push(new Date(at).toISOString().slice(0, 10)); return out; };

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("period engine (D-48)", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let owner: pg.Client;
  const UNITS = 1230;
  const act = { wallA: uuid(), finishA: uuid(), wallB: uuid() };
  const lines: Array<{ date: string; activity: string; unit: string | null; planned: number | null; actual: number | null; complete: boolean }> = [];
  const reportOn = new Map<string, string>();
  let unitB = "";
  const labour: Array<{ date: string; category: "direct" | "indirect"; shift: "day" | "night"; headcount: number; hours: number }> = [];
  const reportDays = daysBetween("2026-10-01", "2026-11-13").filter(day => !isFriday(day));
  const week = { start: "2026-11-07", end: "2026-11-13" };

  beforeAll(async () => {
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    a = await createRoleFixture({ label: "period-a" }); b = await createRoleFixture({ label: "period-b" });
    const q = (text: string, values: unknown[]) => owner.query(text, values);
    const T = a.tenantId, P = a.projectId;
    const zone = uuid(), block = uuid(), group = uuid(), stage = uuid();
    await q("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone 1')", [zone, T, P]);
    await q("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'B1','Block 1')", [block, T, P, zone]);
    // 1,230 units: 1,000 of model A and 230 of model B, in one statement
    await q("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) SELECT gen_random_uuid()::text, $1, $2, $3, n, CASE WHEN n <= 1000 THEN 'A' ELSE 'B' END FROM generate_series(1, $4::int) n", [T, P, block, UNITS]);
    await q("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'STR','Structure')", [group, T, P]);
    await q("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,'S1','Stage 1')", [stage, T, P, group]);
    await q("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$4,$5,$6,$7,'A','WALL','Walls',60), ($2,$4,$5,$6,$7,'A','FINISH','Finish',40), ($3,$4,$5,$6,$7,'B','WALL','Walls',100)", [act.wallA, act.finishA, act.wallB, T, P, group, stage]);
    const company = uuid(), mason = uuid(), engineer = uuid(), crane = uuid();
    await q("INSERT INTO project_companies (id, tenant_id, project_id, name, role) VALUES ($1,$2,$3,'Example Main Contractor','main')", [company, T, P]);
    await q("INSERT INTO project_labour_roles (id, tenant_id, project_id, name, category) VALUES ($1,$3,$4,'Mason','direct'), ($2,$3,$4,'Site engineer','indirect')", [mason, engineer, T, P]);
    await q("INSERT INTO project_equipment (id, tenant_id, project_id, equipment_type) VALUES ($1,$2,$3,'Mobile crane')", [crane, T, P]);
    const [{ rows: unitRows }] = [await q("SELECT id, model_code FROM pmc_units WHERE project_id = $1 ORDER BY unit_number", [P])];
    const unitsA = unitRows.filter((row: { model_code: string }) => row.model_code === "A").map((row: { id: string }) => row.id);

    // the dailies: approved, one per working day; each with ~200 work lines (villas of model A), a metred line with a plan and an actual, and one line with an ACTUAL BUT NO PLAN
    let unitCursor = 0;
    for (const [index, date] of reportDays.entries()) {
      const report = uuid(); const hours = 8 + (index % 3); reportOn.set(date, report);
      await q("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status, report_number, work_hours) VALUES ($1,$2,$3,$4,$5,'approved',$6,$7)", [report, T, P, date, a.owner.id, `DR-${index + 1}`, hours]);
      const values: unknown[] = []; const tuples: string[] = [];
      const push = (activity: string, unit: string | null, planned: number | null, actual: number | null, complete: boolean) => {
        lines.push({ date, activity, unit, planned, actual, complete });
        const at = values.length; values.push(uuid(), T, P, report, activity, unit, planned, actual, complete ? "COMPLETE" : null);
        tuples.push(`($${at + 1},$${at + 2},$${at + 3},$${at + 4},'work',$${at + 5},$${at + 6},'line',$${at + 7},$${at + 8},$${at + 9})`);
      };
      for (let k = 0; k < 200; k++) { const unit = unitsA[(unitCursor++) % unitsA.length]; push(act.wallA, unit, null, null, k < 10 + (index % 5)); }
      push(act.finishA, null, 30 + (index % 4), 25 + (index % 7), false);
      push(act.wallB, null, null, 3 + (index % 2), false); // an actual with no plan: the plan must stay empty
      await q(`INSERT INTO site_daily_report_lines (id, tenant_id, project_id, report_id, line_type, pmc_activity_definition_id, pmc_unit_id, description, planned_quantity, actual_quantity, reported_status) VALUES ${tuples.join(",")}`, values);
      for (const [category, role, shift, headcount] of [["direct", mason, "day", 40 + (index % 6)], ["direct", mason, "night", 10], ["indirect", engineer, "day", 6 + (index % 2)]] as const) {
        labour.push({ date, category, shift, headcount, hours });
        await q("INSERT INTO site_daily_report_labour (id, tenant_id, project_id, report_id, company_id, labour_role_id, shift, headcount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [uuid(), T, P, report, company, role, shift, headcount]);
      }
      await q("INSERT INTO site_daily_report_equipment (id, tenant_id, project_id, report_id, equipment_id, count, hours) VALUES ($1,$2,$3,$4,$5,2,7.5)", [uuid(), T, P, report, crane]);
      if (index % 9 === 0) await q("INSERT INTO site_daily_report_hse (id, tenant_id, project_id, report_id, kind, description) VALUES ($1,$2,$3,$4,'near_miss','Synthetic near miss')", [uuid(), T, P, report]);
    }
    // review of #248: ONE villa of model B reported COMPLETE on two approved days of the week (and once more on a draft): it is one completed villa, not two
    unitB = unitRows.find((row: { model_code: string }) => row.model_code === "B").id;
    for (const date of ["2026-11-08", "2026-11-10"]) await q("INSERT INTO site_daily_report_lines (id, tenant_id, project_id, report_id, line_type, pmc_activity_definition_id, pmc_unit_id, description, reported_status) VALUES ($1,$2,$3,$4,'work',$5,$6,'line','COMPLETE')", [uuid(), T, P, reportOn.get(date), act.wallB, unitB]);
    // a DRAFT of another preparer in the week and a REJECTED one: neither is the record
    for (const [status, by] of [["draft", a.people.site.id], ["rejected", a.people.pm.id]] as const) {
      const report = uuid();
      await q("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status) VALUES ($1,$2,$3,'2026-11-09',$4,$5)", [report, T, P, by, status]);
      await q("INSERT INTO site_daily_report_lines (id, tenant_id, project_id, report_id, line_type, pmc_activity_definition_id, description, planned_quantity, actual_quantity) VALUES ($1,$2,$3,$4,'work',$5,'line',1000,1000)", [uuid(), T, P, report, act.finishA]);
    }
    // another company's project, same dates, big numbers: never counted here
    const otherReport = uuid();
    await q("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status) VALUES ($1,$2,$3,'2026-11-09',$4,'approved')", [otherReport, b.tenantId, b.projectId, b.owner.id]);
    // NCRs: two open (ages at the week's end 12 and 43 days), one closed in the week
    for (const [created, status, updated] of [["2026-11-01T08:00:00Z", "open", "2026-11-01T08:00:00Z"], ["2026-10-01T08:00:00Z", "corrective_action", "2026-10-02T08:00:00Z"], ["2026-10-20T08:00:00Z", "closed", "2026-11-10T08:00:00Z"]])
      await q("INSERT INTO ncrs (id, tenant_id, project_id, ncr_number, title, description, status, created_by_user_id, created_at, updated_at) VALUES ($1,$2,$3,$4,'Synthetic NCR','x',$5,$6,$7,$8)", [uuid(), T, P, `NCR-${created.slice(0, 10)}`, status, a.owner.id, created, updated]);
  });
  afterAll(async () => { await owner.end(); });

  const get = (who: keyof Fixture["people"], extra: { kind?: "week" | "month"; anchor?: string; includeUnapproved?: boolean } = {}) => {
    const caller = a.callerFor(a.people[who]);
    return caller.reportPeriods.get({ tenantId: a.tenantId, projectId: a.projectId, kind: extra.kind ?? "week", anchor: extra.anchor ?? week.start, ...(extra.includeUnapproved ? { includeUnapproved: true } : {}) });
  };
  const sum = (values: number[]) => Math.round(values.reduce((t, v) => t + v, 0) * 1000) / 1000;

  it("matches the sum of the daily reports exactly: per activity, per day, cumulative, labour, equipment, safety hours", async () => {
    const result = await get("owner");
    const inWeek = lines.filter(line => line.date >= week.start && line.date <= week.end);
    const finish = result.activities.find(row => row.activityId === act.finishA)!;
    expect(finish.period.planned).toBe(sum(inWeek.filter(l => l.activity === act.finishA).map(l => l.planned!)));
    expect(finish.period.actual).toBe(sum(inWeek.filter(l => l.activity === act.finishA).map(l => l.actual!)));
    expect(finish.cumulative.actual).toBe(sum(lines.filter(l => l.activity === act.finishA && l.date <= week.end).map(l => l.actual!)));
    expect(finish.daily.map(day => day.actual)).toEqual(inWeek.filter(l => l.activity === act.finishA).map(l => l.actual));
    const wall = result.activities.find(row => row.activityId === act.wallA)!;
    // DISTINCT villas, not lines (review of #248): the same villa reported complete again is still one
    const distinct = (rows: typeof lines) => new Set(rows.filter(l => l.activity === act.wallA && l.complete).map(l => l.unit)).size;
    // the operator's rule (11-11): a villa is complete in the period of its FIRST completion only
    const first = new Map<string, string>();
    for (const l of lines.filter(l => l.activity === act.wallA && l.complete && l.date <= week.end)) if (!first.has(l.unit!) || l.date < first.get(l.unit!)!) first.set(l.unit!, l.date);
    expect(wall.period.completedUnits).toBe([...first.values()].filter(date => date >= week.start).length);
    expect(wall.period.completedUnits).toBeLessThan(distinct(inWeek)); // villas first completed in earlier weeks and reported again do not count again
    expect(wall.cumulative.completedUnits).toBe(distinct(lines));
    expect(wall.cumulative.completedUnits).toBeLessThan(lines.filter(l => l.activity === act.wallA && l.complete).length); // the data repeats villas, so the two counts differ
    expect(wall.cumulative.completedPercentOfUnits).toBe(Math.round((distinct(lines) / 1000) * 10000) / 100);
    expect(wall.unitsInModel).toBe(1000);
    const weekLabour = labour.filter(row => row.date >= week.start && row.date <= week.end);
    expect(result.labour.period).toEqual({ direct: sum(weekLabour.filter(r => r.category === "direct").map(r => r.headcount)), indirect: sum(weekLabour.filter(r => r.category === "indirect").map(r => r.headcount)), day: sum(weekLabour.filter(r => r.shift === "day").map(r => r.headcount)), night: sum(weekLabour.filter(r => r.shift === "night").map(r => r.headcount)) });
    expect(result.labour.cumulative.direct).toBe(sum(labour.filter(r => r.category === "direct").map(r => r.headcount)));
    expect(result.safety.manHours).toBe(sum(weekLabour.map(r => r.headcount * r.hours)));
    expect(result.equipment).toEqual([expect.objectContaining({ equipmentType: "Mobile crane", units: 2 * result.reports.length, hours: 15 * result.reports.length })]);
    expect(result.period).toMatchObject({ start: week.start, end: week.end, workingDayCount: 6 });
    expect(result.missingWorkingDays).toEqual([]);
    expect(finish.averagePerWorkingDay).toBe(Math.round((finish.period.actual! / 6) * 1000) / 1000);
    expect(result.quality.ncr).toMatchObject({ opened: 0, closed: 1, open: 2, oldestDays: 43 });
  });

  it("NEGATIVE: the plan is never copied from the actuals — an activity reported with actuals and no plan has no plan, for the week and cumulatively", async () => {
    const wallB = (await get("owner")).activities.find(row => row.activityId === act.wallB)!;
    expect(wallB.period.actual).toBeGreaterThan(0);
    expect(wallB.period.planned).toBeNull(); expect(wallB.cumulative.planned).toBeNull();
    expect(wallB.period.variance).toBeNull(); expect(wallB.daily.every(day => day.planned === null)).toBe(true);
  });

  it("NEGATIVE (review of #248): one villa reported COMPLETE on two approved days is ONE completed villa — for the week and cumulatively", async () => {
    const wallB = (await get("owner")).activities.find(row => row.activityId === act.wallB)!;
    expect(wallB.period.completedUnits).toBe(1);
    expect(wallB.cumulative.completedUnits).toBe(1);
    expect(wallB.daily.filter(day => day.completedUnits > 0).map(day => day.date)).toEqual(["2026-11-08", "2026-11-10"]); // the daily series still shows both days
  });

  it("NEGATIVE: drafts and rejected reports are not the record; another company's reports are never counted; a reader without the project is refused", async () => {
    const recorded = (await get("owner")).activities.find(row => row.activityId === act.finishA)!.period.actual!;
    const withDrafts = (await get("owner", { includeUnapproved: true })).activities.find(row => row.activityId === act.finishA)!.period.actual!;
    expect(withDrafts - recorded).toBe(1000); // the draft only — the rejected report stays out even then
    const other = await b.callerFor(b.owner).reportPeriods.get({ tenantId: b.tenantId, projectId: b.projectId, kind: "week", anchor: week.start });
    expect(other.activities).toEqual([]); expect(other.reports).toHaveLength(1);
    await expect(b.callerFor(b.owner).reportPeriods.get({ tenantId: a.tenantId, projectId: a.projectId, kind: "week", anchor: week.start })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(get("owner", { anchor: "2026-02-30" })).rejects.toMatchObject({ message: "PROJECT_OS_REPORT_PERIOD_INVALID" });
  });

  it("steady at 1,230 units: a week and a month answer in a bounded time (database sums, not one query per unit)", async () => {
    const timings: number[] = [];
    for (const kind of ["week", "month", "week", "month"] as const) { const started = performance.now(); await get("owner", { kind }); timings.push(performance.now() - started); }
    console.log(JSON.stringify({ units: UNITS, lines: lines.length, timingsMs: timings.map(t => Math.round(t)) }));
    expect(Math.max(...timings)).toBeLessThan(500);
    const month = await get("owner", { kind: "month" });
    expect(month.period).toMatchObject({ start: "2026-11-01", end: "2026-11-30" });
    expect(month.missingWorkingDays.every(day => day > "2026-11-13")).toBe(true); // no daily yet after the 13th: said, not invented
  });
});
