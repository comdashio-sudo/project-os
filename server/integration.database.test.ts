import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

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
    await connection.query("DELETE FROM data_import_errors WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenantA]);
    await connection.query("DELETE FROM hse_observations WHERE id IN ('int-hse-a','int-hse-b')");
    await connection.query("DELETE FROM ncrs WHERE ncrNumber = 'NCR-TRPC'");
    await connection.query("DELETE FROM rfis WHERE rfiNumber = 'RFI-TRPC'");
    await connection.query("DELETE FROM issues WHERE code = 'ISSUE-TRPC'");
    await connection.query("DELETE FROM contracts WHERE code = 'CONTRACT-TRPC'");
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

  afterAll(async () => { await connection?.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM data_import_errors WHERE importId IN (SELECT id FROM data_imports WHERE tenantId = ?)", [tenantA]); await connection?.query("DELETE FROM data_imports WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM master_plan_spatial_entities WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM master_plan_versions WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM master_plans WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM progress_entries WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM cost_entries WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM budget_lines WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM evm_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM project_health_snapshots WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM internal_notifications WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM activities WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM wbs_items WHERE projectId IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [tenantA]); await connection?.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM hse_observations WHERE id IN ('int-hse-a','int-hse-b') OR observationNumber = 'HSE-TRPC'"); await connection?.query("DELETE FROM ncrs WHERE ncrNumber = 'NCR-TRPC'"); await connection?.query("DELETE FROM rfis WHERE rfiNumber = 'RFI-TRPC'"); await connection?.query("DELETE FROM issues WHERE code = 'ISSUE-TRPC'"); await connection?.query("DELETE FROM contracts WHERE code = 'CONTRACT-TRPC'"); await connection?.query("DELETE FROM project_resources WHERE resourceCode = 'RESOURCE-TRPC'"); await connection?.query("DELETE FROM budget_lines WHERE id IN ('int-budget-a','int-budget-b')"); await connection?.query("DELETE FROM cost_entries WHERE id IN ('int-cost-a','int-cost-a-void','int-cost-b')"); await connection?.query("DELETE FROM commitments WHERE id IN ('int-commitment-a','int-commitment-a-cancelled','int-commitment-b')"); await connection?.query("DELETE FROM document_versions WHERE documentId = ?", [documentA]); await connection?.query("DELETE FROM project_documents WHERE id = ?", [documentA]); await connection?.query("DELETE FROM change_requests WHERE changeNumber = 'CHANGE-TRPC'"); await connection?.query("DELETE FROM claims WHERE claimNumber = 'CLAIM-TRPC'"); await connection?.query("DELETE FROM membership_roles WHERE id IN ('int-membership-role-a','int-membership-role-pmo','int-membership-role-exec')"); await connection?.query("DELETE FROM role_permissions WHERE roleId IN ('int-role-a','int-role-pmo','int-role-exec')"); await connection?.query("DELETE FROM memberships WHERE id = 'int-membership-a'"); await connection?.query("DELETE FROM roles WHERE id IN ('int-role-a','int-role-pmo','int-role-exec')"); await connection?.query("DELETE FROM permissions WHERE id IN ('int-perm-write','int-perm-read','int-perm-pmo','int-perm-exec','int-perm-exec-manage')"); await connection?.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenantA]); await connection?.query("DELETE FROM projects WHERE id IN (?, ?)", [projectA, projectB]); await connection?.query("DELETE FROM portfolios WHERE id IN ('int-portfolio-a','int-portfolio-b')"); await connection?.query("DELETE FROM companies WHERE id IN (?, ?)", [tenantA, tenantB]); await connection?.query("DELETE FROM users WHERE openId IN ('integration-test-user','integration-unassigned-user')"); await connection?.end(); });

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

  it("analyzes and confirms an authorized WBS import with atomic business and audit writes", async () => {
    const context: TrpcContext = { user: { id: integrationUserId, openId: "integration-test-user", name: "Integration Test User", email: "integration@test.local", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const caller = appRouter.createCaller(context);
    await expect(caller.dataImports.export({ tenantId: tenantA, projectId: projectB, moduleCode: "wbs", format: "csv", locale: "en" })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    const analysis = await caller.dataImports.analyze({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", fileName: "integration-wbs.csv", sourceFormat: "csv", base64: Buffer.from("Code,Name,Planned Value\nWBS-IMPORT-TRPC,Imported work package,250").toString("base64") });
    expect(analysis).toMatchObject({ status: "validated", totalRows: 1, errors: [] });
    const completion = await caller.dataImports.confirm({ tenantId: tenantA, projectId: projectA, importId: analysis.id });
    expect(completion).toMatchObject({ id: analysis.id, status: "completed", createdRows: 1 });
    const exported = await caller.dataImports.export({ tenantId: tenantA, projectId: projectA, moduleCode: "wbs", format: "csv", locale: "en" });
    expect(exported).toMatchObject({ fileName: "wbs-export.csv", rowCount: 1 }); expect(Buffer.from(exported.base64, "base64").toString("utf8")).toContain("WBS-IMPORT-TRPC");
    const [rows] = await connection.query<{ imports: number; wbs: number; audits: number }[]>("SELECT (SELECT COUNT(*) FROM data_imports WHERE id = ? AND status = 'completed' AND createdRows = 1) AS imports, (SELECT COUNT(*) FROM wbs_items WHERE tenantId = ? AND projectId = ? AND code = 'WBS-IMPORT-TRPC' AND plannedValue = 250) AS wbs, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'data_import_completed') AS audits", [analysis.id, tenantA, projectA, analysis.id]);
    expect(rows[0]).toMatchObject({ imports: 1, wbs: 1, audits: 1 });
    const [exportAudit] = await connection.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE entityId = ? AND action = 'data_export_generated'", [exported.id]); expect(exportAudit[0]).toMatchObject({ count: 1 });
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
    const evm = await caller.controls.captureOperationalEvmSnapshot({ tenantId: tenantA, projectId: projectA, periodAt, eacMethod: "ac_plus_remaining" });
    const health = await caller.controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectA, periodAt });
    expect(evm).toMatchObject({ pv: 200, ev: 100, ac: 120, bac: 350, sources: { scheduledActivities: 1, budgetLines: 1, postedActualCostEntries: 1, latestSubmittedProgressEntries: 1, wbsItemsWithProgress: 1 } });
    const [rows] = await connection.query<{ evm: number; health: number; audits: number; pv: string; ev: string; ac: string; bac: string; sourceAudit: number }[]>("SELECT (SELECT COUNT(*) FROM evm_snapshots WHERE id = ?) AS evm, (SELECT COUNT(*) FROM project_health_snapshots WHERE id = ?) AS health, (SELECT COUNT(*) FROM audit_logs WHERE entityId IN (?, ?)) AS audits, (SELECT pv FROM evm_snapshots WHERE id = ?) AS pv, (SELECT ev FROM evm_snapshots WHERE id = ?) AS ev, (SELECT ac FROM evm_snapshots WHERE id = ?) AS ac, (SELECT bac FROM evm_snapshots WHERE id = ?) AS bac, (SELECT COUNT(*) FROM audit_logs WHERE entityId = ? AND action = 'evm.operational_snapshot_created' AND metadata LIKE '%operational_records%') AS sourceAudit", [evm.id, health.id, evm.id, health.id, evm.id, evm.id, evm.id, evm.id, evm.id]);
    expect(rows[0]).toMatchObject({ evm: 1, health: 1, audits: 2, pv: "200.00", ev: "100.00", ac: "120.00", bac: "350.00", sourceAudit: 1 });
    await connection.query("DELETE FROM internal_notifications WHERE entityId = ?", [health.id]); await connection.query("DELETE FROM audit_logs WHERE entityId IN (?, ?, ?, ?, ?, ?, ?)", [evm.id, health.id, wbs.id, activity.id, progress.id, budget.id, cost.id]); await connection.query("DELETE FROM project_health_snapshots WHERE id = ?", [health.id]); await connection.query("DELETE FROM evm_snapshots WHERE id = ?", [evm.id]); await connection.query("DELETE FROM cost_entries WHERE id = ?", [cost.id]); await connection.query("DELETE FROM budget_lines WHERE id = ?", [budget.id]); await connection.query("DELETE FROM progress_entries WHERE id = ?", [progress.id]); await connection.query("DELETE FROM activities WHERE id = ?", [activity.id]); await connection.query("DELETE FROM wbs_items WHERE id = ?", [wbs.id]);
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
