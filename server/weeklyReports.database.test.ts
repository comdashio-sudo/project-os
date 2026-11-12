import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// D-49 (a) on a real database, through the real router, as the restricted application role: the weekly report's texts and chosen photos (reportPeriods.weekly and
// reportPeriods.saveWeekly); a second save replaces them; a photo of another project or company is refused with nothing written; who may write; isolation; and the
// database's own composite keys. The figures are never stored: the table holds texts only.
const SLUG = "weekly-report";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@wr.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a9000000-0000-4000-8000-000000000001";
const B = "a9000000-0000-4000-8000-000000000002";
const C = "a9000000-0000-4000-8000-000000000003"; // the other company's project
const PHOTO = { a1: "a9000000-0000-4000-8000-0000000000f1", a2: "a9000000-0000-4000-8000-0000000000f2", aOld: "a9000000-0000-4000-8000-0000000000f3", b: "a9000000-0000-4000-8000-0000000000f4", other: "a9000000-0000-4000-8000-0000000000f5" };
const KEYS = ["owner", "engineer", "viewer", "otherOwner"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const at = (projectId = A) => ({ tenantId, projectId });
const WEEK = "2026-11-01";
const audits = () => count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND entityType = 'weekly_report'", [tenantId]);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["weekly_report_photos", "weekly_reports", "site_daily_report_photos", "site_daily_report_lines", "site_daily_reports", "project_report_counters", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'wr-%'");
}
async function photo(id: string, tenant: string, project: string, reportId: string, userId: number) {
  await connection.query("INSERT INTO site_daily_report_photos (id, tenantId, projectId, reportId, storageKey, fileName, contentType, sizeBytes, caption, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, 'image/jpeg', 10, 'Example caption', ?)", [id, tenant, project, reportId, `wr/${id}.jpg`, `${id}.jpg`, userId]);
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the weekly report's texts and photos on a real database (D-49 a)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`wr-${key}`, `WR ${key}`, `wr-${key}@wr.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'wr-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `wr-${key}`)!.id; callers[key] = callerFor(ids[key], `wr-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Weekly Report Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Weekly Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'WR-A', 'Weekly A', 'villas', 'SAR', 'active'), (?, ?, 'WR-B', 'Weekly B', 'villas', 'SAR', 'active'), (?, ?, 'WR-C', 'Weekly C', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId, C, otherTenantId]);
    const field = await callers.owner.tenant.createRole({ tenantId, code: "WR_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    const viewer = await callers.owner.tenant.createRole({ tenantId, code: "WR_VIEWER", name: "Viewer", productCode: "PROJECT", permissionCodes: ["project.read"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.viewer, roleId: viewer.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    // daily reports with photos: two in the week on A, one before it on A, one on B, one in the other company
    const inWeek = await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-11-02", lines: [] });
    const before = await callers.engineer.siteReports.save({ ...at(), reportDate: "2026-10-20", lines: [] });
    const onB = await callers.owner.siteReports.save({ ...at(B), reportDate: "2026-11-02", lines: [] });
    const other = await callers.otherOwner.siteReports.save({ tenantId: otherTenantId, projectId: C, reportDate: "2026-11-02", lines: [] });
    await photo(PHOTO.a1, tenantId, A, inWeek.id, ids.engineer); await photo(PHOTO.a2, tenantId, A, inWeek.id, ids.engineer); await photo(PHOTO.aOld, tenantId, A, before.id, ids.engineer);
    await photo(PHOTO.b, tenantId, B, onB.id, ids.owner); await photo(PHOTO.other, otherTenantId, C, other.id, ids.otherOwner);
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("the engineer saves the week's texts and photos; a reader reads them back in order, with the week's photos to choose from and one audit row that holds no text", async () => {
    const empty = await callers.viewer.reportPeriods.weekly({ ...at(), weekStart: WEEK });
    expect(empty.report).toBeNull();
    expect(empty.week).toEqual({ start: WEEK, end: "2026-11-07" });
    expect(empty.candidates.map(item => item.id).sort()).toEqual([PHOTO.a1, PHOTO.a2].sort()); // the week's photos only: not the one of 20 October, not project B's
    const saved = await callers.engineer.reportPeriods.saveWeekly({ ...at(), weekStart: WEEK, texts: { summary: "  Block work ahead of plan.  ", decisions: "Approve the paving sample.", analysis: "   " }, photoIds: [PHOTO.a2, PHOTO.a1] });
    const read = await callers.viewer.reportPeriods.weekly({ ...at(), weekStart: WEEK });
    expect(read.report).toMatchObject({ id: saved.id, summary: "Block work ahead of plan.", decisions: "Approve the paving sample.", analysis: null, outlook: null });
    expect(read.photos.map(item => item.id)).toEqual([PHOTO.a2, PHOTO.a1]);
    expect(read.photos[0]).toHaveProperty("url");
    expect(await audits()).toBe(1);
    const [audit] = (await connection.query<{ action: string; metadata: string }[]>("SELECT action, metadata FROM audit_logs WHERE tenantId = ? AND entityType = 'weekly_report'", [tenantId]))[0];
    expect(audit.action).toBe("weekly_report.created");
    expect(JSON.parse(audit.metadata)).toEqual({ projectId: A, weekStart: WEEK, filled: ["summary", "decisions"], photos: 2 });
    expect(audit.metadata).not.toContain("Block work");
  });

  it("a second save replaces the texts and the photo list whole: still one report for the week, one more audit row", async () => {
    await callers.engineer.reportPeriods.saveWeekly({ ...at(), weekStart: WEEK, texts: { outlook: "Paving starts next week." }, photoIds: [PHOTO.a1] });
    const read = await callers.viewer.reportPeriods.weekly({ ...at(), weekStart: WEEK });
    expect(read.report).toMatchObject({ summary: null, decisions: null, outlook: "Paving starts next week." });
    expect(read.photos.map(item => item.id)).toEqual([PHOTO.a1]);
    expect(await count("SELECT COUNT(*) AS n FROM weekly_reports WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM weekly_report_photos WHERE tenantId = ?", [tenantId])).toBe(1);
    expect(await audits()).toBe(2);
  });

  it("refused, with nothing written: a photo of project B, a photo of another company, a date that does not exist, too many photos, a reader", async () => {
    const before = { audits: await audits(), photos: await count("SELECT COUNT(*) AS n FROM weekly_report_photos WHERE tenantId = ?", [tenantId]) };
    const save = (photoIds: string[], weekStart = WEEK, who: "engineer" | "viewer" = "engineer") => code(callers[who].reportPeriods.saveWeekly({ ...at(), weekStart, texts: { summary: "Should not be kept." }, photoIds }));
    expect(await save([PHOTO.a1, PHOTO.b])).toBe("PROJECT_OS_WEEKLY_REPORT_PHOTO_NOT_FOUND");
    expect(await save([PHOTO.other])).toBe("PROJECT_OS_WEEKLY_REPORT_PHOTO_NOT_FOUND");
    expect(await save([], "2026-02-30")).toBe("PROJECT_OS_REPORT_PERIOD_INVALID");
    expect(await save(Array.from({ length: 25 }, (_, index) => `a9000000-0000-4000-8000-${String(index).padStart(12, "0")}`))).not.toBe("no error");
    expect(await save([], WEEK, "viewer")).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await audits()).toBe(before.audits);
    expect(await count("SELECT COUNT(*) AS n FROM weekly_report_photos WHERE tenantId = ?", [tenantId])).toBe(before.photos);
    expect((await callers.viewer.reportPeriods.weekly({ ...at(), weekStart: WEEK })).report).toMatchObject({ summary: null, outlook: "Paving starts next week." });
  });

  it("isolation: another company reads and writes nothing; the engineer of A does not reach B; B's week is B's own report", async () => {
    expect(await code(callers.otherOwner.reportPeriods.weekly({ ...at(), weekStart: WEEK }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.reportPeriods.saveWeekly({ tenantId: otherTenantId, projectId: A, weekStart: WEEK, texts: {}, photoIds: [] }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.engineer.reportPeriods.saveWeekly({ ...at(B), weekStart: WEEK, texts: { summary: "x" }, photoIds: [] }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    // the project manager (the owner holds project.manage) may write, and B's week is a report of its own
    await callers.owner.reportPeriods.saveWeekly({ ...at(B), weekStart: WEEK, texts: { summary: "Week of B" }, photoIds: [PHOTO.b] });
    expect((await callers.owner.reportPeriods.weekly({ ...at(B), weekStart: WEEK })).report).toMatchObject({ summary: "Week of B" });
    expect((await callers.viewer.reportPeriods.weekly({ ...at(), weekStart: WEEK })).report?.summary).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM weekly_reports WHERE tenantId = ?", [otherTenantId])).toBe(0);
  });

  it("the database itself: a chosen photo of another project and a photo row of another project's report are impossible; the table holds texts, not figures", async () => {
    const [report] = (await connection.query<{ id: string }[]>("SELECT id FROM weekly_reports WHERE tenantId = ? AND projectId = ?", [tenantId, A]))[0];
    await expect(connection.query("INSERT INTO weekly_report_photos (id, tenantId, projectId, weeklyReportId, photoId) VALUES (UUID(), ?, ?, ?, ?)", [tenantId, A, report.id, PHOTO.b])).rejects.toThrow(/weekly_report_photos_photo_fk/);
    await expect(connection.query("INSERT INTO weekly_report_photos (id, tenantId, projectId, weeklyReportId, photoId) VALUES (UUID(), ?, ?, ?, ?)", [tenantId, B, report.id, PHOTO.b])).rejects.toThrow(/weekly_report_photos_report_fk/);
    await expect(connection.query("INSERT INTO weekly_reports (id, tenantId, projectId, weekStart, createdByUserId, updatedByUserId) VALUES (UUID(), ?, ?, ?, ?, ?)", [tenantId, A, WEEK, ids.owner, ids.owner])).rejects.toThrow(/weekly_reports_project_week_unique/);
    const [columns] = await connection.query<{ column_name: string; data_type: string }[]>("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'weekly_reports'");
    expect((columns as Array<{ data_type: string }>).filter(column => ["numeric", "double precision", "real", "bigint"].includes(column.data_type))).toEqual([]);
  });
});
