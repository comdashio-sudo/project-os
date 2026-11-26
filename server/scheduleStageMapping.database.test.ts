import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { confirmP6Import } from "./p6Import";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-61 (3) on a real database: a P6 file whose «Q Item» codes carry names (schedule Q06 = roof installation) goes through the platform's own importer; the
// project's weight groups (weights Q06 = concrete structure, Q05 = factory production with no villa activity) are linked to the schedule's stages, suggested
// by name, saved by the planning engineer, audited. Synthetic data only.
const XER = () => {
  const wbs: Array<[number, number | "", string, string, "Y" | "N"]> = [[1, "", "Q63", "Synthetic project", "Y"], [2, 1, "PH1", "Phase 1", "N"], [3, 2, "V606", "Villa 606", "N"], [4, 2, "V607", "Villa 607", "N"], [5, 1, "MOB", "Mobilisation", "N"]];
  const tasks: Array<[number, number, string, string]> = [[11, 3, "V606.010", "Excavation V606"], [12, 3, "V606.020", "Roof V606"], [13, 3, "V606.030", "Fence V606"], [14, 4, "V607.010", "Excavation V607"], [15, 4, "V607.030", "Fence V607"], [16, 5, "MOB-01", "Site set-up"]];
  const values: Array<[number, string, string]> = [[301, "Q02", "Substructure works"], [302, "Q06", "Roof installation"], [303, "Q20", "Boundary fences"]];
  const assign: Array<[number, number]> = [[11, 301], [12, 302], [13, 303], [14, 301], [15, 303]];
  return [
    "ERMHDR\t25.12\t2026-11-01\tProject\tadmin\tadmin\tdb\tProject Management\tSAR",
    "%T\tPROJECT", "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tlast_recalc_date", "%R\t900\tQ63\t2026-01-01 08:00\t2027-06-30 17:00\t2026-11-01 00:00",
    "%T\tPROJWBS", "%F\twbs_id\tproj_id\tproj_node_flag\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id", ...wbs.map(([id, parent, code, name, root], i) => `%R\t${id}\t900\t${root}\t${i}\t${code}\t${name}\t${parent}`),
    "%T\tTASK", "%F\ttask_id\tproj_id\twbs_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date",
    ...tasks.map(([id, w, code, name]) => `%R\t${id}\t900\t${w}\tTT_Task\tTK_NotStart\t${code}\t${name}\t2026-02-01 08:00\t2026-03-01 17:00`),
    "%T\tACTVTYPE", "%F\tactv_code_type_id\tactv_short_len\tseq_num\tactv_code_type\tactv_code_type_scope", "%R\t3\t8\t1\tQ Item\tAS_Project",
    "%T\tACTVCODE", "%F\tactv_code_id\tparent_actv_code_id\tactv_code_type_id\tactv_code_name\tshort_name\tseq_num", ...values.map(([id, short, name], i) => `%R\t${id}\t\t3\t${name}\t${short}\t${i}`),
    "%T\tTASKACTV", "%F\ttask_id\tactv_code_type_id\tactv_code_id", ...assign.map(([task, value]) => `%R\t${task}\t3\t${value}`),
    "%E",
  ].join("\r\n");
};

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-61 (3): schedule stage ← weight group, once per project", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const groupIds: Record<string, string> = {};
  const scope = () => ({ tenantId: a.tenantId, projectId: a.projectId });
  const links = async (tenantId: string) => (await client.query("SELECT group_id, stage_codes_json, anchor, suggested_score FROM pmc_schedule_stage_links WHERE tenant_id = $1 ORDER BY stage_codes_json COLLATE \"C\"", [tenantId])).rows; // byte order: a text sort follows the database's collation, and CI's (en_US) ignores the punctuation that the local C collation puts first

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q63a" }); b = await createRoleFixture({ label: "q63b" });
    // weight groups of model C (and Q99 that weighs nothing); one stage and one activity each, as the weights import writes them
    for (const [code, name, nameEn, weight] of [["Q01", "أعمال الأساسات", "Substructure", 8], ["Q05", "إنتاج المصنع", "Factory production", 26.5], ["Q06", "الهيكل الخرساني", "Concrete structure", 24.9], ["Q07", "الأسوار", "Boundary fences", 3], ["Q99", "بند بلا وزن", null, 0]] as const) {
      const groupId = randomUUID(); const stageId = randomUUID(); groupIds[code] = groupId;
      await client.query("INSERT INTO pmc_activity_groups (id, tenant_id, project_id, code, name, name_en) VALUES ($1, $2, $3, $4, $5, $6)", [groupId, a.tenantId, a.projectId, code, name, nameEn]);
      await client.query("INSERT INTO pmc_activity_stages (id, tenant_id, project_id, group_id, code, name) VALUES ($1, $2, $3, $4, $5, $6)", [stageId, a.tenantId, a.projectId, groupId, `${code}-S`, name]);
      await client.query("INSERT INTO pmc_activity_definitions (id, tenant_id, project_id, group_id, stage_id, model_code, code, name, weight_percent) VALUES ($1, $2, $3, $4, $5, 'C', $6, $7, $8)", [randomUUID(), a.tenantId, a.projectId, groupId, stageId, `${code}-A`, name, weight]);
    }
    await confirmP6Import({ userId: a.owner.id, tenantId: a.tenantId, projectId: a.projectId, bytes: new Uint8Array(Buffer.from(XER(), "utf8")), source: { key: "q63/schedule.xer", name: "schedule.xer" } });
  });
  afterAll(async () => {
    for (const fixture of [a, b].filter(Boolean)) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE (read, site engineer with project.pmc.read): the schedule's stages with their P6 names; suggestions by name only; not ready until every weighted group is linked", async () => {
    const view = await a.callerFor(a.people.site).schedule.stageMapping(scope());
    expect(view.stages).toEqual([
      { code: "Q02", name: "Substructure works", activities: 2, villas: 2 }, { code: "Q06", name: "Roof installation", activities: 1, villas: 1 }, { code: "Q20", name: "Boundary fences", activities: 2, villas: 2 },
    ]);
    const byCode = Object.fromEntries(view.groups.map(group => [group.code, group]));
    expect(byCode.Q01.suggestion?.stageCode).toBe("Q02");
    expect(byCode.Q07.suggestion).toMatchObject({ stageCode: "Q20", score: 1 });
    expect(byCode.Q06.suggestion).toBeNull(); // the same code «Q06» on both sides is not a reason
    expect(byCode.Q06.weight).toBe(24.9);
    expect(view.readiness).toMatchObject({ ready: false, unlinked: ["Q01", "Q05", "Q06", "Q07"] });
    expect(view.differences).toMatchObject({ villasMatched: 0, missingInProject: [606, 607] }); // Q-61 (2) on the same screen: this project has no villas yet
  });

  it("POSITIVE (save, planning engineer with project.pmc.manage): the owner's kind of link — a group across several stages, factory production at the start of one stage — saved and audited with before and after; then ready", async () => {
    const saved = await a.callerFor(a.people.planner).schedule.saveStageMapping({ ...scope(), links: [
      { groupId: groupIds.Q01, stageCodes: ["Q02"], anchor: "span" },
      { groupId: groupIds.Q06, stageCodes: ["Q06", "Q02"], anchor: "span" },
      { groupId: groupIds.Q05, stageCodes: ["q06"], anchor: "start" },
      { groupId: groupIds.Q07, stageCodes: ["Q20"], anchor: "span" },
    ] });
    expect(saved).toMatchObject({ saved: 4, removed: 0, readiness: { ready: true, unlinked: [], stale: [] } });
    expect((await links(a.tenantId)).map(row => [row.stage_codes_json, row.anchor])).toEqual([['["Q02"]', "span"], ['["Q06","Q02"]', "span"], ['["Q06"]', "start"], ['["Q20"]', "span"]]);
    // review of #550, note 2: «suggested» is the server's own decision — Q01 ← Q02 and Q07 ← Q20 are exactly its suggestions; the hand-picked ones are not
    expect((await links(a.tenantId)).map(row => [row.stage_codes_json, row.suggested_score === null ? null : Number(row.suggested_score)])).toEqual([['["Q02"]', expect.any(Number)], ['["Q06","Q02"]', null], ['["Q06"]', null], ['["Q20"]', 1]]);
    // changed once more: fences removed → not ready again; the audit keeps both decisions with what was there before
    const again = await a.callerFor(a.people.planner).schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.Q07, stageCodes: [], anchor: "span" }] });
    expect(again).toMatchObject({ saved: 0, removed: 1, readiness: { ready: false, unlinked: ["Q07"] } });
    const { rows: audit } = await client.query("SELECT metadata FROM audit_logs WHERE tenant_id = $1 AND action = 'pmc.schedule_stage_links_saved' ORDER BY created_at", [a.tenantId]);
    expect(audit).toHaveLength(2);
    const last = JSON.parse(audit[1].metadata);
    expect(last.changes).toEqual([{ groupId: groupIds.Q07, before: { stageCodes: ["Q20"], anchor: "span" }, after: null }]);
  });

  it("NEGATIVE: refused whole, nothing written — a stage not in the schedule, a start link with two stages, another project's group, a reader without project.pmc.manage, another company", async () => {
    const before = await links(a.tenantId);
    const planner = a.callerFor(a.people.planner);
    await expect(planner.schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.Q01, stageCodes: ["Q26"], anchor: "span" }] })).rejects.toThrow(/PROJECT_OS_PMC_STAGE_LINK_INVALID/);
    await expect(planner.schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.Q01, stageCodes: ["Q02"], anchor: "span" }, { groupId: groupIds.Q05, stageCodes: ["Q02", "Q06"], anchor: "start" }] })).rejects.toThrow(/PROJECT_OS_PMC_STAGE_LINK_INVALID/);
    await expect(planner.schedule.saveStageMapping({ ...scope(), links: [{ groupId: randomUUID(), stageCodes: ["Q02"], anchor: "span" }] })).rejects.toThrow(/PROJECT_OS_PMC_GROUP_NOT_FOUND/);
    await expect(a.callerFor(a.people.site).schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.Q07, stageCodes: ["Q20"], anchor: "span" }] })).rejects.toThrow();
    await expect(a.callerFor(a.people.accountant).schedule.stageMapping(scope())).rejects.toThrow();
    await expect(b.asOwner.schedule.stageMapping({ tenantId: a.tenantId, projectId: a.projectId })).rejects.toThrow();
    await expect(b.asOwner.schedule.saveStageMapping({ tenantId: b.tenantId, projectId: b.projectId, links: [{ groupId: groupIds.Q07, stageCodes: ["Q20"], anchor: "span" }] })).rejects.toThrow(/PROJECT_OS_PMC_GROUP_NOT_FOUND/);
    expect(await links(a.tenantId)).toEqual(before);
    expect(await links(b.tenantId)).toEqual([]);
  });

  it("ISOLATION, as the application's own account under row-level security: another company's context sees none of A's links", async () => {
    const app = new pg.Client({ connectionString: process.env.TEST_APP_DATABASE_URL ?? process.env.DATABASE_URL }); await app.connect();
    try {
      await app.query("BEGIN");
      await app.query("SELECT set_config('app.tenant_ids', $1, true), set_config('app.user_id', $2, true), set_config('app.system', 'off', true)", [b.tenantId, String(b.owner.id)]);
      expect((await app.query("SELECT COUNT(*)::int AS n FROM pmc_schedule_stage_links WHERE tenant_id = $1", [a.tenantId])).rows[0].n).toBe(0);
      await app.query("ROLLBACK");
      await app.query("BEGIN");
      await app.query("SELECT set_config('app.tenant_ids', $1, true), set_config('app.user_id', $2, true), set_config('app.system', 'off', true)", [a.tenantId, String(a.owner.id)]);
      expect((await app.query("SELECT COUNT(*)::int AS n FROM pmc_schedule_stage_links WHERE tenant_id = $1", [a.tenantId])).rows[0].n).toBe(3);
      await app.query("ROLLBACK");
    } finally { await app.end(); }
  });

  it("review of #550, note 1: two people saving the same group at the same moment both succeed (no raw unique-index error), one link remains, and the second audit's «before» is the first save's «after»", async () => {
    const planner = a.callerFor(a.people.planner); const owner = a.asOwner;
    const results = await Promise.allSettled([
      planner.schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.Q07, stageCodes: ["Q20"], anchor: "span" }] }),
      owner.schedule.saveStageMapping({ ...scope(), links: [{ groupId: groupIds.Q07, stageCodes: ["Q20"], anchor: "end" }] }),
    ]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const { rows } = await client.query("SELECT anchor FROM pmc_schedule_stage_links WHERE tenant_id = $1 AND group_id = $2", [a.tenantId, groupIds.Q07]);
    expect(rows).toHaveLength(1);
    const { rows: audit } = await client.query("SELECT metadata FROM audit_logs WHERE tenant_id = $1 AND action = 'pmc.schedule_stage_links_saved' ORDER BY created_at DESC LIMIT 2", [a.tenantId]);
    const [second, first] = audit.map(row => JSON.parse(row.metadata).changes[0]);
    expect(second.before).toEqual({ stageCodes: first.after.stageCodes, anchor: first.after.anchor });
    expect(rows[0].anchor).toBe(second.after.anchor);
  });
});

