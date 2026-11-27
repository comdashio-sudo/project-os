import fixtureDb from "./testing/pgCompat";
import { requireReportApproval } from "./testing/reportApproval";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-58 (1): more than one daily report per person per day (the owner's decision). Each report has its own number and an optional label; a save names the report it
// changes; the week counts a day once and adds the labour of every approved report; «copy from yesterday» asks which report when that day has two.
// Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "q72-many"; const SLUG_B = "q72-many-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q72.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const KEYS = ["owner", "pm", "engineer", "hse", "ownerB"] as const;
const id = (n: number) => `f7200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = id(1); const ZONE = id(20); const BLOCK = id(21); const U1 = id(22); const GROUP = id(24); const STAGE = id(25); const WALLS = id(26);
const daysAgo = (n: number) => new Date(Date.now() + 3 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);

let connection: fixtureDb.Connection;
let tenantId = ""; let companyId = ""; let roleId = ""; let machineId = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};
const scope = () => ({ tenantId, projectId: P });
const range = { from: daysAgo(10), to: daysAgo(0) };

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, SLUG_B]);
  for (const { id: company } of companies) {
    for (const table of ["site_daily_report_corrections", "site_daily_report_hse", "site_daily_report_obstacles", "site_daily_report_tomorrow", "site_daily_report_materials", "site_daily_report_labour", "site_daily_report_equipment", "site_daily_report_lines", "site_daily_reports",
      "rfis", "pmc_inspection_request_units", "pmc_inspection_requests", "project_labour_roles", "project_equipment", "project_companies", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q72-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-72 (5): a sent daily report is frozen; its correction is an additional record", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q72-${key}`, `Synthetic ${key}`, `q72-${key}@q72.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q72-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `q72-${key}`)!.id; callers[key] = callerFor(userIds[key], `q72-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Q72 Many Co. (synthetic)", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await requireReportApproval(tenantId); // Q-71 (2): both reports of the day are approved by the project manager here
    await callers.ownerB.tenant.create({ legalName: "Q72 Other Co. (synthetic)", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q72-1', 'Villas (synthetic)', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 7, 'A', 1)", [U1, tenantId, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'STR', 'Structure')", [GROUP, tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'BLK', 'Blockwork')", [STAGE, tenantId, P, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100)", [WALLS, tenantId, P, GROUP, STAGE]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    const roleOf = (code: string) => administration.roles.find(role => role.code === code)!.id;
    for (const [key, role] of [["pm", "PROJECT_MANAGER"], ["engineer", "SITE_ENGINEER"], ["hse", "HSE_MANAGER"]] as const) {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `q72-${key}@q72.example.test`, roleId: roleOf(role), scopeType: "project", scopeId: P });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    }
    await callers.owner.projects.companies.save({ ...scope(), name: "Main Contractor (synthetic)", role: "main" });
    companyId = (await callers.owner.projects.companies.list(scope()))[0]!.id;
    await callers.owner.projects.labourRoles.seedDefaults({ ...scope(), language: "en" });
    roleId = (await callers.owner.projects.labourRoles.list(scope()))[0]!.id;
    await callers.owner.projects.equipment.save({ ...scope(), equipmentType: "Mixer (synthetic)", model: null, plateOrSize: null, ownerCompanyId: null } as never);
    machineId = (await callers.owner.projects.equipment.list(scope()))[0]!.id;
  }, 240_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const mixer = () => [{ equipmentId: machineId, count: 1, hours: 8 }];
  const crew = (headcount: number) => [{ companyId, labourRoleId: roleId, shift: "day" as const, headcount }];

  it("a correction goes only on a report that was sent: the sent figures stay as sent, the correction is its own row (who, when, which part), audited; a draft, an empty note and a stranger are refused", async () => {
    const day = daysAgo(3);
    const draft = await callers.engineer.siteReports.save({ ...scope(), newReportId: crypto.randomUUID(), reportDate: day, summary: "Zone A", lines: [], labour: crew(10), equipment: mixer() });
    // not sent yet: it is still the preparer's to edit, so a correction is refused with its reason and nothing is written
    await expect(callers.engineer.siteReports.addCorrection({ ...scope(), reportId: draft.id, section: "labour", note: "ten, not twelve" })).rejects.toThrow(/PROJECT_OS_SITE_REPORT_CORRECTION_NOT_SENT/);
    await callers.engineer.siteReports.submit({ ...scope(), reportId: draft.id });
    await callers.pm.siteReports.review({ ...scope(), reportId: draft.id, decision: "approve" });
    const before = await callers.pm.siteReports.get({ ...scope(), reportId: draft.id });
    expect(before.corrections).toEqual([]);
    await expect(callers.engineer.siteReports.addCorrection({ ...scope(), reportId: draft.id, section: "labour", note: "   " })).rejects.toThrow(/PROJECT_OS_SITE_REPORT_CORRECTION_EMPTY/);
    const added = await callers.engineer.siteReports.addCorrection({ ...scope(), reportId: draft.id, section: "labour", note: "Labour was 12 on site, not 10 (synthetic)" });
    const after = await callers.pm.siteReports.get({ ...scope(), reportId: draft.id });
    expect(after.corrections).toHaveLength(1);
    expect(after.corrections[0]).toMatchObject({ id: added.id, section: "labour", note: "Labour was 12 on site, not 10 (synthetic)", createdByUserId: userIds.engineer });
    // the sent report is exactly as it was sent (the labour of the day still counts 10)
    expect({ ...after, corrections: [] }).toEqual({ ...before, corrections: [] });
    const [[audit]] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'site_report.correction_added'", [tenantId, draft.id]);
    expect(audit.n).toBe(1);
    // another company's user cannot add one, and a project reader without the field permission cannot either
    await expect(callers.ownerB.siteReports.addCorrection({ ...scope(), reportId: draft.id, section: "labour", note: "x" })).rejects.toThrow();
    await expect(callers.hse.siteReports.addCorrection({ ...scope(), reportId: draft.id, section: "hse", note: "x" })).resolves.toBeDefined(); // the HSE manager holds the field permission on this project
    const [[count]] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM site_daily_report_corrections WHERE tenantId = ? AND reportId = ?", [tenantId, draft.id]);
    expect(count.n).toBe(2);
  });
});
