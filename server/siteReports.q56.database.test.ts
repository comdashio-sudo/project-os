import fixtureDb from "./testing/pgCompat";
import { requireReportApproval } from "./testing/reportApproval";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-56 (4a, 4b): a company of one person cannot approve its own daily report (unchanged), so the platform now says who approves — siteReports.approvers, names
// only, by the approval's own rule — and how many of a week's or month's reports wait (reportPeriods awaitingApproval). And the approver can approve a report
// without moving the villas QC has not accepted (leaveNotAccepted): those stay where they are, listed as skipped, and the quality policy still holds.
// Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "q56-approval"; const SLUG_B = "q56-approval-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q56.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const KEYS = ["owner", "pm", "engineer", "ownerB"] as const;
const NAMES: Record<(typeof KEYS)[number], string> = { owner: "Owner (synthetic)", pm: "Project manager (synthetic)", engineer: "Site engineer (synthetic)", ownerB: "Other owner (synthetic)" };
const id = (n: number) => `f5600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = id(1); const ZONE = id(20); const BLOCK = id(21); const U1 = id(22); const U2 = id(23); const GROUP = id(24); const STAGE = id(25); const WALLS = id(26);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'q56-%'");
}
const cellStatus = async (unit: string) => { const [rows] = await connection.query<{ status: string }[]>("SELECT status FROM pmc_unit_activity_progress WHERE unitId = ? AND activityDefinitionId = ?", [unit, WALLS]); return rows[0]?.status ?? null; };
const week = (anchor: string) => callers.owner.reportPeriods.get({ ...scope(), kind: "week", anchor });
const names = (people: Array<{ name: string | null }>) => people.map(person => person.name).sort();

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-56 (4): who approves a daily report, what waits, and approving without moving the villas QC has not accepted", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q56-${key}`, NAMES[key], `q56-${key}@q56.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q56-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `q56-${key}`)!.id; callers[key] = callerFor(userIds[key], `q56-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Q56 One-person Co. (synthetic)", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callers.ownerB.tenant.create({ legalName: "Q56 Other Co. (synthetic)", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await requireReportApproval(tenantId); await requireReportApproval(tenantB); // Q-71 (2): this file tests who approves and what waits
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q56-1', 'Villas (synthetic)', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1)", [U1, tenantId, P, BLOCK, U2, tenantId, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'STR', 'Structure')", [GROUP, tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'BLK', 'Blockwork')", [STAGE, tenantId, P, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100)", [WALLS, tenantId, P, GROUP, STAGE]);
  }, 240_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("4a: a company of one — nobody but the preparer, and the week says one report waits; a project manager joins, is named, approves, and the week counts it", async () => {
    const report = await callers.owner.siteReports.save({ ...scope(), reportDate: daysAgo(1), summary: "First report of a new company (synthetic)", lines: [] });
    await callers.owner.siteReports.submit({ ...scope(), reportId: report.id });
    // the rule is unchanged: the preparer does not approve their own report
    await expect(callers.owner.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).rejects.toThrow("PROJECT_OS_SITE_REPORT_SELF_REVIEW");
    // who may approve: only the owner — less the preparer, nobody (the screen says «invite a project manager»)
    const alone = await callers.owner.siteReports.approvers(scope());
    expect(alone).toMatchObject({ named: false, reviewFirst: false });
    expect(alone.people.map(person => person.userId)).toEqual([userIds.owner]);
    expect(alone.people.filter(person => person.userId !== userIds.owner)).toEqual([]);
    // the week and the month count approved reports only, and say how many wait
    const waiting = await week(daysAgo(1));
    expect(waiting.reports).toEqual([]);
    expect(waiting.awaitingApproval).toBe(1);
    expect((await callers.owner.reportPeriods.monthly({ ...scope(), month: daysAgo(1).slice(0, 7) })).awaitingApproval).toBe(1);

    // a project manager and a site engineer join the project
    const administration = await callers.owner.tenant.administration({ tenantId });
    const roleOf = (code: string) => administration.roles.find(role => role.code === code)!.id;
    for (const [key, role] of [["pm", "PROJECT_MANAGER"], ["engineer", "SITE_ENGINEER"]] as const) {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `q56-${key}@q56.example.test`, roleId: roleOf(role), scopeType: "project", scopeId: P });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    }
    const two = await callers.owner.siteReports.approvers(scope());
    expect(names(two.people)).toEqual([NAMES.owner, NAMES.pm].sort()); // the site engineer does not hold project.manage
    // the site engineer reads the names (they need to know where their report goes); names only — no e-mail address
    const read = await callers.engineer.siteReports.approvers(scope());
    expect(names(read.people)).toEqual(names(two.people));
    expect(Object.keys(read.people[0]).sort()).toEqual(["name", "userId"]);

    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).resolves.toMatchObject({ status: "approved" });
    const counted = await week(daysAgo(1));
    expect(counted.awaitingApproval).toBe(0);
    expect(counted.reports.map(row => row.id)).toEqual([report.id]);
  });

  it("4a: when the project names who approves, that person alone is listed; another company's owner reads nothing", async () => {
    const team = await callers.owner.projects.team.list(scope());
    const pmMembership = team.find(member => member.userId === userIds.pm)!.membershipId;
    await callers.owner.projects.approvers.set({ ...scope(), step: "approve", membershipId: pmMembership });
    const named = await callers.owner.siteReports.approvers(scope());
    expect(named.named).toBe(true);
    expect(named.people.map(person => person.userId)).toEqual([userIds.pm]);
    await callers.owner.projects.approvers.set({ ...scope(), step: "approve", membershipId: null });
    // isolation: the other company's owner cannot read this project's approvers, nor its awaiting count
    await expect(callers.ownerB.siteReports.approvers(scope())).rejects.toThrow(/PROJECT_OS_(TENANT_ACCESS_DENIED|PERMISSION_DENIED)/);
    await expect(callers.ownerB.reportPeriods.get({ ...scope(), kind: "week", anchor: daysAgo(1) })).rejects.toThrow(/PROJECT_OS_(TENANT_ACCESS_DENIED|PERMISSION_DENIED)/);
    // and their own company's figures never see this one's reports
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q56-B', 'Other (synthetic)', 'villas', 'SAR', 'active')", [id(90), tenantB]);
    expect((await callers.ownerB.reportPeriods.get({ tenantId: tenantB, projectId: id(90), kind: "week", anchor: daysAgo(1) })).awaitingApproval).toBe(0);
  });

  it("4b: QC holds a villa — the approval is refused as before; «approve without moving these villas» approves, moves the rest, and leaves the held one where it is", async () => {
    await callers.owner.policy.set({ tenantId, qcCompletionMode: "block", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn" });
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(2), lines: [
      { lineType: "work", description: "Walls of villa 1 done", pmcUnitId: U1, pmcActivityDefinitionId: WALLS, reportedStatus: "COMPLETE" },
      { lineType: "work", description: "Walls of villa 2 started", pmcUnitId: U2, pmcActivityDefinitionId: WALLS, reportedStatus: "IN_PROGRESS" },
    ] });
    await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id });
    const dry = await callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve", dryRun: true });
    expect(dry.notAccepted).toEqual([{ unitId: U1, activityDefinitionId: WALLS }]);
    await expect(callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" })).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED");
    expect([await cellStatus(U1), await cellStatus(U2)]).toEqual([null, null]); // the refusal wrote nothing
    // the preview of the way out says what will and will not move
    const preview = await callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve", dryRun: true, leaveNotAccepted: true });
    expect(preview.applied.map(cell => cell.unitId)).toEqual([U2]);
    expect(preview.skipped).toEqual([{ unitId: U1, activityDefinitionId: WALLS, reason: "QC_NOT_ACCEPTED", current: "NOT_STARTED", reported: "COMPLETE" }]);
    expect(preview.notAccepted).toEqual([]);
    const approved = await callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve", leaveNotAccepted: true });
    expect(approved.status).toBe("approved");
    expect([await cellStatus(U1), await cellStatus(U2)]).toEqual([null, "IN_PROGRESS"]); // the held villa did not move; the other did
    const [[audit]] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'site_report.approved' AND entityId = ?", [tenantId, report.id]);
    expect(JSON.parse(audit.metadata).leftForQc).toEqual([{ unitId: U1, activityDefinitionId: WALLS }]);
    // the option is the approver's, not the preparer's: the same rules hold (an engineer may not approve at all)
    const second = await callers.engineer.siteReports.save({ ...scope(), reportDate: daysAgo(3), lines: [{ lineType: "work", description: "Villa 1 again", pmcUnitId: U1, pmcActivityDefinitionId: WALLS, reportedStatus: "COMPLETE" }] });
    await callers.engineer.siteReports.submit({ ...scope(), reportId: second.id });
    await expect(callers.engineer.siteReports.review({ ...scope(), reportId: second.id, decision: "approve", leaveNotAccepted: true })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
  });
});
