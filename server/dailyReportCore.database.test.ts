import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { siteToday } from "./wo22Shared";

// D-45 (a), P-38 on a real database, through the real router, as the restricted application role: the report number from the system, the header's wind and hours,
// the labour matrix and the equipment from the project's own lists, computed totals, «copy from yesterday», what is refused, and isolation between companies and
// between projects of one company. Synthetic data only (*.example.test).
const SLUG = "daily-core";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@dc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a7000000-0000-4000-8000-000000000001";
const B = "a7000000-0000-4000-8000-000000000002";
const KEYS = ["owner", "manager", "engineer", "engineer2", "viewer", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const lists = { main: "", sub: "", mason: "", steel: "", engineerRole: "", crane: "", loader: "", roleOnB: "" };
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const at = (projectId = A) => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["site_daily_report_labour", "site_daily_report_equipment", "site_daily_report_lines", "site_daily_reports", "project_report_counters", "project_equipment", "project_labour_roles", "project_companies", "project_profiles", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'dc-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the daily report's core on a real database (D-45 a)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`dc-${key}`, `DC ${key}`, `dc-${key}@dc.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'dc-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `dc-${key}`)!.id; callers[key] = callerFor(ids[key], `dc-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Daily Core Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Daily Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DC-A', 'Daily A', 'villas', 'SAR', 'active'), (?, ?, 'DC-B', 'Daily B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "DC_MANAGER", name: "Project manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const field = await callers.owner.tenant.createRole({ tenantId, code: "DC_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    const viewer = await callers.owner.tenant.createRole({ tenantId, code: "DC_VIEWER", name: "Viewer", productCode: "PROJECT", permissionCodes: ["project.read"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: A });
    for (const key of ["engineer", "engineer2"] as const) await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: viewer.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    // the project's lists (D-44 a) and its report prefix (D-42 a)
    await callers.manager.projects.profile.save({ ...at(), location: null, contractNumber: null, clientName: null, consultantName: null, contractorName: null, workDays: [0, 1, 2, 3, 4], workStart: null, workEnd: null, reportPrefix: "DRX" });
    lists.main = (await callers.manager.projects.companies.save({ ...at(), name: "Main Contractor (example)", role: "main" })).id;
    lists.sub = (await callers.manager.projects.companies.save({ ...at(), name: "Sub Contractor (example)", role: "sub" })).id;
    await callers.manager.projects.labourRoles.seedDefaults({ ...at(), language: "en" });
    const roles = await callers.manager.projects.labourRoles.list(at());
    lists.mason = roles.find(role => role.defaultKey === "mason")!.id; lists.steel = roles.find(role => role.defaultKey === "steel_fixer")!.id; lists.engineerRole = roles.find(role => role.defaultKey === "site_engineer")!.id;
    lists.crane = (await callers.manager.projects.equipment.save({ ...at(), equipmentType: "Mobile crane", model: "50T", plateOrSize: "DC-1", ownerCompanyId: lists.main })).id;
    lists.loader = (await callers.manager.projects.equipment.save({ ...at(), equipmentType: "Loader", model: null, plateOrSize: "DC-2", ownerCompanyId: lists.sub })).id;
    lists.roleOnB = (await callers.owner.projects.labourRoles.save({ ...at(B), name: "Role on B", category: "direct" })).id;
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  const labour = () => [
    { companyId: lists.main, labourRoleId: lists.mason, shift: "day" as const, headcount: 12 },
    { companyId: lists.main, labourRoleId: lists.engineerRole, shift: "day" as const, headcount: 2 },
    { companyId: lists.sub, labourRoleId: lists.steel, shift: "day" as const, headcount: 9 },
    { companyId: lists.sub, labourRoleId: lists.steel, shift: "night" as const, headcount: 4 },
  ];
  const equipment = () => [{ equipmentId: lists.crane, count: 1, hours: 8 }, { equipmentId: lists.loader, count: 2, hours: 6.5 }];

  it("a full report is saved with a system number; the totals read back equal the sum of its rows; a second save keeps the number", async () => {
    const saved = await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-01", weather: "sunny", wind: "NW 15 km/h", workHours: 10, lines: [{ lineType: "work", description: "Block work, zone 1", plannedQuantity: 120, actualQuantity: 95.5 }], labour: labour(), equipment: equipment() });
    expect(saved.reportNumber).toBe("DRX-0001");
    const again = await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-01", weather: "sunny", wind: "N 10 km/h", workHours: 9, lines: [{ lineType: "work", description: "Block work, zone 1", plannedQuantity: 120, actualQuantity: 95.5 }], labour: labour(), equipment: equipment() });
    expect(again).toMatchObject({ id: saved.id, reportNumber: "DRX-0001" });
    const read = await callers.viewer.siteReports.get({ ...at(), reportId: saved.id });
    expect(read.report).toMatchObject({ reportNumber: "DRX-0001", wind: "N 10 km/h", workHours: 9 });
    const stored = await count("SELECT COALESCE(SUM(headcount), 0) AS n FROM site_daily_report_labour WHERE reportId = ?", [saved.id]);
    expect(stored).toBe(27);
    expect(read.totals.labour).toMatchObject({ total: stored, direct: 25, indirect: 2, day: 23, night: 4 });
    expect(read.totals.labour.byCompany).toEqual(expect.arrayContaining([expect.objectContaining({ companyId: lists.main, headcount: 14 }), expect.objectContaining({ companyId: lists.sub, headcount: 13 })]));
    expect(read.totals.equipment).toEqual({ count: 3, hours: 8 + 2 * 6.5 });
    expect(read.totals.cumulativeManDays).toBe(27);
    expect(read.lines[0]).toMatchObject({ plannedQuantity: 120, actualQuantity: 95.5, variance: -24.5 });
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_report_labour WHERE reportId = ?", [saved.id])).toBe(4); // the second save replaced, not added
  });

  it("numbers are sequential with no duplicate when reports are saved at the same moment", async () => {
    const results = await Promise.all([
      callers.engineer2.siteReports.save({ ...at(), reportDate: "2026-11-01", lines: [], labour: [labour()[0]] }),
      callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-30", lines: [], labour: [labour()[2]] }),
      callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-29", lines: [], labour: [labour()[3]] }),
    ]);
    expect(results.map(result => result.reportNumber).sort()).toEqual(["DRX-0002", "DRX-0003", "DRX-0004"]);
    expect(await count("SELECT COUNT(DISTINCT reportNumber) AS n FROM site_daily_reports WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(4);
  });

  it("«copy from yesterday» copies exactly the labour and the equipment of the preparer's last report, and nothing else", async () => {
    const copied = await callers.engineer.siteReports.copyFromYesterday({ ...at(), reportDate: "2026-11-02" });
    expect(copied).toMatchObject({ reportNumber: "DRX-0005", labour: 4, equipment: 2 });
    const [source] = (await connection.query<{ id: string }[]>("SELECT id FROM site_daily_reports WHERE tenantId = ? AND preparedByUserId = ? AND reportDate = '2026-11-01'", [tenantId, ids.engineer]))[0];
    const rowsOf = async (reportId: string) => ((await connection.query<Array<Record<string, unknown>>>("SELECT companyId, labourRoleId, shift, headcount FROM site_daily_report_labour WHERE reportId = ? ORDER BY companyId, labourRoleId, shift", [reportId]))[0]).map(row => JSON.stringify(row));
    expect(await rowsOf(copied.id)).toEqual(await rowsOf(source.id));
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_report_equipment WHERE reportId = ? AND ((equipmentId = ? AND count = 1 AND hours = 8) OR (equipmentId = ? AND count = 2 AND hours = 6.5))", [copied.id, lists.crane, lists.loader])).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_report_lines WHERE reportId = ?", [copied.id])).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'site_report.copied' AND entityId = ?", [tenantId, copied.id])).toBe(1);
    // over an existing report of the day, before any report, and without the permission: refused, nothing written
    expect(await code(callers.engineer.siteReports.copyFromYesterday({ ...at(), reportDate: "2026-11-02" }))).toBe("PROJECT_OS_SITE_REPORT_EXISTS");
    expect(await code(callers.engineer2.siteReports.copyFromYesterday({ ...at(), reportDate: "2026-10-01" }))).toBe("PROJECT_OS_SITE_REPORT_NOTHING_TO_COPY");
    expect(await code(callers.viewer.siteReports.copyFromYesterday({ ...at(), reportDate: "2026-11-03" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_reports WHERE tenantId = ?", [tenantId])).toBe(5);
  });

  it("refused, with nothing written: a future date, a villa that does not exist, a role of another project, a labour cell twice, and a reader without field permission", async () => {
    const tomorrow = new Date(Date.parse(`${siteToday()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const reports = await count("SELECT COUNT(*) AS n FROM site_daily_reports WHERE tenantId = ?", [tenantId]);
    const labourRows = await count("SELECT COUNT(*) AS n FROM site_daily_report_labour WHERE tenantId = ?", [tenantId]);
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: tomorrow, lines: [] }))).toBe("PROJECT_OS_SITE_REPORT_DATE_FUTURE");
    expect(await code(callers.engineer.siteReports.copyFromYesterday({ ...at(), reportDate: tomorrow }))).toBe("PROJECT_OS_SITE_REPORT_DATE_FUTURE");
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [{ lineType: "work", pmcUnitId: "a7000000-0000-4000-8000-0000000000ff", description: "villa" }] }))).toBe("PROJECT_OS_PMC_UNIT_NOT_FOUND");
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], labour: [{ companyId: lists.main, labourRoleId: lists.roleOnB, shift: "day", headcount: 3 }] }))).toBe("PROJECT_OS_SITE_REPORT_REFERENCE_NOT_FOUND");
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], labour: [labour()[0], labour()[0]] }))).toBe("PROJECT_OS_SITE_REPORT_LABOUR_DUPLICATE");
    expect(await code(callers.viewer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], labour: [labour()[0]] }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_reports WHERE tenantId = ?", [tenantId])).toBe(reports);
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_report_labour WHERE tenantId = ?", [tenantId])).toBe(labourRows);
    // the database itself: a role of project B, or a report of project B, in a labour row of project A is impossible
    const [report] = (await connection.query<{ id: string }[]>("SELECT id FROM site_daily_reports WHERE tenantId = ? AND projectId = ? LIMIT 1", [tenantId, A]))[0];
    await expect(connection.query("INSERT INTO site_daily_report_labour (id, tenantId, projectId, reportId, companyId, labourRoleId, shift, headcount) VALUES (UUID(), ?, ?, ?, ?, ?, 'day', 1)", [tenantId, A, report.id, lists.main, lists.roleOnB])).rejects.toThrow(/site_daily_report_labour_role_fk/);
    await expect(connection.query("INSERT INTO site_daily_report_labour (id, tenantId, projectId, reportId, companyId, labourRoleId, shift, headcount) VALUES (UUID(), ?, ?, ?, ?, ?, 'evening', 1)", [tenantId, A, report.id, lists.main, lists.mason])).rejects.toThrow(/site_daily_report_labour_shift_check/);
    await expect(connection.query("INSERT INTO site_daily_report_equipment (id, tenantId, projectId, reportId, equipmentId, count) VALUES (UUID(), ?, ?, ?, ?, 0)", [tenantId, A, report.id, lists.crane])).rejects.toThrow(/site_daily_report_equipment_values_check/);
  });

  it("isolation: another company reads nothing of A; A's manager does not reach project B; B numbers its own reports", async () => {
    const [report] = (await connection.query<{ id: string }[]>("SELECT id FROM site_daily_reports WHERE tenantId = ? AND projectId = ? LIMIT 1", [tenantId, A]))[0];
    expect(await code(callers.otherOwner.siteReports.get({ ...at(), reportId: report.id }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.siteReports.get({ tenantId: otherTenantId, projectId: A, reportId: report.id }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.manager.siteReports.list(at(B)))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.siteReports.get({ ...at(B), reportId: report.id }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const onB = await callers.owner.siteReports.save({ ...at(B), reportDate: "2026-11-01", lines: [], labour: [] });
    expect(onB.reportNumber).toBe("DR-0001"); // project B has no prefix and its own sequence
    expect(await code(callers.owner.siteReports.get({ ...at(B), reportId: report.id }))).toBe("PROJECT_OS_SITE_REPORT_NOT_FOUND");
  });
});
