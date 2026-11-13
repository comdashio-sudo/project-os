import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// D-19 (G-143): the company pages read the scope of the assignment that carries their permission. A person whose project.read, pmo.read and executive.read
// come from assignments on TWO of the company's three projects sees those two only — in the project register, the PMO dashboard and the executive dashboard —
// and the PMO's risks of the third project are not sent; a company-wide assignment of the same roles sees all three. tenant.manage on a project scope manages
// nothing of the company (administration refused). On a real database, through the real router, as the restricted application role. Synthetic data only.
const SLUG = "d19-scope";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "narrow", "wide", "projectAdmin"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `d19-${key}`, name: `D19 ${key}`, email: `d19-${key}@d19.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = ["d1900000-0000-4000-8000-000000000001", "d1900000-0000-4000-8000-000000000002", "d1900000-0000-4000-8000-000000000003"];
let connection: fixtureDb.Connection; let tenantId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["risks", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'd19-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("D-19: the company pages show a project-scoped person their own projects only", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`d19-${key}`, `D19 ${key}`, `d19-${key}@d19.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'd19-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `d19-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "D19 Scope Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query(`INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES ${P.map(() => "(?, ?, ?, ?, 'villas', 'SAR', 'active')").join(",")}`, P.flatMap((id, i) => [id, tenantId, `D19-${i + 1}`, `Scope project ${i + 1}`]));
    await connection.query(`INSERT INTO risks (id, tenantId, projectId, code, title, probability, severity, status) VALUES ${P.map(() => "(gen_random_uuid(), ?, ?, ?, ?, 3, 3, 'open')").join(",")}`, P.flatMap((id, i) => [tenantId, id, `R-${i + 1}`, `Risk of project ${i + 1}`]));
    const owner = callerFor("owner");
    const role = (code: string, productCode: "PROJECT" | "PMO" | "EXECUTIVE", permissionCodes: string[]) => owner.tenant.createRole({ tenantId, code, name: code, productCode, permissionCodes });
    const roles = [await role("D19_READ", "PROJECT", ["project.read"]), await role("D19_PMO", "PMO", ["pmo.read"]), await role("D19_EXEC", "EXECUTIVE", ["executive.read"])];
    const manage = await role("D19_MANAGE", "EXECUTIVE", ["tenant.manage"]);
    // the first assignment makes the member; the others are added to that membership
    const assign = async (key: Key, roleId: string, scope: { scopeType: "company" } | { scopeType: "project"; scopeId: string }) => {
      const [[member]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, ids[key]]);
      if (member) await owner.tenant.assignMembershipRole({ tenantId, membershipId: member.id, roleId, ...scope });
      else await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId, ...scope });
    };
    for (const item of roles) {
      for (const projectId of P.slice(0, 2)) await assign("narrow", item.id, { scopeType: "project", scopeId: projectId });
      await assign("wide", item.id, { scopeType: "company" });
    }
    await assign("projectAdmin", manage.id, { scopeType: "project", scopeId: P[0] });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  const codes = (rows: Array<{ code: string }>) => rows.map(row => row.code).sort();

  it("the project register: two projects for the project-scoped person, three for the company-wide one", async () => {
    expect(codes(await callerFor("narrow").projects.list({ tenantId }))).toEqual(["D19-1", "D19-2"]);
    expect(codes(await callerFor("wide").projects.list({ tenantId }))).toEqual(["D19-1", "D19-2", "D19-3"]);
  });

  it("the PMO dashboard: the projects, and the risks, of the covered projects only (negative: the third project's risk is not sent)", async () => {
    const narrow = await callerFor("narrow").dashboards.pmo({ tenantId });
    expect(codes(narrow.projects)).toEqual(["D19-1", "D19-2"]);
    expect(JSON.stringify(narrow)).not.toContain("Risk of project 3");
    expect(JSON.stringify(narrow)).toContain("Risk of project 1");
    const wide = await callerFor("wide").dashboards.pmo({ tenantId });
    expect(codes(wide.projects)).toEqual(["D19-1", "D19-2", "D19-3"]);
    expect(JSON.stringify(wide)).toContain("Risk of project 3");
  });

  it("the executive dashboard: the covered projects only", async () => {
    expect(codes((await callerFor("narrow").dashboards.executive({ tenantId })).projects)).toEqual(["D19-1", "D19-2"]);
    expect(codes((await callerFor("wide").dashboards.executive({ tenantId })).projects)).toEqual(["D19-1", "D19-2", "D19-3"]);
  });

  it("the company administration: refused to tenant.manage on a project scope (negative), open to the owner", async () => {
    expect(await code(callerFor("projectAdmin").tenant.administration({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("narrow").tenant.administration({ tenantId }))).not.toBe("no error");
    expect(await code(callerFor("owner").tenant.administration({ tenantId }))).toBe("no error");
  });
});
