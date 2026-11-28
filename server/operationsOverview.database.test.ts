import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getOperationsOverview } from "./operationsOverview";
import { requireReportApproval } from "./testing/reportApproval";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-53 (adviser 20-11): «التشغيل» on the test database, as the restricted application role, through the real procedure and the function behind it.
// One company with two projects (one seeded with villas, a P6 schedule, approved and unapproved daily reports, NCRs, safety incidents, risks, a
// decision and escalated actions for the operations manager; one bare), and a second company. Each figure is checked against the seed by hand,
// what has no source is null with its reason (never 0), the money follows the caller's money permission, profit is absent, and the rows stay inside
// the caller's company and the caller's project.read scope. Synthetic data only.
const uuid = () => crypto.randomUUID();
const NOW = new Date("2026-11-20T09:00:00Z"); // a site day of 2026-11-20

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-53: the operations overview («التشغيل»)", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let owner: pg.Client;
  let ops: { id: number; membershipId: string };
  let opsCaller: ReturnType<Fixture["callerFor"]>;
  const bareProject = uuid(); const noReportsProject = uuid();

  beforeAll(async () => {
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    a = await createRoleFixture({ label: "ops-a" }); b = await createRoleFixture({ label: "ops-b" });
    const q = (text: string, values: unknown[] = []) => owner.query(text, values);
    const T = a.tenantId, P = a.projectId;
    await requireReportApproval(T); // the seed holds a waiting report: the approval chain is on (Q-71 (2): off by default, checked below)

    // the operations manager, invited at company scope the way the administrator does it
    const email = `ops53.${a.tenantId.slice(0, 6)}@e2e.example.test`;
    await q("INSERT INTO users (open_id, name, email, role) VALUES ($1, 'Ops overview', $2, 'user')", [`q53ov-${a.tenantId}`, email]);
    const opsRow = (await q("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    const opsUser = { id: opsRow.id, openId: opsRow.open_id, name: opsRow.name, email: opsRow.email, role: "user", loginMethod: "email", createdAt: new Date(), updatedAt: new Date() };
    const invitation = await a.asOwner.tenant.createInvitation({ tenantId: T, email, roleId: a.roleIds.OPERATIONS_MANAGER, scopeType: "company" });
    opsCaller = a.callerFor({ row: opsUser });
    const accepted = await opsCaller.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    ops = { id: opsRow.id, membershipId: accepted.membershipId };

    // a second, bare project of the same company: nothing recorded on it yet
    await q("INSERT INTO projects (id, tenant_id, code, name, project_type, currency, status) VALUES ($1, $2, 'ZZ-BARE', 'Bare villas', 'villas', 'SAR', 'active')", [bareProject, T]);
    // a project with villas and a P6 schedule but no approved daily report yet: its actual has no source
    await q("INSERT INTO projects (id, tenant_id, code, name, project_type, currency, status) VALUES ($1, $2, 'ZZ-NOREP', 'Villas without reports', 'villas', 'SAR', 'active')", [noReportsProject, T]);
    // a closed and a cancelled project are no longer followed: they never appear
    await q("INSERT INTO projects (id, tenant_id, code, name, project_type, currency, status) VALUES ($1, $2, 'ZZ-CLOSED', 'Closed villas', 'villas', 'SAR', 'closed'), ($3, $2, 'ZZ-CANCELLED', 'Cancelled villas', 'villas', 'SAR', 'cancelled')", [uuid(), T, uuid()]);

    // villas: four of model A; weights WALL 60 and SLAB 40
    const zone = uuid(), block = uuid(), group = uuid(), stage = uuid(), wall = uuid(), slab = uuid();
    await q("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone')", [zone, T, P]);
    await q("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'B1','Block')", [block, T, P, zone]);
    await q("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) SELECT gen_random_uuid()::text, $1, $2, $3, n, 'A' FROM generate_series(1, 4) n", [T, P, block]);
    const units = (await q("SELECT id FROM pmc_units WHERE project_id = $1 ORDER BY unit_number", [P])).rows.map(row => row.id as string);
    const zone2 = uuid(), block2 = uuid();
    await q("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone')", [zone2, T, noReportsProject]);
    await q("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'B1','Block')", [block2, T, noReportsProject, zone2]);
    await q("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES (gen_random_uuid()::text, $1, $2, $3, 1, 'A')", [T, noReportsProject, block2]);
    await q("INSERT INTO activities (id, tenant_id, project_id, code, name, external_id, task_type, planned_start_at, planned_finish_at, planned_value, duration_hours, status) VALUES ($1,$2,$3,'NR1','NR1','x-NR1','TT_Task','2026-10-01T08:00:00Z','2026-10-31T17:00:00Z',100,80,'completed')", [uuid(), T, noReportsProject]);
    await q("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'G','G')", [group, T, P]);
    await q("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,'S','S')", [stage, T, P, group]);
    await q("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$3,$4,$5,$6,'A','WALL','Walls',60), ($2,$3,$4,$5,$6,'A','SLAB','Slab',40)", [wall, slab, T, P, group, stage]);

    // the P6 schedule: October's task is all behind us (and not completed: overdue), December's all ahead, equal planned value → planned 50% today;
    // a milestone in between is not a task (no weight on the planned line), but missed (not completed after its date) it is overdue. One activity without an external id is not P6 and does not move the planned line.
    const task = (code: string, type: string, start: string, finish: string, value: number, status: string) =>
      q("INSERT INTO activities (id, tenant_id, project_id, code, name, external_id, task_type, planned_start_at, planned_finish_at, planned_value, duration_hours, status) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,80,$10)", [uuid(), T, P, code, `x-${code}`, type, `${start}T08:00:00Z`, `${finish}T17:00:00Z`, value, status]);
    await task("OCT", "TT_Task", "2026-10-01", "2026-10-31", 1000, "in_progress");
    await task("DEC", "TT_Task", "2026-12-01", "2026-12-31", 1000, "not_started");
    await task("M1", "TT_Mile", "2026-11-15", "2026-11-15", 0, "not_started");

    // daily reports: the approved one of 11-10 completes WALL on two villas (2 × 60 / 4 = 30%); a submitted one (not approved) and an approved one dated
    // after today complete more, and count for nothing
    const report = async (date: string, status: string, lines: Array<[string, string]>) => {
      const id = uuid();
      await q("INSERT INTO site_daily_reports (id, tenant_id, project_id, report_date, prepared_by_user_id, status) VALUES ($1,$2,$3,$4,$5,$6)", [id, T, P, date, a.owner.id, status]);
      for (const [activity, unit] of lines) await q("INSERT INTO site_daily_report_lines (id, tenant_id, project_id, report_id, line_type, pmc_activity_definition_id, pmc_unit_id, description, actual_quantity, reported_status) VALUES ($1,$2,$3,$4,'work',$5,$6,'line',1,'COMPLETE')", [uuid(), T, P, id, activity, unit]);
    };
    await report("2026-11-10", "approved", [[wall, units[0]], [wall, units[1]]]);
    await report("2026-11-12", "submitted", [[slab, units[0]]]);
    await report("2026-11-25", "approved", [[wall, units[2]]]);

    // quality: two NCRs open (one under investigation), one closed, one cancelled
    for (const [n, status] of [["N1", "open"], ["N2", "under_investigation"], ["N3", "closed"], ["N4", "cancelled"]]) await q("INSERT INTO ncrs (id, tenant_id, project_id, ncr_number, title, description, status, created_by_user_id) VALUES ($1,$2,$3,$4,'NCR','Synthetic NCR',$5,$6)", [uuid(), T, P, n, status, a.owner.id]);
    // safety: a lost-time injury on 11-15 under investigation (open, and in the last 30 days); first aid closed; a lost-time injury of September, closed (outside both)
    const incident = (n: string, on: string, kind: string, status: string, lost: number) => q("INSERT INTO safety_incidents (id, tenant_id, project_id, incident_number, occurred_on, kind, title, description, lost_days, status, reported_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,'Incident','Synthetic incident',$7,$8,$9)", [uuid(), T, P, n, on, kind, lost, status, a.owner.id]);
    await incident("I1", "2026-11-15", "lost_time", "investigating", 2);
    await incident("I2", "2026-11-18", "first_aid", "closed", 0);
    await incident("I3", "2026-09-01", "lost_time", "closed", 4);
    // risks: 4×4 = 16 and 2×5 = 10 are high or critical and open; 2×2 is low; 5×5 is closed
    for (const [code, p, s, status] of [["R1", 4, 4, "open"], ["R2", 2, 5, "mitigating"], ["R3", 2, 2, "open"], ["R4", 5, 5, "closed"]] as const) await q("INSERT INTO risks (id, tenant_id, project_id, code, title, probability, severity, status) VALUES ($1,$2,$3,$4,'Risk',$5,$6,$7)", [uuid(), T, P, code, p, s, status]);
    // waiting on the operations manager: one decision submitted to them (a draft and someone else's do not count); one open escalated action they own
    // (a completed escalated one and a not-escalated one do not count)
    const otherMembership = (await q("SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2", [T, a.people.pm.id])).rows[0].id;
    for (const [status, ownerId] of [["submitted", ops.membershipId], ["draft", ops.membershipId], ["submitted", otherMembership]]) await q("INSERT INTO decisions (id, tenant_id, project_id, problem, options, decision_owner_membership_id, status) VALUES ($1,$2,$3,'Synthetic problem','A or B',$4,$5)", [uuid(), T, P, ownerId, status]);
    for (const [status, escalation] of [["open", "escalated"], ["completed", "escalated"], ["open", "none"]]) await q("INSERT INTO actions (id, tenant_id, project_id, title, owner_membership_id, status, escalation_status, due_at) VALUES ($1,$2,$3,'Synthetic action',$4,$5,$6,'2026-11-01T00:00:00Z')", [uuid(), T, P, ops.membershipId, status, escalation]);
    // the other company has records of its own that must never appear
    await q("INSERT INTO ncrs (id, tenant_id, project_id, ncr_number, title, description, status, created_by_user_id) VALUES ($1,$2,$3,'NB1','NCR','Synthetic NCR','open',$4)", [uuid(), b.tenantId, b.projectId, b.owner.id]);
  });
  // the decisions and actions waiting on the operations manager are overdue on purpose: leave none behind, or the daily deadlines digest of another
  // test file would find them (and its recipient, should that user be cleaned up elsewhere). The user's open_id prefix (q53ov-) is this file's alone.
  afterAll(async () => {
    if (owner && a) {
      await owner.query("DELETE FROM actions WHERE tenant_id = $1", [a.tenantId]);
      await owner.query("DELETE FROM decisions WHERE tenant_id = $1", [a.tenantId]);
    }
    await owner?.end();
  });

  it("gives each figure of the seeded project exactly, from approved records only, and the bare project nulls with their reasons — never 0 for a missing source", async () => {
    const result = await getOperationsOverview({ userId: ops.id, tenantId: a.tenantId, now: NOW });
    expect(result.today).toBe("2026-11-20");
    expect(result.projects.map(row => row.projectId)).toEqual([a.projectId, bareProject, noReportsProject]); // by code; the closed and cancelled ones are not there
    expect(result.projects.map(row => row.status)).toEqual(["draft", "active", "active"]);
    const [seeded, bare, noReports] = result.projects;
    // villas and a plan (100% planned by now), but no approved completion: the actual is null for want of a source, never 0
    expect(noReports.progress).toEqual({ actual: null, planned: 100, deviation: null, reason: "NO_REPORTS" });
    expect(seeded.progress).toEqual({ actual: 30, planned: 50, deviation: -20, reason: null });
    // Q-71 (2): with the company's approval rule off, the submitted report of 11-12 counts as sent (SLAB on villa 1: 30 + 40 / 4 = 40); back on, it waits again
    await requireReportApproval(a.tenantId, false);
    expect((await getOperationsOverview({ userId: ops.id, tenantId: a.tenantId, now: NOW })).projects[0].progress.actual).toBe(40);
    await requireReportApproval(a.tenantId, true);
    // October's task and the milestone of 11-15, both past their planned finish and not completed (the levels dashboards count the same way); December's is not due
    expect(seeded.overdueActivities).toBe(2);
    expect(seeded.openNcrs).toBe(2);
    expect(seeded.safety).toEqual({ openIncidents: 1, lostTimeLast30Days: 1 });
    expect(seeded.highRisks).toBe(2);
    expect(seeded.waiting).toEqual({ decisions: 1, escalations: 1 });
    expect(seeded.materialsBelowReorder).toBe(0);
    expect(typeof seeded.stalledUnits).toBe("number");
    expect(bare.progress).toEqual({ actual: null, planned: null, deviation: null, reason: "NO_UNITS" });
    expect(bare.stalledUnits).toBeNull();
    expect(bare).toMatchObject({ overdueActivities: 0, openNcrs: 0, highRisks: 0, safety: { openIncidents: 0, lostTimeLast30Days: 0 }, waiting: { decisions: 0, escalations: 0 } });
  });

  it("shows the cost to whoever may see the project's money, hides it (null, MONEY_HIDDEN) from whoever may not, and carries no profit for anyone", async () => {
    const asOps = await getOperationsOverview({ userId: ops.id, tenantId: a.tenantId, now: NOW });
    expect(asOps.projects[0].cost).not.toEqual({ value: null, reason: "MONEY_HIDDEN" });
    // the project coordinator reads the project (project.read) but not its money
    const asCoordinator = await getOperationsOverview({ userId: a.people.coordinator.id, tenantId: a.tenantId, now: NOW });
    expect(asCoordinator.projects[0].cost).toEqual({ value: null, reason: "MONEY_HIDDEN" });
    for (const row of [...asOps.projects, ...asCoordinator.projects]) expect(JSON.stringify(row)).not.toMatch(/profit|fpac|margin/i);
  });

  it("answers through the router, refuses whoever does not read projects, and keeps to the caller's scope", async () => {
    const viaRouter = await opsCaller.operations.overview({ tenantId: a.tenantId });
    expect(viaRouter.projects.map(row => row.projectId).sort()).toEqual([a.projectId, bareProject, noReportsProject].sort());
    // project-scoped (the coordinator is assigned to the fixture project only): the bare project is not theirs
    const coordinator = await a.callerFor(a.people.coordinator).operations.overview({ tenantId: a.tenantId });
    expect(coordinator.projects.map(row => row.projectId)).toEqual([a.projectId]);
    // the PMO lead holds no project.read: refused, not an empty page
    await expect(a.callerFor(a.people.pmo).operations.overview({ tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
  });

  it("stays inside its company: the other company is refused, and its records never appear in this one's rows (isolation)", async () => {
    await expect(opsCaller.operations.overview({ tenantId: b.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    const rows = (await opsCaller.operations.overview({ tenantId: a.tenantId })).projects;
    expect(rows.map(row => row.projectId)).not.toContain(b.projectId);
    expect(rows.find(row => row.projectId === a.projectId)!.openNcrs).toBe(2);
    // and the other company's own operations view sees its NCR, not this company's
    const other = await b.asOwner.operations.overview({ tenantId: b.tenantId });
    expect(other.projects.map(row => row.projectId)).toEqual([b.projectId]);
    expect(other.projects[0].openNcrs).toBe(1);
  });
});
