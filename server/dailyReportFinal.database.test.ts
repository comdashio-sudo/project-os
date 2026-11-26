import fixtureDb from "./testing/pgCompat";
import { requireReportApproval } from "./testing/reportApproval";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-71 (2) (the owner, 26-11: «why does the daily report wait for approval? it is just sent»): a company's daily reports need no approval unless it turns the
// rule on. Off (the default): sending makes the report final — it is counted in the week at once, nothing «waits», and its progress lines move the villas'
// cells as an approval did (a villa QC has not accepted under «block» stays where it is). On: the chain as before. A report that was waiting when the rule
// goes off counts as sent — computed, no row rewritten. Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "q71-final"; const SLUG_B = "q71-final-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q71.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const KEYS = ["owner", "pm", "engineer", "hse", "ownerB"] as const;
const id = (n: number) => `f7100000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = id(1); const ZONE = id(20); const BLOCK = id(21); const U1 = id(22); const U2 = id(23); const U3 = id(27); const GROUP = id(24); const STAGE = id(25); const WALLS = id(26);
const daysAgo = (n: number) => new Date(Date.now() + 3 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);

let connection: fixtureDb.Connection;
let tenantId = ""; let tenantB = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};
const scope = () => ({ tenantId, projectId: P });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, SLUG_B]);
  for (const { id: company } of companies) {
    for (const table of ["site_daily_report_lines", "site_daily_reports", "project_report_approvers", "tenant_policies", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q71-%'");
}
const cellStatus = async (unit: string) => { const [rows] = await connection.query<{ status: string }[]>("SELECT status FROM pmc_unit_activity_progress WHERE unitId = ? AND activityDefinitionId = ?", [unit, WALLS]); return rows[0]?.status ?? null; };
const reportStatus = async (reportId: string) => { const [rows] = await connection.query<{ status: string }[]>("SELECT status FROM site_daily_reports WHERE id = ?", [reportId]); return rows[0]?.status; };
const week = (anchor: string) => callers.owner.reportPeriods.get({ ...scope(), kind: "week", anchor });
const audits = async (action: string) => { const [rows] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = ?", [tenantId, action]); return rows; };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-71 (2): a daily report needs no approval unless the company turns the rule on", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q71-${key}`, `${key} (synthetic)`, `q71-${key}@q71.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q71-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `q71-${key}`)!.id; callers[key] = callerFor(userIds[key], `q71-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Q71 Co. (synthetic)", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callers.ownerB.tenant.create({ legalName: "Q71 Other Co. (synthetic)", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q71-1', 'Villas (synthetic)', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1), (?, ?, ?, ?, 3, 'A', 1)", [U1, tenantId, P, BLOCK, U2, tenantId, P, BLOCK, U3, tenantId, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'STR', 'Structure')", [GROUP, tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'BLK', 'Blockwork')", [STAGE, tenantId, P, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100)", [WALLS, tenantId, P, GROUP, STAGE]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    const roleOf = (code: string) => administration.roles.find(role => role.code === code)!.id;
    for (const [key, role] of [["pm", "PROJECT_MANAGER"], ["engineer", "SITE_ENGINEER"], ["hse", "HSE_MANAGER"]] as const) {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `q71-${key}@q71.example.test`, roleId: roleOf(role), scopeType: "project", scopeId: P });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    }
  }, 240_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("POSITIVE, the default (no rule saved): the engineer sends — the report is final at once, the week counts it, nothing waits, the villa's cell moves, and the audit says it was final on sending", async () => {
    expect((await callers.owner.policy.get({ tenantId })).dailyReportApproval).toBe(false);
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(1), summary: "Blockwork of villa 1 (synthetic)", lines: [{ lineType: "work", description: "Villa 1 walls", pmcUnitId: U1, pmcActivityDefinitionId: WALLS, reportedStatus: "IN_PROGRESS" }] });
    const sent = await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id });
    expect(sent).toMatchObject({ status: "approved", final: true });
    expect(await reportStatus(report.id)).toBe("approved");
    expect(await cellStatus(U1)).toBe("IN_PROGRESS");
    const counted = await week(daysAgo(1));
    expect(counted.awaitingApproval).toBe(0);
    expect(counted.reports.map(row => row.id)).toContain(report.id);
    const final = await audits("site_report.submitted_final");
    expect(final).toHaveLength(1);
    expect(JSON.parse(final[0].metadata)).toMatchObject({ applied: 1, approvalRule: "off" });
    // a final report cannot be approved again, nor edited
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).rejects.toThrow("PROJECT_OS_SITE_REPORT_NOT_SUBMITTED");
  });

  it("NEGATIVE: with «block» QC, a villa without an accepted inspection is not moved to COMPLETE by sending — it is listed as skipped, the report is still final", async () => {
    await callers.owner.policy.set({ tenantId, qcCompletionMode: "block", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn" });
    expect((await callers.owner.policy.get({ tenantId })).dailyReportApproval).toBe(false); // the QC change left the daily report rule as it was
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(2), lines: [{ lineType: "work", description: "Villa 2 complete", pmcUnitId: U2, pmcActivityDefinitionId: WALLS, reportedStatus: "COMPLETE" }] });
    const sent = await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id });
    expect(sent).toMatchObject({ status: "approved", final: true });
    expect(sent.final && sent.skipped.map(cell => cell.reason)).toEqual(["QC_NOT_ACCEPTED"]);
    expect(await cellStatus(U2)).toBeNull(); // never written
    await callers.owner.policy.set({ tenantId, qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn" });
  });

  it("with the rule ON, sending waits for the approver as before (the week says one waits); turned OFF again, that waiting report counts as sent — no row rewritten", async () => {
    await callers.owner.policy.set({ tenantId, qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn", dailyReportApproval: true });
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(3), summary: "Waiting report (synthetic)", lines: [{ lineType: "work", description: "Villa 3 walls", pmcUnitId: U3, pmcActivityDefinitionId: WALLS, reportedStatus: "IN_PROGRESS" }] });
    expect(await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id })).toMatchObject({ status: "submitted", final: false });
    expect(await cellStatus(U3)).toBeNull(); // waits for the approver
    const waiting = await week(daysAgo(3));
    expect(waiting.awaitingApproval).toBe(1);
    expect(waiting.reports.map(row => row.id)).not.toContain(report.id);
    // the manager turns the rule off: the waiting report is counted and nothing waits, while its row is untouched
    await callers.owner.policy.set({ tenantId, qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn", dailyReportApproval: false });
    const after = await week(daysAgo(3));
    expect(after.awaitingApproval).toBe(0);
    expect(after.reports.map(row => row.id)).toContain(report.id);
    expect(await reportStatus(report.id)).toBe("submitted");
    // its villa waits for an approver to move it (the approval still works on a report sent before)
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).resolves.toMatchObject({ status: "approved" });
    expect(await cellStatus(U3)).toBe("IN_PROGRESS");
    const changed = await audits("tenant.policy_changed");
    expect(changed.some(row => JSON.parse(row.metadata).after?.dailyReportApproval === true)).toBe(true);
  });

  it("NEGATIVE: a draft and a rejected report are never counted; only a company manager changes the rule; another company reads none of this", async () => {
    const draft = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(4), summary: "Never sent (synthetic)", lines: [] });
    expect((await week(daysAgo(4))).reports.map(row => row.id)).not.toContain(draft.id);
    await expect(callers.engineer.policy.set({ tenantId, qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn", dailyReportApproval: true })).rejects.toThrow();
    expect((await callers.owner.policy.get({ tenantId })).dailyReportApproval).toBe(false);
    await expect(callers.ownerB.reportPeriods.get({ ...scope(), kind: "week", anchor: daysAgo(1) })).rejects.toThrow(/PROJECT_OS_(TENANT_ACCESS_DENIED|PERMISSION_DENIED)/);
    await expect(callers.ownerB.policy.get({ tenantId })).rejects.toThrow();
    // the other company keeps its own rule (unset: off) whatever this one does
    expect((await callers.ownerB.policy.get({ tenantId: tenantB })).dailyReportApproval).toBe(false);
    await requireReportApproval(tenantB, false);
  });
});
