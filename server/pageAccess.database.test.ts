import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { PAGE_ACCESS, pageAllowed, type PageKey } from "../shared/pageAccess";

// Q-33 (P0-04): a page's gate (shared/pageAccess.ts: its links, its address) must say exactly what its server reads say. For the six roles the work order
// names — the company manager (owner), the project manager, the site engineer, the warehouse keeper, finance and a viewer (project.read alone) — this calls
// the real reads each page makes on first render and compares: shown ⇔ answered. Nobody's permissions change here. On a real database, through the real
// router, as the restricted application role. Synthetic data only.
const SLUG = "q33-pages";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const ROLES = { owner: null, pm: "PROJECT_MANAGER", site: "SITE_ENGINEER", keeper: "WAREHOUSE_CUSTODIAN", finance: "FINANCE_MANAGER", viewer: "Q33_VIEWER" } as const;
type Key = keyof typeof ROLES;
const KEYS = Object.keys(ROLES) as Key[];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q33-${key}`, name: `Q33 ${key}`, email: `q33-${key}@q33.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const P = "33aa0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = "";
const codesOf = {} as Record<Key, string[]>;

/** The reads each page makes on first render (the same ones shared/pageAccess.ts names). */
const READS: Record<PageKey, Array<(c: ReturnType<typeof callerFor>) => Promise<unknown>>> = {
  registry: [c => c.projects.list({ tenantId })],
  controls: [c => c.projects.getControlsSchedule({ tenantId, projectId: P })],
  fieldEntry: [c => c.fieldEntry.context({ tenantId, projectId: P })],
  quality: [c => c.siteReports.options({ tenantId, projectId: P }), c => c.pmc.inspections({ tenantId, projectId: P }), c => c.ncrs.list({ tenantId, projectId: P })],
  progress: [c => c.pmc.progressActivities({ tenantId, projectId: P })],
  qc: [c => c.pmc.qcHistory({ tenantId, projectId: P })],
  baseline: [c => c.projects.baseline.status({ tenantId, projectId: P })],
  team: [c => c.projects.team.list({ tenantId, projectId: P })],
  pmc: [c => c.pmc.inspections({ tenantId, projectId: P })],
  stalled: [c => c.pmc.stalledUnits({ tenantId, projectId: P })],
  completionReport: [c => c.pmc.completionReport({ tenantId, projectId: P, limit: 1 })],
  meetings: [c => c.meetings.list({ tenantId, projectId: P })],
  risks: [c => c.pmo.projectRisks({ tenantId, projectId: P })],
  safety: [c => c.safety.register({ tenantId, projectId: P })],
  dailyReport: [c => c.siteReports.list({ tenantId, projectId: P })],
  weeklyReport: [c => c.reportPeriods.weekly({ tenantId, projectId: P, weekStart: "2026-11-15" })],
  monthlyReport: [c => c.reportPeriods.monthly({ tenantId, projectId: P, month: "2026-11" })],
  siteConsultant: [c => c.pmcSite.percentages({ tenantId, projectId: P })],
  siteUpdate: [c => c.pmcSite.activities({ tenantId, projectId: P })],
  schedule: [c => c.schedule.live({ tenantId, projectId: P })],
  profitability: [c => c.projects.getControlsFinancials({ tenantId, projectId: P })],
  commercial: [c => c.boq.list({ tenantId, projectId: P })],
};
const REFUSALS = /^PROJECT_OS_(PERMISSION_DENIED|SCOPE_ACCESS_DENIED|PROJECT_SCOPE_DENIED|TENANT_ACCESS_DENIED)$/;
/** Answered (any data, or a non-permission answer such as an empty project) or refused. Anything else — an input error, a crash — fails the test: it would hide a broken read. */
async function serverAnswers(key: Key, page: PageKey) {
  for (const read of READS[page]) {
    const outcome = await read(callerFor(key)).then(() => "answered", (error: { message?: string }) => error.message ?? "error");
    if (REFUSALS.test(outcome)) return false;
    if (outcome !== "answered" && /^\[|invalid|zod/i.test(outcome)) throw new Error(`${key} ${page}: the read itself failed: ${outcome.slice(0, 200)}`);
  }
  return true;
}

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]).catch(() => undefined);
    await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
    await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q33-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-33 (P0-04): every page's gate says what its server says, for the six roles", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q33-${key}`, `Q33 ${key}`, `q33-${key}@q33.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q33-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q33-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q33 Pages Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q33-1', 'Pages', 'villas', 'SAR', 'active')", [P, tenantId]);
    await owner.tenant.createRole({ tenantId, code: "Q33_VIEWER", name: "Viewer", productCode: "PROJECT", permissionCodes: ["project.read"] });
    for (const key of KEYS) {
      const roleCode = ROLES[key];
      if (!roleCode) continue;
      const [[role]] = await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]);
      await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: role.id, scopeType: "project", scopeId: P });
    }
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    // each role's own permission codes, as the database holds them (the owner: the company owner role's)
    for (const key of KEYS) {
      const [codes] = await connection.query<{ code: string }[]>("SELECT DISTINCT p.code FROM memberships m JOIN membership_roles mr ON mr.membershipId = m.id JOIN role_permissions rp ON rp.roleId = mr.roleId JOIN permissions p ON p.id = rp.permissionId WHERE m.tenantId = ? AND m.userId = ?", [tenantId, ids[key]]);
      codesOf[key] = codes.map(row => row.code);
    }
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  for (const key of KEYS) {
    it(`${key}: for every page, shown ⇔ the server answers`, async () => {
      const mismatches: string[] = [];
      for (const page of Object.keys(PAGE_ACCESS) as PageKey[]) {
        const shown = pageAllowed(page, group => group.some(code => codesOf[key].includes(code)));
        const answered = await serverAnswers(key, page);
        if (shown !== answered) mismatches.push(`${page}: shown=${shown} server=${answered}`);
      }
      expect(mismatches).toEqual([]);
    });
  }

  it("the gates are not vacuous: the owner sees every page, the viewer is refused the PMC and team pages, the keeper the controls page; the project manager now opens it (adviser 18-11)", async () => {
    expect((Object.keys(PAGE_ACCESS) as PageKey[]).every(page => pageAllowed(page, group => group.some(code => codesOf.owner.includes(code))))).toBe(true);
    expect(pageAllowed("pmc", group => group.some(code => codesOf.viewer.includes(code)))).toBe(false);
    expect(pageAllowed("team", group => group.some(code => codesOf.viewer.includes(code)))).toBe(false);
    expect(pageAllowed("controls", group => group.some(code => codesOf.keeper.includes(code)))).toBe(false);
    expect(await serverAnswers("keeper", "controls")).toBe(false);
    expect(pageAllowed("controls", group => group.some(code => codesOf.pm.includes(code)))).toBe(true);
    expect(await serverAnswers("pm", "controls")).toBe(true);
  });
});
