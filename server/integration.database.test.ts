import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

let connection: mysql.Connection;
const tenantA = "00000000-0000-4000-8000-0000000000a1";
const tenantB = "00000000-0000-4000-8000-0000000000b1";
const projectA = "00000000-0000-4000-8000-0000000000a2";
const projectB = "00000000-0000-4000-8000-0000000000b2";
const documentA = "00000000-0000-4000-8000-0000000000d1";
const changeRequestA = "00000000-0000-4000-8000-0000000000c1";
const isIntegrationUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let integrationUserId = 0;
let unassignedUserId = 0;

describe.skipIf(!isIntegrationUrl(process.env.TEST_DATABASE_URL))("integration database isolation", () => {
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!isIntegrationUrl(url)) return;
    if (!url) throw new Error("TEST_DATABASE_URL is required for integration tests");
    connection = await mysql.createConnection(url);
    await connection.query("DELETE FROM hse_observations WHERE id IN ('int-hse-a','int-hse-b')");
    await connection.query("DELETE FROM ncrs WHERE ncrNumber = 'NCR-TRPC'");
    await connection.query("DELETE FROM rfis WHERE rfiNumber = 'RFI-TRPC'");
    await connection.query("DELETE FROM issues WHERE code = 'ISSUE-TRPC'");
    await connection.query("DELETE FROM contracts WHERE code = 'CONTRACT-TRPC'");
    await connection.query("DELETE FROM document_versions WHERE documentId = ?", [documentA]);
    await connection.query("DELETE FROM project_documents WHERE id = ?", [documentA]);
    await connection.query("DELETE FROM change_requests WHERE changeNumber = 'CHANGE-TRPC'");
    await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM users WHERE openId = 'integration-test-user'");
    await connection.query("DELETE FROM users WHERE openId = 'integration-unassigned-user'");
    await connection.query("INSERT INTO users (openId, name, email) VALUES ('integration-test-user', 'Integration Test User', 'integration@test.local')");
    await connection.query("INSERT INTO users (openId, name, email) VALUES ('integration-unassigned-user', 'Unassigned Test User', 'unassigned@test.local')");
    const [[user]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-test-user' LIMIT 1");
    integrationUserId = user.id;
    const [[unassigned]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-unassigned-user' LIMIT 1");
    unassignedUserId = unassigned.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Integration A', 'integration-a'), (?, 'Integration B', 'integration-b')", [tenantA, tenantB]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType) VALUES (?, ?, 'INT-A', 'Integration project A', 'test'), (?, ?, 'INT-B', 'Integration project B', 'test')", [projectA, tenantA, projectB, tenantB]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('int-sub-a', ?, 'PROJECT', 'active', NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-a', ?, 'int-sub-a', 'PROJECT', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-pmo', ?, 'int-sub-a', 'PMO', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-write', 'project.write', 'Integration project write', 'PROJECT')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-pmo', 'pmo.write', 'Integration PMO write', 'PMO')");
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-a', ?, 'INT_PROJECT_WRITE', 'Integration Project Writer', 'PROJECT')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-pmo', ?, 'INT_PMO_WRITE', 'Integration PMO Writer', 'PMO')", [tenantA]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('int-membership-a', ?, ?, 'active')", [tenantA, integrationUserId]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-a', 'int-perm-write')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-pmo', 'int-perm-pmo')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-a', 'int-membership-a', 'int-role-a', 'company')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-pmo', 'int-membership-a', 'int-role-pmo', 'company')");
  });

  afterAll(async () => { await connection?.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM hse_observations WHERE id IN ('int-hse-a','int-hse-b') OR observationNumber = 'HSE-TRPC'"); await connection?.query("DELETE FROM ncrs WHERE ncrNumber = 'NCR-TRPC'"); await connection?.query("DELETE FROM rfis WHERE rfiNumber = 'RFI-TRPC'"); await connection?.query("DELETE FROM issues WHERE code = 'ISSUE-TRPC'"); await connection?.query("DELETE FROM contracts WHERE code = 'CONTRACT-TRPC'"); await connection?.query("DELETE FROM document_versions WHERE documentId = ?", [documentA]); await connection?.query("DELETE FROM project_documents WHERE id = ?", [documentA]); await connection?.query("DELETE FROM change_requests WHERE changeNumber = 'CHANGE-TRPC'"); await connection?.query("DELETE FROM membership_roles WHERE id IN ('int-membership-role-a','int-membership-role-pmo')"); await connection?.query("DELETE FROM role_permissions WHERE roleId IN ('int-role-a','int-role-pmo')"); await connection?.query("DELETE FROM memberships WHERE id = 'int-membership-a'"); await connection?.query("DELETE FROM roles WHERE id IN ('int-role-a','int-role-pmo')"); await connection?.query("DELETE FROM permissions WHERE id IN ('int-perm-write','int-perm-pmo')"); await connection?.query("DELETE FROM tenant_entitlements WHERE id IN ('int-ent-a','int-ent-pmo')"); await connection?.query("DELETE FROM subscriptions WHERE id = 'int-sub-a'"); await connection?.query("DELETE FROM projects WHERE id IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]); await connection?.query("DELETE FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user')"); await connection?.end(); });

  it("connects exclusively to the dedicated PROJECT OS integration database", async () => {
    const [rows] = await connection.query<{ database_name: string; table_count: number }[]>("SELECT DATABASE() AS database_name, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()");
    expect(rows[0]).toMatchObject({ database_name: "project_os_integration_test" });
    expect(Number(rows[0].table_count)).toBeGreaterThanOrEqual(32);
  });

  it("does not return an HSE observation outside the requested tenant and project", async () => {
    const [[user]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-test-user' LIMIT 1");
    expect(user).toBeTruthy();
    await connection.query("INSERT INTO hse_observations (id, tenantId, projectId, observationNumber, title, description, category, severity, createdByUserId) VALUES ('int-hse-a', ?, ?, 'HSE-A', 'Guard missing', 'A safety guard is missing from the test fixture.', 'safety', 'high', ?), ('int-hse-b', ?, ?, 'HSE-B', 'Spill control', 'An environmental spill-control observation belongs to tenant B.', 'environment', 'medium', ?)", [tenantA, projectA, user.id, tenantB, projectB, user.id]);
    const [rows] = await connection.query<{ id: string }[]>("SELECT id FROM hse_observations WHERE tenantId = ? AND projectId = ? ORDER BY id", [tenantA, projectA]);
    expect(rows).toEqual([{ id: "int-hse-a" }]);
  });

  it("rejects a real tRPC HSE write before any business record when the actor has no tenant membership", async () => {
    const context: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(context).hse.create({ tenantId: tenantA, projectId: projectA, observationNumber: "HSE-TRPC", title: "Unlicensed write", description: "This write must be rejected before any HSE record is created.", category: "safety", severity: "high" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    const [rows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM hse_observations WHERE observationNumber = 'HSE-TRPC'");
    expect(Number(rows[0].count)).toBe(0);
  });

  it("creates an HSE observation through real tRPC with one audit record", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(context).hse.create({ tenantId: tenantA, projectId: projectA, observationNumber: "HSE-TRPC", title: "Authorized write", description: "A real tRPC integration write with a dedicated project entitlement.", category: "safety", severity: "high" })).resolves.toMatchObject({ status: "open" });
    const [rows] = await connection.query<{ observations: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM hse_observations WHERE observationNumber = 'HSE-TRPC') AS observations, (SELECT COUNT(*) FROM audit_logs WHERE action = 'hse.observation_created') AS audits");
    expect(rows[0]).toMatchObject({ observations: 1, audits: 1 });
  });

  it("rejects an NCR write for a project outside the tenant before creating a record", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(context).ncrs.create({ tenantId: tenantA, projectId: projectB, ncrNumber: "NCR-TRPC", title: "Cross tenant", description: "This NCR must be rejected because its project belongs to another tenant." })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const [rows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM ncrs WHERE ncrNumber = 'NCR-TRPC'");
    expect(Number(rows[0].count)).toBe(0);
  });

  it("creates and transitions an NCR through real tRPC with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const ncr = await appRouter.createCaller(context).ncrs.create({ tenantId: tenantA, projectId: projectA, ncrNumber: "NCR-TRPC", title: "Authorized NCR", description: "A real tRPC NCR must enter the governed workflow with audit evidence." });
    await expect(appRouter.createCaller(context).ncrs.transitionStatus({ tenantId: tenantA, projectId: projectA, ncrId: ncr.id, nextStatus: "under_investigation" })).resolves.toMatchObject({ status: "under_investigation" });
    const [rows] = await connection.query<{ status: string; audits: number }[]>("SELECT (SELECT status FROM ncrs WHERE id = ?) AS status, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [ncr.id, ncr.id]);
    expect(rows[0]).toMatchObject({ status: "under_investigation", audits: 2 });
  });

  it("rejects an RFI write outside the tenant and allows a governed RFI transition with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.rfis.create({ tenantId: tenantA, projectId: projectB, rfiNumber: "RFI-TRPC", subject: "Cross tenant", question: "This RFI must be rejected because its project belongs to another tenant." })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const rfi = await caller.rfis.create({ tenantId: tenantA, projectId: projectA, rfiNumber: "RFI-TRPC", subject: "Authorized RFI", question: "A real tRPC RFI must move through the controlled workflow with audit evidence." });
    await expect(caller.rfis.transitionStatus({ tenantId: tenantA, projectId: projectA, rfiId: rfi.id, nextStatus: "submitted" })).resolves.toMatchObject({ status: "submitted" });
    const [rows] = await connection.query<{ status: string; audits: number }[]>("SELECT (SELECT status FROM rfis WHERE id = ?) AS status, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [rfi.id, rfi.id]);
    expect(rows[0]).toMatchObject({ status: "submitted", audits: 2 });
  });

  it("rejects a cross-tenant PMO issue and creates an authorized issue with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.pmo.createIssue({ tenantId: tenantA, projectId: projectB, code: "ISSUE-TRPC", title: "Cross tenant issue", priority: "high" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const issue = await caller.pmo.createIssue({ tenantId: tenantA, projectId: projectA, code: "ISSUE-TRPC", title: "Authorized PMO issue", priority: "high" });
    const [rows] = await connection.query<{ issues: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM issues WHERE id = ?) AS issues, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [issue.id, issue.id]);
    expect(rows[0]).toMatchObject({ issues: 1, audits: 1 });
  });

  it("rejects a cross-tenant contract and creates an authorized contract with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.contracts.create({ tenantId: tenantA, projectId: projectB, code: "CONTRACT-TRPC", title: "Cross tenant contract", counterparty: "Integration Contractor", contractValue: 100, currency: "USD" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const contract = await caller.contracts.create({ tenantId: tenantA, projectId: projectA, code: "CONTRACT-TRPC", title: "Authorized contract", counterparty: "Integration Contractor", contractValue: 100, currency: "USD" });
    const [rows] = await connection.query<{ contracts: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM contracts WHERE id = ?) AS contracts, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [contract.id, contract.id]);
    expect(rows[0]).toMatchObject({ contracts: 1, audits: 1 });
  });

  it("rejects a cross-project document transition and records an authorized review transition", async () => {
    await connection.query("INSERT INTO project_documents (id, tenantId, projectId, documentNumber, title, category, status, createdByUserId) VALUES (?, ?, ?, 'DOC-TRPC', 'Integration document', 'report', 'draft', ?)", [documentA, tenantA, projectA, integrationUserId]);
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.documents.transitionStatus({ tenantId: tenantA, projectId: projectB, documentId: documentA, nextStatus: "for_review" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.documents.transitionStatus({ tenantId: tenantA, projectId: projectA, documentId: documentA, nextStatus: "for_review" })).resolves.toMatchObject({ status: "for_review" });
    const [rows] = await connection.query<{ status: string; audits: number }[]>("SELECT (SELECT status FROM project_documents WHERE id = ?) AS status, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [documentA, documentA]);
    expect(rows[0]).toMatchObject({ status: "for_review", audits: 1 });
  });

  it("rejects a cross-tenant change request and creates an authorized request with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const request = { changeNumber: "CHANGE-TRPC", title: "Integration change", description: "Integration change request", impactScheduleDays: 3, impactCost: 100, currency: "USD" };
    await expect(caller.changes.create({ tenantId: tenantA, projectId: projectB, ...request })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const created = await caller.changes.create({ tenantId: tenantA, projectId: projectA, ...request });
    const [rows] = await connection.query<{ changes: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM change_requests WHERE id = ?) AS changes, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [created.id, created.id]);
    expect(rows[0]).toMatchObject({ changes: 1, audits: 1 });
  });
});
