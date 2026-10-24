import fixtureDb, { type Connection } from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { withSystemContext, getDb } from "./_core/database";
import { syncRoleTemplatesForAllTenants } from "./db";
import { proposeRetiredTemplateRemovals } from "./roleTemplateSync";
import { operationalRoleDefinitions } from "./domain/operationalRoles";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 17, item 2: a permission added to a ready-made role template reaches companies that already exist, by itself and with an audit row; a permission taken
// away is only proposed, shows a preview, and changes nothing until the company's administrator approves. On a real database, two companies side by side.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!isTestDatabaseUrl(url))("role template changes reach existing companies", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let connection: Connection;
  const qaRole = async (tenantId: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'QA_QC_MANAGER'", [tenantId]))[0][0].id;
  const holds = async (roleId: string, code: string) => Number((await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permissionId WHERE rp.roleId = ? AND p.code = ?", [roleId, code]))[0][0].n);
  const audits = async (tenantId: string, action: string) => Number((await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [tenantId, action]))[0][0].n);

  beforeAll(async () => {
    connection = await fixtureDb.createConnection(url!);
    a = await createRoleFixture({ label: "tplsync-a" });
    b = await createRoleFixture({ label: "tplsync-b" });
  });
  afterAll(async () => { await connection.end(); });

  it("the Quality manager template carries project.read (the permission this order added)", () => {
    expect(operationalRoleDefinitions.find(role => role.code === "QA_QC_MANAGER")?.permissions).toContain("project.read");
  });

  it("an ADDED permission reaches a company created before it: applied by itself, one audit row, and running it again adds nothing", async () => {
    const roleId = await qaRole(a.tenantId);
    await connection.query("DELETE FROM role_permissions WHERE roleId = ? AND permissionId = (SELECT id FROM permissions WHERE code = 'project.read')", [roleId]); // the company as it was before
    expect(await holds(roleId, "project.read")).toBe(0);
    const before = await audits(a.tenantId, "role_template.permission_added");
    await syncRoleTemplatesForAllTenants();
    expect(await holds(roleId, "project.read")).toBe(1);
    expect(await audits(a.tenantId, "role_template.permission_added")).toBe(before + 1);
    const [[row]] = await connection.query<{ metadata: string; actorUserId: number | null }[]>("SELECT metadata, actorUserId FROM audit_logs WHERE tenantId = ? AND action = 'role_template.permission_added' ORDER BY createdAt DESC LIMIT 1", [a.tenantId]);
    expect(JSON.parse(row.metadata)).toMatchObject({ role: "QA_QC_MANAGER", permission: "project.read" });
    expect(row.actorUserId).toBeNull();
    await syncRoleTemplatesForAllTenants();
    expect(await audits(a.tenantId, "role_template.permission_added")).toBe(before + 1); // idempotent: no second row
  });

  it("a REMOVED permission is only proposed: nothing changes, the administrator sees a preview with the people who hold the role", async () => {
    const roleId = await qaRole(a.tenantId);
    const qaPerson = a.people.qa ?? Object.values(a.people).find((person: { system?: string }) => person.system === "QA_QC_MANAGER");
    const retired = [{ roleCode: "QA_QC_MANAGER", permission: "project.read" }];
    const db = (await getDb())!;
    const proposed = await withSystemContext("test: propose retired template permissions", () => proposeRetiredTemplateRemovals(db, a.tenantId, retired));
    expect(proposed).toBe(1);
    expect(await withSystemContext("test", () => proposeRetiredTemplateRemovals(db, a.tenantId, retired))).toBe(0); // proposed once
    expect(await holds(roleId, "project.read"), "nothing was withdrawn by proposing").toBe(1);
    const preview = await a.asOwner.tenant.roleTemplateRemovals({ tenantId: a.tenantId });
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ roleCode: "QA_QC_MANAGER", permissionCode: "project.read", status: "pending" });
    expect(preview[0].holders).toBe(qaPerson ? 1 : 0);
    expect(await audits(a.tenantId, "role_template.removal_proposed")).toBe(1);
    // company B has no proposal and cannot see or decide A's
    expect(await b.asOwner.tenant.roleTemplateRemovals({ tenantId: b.tenantId })).toEqual([]);
    await expect(b.asOwner.tenant.decideRoleTemplateRemovals({ tenantId: b.tenantId, ids: [preview[0].id], decision: "approve" })).rejects.toThrow(/PROJECT_OS_TEMPLATE_REMOVAL_NOT_PENDING/);
    await expect(b.asOwner.tenant.roleTemplateRemovals({ tenantId: a.tenantId })).rejects.toThrow();
    // a person who is not an administrator can neither read nor decide
    const site = a.callerFor(a.people.site);
    await expect(site.tenant.roleTemplateRemovals({ tenantId: a.tenantId })).rejects.toThrow();
    await expect(site.tenant.decideRoleTemplateRemovals({ tenantId: a.tenantId, ids: [preview[0].id], decision: "approve" })).rejects.toThrow();
    expect(await holds(roleId, "project.read")).toBe(1);
  });

  it("DECLINING keeps the permission and is audited; APPROVING withdraws it and is audited; neither can be decided twice", async () => {
    const roleId = await qaRole(a.tenantId);
    const [pending] = await a.asOwner.tenant.roleTemplateRemovals({ tenantId: a.tenantId });
    await a.asOwner.tenant.decideRoleTemplateRemovals({ tenantId: a.tenantId, ids: [pending.id], decision: "decline" });
    expect(await holds(roleId, "project.read")).toBe(1);
    expect(await audits(a.tenantId, "role_template.removal_declined")).toBe(1);
    await expect(a.asOwner.tenant.decideRoleTemplateRemovals({ tenantId: a.tenantId, ids: [pending.id], decision: "approve" })).rejects.toThrow(/NOT_PENDING/);
    expect(await holds(roleId, "project.read"), "a declined removal cannot be approved afterwards").toBe(1);
    // a fresh proposal on company B, approved
    const roleB = await qaRole(b.tenantId);
    const db = (await getDb())!;
    await withSystemContext("test", () => proposeRetiredTemplateRemovals(db, b.tenantId, [{ roleCode: "QA_QC_MANAGER", permission: "project.read" }]));
    const [mine] = await b.asOwner.tenant.roleTemplateRemovals({ tenantId: b.tenantId });
    await b.asOwner.tenant.decideRoleTemplateRemovals({ tenantId: b.tenantId, ids: [mine.id], decision: "approve" });
    expect(await holds(roleB, "project.read")).toBe(0);
    expect(await audits(b.tenantId, "role_template.removal_approved")).toBe(1);
    expect(await holds(roleId, "project.read"), "company A is untouched by B's approval").toBe(1);
  });
});
