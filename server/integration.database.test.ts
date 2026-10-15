import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { evaluateTenantLicenseLifecycle } from "./db";
import { calculateOperationalEvm } from "./domain/operationalEvm";
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));

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
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });
let integrationUserId = 0;
let unassignedUserId = 0;
let financeUserId = 0;
let accountantUserId = 0;

async function readExcelRows(bytes: Buffer, sheetName: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`Worksheet ${sheetName} is absent`);
  const headers = (worksheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(value => String(value ?? ""));
  const rows = worksheet.getRows(2, Math.max(worksheet.rowCount - 1, 0)) ?? [];
  return { sheetNames: workbook.worksheets.map(sheet => sheet.name), rows: rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row.getCell(index + 1).value ?? ""]))) };
}

async function cleanupPmcFixture() {
  for (const table of ["pmc_inspection_steps", "pmc_inspection_requests", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_baselines", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "pmc_verification_statuses"]) {
    await connection?.query(`DELETE FROM \`${table}\` WHERE tenantId IN (?, ?)`, [tenantA, tenantB]);
  }
}

describe.skipIf(!isIntegrationUrl(process.env.TEST_DATABASE_URL))("integration database isolation", () => {
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!isIntegrationUrl(url)) return;
    if (!url) throw new Error("TEST_DATABASE_URL is required for integration tests");
    connection = await mysql.createConnection(url);
    await cleanupPmcFixture();
    await connection.query("DELETE FROM control_record_links WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM support_messages WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM support_tickets WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM knowledge_articles WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM risks WHERE code IN ('LINK-RISK', 'LINK-FOR')");
    await connection.query("DELETE FROM issues WHERE code = 'LINK-ISSUE'");
    await connection.query("DELETE FROM actions WHERE title = 'Linkable mitigating action'");
    await connection.query("DELETE FROM decisions WHERE problem = 'Linkable decision problem'");
    await connection.query("DELETE FROM risks WHERE code = 'LINK-OPS-RISK'");
    await connection.query("DELETE FROM rfis WHERE rfiNumber = 'LINK-OPS-RFI'");
    await connection.query("DELETE FROM ncrs WHERE ncrNumber = 'LINK-OPS-NCR'");
    await connection.query("DELETE FROM goods_receipt_notes WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM purchase_orders WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM cost_entries WHERE id IN (SELECT costEntryId FROM material_issues WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection.query("DELETE FROM material_issues WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ? AND action IN ('warehouse.inventory_recorded','warehouse.material_issued_to_work')", [tenantA]);
    await connection.query("DELETE FROM warehouse_inventory_transactions WHERE referenceNumber = 'MAT-ISSUE-TRPC'", []);
    await connection.query("DELETE c FROM cost_entries c INNER JOIN wbs_items w ON w.id = c.wbsItemId WHERE w.projectId = ? AND w.code = 'WBS-MAT-ISSUE-TRPC'", [projectA]);
    await connection.query("DELETE FROM activities WHERE projectId = ? AND code = 'ACT-MAT-ISSUE-TRPC'", [projectA]);
    await connection.query("DELETE FROM wbs_items WHERE projectId = ? AND code = 'WBS-MAT-ISSUE-TRPC'", [projectA]);
    await connection.query("DELETE FROM project_warehouses WHERE projectId = ? AND code = 'WH-TRPC'", [projectA]);
    await connection.query("DELETE FROM material_masters WHERE tenantId = ? AND code = 'MAT-WH-TRPC'", [tenantA]);
    await connection.query("DELETE FROM warehouse_inventory_transactions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM project_warehouses WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM project_material_overrides WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM procurement_requisitions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM suppliers WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM material_masters WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM quality_inspections WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM field_reports WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM employee_performance_objections WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM employee_performance_exclusions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM control_record_links WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
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
    await connection.query("DELETE FROM employee_time_entries WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM employee_attendance WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM employee_assignments WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM payroll_allocations WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM payroll_entries WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM payroll_runs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM salary_structures WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM employment_contracts WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM employees WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM change_requests WHERE changeNumber = 'CHANGE-TRPC'");
    await connection.query("DELETE FROM claims WHERE claimNumber = 'CLAIM-TRPC'");
    await connection.query("DELETE FROM master_plan_visualization_rules WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM master_plan_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM master_plan_spatial_entities WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM master_plan_versions WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM master_plans WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM progress_entries WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM cost_entries WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM budget_lines WHERE projectId IN (?, ?)", [projectA, projectB]);
    await connection.query("DELETE FROM evm_wbs_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]);
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
    await connection.query("DELETE FROM project_resources WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM control_record_links WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM purchase_orders WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM commitments WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM contracts WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM field_reports WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM quality_inspections WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM hse_observations WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM ncrs WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM rfis WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM actions WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM decisions WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM issues WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM risks WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM membership_roles WHERE id IN ('int-membership-role-a','int-membership-role-pmo','int-membership-role-exec','int-membership-role-b')");
    await connection.query("DELETE FROM role_permissions WHERE roleId IN ('int-role-a','int-role-pmo','int-role-exec','int-role-b')");
    await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM memberships WHERE id IN ('int-membership-a','int-membership-b')");
    await connection.query("DELETE FROM roles WHERE id IN ('int-role-a','int-role-pmo','int-role-exec','int-role-b')");
    await connection.query("DELETE FROM role_permissions WHERE permissionId IN ('int-perm-write','int-perm-read','int-perm-pmo','int-perm-exec','int-perm-exec-manage','int-perm-hr-manage','int-perm-hr-sensitive','int-perm-payroll-structure','int-perm-payroll-run','int-perm-payroll-sensitive','int-perm-payroll-approve')");
    await connection.query("DELETE FROM permissions WHERE id IN ('int-perm-write','int-perm-read','int-perm-pmo','int-perm-exec','int-perm-exec-manage','int-perm-hr-manage','int-perm-hr-sensitive','int-perm-payroll-structure','int-perm-payroll-run','int-perm-payroll-sensitive','int-perm-payroll-approve')");
    await connection.query("DELETE FROM audit_logs WHERE actorUserId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user'))");
    await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE userId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user')))");
    await connection.query("DELETE FROM memberships WHERE userId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user'))");
    await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE createdByUserId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user')))");
    await connection.query("DELETE FROM tenant_licenses WHERE createdByUserId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user'))");
    await connection.query("DELETE FROM change_requests WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM project_resources WHERE projectId IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM projects WHERE id IN (?, ?, ?)", [projectA, projectB, projectC]);
    await connection.query("DELETE FROM programs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM portfolios WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]);
    await connection.query("DELETE FROM membership_roles WHERE id = 'int-membership-role-b'");
    await connection.query("DELETE FROM role_permissions WHERE roleId = 'int-role-b'");
    await connection.query("DELETE FROM memberships WHERE id = 'int-membership-b'");
    await connection.query("DELETE FROM roles WHERE id = 'int-role-b'");
    await connection.query("DELETE FROM users WHERE openId = 'integration-test-user'");
    await connection.query("DELETE FROM users WHERE openId IN ('integration-unassigned-user','integration-finance-user','integration-accountant-user')");
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('integration-test-user', 'Integration Test User', 'integration@test.local', 'admin')");
    await connection.query("INSERT INTO users (openId, name, email) VALUES ('integration-unassigned-user', 'Unassigned Test User', 'unassigned@test.local')");
    await connection.query("INSERT INTO users (openId, name, email) VALUES ('integration-finance-user', 'Integration Finance User', 'finance@test.local')");
    await connection.query("INSERT INTO users (openId, name, email) VALUES ('integration-accountant-user', 'Integration Accountant User', 'accountant@test.local')");
    const [[user]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-test-user' LIMIT 1");
    integrationUserId = user.id;
    const [[unassigned]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-unassigned-user' LIMIT 1");
    unassignedUserId = unassigned.id;
    const [[finance]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-finance-user' LIMIT 1");
    financeUserId = finance.id;
    const [[accountant]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'integration-accountant-user' LIMIT 1");
    accountantUserId = accountant.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Integration A', 'integration-a'), (?, 'Integration B', 'integration-b')", [tenantA, tenantB]);
    await connection.query("INSERT INTO portfolios (id, tenantId, code, name) VALUES ('int-portfolio-a', ?, 'INT-PORT-A', 'Integration portfolio A'), ('int-portfolio-b', ?, 'INT-PORT-B', 'Integration portfolio B')", [tenantA, tenantB]);
    await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType) VALUES (?, ?, 'int-portfolio-a', 'INT-A', 'Integration project A', 'test'), (?, ?, 'int-portfolio-b', 'INT-B', 'Integration project B', 'test')", [projectA, tenantA, projectB, tenantB]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('int-sub-a', ?, 'PROJECT', 'active', NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-a', ?, 'int-sub-a', 'PROJECT', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-pmo', ?, 'int-sub-a', 'PMO', true, NOW())", [tenantA]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('int-ent-exec', ?, 'int-sub-a', 'EXECUTIVE', true, NOW())", [tenantA]);
    await connection.query("DELETE FROM role_permissions WHERE permissionId IN (SELECT id FROM permissions WHERE code IN ('project.write','project.read','pmo.write','executive.read','tenant.manage'))");
    await connection.query("DELETE FROM permissions WHERE code IN ('project.write','project.read','pmo.write','executive.read','tenant.manage')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-write', 'project.write', 'Integration project write', 'PROJECT')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-read', 'project.read', 'Integration project read', 'PROJECT')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-pmo', 'pmo.write', 'Integration PMO write', 'PMO')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-exec', 'executive.read', 'Integration executive read', 'EXECUTIVE')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-exec-manage', 'tenant.manage', 'Integration executive tenant management', 'EXECUTIVE')");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-hr-manage', 'project.hr.manage', 'Integration HR management', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-hr-sensitive', 'project.hr.sensitive.read', 'Integration HR protected identity', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-project-manage', 'project.manage', 'Integration project management', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-attendance-manage', 'project.attendance.manage', 'Integration attendance management', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-performance-read-own', 'project.performance.read_own', 'Integration own performance reading', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-performance-manage', 'project.performance.manage', 'Integration performance management', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-payroll-structure', 'project.payroll.structure', 'Integration payroll structure', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-payroll-run', 'project.payroll.run', 'Integration payroll run', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-payroll-sensitive', 'project.payroll.sensitive.read', 'Integration protected payroll reading', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES ('int-perm-payroll-approve', 'project.payroll.approve', 'Integration payroll approval', 'PROJECT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-a', ?, 'INT_PROJECT_WRITE', 'Integration Project Writer', 'PROJECT')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-pmo', ?, 'INT_PMO_WRITE', 'Integration PMO Writer', 'PMO')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-exec', ?, 'INT_EXEC_READ', 'Integration Executive Reader', 'EXECUTIVE')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-finance', ?, 'INT_PAYROLL_FINANCE', 'Integration Payroll Finance', 'PROJECT')", [tenantA]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-accountant', ?, 'INT_PAYROLL_ACCOUNTANT', 'Integration Payroll Accountant', 'PROJECT')", [tenantA]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('int-membership-a', ?, ?, 'active')", [tenantA, integrationUserId]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-a', 'int-perm-write')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-a', 'int-perm-read')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.hr.manage'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.hr.sensitive.read'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.manage'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.attendance.manage'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.performance.read_own'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.performance.manage'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.payroll.structure'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-a', id FROM permissions WHERE code = 'project.payroll.sensitive.read'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-finance', id FROM permissions WHERE code = 'project.payroll.approve'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-finance', id FROM permissions WHERE code = 'project.payroll.sensitive.read'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'int-role-accountant', id FROM permissions WHERE code = 'project.payroll.run'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-pmo', 'int-perm-pmo')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-exec', 'int-perm-exec')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-exec', 'int-perm-exec-manage')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-a', 'int-membership-a', 'int-role-a', 'company')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-pmo', 'int-membership-a', 'int-role-pmo', 'company')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-exec', 'int-membership-a', 'int-role-exec', 'company')");
  }, 180_000);

  afterEach(async () => {
    await connection?.query("DELETE FROM audit_logs WHERE entityId IN (SELECT id FROM data_imports WHERE tenantId = ? AND moduleCode = 'schedule')", [tenantA]);
    await connection?.query("DELETE FROM data_import_row_results WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ? AND moduleCode = 'schedule')", [tenantA]);
    await connection?.query("DELETE FROM data_import_errors WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ? AND moduleCode = 'schedule')", [tenantA]);
    await connection?.query("DELETE FROM data_imports WHERE tenantId = ? AND moduleCode = 'schedule'", [tenantA]);
    await connection?.query("DELETE FROM activities WHERE tenantId = ? AND projectId = ? AND code = 'ACT-SCHEDULE-TRPC'", [tenantA, projectA]);
    await connection?.query("DELETE FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-SCHEDULE-TRPC'", [tenantA, projectA]);
    await connection?.query("DELETE FROM control_record_links WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection?.query("DELETE FROM actions WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection?.query("DELETE FROM membership_roles WHERE membershipId IN ('int-membership-finance', 'int-membership-accountant')"); await connection?.query("DELETE FROM memberships WHERE id IN ('int-membership-finance', 'int-membership-accountant')");
  });

  afterAll(async () => {
    await cleanupPmcFixture();
    await connection?.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM project_material_overrides WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM material_masters WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM control_record_links WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM data_import_row_results WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]);
    await connection?.query("DELETE FROM data_import_errors WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]);
    await connection?.query("DELETE FROM data_imports WHERE tenantId = ?", [tenantA]);
    await connection?.query("DELETE FROM master_plan_visualization_rules WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM master_plan_snapshots WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM master_plan_spatial_entities WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM master_plan_versions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM master_plans WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM document_versions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM project_documents WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM warehouse_inventory_transactions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM _deprecated_warehouse_stock_balances WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM project_warehouses WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM procurement_requisitions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM suppliers WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM payroll_allocations WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM payroll_entries WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM payroll_runs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM salary_structures WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM employee_performance_objections WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM employee_performance_exclusions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM employee_time_entries WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM employee_attendance WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM employee_assignments WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    for (const table of ["progress_entries", "cost_entries", "budget_lines", "evm_wbs_snapshots", "evm_snapshots", "project_health_snapshots", "internal_notifications", "purchase_orders", "commitments", "contracts", "field_reports", "quality_inspections", "hse_observations", "ncrs", "rfis", "change_requests", "claims", "project_resources", "activities", "wbs_items", "actions", "decisions", "issues", "risks"]) await connection?.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, [tenantA, tenantB]);
    await connection?.query("DELETE FROM employment_contracts WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM employees WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection?.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection?.query("DELETE FROM roles WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM membership_roles WHERE id IN ('int-membership-role-a','int-membership-role-pmo','int-membership-role-exec','int-membership-role-b')");
    await connection?.query("DELETE FROM role_permissions WHERE roleId IN ('int-role-a','int-role-pmo','int-role-exec','int-role-b')");
    await connection?.query("DELETE FROM memberships WHERE id IN ('int-membership-a','int-membership-b')");
    await connection?.query("DELETE FROM roles WHERE id IN ('int-role-a','int-role-pmo','int-role-exec','int-role-b')");
    await connection?.query("DELETE FROM role_permissions WHERE permissionId IN ('int-perm-write','int-perm-read','int-perm-pmo','int-perm-exec','int-perm-exec-manage','int-perm-hr-manage','int-perm-hr-sensitive','int-perm-payroll-structure','int-perm-payroll-sensitive','int-perm-performance-read-own','int-perm-performance-manage')");
    await connection?.query("DELETE FROM permissions WHERE id IN ('int-perm-write','int-perm-read','int-perm-pmo','int-perm-exec','int-perm-exec-manage','int-perm-hr-manage','int-perm-hr-sensitive','int-perm-payroll-structure','int-perm-payroll-sensitive','int-perm-performance-read-own','int-perm-performance-manage')");
    await connection?.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId IN (?, ?))", [tenantA, tenantB]);
    await connection?.query("DELETE FROM tenant_licenses WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM audit_logs WHERE actorUserId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user'))");
    await connection?.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE userId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user')))");
    await connection?.query("DELETE FROM memberships WHERE userId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user'))");
    await connection?.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE createdByUserId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user')))");
    await connection?.query("DELETE FROM tenant_licenses WHERE createdByUserId IN (SELECT id FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user'))");
    await connection?.query("DELETE FROM projects WHERE id IN (?, ?)", [projectA, projectB]);
    await connection?.query("DELETE FROM programs WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM portfolios WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]);
    await connection?.query("DELETE FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user','integration-finance-user','integration-accountant-user')");
    await connection?.end();
  });

  it("applies migration 0042 once to an isolated requisition-table copy", async () => {
    const migration = await readFile(`${process.cwd()}/drizzle/0042_late_hawkeye.sql`, "utf8");
    const statements = migration.split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean);
    expect(statements).toHaveLength(6);
    expect(statements.filter(statement => statement.includes("ADD `purchaseOrderId`"))).toHaveLength(1);
    const probeTable = "procurement_requisitions_0042_probe";
    await connection.query(`DROP TABLE IF EXISTS \`${probeTable}\``);
    try {
      await connection.query(`CREATE TABLE \`${probeTable}\` (\`id\` varchar(36) NOT NULL, PRIMARY KEY (\`id\`))`);
      for (const statement of statements) {
        const isolatedStatement = statement.replaceAll("`procurement_requisitions`", `\`${probeTable}\``).replace("`prq_purchase_order_fk`", "`prq42_purchase_order_fk`").replace("`prq_po_linker_fk`", "`prq42_po_linker_fk`").replace("`procurement_requisitions_purchase_order_idx`", "`prq42_purchase_order_idx`");
        await connection.query(isolatedStatement);
      }
      const [columns] = await connection.query<{ Field: string }[]>(`SHOW COLUMNS FROM \`${probeTable}\``);
      const [indexes] = await connection.query<{ Key_name: string }[]>(`SHOW INDEX FROM \`${probeTable}\``);
      expect(columns.map(column => column.Field)).toEqual(expect.arrayContaining(["purchaseOrderId", "purchaseOrderLinkedAt", "purchaseOrderLinkedByUserId"]));
      expect(indexes.map(index => index.Key_name)).toContain("prq42_purchase_order_idx");
    } finally {
      await connection.query(`DROP TABLE IF EXISTS \`${probeTable}\``);
    }
  }, 120_000);

  it("connects exclusively to the dedicated PROJECT OS integration database", async () => {
    const [rows] = await connection.query<{ database_name: string; table_count: number }[]>("SELECT DATABASE() AS database_name, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()");
    expect(rows[0]).toMatchObject({ database_name: "project_os_integration_test" });
    expect(Number(rows[0].table_count)).toBeGreaterThanOrEqual(32);
  });

  it("isolates PMC summary reads by tenant and project across all 12 tables", async () => {
    const ids = {
      zoneA: "00000000-0000-4000-8000-00000000c001",
      blockA: "00000000-0000-4000-8000-00000000c002",
      unitA: "00000000-0000-4000-8000-00000000c003",
      groupA: "00000000-0000-4000-8000-00000000c004",
      stageA: "00000000-0000-4000-8000-00000000c005",
      activityA: "00000000-0000-4000-8000-00000000c006",
      progressA: "00000000-0000-4000-8000-00000000c007",
      historyA: "00000000-0000-4000-8000-00000000c008",
      verificationA: "00000000-0000-4000-8000-00000000c009",
      inspectionA: "00000000-0000-4000-8000-00000000c00a",
      stepA: "00000000-0000-4000-8000-00000000c00b",
      baselineA: "00000000-0000-4000-8000-00000000c00c",
      zoneB: "00000000-0000-4000-8000-00000000c101",
      blockB: "00000000-0000-4000-8000-00000000c102",
      unitB: "00000000-0000-4000-8000-00000000c103",
      groupB: "00000000-0000-4000-8000-00000000c104",
      stageB: "00000000-0000-4000-8000-00000000c105",
      activityB: "00000000-0000-4000-8000-00000000c106",
    };
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'ZONE-SYN-A', 'Synthetic zone A'), (?, ?, ?, 'ZONE-SYN-B', 'Synthetic zone B')", [ids.zoneA, tenantA, projectA, ids.zoneB, tenantB, projectB]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'BLOCK-SYN-A', 'Synthetic block A'), (?, ?, ?, ?, 'BLOCK-SYN-B', 'Synthetic block B')", [ids.blockA, tenantA, projectA, ids.zoneA, ids.blockB, tenantB, projectB, ids.zoneB]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode) VALUES (?, ?, ?, ?, 1, 'SYN-A'), (?, ?, ?, ?, 1, 'SYN-B')", [ids.unitA, tenantA, projectA, ids.blockA, ids.unitB, tenantB, projectB, ids.blockB]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'GROUP-SYN-A', 'Synthetic group A'), (?, ?, ?, 'GROUP-SYN-B', 'Synthetic group B')", [ids.groupA, tenantA, projectA, ids.groupB, tenantB, projectB]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'STAGE-SYN-A', 'Synthetic stage A'), (?, ?, ?, ?, 'STAGE-SYN-B', 'Synthetic stage B')", [ids.stageA, tenantA, projectA, ids.groupA, ids.stageB, tenantB, projectB, ids.groupB]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'SYN-A', 'ACT-SYN-A', 'Synthetic activity A', 100), (?, ?, ?, ?, ?, 'SYN-B', 'ACT-SYN-B', 'Synthetic activity B', 100)", [ids.activityA, tenantA, projectA, ids.groupA, ids.stageA, ids.activityB, tenantB, projectB, ids.groupB, ids.stageB]);
    await connection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status, lastChangedByUserId) VALUES (?, ?, ?, ?, ?, 'COMPLETE', ?), (?, ?, ?, ?, ?, 'COMPLETE', ?)", [ids.progressA, tenantA, projectA, ids.unitA, ids.activityA, integrationUserId, "00000000-0000-4000-8000-00000000c107", tenantB, projectB, ids.unitB, ids.activityB, integrationUserId]);
    await connection.query("INSERT INTO pmc_unit_activity_history (id, tenantId, projectId, unitActivityProgressId, toStatus, changedByUserId) VALUES (?, ?, ?, ?, 'COMPLETE', ?), (?, ?, ?, ?, 'COMPLETE', ?)", [ids.historyA, tenantA, projectA, ids.progressA, integrationUserId, "00000000-0000-4000-8000-00000000c108", tenantB, projectB, "00000000-0000-4000-8000-00000000c107", integrationUserId]);
    await connection.query("INSERT INTO pmc_verification_statuses (id, tenantId, projectId, code, label) VALUES (?, ?, ?, 'SYN-OK-A', 'Synthetic OK A'), (?, ?, ?, 'SYN-OK-B', 'Synthetic OK B')", [ids.verificationA, tenantA, projectA, "00000000-0000-4000-8000-00000000c109", tenantB, projectB]);
    await connection.query("INSERT INTO pmc_inspection_requests (id, tenantId, projectId, requestCode, activityDefinitionId, unitIdsJson, requestedAt) VALUES (?, ?, ?, 'INSP-SYN-A', ?, ?, NOW()), (?, ?, ?, 'INSP-SYN-B', ?, ?, NOW())", [ids.inspectionA, tenantA, projectA, ids.activityA, JSON.stringify([ids.unitA]), "00000000-0000-4000-8000-00000000c10a", tenantB, projectB, ids.activityB, JSON.stringify([ids.unitB])]);
    await connection.query("INSERT INTO pmc_inspection_steps (id, tenantId, projectId, inspectionRequestId, stepCode) VALUES (?, ?, ?, ?, 'STEP-SYN-A'), (?, ?, ?, ?, 'STEP-SYN-B')", [ids.stepA, tenantA, projectA, ids.inspectionA, "00000000-0000-4000-8000-00000000c10b", tenantB, projectB, "00000000-0000-4000-8000-00000000c10a"]);
    await connection.query("INSERT INTO pmc_baselines (id, tenantId, projectId, activityDefinitionId, periodAt, plannedPercent) VALUES (?, ?, ?, ?, '2026-01-01', 100), (?, ?, ?, ?, '2026-01-01', 100)", [ids.baselineA, tenantA, projectA, ids.activityA, "00000000-0000-4000-8000-00000000c10c", tenantB, projectB, ids.activityB]);

    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Synthetic Integration User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const own = await caller.pmc.summary({ tenantId: tenantA, projectId: projectA });
    expect(own.totalRows).toBe(12);
    expect(Object.values(own.counts)).toEqual(Array(12).fill(1));
    await expect(caller.pmc.summary({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
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

  it("seeds operational roles, rejects conflicting procurement and warehouse assignments, and audits an allowed assignment", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const administration = await caller.tenant.administration({ tenantId: tenantA });
    const warehouse = administration.roles.find(role => role.code === "WAREHOUSE_CUSTODIAN");
    const procurement = administration.roles.find(role => role.code === "PROCUREMENT_OFFICER");
    const planning = administration.roles.find(role => role.code === "PLANNING_ENGINEER");
    const siteEngineer = administration.roles.find(role => role.code === "SITE_ENGINEER");
    expect(warehouse && procurement && planning && siteEngineer).toBeTruthy();
    if (!warehouse || !procurement || !planning || !siteEngineer) throw new Error("Operational roles were not seeded");

    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.tenant.assignMember({ tenantId: tenantA, targetUserId: unassignedUserId, roleId: warehouse.id, scopeType: "company" })).rejects.toThrow("not licensed");
      const [unlicensedMemberships] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM memberships WHERE tenantId = ? AND userId = ?", [tenantA, unassignedUserId]);
      expect(Number(unlicensedMemberships[0].count)).toBe(0);
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    await expect(caller.tenant.assignMember({ tenantId: tenantA, targetUserId: unassignedUserId, roleId: siteEngineer.id, scopeType: "project", scopeId: projectB })).rejects.toThrow("PROJECT_OS_INVALID_SCOPE");
    const [foreignScopeMemberships] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM memberships WHERE tenantId = ? AND userId = ?", [tenantA, unassignedUserId]);
    expect(Number(foreignScopeMemberships[0].count)).toBe(0);

    const assigned = await caller.tenant.assignMember({ tenantId: tenantA, targetUserId: unassignedUserId, roleId: warehouse.id, scopeType: "company" });
    try {
      await expect(caller.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: assigned.membershipId, roleId: procurement.id, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
      const allowed = await caller.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: assigned.membershipId, roleId: planning.id, scopeType: "company" });
      expect(allowed.assignmentId).toEqual(expect.any(String));
      const [memberAssignedAudits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action = 'tenant.member_assigned' AND metadata LIKE ?", [tenantA, `%${unassignedUserId}%`]);
      const [roleAssignedAudits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action = 'tenant.membership_role_assigned' AND metadata LIKE ?", [tenantA, `%${assigned.membershipId}%`]);
      expect(Number(memberAssignedAudits[0].count)).toBe(1);
      expect(Number(roleAssignedAudits[0].count)).toBe(1);
    } finally {
      await connection.query("DELETE FROM membership_roles WHERE membershipId = ?", [assigned.membershipId]);
      await connection.query("DELETE FROM memberships WHERE id = ?", [assigned.membershipId]);
    }
  }, 120_000);

  it("isolates the tenant material master, rejects missing entitlement, and records governed project overrides", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.materials.createMaster({ tenantId: tenantB, code: "MAT-BLOCK", description: "Blocked material", unitOfMeasure: "ea", category: "Test" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    const master = await caller.materials.createMaster({ tenantId: tenantA, code: "MAT-CONC-40", description: "Structural concrete", unitOfMeasure: "m3", category: "Concrete", referenceSpecification: "ASTM C94" });
    await expect(caller.materials.saveProjectOverride({ tenantId: tenantA, projectId: projectB, materialId: master.id, active: true })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('int-role-b', ?, 'INT_PROJECT_B', 'Integration project B', 'PROJECT')", [tenantB]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('int-membership-b', ?, ?, 'active')", [tenantB, unassignedUserId]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('int-role-b', 'int-perm-write')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-b', 'int-membership-b', 'int-role-b', 'company')");
    const unlicensedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(unlicensedContext).materials.createMaster({ tenantId: tenantB, code: "MAT-NO-LICENSE", description: "No license", unitOfMeasure: "ea", category: "Test" })).rejects.toThrow("not licensed");
    const override = await caller.materials.saveProjectOverride({ tenantId: tenantA, projectId: projectA, materialId: master.id, projectDescription: "Project concrete mix", referenceSpecification: "Project Spec 033000", active: true });
    const listed = await caller.materials.list({ tenantId: tenantA, projectId: projectA });
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: master.id, code: "MAT-CONC-40", override: expect.objectContaining({ id: override.id, projectDescription: "Project concrete mix" }) })]));
    const [rows] = await connection.query<{ masters: number; overrides: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM material_masters WHERE id = ?) AS masters, (SELECT COUNT(*) FROM project_material_overrides WHERE id = ?) AS overrides, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action IN ('materials.master_created','materials.project_override_saved')) AS audits", [master.id, override.id, tenantA]);
    expect(rows[0]).toMatchObject({ masters: 1, overrides: 1, audits: 2 });
    await connection.query("DELETE FROM membership_roles WHERE id = 'int-membership-role-b'");
    await connection.query("DELETE FROM role_permissions WHERE roleId = 'int-role-b'");
    await connection.query("DELETE FROM memberships WHERE id = 'int-membership-b'");
    await connection.query("DELETE FROM roles WHERE id = 'int-role-b'");
  });

  it("isolates Master Plan snapshots by tenant, project, version, and creator while preserving a recoverable view", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    try {
      const plan = await caller.masterPlans.create({ tenantId: tenantA, projectId: projectA, code: "MP-SNAPSHOT", title: "Snapshot master plan" });
      await expect(caller.masterPlans.createSnapshot({ tenantId: tenantA, projectId: projectB, masterPlanVersionId: plan.versionId, label: "Foreign view", metric: "progress", filters: {}, viewport: { x: 0, y: 0, zoom: 1 }, layers: ["entities"] })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      const created = await caller.masterPlans.createSnapshot({ tenantId: tenantA, projectId: projectA, masterPlanVersionId: plan.versionId, label: "Weekly delivery view", metric: "cost", filters: { status: ["in_progress"], search: "ZONE", wbsItemId: "00000000-0000-4000-8000-0000000000a4" }, viewport: { x: -10, y: 10, zoom: 1.25 }, layers: ["source", "entities"] });
      const snapshots = await caller.masterPlans.listSnapshots({ tenantId: tenantA, projectId: projectA, masterPlanVersionId: plan.versionId });
      expect(snapshots).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, label: "Weekly delivery view", metric: "cost", filters: { status: ["in_progress"], search: "ZONE", wbsItemId: "00000000-0000-4000-8000-0000000000a4" }, viewport: { x: -10, y: 10, zoom: 1.25 }, layers: ["source", "entities"] })]));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action = 'master_plans.snapshot_created' AND entityId = ?", [tenantA, created.id]);
      expect(Number(audits[0].count)).toBe(1);
    } finally {
      await connection.query("DELETE FROM master_plan_snapshots WHERE tenantId = ?", [tenantA]);
    }
  });

  it("isolates and persists Master Plan visualization rules with a project audit trail", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    try {
      await expect(caller.masterPlans.saveVisualizationRule({ tenantId: tenantA, projectId: projectB, metric: "progress", rules: { lowMax: 20, mediumMax: 70, lowColor: "#991b1b", mediumColor: "#b45309", highColor: "#047857" } })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      const saved = await caller.masterPlans.saveVisualizationRule({ tenantId: tenantA, projectId: projectA, metric: "progress", rules: { lowMax: 25, mediumMax: 75, lowColor: "#991b1b", mediumColor: "#b45309", highColor: "#047857" } });
      const rules = await caller.masterPlans.visualizationRules({ tenantId: tenantA, projectId: projectA });
      expect(rules).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.id, metric: "progress", configured: true, rules: { lowMax: 25, mediumMax: 75, lowColor: "#991b1b", mediumColor: "#b45309", highColor: "#047857" } })]));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action = 'master_plans.visualization_rule_saved' AND entityId = ?", [tenantA, saved.id]);
      expect(Number(audits[0].count)).toBe(1);
    } finally {
      await connection.query("DELETE FROM master_plan_visualization_rules WHERE tenantId = ?", [tenantA]);
    }
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
  }, 120_000);

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
  }, 120_000);

  it("governs tenant membership suspension and reactivation with scope, self-protection, and audit evidence", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const unassignedContext: TrpcContext = { user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const owner = appRouter.createCaller(ownerContext);
    const target = appRouter.createCaller(unassignedContext);
    let roleId: string | undefined;
    let invitationId: string | undefined;
    let membershipId: string | undefined;
    let assignmentId: string | undefined;
    try {
      const [managerPermissions] = await connection.query<{ productCode: "EXECUTIVE" | "PMO" | "PROJECT" }[]>("SELECT productCode FROM permissions WHERE code = 'tenant.manage' LIMIT 1");
      if (!managerPermissions[0]) throw new Error("Integration tenant.manage permission is required");
      const role = await owner.tenant.createRole({ tenantId: tenantA, code: "INT_STATUS_MANAGER", name: "Integration Status Manager", productCode: managerPermissions[0].productCode, permissionCodes: ["tenant.manage"] });
      roleId = role.id;
      const invitation = await owner.tenant.createInvitation({ tenantId: tenantA, email: "unassigned@test.local", roleId, scopeType: "company" });
      invitationId = invitation.invitationId;
      const accepted = await target.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
      membershipId = accepted.membershipId;
      assignmentId = accepted.assignmentId;
      await expect(target.tenant.transitionMembershipStatus({ tenantId: tenantA, membershipId, nextStatus: "suspended" })).rejects.toThrow("PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN");
      await expect(owner.tenant.transitionMembershipStatus({ tenantId: tenantB, membershipId, nextStatus: "suspended" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      await expect(owner.tenant.transitionMembershipStatus({ tenantId: tenantA, membershipId, nextStatus: "suspended" })).resolves.toMatchObject({ membershipId, status: "suspended" });
      const [suspendedRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM memberships WHERE id = ? AND tenantId = ? AND status = 'suspended'", [membershipId, tenantA]);
      expect(Number(suspendedRows[0].count)).toBe(1);
      await expect(owner.tenant.transitionMembershipStatus({ tenantId: tenantA, membershipId, nextStatus: "suspended" })).rejects.toThrow("PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID");
      await expect(owner.tenant.transitionMembershipStatus({ tenantId: tenantA, membershipId, nextStatus: "active" })).resolves.toMatchObject({ membershipId, status: "active" });
      const [activeRows] = await connection.query<{ status: string; audits: number }[]>("SELECT m.status, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'tenant.membership_status_changed') AS audits FROM memberships m WHERE m.id = ?", [tenantA, membershipId, membershipId]);
      expect(activeRows[0]).toMatchObject({ status: "active", audits: 2 });
    } finally {
      if (membershipId) await connection.query("DELETE FROM audit_logs WHERE entityId = ?", [membershipId]);
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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

  it("returns a tenant-scoped planning control center with latest EVM, health, schedule, and exception signals", async () => {
    const ownerContext: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(ownerContext);
    let createdPermission = false;
    let pmoReadPermissionId = "int-perm-pmo-read";
    try {
      const [existingPermissions] = await connection.query<{ id: string }[]>("SELECT id FROM permissions WHERE code = 'pmo.read' LIMIT 1");
      if (existingPermissions[0]) pmoReadPermissionId = existingPermissions[0].id;
      else { await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES (?, 'pmo.read', 'Integration PMO read', 'PMO')", [pmoReadPermissionId]); createdPermission = true; }
      await connection.query("INSERT IGNORE INTO role_permissions (roleId, permissionId) VALUES ('int-role-pmo', ?)", [pmoReadPermissionId]);
      await connection.query("DELETE FROM actions WHERE projectId = ?", [projectC]);
      await connection.query("DELETE FROM evm_wbs_snapshots WHERE projectId = ?", [projectC]);
      await connection.query("DELETE FROM evm_snapshots WHERE projectId = ?", [projectC]);
      await connection.query("DELETE FROM project_health_snapshots WHERE projectId = ?", [projectC]);
      await connection.query("DELETE FROM projects WHERE id = ?", [projectC]);
      await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType, plannedFinishAt, forecastFinishAt) VALUES (?, ?, 'int-portfolio-a', 'INT-PLAN', 'Integration planning signal project', 'test', '2026-08-20 00:00:00', '2026-08-25 00:00:00')", [projectC, tenantA]);
      await connection.query("INSERT INTO evm_snapshots (id, tenantId, projectId, periodAt, pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc, vac, eacMethod) VALUES ('int-evm-plan', ?, ?, NOW(), 100, 80, 120, 100, -40, -20, 0.8000, 0.8000, 150, 30, -50, 'bac_over_cpi')", [tenantA, projectC]);
      await connection.query("INSERT INTO project_health_snapshots (id, tenantId, projectId, periodAt, overallScore, status, confidence, drivers, exceptions) VALUES ('int-health-plan', ?, ?, NOW(), 44, 'red', 'high', '[]', '[]')", [tenantA, projectC]);
      await connection.query("INSERT INTO actions (id, tenantId, projectId, title, priority, dueAt, status) VALUES ('int-action-plan', ?, ?, 'Integration overdue action', 'high', '2020-01-01 00:00:00', 'open')", [tenantA, projectC]);
      await connection.query("INSERT INTO change_requests (id, tenantId, projectId, changeNumber, title, description, impactScheduleDays, impactCost, currency, status, createdByUserId) VALUES ('int-change-plan', ?, ?, 'CR-PLAN', 'Integration open change', 'A governed change requiring review.', 15, 100000, 'SAR', 'under_review', ?)", [tenantA, projectC, integrationUserId]);
      const dashboard = await caller.dashboards.pmo({ tenantId: tenantA });
      expect(dashboard.planningOverview.projects).toEqual(expect.arrayContaining([expect.objectContaining({ id: projectC, attentionLevel: "critical", finishVarianceDays: 5, evm: expect.objectContaining({ cpi: 0.8, spi: 0.8 }), health: expect.objectContaining({ status: "red" }), signals: expect.arrayContaining(["health_red", "schedule_critical", "cost_critical", "finish_delay", "overdue_action"]) })]));
      expect(dashboard.todayExceptions).toEqual(expect.arrayContaining([expect.objectContaining({ projectId: projectC, category: "health", label: "health_red", severity: "critical" }), expect.objectContaining({ projectId: projectC, category: "schedule", label: "forecast_finish_delayed", severity: "warning" }), expect.objectContaining({ projectId: projectC, category: "action", label: "overdue_action" }), expect.objectContaining({ projectId: projectC, category: "change", label: "open_change", severity: "critical", detail: expect.stringContaining("CR-PLAN") })]));
      expect(dashboard.planningOverview.projects.some(project => project.id === projectB)).toBe(false);
      await expect(caller.dashboards.pmoRegisters({ tenantId: tenantA })).resolves.toMatchObject({ projects: expect.any(Array), risks: expect.any(Array), issues: expect.any(Array) });
      await expect(caller.dashboards.pmoPortfolioSetup({ tenantId: tenantA })).resolves.toMatchObject({ portfolios: expect.any(Array), projects: expect.any(Array) });
      await expect(caller.dashboards.pmoRisks({ tenantId: tenantA })).resolves.toMatchObject({ risks: expect.any(Array) });
      await expect(caller.dashboards.pmoIssues({ tenantId: tenantA })).resolves.toMatchObject({ issues: expect.any(Array) });
      await expect(caller.dashboards.pmoActions({ tenantId: tenantA })).resolves.toMatchObject({ actions: expect.any(Array) });
      await expect(caller.dashboards.pmoPlanning({ tenantId: tenantA })).resolves.toMatchObject({ planningOverview: expect.any(Object) });
      await expect(caller.dashboards.pmoTodayExceptions({ tenantId: tenantA })).resolves.toMatchObject({ todayExceptions: expect.any(Array) });
    } finally {
      await connection.query("DELETE FROM role_permissions WHERE roleId = 'int-role-pmo' AND permissionId = ?", [pmoReadPermissionId]);
      if (createdPermission) await connection.query("DELETE FROM permissions WHERE id = ?", [pmoReadPermissionId]);
      await connection.query("DELETE FROM change_requests WHERE id = 'int-change-plan'");
      await connection.query("DELETE FROM actions WHERE id = 'int-action-plan'");
      await connection.query("DELETE FROM evm_snapshots WHERE id = 'int-evm-plan'");
      await connection.query("DELETE FROM project_health_snapshots WHERE id = 'int-health-plan'");
      await connection.query("DELETE FROM projects WHERE id = ?", [projectC]);
    }
  }, 120_000);

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
  }, 120_000);

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
        await connection.query("DELETE FROM evm_wbs_snapshots WHERE snapshotId = ?", [snapshotId]);
        await connection.query("DELETE FROM evm_snapshots WHERE id = ?", [snapshotId]);
      }
    }
  }, 120_000);

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
  }, 120_000);

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
    await connection.query("DELETE FROM evm_wbs_snapshots WHERE wbsItemId = ?", [linkedWbs.id]);
    await connection.query("DELETE FROM wbs_items WHERE id = ?", [linkedWbs.id]);
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

  it("expires an ended tenant license, deactivates its entitlement, and records an auditable lifecycle transition", async () => {
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
  }, 120_000);

  it("generates an authorized Arabic XLSX export with localized content and audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    let exportId: string | undefined;
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('int-wbs-xlsx-audit', ?, ?, 'WBS-XLSX-AUDIT', 'XLSX audit work package', 350)", [tenantA, projectA]);
    try {
      const exported = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "xlsx", locale: "ar" });
      exportId = exported.id;
      expect(exported).toMatchObject({ fileName: "wbs-export.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", rowCount: expect.any(Number) });
      const workbook = await readExcelRows(Buffer.from(exported.base64, "base64"), "WBS");
      expect(workbook.sheetNames).toEqual(["WBS"]);
      const rows = workbook.rows;
      expect(rows).toContainEqual(expect.objectContaining({ "رمز WBS": "WBS-XLSX-AUDIT", "اسم WBS": "XLSX audit work package", "القيمة المخططة": 350 }));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE id = ? AND tenantId = ? AND action = 'data_export_generated' AND entityType = 'data_export'", [exportId, tenantA]);
      expect(Number(audits[0].count)).toBe(1);
    } finally {
      if (exportId) await connection.query("DELETE FROM audit_logs WHERE id = ?", [exportId]);
      await connection.query("DELETE FROM wbs_items WHERE id = 'int-wbs-xlsx-audit'");
    }
  }, 120_000);

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
      const workbook = await readExcelRows(Buffer.from(activityExport.base64, "base64"), "ACTIVITIES");
      const rows = workbook.rows;
      expect(rows).toContainEqual(expect.objectContaining({ "رمز النشاط": "ACT-EXPORT-AUDIT", "اسم النشاط": "Activity export evidence", "القيمة المخططة": 275, "الحالة": "in_progress" }));
      const [audits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE id IN (?, ?) AND tenantId = ? AND action = 'data_export_generated'", [budgetExport.id, activityExport.id, tenantA]);
      expect(Number(audits[0].count)).toBe(2);
    } finally {
      if (exportIds.length) await connection.query("DELETE FROM audit_logs WHERE id IN (?)", [exportIds]);
      await connection.query("DELETE FROM activities WHERE id = 'int-activity-export-audit'");
      await connection.query("DELETE FROM budget_lines WHERE id = 'int-budget-export-audit'");
    }
  }, 120_000);

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
  }, 120_000);

  it("rejects unlicensed or foreign schedule imports and atomically confirms a restricted XER WBS and activity set", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const xer = Buffer.from("%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\twbs_cost\n%R\t900\tWBS-SCHEDULE-TRPC\tImported schedule work package\t1000\n%T\tTASK\n%F\ttask_code\ttask_name\twbs_id\ttarget_start_date\ttarget_end_date\ttarget_cost\tstatus_code\n%R\tACT-SCHEDULE-TRPC\tImported schedule activity\t900\t2026-09-01 00:00:00\t2026-09-05 00:00:00\t500\tTK_Active").toString("base64");
    await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectB, moduleCode: "schedule", fileName: "foreign.xer", sourceFormat: "xer", base64: xer })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try { await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "schedule", fileName: "unlicensed.xer", sourceFormat: "xer", base64: xer })).rejects.toThrow("PROJECT product is not licensed"); }
    finally { await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]); }
    const invalid = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "schedule", fileName: "missing-task.xer", sourceFormat: "xer", base64: Buffer.from("%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\n%R\t901\tWBS-MISSING\tIncomplete").toString("base64") });
    expect(invalid).toMatchObject({ status: "uploaded" }); expect(invalid.errors).toContainEqual(expect.objectContaining({ code: "XER_REQUIRED_TABLE_MISSING" })); await expect(caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: invalid.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");
    const analysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "schedule", fileName: "integration-schedule.xer", sourceFormat: "xer", base64: xer });
    expect(analysis).toMatchObject({ status: "validated", totalRows: 2, errors: [] }); const completion = await caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: analysis.id }); expect(completion).toMatchObject({ status: "completed", createdRows: 2, updatedRows: 0, skippedRows: 0 });
    const [rows] = await connection.query<{ imports: number; wbs: number; activities: number; results: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE id = ? AND moduleCode = 'schedule' AND sourceFormat = 'xer' AND status = 'completed' AND createdRows = 2) AS imports, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-SCHEDULE-TRPC') AS wbs, (SELECT COUNT(*) FROM activities WHERE tenantId = ? AND projectId = ? AND code = 'ACT-SCHEDULE-TRPC' AND status = 'in_progress' AND wbsItemId = (SELECT id FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-SCHEDULE-TRPC')) AS activities, (SELECT COUNT(*) FROM data_import_row_results WHERE importId = ? AND action = 'created') AS results, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_completed') AS audits", [analysis.id, tenantA, projectA, tenantA, projectA, tenantA, projectA, analysis.id, analysis.id]);
    expect(rows[0]).toMatchObject({ imports: 1, wbs: 1, activities: 1, results: 2, audits: 1 });
  }, 120_000);

  it("rejects a foreign contracts import and confirms an approved contracts template with independent audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const csv = Buffer.from("Contract Code,Contract Title,Counterparty,Contract Value,Currency\nCON-IMPORT-TRPC,Civil works contract,Main Contractor,2500000,SAR").toString("base64");
    await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectB, moduleCode: "contracts", fileName: "foreign-contracts.csv", sourceFormat: "csv", base64: csv })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const analysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "contracts", fileName: "integration-contracts.csv", sourceFormat: "csv", base64: csv });
    expect(analysis).toMatchObject({ status: "validated", totalRows: 1, errors: [] });
    await expect(caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: analysis.id })).resolves.toMatchObject({ id: analysis.id, status: "completed", createdRows: 1, updatedRows: 0, skippedRows: 0 });
    const [rows] = await connection.query<{ imports: number; contracts: number; completedAudits: number; uploadAudits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE id = ? AND moduleCode = 'contracts' AND status = 'completed' AND createdRows = 1) AS imports, (SELECT COUNT(*) FROM contracts WHERE tenantId = ? AND projectId = ? AND code = 'CON-IMPORT-TRPC' AND title = 'Civil works contract' AND counterparty = 'Main Contractor' AND contractValue = 2500000 AND currency = 'SAR') AS contracts, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_completed') AS completedAudits, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_uploaded') AS uploadAudits", [analysis.id, tenantA, projectA, analysis.id, analysis.id]);
    expect(rows[0]).toMatchObject({ imports: 1, contracts: 1, completedAudits: 1, uploadAudits: 1 });
  }, 120_000);

  it("rejects a foreign materials import and confirms the named materials template with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const csv = Buffer.from("Material Code,Description,Unit of Measure,Category,Reference Specification\nMAT-IMPORT-TRPC,Structural concrete,m3,Concrete,ASTM C94").toString("base64");
    await expect(caller.dataImports.analyze({ tenantId: tenantA, projectId: projectB, moduleCode: "materials", fileName: "foreign-materials.csv", sourceFormat: "csv", base64: csv })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const analysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "materials", fileName: "integration-materials.csv", sourceFormat: "csv", base64: csv });
    expect(analysis).toMatchObject({ status: "validated", totalRows: 1, errors: [] });
    await expect(caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: analysis.id })).resolves.toMatchObject({ id: analysis.id, status: "completed", createdRows: 1 });
    const [rows] = await connection.query<{ imports: number; materials: number; rowResults: number; completedAudits: number; uploadAudits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE id = ? AND moduleCode = 'materials' AND status = 'completed' AND createdRows = 1) AS imports, (SELECT COUNT(*) FROM material_masters WHERE tenantId = ? AND code = 'MAT-IMPORT-TRPC' AND unitOfMeasure = 'm3' AND category = 'Concrete') AS materials, (SELECT COUNT(*) FROM data_import_row_results WHERE importId = ? AND rowKey = 'MAT-IMPORT-TRPC' AND action = 'created') AS rowResults, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_completed') AS completedAudits, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_uploaded') AS uploadAudits", [analysis.id, tenantA, analysis.id, analysis.id, analysis.id]);
    expect(rows[0]).toMatchObject({ imports: 1, materials: 1, rowResults: 1, completedAudits: 1, uploadAudits: 1 });
  }, 120_000);

  it("rejects a foreign warehouse, governs inventory movements, and prevents negative stock", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const material = await caller.materials.createMaster({ tenantId: tenantA, code: "MAT-WH-TRPC", description: "Warehouse concrete", unitOfMeasure: "m3", category: "Concrete" });
    await expect(caller.warehouses.create({ tenantId: tenantA, projectId: projectB, code: "WH-BLOCKED", name: "Blocked warehouse" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const warehouse = await caller.warehouses.create({ tenantId: tenantA, projectId: projectA, code: "WH-TRPC", name: "Integration store" });
    await expect(caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, transactionType: "receipt", quantityDelta: 10, occurredAt: new Date("2026-08-21T00:00:00.000Z") })).resolves.toMatchObject({ previousQuantity: 0, nextQuantity: 10 });
    await expect(caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, transactionType: "issue", quantityDelta: -4, occurredAt: new Date("2026-08-21T01:00:00.000Z") })).resolves.toMatchObject({ previousQuantity: 10, nextQuantity: 6 });
    await expect(caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, transactionType: "issue", quantityDelta: -7, occurredAt: new Date("2026-08-21T02:00:00.000Z") })).rejects.toThrow("PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK");
    await expect(caller.warehouses.list({ tenantId: tenantA, projectId: projectA })).resolves.toMatchObject({ warehouses: [expect.objectContaining({ id: warehouse.id })], balances: [expect.objectContaining({ materialId: material.id, quantityOnHand: "6.000" })], transactions: expect.arrayContaining([expect.objectContaining({ transactionType: "receipt" }), expect.objectContaining({ transactionType: "issue" })]) });
    const [rows] = await connection.query<{ balance: string; storedBalances: number; movements: number; audits: number }[]>("SELECT (SELECT COALESCE(SUM(quantityDelta), 0) FROM warehouse_inventory_transactions WHERE warehouseId = ? AND materialId = ?) AS balance, 0 AS storedBalances, (SELECT COUNT(*) FROM warehouse_inventory_transactions WHERE warehouseId = ?) AS movements, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'warehouse.inventory_recorded') AS audits", [warehouse.id, material.id, warehouse.id, tenantA]);
    expect(rows[0]).toMatchObject({ balance: "6.000", storedBalances: 0, movements: 2, audits: 2 });
    const destinationWarehouse = await caller.warehouses.create({ tenantId: tenantA, projectId: projectA, code: "WH-TRANSFER-TRPC", name: "Transfer destination" });
    await expect(caller.warehouses.transferInventory({ tenantId: tenantA, projectId: projectB, sourceWarehouseId: warehouse.id, destinationWarehouseId: destinationWarehouse.id, materialId: material.id, quantity: 1, transferredAt: new Date("2026-08-21T02:30:00.000Z") })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.warehouses.transferInventory({ tenantId: tenantA, projectId: projectA, sourceWarehouseId: warehouse.id, destinationWarehouseId: warehouse.id, materialId: material.id, quantity: 1, transferredAt: new Date("2026-08-21T02:30:00.000Z") })).rejects.toThrow("PROJECT_OS_INVENTORY_TRANSFER_SAME_WAREHOUSE");
    await expect(caller.warehouses.transferInventory({ tenantId: tenantA, projectId: projectA, sourceWarehouseId: warehouse.id, destinationWarehouseId: destinationWarehouse.id, materialId: material.id, quantity: 7, transferredAt: new Date("2026-08-21T02:30:00.000Z") })).rejects.toThrow("PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK");
    const transfer = await caller.warehouses.transferInventory({ tenantId: tenantA, projectId: projectA, sourceWarehouseId: warehouse.id, destinationWarehouseId: destinationWarehouse.id, materialId: material.id, quantity: 3, referenceNumber: "TRF-TRPC", transferredAt: new Date("2026-08-21T02:30:00.000Z") });
    expect(transfer).toMatchObject({ sourcePreviousQuantity: 6, sourceNextQuantity: 3, destinationPreviousQuantity: 0, destinationNextQuantity: 3 });
    const [transferRows] = await connection.query<{ transfers: number; movements: number; audits: number; sourceBalance: string; destinationBalance: string }[]>("SELECT (SELECT COUNT(*) FROM warehouse_inventory_transfers WHERE id = ? AND sourceWarehouseId = ? AND destinationWarehouseId = ? AND quantity = 3) AS transfers, (SELECT COUNT(*) FROM warehouse_inventory_transactions WHERE transferId = ?) AS movements, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'warehouse.inventory_transferred' AND entityId = ?) AS audits, (SELECT COALESCE(SUM(quantityDelta), 0) FROM warehouse_inventory_transactions WHERE warehouseId = ? AND materialId = ?) AS sourceBalance, (SELECT COALESCE(SUM(quantityDelta), 0) FROM warehouse_inventory_transactions WHERE warehouseId = ? AND materialId = ?) AS destinationBalance", [transfer.id, warehouse.id, destinationWarehouse.id, transfer.id, tenantA, transfer.id, warehouse.id, material.id, destinationWarehouse.id, material.id]);
    expect(transferRows[0]).toMatchObject({ transfers: 1, movements: 2, audits: 1, sourceBalance: "3.000", destinationBalance: "3.000" });
    const wbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "WBS-MAT-ISSUE-TRPC", name: "Material issue work package", plannedValue: 500 });
    const activity = await caller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, code: "ACT-MAT-ISSUE-TRPC", name: "Material issue activity", plannedValue: 500, plannedStartAt: new Date("2026-08-21T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-30T00:00:00.000Z") });
    await expect(caller.warehouses.issueToWork({ tenantId: tenantA, projectId: projectB, warehouseId: warehouse.id, materialId: material.id, wbsItemId: wbs.id, activityId: activity.id, issuedQuantity: 1, unitCost: 25, issuedAt: new Date("2026-08-21T03:00:00.000Z") })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.warehouses.issueToWork({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, wbsItemId: wbs.id, activityId: activity.id, issuedQuantity: 7, unitCost: 25, issuedAt: new Date("2026-08-21T03:00:00.000Z") })).rejects.toThrow("PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK");
    const materialIssue = await caller.warehouses.issueToWork({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, wbsItemId: wbs.id, activityId: activity.id, issuedQuantity: 2, unitCost: 25, issuedAt: new Date("2026-08-21T04:00:00.000Z") });
    expect(materialIssue).toMatchObject({ totalCost: 50, previousQuantity: 3, nextQuantity: 1 });
    const [issueRows] = await connection.query<{ issues: number; costs: number; issuedAmount: string; audits: number }[]>("SELECT (SELECT COUNT(*) FROM material_issues WHERE id = ? AND inventoryTransactionId = ? AND costEntryId = ? AND wbsItemId = ? AND activityId = ?) AS issues, (SELECT COUNT(*) FROM cost_entries WHERE id = ? AND projectId = ? AND entryType = 'actual' AND status = 'posted') AS costs, (SELECT amount FROM cost_entries WHERE id = ?) AS issuedAmount, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'warehouse.material_issued_to_work' AND entityId = ?) AS audits", [materialIssue.id, materialIssue.inventoryTransactionId, materialIssue.costEntryId, wbs.id, activity.id, materialIssue.costEntryId, projectA, materialIssue.costEntryId, tenantA, materialIssue.id]);
    expect(issueRows[0]).toMatchObject({ issues: 1, costs: 1, issuedAmount: "50.00", audits: 1 });
    await expect(caller.controls.captureOperationalEvmSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-31T00:00:00.000Z"), eacMethod: "ac_plus_remaining" })).resolves.toMatchObject({ ac: 50, sources: expect.objectContaining({ postedActualCostEntries: 1 }) });
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ? AND action IN ('warehouse.inventory_recorded','warehouse.material_issued_to_work','warehouse.inventory_transferred')", [tenantA]);
    await connection.query("DELETE FROM material_issues WHERE id = ?", [materialIssue.id]);
    await connection.query("DELETE FROM cost_entries WHERE id = ?", [materialIssue.costEntryId]);
    await connection.query("DELETE FROM warehouse_inventory_transactions WHERE transferId = ?", [transfer.id]);
    await connection.query("DELETE FROM warehouse_inventory_transfers WHERE id = ?", [transfer.id]);
    await connection.query("DELETE FROM warehouse_inventory_transactions WHERE warehouseId = ?", [warehouse.id]);
    await connection.query("DELETE FROM activities WHERE id = ?", [activity.id]);
    await connection.query("DELETE FROM evm_wbs_snapshots WHERE wbsItemId = ?", [wbs.id]);
    await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbs.id]);
    await connection.query("DELETE FROM project_warehouses WHERE id = ?", [warehouse.id]);
    await connection.query("DELETE FROM project_warehouses WHERE id = ?", [destinationWarehouse.id]);
    await connection.query("DELETE FROM material_masters WHERE id = ?", [material.id]);
  }, 120_000);

  it("governs material reorder levels and derives PMO shortages from movements without creating read-side alerts", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const foreignMaterialId = "92929292-9292-4929-8929-929292929291";
    const foreignOverrideId = "92929292-9292-4929-8929-929292929292";
    const foreignWarehouseId = "92929292-9292-4929-8929-929292929293";
    const foreignTransactionId = "92929292-9292-4929-8929-929292929294";
    let materialId: string | null = null;
    let overrideId: string | null = null;
    let warehouseId: string | null = null;
    let createdPmoReadPermission = false;
    let pmoReadPermissionId = "int-perm-reorder-pmo-read";
    try {
      const [existingPermissions] = await connection.query<{ id: string }[]>("SELECT id FROM permissions WHERE code = 'pmo.read' LIMIT 1");
      if (existingPermissions[0]) pmoReadPermissionId = existingPermissions[0].id;
      else { await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES (?, 'pmo.read', 'Integration reorder PMO read', 'PMO')", [pmoReadPermissionId]); createdPmoReadPermission = true; }
      await connection.query("INSERT IGNORE INTO role_permissions (roleId, permissionId) VALUES ('int-role-a', ?)", [pmoReadPermissionId]);
      const material = await caller.materials.createMaster({ tenantId: tenantA, code: "MAT-REORDER-TRPC", description: "Reorder cement", unitOfMeasure: "bag", category: "Concrete" });
      materialId = material.id;
      await expect(caller.materials.saveProjectOverride({ tenantId: tenantA, projectId: projectB, materialId, active: true, reorderLevel: 5 })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
      await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
      try {
        await expect(caller.materials.saveProjectOverride({ tenantId: tenantA, projectId: projectA, materialId, active: true, reorderLevel: 5 })).rejects.toThrow("PROJECT product is not licensed");
      } finally {
        await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
      }
      const override = await caller.materials.saveProjectOverride({ tenantId: tenantA, projectId: projectA, materialId, active: true, reorderLevel: 5 });
      overrideId = override.id;
      warehouseId = (await caller.warehouses.create({ tenantId: tenantA, projectId: projectA, code: "WH-REORDER-TRPC", name: "Reorder test store" })).id;
      await caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId, materialId, transactionType: "receipt", quantityDelta: 3, occurredAt: new Date("2026-08-22T00:00:00.000Z") });
      await connection.query("INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, active, createdByUserId) VALUES (?, ?, 'MAT-REORDER-FOREIGN', 'Foreign material', 'bag', 'Concrete', true, ?)", [foreignMaterialId, tenantB, integrationUserId]);
      await connection.query("INSERT INTO project_material_overrides (id, tenantId, projectId, materialId, active, reorderLevel, createdByUserId) VALUES (?, ?, ?, ?, true, 9, ?)", [foreignOverrideId, tenantB, projectB, foreignMaterialId, integrationUserId]);
      await connection.query("INSERT INTO project_warehouses (id, tenantId, projectId, code, name, active, createdByUserId) VALUES (?, ?, ?, 'WH-REORDER-FOREIGN', 'Foreign store', true, ?)", [foreignWarehouseId, tenantB, projectB, integrationUserId]);
      await connection.query("INSERT INTO warehouse_inventory_transactions (id, tenantId, projectId, warehouseId, materialId, transactionType, quantityDelta, occurredAt, createdByUserId) VALUES (?, ?, ?, ?, ?, 'receipt', 1, ?, ?)", [foreignTransactionId, tenantB, projectB, foreignWarehouseId, foreignMaterialId, new Date("2026-08-22T00:00:00.000Z"), integrationUserId]);
      const [auditBeforeRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action = 'materials.project_override_saved' AND entityId = ?", [tenantA, overrideId]);
      expect(auditBeforeRows[0]).toMatchObject({ count: 1 });
      const dashboard = await caller.dashboards.pmoTodayExceptions({ tenantId: tenantA });
      expect(dashboard.todayExceptions).toEqual(expect.arrayContaining([expect.objectContaining({ id: `inventory:${projectA}:${materialId}`, category: "inventory", severity: "warning", label: "material_reorder_required", detail: "MAT-REORDER-TRPC · Reorder cement · 3/5" })]));
      expect(dashboard.todayExceptions).not.toEqual(expect.arrayContaining([expect.objectContaining({ projectId: projectB }), expect.objectContaining({ detail: expect.stringContaining("MAT-REORDER-FOREIGN") })]));
      const [auditAfterRows] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND action = 'materials.project_override_saved' AND entityId = ?", [tenantA, overrideId]);
      expect(auditAfterRows[0]).toEqual(auditBeforeRows[0]);
      await caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId, materialId, transactionType: "issue", quantityDelta: -3, occurredAt: new Date("2026-08-22T01:00:00.000Z") });
      const criticalDashboard = await caller.dashboards.pmoTodayExceptions({ tenantId: tenantA });
      expect(criticalDashboard.todayExceptions).toEqual(expect.arrayContaining([expect.objectContaining({ id: `inventory:${projectA}:${materialId}`, category: "inventory", severity: "critical", detail: "MAT-REORDER-TRPC · Reorder cement · 0/5" })]));
    } finally {
      await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?)", [materialId, overrideId, warehouseId]);
      if (warehouseId) await connection.query("DELETE FROM warehouse_inventory_transactions WHERE warehouseId = ?", [warehouseId]);
      if (overrideId) await connection.query("DELETE FROM project_material_overrides WHERE id = ?", [overrideId]);
      if (warehouseId) await connection.query("DELETE FROM project_warehouses WHERE id = ?", [warehouseId]);
      if (materialId) await connection.query("DELETE FROM material_masters WHERE id = ?", [materialId]);
      await connection.query("DELETE FROM warehouse_inventory_transactions WHERE id = ?", [foreignTransactionId]);
      await connection.query("DELETE FROM project_material_overrides WHERE id = ?", [foreignOverrideId]);
      await connection.query("DELETE FROM project_warehouses WHERE id = ?", [foreignWarehouseId]);
      await connection.query("DELETE FROM material_masters WHERE id = ?", [foreignMaterialId]);
      await connection.query("DELETE FROM role_permissions WHERE roleId = 'int-role-a' AND permissionId = ?", [pmoReadPermissionId]);
      if (createdPmoReadPermission) await connection.query("DELETE FROM permissions WHERE id = ?", [pmoReadPermissionId]);
    }
  }, 120_000);

  it("governs goods receipt notes with issued purchase orders and rejection evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }; const caller = appRouter.createCaller(context);
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ? AND entityId IN (SELECT id FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC')", [tenantA, projectA]); await connection.query("DELETE FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC'", [projectA]); await connection.query("DELETE FROM cost_entries WHERE projectId = ? AND amount = 800", [projectA]); await connection.query("DELETE FROM purchase_orders WHERE projectId = ? AND purchaseOrderNumber = 'PO-GRN-TRPC'", [projectA]); await connection.query("DELETE FROM commitments WHERE id = '82828282-8282-4828-8828-828282828281'");
    const material = await caller.materials.createMaster({ tenantId: tenantA, code: "MAT-GRN-TRPC", description: "GRN concrete", unitOfMeasure: "m3", category: "Concrete" });
    const commitmentId = "82828282-8282-4828-8828-828282828281";
    await connection.query("INSERT INTO commitments (id, tenantId, projectId, code, description, amount, currency, status, committedAt) VALUES (?, ?, ?, 'COM-GRN-TRPC', 'GRN commitment', 1000, 'SAR', 'committed', ?)", [commitmentId, tenantA, projectA, new Date("2026-08-20T00:00:00.000Z")]);
    const purchaseOrder = await caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectA, commitmentId, purchaseOrderNumber: "PO-GRN-TRPC", supplierName: "Integration Supply Company", orderDate: new Date("2026-08-20T00:00:00.000Z"), amount: 1_000, currency: "SAR", summary: "Issued purchase order for goods receipt evidence" });
    await caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "submitted" }); await caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "approved" }); await caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "issued" });
    const inspection = await caller.qualityInspections.create({ tenantId: tenantA, projectId: projectA, inspectionNumber: "QI-GRN-TRPC", inspectionType: "testing", inspectedAt: new Date("2026-08-21T00:00:00.000Z"), outcome: "fail", summary: "Failed delivery sample inspection" }); await caller.qualityInspections.transitionStatus({ tenantId: tenantA, projectId: projectA, inspectionId: inspection.id, nextStatus: "submitted" }); await caller.qualityInspections.transitionStatus({ tenantId: tenantA, projectId: projectA, inspectionId: inspection.id, nextStatus: "accepted" });
    const ncr = await caller.ncrs.create({ tenantId: tenantA, projectId: projectA, ncrNumber: "NCR-GRN-TRPC", title: "Rejected delivery batch", description: "Rejected delivery quantity must remain under investigation." });
    const foreignPurchaseOrderId = "81818181-8181-4818-8818-818181818181"; await connection.query("INSERT INTO purchase_orders (id, tenantId, projectId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, 'PO-GRN-FOREIGN', 'Foreign supplier', ?, 99, 'SAR', 'Foreign issued purchase order', 'issued', ?)", [foreignPurchaseOrderId, tenantB, projectB, new Date("2026-08-20T00:00:00.000Z"), integrationUserId]);
    const [costBeforeRows] = await connection.query<{ actualCosts: number }[]>("SELECT COUNT(*) AS actualCosts FROM cost_entries WHERE projectId = ?", [projectA]); const actualCostsBefore = Number(costBeforeRows[0]?.actualCosts ?? 0);
    const input = { tenantId: tenantA, projectId: projectA, grnNumber: "GRN-TRPC", purchaseOrderId: purchaseOrder.id, materialId: material.id, receivedQuantity: 8, rejectedQuantity: 2, unitCost: 100, unitOfMeasure: "m3", receivedAt: new Date("2026-08-21T01:00:00.000Z"), qualityInspectionId: inspection.id, ncrId: ncr.id, note: "Delivery partially rejected after quality inspection" };
    await expect(caller.goodsReceipts.create({ ...input, purchaseOrderId: foreignPurchaseOrderId })).rejects.toThrow("PROJECT_OS_PURCHASE_ORDER_NOT_FOUND");
    await expect(caller.goodsReceipts.create({ ...input, qualityInspectionId: undefined, ncrId: undefined })).rejects.toThrow("PROJECT_OS_GRN_REJECTION_EVIDENCE_REQUIRED");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]); try { await expect(caller.goodsReceipts.create(input)).rejects.toThrow("PROJECT product is not licensed"); } finally { await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]); }
    await expect(caller.goodsReceipts.create(input)).resolves.toMatchObject({ id: expect.any(String) });
    await expect(caller.goodsReceipts.list({ tenantId: tenantA, projectId: projectA })).resolves.toMatchObject([expect.objectContaining({ grnNumber: "GRN-TRPC", purchaseOrderId: purchaseOrder.id, materialId: material.id, receivedQuantity: "8.000", rejectedQuantity: "2.000", inspectionNumber: "QI-GRN-TRPC", ncrNumber: "NCR-GRN-TRPC" })]);
    const [rows] = await connection.query<{ grns: number; audits: number; inventory: number; actualCosts: number; actualAmount: string; commitmentOpen: string }[]>("SELECT (SELECT COUNT(*) FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC' AND unitCost = 100) AS grns, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'procurement.goods_receipt_note_created' AND entityId IN (SELECT id FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC')) AS audits, (SELECT COUNT(*) FROM warehouse_inventory_transactions WHERE projectId = ? AND materialId = ?) AS inventory, (SELECT COUNT(*) FROM cost_entries WHERE projectId = ?) AS actualCosts, (SELECT amount FROM cost_entries WHERE id = (SELECT costEntryId FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC')) AS actualAmount, (SELECT c.amount - COALESCE(SUM(g.receivedQuantity * g.unitCost), 0) FROM commitments c LEFT JOIN purchase_orders p ON p.commitmentId = c.id LEFT JOIN goods_receipt_notes g ON g.purchaseOrderId = p.id WHERE c.id = ? GROUP BY c.id) AS commitmentOpen", [projectA, tenantA, projectA, projectA, material.id, projectA, projectA, commitmentId]);
    expect(rows[0]).toMatchObject({ grns: 1, audits: 1, inventory: 0, actualCosts: actualCostsBefore + 1, actualAmount: "800.00", commitmentOpen: "200.00000" });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (SELECT id FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC') OR entityId IN (?, ?, ?, ?)", [projectA, purchaseOrder.id, inspection.id, ncr.id, material.id]); await connection.query("DELETE FROM goods_receipt_notes WHERE projectId = ? AND grnNumber = 'GRN-TRPC'", [projectA]); await connection.query("DELETE FROM cost_entries WHERE projectId = ? AND amount = 800 AND incurredAt = ?", [projectA, input.receivedAt]); await connection.query("DELETE FROM purchase_orders WHERE id IN (?, ?)", [purchaseOrder.id, foreignPurchaseOrderId]); await connection.query("DELETE FROM commitments WHERE id = ?", [commitmentId]); await connection.query("DELETE FROM quality_inspections WHERE id = ?", [inspection.id]); await connection.query("DELETE FROM ncrs WHERE id = ?", [ncr.id]); await connection.query("DELETE FROM material_masters WHERE id = ?", [material.id]);
  }, 120_000);

  it("governs site material requests through WBS/activity scope, partial issue, closure, and audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const material = await caller.materials.createMaster({ tenantId: tenantA, code: "MAT-PRQ-TRPC", description: "Procurement concrete", unitOfMeasure: "m3", category: "Concrete" });
    const supplier = await caller.procurement.createSupplier({ tenantId: tenantA, code: "SUP-TRPC", legalName: "Integration Supply Company", contactEmail: "supply@example.test" });
    const wbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "WBS-PRQ-TRPC", name: "Procurement work package", plannedValue: 12_000 });
    const activity = await caller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, code: "ACT-PRQ-TRPC", name: "Concrete placement", plannedValue: 12_000, plannedStartAt: new Date("2026-08-20T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-30T00:00:00.000Z") });
    const foreignWbsId = "71717171-7171-4717-8717-717171717171";
    const foreignPurchaseOrderId = "71717171-7171-4717-8717-717171717172";
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'WBS-PRQ-FOREIGN', 'Foreign work package', 1)", [foreignWbsId, tenantB, projectB]);
    await connection.query("INSERT INTO purchase_orders (id, tenantId, projectId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, 'PO-PRQ-FOREIGN', 'Foreign supplier', ?, 99, 'SAR', 'Foreign purchase order must not be linkable', 'approved', ?)", [foreignPurchaseOrderId, tenantB, projectB, new Date("2026-08-20T00:00:00.000Z"), integrationUserId]);
    await expect(caller.procurement.createRequisition({ tenantId: tenantA, projectId: projectB, requisitionNumber: "PR-BLOCKED", supplierId: supplier.id, materialId: material.id, wbsItemId: wbs.id, activityId: activity.id, description: "Blocked foreign request", requestedQuantity: 3, unitOfMeasure: "m3", requiredAt: new Date("2026-08-30T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.procurement.createRequisition({ tenantId: tenantA, projectId: projectA, requisitionNumber: "PR-WBS-BLOCKED", supplierId: supplier.id, materialId: material.id, wbsItemId: foreignWbsId, description: "Blocked foreign work package", requestedQuantity: 3, unitOfMeasure: "m3", requiredAt: new Date("2026-08-30T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_WBS_NOT_FOUND");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.procurement.createRequisition({ tenantId: tenantA, projectId: projectA, requisitionNumber: "PR-NO-LICENSE", supplierId: supplier.id, materialId: material.id, wbsItemId: wbs.id, activityId: activity.id, description: "Must not write without product entitlement", requestedQuantity: 3, unitOfMeasure: "m3", requiredAt: new Date("2026-08-30T00:00:00.000Z") })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    const requisition = await caller.procurement.createRequisition({ tenantId: tenantA, projectId: projectA, requisitionNumber: "PR-TRPC", supplierId: supplier.id, materialId: material.id, wbsItemId: wbs.id, activityId: activity.id, description: "Procure structural concrete", requestedQuantity: 12, unitOfMeasure: "m3", requiredAt: new Date("2026-08-30T00:00:00.000Z") });
    await expect(caller.procurement.transitionRequisition({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, nextStatus: "submitted" })).resolves.toMatchObject({ status: "submitted" });
    await expect(caller.procurement.transitionRequisition({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, nextStatus: "approved" })).resolves.toMatchObject({ status: "approved" });
    const purchaseOrder = await caller.purchaseOrders.create({ tenantId: tenantA, projectId: projectA, purchaseOrderNumber: "PO-PRQ-TRPC", supplierName: "Integration Supply Company", orderDate: new Date("2026-08-20T00:00:00.000Z"), amount: 1_200, currency: "SAR", summary: "Existing purchase order for approved material request" });
    await caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "submitted" });
    await caller.purchaseOrders.transitionStatus({ tenantId: tenantA, projectId: projectA, purchaseOrderId: purchaseOrder.id, nextStatus: "approved" });
    await expect(caller.procurement.linkPurchaseOrder({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, purchaseOrderId: foreignPurchaseOrderId })).rejects.toThrow("PROJECT_OS_PURCHASE_ORDER_NOT_FOUND");
    const [beforeLink] = await connection.query<{ purchaseOrders: number; purchaseOrderAmount: string; commitments: number; actualCosts: number }[]>("SELECT (SELECT COUNT(*) FROM purchase_orders WHERE projectId = ?) AS purchaseOrders, (SELECT amount FROM purchase_orders WHERE id = ?) AS purchaseOrderAmount, (SELECT COUNT(*) FROM commitments WHERE projectId = ?) AS commitments, (SELECT COUNT(*) FROM cost_entries WHERE projectId = ?) AS actualCosts", [projectA, purchaseOrder.id, projectA, projectA]);
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.procurement.linkPurchaseOrder({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, purchaseOrderId: purchaseOrder.id })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    await expect(caller.procurement.linkPurchaseOrder({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, purchaseOrderId: purchaseOrder.id })).resolves.toMatchObject({ requisitionId: requisition.id, purchaseOrderId: purchaseOrder.id });
    await expect(caller.procurement.linkPurchaseOrder({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, purchaseOrderId: purchaseOrder.id })).rejects.toThrow("PROJECT_OS_REQUISITION_PURCHASE_ORDER_ALREADY_LINKED");
    const [afterLink] = await connection.query<{ purchaseOrders: number; purchaseOrderAmount: string; commitments: number; actualCosts: number }[]>("SELECT (SELECT COUNT(*) FROM purchase_orders WHERE projectId = ?) AS purchaseOrders, (SELECT amount FROM purchase_orders WHERE id = ?) AS purchaseOrderAmount, (SELECT COUNT(*) FROM commitments WHERE projectId = ?) AS commitments, (SELECT COUNT(*) FROM cost_entries WHERE projectId = ?) AS actualCosts", [projectA, purchaseOrder.id, projectA, projectA]);
    expect(afterLink[0]).toEqual(beforeLink[0]);
    const warehouse = await caller.warehouses.create({ tenantId: tenantA, projectId: projectA, code: "WH-PRQ-TRPC", name: "Material request store" });
    await caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, transactionType: "receipt", quantityDelta: 12, occurredAt: new Date("2026-08-21T00:00:00.000Z") });
    await expect(caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, requisitionId: requisition.id, transactionType: "issue", quantityDelta: -5, occurredAt: new Date("2026-08-21T01:00:00.000Z") })).resolves.toMatchObject({ requisitionStatus: "partially_issued", issuedQuantity: 5 });
    await expect(caller.procurement.transitionRequisition({ tenantId: tenantA, projectId: projectA, requisitionId: requisition.id, nextStatus: "closed" })).rejects.toThrow("PROJECT_OS_REQUISITION_CLOSURE_NOT_FULFILLED");
    await expect(caller.warehouses.recordInventory({ tenantId: tenantA, projectId: projectA, warehouseId: warehouse.id, materialId: material.id, requisitionId: requisition.id, transactionType: "issue", quantityDelta: -7, occurredAt: new Date("2026-08-21T02:00:00.000Z") })).resolves.toMatchObject({ requisitionStatus: "closed", issuedQuantity: 12 });
    await expect(caller.procurement.register({ tenantId: tenantA, projectId: projectA })).resolves.toMatchObject({ suppliers: expect.arrayContaining([expect.objectContaining({ id: supplier.id })]), requisitions: expect.arrayContaining([expect.objectContaining({ id: requisition.id, status: "closed", issuedQuantity: 12, remainingQuantity: 0, purchaseOrder: expect.objectContaining({ id: purchaseOrder.id }), wbs: expect.objectContaining({ id: wbs.id }), activity: expect.objectContaining({ id: activity.id }), material: expect.objectContaining({ id: material.id }) })]) });
    const [rows] = await connection.query<{ suppliers: number; requisitions: number; issues: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM suppliers WHERE id = ? AND tenantId = ?) AS suppliers, (SELECT COUNT(*) FROM procurement_requisitions WHERE id = ? AND projectId = ? AND status = 'closed' AND purchaseOrderId = ?) AS requisitions, (SELECT COUNT(*) FROM warehouse_inventory_transactions WHERE requisitionId = ? AND transactionType = 'issue') AS issues, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action IN ('procurement.requisition_created','procurement.requisition_transitioned','procurement.requisition_purchase_order_linked','procurement.requisition_issued')) AS audits", [supplier.id, tenantA, requisition.id, projectA, purchaseOrder.id, requisition.id, tenantA, requisition.id]);
    expect(rows[0]).toMatchObject({ suppliers: 1, requisitions: 1, issues: 2, audits: 6 });
    await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?, ?, ?)", [supplier.id, requisition.id, wbs.id, activity.id, purchaseOrder.id]);
    await connection.query("DELETE FROM warehouse_inventory_transactions WHERE requisitionId = ? OR warehouseId = ?", [requisition.id, warehouse.id]);
    await connection.query("DELETE FROM _deprecated_warehouse_stock_balances WHERE warehouseId = ?", [warehouse.id]);
    await connection.query("DELETE FROM project_warehouses WHERE id = ?", [warehouse.id]);
    await connection.query("DELETE FROM procurement_requisitions WHERE id = ?", [requisition.id]);
    await connection.query("DELETE FROM purchase_orders WHERE id = ?", [purchaseOrder.id]);
    await connection.query("DELETE FROM purchase_orders WHERE id = ?", [foreignPurchaseOrderId]);
    await connection.query("DELETE FROM activities WHERE id = ?", [activity.id]);
    await connection.query("DELETE FROM evm_wbs_snapshots WHERE wbsItemId = ?", [wbs.id]);
    await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbs.id]);
    await connection.query("DELETE FROM evm_wbs_snapshots WHERE wbsItemId = ?", [foreignWbsId]);
    await connection.query("DELETE FROM wbs_items WHERE id = ?", [foreignWbsId]);
    await connection.query("DELETE FROM suppliers WHERE id = ?", [supplier.id]);
    await connection.query("DELETE FROM material_masters WHERE id = ?", [material.id]);
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);

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
    await connection.query("DELETE FROM internal_notifications WHERE entityId = ?", [health.id]); await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [evm.id, health.id, wbs.id, activity.id, progress.id, budget.id, cost.id, risk.id, action.id, rfi.id, ncr.id, hse.id]); await connection.query("DELETE FROM project_health_snapshots WHERE id = ?", [health.id]); await connection.query("DELETE FROM evm_wbs_snapshots WHERE snapshotId = ?", [evm.id]); await connection.query("DELETE FROM evm_snapshots WHERE id = ?", [evm.id]); await connection.query("DELETE FROM hse_observations WHERE id = ?", [hse.id]); await connection.query("DELETE FROM ncrs WHERE id = ?", [ncr.id]); await connection.query("DELETE FROM rfis WHERE id = ?", [rfi.id]); await connection.query("DELETE FROM actions WHERE id = ?", [action.id]); await connection.query("DELETE FROM risks WHERE id = ?", [risk.id]); await connection.query("DELETE FROM cost_entries WHERE id = ?", [cost.id]); await connection.query("DELETE FROM budget_lines WHERE id = ?", [budget.id]); await connection.query("DELETE FROM progress_entries WHERE id = ?", [progress.id]); await connection.query("DELETE FROM activities WHERE id = ?", [activity.id]); await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbs.id]);
  }, 120_000);

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
  }, 120_000);

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
    const caller = appRouter.createCaller(context);
    const dashboard = await caller.dashboards.executive({ tenantId: tenantA });
    expect(dashboard.cashFlow).toEqual({ plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 });
    expect(dashboard.cashFlowByProject).toEqual([expect.objectContaining({ id: projectA, totalExposure: 550, remainingBudget: 450 })]);
    expect(dashboard.cashFlowByPortfolio).toEqual([expect.objectContaining({ portfolioId: "int-portfolio-a", code: "INT-PORT-A", totalExposure: 550, remainingBudget: 450, projectCount: 1 })]);
    await expect(caller.dashboards.executiveOverview({ tenantId: tenantA })).resolves.toMatchObject({ totals: expect.any(Object), projects: expect.any(Array), decisions: expect.any(Array) });
    await expect(caller.dashboards.executiveMetrics({ tenantId: tenantA })).resolves.toMatchObject({ totals: expect.any(Object) });
    await expect(caller.dashboards.executiveProjects({ tenantId: tenantA })).resolves.toMatchObject({ projects: expect.any(Array) });
    await expect(caller.dashboards.executiveDecisions({ tenantId: tenantA })).resolves.toMatchObject({ decisions: expect.any(Array) });
    await expect(caller.dashboards.executiveCashFlow({ tenantId: tenantA })).resolves.toMatchObject({ cashFlow: { plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 } });
    await expect(caller.projects.getControlsSchedule({ tenantId: tenantA, projectId: projectA })).resolves.toMatchObject({ project: expect.any(Object), wbs: expect.any(Array), activities: expect.any(Array) });
    await expect(caller.projects.getControlsFinancials({ tenantId: tenantA, projectId: projectA })).resolves.toMatchObject({ wbs: expect.any(Array), budgets: expect.any(Array), costs: expect.any(Array), progress: expect.any(Array) });
    await expect(caller.projects.getControlsPerformance({ tenantId: tenantA, projectId: projectA })).resolves.toMatchObject({ cashFlow: { plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 } });
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

  it("governs employee records, contracts, protected identity reads, and archival with entitlement and tenant isolation", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const employeeInput = { employeeNumber: "EMP-TRPC-01", fullName: "Integration Employee", jobTitle: "Planning Engineer", department: "Planning", hireDate: new Date("2026-08-01T00:00:00.000Z"), nationality: "Saudi", identityDocumentType: "National ID", identityReference: "ID-REDACTED-001", retentionPolicy: "standard" as const };
    await expect(caller.employees.create({ tenantId: tenantB, ...employeeInput })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.employees.create({ tenantId: tenantA, ...employeeInput })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    const employee = await caller.employees.create({ tenantId: tenantA, ...employeeInput });
    const listed = await caller.employees.list({ tenantId: tenantA });
    expect(listed.find(item => item.id === employee.id)).toBeTruthy();
    expect(listed.find(item => item.id === employee.id)).not.toHaveProperty("identityReference");
    const identity = await caller.employees.identity({ tenantId: tenantA, employeeId: employee.id });
    expect(identity.identityReference).toBe("ID-REDACTED-001");
    const contract = await caller.employees.contracts.create({ tenantId: tenantA, employeeId: employee.id, contractType: "permanent", startDate: new Date("2026-08-01T00:00:00.000Z"), probationEndDate: new Date("2026-11-01T00:00:00.000Z"), retentionPolicy: "standard" });
    await expect(caller.employees.contracts.list({ tenantId: tenantB, employeeId: employee.id })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(caller.employees.archive({ tenantId: tenantA, employeeId: employee.id })).resolves.toMatchObject({ id: employee.id, employmentStatus: "terminated" });
    const [rows] = await connection.query<{ contracts: number; archived: string; auditActions: number; identityAudit: number }[]>("SELECT (SELECT COUNT(*) FROM employment_contracts WHERE id = ?) AS contracts, (SELECT employmentStatus FROM employees WHERE id = ?) AS archived, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND entityId IN (?, ?)) AS auditActions, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'hr.employee_identity_viewed' AND entityId = ?) AS identityAudit", [contract.id, employee.id, tenantA, employee.id, contract.id, tenantA, employee.id]);
    expect(rows[0]).toMatchObject({ contracts: 1, archived: "terminated", auditActions: 4, identityAudit: 1 });
  }, 120_000);

  it("governs employee assignments, attendance, capacity warnings, and approved time into cost and progress", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    const employee = await caller.employees.create({ tenantId: tenantA, employeeNumber: "EMP-ASSIGN-01", fullName: "Assignment Employee", jobTitle: "Site Engineer", department: "Delivery", hireDate: new Date("2026-09-01T00:00:00.000Z"), linkedUserId: integrationUserId, retentionPolicy: "standard" });
    const resource = await caller.resources.create({ tenantId: tenantA, projectId: projectA, resourceCode: "ASSIGN-LABOR", name: "Assigned labor", resourceType: "labor", plannedUnits: 100, allocatedUnits: 0, unitCost: 150, currency: "SAR" });
    const wbs = await caller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "ASSIGN-WBS", name: "Assignment work", plannedValue: 20_000 });
    const activity = await caller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, code: "ASSIGN-ACT", name: "Assignment activity", plannedValue: 20_000, plannedStartAt: new Date("2026-09-06T00:00:00.000Z"), plannedFinishAt: new Date("2026-09-10T23:59:59.000Z") });
    const assignmentInput = { employeeId: employee.id, projectResourceId: resource.id, wbsItemId: wbs.id, activityId: activity.id, plannedStartAt: new Date("2026-09-06T00:00:00.000Z"), plannedFinishAt: new Date("2026-09-10T23:59:59.000Z"), plannedHours: 45 };
    await expect(caller.assignments.create({ tenantId: tenantA, projectId: projectB, ...assignmentInput })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(caller.assignments.create({ tenantId: tenantB, projectId: projectB, ...assignmentInput })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.assignments.create({ tenantId: tenantA, projectId: projectA, ...assignmentInput })).rejects.toThrow("PROJECT product is not licensed");
      await expect(caller.employees.attendance.create({ tenantId: tenantA, projectId: projectA, employeeId: employee.id, attendanceDate: new Date("2026-09-07T00:00:00.000Z"), attendanceStatus: "present" })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    const assignment = await caller.assignments.create({ tenantId: tenantA, projectId: projectA, ...assignmentInput });
    expect(assignment.capacity).toMatchObject({ availableHours: 40, exceedsCapacity: true, warningCode: "PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED" });
    await expect(caller.assignments.options({ tenantId: tenantA, projectId: projectA })).resolves.toEqual({ employees: expect.arrayContaining([expect.objectContaining({ id: employee.id })]), resources: expect.arrayContaining([expect.objectContaining({ id: resource.id })]), wbs: expect.arrayContaining([expect.objectContaining({ id: wbs.id })]), activities: expect.arrayContaining([expect.objectContaining({ id: activity.id, wbsItemId: wbs.id })]) });
    await expect(caller.assignments.list({ tenantId: tenantA, projectId: projectA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: assignment.id, employeeId: employee.id })]));
    await expect(caller.assignments.timeEntries.create({ tenantId: tenantA, projectId: projectA, assignmentId: assignment.id, workDate: new Date("2026-09-07T00:00:00.000Z"), actualHours: 8, reportedProgressPercent: 20 })).rejects.toThrow("PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED");
    const attendance = await caller.employees.attendance.create({ tenantId: tenantA, projectId: projectA, employeeId: employee.id, attendanceDate: new Date("2026-09-07T00:00:00.000Z"), attendanceStatus: "present" });
    await expect(caller.employees.attendance.list({ tenantId: tenantA, projectId: projectA, employeeId: employee.id })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: attendance.id, attendanceStatus: "present" })]));
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.employees.attendance.transition({ tenantId: tenantA, projectId: projectA, attendanceId: attendance.id, status: "submitted" })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    await caller.employees.attendance.transition({ tenantId: tenantA, projectId: projectA, attendanceId: attendance.id, status: "submitted" });
    await caller.employees.attendance.transition({ tenantId: tenantA, projectId: projectA, attendanceId: attendance.id, status: "approved" });
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.assignments.timeEntries.create({ tenantId: tenantA, projectId: projectA, assignmentId: assignment.id, workDate: new Date("2026-09-07T00:00:00.000Z"), actualHours: 8, reportedProgressPercent: 20 })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    const time = await caller.assignments.timeEntries.create({ tenantId: tenantA, projectId: projectA, assignmentId: assignment.id, workDate: new Date("2026-09-07T00:00:00.000Z"), actualHours: 8, reportedProgressPercent: 20 });
    await expect(caller.assignments.timeEntries.list({ tenantId: tenantA, projectId: projectA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: time.id, status: "draft" })]));
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.assignments.timeEntries.transition({ tenantId: tenantA, projectId: projectA, timeEntryId: time.id, status: "submitted" })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    await caller.assignments.timeEntries.transition({ tenantId: tenantA, projectId: projectA, timeEntryId: time.id, status: "submitted" });
    const approved = await caller.assignments.timeEntries.transition({ tenantId: tenantA, projectId: projectA, timeEntryId: time.id, status: "approved" });
    const [rows] = await connection.query<{ amount: string; posted: number; progress: number; audits: number }[]>("SELECT (SELECT amount FROM cost_entries WHERE id = ?) AS amount, (SELECT COUNT(*) FROM cost_entries WHERE id = ? AND status = 'posted' AND entryType = 'actual') AS posted, (SELECT COUNT(*) FROM progress_entries WHERE id = ? AND status = 'submitted') AS progress, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND entityId IN (?, ?, ?)) AS audits", [approved.costEntryId, approved.costEntryId, approved.progressEntryId, tenantA, assignment.id, attendance.id, time.id]);
    expect(rows[0]).toMatchObject({ amount: "1200.00", posted: 1, progress: 1, audits: 7 });
    await expect(caller.performance.get({ tenantId: tenantB, projectId: projectB, employeeId: employee.id })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(caller.performance.get({ tenantId: tenantA, projectId: projectA })).rejects.toThrow("PROJECT product is not licensed");
      await expect(caller.performance.objections.create({ tenantId: tenantA, projectId: projectA, statement: "The operating evidence should be reviewed before any interpretation." })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    const beforeExclusion = await caller.performance.get({ tenantId: tenantA, projectId: projectA });
    expect(beforeExclusion).toMatchObject({ employee: { id: employee.id, isOwn: true }, metrics: { sourceCounts: { activity: 1 } } });
    expect(beforeExclusion.metrics.assignedCount).toBeGreaterThanOrEqual(1);
    const unassignedEmployee = await caller.employees.create({ tenantId: tenantA, employeeNumber: "EMP-PERF-UNASSIGNED", fullName: "Unassigned Performance Employee", jobTitle: "Engineer", department: "Delivery", hireDate: new Date("2026-09-01T00:00:00.000Z"), retentionPolicy: "standard" });
    await expect(caller.performance.get({ tenantId: tenantA, projectId: projectA, employeeId: unassignedEmployee.id })).rejects.toThrow("PROJECT_OS_ASSIGNMENT_NOT_FOUND");
    await expect(caller.performance.exclude({ tenantId: tenantA, projectId: projectB, employeeId: employee.id, sourceType: "activity", sourceId: activity.id, reason: "External client access delay documented outside the employee's control." })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const exclusion = await caller.performance.exclude({ tenantId: tenantA, projectId: projectA, employeeId: employee.id, sourceType: "activity", sourceId: activity.id, reason: "External client access delay documented outside the employee's control." });
    expect((await caller.performance.get({ tenantId: tenantA, projectId: projectA })).metrics).toMatchObject({ assignedCount: beforeExclusion.metrics.assignedCount - 1, excludedCount: 1 });
    const objection = await caller.performance.objections.create({ tenantId: tenantA, projectId: projectA, statement: "The documented dependency delay should be considered with this calculated indicator." });
    const [beforeRejectedResolution] = await connection.query<{ status: string; auditCount: number }[]>("SELECT (SELECT status FROM employee_performance_objections WHERE id = ?) AS status, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND entityId = ?) AS auditCount", [objection.id, tenantA, objection.id]);
    await expect(caller.performance.objections.transition({ tenantId: tenantA, projectId: projectA, objectionId: objection.id, status: "resolved" })).rejects.toThrow("PROJECT_OS_PERFORMANCE_RESOLUTION_REQUIRED");
    const [afterRejectedResolution] = await connection.query<{ status: string; auditCount: number }[]>("SELECT (SELECT status FROM employee_performance_objections WHERE id = ?) AS status, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND entityId = ?) AS auditCount", [objection.id, tenantA, objection.id]);
    expect(afterRejectedResolution).toEqual(beforeRejectedResolution);
    await expect(caller.performance.objections.transition({ tenantId: tenantA, projectId: projectA, objectionId: objection.id, status: "resolved", resolutionNote: "The documented external dependency has been recorded for the review." })).resolves.toMatchObject({ previousStatus: "submitted", status: "resolved" });
    const [performanceAudits] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE tenantId = ? AND entityId IN (?, ?)", [tenantA, exclusion.id, objection.id]);
    expect(performanceAudits[0].count).toBe(3);
  }, 120_000);

  it("governs payroll by role, protects salary reads, separates approval, and posts allocated labor cost into numeric EVM evidence", async () => {
    const makeContext = (id: number, openId: string, name: string): TrpcContext => ({ user: { id, openId, name, email: `${openId}@test.local`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const hrCaller = appRouter.createCaller(makeContext(integrationUserId, "integration-test-user", "Integration HR User"));
    const accountantCaller = appRouter.createCaller(makeContext(accountantUserId, "integration-accountant-user", "Integration Accountant User"));
    const financeCaller = appRouter.createCaller(makeContext(financeUserId, "integration-finance-user", "Integration Finance User"));
    const period = { periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T23:59:59.000Z") };
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('int-membership-finance', ?, ?, 'active')", [tenantA, financeUserId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-finance', 'int-membership-finance', 'int-role-finance', 'company')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('int-membership-accountant', ?, ?, 'active')", [tenantA, accountantUserId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('int-membership-role-accountant', 'int-membership-accountant', 'int-role-accountant', 'company')");
    await expect(hrCaller.employees.payroll.capabilities({ tenantId: tenantA })).resolves.toEqual({ canManageStructure: true, canRunPayroll: false, canApprovePayroll: false, canReadSensitivePayroll: true });
    await expect(accountantCaller.employees.payroll.capabilities({ tenantId: tenantA })).resolves.toEqual({ canManageStructure: false, canRunPayroll: true, canApprovePayroll: false, canReadSensitivePayroll: false });
    await expect(financeCaller.employees.payroll.capabilities({ tenantId: tenantA })).resolves.toEqual({ canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true });

    const employee = await hrCaller.employees.create({ tenantId: tenantA, employeeNumber: "EMP-PAYROLL-01", fullName: "Payroll Evidence Employee", jobTitle: "Planner", department: "Planning", hireDate: new Date("2026-08-01T00:00:00.000Z"), retentionPolicy: "standard" });
    expect((await hrCaller.employees.list({ tenantId: tenantA })).find(item => item.id === employee.id)).not.toHaveProperty("baseSalary");
    await expect(hrCaller.employees.payroll.salaryStructure.save({ tenantId: tenantB, employeeId: employee.id, baseSalary: 10_000, housingAllowance: 2_000, transportAllowance: 800, hardshipAllowance: 200, gosiRate: 0.0975, otherDeductions: 300, eosMonthlyAccrual: 750, currency: "SAR" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    try {
      await expect(hrCaller.employees.payroll.salaryStructure.save({ tenantId: tenantA, employeeId: employee.id, baseSalary: 10_000, housingAllowance: 2_000, transportAllowance: 800, hardshipAllowance: 200, gosiRate: 0.0975, otherDeductions: 300, eosMonthlyAccrual: 750, currency: "SAR" })).rejects.toThrow("PROJECT product is not licensed");
    } finally {
      await connection.query("UPDATE tenant_entitlements SET active = true WHERE tenantId = ? AND productCode = 'PROJECT'", [tenantA]);
    }
    const structure = await hrCaller.employees.payroll.salaryStructure.save({ tenantId: tenantA, employeeId: employee.id, baseSalary: 10_000, housingAllowance: 2_000, transportAllowance: 800, hardshipAllowance: 200, gosiRate: 0.0975, otherDeductions: 300, eosMonthlyAccrual: 750, currency: "SAR" });
    await expect(hrCaller.employees.payroll.salaryStructure.get({ tenantId: tenantA, employeeId: employee.id })).resolves.toMatchObject({ id: structure.id, baseSalary: "10000.00", currency: "SAR" });
    await expect(accountantCaller.employees.payroll.salaryStructure.get({ tenantId: tenantA, employeeId: employee.id })).rejects.toThrow("Required permission is not granted");
    await expect(hrCaller.employees.payroll.createRun({ tenantId: tenantA, ...period })).rejects.toThrow("Required permission is not granted");
    const run = await accountantCaller.employees.payroll.createRun({ tenantId: tenantA, ...period });
    await expect(accountantCaller.employees.payroll.createRun({ tenantId: tenantB, ...period })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await accountantCaller.employees.payroll.transition({ tenantId: tenantA, payrollRunId: run.id, status: "review" });
    await connection.query("INSERT INTO payroll_runs (id, tenantId, periodStart, periodEnd, status, createdByUserId, reviewedByUserId) VALUES ('00000000-0000-4000-8000-0000000000e1', ?, '2026-10-01', '2026-10-31', 'review', ?, ?)", [tenantA, financeUserId, financeUserId]);
    await expect(financeCaller.employees.payroll.transition({ tenantId: tenantA, payrollRunId: "00000000-0000-4000-8000-0000000000e1", status: "approved" })).rejects.toThrow("PROJECT_OS_PAYROLL_APPROVER_SEPARATION");
    await financeCaller.employees.payroll.transition({ tenantId: tenantA, payrollRunId: run.id, status: "approved" });
    await expect(financeCaller.employees.payroll.runs({ tenantId: tenantA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: run.id, status: "approved", entryCount: 1 })]));
    const details = await financeCaller.employees.payroll.details({ tenantId: tenantA, payrollRunId: run.id });
    expect(details.entries).toEqual([expect.objectContaining({ employeeId: employee.id, grossPay: 13_000, gosiDeduction: 1267.5, netPay: 11_432.5, laborActualCost: 13_750 })]);
    expect(details.payslips).toEqual([expect.objectContaining({ format: "project-os.payslip", currency: "SAR", totals: { netPay: 11_432.5, laborActualCost: 13_750, eosMonthlyAccrual: 750 } })]);
    const payrollEntry = details.entries[0]!;
    const wbs = await hrCaller.wbs.create({ tenantId: tenantA, projectId: projectA, code: "PAY-WBS", name: "Payroll allocation work", plannedValue: 100_000 });
    const activity = await hrCaller.activities.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, code: "PAY-ACT", name: "Payroll allocation activity", plannedValue: 100_000, plannedStartAt: new Date("2026-09-01T00:00:00.000Z"), plannedFinishAt: new Date("2026-09-30T23:59:59.000Z") });
    await hrCaller.budgets.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, costCode: "PAYROLL", originalAmount: 100_000, currentAmount: 100_000 });
    await hrCaller.progress.create({ tenantId: tenantA, projectId: projectA, wbsItemId: wbs.id, percentComplete: 50, reportedAt: new Date("2026-09-30T23:59:59.000Z") });
    await expect(financeCaller.employees.payroll.allocationProjects({ tenantId: tenantA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: projectA })]));
    await expect(financeCaller.employees.payroll.allocationOptions({ tenantId: tenantA, projectId: projectA })).resolves.toEqual({ wbs: expect.arrayContaining([expect.objectContaining({ id: wbs.id })]), activities: expect.arrayContaining([expect.objectContaining({ id: activity.id, wbsItemId: wbs.id })]) });
    await expect(financeCaller.employees.payroll.allocateCost({ tenantId: tenantA, payrollEntryId: payrollEntry.id, projectId: projectB, wbsItemId: wbs.id, activityId: activity.id, amount: 13_750, incurredAt: new Date("2026-09-30T23:59:59.000Z") })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const allocation = await financeCaller.employees.payroll.allocateCost({ tenantId: tenantA, payrollEntryId: payrollEntry.id, projectId: projectA, wbsItemId: wbs.id, activityId: activity.id, amount: 13_750, incurredAt: new Date("2026-09-30T23:59:59.000Z") });
    const [costRows] = await connection.query<{ amount: string; status: string; entryType: string; incurredAt: Date; allocations: number; auditActions: number }[]>("SELECT c.amount, c.status, c.entryType, c.incurredAt, (SELECT COUNT(*) FROM payroll_allocations WHERE id = ?) AS allocations, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action IN ('payroll.salary_structure_viewed', 'payroll.run_details_viewed', 'payroll.cost_allocated')) AS auditActions FROM cost_entries c WHERE c.id = ?", [allocation.id, tenantA, allocation.costEntryId]);
    expect(costRows[0]).toMatchObject({ amount: "13750.00", status: "posted", entryType: "actual", allocations: 1, auditActions: 3 });
    const evm = calculateOperationalEvm({ periodAt: new Date("2026-09-30T23:59:59.000Z"), activities: [{ plannedValue: 100_000, plannedStartAt: new Date("2026-09-01T00:00:00.000Z"), plannedFinishAt: new Date("2026-09-30T23:59:59.000Z") }], budgets: [{ currentAmount: 100_000 }], costs: [{ amount: costRows[0]!.amount, status: costRows[0]!.status, entryType: costRows[0]!.entryType, incurredAt: costRows[0]!.incurredAt }], progress: [{ wbsItemId: wbs.id, progressPercent: 50, status: "submitted", measuredAt: new Date("2026-09-30T23:59:59.000Z") }], wbs: [{ id: wbs.id, plannedValue: 100_000 }], eacMethod: "bac_over_cpi" });
    expect(evm).toMatchObject({ ac: 13_750, cpi: 3.6364, sources: { postedActualCostEntries: 1, wbsItemsWithProgress: 1 } });
    const [auditRows] = await connection.query<{ structure: number; details: number; allocation: number }[]>("SELECT SUM(action = 'payroll.salary_structure_viewed') AS structure, SUM(action = 'payroll.run_details_viewed') AS details, SUM(action = 'payroll.cost_allocated') AS allocation FROM audit_logs WHERE tenantId = ?", [tenantA]);
    expect(auditRows[0]).toMatchObject({ structure: "1", details: "1", allocation: "1" });
    expect(structure.id).toBeTruthy();
  }, 120_000);

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

  it("rejects foreign or unentitled dashboard-section reporting and notifies the tenant owner with audit evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.dashboards.reportSectionIssue({ tenantId: tenantA, projectId: projectB, product: "PROJECT", sectionKey: "project_performance", state: "error" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE id = 'int-ent-a'");
    await expect(caller.dashboards.reportSectionIssue({ tenantId: tenantA, projectId: projectA, product: "PROJECT", sectionKey: "project_performance", state: "error" })).rejects.toThrow("The PROJECT product is not licensed for this tenant.");
    await connection.query("UPDATE tenant_entitlements SET active = true WHERE id = 'int-ent-a'");
    await expect(caller.dashboards.reportSectionIssue({ tenantId: tenantA, projectId: projectA, product: "PROJECT", sectionKey: "project_performance", state: "error" })).resolves.toMatchObject({ reported: true, recipientCount: 1 });
    await expect(caller.dashboards.reportSectionIssue({ tenantId: tenantA, projectId: projectA, product: "PROJECT", sectionKey: "project_performance", state: "error" })).resolves.toMatchObject({ reported: false, recipientCount: 0 });
    const [rows] = await connection.query<{ notifications: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM internal_notifications WHERE tenantId = ? AND projectId = ? AND notificationCode = 'DASHBOARD_SECTION_ATTENTION') AS notifications, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'dashboard.section_attention_reported' AND entityType = 'dashboard_section') AS audits", [tenantA, projectA, tenantA]);
    expect(rows[0]).toMatchObject({ notifications: 1, audits: 1 });
    await connection.query("DELETE FROM internal_notifications WHERE tenantId = ? AND projectId = ? AND notificationCode = 'DASHBOARD_SECTION_ATTENTION'", [tenantA, projectA]);
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ? AND action = 'dashboard.section_attention_reported'", [tenantA]);
  });
  it("creates a self-service trial, rejects foreign billing access, and records a VAT invoice with governed manual payment evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const slug = `self-signup-${Date.now()}`; let tenantId: string | undefined; let subscriptionId: string | undefined; let invoiceId: string | undefined; let paymentId: string | undefined;
    try {
      const plans = await caller.selfService.plans(); expect(plans.some(plan => plan.code === "ALL_IN_ONE_STANDARD" && plan.packageCode === "ALL-IN-ONE")).toBe(true);
      await expect(caller.selfService.signup({ legalName: "Duplicate workspace", slug: "integration-a", planCode: "ALL_IN_ONE_STANDARD", seats: 2 })).rejects.toThrow("PROJECT_OS_WORKSPACE_SLUG_EXISTS");
      const signup = await caller.selfService.signup({ legalName: "Self-service integration tenant", slug, planCode: "ALL_IN_ONE_STANDARD", seats: 2 }); tenantId = signup.tenantId; subscriptionId = signup.subscriptionId;
      const [signupRows] = await connection.query<{ activeEntitlements: number; ownerMemberships: number; ownerRoles: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM tenant_entitlements WHERE tenantId = ? AND active = true) AS activeEntitlements, (SELECT COUNT(*) FROM memberships WHERE tenantId = ? AND userId = ? AND status = 'active') AS ownerMemberships, (SELECT COUNT(*) FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId INNER JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND m.userId = ? AND r.code = 'TENANT_OWNER' AND mr.scopeType = 'company') AS ownerRoles, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action = 'self_service.tenant_created') AS audits", [tenantId, tenantId, integrationUserId, tenantId, integrationUserId, tenantId]);
      expect(signupRows[0]).toMatchObject({ activeEntitlements: 3, ownerMemberships: 1, ownerRoles: 1, audits: 1 });
      await expect(appRouter.createCaller({ user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }).billing.register({ tenantId })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      const invoice = await caller.billing.issueInvoice({ tenantId, subscriptionId, subtotalAmount: 100, sellerName: "Dashio Seller", sellerTaxNumber: "300000000000003", buyerName: "Self-service integration tenant", buyerTaxNumber: "310000000000003", currency: "SAR" }); invoiceId = invoice.id; expect(invoice).toMatchObject({ invoiceNumber: expect.stringMatching(/^INV-\d{8}$/), subtotalAmount: "100", vatAmount: "15", totalAmount: "115" });
      const payment = await caller.billing.createPayment({ tenantId, subscriptionId, invoiceId, provider: "manual", operation: "create", amount: 115, currency: "SAR" }); paymentId = payment.id; expect(payment).toMatchObject({ provider: "manual", status: "pending" });
      await expect(caller.billing.confirmManualPayment({ tenantId, paymentId })).resolves.toMatchObject({ status: "confirmed", subscription: { previousStatus: "trialing", status: "active", entitlementsActive: true } });
      const register = await caller.billing.register({ tenantId }); expect(register.invoices.map(invoice => invoice.id)).toContain(invoiceId); expect(register.payments.find(payment => payment.id === paymentId)).toMatchObject({ status: "confirmed", provider: "manual" });
      const mockRenewal = await caller.billing.createPayment({ tenantId, subscriptionId, invoiceId, provider: "mock", operation: "renew", amount: 115, currency: "SAR" }); expect(mockRenewal).toMatchObject({ provider: "mock", status: "confirmed" });
      const mockCancellation = await caller.billing.createPayment({ tenantId, subscriptionId, invoiceId, provider: "mock", operation: "cancel", amount: 0, currency: "SAR" }); expect(mockCancellation).toMatchObject({ provider: "mock", status: "cancelled" });
      const mockRefund = await caller.billing.createPayment({ tenantId, subscriptionId, invoiceId, provider: "mock", operation: "refund", amount: 115, currency: "SAR" }); expect(mockRefund).toMatchObject({ provider: "mock", status: "refunded" });
      const [rows] = await connection.query<{ activeLicenses: number; cancelledLicenses: number; inactiveEntitlements: number; invoices: number; payments: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM tenant_licenses WHERE tenantId = ? AND status = 'active') AS activeLicenses, (SELECT COUNT(*) FROM tenant_licenses WHERE tenantId = ? AND status = 'cancelled') AS cancelledLicenses, (SELECT COUNT(*) FROM tenant_entitlements WHERE tenantId = ? AND active = false) AS inactiveEntitlements, (SELECT COUNT(*) FROM invoices WHERE id = ?) AS invoices, (SELECT COUNT(*) FROM payment_records WHERE tenantId = ?) AS payments, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action IN ('self_service.tenant_created','billing.invoice_issued','billing.payment_recorded','billing.manual_payment_confirmed','billing.subscription_state_applied')) AS audits", [tenantId, tenantId, tenantId, invoiceId, tenantId, tenantId]);
      expect(rows[0]).toMatchObject({ activeLicenses: 0, cancelledLicenses: 1, inactiveEntitlements: 3, invoices: 1, payments: 4, audits: 11 });
    } finally {
      if (tenantId) { await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM payment_records WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM invoices WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [tenantId]); await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [tenantId]); await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [tenantId]); await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenantId]); await connection.query("DELETE FROM companies WHERE id = ?", [tenantId]); }
      await connection.query("DELETE FROM self_service_signup_attempts WHERE userId = ?", [integrationUserId]);
    }
  }, 120_000);
  it("rejects foreign support access and governs knowledge-backed ticket conversation with escalation evidence", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context); const sourceA = "00000000-0000-4000-8000-0000000000e1"; const sourceB = "00000000-0000-4000-8000-0000000000e2"; let ticketId: string | undefined; let articleId: string | undefined;
    try {
      await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?) AND action LIKE 'support.%'", [tenantA, tenantB]); await connection.query("DELETE FROM support_messages WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection.query("DELETE FROM support_tickets WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection.query("DELETE FROM knowledge_articles WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection.query("DELETE FROM project_documents WHERE id IN (?, ?)", [sourceA, sourceB]);
      await connection.query("INSERT INTO project_documents (id, tenantId, projectId, documentNumber, title, category, status, createdByUserId) VALUES (?, ?, ?, ?, ?, 'report', 'approved', ?), (?, ?, ?, ?, ?, 'report', 'approved', ?)", [sourceA, tenantA, projectA, "SUP-KB-A", "Approved tenant A support source", integrationUserId, sourceB, tenantB, projectB, "SUP-KB-B", "Approved tenant B support source", integrationUserId]);
      await expect(caller.support.knowledge.create({ tenantId: tenantA, sourceDocumentId: sourceB, title: "Foreign article", content: "Never publish cross-tenant guidance.", publish: true })).rejects.toThrow("PROJECT_OS_SUPPORT_SOURCE_DOCUMENT_NOT_ALLOWED");
      const article = await caller.support.knowledge.create({ tenantId: tenantA, sourceDocumentId: sourceA, title: "Approved onboarding guidance", content: "Use the approved workspace administration controls for membership management.", publish: true }); articleId = article.id;
      await expect(caller.support.knowledge.list({ tenantId: tenantA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: articleId, status: "published" })]));
      await expect(caller.support.knowledge.sources({ tenantId: tenantA })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: sourceA, documentNumber: "SUP-KB-A" })]));
      const unassigned = appRouter.createCaller({ user: { id: unassignedUserId, openId: "integration-unassigned-user", name: "Unassigned Test User", email: "unassigned@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] }); await expect(unassigned.support.tickets({ tenantId: tenantA })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      const ticket = await caller.support.create({ tenantId: tenantA, subject: "Need help with members", category: "account", priority: "normal", body: "How should I manage workspace memberships?", tags: ["onboarding", "access"] }); ticketId = ticket.id; await expect(caller.support.claim({ tenantId: tenantA, ticketId })).resolves.toMatchObject({ status: "in_progress" }); await caller.support.reply({ tenantId: tenantA, ticketId, body: "Please confirm the approved procedure." });
      const thread = await caller.support.ticket({ tenantId: tenantA, ticketId }); expect(thread.ticket).toMatchObject({ escalationStatus: "escalated", status: "waiting_customer", ownerUserId: integrationUserId }); expect(JSON.parse(thread.ticket.tagsJson)).toEqual(expect.arrayContaining(["account", "priority:normal", "onboarding", "access"])); expect(thread.messages.map(message => message.senderType)).toEqual(expect.arrayContaining(["customer", "assistant", "agent"])); expect(thread.messages.filter(message => message.senderType === "assistant").every(message => message.citationsJson === "[]")).toBe(true);
      await expect(caller.support.transition({ tenantId: tenantA, ticketId, status: "resolved", escalationStatus: "escalated", ownerUserId: integrationUserId, tags: ["resolved", "knowledge-backed"] })).resolves.toMatchObject({ status: "resolved" });
      const [rows] = await connection.query<{ tickets: number; messages: number; articles: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM support_tickets WHERE id = ? AND tagsJson = ?) AS tickets, (SELECT COUNT(*) FROM support_messages WHERE ticketId = ?) AS messages, (SELECT COUNT(*) FROM knowledge_articles WHERE id = ? AND status = 'published') AS articles, (SELECT COUNT(*) FROM audit_logs WHERE tenantId = ? AND action LIKE 'support.%') AS audits", [ticketId, JSON.stringify(["resolved", "knowledge-backed"]), ticketId, articleId, tenantA]); expect(rows[0]).toMatchObject({ tickets: 1, messages: 3, articles: 1, audits: 6 });
    } finally {
      await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?) AND action LIKE 'support.%'", [tenantA, tenantB]); await connection.query("DELETE FROM support_messages WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection.query("DELETE FROM support_tickets WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection.query("DELETE FROM knowledge_articles WHERE tenantId IN (?, ?)", [tenantA, tenantB]); await connection.query("DELETE FROM project_documents WHERE id IN (?, ?)", [sourceA, sourceB]);
    }
  }, 120_000);
});
