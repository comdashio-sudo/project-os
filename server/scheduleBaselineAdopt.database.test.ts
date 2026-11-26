import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { confirmP6Import } from "./p6Import";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-61 (5) on a real database: the first P6 import is the baseline; the owner then imports the approved version (dates 30 days later). It becomes the
// baseline only by the explicit button — with the permission, a reason and an audit row — and the planned curve of Q-61 (4) follows it. Synthetic data only.
const XER = (shift: number) => {
  const d = (days: number) => new Date(Date.UTC(2026, 0, 1) + (days + shift) * 86_400_000).toISOString().slice(0, 10) + " 00:00";
  return ["ERMHDR\t25.12\t2026-01-01\tProject\tadmin\tadmin\tdb\tProject Management\tSAR",
    "%T\tPROJECT", "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tlast_recalc_date", `%R\t900\tQ65\t${d(0)}\t${d(60)}\t${d(0)}`,
    "%T\tPROJWBS", "%F\twbs_id\tproj_id\tproj_node_flag\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id", "%R\t1\t900\tY\t0\tQ65\tSynthetic\t", "%R\t2\t900\tN\t1\tV701\tVilla 701\t1",
    "%T\tTASK", "%F\ttask_id\tproj_id\twbs_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date", `%R\t11\t900\t2\tTT_Task\tTK_NotStart\tV701.010\tSubstructure V701\t${d(0)}\t${d(40)}`,
    "%T\tACTVTYPE", "%F\tactv_code_type_id\tactv_short_len\tseq_num\tactv_code_type\tactv_code_type_scope", "%R\t3\t8\t1\tQ Item\tAS_Project",
    "%T\tACTVCODE", "%F\tactv_code_id\tparent_actv_code_id\tactv_code_type_id\tactv_code_name\tshort_name\tseq_num", "%R\t301\t\t3\tSubstructure works\tQ02\t0",
    "%T\tTASKACTV", "%F\ttask_id\tactv_code_type_id\tactv_code_id", "%R\t11\t3\t301", "%E"].join("\r\n");
};

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-61 (5): a later import adopted as the new baseline, explicitly", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  let first = ""; let second = ""; let update = "";
  const scope = () => ({ tenantId: a.tenantId, projectId: a.projectId });
  const baselineId = async (tenantId: string) => (await client.query("SELECT id FROM schedule_snapshots WHERE tenant_id = $1 AND is_baseline", [tenantId])).rows.map(row => row.id);
  const reason = "The approved programme replaces the one submitted (synthetic)";

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q65a" }); b = await createRoleFixture({ label: "q65b" });
    const g = randomUUID(); const s = randomUUID(); const zone = randomUUID(); const block = randomUUID();
    await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'W1','Substructure')", [g, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1,$2,$3,$4,'W1-S','Substructure')", [s, a.tenantId, a.projectId, g]);
    await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1,$2,$3,$4,$5,'C','W1-A','Substructure',100)", [randomUUID(), a.tenantId, a.projectId, g, s]);
    await client.query("INSERT INTO pmc_zones (id, tenant_id, project_id, code, name) VALUES ($1,$2,$3,'Z1','Zone 1 (synthetic)')", [zone, a.tenantId, a.projectId]);
    await client.query("INSERT INTO pmc_blocks (id, tenant_id, project_id, zone_id, code, name) VALUES ($1,$2,$3,$4,'7','Block 7')", [block, a.tenantId, a.projectId, zone]);
    await client.query("INSERT INTO pmc_units (id, tenant_id, project_id, block_id, unit_number, model_code) VALUES ($1,$2,$3,$4,701,'C')", [randomUUID(), a.tenantId, a.projectId, block]);
    await confirmP6Import({ userId: a.owner.id, ...scope(), bytes: new Uint8Array(Buffer.from(XER(0), "utf8")), source: { key: "q65/submitted.xer", name: "submitted.xer" } });
    await confirmP6Import({ userId: a.owner.id, ...scope(), bytes: new Uint8Array(Buffer.from(XER(30), "utf8")), source: { key: "q65/approved.xer", name: "approved.xer" } });
    const { rows } = await client.query("SELECT id, is_baseline FROM schedule_snapshots WHERE tenant_id = $1 AND project_id = $2 ORDER BY created_at", [a.tenantId, a.projectId]);
    first = rows[0].id; second = rows[1].id;
    // an activity update's snapshot, as p6Update writes one (written as the table owner here: the source is what matters)
    update = randomUUID();
    await client.query("INSERT INTO schedule_snapshots (id, tenant_id, project_id, source, is_baseline, activity_count, created_by_user_id) VALUES ($1,$2,$3,'p6_update',false,0,$4)", [update, a.tenantId, a.projectId, a.owner.id]);
    await a.asOwner.schedule.saveStageMapping({ ...scope(), links: [{ groupId: g, stageCodes: ["Q02"], anchor: "span" }] });
  });
  afterAll(async () => {
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("the second import did not move the baseline by itself: the first stays the baseline until the button", async () => {
    expect(await baselineId(a.tenantId)).toEqual([first]);
  });

  it("NEGATIVE: refused, nothing changed — no reason, an activity update, the baseline itself, another company's snapshot, the site engineer and the accountant, another company", async () => {
    const planner = a.callerFor(a.people.planner);
    await expect(planner.schedule.adoptBaseline({ ...scope(), snapshotId: second, reason: "  ok " })).rejects.toThrow(/PROJECT_OS_SCHEDULE_BASELINE_REASON_REQUIRED/);
    await expect(planner.schedule.adoptBaseline({ ...scope(), snapshotId: update, reason })).rejects.toThrow(/PROJECT_OS_SCHEDULE_BASELINE_NOT_IMPORT/);
    await expect(planner.schedule.adoptBaseline({ ...scope(), snapshotId: first, reason })).rejects.toThrow(/PROJECT_OS_SCHEDULE_ALREADY_BASELINE/);
    await expect(b.asOwner.schedule.adoptBaseline({ tenantId: b.tenantId, projectId: b.projectId, snapshotId: second, reason })).rejects.toThrow(/PROJECT_OS_SCHEDULE_SNAPSHOT_NOT_FOUND/);
    await expect(b.asOwner.schedule.adoptBaseline({ ...scope(), snapshotId: second, reason })).rejects.toThrow();
    await expect(a.callerFor(a.people.site).schedule.adoptBaseline({ ...scope(), snapshotId: second, reason })).rejects.toThrow();
    await expect(a.callerFor(a.people.accountant).schedule.adoptBaseline({ ...scope(), snapshotId: second, reason })).rejects.toThrow();
    expect(await baselineId(a.tenantId)).toEqual([first]);
    expect(Number((await client.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND action = 'schedule.baseline_adopted'", [a.tenantId])).rows[0].n)).toBe(0);
  });

  it("POSITIVE: the planning engineer adopts the approved import with a reason — one baseline, the old kept as a snapshot, an audit row, and the planned curve follows it", async () => {
    const before = await a.callerFor(a.people.site).schedule.plannedCurve(scope());
    if (!before.ready) throw new Error(`not ready: ${before.reason}`);
    expect(before.months).toEqual(["2026-01", "2026-02"]);
    expect(before.project[0].planned).toBe(77.5); // Jan 1 → Feb 10: 31 of 40 days by the end of January
    const result = await a.callerFor(a.people.planner).schedule.adoptBaseline({ ...scope(), snapshotId: second, reason });
    expect(result).toEqual({ baselineId: second, previousBaselineId: first });
    expect(await baselineId(a.tenantId)).toEqual([second]);
    expect(Number((await client.query("SELECT COUNT(*)::int AS n FROM schedule_snapshots WHERE tenant_id = $1 AND id = $2", [a.tenantId, first])).rows[0].n)).toBe(1);
    const { rows: audit } = await client.query("SELECT actor_user_id, metadata FROM audit_logs WHERE tenant_id = $1 AND action = 'schedule.baseline_adopted'", [a.tenantId]);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_user_id).toBe(a.people.planner.id);
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ from: first, to: second, reason });
    const after = await a.callerFor(a.people.site).schedule.plannedCurve(scope());
    if (!after.ready) throw new Error("not ready");
    expect(after.baseline.id).toBe(second);
    // 30 days later: Jan 31 → Mar 12; by the end of January one day of 40 → 2.5
    expect(after.months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(after.project[0].planned).toBe(2.5);
  });
});
