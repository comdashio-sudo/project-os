import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { siteToday } from "./wo22Shared";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-71 (1) (the owner, 26-11: «progress entry looks tied to the schedule's items, and that is wrong»): in a project with a PMC catalogue, a WBS item a PMC
// activity is linked to takes its progress from the villas' cells and is not entered by hand — the typed entry is refused with its reason, the screens read
// it as computed with its source, and an approved time entry does not copy its reported percent onto it. An item no PMC activity points to keeps manual entry.
// Real database, the application running as the restricted role. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-71 (1): progress of a WBS item PMC computes is read-only, with its source", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const wbs: Record<string, string> = {}; const units: string[] = []; let walls = "";
  const progressRows = async (wbsItemId: string) => (await client.query("SELECT progress_percent::float AS p FROM progress_entries WHERE tenant_id = $1 AND wbs_item_id = $2 ORDER BY measured_at DESC, created_at DESC", [a.tenantId, wbsItemId])).rows.map(row => row.p as number);

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q71c" }); b = await createRoleFixture({ label: "q71c-b" });
    for (const row of (await client.query("SELECT id, code FROM wbs_items WHERE tenant_id = $1 AND project_id = $2", [a.tenantId, a.projectId])).rows) wbs[row.code] = row.id;
    const zone = randomUUID(); const block = randomUUID(); const group = randomUUID(); const stage = randomUUID(); walls = randomUUID();
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'Z1', 'Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1, $2, $3, $4, 'B1', 'Block 1')", [block, a.tenantId, a.projectId, zone]);
    for (const n of [1, 2]) { const id = randomUUID(); units.push(id); await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1, $2, $3, $4, $5, 'A')", [id, a.tenantId, a.projectId, block, n]); }
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1, $2, $3, 'STR', 'Structure')", [group, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, 'BLK', 'Blockwork')", [stage, a.tenantId, a.projectId, group]);
    // WALLS computes WBS «1.1» (Excavation in the fixture's naming — the item is what matters); «2» is linked to nothing
    await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent, wbs_item_id) VALUES ($1, $2, $3, $4, $5, 'A', 'WALLS', 'Walls', 100, $6)", [walls, a.tenantId, a.projectId, group, stage, wbs["1.1"]]);
  });
  afterAll(async () => {
    for (const fixture of [a, b]) if (fixture) {
      await client.query("UPDATE employee_time_entries SET cost_entry_id = NULL, progress_entry_id = NULL WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: an item no PMC activity points to keeps manual entry; the screens read which items PMC computes, with their activities", async () => {
    await expect(a.asOwner.progress.create({ tenantId: a.tenantId, projectId: a.projectId, wbsItemId: wbs["2"], percentComplete: 35, reportedAt: new Date() })).resolves.toMatchObject({ id: expect.any(String) });
    expect(await progressRows(wbs["2"])).toEqual([35]);
    const field = await a.asOwner.fieldEntry.context({ tenantId: a.tenantId, projectId: a.projectId });
    const byCode = Object.fromEntries(field.wbs.map(item => [item.code, item]));
    expect(byCode["1.1"]).toMatchObject({ computedFromPmc: true, pmcActivityCodes: ["WALLS"] });
    expect(byCode["2"]).toMatchObject({ computedFromPmc: false, pmcActivityCodes: [], lastPercent: 35 });
    const schedule = await a.asOwner.projects.getControlsSchedule({ tenantId: a.tenantId, projectId: a.projectId });
    expect(schedule.wbs.find(item => item.id === wbs["1.1"])).toMatchObject({ computedFromPmc: true, pmcActivityCodes: ["WALLS"] });
    expect(schedule.wbs.find(item => item.id === wbs["2"])).toMatchObject({ computedFromPmc: false });
  });

  it("NEGATIVE: a typed percent on the computed item is refused with its reason and writes nothing; the villas' cells are what move it", async () => {
    await expect(a.asOwner.progress.create({ tenantId: a.tenantId, projectId: a.projectId, wbsItemId: wbs["1.1"], percentComplete: 80, reportedAt: new Date() })).rejects.toThrow("PROJECT_OS_PROGRESS_COMPUTED_FROM_PMC");
    expect(await progressRows(wbs["1.1"])).toEqual([]);
    // one of two villas complete: the item is computed at 50%
    await a.asOwner.pmc.updateProgress({ tenantId: a.tenantId, projectId: a.projectId, activityCode: "WALLS", villas: ["1"], status: "COMPLETE", date: siteToday() });
    const computed = await progressRows(wbs["1.1"]);
    expect(computed.length).toBe(1); expect(computed[0]).toBeCloseTo(50, 5);
    expect((await a.asOwner.fieldEntry.context({ tenantId: a.tenantId, projectId: a.projectId })).wbs.find(item => item.id === wbs["1.1"])?.lastPercent).toBeCloseTo(50, 5);
    await expect(a.asOwner.progress.create({ tenantId: a.tenantId, projectId: a.projectId, wbsItemId: wbs["1.1"], percentComplete: 10, reportedAt: new Date() })).rejects.toThrow("PROJECT_OS_PROGRESS_COMPUTED_FROM_PMC");
    expect((await progressRows(wbs["1.1"])).length).toBe(1);
  });

  it("an approved time entry keeps its hours and cost, but its reported percent is not copied onto the computed item (and still is onto a manual one)", async () => {
    const employee = randomUUID(); const resource = randomUUID(); const onComputed = randomUUID(); const onManual = randomUUID();
    await client.query("INSERT INTO employees (id, tenant_id, employee_number, full_name, job_title, department, hire_date, employment_status, created_by_user_id) VALUES ($1, $2, 'E-71', 'Employee 71 (synthetic)', 'Mason', 'Site', '2024-01-01', 'active', $3)", [employee, a.tenantId, a.owner.id]);
    await client.query("INSERT INTO project_resources (id, tenant_id, project_id, resource_code, name, resource_type, planned_units, allocated_units, unit_cost, currency, created_by_user_id) VALUES ($1, $2, $3, 'LAB-71', 'Labour', 'labor', 1000, 0, 50, 'SAR', $4)", [resource, a.tenantId, a.projectId, a.owner.id]);
    const entries: Record<string, string> = {};
    for (const [assignment, item] of [[onComputed, wbs["1.1"]], [onManual, wbs["2"]]] as const) {
      await client.query("INSERT INTO employee_assignments (id, tenant_id, project_id, employee_id, project_resource_id, wbs_item_id, planned_start_at, planned_finish_at, planned_hours, status, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, '2026-11-01', '2026-11-30', 100, 'active', $7)", [assignment, a.tenantId, a.projectId, employee, resource, item, a.owner.id]);
      entries[assignment] = randomUUID();
      await client.query("INSERT INTO employee_time_entries (id, tenant_id, assignment_id, employee_id, project_id, work_date, actual_hours, reported_progress_percent, status, created_by_user_id) VALUES ($1, $2, $3, $4, $5, '2026-11-20', 8, 90, 'submitted', $6)", [entries[assignment], a.tenantId, assignment, employee, a.projectId, a.owner.id]);
    }
    const computed = await a.asOwner.assignments.timeEntries.transition({ tenantId: a.tenantId, projectId: a.projectId, timeEntryId: entries[onComputed], status: "approved" });
    expect(computed).toMatchObject({ status: "approved", costEntryId: expect.any(String), progressNotCopied: "COMPUTED_FROM_PMC" });
    expect(computed.progressEntryId).toBeUndefined();
    expect((await progressRows(wbs["1.1"])).length).toBe(1); // still only the PMC-computed row
    const manual = await a.asOwner.assignments.timeEntries.transition({ tenantId: a.tenantId, projectId: a.projectId, timeEntryId: entries[onManual], status: "approved" });
    expect(manual.progressEntryId).toEqual(expect.any(String));
    expect(manual).not.toHaveProperty("progressNotCopied");
    const audit = await client.query("SELECT metadata FROM audit_logs WHERE tenant_id = $1 AND entity_id = $2 AND action = 'employee.time_entry_transitioned'", [a.tenantId, entries[onComputed]]);
    expect(JSON.parse(audit.rows[0].metadata)).toMatchObject({ progressNotCopied: "COMPUTED_FROM_PMC" });
  });

  it("isolation: another company's project with no PMC keeps manual entry on every item, cannot write into this one, and reads none of its links", async () => {
    const otherWbs = (await client.query("SELECT id FROM wbs_items WHERE tenant_id = $1 AND project_id = $2 LIMIT 1", [b.tenantId, b.projectId])).rows[0].id;
    await expect(b.asOwner.progress.create({ tenantId: b.tenantId, projectId: b.projectId, wbsItemId: otherWbs, percentComplete: 20, reportedAt: new Date() })).resolves.toMatchObject({ id: expect.any(String) });
    expect((await b.asOwner.fieldEntry.context({ tenantId: b.tenantId, projectId: b.projectId })).wbs.every(item => item.computedFromPmc === false)).toBe(true);
    await expect(b.asOwner.progress.create({ tenantId: a.tenantId, projectId: a.projectId, wbsItemId: wbs["2"], percentComplete: 99, reportedAt: new Date() })).rejects.toThrow(/PROJECT_OS_(TENANT_ACCESS_DENIED|PERMISSION_DENIED)/);
    await expect(b.asOwner.fieldEntry.context({ tenantId: a.tenantId, projectId: a.projectId })).rejects.toThrow();
  });
});
