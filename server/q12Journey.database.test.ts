import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

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
    for (const table of ["email_outbox", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
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
});
