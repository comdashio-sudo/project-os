import mysql from "mysql2/promise";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { evaluateTenantLicenseLifecycle } from "./db";

let connection: mysql.Connection;
const tenantA = "00000000-0000-4000-8000-0000000000a1";
const tenantB = "00000000-0000-4000-8000-0000000000b1";
const projectA = "00000000-0000-4000-8000-0000000000a2";
const projectB = "00000000-0000-4000-8000-0000000000b2";
const projectC = "00000000-0000-4000-8000-0000000000a3";
const documentA = "00000000-0000-4000-8000-0000000000d1";
const changeRequestA = "00000000-0000-4000-8000-0000000000c1";
const notificationA = "00000000-0000-4000-8000-0000000000f1";
const isIntegrationUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let integrationUserId = 0;
let unassignedUserId = 0;

describe.skipIf(!isIntegrationUrl(process.env.TEST_DATABASE_URL))("integration database isolation", () => {
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!isIntegrationUrl(url)) return;
    if (!url) throw new Error("TEST_DATABASE_URL is required for integration tests");
    connection = await mysql.createConnection(url);
    await connection.query("CREATE TABLE IF NOT EXISTS control_record_links (`id` varchar(36) NOT NULL, `tenantId` varchar(36) NOT NULL, `projectId` varchar(36) NOT NULL, `sourceType` enum('risk','issue','action','decision') NOT NULL, `sourceId` varchar(36) NOT NULL, `targetType` enum('risk','issue','action','decision','rfi','ncr') NOT NULL, `targetId` varchar(36) NOT NULL, `createdByUserId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), PRIMARY KEY (`id`), UNIQUE KEY `control_record_links_project_source_target_unique` (`projectId`,`sourceType`,`sourceId`,`targetType`,`targetId`), KEY `control_record_links_tenant_project_source_idx` (`tenantId`,`projectId`,`sourceType`,`sourceId`), KEY `control_record_links_tenant_project_target_idx` (`tenantId`,`projectId`,`targetType`,`targetId`))");
    await connection.query("ALTER TABLE control_record_links MODIFY COLUMN targetType enum('risk','issue','action','decision','rfi','ncr') NOT NULL");
    await connection.query("DELETE FROM control_record_links WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM risks WHERE code IN ('LINK-RISK', 'LINK-FOR')");
    await connection.query("DELETE FROM issues WHERE code = 'LINK-ISSUE'");
    await connection.query("DELETE FROM actions WHERE title = 'Linkable mitigating action'");
    await connection.query("DELETE FROM decisions WHERE problem = 'Linkable decision problem'");
    await connection.query("DELETE FROM risks WHERE code = 'LINK-OPS-RISK'");
    await connection.query("DELETE FROM rfis WHERE rfiNumber = 'LINK-OPS-RFI'");
    await connection.query("DELETE FROM ncrs WHERE ncrNumber = 'LINK-OPS-NCR'");
    await connection.query("CREATE TABLE IF NOT EXISTS purchase_orders (`id` varchar(36) NOT NULL, `tenantId` varchar(36) NOT NULL, `projectId` varchar(36) NOT NULL, `contractId` varchar(36), `commitmentId` varchar(36), `purchaseOrderNumber` varchar(120) NOT NULL, `supplierName` varchar(240) NOT NULL, `orderDate` timestamp NOT NULL, `amount` decimal(18,2) NOT NULL, `currency` varchar(3) NOT NULL, `summary` text NOT NULL, `status` enum('draft','submitted','approved','issued','received','cancelled') NOT NULL DEFAULT 'draft', `receivedAt` timestamp, `createdByUserId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `purchase_orders_project_number_unique` (`projectId`,`purchaseOrderNumber`), KEY `purchase_orders_tenant_project_date_status_idx` (`tenantId`,`projectId`,`orderDate`,`status`), KEY `purchase_orders_contract_idx` (`contractId`), KEY `purchase_orders_commitment_idx` (`commitmentId`))");
    await connection.query("ALTER TABLE purchase_orders MODIFY COLUMN status enum('draft','submitted','approved','issued','received','cancelled') NOT NULL DEFAULT 'draft'");
    await connection.query("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contractId varchar(36)");
    await connection.query("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS commitmentId varchar(36)");
    await connection.query("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS receivedAt timestamp");
    await connection.query("DELETE FROM purchase_orders WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("CREATE TABLE IF NOT EXISTS quality_inspections (`id` varchar(36) NOT NULL, `tenantId` varchar(36) NOT NULL, `projectId` varchar(36) NOT NULL, `inspectionNumber` varchar(120) NOT NULL, `inspectionType` enum('hold_point','witness','surveillance','testing') NOT NULL, `inspectedAt` timestamp NOT NULL, `outcome` enum('pass','fail','conditional') NOT NULL, `summary` text NOT NULL, `status` enum('draft','submitted','accepted','rejected') NOT NULL DEFAULT 'draft', `createdByUserId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `quality_inspections_project_number_unique` (`projectId`,`inspectionNumber`), KEY `quality_inspections_tenant_project_date_status_idx` (`tenantId`,`projectId`,`inspectedAt`,`status`))");
    await connection.query("DELETE FROM quality_inspections WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("CREATE TABLE IF NOT EXISTS field_reports (`id` varchar(36) NOT NULL, `tenantId` varchar(36) NOT NULL, `projectId` varchar(36) NOT NULL, `reportNumber` varchar(120) NOT NULL, `reportType` enum('daily','inspection','progress') NOT NULL, `reportedAt` timestamp NOT NULL, `shift` enum('day','night') NOT NULL DEFAULT 'day', `workforceCount` int NOT NULL DEFAULT 0, `weather` varchar(160), `summary` text NOT NULL, `status` enum('draft','submitted','reviewed','approved','rejected') NOT NULL DEFAULT 'draft', `createdByUserId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `field_reports_project_number_unique` (`projectId`,`reportNumber`), KEY `field_reports_tenant_project_date_status_idx` (`tenantId`,`projectId`,`reportedAt`,`status`), CONSTRAINT `field_reports_tenantId_companies_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `companies`(`id`), CONSTRAINT `field_reports_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`), CONSTRAINT `field_reports_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`))");
    await connection.query("DELETE FROM field_reports WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM control_record_links WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("CREATE TABLE IF NOT EXISTS data_import_row_results (`id` varchar(36) NOT NULL, `importId` varchar(36) NOT NULL, `rowNumber` int NOT NULL, `rowKey` varchar(160) NOT NULL, `action` enum('created','updated','skipped') NOT NULL, `entityId` varchar(36), `createdAt` timestamp NOT NULL DEFAULT (now()), PRIMARY KEY (`id`), UNIQUE KEY `data_import_row_results_import_row_action_unique` (`importId`,`rowNumber`,`action`), KEY `data_import_row_results_import_row_idx` (`importId`,`rowNumber`), CONSTRAINT `data_import_row_results_importId_data_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `data_imports`(`id`))");
    await connection.query("DELETE FROM data_import_row_results WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]);
    await connection.query("DELETE FROM data_import_errors WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenantA]);
    await connection.query("DELETE FROM hse_observations WHERE id IN ('int-hse-a','int-hse-b')");
    await connection.query("DELETE FROM ncrs WHERE ncrNumber = 'NCR-TRPC'");
    await connection.query("DELETE FROM rfis WHERE rfiNumber = 'RFI-TRPC'");
    await connection.query("DELETE FROM issues WHERE code = 'ISSUE-TRPC'");
    await connection.query("DELETE FROM contracts WHERE code = 'CONTRACT-TRPC'");
    await connection.query("DELETE FROM commitments WHERE code IN ('PO-COM-TRPC', 'PO-COM-B')");
    await connection.query("DELETE FROM contracts WHERE code IN ('PO-CON-TRPC', 'PO-ALT-TRPC', 'PO-CON-B')");
    await connection.query("DELETE FROM project_resources WHERE resourceCode = 'RESOURCE-TRPC'");
    await connection.query("DELETE FROM budget_lines WHERE id IN ('int-budget-a','int-budget-b')");
    await connection.query("DELETE FROM cost_entries WHERE id IN ('int-cost-a','int-cost-a-void','int-cost-b')");
    await connection.query("DELETE FROM commitments WHERE id IN ('int-commitment-a','int-commitment-a-cancelled','int-commitment-b')");
    await connection.query("DELETE FROM document_versions WHERE documentId = ?", [documentA]);
    await connection.query("DELETE FROM project_documents WHERE id = ?", [documentA]);
    await connection.query("DELETE FROM change_requests WHERE changeNumber = 'CHANGE-TRPC'");
    await connection.query("DELETE FROM claims WHERE claimNumber = 'CLAIM-TRPC'");
    await connection.query("DELETE FROM master_plan_spatial_entities WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM master_plan_versions WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM master_plans WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM progress_entries WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM cost_entries WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM budget_lines WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM evm_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM project_health_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM internal_notifications WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM activities WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM wbs_items WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection.query("DELETE FROM tenant_licenses WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM progress_entries WHERE projectId = ?", [projectC]);
    await connection.query("DELETE FROM cost_entries WHERE projectId = ?", [projectC]);
    await connection.query("DELETE FROM budget_lines WHERE projectId = ?", [projectC]);
    await connection.query("DELETE FROM activities WHERE projectId = ?", [projectC]);
    await connection.query("DELETE FROM wbs_items WHERE projectId = ?", [projectC]);
    await connection.query("DELETE FROM control_record_links WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM purchase_orders WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM field_reports WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM quality_inspections WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM hse_observations WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM ncrs WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM rfis WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM actions WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM decisions WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM issues WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM risks WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM projects WHERE id IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM portfolios WHERE id IN ('int-portfolio-a','int-portfolio-b')");
    await connection.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM users WHERE openId = 'integration-test-user'");
    await connection.query("DELETE FROM users WHERE openId = 'integration-unassigned-user'");
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('integration-test-user', 'Integration Test User', 'integration@test.local', 'admin')");
    await connection.query("INSERT INTO users (openId, name, email) VALUES ('integration-unassigned-user', 'Unassigned Test User', 'unassigned@test.local')");
    const [[user]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-test-user' LIMIT 1");
    integrationUserId = user.id;
    const [[unassigned]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-unassigned-user' LIMIT 1");
    unassignedUserId = unassigned.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Integration A', 'integration-a'), (?, 'Integration B', 'integration-b')", [tenantA, tenantB]);
    await connection.query("INSERT INTO portfolios (id, tenantId, code, name) VALUES ('int-portfolio-a', ?, 'INT-PORT-A', 'Integration portfolio A'), ('int-portfolio-b', ?, 'INT-PORT-B', 'Integration portfolio B')", [tenantA, tenantB]);
    await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType) VALUES (?, ?, 'int-portfolio-a', 'INT-A', 'Integration project A', 'test'), (?, ?, 'int-portfolio-b', 'INT-B', 'Integration project B', 'test')", [projectA, tenantA, projectB, tenantB]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('int-sub-a', ?, 'PROJECT', 'active', NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-a', ?, 'int-sub-a', 'PROJECT', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-pmo', ?, 'int-sub-a', 'PMO', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-exec', ?, 'int-sub-a', 'EXECUTIVE', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-write', 'project.write', 'Integration project write', 'PROJECT')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-read', 'project.read', 'Integration project read', 'PROJECT')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-pmo', 'pmo.write', 'Integration PMO write', 'PMO')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-exec', 'executive.read', 'Integration executive read', 'EXECUTIVE')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-exec-manage', 'tenant.manage', 'Integration executive tenant management', 'EXECUTIVE')");
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-a', ?, 'INT_PROJECT_WRITE', 'Integration Project Writer', 'PROJECT')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-pmo', ?, 'INT_PMO_WRITE', 'Integration PMO Writer', 'PMO')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-exec', ?, 'INT_EXEC_READ', 'Integration Executive Reader', 'EXECUTIVE')", [tenantA]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('int-membership-a', ?, ?, 'active')", [tenantA, integrationUserId]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-a', 'int-perm-write')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-a', 'int-perm-read')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-pmo', 'int-perm-pmo')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-exec', 'int-perm-exec')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-exec', 'int-perm-exec-manage')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-a', 'int-membership-a', 'int-role-a', 'company')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-pmo', 'int-membership-a', 'int-role-pmo', 'company')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-exec', 'int-membership-a', 'int-role-exec', 'company')");
  });

  afterAll(async () => { await connection?.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM field_reports WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection?.query("DELETE FROM data_import_row_results WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]); await connection?.query("DELETE FROM data_import_errors WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]); await connection?.query("DELETE FROM data_imports WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM master_plan_spatial_entities WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM master_plan_versions WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM master_plans WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM progress_entries WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM cost_entries WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM budget_lines WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM evm_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM project_health_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM internal_notifications WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM activities WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM wbs_items WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [tenantA]); await connection?.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM hse_observations WHERE id IN ('int-hse-a','int-hse-b') OR observationNumber = 'HSE-TRPC'"); await connection?.query("DELETE FROM ncrs WHERE ncrNumber = 'NCR-TRPC'"); await connection?.query("DELETE FROM rfis WHERE rfiNumber = 'RFI-TRPC'"); await connection?.query("DELETE FROM issues WHERE code = 'ISSUE-TRPC'"); await connection?.query("DELETE FROM contracts WHERE code = 'CONTRACT-TRPC'"); await connection?.query("DELETE FROM project_resources WHERE resourceCode = 'RESOURCE-TRPC'"); await connection?.query("DELETE FROM budget_lines WHERE id IN ('int-budget-a','int-budget-b')"); await connection?.query("DELETE FROM cost_entries WHERE id IN ('int-cost-a','int-cost-a-void','int-cost-b')"); await connection?.query("DELETE FROM commitments WHERE id IN ('int-commitment-a','int-commitment-a-cancelled','int-commitment-b')"); await connection?.query("DELETE FROM document_versions WHERE documentId = ?", [documentA]); await connection?.query("DELETE FROM project_documents WHERE id = ?", [documentA]); await connection?.query("DELETE FROM change_requests WHERE changeNumber = 'CHANGE-TRPC'"); await connection?.query("DELETE FROM claims WHERE claimNumber = 'CLAIM-TRPC'"); await connection?.query("DELETE FROM membership_roles WHERE id IN ('int-membership-role-a','int-membership-role-pmo','int-membership-role-exec')"); await connection?.query("DELETE FROM role_permissions WHERE roleId IN ('int-role-a','int-role-pmo','int-role-exec')"); await connection?.query("DELETE FROM memberships WHERE id = 'int-membership-a'"); await connection?.query("DELETE FROM roles WHERE id IN ('int-role-a','int-role-pmo','int-role-exec')"); await connection?.query("DELETE FROM permissions WHERE id IN ('int-perm-write','int-perm-read','int-perm-pmo','int-perm-exec','int-perm-exec-manage')"); await connection?.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM projects WHERE id IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM portfolios WHERE id IN ('int-portfolio-a','int-portfolio-b')"); await connection?.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]); await connection?.query("DELETE FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user')"); await connection?.end(); });

  it("connects exclusively to the dedicated PROJECT OS integration database", async () => {
    const [rows] = await connection.query<{ database_name: string; table_count: number }[]>("SELECT DATABASE() AS database_name, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()");
    expect(rows[0]).toMatchObject({ database_name: "project_os_integration_test" });
    expect(Number(rows[0].table_count)).toBeGreaterThanOrEqual(32);
  });

  it("rejects a cross-tenant advisory request before any model invocation", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(context).advisor.project({ tenantId: tenantA, projectId: projectB, locale: "en" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
  });

  it("returns only licensed and authorized navigation items and rejects a foreign project context", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const items = await caller.navigation.get({ tenantId: tenantA, projectId: projectA });
    expect(items.map(item => item.id)).toEqual(expect.arrayContaining(["executive-dashboard", "project-registry", "tenant-administration", "project-controls"]));
    expect(items.map(item => item.id)).not.toContain("pmo-dashboard");
    await expect(caller.navigation.get({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
  });

  it("governs tenant role and membership administration with scope and self-privilege guards", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const unassignedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const owner = appRouter.createCaller(ownerContext);
    const unassigned = appRouter.createCaller(unassignedContext);
    let roleId: string | undefined;
    let membershipId: string | undefined;
    let assignmentId: string | undefined;
    try {
      const role = await owner.tenant.createRole({ tenantId: tenantA, code: "INT_AUDIT_ROLE", name: "Integration Audit Role", productCode: "PROJECT", permissionCodes: ["project.read"] });
      roleId = role.id;
      await expect(unassigned.tenant.assignMember({ tenantId: tenantA, targetUserId: integrationUserId, roleId, scopeType: "company" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      await expect(owner.tenant.assignMember({ tenantId: tenantA, targetUserId: integrationUserId, roleId, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN");
      await expect(owner.tenant.assignMember({ tenantId: tenantA, targetUserId: unassignedUserId, roleId, scopeType: "project", scopeId: projectB })).rejects.toThrow("PROJECT_OS_INVALID_SCOPE");
      await expect(owner.tenant.updateRole({ tenantId: tenantA, roleId, name: "Integration Audit Role Updated", permissionCodes: ["project.write"] })).resolves.toMatchObject({ id: roleId, permissionCount: 1 });
      const member = await owner.tenant.assignMember({ tenantId: tenantA, targetUserId: unassignedUserId, roleId, scopeType: "company" });
      membershipId = member.membershipId;
      expect(member).toMatchObject({ status: "invited" });
      const assignment = await owner.tenant.assignMembershipRole({ tenantId: tenantA, membershipId, roleId, scopeType: "project", scopeId: projectA });
      assignmentId = assignment.assignmentId;
      await expect(owner.tenant.revokeMembershipRole({ tenantId: tenantA, assignmentId })).resolves.toMatchObject({ assignmentId, membershipId });
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action IN ('tenant.role_created','tenant.role_updated','tenant.member_assigned','tenant.membership_role_assigned','tenant.membership_role_revoked') AND entityId IN (?, ?, ?)", [tenantA, roleId, membershipId, assignmentId]);
      expect(Number(audits[0].count)).toBe(5);
    } finally {
      if (assignmentId) await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [assignmentId]);
      if (membershipId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [membershipId]);
        await connection.query("DELETE FROM membership_roles WHERE membershipId = ?", [membershipId]);
        await connection.query("DELETE FROM memberships WHERE id = ?", [membershipId]);
      }
      if (roleId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [roleId]);
        await connection.query("DELETE FROM role_permissions WHERE roleId = ?", [roleId]);
        await connection.query("DELETE FROM roles WHERE id = ?", [roleId]);
      }
    }
  }, 12_000);

  it("governs tenant invitations with scope, email, one-time acceptance, and audit evidence", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const unassignedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const owner = appRouter.createCaller(ownerContext);
    const unassigned = appRouter.createCaller(unassignedContext);
    let roleId: string | undefined;
    let invitationId: string | undefined;
    let membershipId: string | undefined;
    let assignmentId: string | undefined;
    try {
      const role = await owner.tenant.createRole({ tenantId: tenantA, code: "INT_INVITE_ROLE", name: "Integration Invitation Role", productCode: "PROJECT", permissionCodes: ["project.read"] });
      roleId = role.id;
      await expect(unassigned.tenant.createInvitation({ tenantId: tenantA, email: "unassigned@test.local", roleId, scopeType: "company" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      await expect(owner.tenant.createInvitation({ tenantId: tenantA, email: "unassigned@test.local", roleId, scopeType: "project", scopeId: projectB })).rejects.toThrow("PROJECT_OS_INVALID_SCOPE");
      const invitation = await owner.tenant.createInvitation({ tenantId: tenantA, email: "unassigned@test.local", roleId, scopeType: "company" });
      invitationId = invitation.invitationId;
      expect(invitation.inviteToken).toHaveLength(43);
      await expect(owner.tenant.acceptInvitation({ inviteToken: invitation.inviteToken })).rejects.toThrow("PROJECT_OS_INVITATION_EMAIL_MISMATCH");
      await expect(unassigned.tenant.acceptInvitation({ inviteToken: "x".repeat(32) })).rejects.toThrow("PROJECT_OS_INVITATION_INVALID_OR_EXPIRED");
      const accepted = await unassigned.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
      membershipId = accepted.membershipId;
      assignmentId = accepted.assignmentId;
      expect(accepted).toMatchObject({ tenantId: tenantA, membershipId, assignmentId });
      await expect(unassigned.tenant.acceptInvitation({ inviteToken: invitation.inviteToken })).rejects.toThrow("PROJECT_OS_INVITATION_INVALID_OR_EXPIRED");
      const [membershipsRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM memberships WHERE id = ? AND tenantId = ? AND userId = ? AND status = 'active'", [membershipId, tenantA, unassignedUserId]);
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action IN ('tenant.member_invited','tenant.invitation_accepted')", [tenantA, invitationId]);
      expect(Number(membershipsRows[0].count)).toBe(1);
      expect(Number(audits[0].count)).toBe(2);
    } finally {
      if (invitationId) await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [invitationId]);
      if (assignmentId) await connection.query("DELETE FROM membership_roles WHERE id = ?", [assignmentId]);
      if (membershipId) await connection.query("DELETE FROM memberships WHERE id = ?", [membershipId]);
      if (invitationId) await connection.query("DELETE FROM membership_invitations WHERE id = ?", [invitationId]);
      if (roleId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [roleId]);
        await connection.query("DELETE FROM role_permissions WHERE roleId = ?", [roleId]);
        await connection.query("DELETE FROM roles WHERE id = ?", [roleId]);
      }
    }
  }, 12_000);

  it("creates an isolated tenant with subscription, owner access, audit evidence, and cleanup", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(ownerContext);
    let createdTenantId: string | undefined;
    let subscriptionId: string | undefined;
    try {
      const created = await caller.tenant.create({ legalName: "Integration Created Tenant", slug: "integration-created-tenant", packageCode: "ALL-IN-ONE" });
      createdTenantId = created.tenantId;
      subscriptionId = created.subscriptionId;
      const mine = await caller.tenant.mine();
      expect(mine).toEqual(expect.arrayContaining([expect.objectContaining({ tenantId: createdTenantId, legalName: "Integration Created Tenant", products: expect.arrayContaining(["EXECUTIVE", "PMO", "PROJECT"]) })]));
      const [subscriptionsRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM subscriptions WHERE id = ? AND tenantId = ? AND packageCode = 'ALL-IN-ONE' AND status = 'active'", [subscriptionId, createdTenantId]);
      const [entitlementsRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM tenant_entitlements WHERE tenantId = ? AND subscriptionId = ? AND active = TRUE", [createdTenantId, subscriptionId]);
      const [membershipRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM memberships WHERE tenantId = ? AND userId = ? AND status = 'active'", [createdTenantId, integrationUserId]);
      const [roleRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM roles WHERE tenantId = ? AND code = 'TENANT_OWNER' AND systemManaged = TRUE", [createdTenantId]);
      const [assignmentRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ? AND mr.scopeType = 'company' AND mr.scopeId IS NULL", [createdTenantId]);
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'tenant.created'", [createdTenantId, createdTenantId]);
      expect(Number(subscriptionsRows[0].count)).toBe(1);
      expect(Number(entitlementsRows[0].count)).toBe(3);
      expect(Number(membershipRows[0].count)).toBe(1);
      expect(Number(roleRows[0].count)).toBe(1);
      expect(Number(assignmentRows[0].count)).toBe(1);
      expect(Number(audits[0].count)).toBe(1);
    } finally {
      if (createdTenantId) {
        await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [createdTenantId]);
        await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [createdTenantId]);
        await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [createdTenantId]);
        await connection.query("DELETE FROM roles WHERE tenantId = ?", [createdTenantId]);
        await connection.query("DELETE FROM memberships WHERE tenantId = ?", [createdTenantId]);
        await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [createdTenantId]);
        if (subscriptionId) await connection.query("DELETE FROM subscriptions WHERE id = ?", [subscriptionId]);
        await connection.query("DELETE FROM companies WHERE id = ?", [createdTenantId]);
      }
    }
  }, 12_000);

  it("governs document creation and versioning with isolation, storage evidence, and audit cleanup", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(ownerContext);
    const firstContent = Buffer.from("PROJECT OS integration document version one", "utf8").toString("base64");
    const secondContent = Buffer.from("PROJECT OS integration document version two", "utf8").toString("base64");
    let documentId: string | undefined;
    let firstVersionId: string | undefined;
    let secondVersionId: string | undefined;
    try {
      const createInput = { documentNumber: "DOC-INTEGRATION-TRPC", title: "Integration governed document", category: "report" as const, originalName: "integration-v1.txt", mimeType: "text/plain", contentBase64: firstContent };
      await expect(caller.documents.createWithVersion({ tenantId: tenantA, projectId: projectB, ...createInput })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      const created = await caller.documents.createWithVersion({ tenantId: tenantA, projectId: projectA, ...createInput });
      documentId = created.id;
      firstVersionId = created.versionId;
      expect(created).toMatchObject({ id: documentId, versionId: firstVersionId, versionNumber: 1 });
      await expect(caller.documents.addVersion({ tenantId: tenantA, projectId: projectB, documentId, originalName: "integration-v2.txt", mimeType: "text/plain", contentBase64: secondContent })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      const second = await caller.documents.addVersion({ tenantId: tenantA, projectId: projectA, documentId, originalName: "integration-v2.txt", mimeType: "text/plain", contentBase64: secondContent });
      secondVersionId = second.id;
      expect(second).toMatchObject({ documentId, versionNumber: 2 });
      const register = await caller.documents.getProjectRegister({ tenantId: tenantA, projectId: projectA });
      expect(register.documents).toEqual(expect.arrayContaining([expect.objectContaining({ id: documentId, documentNumber: "DOC-INTEGRATION-TRPC" })]));
      expect(register.versions).toEqual(expect.arrayContaining([expect.objectContaining({ id: firstVersionId, documentId, versionNumber: 1 }), expect.objectContaining({ id: secondVersionId, documentId, versionNumber: 2 })]));
      const [versionsRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM document_versions WHERE documentId = ? AND tenantId = ? AND projectId = ? AND storageKey LIKE ?", [documentId, tenantA, projectA, `tenants/${tenantA}/projects/${projectA}/documents/${documentId}/%`]);
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action IN ('documents.document_created','documents.version_created') AND entityId IN (?, ?, ?)", [tenantA, documentId, firstVersionId, secondVersionId]);
      expect(Number(versionsRows[0].count)).toBe(2);
      expect(Number(audits[0].count)).toBe(2);
    } finally {
      if (documentId) {
        await connection.query("DELETE FROM audit_logs WHERE tenantId = ? AND (entityId = ? OR entityId = ? OR entityId = ?)", [tenantA, documentId, firstVersionId ?? "", secondVersionId ?? ""]);
        await connection.query("DELETE FROM document_versions WHERE documentId = ?", [documentId]);
        await connection.query("DELETE FROM project_documents WHERE id = ?", [documentId]);
      }
    }
  }, 15_000);

  it("governs remaining operational wrapper reads with authorized scope and foreign rejection", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(ownerContext);
    await expect(caller.claims.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.contracts.getProjectRegister({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.dataImports.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.ncrs.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.resources.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.rfis.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.dashboards.pmo({ tenantId: tenantB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(caller.tenant.administration({ tenantId: tenantB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(caller.dashboards.pmo({ tenantId: tenantA })).rejects.toThrow("Required permission is not granted.");
    const [claims, contracts, imports, ncrs, resources, rfis, administration, assignable] = await Promise.all([
      caller.claims.list({ tenantId: tenantA, projectId: projectA }),
      caller.contracts.getProjectRegister({ tenantId: tenantA, projectId: projectA }),
      caller.dataImports.list({ tenantId: tenantA, projectId: projectA }),
      caller.ncrs.list({ tenantId: tenantA, projectId: projectA }),
      caller.resources.list({ tenantId: tenantA, projectId: projectA }),
      caller.rfis.list({ tenantId: tenantA, projectId: projectA }),
      caller.tenant.administration({ tenantId: tenantA }),
      caller.tenant.findAssignableUser({ tenantId: tenantA, email: "integration@test.local" }),
    ]);
    expect(claims).toEqual(expect.any(Array));
    expect(contracts.contracts).toEqual(expect.any(Array));
    expect(imports).toEqual(expect.any(Array));
    expect(ncrs).toEqual(expect.any(Array));
    expect(resources).toEqual(expect.any(Array));
    expect(rfis).toEqual(expect.any(Array));
    expect(administration).toEqual(expect.objectContaining({ members: expect.arrayContaining([expect.objectContaining({ userId: integrationUserId })]), roles: expect.arrayContaining([expect.objectContaining({ id: "int-role-a" })]) }));
    expect(assignable).toBeNull();
  }, 12_000);

  it("governs project creation and lifecycle transitions with isolation and audit evidence", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const unassignedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const owner = appRouter.createCaller(ownerContext);
    const unassigned = appRouter.createCaller(unassignedContext);
    let projectId: string | undefined;
    try {
      await expect(unassigned.projects.create({ tenantId: tenantA, code: "PRJ-LIFE-TRPC", name: "Unassigned lifecycle project", projectType: "test", currency: "USD" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      const project = await owner.projects.create({ tenantId: tenantA, code: "PRJ-LIFE-TRPC", name: "Lifecycle evidence project", projectType: "test", currency: "USD" });
      projectId = project.id;
      await expect(owner.projects.transitionLifecycle({ tenantId: tenantA, projectId: projectB, lifecycleStage: "pre_award" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      await expect(owner.projects.transitionLifecycle({ tenantId: tenantA, projectId, lifecycleStage: "pre_award" })).rejects.toThrow("PROJECT_OS_LIFECYCLE_TRANSITION_INVALID");
      await expect(owner.projects.transitionLifecycle({ tenantId: tenantA, projectId, lifecycleStage: "execution" })).resolves.toMatchObject({ projectId, lifecycleStage: "execution" });
      await expect(owner.projects.transitionLifecycle({ tenantId: tenantA, projectId, lifecycleStage: "commissioning" })).resolves.toMatchObject({ projectId, lifecycleStage: "commissioning" });
      const listed = await owner.projects.list({ tenantId: tenantA });
      expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: projectId, code: "PRJ-LIFE-TRPC", lifecycleStage: "commissioning" })]));
      const controls = await owner.projects.getControls({ tenantId: tenantA, projectId });
      expect(controls).toMatchObject({ project: expect.objectContaining({ id: projectId, name: "Lifecycle evidence project" }) });
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action IN ('project.created','project.lifecycle_transitioned')", [tenantA, projectId]);
      expect(Number(audits[0].count)).toBe(3);
    } finally {
      if (projectId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [projectId]);
        await connection.query("DELETE FROM projects WHERE id = ?", [projectId]);
      }
    }
  }, 12_000);

  it("governs manual EVM calculation and snapshot persistence with isolation and audit evidence", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const unassignedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const owner = appRouter.createCaller(ownerContext);
    const unassigned = appRouter.createCaller(unassignedContext);
    const evmInput = { pv: 120, ev: 90, ac: 100, bac: 200, eacMethod: "manual" as const, manualEac: 225 };
    let snapshotId: string | undefined;
    try {
      await expect(owner.controls.calculateEvm(evmInput)).resolves.toMatchObject({ pv: 120, ev: 90, ac: 100, eac: 225 });
      await expect(unassigned.controls.saveEvmSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-19T00:00:00.000Z"), ...evmInput })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      await expect(owner.controls.saveEvmSnapshot({ tenantId: tenantA, projectId: projectB, periodAt: new Date("2026-08-19T00:00:00.000Z"), ...evmInput })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      const saved = await owner.controls.saveEvmSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-19T00:00:00.000Z"), ...evmInput });
      snapshotId = saved.id;
      expect(saved).toMatchObject({ id: snapshotId, pv: 120, ev: 90, ac: 100, eac: 225 });
      const [rows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM evm_snapshots WHERE id = ? AND tenantId = ? AND projectId = ?", [snapshotId, tenantA, projectA]);
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'evm.snapshot_created'", [tenantA, snapshotId]);
      expect(Number(rows[0].count)).toBe(1);
      expect(Number(audits[0].count)).toBe(1);
    } finally {
      if (snapshotId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [snapshotId]);
        await connection.query("DELETE FROM evm_snapshots WHERE id = ?", [snapshotId]);
      }
    }
  }, 12_000);

  it("governs change-request and HSE transitions with isolation, reads, and audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    let changeId: string | undefined;
    let observationId: string | undefined;
    try {
      const change = await caller.changes.create({ tenantId: tenantA, projectId: projectA, changeNumber: "CHANGE-TRANS-TRPC", title: "Transition evidence change", description: "This request exercises the governed operational change transition workflow.", impactScheduleDays: 7, impactCost: 2500, currency: "USD" });
      changeId = change.id;
      await expect(caller.changes.transitionStatus({ tenantId: tenantA, projectId: projectB, changeRequestId: changeId, nextStatus: "submitted" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      await expect(caller.changes.transitionStatus({ tenantId: tenantA, projectId: projectA, changeRequestId: changeId, nextStatus: "approved" })).rejects.toThrow("PROJECT_OS_CHANGE_REQUEST_TRANSITION_INVALID");
      await expect(caller.changes.transitionStatus({ tenantId: tenantA, projectId: projectA, changeRequestId: changeId, nextStatus: "submitted" })).resolves.toMatchObject({ id: changeId, status: "submitted" });
      await expect(caller.changes.transitionStatus({ tenantId: tenantA, projectId: projectA, changeRequestId: changeId, nextStatus: "under_review" })).resolves.toMatchObject({ id: changeId, status: "under_review" });
      await expect(caller.changes.transitionStatus({ tenantId: tenantA, projectId: projectA, changeRequestId: changeId, nextStatus: "approved" })).resolves.toMatchObject({ id: changeId, status: "approved" });
      expect(await caller.changes.list({ tenantId: tenantA, projectId: projectA })).toEqual(expect.arrayContaining([expect.objectContaining({ id: changeId, status: "approved" })]));
      const observation = await caller.hse.create({ tenantId: tenantA, projectId: projectA, observationNumber: "HSE-TRANS-TRPC", title: "Transition evidence observation", description: "This observation exercises the governed HSE transition workflow.", category: "safety", severity: "high" });
      observationId = observation.id;
      await expect(caller.hse.transitionStatus({ tenantId: tenantA, projectId: projectB, observationId, nextStatus: "assigned" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      await expect(caller.hse.transitionStatus({ tenantId: tenantA, projectId: projectA, observationId, nextStatus: "closed" })).rejects.toThrow("PROJECT_OS_HSE_TRANSITION_INVALID");
      for (const nextStatus of ["assigned", "remediation", "verification", "closed"] as const) {
        await expect(caller.hse.transitionStatus({ tenantId: tenantA, projectId: projectA, observationId, nextStatus })).resolves.toMatchObject({ id: observationId, status: nextStatus });
      }
      expect(await caller.hse.list({ tenantId: tenantA, projectId: projectA })).toEqual(expect.arrayContaining([expect.objectContaining({ id: observationId, status: "closed" })]));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND ((entityId = ? AND action IN ('project.change_request_created','project.change_request_status_transitioned')) OR (entityId = ? AND action IN ('hse.observation_created','hse.observation_status_transitioned')))", [tenantA, changeId, observationId]);
      expect(Number(audits[0].count)).toBe(9);
    } finally {
      if (changeId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [changeId]);
        await connection.query("DELETE FROM change_requests WHERE id = ?", [changeId]);
      }
      if (observationId) {
        await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [observationId]);
        await connection.query("DELETE FROM hse_observations WHERE id = ?", [observationId]);
      }
    }
  }, 15_000);

  it("rejects a foreign master plan and creates versioned spatial records with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.masterPlans.create({ tenantId: tenantA, projectId: projectB, code: "MP-BLOCKED", title: "Blocked plan" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.masterPlans.create({ tenantId: tenantA, projectId: projectA, code: "MP-INVALID-SOURCE", title: "Invalid source", sourceFileName: "map.txt", sourceMimeType: "text/plain", sourceContentBase64: Buffer.from("not a master plan").toString("base64") })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_SOURCE_INVALID");
    const plan = await caller.masterPlans.create({ tenantId: tenantA, projectId: projectA, code: "MP-TRPC", title: "Integration master plan", description: "Original baseline" });
    const revision = await caller.masterPlans.createVersion({ tenantId: tenantA, projectId: projectA, masterPlanId: plan.id, versionKind: "revision", changeSummary: "Updated zones" });
    const entity = await caller.masterPlans.createSpatialEntity({ tenantId: tenantA, projectId: projectA, masterPlanVersionId: plan.versionId, code: "ZONE-A", name: "Zone A", entityType: "zone", geometry: { x: 5, y: 10, width: 25, height: 20 }, status: "in_progress", progressPercent: 45, plannedValue: 100, actualValue: 40, forecastValue: 110 });
    const manualChild = await caller.masterPlans.createSpatialEntity({ tenantId: tenantA, projectId: projectA, masterPlanVersionId: plan.versionId, parentEntityId: entity.id, code: "UNIT-MANUAL", name: "Manual unit", entityType: "unit", geometry: { x: 6, y: 12, width: 10, height: 10 }, status: "not_started", progressPercent: 0, plannedValue: 0, actualValue: 0, forecastValue: 0 });
    const linkedWbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "WBS-MP-LINK", name: "Master Plan linked WBS", plannedValue: 100 });
    const linkedActivity = await caller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: linkedWbs.id, code: "ACT-MP-LINK", name: "Master Plan linked activity", plannedValue: 100, plannedStartAt: new Date("2026-01-01T00:00:00.000Z"), plannedFinishAt: new Date("2026-01-02T00:00:00.000Z") });
    const spatialCsv = Buffer.from("Code,Name,Entity Type,X,Y,Width,Height,Progress,Parent Code,WBS Code,Activity Code\nZONE-B,Zone B,zone,35,10,20,20,30%,ZONE-A,WBS-MP-LINK,ACT-MP-LINK").toString("base64");
    await expect(caller.masterPlans.importSpatialEntities({ tenantId: tenantA, projectId: projectB, masterPlanVersionId: plan.versionId, format: "csv", base64: spatialCsv })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.masterPlans.importSpatialEntities({ tenantId: tenantA, projectId: projectA, masterPlanVersionId: plan.versionId, format: "csv", base64: spatialCsv })).resolves.toMatchObject({ masterPlanVersionId: plan.versionId, createdRows: 1 });
    const mappingCsv = Buffer.from("Unit ID,Progress,Status,Actual Value\nZONE-A,84%,completed,90").toString("base64");
    await expect(caller.masterPlans.applyExcelMapping({ tenantId: tenantA, projectId: projectB, masterPlanVersionId: plan.versionId, format: "csv", base64: mappingCsv })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.masterPlans.applyExcelMapping({ tenantId: tenantA, projectId: projectA, masterPlanVersionId: plan.versionId, format: "csv", base64: mappingCsv })).resolves.toMatchObject({ masterPlanVersionId: plan.versionId, updatedRows: 1 });
    const register = await caller.masterPlans.list({ tenantId: tenantA, projectId: projectA });
    expect(register.plans.map(item => item.id)).toContain(plan.id); expect(register.versions.map(item => item.id)).toEqual(expect.arrayContaining([plan.versionId, revision.id])); expect(register.entities.map(item => item.id)).toContain(entity.id); expect(register.entities.find(item => item.id === manualChild.id)).toMatchObject({ parentEntityId: entity.id }); expect(register.entities.find(item => item.code === "ZONE-B")).toMatchObject({ parentEntityId: entity.id, wbsItemId: linkedWbs.id, activityId: linkedActivity.id });
    const [rows] = await connection.query<{ plans: number; versions: number; entities: number; audits: number; progress: string; actual: string; status: string }[]>("SELECT (SELECT COUNT(*) FROM master_plans WHERE id = ?) AS plans, (SELECT COUNT(*) FROM master_plan_versions WHERE masterPlanId = ?) AS versions, (SELECT COUNT(*) FROM master_plan_spatial_entities WHERE masterPlanVersionId = ?) AS entities, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?, ?, ?, ?)) AS audits, (SELECT progressPercent FROM master_plan_spatial_entities WHERE id = ?) AS progress, (SELECT actualValue FROM master_plan_spatial_entities WHERE id = ?) AS actual, (SELECT status FROM master_plan_spatial_entities WHERE id = ?) AS status", [plan.id, plan.id, plan.versionId, plan.id, plan.versionId, revision.id, entity.id, manualChild.id, entity.id, entity.id, entity.id]);
    expect(rows[0]).toMatchObject({ plans: 1, versions: 2, entities: 3, audits: 6, progress: "84.00", actual: "90.00", status: "completed" });
    await connection.query("DELETE FROM master_plan_spatial_entities WHERE masterPlanVersionId = ?", [plan.versionId]);
    await connection.query("DELETE FROM activities WHERE id = ?", [linkedActivity.id]);
    await connection.query("DELETE FROM wbs_items WHERE id = ?", [linkedWbs.id]);
  }, 12_000);

  it("provisions a manual license, enforces its feature limit, governs status changes, and rejects a foreign tenant license view", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const catalog = await caller.licensing.catalog(); const projectPlan = catalog.plans.find(item => item.code === "PROJECT_STANDARD"); expect(projectPlan).toBeTruthy();
    await caller.licensing.provision({ tenantId: tenantA, planCode: "PROJECT_STANDARD", status: "active", seats: 3, priceAmount: 1200, discountAmount: 100, manualActivation: true });
    const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA }); expect(licenseRegister.license).toMatchObject({ planCode: "PROJECT_STANDARD", status: "active", seats: 3, manualActivation: true });
    const unassignedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(unassignedContext).licensing.tenantLicense({ tenantId: tenantB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "MASTER_PLAN", active: true, limitValue: 0 });
    await expect(caller.masterPlans.create({ tenantId: tenantA, projectId: projectA, code: "MP-LIMIT", title: "Limit blocked" })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
    await caller.licensing.transition({ tenantId: tenantA, licenseId: licenseRegister.license!.id, nextStatus: "suspended" });
    await expect(caller.masterPlans.list({ tenantId: tenantA, projectId: projectA })).rejects.toThrow("PROJECT product is not licensed");
    await caller.licensing.transition({ tenantId: tenantA, licenseId: licenseRegister.license!.id, nextStatus: "active" });
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "MASTER_PLAN", active: true, limitValue: 10 });
    const [rows] = await connection.query<{ licenses: number; overrides: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM tenant_licenses WHERE tenantId = ?) AS licenses, (SELECT COUNT(*) FROM tenant_license_feature_overrides WHERE tenantLicenseId = ?) AS overrides, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action LIKE 'licensing.%') AS audits", [tenantA, licenseRegister.license!.id, tenantA]);
    expect(rows[0]).toMatchObject({ licenses: 1, overrides: 1, audits: 5 });
    await caller.licensing.provision({ tenantId: tenantA, planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 3, manualActivation: true });
    const allInOne = await caller.licensing.tenantLicense({ tenantId: tenantA });
    const allInOneNavigation = await caller.navigation.get({ tenantId: tenantA, projectId: projectA });
    expect(allInOne.license).toMatchObject({ planCode: "ALL_IN_ONE_STANDARD", status: "active" });
    expect(allInOneNavigation.map(item => item.id)).toEqual(expect.arrayContaining(["executive-dashboard", "project-controls"]));
    expect(allInOneNavigation.map(item => item.id)).not.toContain("pmo-controls");
  });

  it("reserves commercial seats for invitations and blocks direct assignment or acceptance above the active limit", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const owner = appRouter.createCaller(ownerContext);
    const seatUserOpenId = "integration-seat-user";
    const seatUserEmail = "integration-seat@test.local";
    let seatUserId: number | undefined;
    let invitationId: string | undefined;
    let membershipId: string | undefined;
    let assignmentId: string | undefined;
    let roleId: string | undefined;
    try {
      await connection.query("DELETE FROM users WHERE openId = ?", [seatUserOpenId]);
      await connection.query("INSERT INTO users (openId, name, email) VALUES (?, 'Seat Test User', ?)", [seatUserOpenId, seatUserEmail]);
      const [[seatUser]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = ? LIMIT 1", [seatUserOpenId]);
      seatUserId = seatUser.id;
      const seatUserContext: TrpcContext = { user: { id: seatUserId, openId: seatUserOpenId, name: "Seat Test User", email: seatUserEmail, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
      const seatUserCaller = appRouter.createCaller(seatUserContext);
      const role = await owner.tenant.createRole({ tenantId: tenantA, code: "INT_SEAT_ROLE", name: "Integration Seat Role", productCode: "PROJECT", permissionCodes: ["project.read"] });
      roleId = role.id;
      await owner.licensing.provision({ tenantId: tenantA, planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 2, manualActivation: true });
      const invitation = await owner.tenant.createInvitation({ tenantId: tenantA, email: seatUserEmail, roleId, scopeType: "company" });
      invitationId = invitation.invitationId;
      await expect(owner.tenant.assignMember({ tenantId: tenantA, targetUserId: unassignedUserId, roleId, scopeType: "company" })).rejects.toThrow("PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED");
      await owner.licensing.provision({ tenantId: tenantA, planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 1, manualActivation: true });
      await expect(seatUserCaller.tenant.acceptInvitation({ inviteToken: invitation.inviteToken })).rejects.toThrow("PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED");
      const [blockedRows] = await connection.query<{ pending: number; memberships: number; acceptanceAudits: number }[]>("SELECT (SELECT COUNT(*) FROM membership_invitations WHERE id = ? AND status = 'pending') AS pending, (SELECT COUNT(*) FROM memberships WHERE tenantId = ? AND userId = ?) AS memberships, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'tenant.invitation_accepted') AS acceptanceAudits", [invitationId, tenantA, seatUserId, invitationId]);
      expect(blockedRows[0]).toMatchObject({ pending: 1, memberships: 0, acceptanceAudits: 0 });
      await owner.licensing.provision({ tenantId: tenantA, planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 2, manualActivation: true });
      const accepted = await seatUserCaller.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
      membershipId = accepted.membershipId;
      assignmentId = accepted.assignmentId;
      const [allowedRows] = await connection.query<{ activeMemberships: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM memberships WHERE id = ? AND status = 'active') AS activeMemberships, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action IN ('tenant.member_invited','tenant.invitation_accepted')) AS audits", [membershipId, invitationId]);
      expect(allowedRows[0]).toMatchObject({ activeMemberships: 1, audits: 2 });
    } finally {
      if (assignmentId) await connection.query("DELETE FROM membership_roles WHERE id = ?", [assignmentId]);
      if (membershipId) await connection.query("DELETE FROM memberships WHERE id = ?", [membershipId]);
      if (invitationId) { await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [invitationId]); await connection.query("DELETE FROM membership_invitations WHERE id = ?", [invitationId]); }
      if (seatUserId) await connection.query("DELETE FROM users WHERE id = ?", [seatUserId]);
      if (roleId) { await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [roleId]); await connection.query("DELETE FROM role_permissions WHERE roleId = ?", [roleId]); await connection.query("DELETE FROM roles WHERE id = ?", [roleId]); }
      await owner.licensing.provision({ tenantId: tenantA, planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 3, manualActivation: true });
    }
  }, 12_000);

  it("enforces the licensed project limit before project creation and allows a governed project after capacity is restored", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    let projectId: string | undefined;
    const limitedCode = "PRJ-LIMIT-BLOCKED";
    const allowedCode = "PRJ-LIMIT-ALLOWED";
    try {
      const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA });
      expect(licenseRegister.license).toBeTruthy();
      await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "PROJECT_LIMIT", active: true, limitValue: 1 });
      await expect(caller.projects.create({ tenantId: tenantA, code: limitedCode, name: "Blocked by project limit", projectType: "Infrastructure", currency: "USD" })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
      const [blockedRows] = await connection.query<{ projects: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM projects WHERE tenantId = ? AND code = ?) AS projects, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'project.created' AND metadata LIKE ?) AS audits", [tenantA, limitedCode, tenantA, `%${limitedCode}%`]);
      expect(blockedRows[0]).toMatchObject({ projects: 0, audits: 0 });
      await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "PROJECT_LIMIT", active: true, limitValue: 2 });
      const created = await caller.projects.create({ tenantId: tenantA, code: allowedCode, name: "Allowed by project limit", projectType: "Infrastructure", currency: "USD" });
      projectId = created.id;
      const [allowedRows] = await connection.query<{ projects: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM projects WHERE id = ? AND tenantId = ? AND code = ?) AS projects, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'project.created') AS audits", [projectId, tenantA, allowedCode, projectId]);
      expect(allowedRows[0]).toMatchObject({ projects: 1, audits: 1 });
    } finally {
      if (projectId) { await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [projectId]); await connection.query("DELETE FROM projects WHERE id = ?", [projectId]); }
      const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA });
      if (licenseRegister.license) await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license.id, featureCode: "PROJECT_LIMIT", active: true, limitValue: 20 });
    }
  }, 12_000);

  it("enforces the licensed document-storage limit before uploading a document or version and allows them after capacity is restored", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const firstBytes = Buffer.from("12345", "utf8");
    const secondBytes = Buffer.from("6", "utf8");
    const blockedNumber = "DOC-STORAGE-BLOCKED";
    let documentId: string | undefined;
    let firstVersionId: string | undefined;
    let secondVersionId: string | undefined;
    try {
      const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA });
      expect(licenseRegister.license).toBeTruthy();
      await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "STORAGE_BYTES", active: true, limitValue: 4 });
      await expect(caller.documents.createWithVersion({ tenantId: tenantA, projectId: projectA, documentNumber: blockedNumber, title: "Blocked by storage limit", category: "report", originalName: "blocked.txt", mimeType: "text/plain", contentBase64: firstBytes.toString("base64") })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
      const [blockedRows] = await connection.query<{ documents: number; versions: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM project_documents WHERE tenantId = ? AND documentNumber = ?) AS documents, (SELECT COUNT(*) FROM document_versions WHERE tenantId = ? AND projectId = ?) AS versions, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'documents.document_created' AND metadata LIKE ?) AS audits", [tenantA, blockedNumber, tenantA, projectA, tenantA, `%${blockedNumber}%`]);
      expect(blockedRows[0]).toMatchObject({ documents: 0, versions: 0, audits: 0 });
      await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "STORAGE_BYTES", active: true, limitValue: 5 });
      const created = await caller.documents.createWithVersion({ tenantId: tenantA, projectId: projectA, documentNumber: "DOC-STORAGE-ALLOWED", title: "Allowed by storage limit", category: "report", originalName: "allowed-v1.txt", mimeType: "text/plain", contentBase64: firstBytes.toString("base64") });
      documentId = created.id;
      firstVersionId = created.versionId;
      await expect(caller.documents.addVersion({ tenantId: tenantA, projectId: projectA, documentId, originalName: "allowed-v2.txt", mimeType: "text/plain", contentBase64: secondBytes.toString("base64") })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
      const [versionBlockedRows] = await connection.query<{ versions: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM document_versions WHERE documentId = ?) AS versions, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'documents.version_created' AND entityId NOT IN (?)) AS audits", [documentId, tenantA, firstVersionId]);
      expect(versionBlockedRows[0]).toMatchObject({ versions: 1, audits: 0 });
      await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "STORAGE_BYTES", active: true, limitValue: 6 });
      const second = await caller.documents.addVersion({ tenantId: tenantA, projectId: projectA, documentId, originalName: "allowed-v2.txt", mimeType: "text/plain", contentBase64: secondBytes.toString("base64") });
      secondVersionId = second.id;
      const [allowedRows] = await connection.query<{ bytes: number; versions: number; audits: number }[]>("SELECT (SELECT COALESCE(SUM(sizeBytes), 0) FROM document_versions WHERE documentId = ?) AS bytes, (SELECT COUNT(*) FROM document_versions WHERE documentId = ?) AS versions, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action IN ('documents.document_created','documents.version_created') AND entityId IN (?, ?, ?)) AS audits", [documentId, documentId, tenantA, documentId, firstVersionId, secondVersionId]);
      expect({ ...allowedRows[0], bytes: Number(allowedRows[0].bytes) }).toMatchObject({ bytes: 6, versions: 2, audits: 2 });
    } finally {
      if (documentId) { await connection.query("DELETE FROM audit_logs WHERE tenantId = ? AND entityId IN (?, ?, ?)", [tenantA, documentId, firstVersionId ?? "", secondVersionId ?? ""]); await connection.query("DELETE FROM document_versions WHERE documentId = ?", [documentId]); await connection.query("DELETE FROM project_documents WHERE id = ?", [documentId]); }
      const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA });
      if (licenseRegister.license) await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license.id, featureCode: "STORAGE_BYTES", active: true, limitValue: 1_073_741_824 });
    }
  }, 15_000);

  it("blocks an AI advisory request at the monthly commercial limit before any model call or usage audit", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    try {
      const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA });
      expect(licenseRegister.license).toBeTruthy();
      await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license!.id, featureCode: "AI_ADVISORY_MONTHLY", active: true, limitValue: 0 });
      await expect(caller.advisor.project({ tenantId: tenantA, projectId: projectA, locale: "en" })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
      const [rows] = await connection.query<{ usageAudits: number }[]>("SELECT COUNT(*) AS usageAudits FROM audit_logs WHERE tenantId = ? AND action = 'advisor.usage_consumed'", [tenantA]);
      expect(Number(rows[0].usageAudits)).toBe(0);
    } finally {
      const licenseRegister = await caller.licensing.tenantLicense({ tenantId: tenantA });
      if (licenseRegister.license) await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: licenseRegister.license.id, featureCode: "AI_ADVISORY_MONTHLY", active: true, limitValue: 100 });
    }
  }, 12_000);

  it("expires an ended tenant license, deactivates its entitlement, and records an auditable lifecycle transition", async () => {
    await connection.query("CREATE TABLE IF NOT EXISTS scheduled_jobs (`id` varchar(64) NOT NULL, `purpose` enum('license_lifecycle') NOT NULL, `scheduleCronTaskUid` varchar(65), `enabled` boolean NOT NULL DEFAULT true, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY (`scheduleCronTaskUid`), KEY `scheduled_jobs_task_uid_idx` (`scheduleCronTaskUid`))");
    const [licenses] = await connection.query<{ id: string; subscriptionId: string }[]>("SELECT id, subscriptionId FROM tenant_licenses WHERE tenantId = ? ORDER BY createdAt LIMIT 1", [tenantA]);
    expect(licenses[0]).toBeTruthy();
    const evaluatedAt = new Date("2026-08-19T02:00:00.000Z");
    await connection.query("UPDATE tenant_licenses SET status = 'active', endsAt = ?, graceEndsAt = NULL WHERE id = ?", [new Date("2026-08-18T23:59:59.000Z"), licenses[0].id]);
    await connection.query("UPDATE subscriptions SET status = 'active' WHERE id = ?", [licenses[0].subscriptionId]);
    await connection.query("UPDATE tenant_entitlements SET active = true WHERE subscriptionId = ?", [licenses[0].subscriptionId]);
    await expect(evaluateTenantLicenseLifecycle(evaluatedAt)).resolves.toMatchObject({ transitioned: 1, transitions: [expect.objectContaining({ id: licenses[0].id, status: "expired" })] });
    const [rows] = await connection.query<{ licenseStatus: string; subscriptionStatus: string; entitlementActive: number; audits: number }[]>("SELECT (SELECT status FROM tenant_licenses WHERE id = ?) AS licenseStatus, (SELECT status FROM subscriptions WHERE id = ?) AS subscriptionStatus, (SELECT active FROM tenant_entitlements WHERE subscriptionId = ? LIMIT 1) AS entitlementActive, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'licensing.license_lifecycle_evaluated') AS audits", [licenses[0].id, licenses[0].subscriptionId, licenses[0].subscriptionId, licenses[0].id]);
    expect(rows[0]).toMatchObject({ licenseStatus: "expired", subscriptionStatus: "expired", entitlementActive: 0, audits: 1 });
    await connection.query("UPDATE tenant_licenses SET status = 'active', endsAt = NULL WHERE id = ?", [licenses[0].id]);
    await connection.query("UPDATE subscriptions SET status = 'active' WHERE id = ?", [licenses[0].subscriptionId]);
    await connection.query("UPDATE tenant_entitlements SET active = true WHERE subscriptionId = ?", [licenses[0].subscriptionId]);
  });

  it("rejects disabled and exhausted data-import and data-export features before storage, business writes, or export audit writes", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const license = (await caller.licensing.tenantLicense({ tenantId: tenantA })).license!;
    const csv = Buffer.from("code,name,plannedValue\nWBS-LICENSE,Blocked,100").toString("base64");
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: license.id, featureCode: "DATA_IMPORT", active: false });
    await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "blocked.csv", sourceFormat: "csv", base64: csv })).rejects.toThrow("PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE");
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: license.id, featureCode: "DATA_IMPORT", active: true, limitValue: 0 });
    await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "limited.csv", sourceFormat: "csv", base64: csv })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('int-wbs-license-limit', ?, ?, 'WBS-LICENSE-LIMIT', 'License export row', 1)", [tenantA, projectA]);
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: license.id, featureCode: "DATA_EXPORT", active: false });
    await expect(caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "csv", locale: "en" })).rejects.toThrow("PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE");
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: license.id, featureCode: "DATA_EXPORT", active: true, limitValue: 0 });
    await expect(caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "csv", locale: "en" })).rejects.toThrow("PROJECT_OS_LICENSE_LIMIT_EXCEEDED");
    const [rows] = await connection.query<{ imports: number; exports: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE tenantId = ? AND projectId = ?) AS imports, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'data_export_generated') AS exports", [tenantA, projectA, tenantA]);
    expect(rows[0]).toMatchObject({ imports: 0, exports: 0 });
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: license.id, featureCode: "DATA_IMPORT", active: true, limitValue: 50 });
    await caller.licensing.setFeatureOverride({ tenantId: tenantA, licenseId: license.id, featureCode: "DATA_EXPORT", active: true, limitValue: 100 });
    await connection.query("DELETE FROM wbs_items WHERE id = 'int-wbs-license-limit'");
  });

  it("rejects cross-tenant import analysis before file storage or import audit writes", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectB, moduleCode: "wbs", fileName: "cross-tenant.csv", sourceFormat: "csv", base64: Buffer.from("code,name\n1,Blocked").toString("base64") })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const [rows] = await connection.query<{ imports: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE tenantId = ? AND projectId = ?) AS imports, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'data_import.analyzed') AS audits", [tenantA, projectB, tenantA]);
    expect(rows[0]).toMatchObject({ imports: 0, audits: 0 });
  });

  it("rejects a cross-tenant export and generates an authorized CSV export with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.dataImports.export({ tenantId: tenantA, projectId: projectB, moduleCode: "wbs", format: "csv", locale: "en" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('int-wbs-export-audit', ?, ?, 'WBS-EXPORT-AUDIT', 'Export evidence work package', 340)", [tenantA, projectA]);
    const exported = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "csv", locale: "en" });
    expect(exported).toMatchObject({ rowCount: expect.any(Number) });
    expect(exported.contentType).toContain("text/csv");
    expect(Buffer.from(exported.base64, "base64").toString("utf8")).toContain("WBS-EXPORT-AUDIT");
    const [rows] = await connection.query<{ audits: number }[]>("SELECT COUNT(*) AS audits FROM audit_logs WHERE id = ? AND tenantId = ? AND action = 'data_export_generated' AND entityType = 'data_export'", [exported.id, tenantA]);
    expect(Number(rows[0].audits)).toBe(1);
    await connection.query("DELETE FROM audit_logs WHERE id = ?", [exported.id]);
    await connection.query("DELETE FROM wbs_items WHERE id = 'int-wbs-export-audit'");
  }, 12_000);

  it("generates an authorized Arabic XLSX export with localized content and audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    let exportId: string | undefined;
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('int-wbs-xlsx-audit', ?, ?, 'WBS-XLSX-AUDIT', 'XLSX audit work package', 350)", [tenantA, projectA]);
    try {
      const exported = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "xlsx", locale: "ar" });
      exportId = exported.id;
      expect(exported).toMatchObject({ fileName: "wbs-export.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", rowCount: expect.any(Number) });
      const workbook = XLSX.read(Buffer.from(exported.base64, "base64"), { type: "buffer" });
      expect(workbook.SheetNames).toEqual(["WBS"]);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.WBS, { defval: "" });
      expect(rows).toContainEqual(expect.objectContaining({ "رمز WBS": "WBS-XLSX-AUDIT", "اسم WBS": "XLSX audit work package", "القيمة المخططة": 350 }));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE id = ? AND tenantId = ? AND action = 'data_export_generated' AND entityType = 'data_export'", [exportId, tenantA]);
      expect(Number(audits[0].count)).toBe(1);
    } finally {
      if (exportId) await connection.query("DELETE FROM audit_logs WHERE id = ?", [exportId]);
      await connection.query("DELETE FROM wbs_items WHERE id = 'int-wbs-xlsx-audit'");
    }
  }, 12_000);

  it("rejects a foreign budget export and generates authorized budget CSV and activity XLSX exports with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const exportIds: string[] = [];
    await expect(caller.dataImports.export({ tenantId: tenantA, projectId: projectB, moduleCode: "budget", format: "csv", locale: "en" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, costCode, originalAmount, currentAmount) VALUES ('int-budget-export-audit', ?, ?, 'BUD-EXPORT-AUDIT', 610, 640)", [tenantA, projectA]);
    await connection.query("INSERT INTO activities (id, tenantId, projectId, code, name, status, plannedValue, plannedStartAt, plannedFinishAt) VALUES ('int-activity-export-audit', ?, ?, 'ACT-EXPORT-AUDIT', 'Activity export evidence', 'in_progress', 275, '2026-09-01 00:00:00', '2026-09-30 00:00:00')", [tenantA, projectA]);
    try {
      const budgetExport = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "budget", format: "csv", locale: "en" });
      exportIds.push(budgetExport.id);
      expect(budgetExport).toMatchObject({ fileName: "budget-export.csv", contentType: expect.stringContaining("text/csv") });
      expect(Buffer.from(budgetExport.base64, "base64").toString("utf8")).toContain("BUD-EXPORT-AUDIT");
      const activityExport = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "activities", format: "xlsx", locale: "ar" });
      exportIds.push(activityExport.id);
      const workbook = XLSX.read(Buffer.from(activityExport.base64, "base64"), { type: "buffer" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.ACTIVITIES, { defval: "" });
      expect(rows).toContainEqual(expect.objectContaining({ "رمز النشاط": "ACT-EXPORT-AUDIT", "اسم النشاط": "Activity export evidence", "القيمة المخططة": 275, "الحالة": "in_progress" }));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE id IN (?, ?) AND tenantId = ? AND action = 'data_export_generated'", [budgetExport.id, activityExport.id, tenantA]);
      expect(Number(audits[0].count)).toBe(2);
    } finally {
      if (exportIds.length) await connection.query("DELETE FROM audit_logs WHERE id IN (?)", [exportIds]);
      await connection.query("DELETE FROM activities WHERE id = 'int-activity-export-audit'");
      await connection.query("DELETE FROM budget_lines WHERE id = 'int-budget-export-audit'");
    }
  }, 12_000);

  it("analyzes and confirms an authorized WBS import with atomic business and audit writes", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.dataImports.export({ tenantId: tenantA, projectId: projectB, moduleCode: "wbs", format: "csv", locale: "en" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const analysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "integration-wbs.csv", sourceFormat: "csv", base64: Buffer.from("Code,Name,Planned Value\nWBS-IMPORT-TRPC,Imported work package,250").toString("base64") });
    expect(analysis).toMatchObject({ status: "validated", totalRows: 1, errors: [] });
    const needsMapping = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "integration-remap.csv", sourceFormat: "csv", base64: Buffer.from("External code,Work title,Planned amount\nWBS-REMAP-TRPC,Remapped work package,175").toString("base64") });
    expect(needsMapping).toMatchObject({ status: "uploaded" });
    const remapped = await caller.dataImports.reanalyze({ tenantId: tenantA, projectId: projectA, importId: needsMapping.id, mappingOverride: { code: "External code", name: "Work title", plannedValue: "Planned amount" } });
    expect(remapped).toMatchObject({ id: needsMapping.id, status: "validated", errors: [] });
    const remappedCompletion = await caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: needsMapping.id });
    expect(remappedCompletion).toMatchObject({ status: "completed", createdRows: 1 });
    const completion = await caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: analysis.id });
    expect(completion).toMatchObject({ id: analysis.id, status: "completed", createdRows: 1 });
    const exported = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "csv", locale: "en" });
    expect(exported).toMatchObject({ fileName: "wbs-export.csv", rowCount: 2 }); expect(Buffer.from(exported.base64, "base64").toString("utf8")).toContain("WBS-IMPORT-TRPC");
    const [rows] = await connection.query<{ imports: number; wbs: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE id = ? AND status = 'completed' AND createdRows = 1) AS imports, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-IMPORT-TRPC' AND plannedValue = 250) AS wbs, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_completed') AS audits", [analysis.id, tenantA, projectA, analysis.id]);
    expect(rows[0]).toMatchObject({ imports: 1, wbs: 1, audits: 1 });
    const [remapAudit] = await connection.query<{ imports: number; wbs: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE id = ? AND status = 'completed') AS imports, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-REMAP-TRPC' AND plannedValue = 175) AS wbs, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_reanalyzed') AS audits", [needsMapping.id, tenantA, projectA, needsMapping.id]);
    expect(remapAudit[0]).toMatchObject({ imports: 1, wbs: 1, audits: 1 });
    const [exportAudit] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE entityId = ? AND action = 'data_export_generated'", [exported.id]); expect(exportAudit[0]).toMatchObject({ count: 1 });
  }, 12_000);

  it("applies the upsert policy, persists per-row results, and rejects foreign import-result reads", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const csv = Buffer.from("Code,Name,Planned Value\nWBS-IMPORT-TRPC,Updated imported package,300\nWBS-UPSERT-TRPC,New upsert package,125").toString("base64");
    const analysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "integration-upsert.csv", sourceFormat: "csv", base64: csv, duplicateMode: "upsert" });
    const completion = await caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: analysis.id });
    expect(completion).toMatchObject({ status: "completed", createdRows: 1, updatedRows: 1, skippedRows: 0 });
    await expect(caller.dataImports.detail({ tenantId: tenantA, projectId: projectB, importId: analysis.id })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const detail = await caller.dataImports.detail({ tenantId: tenantA, projectId: projectA, importId: analysis.id });
    expect(detail.rowResults).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 2, rowKey: "WBS-IMPORT-TRPC", action: "updated" }), expect.objectContaining({ rowNumber: 3, rowKey: "WBS-UPSERT-TRPC", action: "created" })]));
    const skipAnalysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "integration-skip.csv", sourceFormat: "csv", base64: Buffer.from("Code,Name,Planned Value\nWBS-UPSERT-TRPC,Skipped existing package,200\nWBS-SKIP-CREATED,Created while skipping existing,75").toString("base64"), duplicateMode: "skip_duplicates" });
    await expect(caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: skipAnalysis.id })).resolves.toMatchObject({ status: "completed", createdRows: 1, updatedRows: 0, skippedRows: 1 });
    const updateOnlyAnalysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "integration-update-only.csv", sourceFormat: "csv", base64: Buffer.from("Code,Name,Planned Value\nWBS-UPSERT-TRPC,Updated only package,140\nWBS-UPDATE-SKIPPED,No existing target,90").toString("base64"), duplicateMode: "update_existing" });
    await expect(caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: updateOnlyAnalysis.id })).resolves.toMatchObject({ status: "completed", createdRows: 0, updatedRows: 1, skippedRows: 1 });
    const [rows] = await connection.query<{ updatedValue: string; created: number; results: number; audit: number }[]>("SELECT (SELECT plannedValue FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-IMPORT-TRPC') AS updatedValue, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-UPSERT-TRPC') AS created, (SELECT COUNT(*) FROM data_import_row_results WHERE importId = ?) AS results, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_completed') AS audit", [tenantA, projectA, tenantA, projectA, analysis.id, analysis.id]);
    expect(rows[0]).toMatchObject({ updatedValue: "300.00", created: 1, results: 2, audit: 1 });
    const [modeRows] = await connection.query<{ updateOnlyValue: string; skipCreated: number; updateSkipped: number }[]>("SELECT (SELECT plannedValue FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-UPSERT-TRPC') AS updateOnlyValue, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-SKIP-CREATED') AS skipCreated, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-UPDATE-SKIPPED') AS updateSkipped", [tenantA, projectA, tenantA, projectA, tenantA, projectA]);
    expect(modeRows[0]).toMatchObject({ updateOnlyValue: "140.00", skipCreated: 1, updateSkipped: 0 });
  }, 12_000);

  it("rejects a cross-tenant field report and governs an authorized report lifecycle with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.fieldReports.create({ tenantId: tenantA, projectId: projectB, reportNumber: "FR-BLOCKED", reportType: "daily", reportedAt: new Date("2026-08-19T00:00:00.000Z"), shift: "day", workforceCount: 12, weather: "Clear", summary: "Blocked cross-tenant field report." })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const report = await caller.fieldReports.create({ tenantId: tenantA, projectId: projectA, reportNumber: "FR-TRPC", reportType: "daily", reportedAt: new Date("2026-08-19T00:00:00.000Z"), shift: "day", workforceCount: 24, weather: "Clear", summary: "Authorized daily field report for integration verification." });
    await expect(caller.fieldReports.transitionStatus({ tenantId: tenantA, projectId: projectB, reportId: report.id, nextStatus: "submitted" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.fieldReports.transitionStatus({ tenantId: tenantA, projectId: projectA, reportId: report.id, nextStatus: "submitted" })).resolves.toMatchObject({ previousStatus: "draft", status: "submitted" });
    await expect(caller.fieldReports.transitionStatus({ tenantId: tenantA, projectId: projectA, reportId: report.id, nextStatus: "reviewed" })).resolves.toMatchObject({ previousStatus: "submitted", status: "reviewed" });
    await expect(caller.fieldReports.transitionStatus({ tenantId: tenantA, projectId: projectA, reportId: report.id, nextStatus: "approved" })).resolves.toMatchObject({ previousStatus: "reviewed", status: "approved" });
    const rejectedReport = await caller.fieldReports.create({ tenantId: tenantA, projectId: projectA, reportNumber: "FR-REJECTED", reportType: "inspection", reportedAt: new Date("2026-08-19T00:00:00.000Z"), shift: "night", workforceCount: 8, summary: "Field report that will exercise the rejection notification." });
    await expect(caller.fieldReports.transitionStatus({ tenantId: tenantA, projectId: projectA, reportId: rejectedReport.id, nextStatus: "submitted" })).resolves.toMatchObject({ status: "submitted" });
    await expect(caller.fieldReports.transitionStatus({ tenantId: tenantA, projectId: projectA, reportId: rejectedReport.id, nextStatus: "rejected" })).resolves.toMatchObject({ status: "rejected" });
    const reports = await caller.fieldReports.list({ tenantId: tenantA, projectId: projectA });
    expect(reports.find(item => item.id === report.id)).toMatchObject({ reportNumber: "FR-TRPC", workforceCount: 24, status: "approved" });
    expect(reports.find(item => item.id === rejectedReport.id)).toMatchObject({ reportNumber: "FR-REJECTED", status: "rejected" });
    const notifications = await caller.notifications.list({ tenantId: tenantA });
    expect(notifications).toEqual(expect.arrayContaining([expect.objectContaining({ notificationCode: "FIELD_REPORT_REVIEWED", entityId: report.id }), expect.objectContaining({ notificationCode: "FIELD_REPORT_REVIEWED", entityId: rejectedReport.id })]));
    const [rows] = await connection.query<{ approved: number; rejected: number; audits: number; notifications: number }[]>("SELECT (SELECT COUNT(*) FROM field_reports WHERE id = ? AND status = 'approved') AS approved, (SELECT COUNT(*) FROM field_reports WHERE id = ? AND status = 'rejected') AS rejected, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?) AND entityType = 'field_report') AS audits, (SELECT COUNT(*) FROM internal_notifications WHERE entityId IN (?, ?) AND notificationCode = 'FIELD_REPORT_REVIEWED' AND recipientUserId = ?) AS notifications", [report.id, rejectedReport.id, report.id, rejectedReport.id, report.id, rejectedReport.id, integrationUserId]);
    expect(rows[0]).toMatchObject({ approved: 1, rejected: 1, audits: 7, notifications: 2 });
  }, 12_000);

  it("rejects a cross-tenant quality inspection and governs its authorized acceptance lifecycle", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.qualityInspections.create({ tenantId: tenantA, projectId: projectB, inspectionNumber: "QI-BLOCKED", inspectionType: "hold_point", inspectedAt: new Date("2026-08-19T00:00:00.000Z"), outcome: "pass", summary: "Blocked cross-tenant quality inspection." })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const inspection = await caller.qualityInspections.create({ tenantId: tenantA, projectId: projectA, inspectionNumber: "QI-TRPC", inspectionType: "testing", inspectedAt: new Date("2026-08-19T00:00:00.000Z"), outcome: "conditional", summary: "Authorized quality inspection for concrete testing verification." });
    await expect(caller.qualityInspections.transitionStatus({ tenantId: tenantA, projectId: projectB, inspectionId: inspection.id, nextStatus: "submitted" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.qualityInspections.transitionStatus({ tenantId: tenantA, projectId: projectA, inspectionId: inspection.id, nextStatus: "submitted" })).resolves.toMatchObject({ previousStatus: "draft", status: "submitted" });
    await expect(caller.qualityInspections.transitionStatus({ tenantId: tenantA, projectId: projectA, inspectionId: inspection.id, nextStatus: "accepted" })).resolves.toMatchObject({ previousStatus: "submitted", status: "accepted" });
    const inspections = await caller.qualityInspections.list({ tenantId: tenantA, projectId: projectA });
    expect(inspections.find(item => item.id === inspection.id)).toMatchObject({ inspectionNumber: "QI-TRPC", inspectionType: "testing", outcome: "conditional", status: "accepted" });
    const [rows] = await connection.query<{ inspections: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM quality_inspections WHERE id = ? AND status = 'accepted') AS inspections, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND entityType = 'quality_inspection') AS audits", [inspection.id, inspection.id]);
    expect(rows[0]).toMatchObject({ inspections: 1, audits: 3 });
  }, 12_000);

  it("rejects cross-project procurement references and governs linked purchase-order receipt", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await connection.query("INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty, contractValue, currency, status) VALUES ('00000000-0000-4000-8000-0000000000e1', ?, ?, 'PO-CON-B', 'Foreign procurement contract', 'Foreign supplier', 100, 'USD', 'active')", [tenantB, projectB]);
    await connection.query("INSERT INTO commitments (id, tenantId, projectId, contractId, code, description, amount, currency, status) VALUES ('00000000-0000-4000-8000-0000000000e2', ?, ?, '00000000-0000-4000-8000-0000000000e1', 'PO-COM-B', 'Foreign procurement commitment', 100, 'USD', 'committed')", [tenantB, projectB]);
    await expect(caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectB, purchaseOrderNumber: "PO-BLOCKED", supplierName: "Blocked Supplier", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: 12500.5, currency: "USD", summary: "Blocked cross-tenant purchase order." })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectA, contractId: "00000000-0000-4000-8000-0000000000e1", purchaseOrderNumber: "PO-FOREIGN-CONTRACT", supplierName: "Blocked Supplier", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: 12500.5, currency: "USD", summary: "Blocked foreign-contract purchase order." })).rejects.toThrow("PROJECT_OS_PURCHASE_ORDER_REFERENCE_INVALID");
    await expect(caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectA, commitmentId: "00000000-0000-4000-8000-0000000000e2", purchaseOrderNumber: "PO-FOREIGN-COMMIT", supplierName: "Blocked Supplier", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: 12500.5, currency: "USD", summary: "Blocked foreign-commitment purchase order." })).rejects.toThrow("PROJECT_OS_PURCHASE_ORDER_REFERENCE_INVALID");
    const contract = await caller.contracts.create({ tenantId: tenantA, projectId: projectA, code: "PO-CON-TRPC", title: "Purchase-order contract", counterparty: "Concrete Supply Co", contractValue: 20000, currency: "USD" });
    const alternateContract = await caller.contracts.create({ tenantId: tenantA, projectId: projectA, code: "PO-ALT-TRPC", title: "Alternate contract", counterparty: "Alternate Supply Co", contractValue: 10000, currency: "USD" });
    const commitment = await caller.contracts.createCommitment({ tenantId: tenantA, projectId: projectA, contractId: contract.id, code: "PO-COM-TRPC", description: "Purchase-order commitment", amount: 12500.5, currency: "USD" });
    await expect(caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectA, contractId: alternateContract.id, commitmentId: commitment.id, purchaseOrderNumber: "PO-MISMATCH", supplierName: "Concrete Supply Co", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: 12500.5, currency: "USD", summary: "Blocked inconsistent contract and commitment purchase order." })).rejects.toThrow("PROJECT_OS_PURCHASE_ORDER_REFERENCE_INVALID");
    const purchaseOrder = await caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectA, contractId: contract.id, commitmentId: commitment.id, purchaseOrderNumber: "PO-TRPC", supplierName: "Concrete Supply Co", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: 12500.5, currency: "USD", summary: "Authorized purchase order for structural concrete materials." });
    await expect(caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectB, purchaseOrderId: purchaseOrder.id, nextStatus: "submitted" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "submitted" })).resolves.toMatchObject({ previousStatus: "draft", status: "submitted" });
    await expect(caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "approved" })).resolves.toMatchObject({ previousStatus: "submitted", status: "approved" });
    await expect(caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "issued" })).resolves.toMatchObject({ previousStatus: "approved", status: "issued" });
    await expect(caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "received" })).resolves.toMatchObject({ previousStatus: "issued", status: "received", receivedAt: expect.any(Date) });
    const purchaseOrders = await caller.purchaseOrders.list({ tenantId: tenantA, projectId: projectA });
    expect(purchaseOrders.find(item => item.id === purchaseOrder.id)).toMatchObject({ purchaseOrderNumber: "PO-TRPC", supplierName: "Concrete Supply Co", contractId: contract.id, commitmentId: commitment.id, amount: "12500.50", currency: "USD", status: "received", receivedAt: expect.any(Date) });
    const [rows] = await connection.query<{ purchaseOrders: number; audits: number; receipt: number }[]>("SELECT (SELECT COUNT(*) FROM purchase_orders WHERE id = ? AND status = 'received' AND contractId = ? AND commitmentId = ? AND receivedAt IS NOT NULL) AS purchaseOrders, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND entityType = 'purchase_order') AS audits, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND metadata LIKE '%receivedAt%') AS receipt", [purchaseOrder.id, contract.id, commitment.id, purchaseOrder.id, purchaseOrder.id]);
    expect(rows[0]).toMatchObject({ purchaseOrders: 1, audits: 5, receipt: 1 });
    await connection.query("DELETE FROM purchase_orders WHERE id = ?", [purchaseOrder.id]);
    await connection.query("DELETE FROM commitments WHERE id IN (?, '00000000-0000-4000-8000-0000000000e2')", [commitment.id]);
    await connection.query("DELETE FROM contracts WHERE id IN (?, ?, '00000000-0000-4000-8000-0000000000e1')", [contract.id, alternateContract.id]);
  }, 12_000);

  it("rejects foreign, self, and duplicate control links while recording authorized PMO relationships", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await connection.query("INSERT INTO risks (id, tenantId, projectId, code, title, probability, severity, status) VALUES ('00000000-0000-4000-8000-0000000000d1', ?, ?, 'LINK-FOR', 'Foreign link source', 3, 3, 'open')", [tenantB, projectB]);
    const risk = await caller.pmo.createRisk({ tenantId: tenantA, projectId: projectA, code: "LINK-RISK", title: "Linkable project risk", probability: 4, severity: 4 });
    const issue = await caller.pmo.createIssue({ tenantId: tenantA, projectId: projectA, code: "LINK-ISSUE", title: "Linkable project issue", priority: "high" });
    const action = await caller.pmo.createAction({ tenantId: tenantA, projectId: projectA, title: "Linkable mitigating action", priority: "high" });
    const decision = await caller.executive.createDecision({ tenantId: tenantA, projectId: projectA, problem: "Linkable decision problem", options: "Approve or defer", recommendation: "Approve" });
    await expect(caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "risk", sourceId: "00000000-0000-4000-8000-0000000000d1", targetType: "issue", targetId: issue.id })).rejects.toThrow("PROJECT_OS_CONTROL_LINK_REFERENCE_INVALID");
    await expect(caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "risk", sourceId: risk.id, targetType: "risk", targetId: risk.id })).rejects.toThrow("PROJECT_OS_CONTROL_LINK_SELF_REFERENCE");
    const firstLink = await caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "risk", sourceId: risk.id, targetType: "action", targetId: action.id });
    const secondLink = await caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "issue", sourceId: issue.id, targetType: "decision", targetId: decision.id });
    await expect(caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "risk", sourceId: risk.id, targetType: "action", targetId: action.id })).rejects.toThrow("PROJECT_OS_CONTROL_LINK_DUPLICATE");
    const links = await caller.controlLinks.list({ tenantId: tenantA, projectId: projectA });
    expect(links).toEqual(expect.arrayContaining([expect.objectContaining({ id: firstLink.id, sourceType: "risk", sourceId: risk.id, targetType: "action", targetId: action.id }), expect.objectContaining({ id: secondLink.id, sourceType: "issue", sourceId: issue.id, targetType: "decision", targetId: decision.id })]));
    const [rows] = await connection.query<{ links: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM control_record_links WHERE id IN (?, ?)) AS links, (SELECT COUNT(*) FROM audit_logs WHERE entityType = 'control_record_link' AND entityId IN (?, ?)) AS audits", [firstLink.id, secondLink.id, firstLink.id, secondLink.id]);
    expect(rows[0]).toMatchObject({ links: 2, audits: 2 });
    await connection.query("DELETE FROM control_record_links WHERE id IN (?, ?)", [firstLink.id, secondLink.id]);
    await connection.query("DELETE FROM risks WHERE id IN (?, '00000000-0000-4000-8000-0000000000d1')", [risk.id]);
    await connection.query("DELETE FROM issues WHERE id = ?", [issue.id]);
    await connection.query("DELETE FROM actions WHERE id = ?", [action.id]);
    await connection.query("DELETE FROM decisions WHERE id = ?", [decision.id]);
  }, 12_000);

  it("links a governed risk to authorized RFI and NCR targets with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const risk = await caller.pmo.createRisk({ tenantId: tenantA, projectId: projectA, code: "LINK-OPS-RISK", title: "Risk linked to operating controls", probability: 4, severity: 4 });
    const rfi = await caller.rfis.create({ tenantId: tenantA, projectId: projectA, rfiNumber: "LINK-OPS-RFI", subject: "Linked design clarification", question: "Please confirm the linked design control requirement." });
    const ncr = await caller.ncrs.create({ tenantId: tenantA, projectId: projectA, ncrNumber: "LINK-OPS-NCR", title: "Linked quality deviation", description: "This NCR is linked to the related project risk." });
    const rfiLink = await caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "risk", sourceId: risk.id, targetType: "rfi", targetId: rfi.id });
    const ncrLink = await caller.controlLinks.create({ tenantId: tenantA, projectId: projectA, sourceType: "risk", sourceId: risk.id, targetType: "ncr", targetId: ncr.id });
    const links = await caller.controlLinks.list({ tenantId: tenantA, projectId: projectA });
    expect(links).toEqual(expect.arrayContaining([expect.objectContaining({ id: rfiLink.id, targetType: "rfi", targetId: rfi.id }), expect.objectContaining({ id: ncrLink.id, targetType: "ncr", targetId: ncr.id })]));
    const [rows] = await connection.query<{ links: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM control_record_links WHERE id IN (?, ?)) AS links, (SELECT COUNT(*) FROM audit_logs WHERE entityType = 'control_record_link' AND entityId IN (?, ?)) AS audits", [rfiLink.id, ncrLink.id, rfiLink.id, ncrLink.id]);
    expect(rows[0]).toMatchObject({ links: 2, audits: 2 });
    await connection.query("DELETE FROM control_record_links WHERE id IN (?, ?)", [rfiLink.id, ncrLink.id]);
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?)", [risk.id, rfi.id, ncr.id]);
    await connection.query("DELETE FROM rfis WHERE id = ?", [rfi.id]);
    await connection.query("DELETE FROM ncrs WHERE id = ?", [ncr.id]);
    await connection.query("DELETE FROM risks WHERE id = ?", [risk.id]);
  }, 12_000);

  it("rejects cross-tenant EVM and health snapshot captures before writing snapshots", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const periodAt = new Date("2026-01-31T00:00:00.000Z");
    await expect(caller.controls.captureOperationalEvmSnapshot({ tenantId: tenantA, projectId: projectB, periodAt, eacMethod: "ac_plus_remaining" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectB, periodAt })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
  });

  it("captures authorized EVM and health snapshots with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const periodAt = new Date("2026-01-31T00:00:00.000Z");
    const wbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "WBS-EVM-OP", name: "Operational EVM work package", plannedValue: 200 });
    const activity = await caller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, code: "ACT-EVM-OP", name: "Operational EVM activity", plannedValue: 200, plannedStartAt: new Date("2026-01-01T00:00:00.000Z"), plannedFinishAt: periodAt });
    const progress = await caller.progress.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, percentComplete: 50, reportedAt: new Date("2026-01-15T00:00:00.000Z") });
    const budget = await caller.budgets.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, costCode: "BUD-EVM-OP", originalAmount: 350, currentAmount: 350 });
    const cost = await caller.costs.createActual({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, amount: 120, incurredAt: new Date("2026-01-20T00:00:00.000Z") });
    const risk = await caller.pmo.createRisk({ tenantId: tenantA, projectId: projectA, code: "RISK-HEALTH-OP", title: "Operational health risk", probability: 4, severity: 4 });
    const action = await caller.pmo.createAction({ tenantId: tenantA, projectId: projectA, title: "Operational health overdue action", priority: "high", dueAt: new Date("2020-01-01T00:00:00.000Z") });
    const rfi = await caller.rfis.create({ tenantId: tenantA, projectId: projectA, rfiNumber: "RFI-HEALTH-OP", subject: "Operational health RFI", question: "This overdue RFI proves the health source counter.", dueAt: new Date("2020-01-01T00:00:00.000Z") });
    const ncr = await caller.ncrs.create({ tenantId: tenantA, projectId: projectA, ncrNumber: "NCR-HEALTH-OP", title: "Operational health NCR", description: "This overdue NCR proves the health source counter.", dueAt: new Date("2020-01-01T00:00:00.000Z") });
    const hse = await caller.hse.create({ tenantId: tenantA, projectId: projectA, observationNumber: "HSE-HEALTH-OP", title: "Operational health HSE", description: "This overdue observation proves the health source counter.", category: "safety", severity: "high", dueAt: new Date("2020-01-01T00:00:00.000Z") });
    const evm = await caller.controls.captureOperationalEvmSnapshot({ tenantId: tenantA, projectId: projectA, periodAt, eacMethod: "ac_plus_remaining" });
    const health = await caller.controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectA, periodAt });
    expect(evm).toMatchObject({ pv: 200, ev: 100, ac: 120, bac: 350, sources: { scheduledActivities: 1, budgetLines: 1, postedActualCostEntries: 1, latestSubmittedProgressEntries: 1, wbsItemsWithProgress: 1 } });
    expect(health.sources).toMatchObject({ latestEvmFound: true, highRiskCount: 1, overdueActionCount: 1, overdueRfiCount: 1, overdueNcrCount: 1, overdueHseCount: 1 });
    const [rows] = await connection.query<{ evm: number; health: number; audits: number; pv: string; ev: string; ac: string; bac: string; sourceAudit: number; notifications: number }[]>("SELECT (SELECT COUNT(*) FROM evm_snapshots WHERE id = ?) AS evm, (SELECT COUNT(*) FROM project_health_snapshots WHERE id = ?) AS health, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?)) AS audits, (SELECT pv FROM evm_snapshots WHERE id = ?) AS pv, (SELECT ev FROM evm_snapshots WHERE id = ?) AS ev, (SELECT ac FROM evm_snapshots WHERE id = ?) AS ac, (SELECT bac FROM evm_snapshots WHERE id = ?) AS bac, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'evm.operational_snapshot_created' AND metadata LIKE '%operational_records%') AS sourceAudit, (SELECT COUNT(*) FROM internal_notifications WHERE entityId = ? AND notificationCode = 'PROJECT_HEALTH_EXCEPTION') AS notifications", [evm.id, health.id, evm.id, health.id, evm.id, evm.id, evm.id, evm.id, evm.id, health.id]);
    expect(rows[0]).toMatchObject({ evm: 1, health: 1, audits: 2, pv: "200.00", ev: "100.00", ac: "120.00", bac: "350.00", sourceAudit: 1, notifications: 1 });
    await connection.query("DELETE FROM internal_notifications WHERE entityId = ?", [health.id]); await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [evm.id, health.id, wbs.id, activity.id, progress.id, budget.id, cost.id, risk.id, action.id, rfi.id, ncr.id, hse.id]); await connection.query("DELETE FROM project_health_snapshots WHERE id = ?", [health.id]); await connection.query("DELETE FROM evm_snapshots WHERE id = ?", [evm.id]); await connection.query("DELETE FROM hse_observations WHERE id = ?", [hse.id]); await connection.query("DELETE FROM ncrs WHERE id = ?", [ncr.id]); await connection.query("DELETE FROM rfis WHERE id = ?", [rfi.id]); await connection.query("DELETE FROM actions WHERE id = ?", [action.id]); await connection.query("DELETE FROM risks WHERE id = ?", [risk.id]); await connection.query("DELETE FROM cost_entries WHERE id = ?", [cost.id]); await connection.query("DELETE FROM budget_lines WHERE id = ?", [budget.id]); await connection.query("DELETE FROM progress_entries WHERE id = ?", [progress.id]); await connection.query("DELETE FROM activities WHERE id = ?", [activity.id]); await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbs.id]);
  }, 12_000);

  it("rejects cross-tenant WBS creation and creates governed WBS activity and progress records with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.wbs.create({ tenantId: tenantA, projectId: projectB, code: "WBS-TRPC", name: "Cross tenant work package", plannedValue: 200 })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const wbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "WBS-TRPC", name: "Integration work package", plannedValue: 200 });
    const activity = await caller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, code: "ACT-TRPC", name: "Integration activity", plannedValue: 200, plannedStartAt: new Date("2026-01-01T00:00:00.000Z"), plannedFinishAt: new Date("2026-02-01T00:00:00.000Z") });
    const progress = await caller.progress.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, percentComplete: 50, reportedAt: new Date("2026-01-15T00:00:00.000Z") });
    const [rows] = await connection.query<{ wbs: number; activities: number; progress: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM wbs_items WHERE id = ?) AS wbs, (SELECT COUNT(*) FROM activities WHERE id = ?) AS activities, (SELECT COUNT(*) FROM progress_entries WHERE id = ?) AS progress, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?, ?)) AS audits", [wbs.id, activity.id, progress.id, wbs.id, activity.id, progress.id]);
    expect(rows[0]).toMatchObject({ wbs: 1, activities: 1, progress: 1, audits: 3 });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?)", [wbs.id, activity.id, progress.id]); await connection.query("DELETE FROM progress_entries WHERE id = ?", [progress.id]); await connection.query("DELETE FROM activities WHERE id = ?", [activity.id]); await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbs.id]);
  });

  it("rejects cross-tenant budget and cost writes and creates authorized financial records with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.budgets.create({ tenantId: tenantA, projectId: projectB, costCode: "FIN-TRPC", originalAmount: 300, currentAmount: 350 })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.costs.createActual({ tenantId: tenantA, projectId: projectB, amount: 120, incurredAt: new Date("2026-01-10T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const budget = await caller.budgets.create({ tenantId: tenantA, projectId: projectA, costCode: "FIN-TRPC", originalAmount: 300, currentAmount: 350 });
    const cost = await caller.costs.createActual({ tenantId: tenantA, projectId: projectA, amount: 120, incurredAt: new Date("2026-01-10T00:00:00.000Z") });
    const [rows] = await connection.query<{ budgets: number; costs: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM budget_lines WHERE id = ?) AS budgets, (SELECT COUNT(*) FROM cost_entries WHERE id = ?) AS costs, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?)) AS audits", [budget.id, cost.id, budget.id, cost.id]);
    expect(rows[0]).toMatchObject({ budgets: 1, costs: 1, audits: 2 });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?)", [budget.id, cost.id]); await connection.query("DELETE FROM cost_entries WHERE id = ?", [cost.id]); await connection.query("DELETE FROM budget_lines WHERE id = ?", [budget.id]);
  });

  it("rejects a WBS from a sibling project before budget cost or progress writes and allows the owned WBS", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType) VALUES (?, ?, 'int-portfolio-a', 'INT-C', 'Integration project C', 'test')", [projectC, tenantA]);
    const siblingWbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectC, code: "WBS-SIBLING", name: "Sibling project work package", plannedValue: 100 });
    await expect(caller.budgets.create({ tenantId: tenantA, projectId: projectA, wbsItemId: siblingWbs.id, costCode: "WBS-SCOPE-B", originalAmount: 100, currentAmount: 125 })).rejects.toThrow("PROJECT_OS_WBS_SCOPE_MISMATCH");
    await expect(caller.costs.createActual({ tenantId: tenantA, projectId: projectA, wbsItemId: siblingWbs.id, amount: 50, incurredAt: new Date("2026-01-11T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_WBS_SCOPE_MISMATCH");
    await expect(caller.progress.create({ tenantId: tenantA, projectId: projectA, wbsItemId: siblingWbs.id, percentComplete: 25, reportedAt: new Date("2026-01-11T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_WBS_SCOPE_MISMATCH");
    const ownedWbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "WBS-SCOPE-OWNED", name: "Owned scope work package", plannedValue: 100 }); const budget = await caller.budgets.create({ tenantId: tenantA, projectId: projectA, wbsItemId: ownedWbs.id, costCode: "WBS-SCOPE-A", originalAmount: 100, currentAmount: 125 }); const cost = await caller.costs.createActual({ tenantId: tenantA, projectId: projectA, wbsItemId: ownedWbs.id, amount: 50, incurredAt: new Date("2026-01-11T00:00:00.000Z") }); const progress = await caller.progress.create({ tenantId: tenantA, projectId: projectA, wbsItemId: ownedWbs.id, percentComplete: 25, reportedAt: new Date("2026-01-11T00:00:00.000Z") });
    const [rows] = await connection.query<{ budget: number; cost: number; progress: number; forbiddenWrites: number }[]>("SELECT (SELECT COUNT(*) FROM budget_lines WHERE id = ?) AS budget, (SELECT COUNT(*) FROM cost_entries WHERE id = ?) AS cost, (SELECT COUNT(*) FROM progress_entries WHERE id = ?) AS progress, (SELECT COUNT(*) FROM budget_lines WHERE wbsItemId = ?) + (SELECT COUNT(*) FROM cost_entries WHERE wbsItemId = ?) + (SELECT COUNT(*) FROM progress_entries WHERE wbsItemId = ?) AS forbiddenWrites", [budget.id, cost.id, progress.id, siblingWbs.id, siblingWbs.id, siblingWbs.id]);
    expect(rows[0]).toMatchObject({ budget: 1, cost: 1, progress: 1, forbiddenWrites: 0 });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?, ?, ?)", [siblingWbs.id, ownedWbs.id, budget.id, cost.id, progress.id]); await connection.query("DELETE FROM progress_entries WHERE id = ?", [progress.id]); await connection.query("DELETE FROM cost_entries WHERE id = ?", [cost.id]); await connection.query("DELETE FROM budget_lines WHERE id = ?", [budget.id]); await connection.query("DELETE FROM wbs_items WHERE id IN (?, ?)", [siblingWbs.id, ownedWbs.id]); await connection.query("DELETE FROM projects WHERE id = ?", [projectC]);
  }, 12_000);

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

  it("rejects cross-tenant PMO risk and action writes and creates authorized records with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.pmo.createRisk({ tenantId: tenantA, projectId: projectB, code: "RISK-TRPC", title: "Cross tenant risk", probability: 3, severity: 4 })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.pmo.createAction({ tenantId: tenantA, projectId: projectB, title: "Cross tenant action", priority: "high" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const risk = await caller.pmo.createRisk({ tenantId: tenantA, projectId: projectA, code: "RISK-TRPC", title: "Authorized integration risk", probability: 3, severity: 4 });
    const action = await caller.pmo.createAction({ tenantId: tenantA, projectId: projectA, title: "Authorized integration action", priority: "high" });
    const [rows] = await connection.query<{ risks: number; actions: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM risks WHERE id = ?) AS risks, (SELECT COUNT(*) FROM actions WHERE id = ?) AS actions, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?)) AS audits", [risk.id, action.id, risk.id, action.id]);
    expect(rows[0]).toMatchObject({ risks: 1, actions: 1, audits: 2 });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?)", [risk.id, action.id]); await connection.query("DELETE FROM actions WHERE id = ?", [action.id]); await connection.query("DELETE FROM risks WHERE id = ?", [risk.id]);
  });

  it("rejects cross-tenant PMO escalations and governs eligible issue and action transitions with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const issue = await caller.pmo.createIssue({ tenantId: tenantA, projectId: projectA, code: "ISSUE-ESC-TRPC", title: "Critical integration escalation", priority: "critical" });
    const action = await caller.pmo.createAction({ tenantId: tenantA, projectId: projectA, title: "Overdue integration escalation", priority: "high", dueAt: new Date("2020-01-01T00:00:00.000Z") });
    await expect(caller.pmo.transitionIssueEscalation({ tenantId: tenantA, projectId: projectB, issueId: issue.id, nextStatus: "pending" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.pmo.transitionActionEscalation({ tenantId: tenantA, projectId: projectB, actionId: action.id, nextStatus: "pending" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await caller.pmo.transitionIssueEscalation({ tenantId: tenantA, projectId: projectA, issueId: issue.id, nextStatus: "pending" }); await caller.pmo.transitionIssueEscalation({ tenantId: tenantA, projectId: projectA, issueId: issue.id, nextStatus: "escalated" });
    await caller.pmo.transitionActionEscalation({ tenantId: tenantA, projectId: projectA, actionId: action.id, nextStatus: "pending" }); await caller.pmo.transitionActionEscalation({ tenantId: tenantA, projectId: projectA, actionId: action.id, nextStatus: "escalated" });
    const [rows] = await connection.query<{ issueStatus: string; actionStatus: string; audits: number }[]>("SELECT (SELECT escalationStatus FROM issues WHERE id = ?) AS issueStatus, (SELECT escalationStatus FROM actions WHERE id = ?) AS actionStatus, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?)) AS audits", [issue.id, action.id, issue.id, action.id]);
    expect(rows[0]).toMatchObject({ issueStatus: "escalated", actionStatus: "escalated", audits: 6 });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?)", [issue.id, action.id]); await connection.query("DELETE FROM actions WHERE id = ?", [action.id]); await connection.query("DELETE FROM issues WHERE id = ?", [issue.id]);
  });

  it("rejects a cross-tenant contract and creates an authorized contract with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.contracts.create({ tenantId: tenantA, projectId: projectB, code: "CONTRACT-TRPC", title: "Cross tenant contract", counterparty: "Integration Contractor", contractValue: 100, currency: "USD" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const contract = await caller.contracts.create({ tenantId: tenantA, projectId: projectA, code: "CONTRACT-TRPC", title: "Authorized contract", counterparty: "Integration Contractor", contractValue: 100, currency: "USD" });
    const [rows] = await connection.query<{ contracts: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM contracts WHERE id = ?) AS contracts, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [contract.id, contract.id]);
    expect(rows[0]).toMatchObject({ contracts: 1, audits: 1 });
  });

  it("rejects a cross-tenant commitment and creates an authorized commitment with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const commitment = { code: "COMMIT-TRPC", description: "Authorized integration commitment", amount: 75, currency: "USD" };
    await expect(caller.contracts.createCommitment({ tenantId: tenantA, projectId: projectB, ...commitment })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const created = await caller.contracts.createCommitment({ tenantId: tenantA, projectId: projectA, ...commitment });
    const [rows] = await connection.query<{ commitments: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM commitments WHERE id = ?) AS commitments, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [created.id, created.id]);
    expect(rows[0]).toMatchObject({ commitments: 1, audits: 1 });
    await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [created.id]); await connection.query("DELETE FROM commitments WHERE id = ?", [created.id]);
  });

  it("rejects a cross-tenant executive decision and creates an authorized decision with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const decision = { problem: "Approve tested delivery option", options: "Option A with governance controls", recommendation: "Approve option A after review" };
    await expect(caller.executive.createDecision({ tenantId: tenantA, projectId: projectB, ...decision })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const created = await caller.executive.createDecision({ tenantId: tenantA, projectId: projectA, ...decision });
    const [rows] = await connection.query<{ decisions: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM decisions WHERE id = ?) AS decisions, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [created.id, created.id]);
    expect(rows[0]).toMatchObject({ decisions: 1, audits: 1 });
    await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [created.id]); await connection.query("DELETE FROM decisions WHERE id = ?", [created.id]);
  });

  it("rejects a cross-tenant portfolio link and creates governed portfolio-program-project links with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.pmo.linkProject({ tenantId: tenantA, projectId: projectA, portfolioId: projectB })).rejects.toThrow("PROJECT_OS_PORTFOLIO_NOT_FOUND");
    const portfolio = await caller.pmo.createPortfolio({ tenantId: tenantA, code: "TRPC-PORT", name: "Integration governed portfolio" });
    const program = await caller.pmo.createProgram({ tenantId: tenantA, portfolioId: portfolio.id, code: "TRPC-PROG", name: "Integration governed program" });
    await expect(caller.pmo.linkProject({ tenantId: tenantA, projectId: projectA, portfolioId: portfolio.id, programId: program.id })).resolves.toMatchObject({ projectId: projectA, portfolioId: portfolio.id, programId: program.id });
    const [rows] = await connection.query<{ programs: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM programs WHERE id = ?) AS programs, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?, ?)) AS audits", [program.id, portfolio.id, program.id, projectA]);
    expect(rows[0]).toMatchObject({ programs: 1, audits: 3 });
    await connection.query("UPDATE projects SET portfolioId = 'int-portfolio-a', programId = NULL WHERE id = ?", [projectA]); await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?)", [portfolio.id, program.id, projectA]); await connection.query("DELETE FROM programs WHERE id = ?", [program.id]); await connection.query("DELETE FROM portfolios WHERE id = ?", [portfolio.id]);
  });

  it("returns executive cash flow only from the authorized tenant and excludes void or cancelled sources", async () => {
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, costCode, originalAmount, currentAmount) VALUES ('int-budget-a', ?, ?, 'INT-A', 1000, 1000), ('int-budget-b', ?, ?, 'INT-B', 9000, 9000)", [tenantA, projectA, tenantB, projectB]);
    await connection.query("INSERT INTO cost_entries (id, tenantId, projectId, amount, entryType, status, incurredAt) VALUES ('int-cost-a', ?, ?, 300, 'actual', 'posted', NOW()), ('int-cost-a-void', ?, ?, 10, 'actual', 'void', NOW()), ('int-cost-b', ?, ?, 9000, 'actual', 'posted', NOW())", [tenantA, projectA, tenantA, projectA, tenantB, projectB]);
    await connection.query("INSERT INTO commitments (id, tenantId, projectId, code, description, amount, currency, status) VALUES ('int-commitment-a', ?, ?, 'INT-COM-A', 'Authorized commitment', 250, 'USD', 'committed'), ('int-commitment-a-cancelled', ?, ?, 'INT-COM-C', 'Cancelled commitment', 100, 'USD', 'cancelled'), ('int-commitment-b', ?, ?, 'INT-COM-B', 'Cross tenant commitment', 9000, 'USD', 'committed')", [tenantA, projectA, tenantA, projectA, tenantB, projectB]);
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const dashboard = await appRouter.createCaller(context).dashboards.executive({ tenantId: tenantA });
    expect(dashboard.cashFlow).toEqual({ plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 });
    expect(dashboard.cashFlowByProject).toEqual([expect.objectContaining({ id: projectA, totalExposure: 550, remainingBudget: 450 })]);
    expect(dashboard.cashFlowByPortfolio).toEqual([expect.objectContaining({ portfolioId: "int-portfolio-a", code: "INT-PORT-A", totalExposure: 550, remainingBudget: 450, projectCount: 1 })]);
  });

  it("rejects a cross-tenant resource update and updates an authorized allocation with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const resource = { resourceCode: "RESOURCE-TRPC", name: "Integration crew", resourceType: "labor" as const, plannedUnits: 10, allocatedUnits: 5, unitCost: 100, currency: "USD" };
    await expect(caller.resources.create({ tenantId: tenantA, projectId: projectB, ...resource })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const created = await caller.resources.create({ tenantId: tenantA, projectId: projectA, ...resource });
    await expect(caller.resources.updateAllocation({ tenantId: tenantA, projectId: projectB, resourceId: created.id, allocatedUnits: 8 })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.resources.updateAllocation({ tenantId: tenantA, projectId: projectA, resourceId: created.id, allocatedUnits: 8 })).resolves.toMatchObject({ previousAllocatedUnits: 5, allocatedUnits: 8 });
    const [rows] = await connection.query<{ resources: number; allocated: string; audits: number }[]>("SELECT (SELECT COUNT(*) FROM project_resources WHERE id = ?) AS resources, (SELECT allocatedUnits FROM project_resources WHERE id = ?) AS allocated, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [created.id, created.id, created.id]);
    expect(rows[0]).toMatchObject({ resources: 1, allocated: "8.00", audits: 2 });
  });

  it("rejects a cross-tenant claim and approves an authorized claim with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const claim = { claimNumber: "CLAIM-TRPC", title: "Integration claim", description: "Claim must follow the governed project workflow.", claimedAmount: 100, currency: "USD" };
    await expect(caller.claims.create({ tenantId: tenantA, projectId: projectB, ...claim })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const created = await caller.claims.create({ tenantId: tenantA, projectId: projectA, ...claim });
    await caller.claims.transitionStatus({ tenantId: tenantA, projectId: projectA, claimId: created.id, nextStatus: "submitted" });
    await caller.claims.transitionStatus({ tenantId: tenantA, projectId: projectA, claimId: created.id, nextStatus: "under_review" });
    await expect(caller.claims.transitionStatus({ tenantId: tenantA, projectId: projectA, claimId: created.id, nextStatus: "approved", approvedAmount: 80 })).resolves.toMatchObject({ status: "approved" });
    const [rows] = await connection.query<{ status: string; approved: string; audits: number }[]>("SELECT (SELECT status FROM claims WHERE id = ?) AS status, (SELECT approvedAmount FROM claims WHERE id = ?) AS approved, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [created.id, created.id, created.id]);
    expect(rows[0]).toMatchObject({ status: "approved", approved: "80.00", audits: 4 });
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

  it("lists and acknowledges an internal notification for its recipient with audit evidence", async () => {
    await connection.query("DELETE FROM internal_notifications WHERE id = ?", [notificationA]);
    await connection.query("INSERT INTO internal_notifications (id, tenantId, recipientUserId, notificationCode, payload) VALUES (?, ?, ?, 'PROJECT_HEALTH_EXCEPTION', '{}')", [notificationA, tenantA, integrationUserId]);
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.notifications.list({ tenantId: tenantA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: notificationA })]));
    await expect(caller.notifications.acknowledge({ tenantId: tenantA, notificationId: notificationA })).resolves.toMatchObject({ id: notificationA });
    const [rows] = await connection.query<{ acknowledged: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM internal_notifications WHERE id = ? AND acknowledgedAt IS NOT NULL) AS acknowledged, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ?) AS audits", [notificationA, notificationA]);
    expect(rows[0]).toMatchObject({ acknowledged: 1, audits: 1 });
    await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [notificationA]);
    await connection.query("DELETE FROM internal_notifications WHERE id = ?", [notificationA]);
  });
});
