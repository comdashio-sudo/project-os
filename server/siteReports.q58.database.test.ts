import fixtureDb from "./testing/pgCompat";
import { requireReportApproval } from "./testing/reportApproval";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-58 (1): more than one daily report per person per day (the owner's decision). Each report has its own number and an optional label; a save names the report it
// changes; the week counts a day once and adds the labour of every approved report; «copy from yesterday» asks which report when that day has two.
// Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "q58-many"; const SLUG_B = "q58-many-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q58.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const KEYS = ["owner", "pm", "engineer", "hse", "ownerB"] as const;
const id = (n: number) => `f5800000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
    for (const table of ["site_daily_report_hse", "site_daily_report_obstacles", "site_daily_report_tomorrow", "site_daily_report_materials", "site_daily_report_labour", "site_daily_report_equipment", "site_daily_report_lines", "site_daily_reports",
      "rfis", "pmc_inspection_request_units", "pmc_inspection_requests", "project_labour_roles", "project_equipment", "project_companies", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q58-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-58 (1): several daily reports of one day", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q58-${key}`, `Synthetic ${key}`, `q58-${key}@q58.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q58-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `q58-${key}`)!.id; callers[key] = callerFor(userIds[key], `q58-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Q58 Many Co. (synthetic)", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await requireReportApproval(tenantId); // Q-71 (2): both reports of the day are approved by the project manager here
    await callers.ownerB.tenant.create({ legalName: "Q58 Other Co. (synthetic)", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q58-1', 'Villas (synthetic)', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 7, 'A', 1)", [U1, tenantId, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'STR', 'Structure')", [GROUP, tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'BLK', 'Blockwork')", [STAGE, tenantId, P, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100)", [WALLS, tenantId, P, GROUP, STAGE]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    const roleOf = (code: string) => administration.roles.find(role => role.code === code)!.id;
    for (const [key, role] of [["pm", "PROJECT_MANAGER"], ["engineer", "SITE_ENGINEER"], ["hse", "HSE_MANAGER"]] as const) {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `q58-${key}@q58.example.test`, roleId: roleOf(role), scopeType: "project", scopeId: P });
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

  it("two reports of one day by one engineer, each its number and label; both approved; the week counts the day once, the labour of both and the quantities of both", async () => {
    const day = daysAgo(2);
    // each report plans and does its own shift's share of the walls (review of #523: the week adds them — two shifts, two plans — never one report's twice)
    const walls = (planned: number, actual: number) => [{ lineType: "work" as const, description: "Walls (synthetic)", pmcActivityDefinitionId: WALLS, plannedQuantity: planned, actualQuantity: actual }];
    const morning = await callers.engineer.siteReports.save({ ...scope(), newReportId: crypto.randomUUID(), reportDate: day, label: "Zone A — day shift (synthetic)", summary: "Zone A", lines: walls(10, 8), labour: crew(10), equipment: mixer() });
    const evening = await callers.engineer.siteReports.save({ ...scope(), newReportId: crypto.randomUUID(), reportDate: day, label: "Zone B — night shift (synthetic)", summary: "Zone B", lines: walls(5, 4), labour: crew(6) });
    expect(evening.id).not.toBe(morning.id);
    expect(evening.reportNumber).not.toBe(morning.reportNumber);
    // a save names the report it changes: the other one is untouched
    await callers.engineer.siteReports.save({ ...scope(), reportId: morning.id, reportDate: day, label: "Zone A — day shift (synthetic)", summary: "Zone A, corrected", lines: walls(10, 8), labour: crew(11), equipment: mixer() });
    expect((await callers.engineer.siteReports.get({ ...scope(), reportId: morning.id })).report.summary).toBe("Zone A, corrected");
    expect((await callers.engineer.siteReports.get({ ...scope(), reportId: evening.id })).report).toMatchObject({ summary: "Zone B", label: "Zone B — night shift (synthetic)" });
    const listed = (await callers.engineer.siteReports.list(scope())).filter(row => row.reportDate === day);
    expect(listed.map(row => row.label).sort()).toEqual(["Zone A — day shift (synthetic)", "Zone B — night shift (synthetic)"]);
    for (const report of [morning, evening]) {
      await callers.engineer.siteReports.submit({ ...scope(), reportId: report.id });
      await callers.pm.siteReports.review({ ...scope(), reportId: report.id, decision: "approve" });
    }
    const week = await callers.pm.reportPeriods.get({ ...scope(), kind: "week", anchor: day });
    expect(week.reports.filter(report => report.date === day)).toHaveLength(2);
    expect(week.missingWorkingDays).not.toContain(day); // the day is counted once, as reported
    expect(week.period.workingDays.filter(workingDay => workingDay === day).length).toBeLessThanOrEqual(1);
    const dayLabour = week.labour.daily.find(row => row.date === day)!;
    expect(dayLabour.direct + dayLabour.indirect).toBe(17); // 11 + 6: every approved report of the day, each once
    expect(week.activities.find(activity => activity.code === "WALLS")?.period).toMatchObject({ planned: 15, actual: 12 }); // 10 + 5 planned, 8 + 4 done
  });

  it("a saved report keeps its day; another person's report cannot be named; a save from an older screen (no id) goes to the day's only report, and is refused when there are two", async () => {
    const day = daysAgo(4);
    const report = await callers.engineer.siteReports.save({ ...scope(), reportDate: day, summary: "Only one (synthetic)", lines: [] });
    await expect(callers.engineer.siteReports.save({ ...scope(), reportId: report.id, reportDate: daysAgo(5), lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_DATE_FIXED");
    await expect(callers.pm.siteReports.save({ ...scope(), reportId: report.id, reportDate: day, lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_NOT_FOUND");
    const legacy = await callers.engineer.siteReports.save({ ...scope(), reportDate: day, summary: "Kept offline (synthetic)", lines: [], queuedAt: new Date().toISOString() });
    expect(legacy.id).toBe(report.id);
    expect((await callers.engineer.siteReports.get({ ...scope(), reportId: report.id })).report.summary).toBe("Kept offline (synthetic)");
    // a cached page of before this change, pressing «save» again: still the day's only report, not a second one (review of #523, note 1)
    expect((await callers.engineer.siteReports.save({ ...scope(), reportDate: day, summary: "Cached page (synthetic)", lines: [] })).id).toBe(report.id);
    // the screen's «new report» carries the id it chose: its first save creates it, a second save of it (sent twice, kept offline twice) changes it
    const newId = crypto.randomUUID();
    const another = await callers.engineer.siteReports.save({ ...scope(), newReportId: newId, reportDate: day, summary: "A second one (synthetic)", lines: [] });
    expect(another.id).toBe(newId);
    expect((await callers.engineer.siteReports.save({ ...scope(), newReportId: newId, reportDate: day, summary: "A second one, again (synthetic)", lines: [], queuedAt: new Date().toISOString() })).id).toBe(newId);
    const ofDay = async () => (await callers.engineer.siteReports.list(scope())).filter(row => row.reportDate === day);
    expect(await ofDay()).toHaveLength(2);
    // with two reports that day, a save that names none is refused — no third report, no guess (note 2), whether kept offline or not
    await expect(callers.engineer.siteReports.save({ ...scope(), reportDate: day, summary: "Which? (synthetic)", lines: [], queuedAt: new Date().toISOString() })).rejects.toThrow("PROJECT_OS_SITE_REPORT_SAVE_WHICH");
    await expect(callers.engineer.siteReports.save({ ...scope(), reportDate: day, summary: "Which? (synthetic)", lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_SAVE_WHICH");
    expect(await ofDay()).toHaveLength(2);
    // a chosen id that is another person's report is not taken over; one of another day keeps its day
    await expect(callers.pm.siteReports.save({ ...scope(), newReportId: newId, reportDate: day, lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_NOT_FOUND");
    await expect(callers.engineer.siteReports.save({ ...scope(), newReportId: newId, reportDate: daysAgo(5), lines: [] })).rejects.toThrow("PROJECT_OS_SITE_REPORT_DATE_FIXED");
    expect((await callers.engineer.siteReports.get({ ...scope(), reportId: newId })).report.summary).toBe("A second one, again (synthetic)");
  });

  it("«copy from yesterday»: one report there is copied as before; with two, the screen must say which, and the one named is copied", async () => {
    // daysAgo(2) holds two reports of the engineer (the first test)
    await expect(callers.engineer.siteReports.copyFromYesterday({ ...scope(), reportDate: daysAgo(1) })).rejects.toThrow("PROJECT_OS_SITE_REPORT_COPY_WHICH");
    const zoneB = (await callers.engineer.siteReports.list(scope())).find(row => row.reportDate === daysAgo(2) && row.label?.startsWith("Zone B"))!;
    const copied = await callers.engineer.siteReports.copyFromYesterday({ ...scope(), reportDate: daysAgo(1), sourceReportId: zoneB.id });
    expect(copied).toMatchObject({ from: zoneB.id, labour: 1, equipment: 0 });
    // a source of another person, or not before the day, is not a source
    await expect(callers.pm.siteReports.copyFromYesterday({ ...scope(), reportDate: daysAgo(0), sourceReportId: zoneB.id })).rejects.toThrow("PROJECT_OS_SITE_REPORT_NOTHING_TO_COPY");
    await expect(callers.engineer.siteReports.copyFromYesterday({ ...scope(), reportDate: daysAgo(3), sourceReportId: zoneB.id })).rejects.toThrow("PROJECT_OS_SITE_REPORT_NOTHING_TO_COPY");
  });
});
