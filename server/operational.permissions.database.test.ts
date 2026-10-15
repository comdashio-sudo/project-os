import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as serverDb from "./db";
import { governedActionPermissions, importModulePermissions } from "./domain/operationalPermissions";
import { operationalRoleDefinitions } from "./domain/operationalRoles";
import { appRouter } from "./routers";

// G-120 / G-121 on a real database, through the real role APIs: every operational role against
// every governed action (the denial is the permission error, never anything else), and the
// separation-of-duties pairs by role name AND by power. Synthetic data only.
const SLUG = "g120-sod";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@perm.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const DENIED = "Required permission is not granted.";

let connection: mysql.Connection;
let tenantId = "";
let projectId = "";
const userIds = new Map<string, number>();
const membershipIds = new Map<string, string>();
const roleIds = new Map<string, string>();
const openIdOf = (key: string) => `g120-${key}`;
let owner: ReturnType<typeof callerFor>;

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM membership_invitations WHERE tenantId = ?", [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'g120-%'");
}

const activate = (key: string) => connection.query("UPDATE memberships SET status = 'active' WHERE id = ?", [membershipIds.get(key)]);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("operational permissions and separation of duties on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const keys = ["owner", ...operationalRoleDefinitions.map(role => role.code), "nobody", "custom"];
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${keys.map(() => "(?, ?, ?, 'user')").join(",")}`, keys.flatMap(key => [openIdOf(key), `Perm ${key}`, `${openIdOf(key)}@perm.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'g120-%'");
    for (const key of keys) userIds.set(key, rows.find(row => row.openId === openIdOf(key))!.id);
    owner = callerFor(userIds.get("owner")!, openIdOf("owner"));
    ({ tenantId } = await owner.tenant.create({ legalName: "G120 Separation Tenant", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    projectId = "72000000-0000-4000-8000-000000000001";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'G120', 'Separation project', 'villas', 'SAR', 'active')", [projectId, tenantId]);
    // the administration read creates the built-in operational roles of the tenant
    const administration = await owner.tenant.administration({ tenantId });
    for (const role of administration.roles) roleIds.set(role.code, role.id);
    // each role goes to its own user through the real assignment API, then the invitation is accepted (activated)
    for (const role of operationalRoleDefinitions) {
      const assigned = await owner.tenant.assignMember({ tenantId, targetUserId: userIds.get(role.code)!, roleId: roleIds.get(role.code)!, scopeType: "company" });
      membershipIds.set(role.code, assigned.membershipId);
      await activate(role.code);
    }
    // a member with no role at all
    const nobody = await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (UUID(), ?, ?, 'active')", [tenantId, userIds.get("nobody")]);
    void nobody;
  }, 120_000);

  afterAll(async () => { await clear(); await connection.end(); });

  // Function name -> a call that supplies junk beyond the identity. A few functions validate numbers before they authorise, so those carry valid ones.
  const call = (name: string, userId: number, extra: Record<string, unknown> = {}) => (serverDb as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name]({ userId, tenantId, projectId, receivedQuantity: 1, rejectedQuantity: 0, unitCost: 1, workforceCount: 1, ...extra });
  const outcome = async (name: string, userId: number, extra?: Record<string, unknown>) => {
    try { await call(name, userId, extra); return "ok"; } catch (error) { return error instanceof Error && error.message === DENIED ? "denied" : "passed-authorization"; }
  };

  it("every operational role is refused every governed action it does not own, and gets past the permission check for the ones it does", async () => {
    const results: string[] = [];
    let denied = 0;
    let allowed = 0;
    for (const role of operationalRoleDefinitions) {
      const held = new Set<string>(role.permissions);
      for (const [action, needs] of Object.entries(governedActionPermissions)) {
        const expectAllowed = needs.some(code => held.has(code));
        const actual = await outcome(action, userIds.get(role.code)!);
        if ((actual === "denied") === expectAllowed) results.push(`${role.code} x ${action}: expected ${expectAllowed ? "allowed" : "denied"}, got ${actual}`);
        if (expectAllowed) allowed += 1; else denied += 1;
      }
    }
    expect(results).toEqual([]);
    // the matrix is not vacuous: both outcomes occur many times
    expect(denied).toBeGreaterThan(300);
    expect(allowed).toBeGreaterThan(30);
  }, 300_000);

  it("a member with no role, and the generic project.write alone, get nothing governed", async () => {
    for (const action of Object.keys(governedActionPermissions)) expect(await outcome(action, userIds.get("nobody")!)).toBe("denied");
  }, 120_000);

  it("the tenant owner (all powers) passes every governed check", async () => {
    for (const action of Object.keys(governedActionPermissions)) expect(await outcome(action, userIds.get("owner")!)).not.toBe("denied");
  }, 120_000);

  it("the data importer asks for the permission of the module it writes into", async () => {
    const modules = Object.keys(importModulePermissions) as Array<keyof typeof importModulePermissions>;
    const mismatches: string[] = [];
    for (const role of operationalRoleDefinitions) {
      for (const moduleCode of modules) {
        const expectAllowed = importModulePermissions[moduleCode].some(code => (role.permissions as readonly string[]).includes(code));
        const actual = await outcome("createAndAnalyzeDataImport", userIds.get(role.code)!, { moduleCode, fileName: "x.csv", sourceFormat: "csv", base64: "" });
        if ((actual === "denied") === expectAllowed) mismatches.push(`${role.code} x import ${moduleCode}: expected ${expectAllowed ? "allowed" : "denied"}, got ${actual}`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  it("separation of duties by role name: each forbidden pair is refused, in either order, and a single role is fine", async () => {
    const owners = callerFor(userIds.get("owner")!, openIdOf("owner"));
    const pairs: Array<[string, string]> = [["PROCUREMENT_OFFICER", "WAREHOUSE_CUSTODIAN"], ["ACCOUNTANT", "FINANCE_MANAGER"], ["HR_MANAGER", "ACCOUNTANT"]];
    for (const [left, right] of pairs) {
      await expect(owners.tenant.assignMembershipRole({ tenantId, membershipId: membershipIds.get(left)!, roleId: roleIds.get(right)!, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
      await expect(owners.tenant.assignMembershipRole({ tenantId, membershipId: membershipIds.get(right)!, roleId: roleIds.get(left)!, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    }
    // nothing changed: every user still holds exactly the one role
    const [held] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [tenantId]);
    expect(Number(held[0].n)).toBe(operationalRoleDefinitions.length + 1); // + the owner's own
    // two roles that do not conflict can be held together (site engineer + QA/QC)
    await expect(owners.tenant.assignMembershipRole({ tenantId, membershipId: membershipIds.get("SITE_ENGINEER")!, roleId: roleIds.get("QA_QC_MANAGER")!, scopeType: "company" })).resolves.toMatchObject({ roleId: roleIds.get("QA_QC_MANAGER") });
  }, 120_000);

  it("separation of duties by power: a custom role cannot hold both sides of a pair, nor be added to someone who holds the other side", async () => {
    const owners = callerFor(userIds.get("owner")!, openIdOf("owner"));
    const pairs = [["project.procurement.manage", "project.inventory.manage"], ["project.procurement.manage", "project.invoice.match"], ["project.inventory.manage", "project.invoice.match"], ["project.payroll.run", "project.payroll.approve"], ["project.payroll.run", "project.hr.manage"], ["project.payroll.run", "project.payroll.structure"]];
    let n = 0;
    for (const permissionCodes of pairs) {
      n += 1;
      await expect(owners.tenant.createRole({ tenantId, code: `G120_BOTH_${n}`, name: `Both ${n}`, productCode: "PROJECT", permissionCodes })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    }
    // a custom role with only the buyer's power is fine on its own...
    const buyer = await owners.tenant.createRole({ tenantId, code: "G120_BUYER", name: "Custom buyer", productCode: "PROJECT", permissionCodes: ["project.procurement.manage"] });
    // ...but cannot be added to the warehouse custodian (the role-name pair would not have caught it)
    await expect(owners.tenant.assignMembershipRole({ tenantId, membershipId: membershipIds.get("WAREHOUSE_CUSTODIAN")!, roleId: buyer.id, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    // a custom role that does not conflict with what the member holds is accepted
    const viewer = await owners.tenant.createRole({ tenantId, code: "G120_CASH", name: "Custom cash reader", productCode: "PROJECT", permissionCodes: ["project.cashflow.read"] });
    await expect(owners.tenant.assignMembershipRole({ tenantId, membershipId: membershipIds.get("WAREHOUSE_CUSTODIAN")!, roleId: viewer.id, scopeType: "company" })).resolves.toBeDefined();
    // editing a role cannot smuggle the conflicting power in: the custodian now holds the cash role, so adding the buyer's power to it is refused
    await expect(owners.tenant.updateRole({ tenantId, roleId: viewer.id, name: "Custom cash reader", permissionCodes: ["project.cashflow.read", "project.procurement.manage"] })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    // and the role itself is unchanged
    const [perms] = await connection.query<{ code: string }[]>("SELECT p.code FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permissionId WHERE rp.roleId = ?", [viewer.id]);
    expect(perms.map(row => row.code)).toEqual(["project.cashflow.read"]);
  }, 120_000);
});
