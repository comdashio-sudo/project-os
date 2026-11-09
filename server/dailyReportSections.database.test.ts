import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// D-45 (b), P-39 (1) on a real database, through the real router, as the restricted application role: materials received (against a consultant approval of the same
// project), HSE events, obstacles and the plan for tomorrow; replaced whole on a second save; «copy from yesterday» carries yesterday's plan; what is refused; isolation.
const SLUG = "daily-sections";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@ds.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a8000000-0000-4000-8000-000000000001";
const B = "a8000000-0000-4000-8000-000000000002";
const SUB_A = "a8000000-0000-4000-8000-0000000000a1";
const SUB_B = "a8000000-0000-4000-8000-0000000000b1";
const KEYS = ["owner", "engineer", "viewer", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const at = (projectId = A) => ({ tenantId, projectId });
const TABLES = ["site_daily_report_materials", "site_daily_report_hse", "site_daily_report_obstacles", "site_daily_report_tomorrow"];
const rowsIn = async () => { let total = 0; for (const table of TABLES) total += await count(`SELECT COUNT(*) AS n FROM ${table} WHERE tenantId = ?`, [tenantId]); return total; };

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of [...TABLES, "site_daily_report_labour", "site_daily_report_equipment", "site_daily_report_lines", "site_daily_reports", "project_report_counters", "consultant_submittals", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'ds-%'");
}

const sections = () => ({
  materials: [{ material: "Cement OPC (example)", quantity: 40, unit: "bag", supplier: "Supplier (example)", consultantSubmittalId: SUB_A }, { material: "Rebar 16 mm", quantity: 2.5, unit: "t" }],
  hse: [{ kind: "meeting" as const, description: "Toolbox talk: work at height", peopleCount: 35 }, { kind: "near_miss" as const, description: "Unsecured ladder", actionTaken: "Ladder tied off" }, { kind: "meeting" as const, description: "Lifting plan review", peopleCount: 6 }],
  obstacleItems: [{ issue: "Late concrete delivery", impact: "Slab pour delayed 3 h", responsible: "Supplier", action: "Second batch plant on call", dueDate: "2026-11-03" }],
  tomorrow: [{ area: "Zone 1", activity: "Block work", quantity: 150, unit: "m2", resources: "2 gangs" }, { activity: "Slab pour B04" }],
});

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the daily report's other sections on a real database (D-45 b)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`ds-${key}`, `DS ${key}`, `ds-${key}@ds.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'ds-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `ds-${key}`)!.id; callers[key] = callerFor(ids[key], `ds-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Daily Sections Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Sections Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DS-A', 'Sections A', 'villas', 'SAR', 'active'), (?, ?, 'DS-B', 'Sections B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    await connection.query("INSERT INTO consultant_submittals (id, tenantId, projectId, submittalType, submittalNumber, title, createdByUserId) VALUES (?, ?, ?, 'material_approval', 'MA-001', 'Cement (example)', ?), (?, ?, ?, 'material_approval', 'MA-001', 'Cement on B (example)', ?)", [SUB_A, tenantId, A, ids.owner, SUB_B, tenantId, B, ids.owner]);
    const field = await callers.owner.tenant.createRole({ tenantId, code: "DS_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    const viewer = await callers.owner.tenant.createRole({ tenantId, code: "DS_VIEWER", name: "Viewer", productCode: "PROJECT", permissionCodes: ["project.read"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: viewer.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("the four sections are saved and read back in order, with the HSE counted by kind; a second save replaces them, not adds", async () => {
    const saved = await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-01", lines: [], ...sections() });
    const read = await callers.viewer.siteReports.get({ ...at(), reportId: saved.id });
    expect(read.materials.map(row => [row.material, row.quantity, row.unit, row.consultantSubmittalId])).toEqual([["Cement OPC (example)", 40, "bag", SUB_A], ["Rebar 16 mm", 2.5, "t", null]]);
    expect(read.hse.map(row => row.kind)).toEqual(["meeting", "near_miss", "meeting"]);
    expect(read.totals.hse).toEqual({ meeting: 2, incident: 0, near_miss: 1, violation: 0, corrective_action: 0 });
    expect(read.obstacleItems[0]).toMatchObject({ issue: "Late concrete delivery", dueDate: "2026-11-03" });
    expect(read.tomorrow.map(row => [row.activity, row.quantity])).toEqual([["Block work", 150], ["Slab pour B04", null]]);
    expect(await rowsIn()).toBe(8);
    await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-01", lines: [], ...sections(), hse: [] });
    expect(await rowsIn()).toBe(5);
    expect((await callers.viewer.siteReports.get({ ...at(), reportId: saved.id })).totals.hse.meeting).toBe(0);
  });

  it("«copy from yesterday» carries yesterday's plan for tomorrow into today's, and nothing of the other sections", async () => {
    const copied = await callers.engineer.siteReports.copyFromYesterday({ ...at(), reportDate: "2026-11-02" });
    expect(copied.tomorrow).toBe(2);
    const read = await callers.engineer.siteReports.get({ ...at(), reportId: copied.id });
    expect(read.tomorrow.map(row => [row.area, row.activity, row.quantity, row.unit, row.resources])).toEqual([["Zone 1", "Block work", 150, "m2", "2 gangs"], [null, "Slab pour B04", null, null, null]]);
    expect([read.materials.length, read.hse.length, read.obstacleItems.length]).toEqual([0, 0, 0]);
  });

  it("refused, with nothing written: a consultant approval of another project, a bad due date, a negative quantity, an unknown HSE kind, a reader", async () => {
    const before = await rowsIn();
    const reports = await count("SELECT COUNT(*) AS n FROM site_daily_reports WHERE tenantId = ?", [tenantId]);
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], materials: [{ material: "Cement", quantity: 1, unit: "bag", consultantSubmittalId: SUB_B }] }))).toBe("PROJECT_OS_SITE_REPORT_REFERENCE_NOT_FOUND");
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], obstacleItems: [{ issue: "x", dueDate: "2026-02-30" }] }))).toBe("PROJECT_OS_SITE_REPORT_LINE_INVALID");
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], materials: [{ material: "Cement", quantity: -1, unit: "bag" }] }))).not.toBe("no error");
    // the sibling path: a report date that does not exist (Date.parse would roll it over to 2 March)
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-02-30", lines: [] }))).toBe("PROJECT_OS_SITE_REPORT_DATE_INVALID");
    expect(await code(callers.engineer.siteReports.copyFromYesterday({ ...at(), reportDate: "2026-02-30" }))).toBe("PROJECT_OS_SITE_REPORT_DATE_INVALID");
    expect(await code(callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], hse: [{ kind: "party" as never, description: "x" }] }))).not.toBe("no error");
    expect(await code(callers.viewer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [], ...sections() }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await rowsIn()).toBe(before);
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_reports WHERE tenantId = ?", [tenantId])).toBe(reports);
    // the database itself: a submittal of project B on a material of project A, a report of project B, an unknown kind
    const [report] = (await connection.query<{ id: string }[]>("SELECT id FROM site_daily_reports WHERE tenantId = ? AND projectId = ? LIMIT 1", [tenantId, A]))[0];
    await expect(connection.query("INSERT INTO site_daily_report_materials (id, tenantId, projectId, reportId, material, quantity, unit, consultantSubmittalId) VALUES (UUID(), ?, ?, ?, 'x', 1, 'bag', ?)", [tenantId, A, report.id, SUB_B])).rejects.toThrow(/site_daily_report_materials_submittal_fk/);
    await expect(connection.query("INSERT INTO site_daily_report_tomorrow (id, tenantId, projectId, reportId, activity) VALUES (UUID(), ?, ?, ?, 'x')", [tenantId, B, report.id])).rejects.toThrow(/site_daily_report_tomorrow_report_fk/);
    await expect(connection.query("INSERT INTO site_daily_report_hse (id, tenantId, projectId, reportId, kind, description) VALUES (UUID(), ?, ?, ?, 'party', 'x')", [tenantId, A, report.id])).rejects.toThrow(/site_daily_report_hse_kind_check/);
  });

  it("isolation: another company reads nothing; the engineer of A does not reach project B", async () => {
    const [report] = (await connection.query<{ id: string }[]>("SELECT id FROM site_daily_reports WHERE tenantId = ? AND projectId = ? LIMIT 1", [tenantId, A]))[0];
    expect(await code(callers.otherOwner.siteReports.get({ ...at(), reportId: report.id }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.siteReports.get({ tenantId: otherTenantId, projectId: A, reportId: report.id }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.engineer.siteReports.save({ ...at(B), reportDate: "2026-11-01", lines: [], ...sections() }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM site_daily_report_materials WHERE projectId = ? OR tenantId = ?", [B, otherTenantId])).toBe(0);
  });
});
