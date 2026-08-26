import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const tenantId = "10000000-0000-4000-8000-0000000000a1";
const foreignTenantId = "10000000-0000-4000-8000-0000000000b1";
const projectId = "10000000-0000-4000-8000-0000000000a2";
const foreignProjectId = "10000000-0000-4000-8000-0000000000b2";
const isIntegrationUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: mysql.Connection;
let executiveId = 0;
let pmoId = 0;
let projectIdUser = 0;
let lowPrivilegeId = 0;

const callerFor = (id: number, openId: string) => appRouter.createCaller({ user: { id, openId, name: openId, email: `${openId}@pilot.local`, loginMethod: "pilot-acceptance", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

describe.skipIf(!isIntegrationUrl(process.env.TEST_DATABASE_URL))("Pilot structured role acceptance", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM document_versions WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM project_documents WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM risks WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM decisions WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM evm_snapshots WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM progress_entries WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM cost_entries WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM budget_lines WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM activities WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM project_resources WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM wbs_items WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM membership_roles WHERE membershipId LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM memberships WHERE id LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM role_permissions WHERE roleId LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM roles WHERE id LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM permissions WHERE id LIKE 'pilot-perm-%'");
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM users WHERE openId IN ('pilot-executive','pilot-pmo','pilot-project','pilot-low')");

    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pilot-executive','Pilot Executive','pilot-executive@pilot.local','user'),('pilot-pmo','Pilot PMO','pilot-pmo@pilot.local','user'),('pilot-project','Pilot Project','pilot-project@pilot.local','user'),('pilot-low','Pilot Low','pilot-low@pilot.local','user')");
    const [users] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId IN ('pilot-executive','pilot-pmo','pilot-project','pilot-low')");
    executiveId = users.find(user => user.openId === "pilot-executive")!.id;
    pmoId = users.find(user => user.openId === "pilot-pmo")!.id;
    projectIdUser = users.find(user => user.openId === "pilot-project")!.id;
    lowPrivilegeId = users.find(user => user.openId === "pilot-low")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Pilot Acceptance Tenant', 'pilot-acceptance'), (?, 'Pilot Foreign Tenant', 'pilot-foreign')", [tenantId, foreignTenantId]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType) VALUES (?, ?, 'PILOT-A', 'Pilot Acceptance Project', 'infrastructure'), (?, ?, 'PILOT-B', 'Pilot Foreign Project', 'infrastructure')", [projectId, tenantId, foreignProjectId, foreignTenantId]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pilot-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pilot-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [tenantId, foreignTenantId]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pilot-ent-exec', ?, 'pilot-sub-a', 'EXECUTIVE', true, NOW()), ('pilot-ent-pmo', ?, 'pilot-sub-a', 'PMO', true, NOW()), ('pilot-ent-project', ?, 'pilot-sub-a', 'PROJECT', true, NOW()), ('pilot-ent-b-exec', ?, 'pilot-sub-b', 'EXECUTIVE', true, NOW()), ('pilot-ent-b-pmo', ?, 'pilot-sub-b', 'PMO', true, NOW()), ('pilot-ent-b-project', ?, 'pilot-sub-b', 'PROJECT', true, NOW())", [tenantId, tenantId, tenantId, foreignTenantId, foreignTenantId, foreignTenantId]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('pilot-perm-exec-read','executive.read','Pilot executive read','EXECUTIVE'),('pilot-perm-tenant-manage','tenant.manage','Pilot tenant management','EXECUTIVE'),('pilot-perm-pmo-read','pmo.read','Pilot PMO read','PMO'),('pilot-perm-pmo-write','pmo.write','Pilot PMO write','PMO'),('pilot-perm-project-read','project.read','Pilot project read','PROJECT'),('pilot-perm-project-write','project.write','Pilot project write','PROJECT')");
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('executive.read','tenant.manage','pmo.read','pmo.write','project.read','project.write')");
    const permissionId = (code: string) => permissions.find(permission => permission.code === code)?.id;
    expect(["executive.read", "tenant.manage", "pmo.read", "pmo.write", "project.read", "project.write"].every(code => Boolean(permissionId(code)))).toBe(true);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pilot-role-exec', ?, 'PILOT_EXEC','Pilot Executive','EXECUTIVE'),('pilot-role-pmo', ?, 'PILOT_PMO','Pilot PMO','PMO'),('pilot-role-project', ?, 'PILOT_PROJECT','Pilot Project','PROJECT')", [tenantId, tenantId, tenantId]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pilot-role-exec', ?),('pilot-role-exec', ?),('pilot-role-pmo', ?),('pilot-role-pmo', ?),('pilot-role-project', ?),('pilot-role-project', ?)", [permissionId("executive.read"), permissionId("tenant.manage"), permissionId("pmo.read"), permissionId("pmo.write"), permissionId("project.read"), permissionId("project.write")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pilot-role-exec', ?, ?, 'active'),('pilot-role-pmo', ?, ?, 'active'),('pilot-role-project', ?, ?, 'active'),('pilot-role-low', ?, ?, 'active')", [tenantId, executiveId, tenantId, pmoId, tenantId, projectIdUser, tenantId, lowPrivilegeId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pilot-role-exec-a','pilot-role-exec','pilot-role-exec','company'),('pilot-role-pmo-a','pilot-role-pmo','pilot-role-pmo','company'),('pilot-role-project-a','pilot-role-project','pilot-role-project','company')");
  }, 30_000);

  it("allows EXECUTIVE decisions only in the owned project and records the effect", async () => {
    const executive = callerFor(executiveId, "pilot-executive");
    await expect(executive.dashboards.executive({ tenantId })).resolves.toBeDefined();
    await expect(executive.executive.createDecision({ tenantId, projectId: foreignProjectId, problem: "Foreign decision", options: "Reject", recommendation: "Reject" })).rejects.toThrow();
    const decision = await executive.executive.createDecision({ tenantId, projectId, problem: "Pilot executive decision", options: "Option A; Option B", recommendation: "Option A" });
    const [rows] = await connection.query<{ decisions: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM decisions WHERE id = ?) AS decisions, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [decision.id, decision.id]);
    expect(rows[0]).toMatchObject({ decisions: 1, audits: 1 });
  }, 30_000);

  it("allows PMO risk management only in the owned project and records the effect", async () => {
    const pmo = callerFor(pmoId, "pilot-pmo");
    await expect(pmo.dashboards.pmo({ tenantId })).resolves.toBeDefined();
    await expect(pmo.pmo.createRisk({ tenantId, projectId: foreignProjectId, code: "PILOT-FOR", title: "Foreign risk", probability: 3, severity: 3 })).rejects.toThrow();
    const risk = await pmo.pmo.createRisk({ tenantId, projectId, code: "PILOT-RISK", title: "Pilot governed risk", probability: 4, severity: 4 });
    const [rows] = await connection.query<{ risks: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM risks WHERE id = ?) AS risks, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [risk.id, risk.id]);
    expect(rows[0]).toMatchObject({ risks: 1, audits: 1 });
  }, 30_000);

  it("allows PROJECT delivery writes only in the owned project and records all effects", async () => {
    const project = callerFor(projectIdUser, "pilot-project");
    await expect(project.projects.getControls({ tenantId, projectId })).resolves.toBeDefined();
    await expect(project.wbs.create({ tenantId, projectId: foreignProjectId, code: "PILOT-FOR", name: "Foreign WBS", plannedValue: 100 })).rejects.toThrow();
    const wbs = await project.wbs.create({ tenantId, projectId, code: "PILOT-WBS", name: "Pilot work package", plannedValue: 100 });
    await project.budgets.create({ tenantId, projectId, wbsItemId: wbs.id, costCode: "PILOT-COST", originalAmount: 100, currentAmount: 100 });
    await project.costs.createActual({ tenantId, projectId, wbsItemId: wbs.id, amount: 40, incurredAt: new Date("2026-08-20T00:00:00.000Z") });
    await project.progress.create({ tenantId, projectId, wbsItemId: wbs.id, percentComplete: 50, reportedAt: new Date("2026-08-20T00:00:00.000Z") });
    const document = await project.documents.createWithVersion({ tenantId, projectId, documentNumber: "PILOT-DOC", title: "Pilot evidence document", category: "report", originalName: "pilot.txt", mimeType: "text/plain", contentBase64: Buffer.from("Pilot acceptance evidence").toString("base64") });
    const [effects] = await connection.query<{ decisions: number; risks: number; wbs: number; documents: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM decisions WHERE id = ?) AS decisions, (SELECT COUNT(*) FROM risks WHERE id = ?) AS risks, (SELECT COUNT(*) FROM wbs_items WHERE id = ?) AS wbs, (SELECT COUNT(*) FROM project_documents WHERE id = ?) AS documents, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?, ?, ?)) AS audits", ["missing", "missing", wbs.id, document.id, wbs.id, document.id, wbs.id, document.id]);
    expect(effects[0]).toMatchObject({ decisions: 0, risks: 0, wbs: 1, documents: 1, audits: 2 });
  }, 30_000);

  it("rejects EXECUTIVE and PROJECT reads for the low-privilege account", async () => {
    const low = callerFor(lowPrivilegeId, "pilot-low");
    await expect(low.dashboards.executive({ tenantId })).rejects.toThrow();
    await expect(low.projects.getControls({ tenantId, projectId })).rejects.toThrow();
  }, 30_000);

  afterAll(async () => {
    await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM document_versions WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM project_documents WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM risks WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM decisions WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM progress_entries WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM cost_entries WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM budget_lines WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM activities WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM project_resources WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM wbs_items WHERE projectId IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM membership_roles WHERE membershipId LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM memberships WHERE id LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM role_permissions WHERE roleId LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM roles WHERE id LIKE 'pilot-role-%'");
    await connection.query("DELETE FROM permissions WHERE id LIKE 'pilot-perm-%'");
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [projectId, foreignProjectId]);
    await connection.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantId, foreignTenantId]);
    await connection.query("DELETE FROM users WHERE openId IN ('pilot-executive','pilot-pmo','pilot-project','pilot-low')");
    await connection.end();
  });
});
