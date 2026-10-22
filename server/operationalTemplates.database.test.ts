import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as serverDb from "./db";
import { operationalRoleDefinitions } from "./domain/operationalRoles";
import { appRouter } from "./routers";

// AFTER_MIGRATION W-F and R-1 on a real database. A company receives its ready-made roles when it is created, by both creation paths.
// An administration read never writes a template role: reading the roles of an existing company changes none of them. Synthetic data only.
// Not run locally: this needs TEST_DATABASE_URL pointing at the integration test database (project_os_integration_test).
const SLUG = "wft-templates";
const SELF_SLUG = "wft-self-service";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@templates.example.test`, loginMethod: "email", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

let connection: fixtureDb.Connection;
let owner: ReturnType<typeof callerFor>;
let ownerUserId = 0;
let tenantId = "";
let selfTenantId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, SELF_SLUG]);
  for (const { id } of companies) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM self_service_signup_attempts WHERE userId IN (SELECT id FROM users WHERE openId LIKE 'wft-%')");
  await connection.query("DELETE FROM users WHERE openId LIKE 'wft-%'");
}

/** Role code -> the set of permission codes it holds in one company, read straight from the rows. */
async function rolePermissionsOf(tenant: string) {
  const [rows] = await connection.query<{ roleCode: string; permissionCode: string | null }[]>(
    "SELECT r.code AS roleCode, p.code AS permissionCode FROM roles r LEFT JOIN role_permissions rp ON rp.roleId = r.id LEFT JOIN permissions p ON p.id = rp.permissionId WHERE r.tenantId = ?",
    [tenant],
  );
  const byRole = new Map<string, Set<string>>();
  for (const row of rows) {
    const held = byRole.get(row.roleCode) ?? new Set<string>();
    if (row.permissionCode) held.add(row.permissionCode);
    byRole.set(row.roleCode, held);
  }
  return byRole;
}

function expectTemplatesInstalled(byRole: Map<string, Set<string>>) {
  for (const definition of operationalRoleDefinitions) {
    expect([...(byRole.get(definition.code) ?? [])].sort(), `${definition.code} holds exactly its template`).toEqual([...definition.permissions].sort());
  }
  expect(byRole.get("PLANNING_ENGINEER")).not.toContain("project.write");
  for (const code of ["project.create", "payment.prepare", "payment.approve", "schedule.write"]) {
    for (const [roleCode, held] of byRole) if (roleCode !== "TENANT_OWNER") expect(held.has(code), `${roleCode} holds ${code}`).toBe(false);
  }
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("company templates on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role, loginMethod) VALUES ('wft-owner', 'Templates owner', 'wft-owner@templates.example.test', 'user', 'email')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId = 'wft-owner'");
    ownerUserId = rows[0].id;
    owner = callerFor(ownerUserId, "wft-owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Templates Test Company", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    const [plan] = await serverDb.getPublicCommercialPlans();
    ({ tenantId: selfTenantId } = await serverDb.createSelfServiceTenant({ userId: ownerUserId, legalName: "Templates Self Service Company", slug: SELF_SLUG, planCode: plan.code, seats: 3 }));
  }, 120_000);

  afterAll(async () => { await clear(); await connection.end(); });

  it("a company created through the signed-in path receives every ready-made role with its template permissions", async () => {
    expectTemplatesInstalled(await rolePermissionsOf(tenantId));
  });

  it("a company created through self-service sign-up receives the same ready-made roles", async () => {
    expectTemplatesInstalled(await rolePermissionsOf(selfTenantId));
  });

  it("an administration read restores a company\x27s template roles exactly as the template defines them, and adds nothing else", async () => {
    // Simulate a link that an older company lacks: the read has always installed the template, so it is put back.
    const before = await rolePermissionsOf(tenantId);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId INNER JOIN permissions p ON p.id = rp.permissionId WHERE r.tenantId = ? AND r.code = FINANCE_MANAGER AND p.code = project.cost.enter", [tenantId]);
    expect((await rolePermissionsOf(tenantId)).get("FINANCE_MANAGER")).not.toContain("project.cost.enter");

    const administration = await owner.tenant.administration({ tenantId });
    expect(administration.roles.filter(role => role.code === "FINANCE_MANAGER")).toHaveLength(1);

    expect(await rolePermissionsOf(tenantId)).toEqual(before);
  });

  it("an administration read still gives the tenant owner every catalog power (the owner grant is kept)", async () => {
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId INNER JOIN permissions p ON p.id = rp.permissionId WHERE r.tenantId = ? AND r.code = 'TENANT_OWNER' AND p.code = 'schedule.write'", [tenantId]);
    expect((await rolePermissionsOf(tenantId)).get("TENANT_OWNER")).not.toContain("schedule.write");
    await owner.tenant.administration({ tenantId });
    expect((await rolePermissionsOf(tenantId)).get("TENANT_OWNER")).toContain("schedule.write");
  });
});
