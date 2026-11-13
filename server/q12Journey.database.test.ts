import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { ENV } from "./_core/env";

// Q-12, the journey the owner asked for, on a real database, through the real router, as the restricted application role, with the real invitation tokens:
// an owner of TWO companies invites a planning engineer onto project A of company A; the engineer accepts and invites a site engineer, a QA/QC engineer and an HSE
// engineer onto the same project; each accepts. Then: everyone sees company A only (not B), the project's team holds all four, each person carries their own
// section's permission and not the others', and nobody of A can read company B. Synthetic people only (*.example.test).
const SLUG = "q12-journey";
const PA = "c1400000-0000-4000-8000-00000000000a";
const PB = "c1400000-0000-4000-8000-00000000000b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "planner", "site", "qc", "hse"] as const;
type Key = (typeof KEYS)[number];
const emailOf = (key: Key) => `jr-${key}@jr.example.test`;
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `jr-${key}`, name: `JR ${key}`, email: emailOf(key), loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection; let companyA = ""; let companyB = "";
const roleIds: Record<string, string> = {};

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["email_outbox", "audit_logs", "membership_invitations", "site_daily_report_hse", "site_daily_report_materials", "site_daily_report_obstacles", "site_daily_report_tomorrow", "site_daily_report_lines", "site_daily_report_photos", "site_daily_report_labour", "site_daily_report_equipment", "site_daily_reports", "project_report_counters"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'jr-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-12 journey: an owner of two companies, a planning engineer and the site team (E2E on the server)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    // accounts exist (each person has signed in once with their own e-mail); none belongs to any company yet except through what follows
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`jr-${key}`, `JR ${key}`, emailOf(key)]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'jr-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `jr-${key}`)!.id;
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("1. the owner holds two companies, each with a project", async () => {
    ({ tenantId: companyA } = await callerFor("owner").tenant.create({ legalName: "Journey Builders A", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: companyB } = await callerFor("owner").tenant.create({ legalName: "Journey Builders B", slug: `${SLUG}-b`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'JA-1', 'Villas A', 'villas', 'SAR', 'active'), (?, ?, 'JB-1', 'Villas B', 'villas', 'SAR', 'active')", [PA, companyA, PB, companyB]);
    await callerFor("owner").tenant.administration({ tenantId: companyA });
    const [roleRows] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM roles WHERE tenantId = ?", [companyA]);
    for (const row of roleRows as Array<{ id: string; code: string }>) roleIds[row.code] = row.id;
    expect((await callerFor("owner").tenant.mine()).map(item => item.tenantId).sort()).toEqual([companyA, companyB].sort());
  });

  it("2. the owner invites a planning engineer onto project A; the engineer accepts and sees company A only", async () => {
    const invite = await callerFor("owner").tenant.createInvitation({ tenantId: companyA, email: emailOf("planner"), roleId: roleIds.PLANNING_ENGINEER, scopeType: "project", scopeId: PA });
    expect(await callerFor("planner").tenant.acceptInvitation({ inviteToken: invite.inviteToken })).toMatchObject({ tenantId: companyA });
    expect((await callerFor("planner").tenant.mine()).map(item => item.tenantId)).toEqual([companyA]);
  });

  it("3. the planning engineer invites the site, QA/QC and HSE engineers onto project A; each accepts", async () => {
    for (const [key, role] of [["site", "SITE_ENGINEER"], ["qc", "QA_QC_MANAGER"], ["hse", "HSE_MANAGER"]] as const) {
      const invite = await callerFor("planner").tenant.createInvitation({ tenantId: companyA, email: emailOf(key), roleId: roleIds[role], scopeType: "project", scopeId: PA });
      expect(await callerFor(key).tenant.acceptInvitation({ inviteToken: invite.inviteToken })).toMatchObject({ tenantId: companyA });
    }
    const team = await callerFor("planner").projects.team.list({ tenantId: companyA, projectId: PA });
    // the owner is on it too: a company-wide role covers every project
    expect(team.map(member => member.email).sort()).toEqual([emailOf("hse"), emailOf("owner"), emailOf("planner"), emailOf("qc"), emailOf("site")].sort());
  });

  it("4. each person carries their own section's permission on project A, and not the others'", async () => {
    const holds = async (key: Key) => new Set((await callerFor(key).accessSummary.mine({ tenantId: companyA })).permissions);
    const site = await holds("site"); const qc = await holds("qc"); const hse = await holds("hse");
    expect(site.has("project.field.manage") && site.has("project.progress.manage")).toBe(true);
    expect(qc.has("project.quality.manage") && !qc.has("project.hse.manage") && !qc.has("project.field.manage")).toBe(true);
    expect(hse.has("project.hse.manage") && !hse.has("project.quality.manage") && !hse.has("project.progress.manage")).toBe(true);
    for (const key of ["site", "qc", "hse"] as const) expect((await holds(key)).has("project.team.invite") || (await holds(key)).has("tenant.manage")).toBe(false);
  });

  it("5. NEGATIVE: nobody of company A sees company B — not in their companies, not its projects, not its team", async () => {
    for (const key of ["planner", "site", "qc", "hse"] as const) {
      expect((await callerFor(key).tenant.mine()).map(item => item.tenantId)).not.toContain(companyB);
      expect(await code(callerFor(key).projects.list({ tenantId: companyB }))).not.toBe("no error");
      expect(await code(callerFor(key).projects.team.list({ tenantId: companyB, projectId: PB }))).not.toBe("no error");
      expect((await callerFor(key).accessSummary.mine({ tenantId: companyB })).member).toBe(false);
    }
    // and the site team cannot invite anyone (no project.team.invite), on A or B
    expect(await code(callerFor("site").tenant.createInvitation({ tenantId: companyA, email: "extra@jr.example.test", roleId: roleIds.SITE_ENGINEER, scopeType: "project", scopeId: PA }))).not.toBe("no error");
  });

  // ---------------------------------------------------------------- the daily report: each role sees and edits its own section (Q-12, D-43)
  const DAY = "2026-01-05"; let reportId = "";
  const A = () => ({ tenantId: companyA, projectId: PA });
  const read = (key: Key) => callerFor(key).siteReports.get({ ...A(), reportId });

  it("6. the site engineer writes the day's report; the HSE engineer adds the safety events and the QA/QC engineer the materials — each their own section only", async () => {
    const site = callerFor("site"), hse = callerFor("hse"), qc = callerFor("qc");
    ({ id: reportId } = await site.siteReports.save({ ...A(), reportDate: DAY, weather: "clear", summary: "Blockwork on block 1", lines: [], tomorrow: [{ activity: "Plaster block 1" }] }));
    expect(await hse.siteReports.saveSection({ ...A(), reportId, section: "hse", hse: [{ kind: "meeting", description: "Toolbox talk", peopleCount: 12 }] })).toMatchObject({ rows: 1 });
    expect(await qc.siteReports.saveSection({ ...A(), reportId, section: "qc", materials: [{ material: "Blocks", quantity: 2000, unit: "pcs" }] })).toMatchObject({ rows: 1 });
    // the site engineer's own write did not touch the two sections the others wrote, and theirs did not touch the site's
    const whole = await read("site");
    expect([whole.report.summary, whole.tomorrow.length, whole.hse.length, whole.materials.length]).toEqual(["Blockwork on block 1", 1, 1, 1]);
  });

  it("7. NEGATIVE: no one writes a section that is not theirs — refused by the server, nothing written", async () => {
    expect(await code(callerFor("hse").siteReports.saveSection({ ...A(), reportId, section: "qc", materials: [{ material: "X", quantity: 1, unit: "pcs" }] }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("qc").siteReports.saveSection({ ...A(), reportId, section: "hse", hse: [{ kind: "incident", description: "X" }] }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("hse").siteReports.saveSection({ ...A(), reportId, section: "hse", hse: [], materials: [] }))).toBe("PROJECT_OS_SITE_REPORT_SECTION_NOT_YOURS");
    // the HSE engineer holds project.field.manage (photos, field reports) but the report's site section is not theirs; the QA/QC engineer cannot save a report at all
    expect(await code(callerFor("hse").siteReports.save({ ...A(), reportDate: "2026-01-06", summary: "not mine", lines: [] }))).toBe("PROJECT_OS_SITE_REPORT_SECTION_NOT_YOURS");
    expect(await code(callerFor("qc").siteReports.save({ ...A(), reportDate: "2026-01-06", summary: "not mine", lines: [] }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const [count] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM site_daily_reports WHERE tenantId = ?", [companyA]);
    expect(count[0].n).toBe(1);
    const whole = await read("site");
    expect([whole.hse.length, whole.materials.length]).toEqual([1, 1]);
  });

  it("8. each reads its own section only; the planning engineer and the site engineer read the whole report", async () => {
    const hse = await read("hse");
    expect(hse.access).toEqual({ see: ["hse"], edit: ["hse"], whole: false });
    expect([hse.hse.length, hse.materials.length, hse.tomorrow.length, hse.report.summary, hse.report.weather]).toEqual([1, 0, 0, null, null]);
    const qc = await read("qc");
    expect(qc.access).toEqual({ see: ["qc"], edit: ["qc"], whole: false });
    expect([qc.materials.length, qc.hse.length, qc.tomorrow.length, qc.report.summary, qc.totals.hse.meeting]).toEqual([1, 0, 0, null, 0]);
    const planner = await read("planner");
    expect(planner.access).toMatchObject({ see: ["site", "hse", "qc"], edit: [], whole: true });
    expect([planner.report.summary, planner.hse.length, planner.materials.length, planner.tomorrow.length]).toEqual(["Blockwork on block 1", 1, 1, 1]);
    expect((await read("site")).access.see).toEqual(["site", "hse", "qc"]);
    // the planning engineer gathers the day into the export (stored in the database storage here); the HSE and QA/QC engineers do not export the site's labour sheet
    const secret = ENV.cookieSecret; ENV.cookieSecret = "q12-journey-test-only-secret";
    try {
      expect((await callerFor("planner").siteReports.export({ ...A(), reportId, format: "xlsx", locale: "ar" })).bytes).toBeGreaterThan(1000);
      for (const key of ["hse", "qc"] as const) expect(await code(callerFor(key).siteReports.export({ ...A(), reportId, format: "xlsx", locale: "ar" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    } finally { ENV.cookieSecret = secret; }
  });

  it("9. NEGATIVE: once submitted, no section is written; and nobody of company A writes into company B", async () => {
    await callerFor("site").siteReports.submit({ ...A(), reportId });
    expect(await code(callerFor("hse").siteReports.saveSection({ ...A(), reportId, section: "hse", hse: [] }))).toBe("PROJECT_OS_SITE_REPORT_LOCKED");
    expect(await code(callerFor("hse").siteReports.saveSection({ tenantId: companyB, projectId: PB, reportId, section: "hse", hse: [] }))).not.toBe("no error");
    expect(await code(callerFor("qc").siteReports.saveSection({ tenantId: companyA, projectId: PB, reportId, section: "qc", materials: [] }))).not.toBe("no error");
    expect((await read("site")).hse.length).toBe(1);
  });
});
