import mysql from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Synthetic fixtures only (no real names, units or consultants).
const T = "40000000-0000-4000-8000-0000000000a1";
const T_OTHER = "40000000-0000-4000-8000-0000000000b1";
const P = "40000000-0000-4000-8000-0000000000a2";
const P_OTHER = "40000000-0000-4000-8000-0000000000b2";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ZONE, BLOCK, GROUP, STAGE] = [id(101), id(102), id(103), id(104)];
const [UNIT_A1, UNIT_A2, UNIT_B1] = [id(111), id(112), id(113)];
const [ACT_A_WALLS, ACT_A_FINISH, ACT_B_WALLS, ACT_B_FINISH] = [id(121), id(122), id(123), id(124)];
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: mysql.Connection;
const users = { manager: 0, reader: 0, none: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

async function clear() {
  const t = [T, T_OTHER];
  const p = [P, P_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  for (const table of ["pmc_unit_activity_history", "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_verification_statuses", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId IN (?, ?))", t);
  await connection.query("DELETE FROM tenant_licenses WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", p);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('pmc-manager','pmc-reader','pmc-none')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC rules, history, inspections and gates on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pmc-manager','PMC Manager','pmc-manager@pmc.example.test','user'),('pmc-reader','PMC Reader','pmc-reader@pmc.example.test','user'),('pmc-none','PMC None','pmc-none@pmc.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pmc-%'");
    users.manager = rows.find(r => r.openId === "pmc-manager")!.id;
    users.reader = rows.find(r => r.openId === "pmc-reader")!.id;
    users.none = rows.find(r => r.openId === "pmc-none")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'PMC Tenant', 'pmc-tenant'), (?, 'PMC Other Tenant', 'pmc-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PMC-A', 'PMC project', 'villas', 'SAR', 'active'), (?, ?, 'PMC-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pmc-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pmc-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pmc-ent-a', ?, 'pmc-sub-a', 'PROJECT', true, NOW()), ('pmc-ent-b', ?, 'pmc-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    const names = [["pmc-perm-read", "project.pmc.read"], ["pmc-perm-update", "project.pmc.update"], ["pmc-perm-manage", "project.pmc.manage"]];
    for (const [pid, code] of names) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pmc-role-manager', ?, 'PMC_MANAGER','PMC manager','PROJECT'), ('pmc-role-reader', ?, 'PMC_READER','PMC reader','PROJECT'), ('pmc-role-none', ?, 'PMC_NONE','No PMC','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pmc-role-manager', ?),('pmc-role-manager', ?),('pmc-role-manager', ?),('pmc-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pmc-m-manager', ?, ?, 'active'),('pmc-m-reader', ?, ?, 'active'),('pmc-m-none', ?, ?, 'active')", [T, users.manager, T, users.reader, T, users.none]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pmc-mr-manager','pmc-m-manager','pmc-role-manager','company'),('pmc-mr-reader','pmc-m-reader','pmc-role-reader','company'),('pmc-mr-none','pmc-m-none','pmc-role-none','company')");
    // The catalogue (the importer, phase B, will fill these from files).
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, T, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, T, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1), (?, ?, ?, ?, 3, 'B', 1)", [UNIT_A1, T, P, BLOCK, UNIT_A2, T, P, BLOCK, UNIT_B1, T, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'FIN', 'Finishing')", [GROUP, T, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [STAGE, T, P, GROUP]);
    // Model A weights 60 + 40 = 100; model B weights 50 + 30 = 80 (deliberately wrong).
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60), (?, ?, ?, ?, ?, 'A', 'FINISH', 'Finish', 40), (?, ?, ?, ?, ?, 'B', 'WALLS', 'Walls', 50), (?, ?, ?, ?, ?, 'B', 'FINISH', 'Finish', 30)", [ACT_A_WALLS, T, P, GROUP, STAGE, ACT_A_FINISH, T, P, GROUP, STAGE, ACT_B_WALLS, T, P, GROUP, STAGE, ACT_B_FINISH, T, P, GROUP, STAGE]);
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const scope = { tenantId: T, projectId: P };

  it("starts at zero, and gives no number for a model whose weights do not total 100", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    const progress = await manager.pmc.progress(scope);
    expect(progress.projectProgressPercent).toBe(0);
    expect(progress.unitsWithoutNumber).toBe(1);
    expect(progress.units.find(u => u.unitNumber === 3)).toMatchObject({ progressPercent: null, reason: "MODEL_WEIGHTS_NOT_100" });
    expect(progress.units.find(u => u.unitNumber === 1)).toMatchObject({ progressPercent: 0 });
    expect(progress.activities.find(a => a.activityDefinitionId === ACT_A_WALLS)).toMatchObject({ includedUnits: 2, completedUnits: 0, completionPercent: 0 });
  }, 60_000);

  it("records a status change with its history, and a repeat changes nothing", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A1, activityDefinitionId: ACT_A_WALLS, status: "COMPLETE", note: "walls done" })).resolves.toMatchObject({ from: null, to: "COMPLETE", changed: true });
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A1, activityDefinitionId: ACT_A_WALLS, status: "COMPLETE" })).resolves.toMatchObject({ changed: false });
    const [history] = await connection.query<{ fromStatus: string | null; toStatus: string; changedByUserId: number; note: string }[]>("SELECT h.fromStatus, h.toStatus, h.changedByUserId, h.note FROM pmc_unit_activity_history h INNER JOIN pmc_unit_activity_progress p ON p.id = h.unitActivityProgressId WHERE p.unitId = ? AND p.activityDefinitionId = ?", [UNIT_A1, ACT_A_WALLS]);
    expect(history).toEqual([{ fromStatus: null, toStatus: "COMPLETE", changedByUserId: users.manager, note: "walls done" }]);
    const [audit] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.unit_activity_changed'", [T]);
    expect(Number(audit[0].n)).toBe(1);
    const progress = await manager.pmc.progress(scope);
    // Unit A1: walls 60% weight complete = 60.
    expect(progress.units.find(u => u.unitNumber === 1)?.progressPercent).toBe(60);
    expect(progress.activities.find(a => a.activityDefinitionId === ACT_A_WALLS)).toMatchObject({ includedUnits: 2, completedUnits: 1, completionPercent: 50 });
  }, 60_000);

  it("uses the tenant's status factors, and refuses a set that rewards an earlier status more than a later one", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    await expect(manager.pmc.setStatusFactors({ ...scope, factors: { IN_PROGRESS: 0.5, UNDER_REVIEW: 0.2 } })).rejects.toThrow("PROJECT_OS_PMC_STATUS_FACTORS_INVALID");
    await expect(manager.pmc.statusFactors(scope)).resolves.toEqual({ NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 1 });
    await manager.pmc.setStatusFactors({ ...scope, factors: { UNDER_REVIEW: 0.9 } });
    await manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A1, activityDefinitionId: ACT_A_FINISH, status: "UNDER_REVIEW" });
    const progress = await manager.pmc.progress(scope);
    // 60 x 1 + 40 x 0.9 = 96.
    expect(progress.units.find(u => u.unitNumber === 1)?.progressPercent).toBe(96);
    // Project: units weighted equally -> (96 + 0) / 2 = 48.
    expect(progress.projectProgressPercent).toBe(48);
    await connection.query("UPDATE pmc_units SET unitWeight = 3 WHERE id = ?", [UNIT_A1]);
    // With unit A1 counting three times: (96 x 3 + 0 x 1) / 4 = 72.
    expect((await manager.pmc.progress(scope)).projectProgressPercent).toBe(72);
  }, 60_000);

  it("refuses a cell outside the unit's model, another project's unit, and callers without the right permission", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    const reader = callerFor(users.reader, "pmc-reader");
    const none = callerFor(users.none, "pmc-none");
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A1, activityDefinitionId: ACT_B_WALLS, status: "COMPLETE" })).rejects.toThrow("PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL");
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: id(999), activityDefinitionId: ACT_A_WALLS, status: "COMPLETE" })).rejects.toThrow("PROJECT_OS_PMC_UNIT_NOT_FOUND");
    await expect(manager.pmc.progress({ tenantId: T, projectId: P_OTHER })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(reader.pmc.progress(scope)).resolves.toBeDefined();
    await expect(reader.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A2, activityDefinitionId: ACT_A_WALLS, status: "COMPLETE" })).rejects.toThrow("Required permission is not granted.");
    await expect(reader.pmc.setStatusFactors({ ...scope, factors: { IN_PROGRESS: 0.1 } })).rejects.toThrow("Required permission is not granted.");
    await expect(none.pmc.progress(scope)).rejects.toThrow("Required permission is not granted.");
    const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE unitId = ?", [UNIT_A2]);
    expect(Number(rows[0].n)).toBe(0);
  }, 60_000);

  it("keeps the verification list the project's own and links a cell to it", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    const saved = await manager.pmc.saveVerificationStatuses({ ...scope, statuses: [{ code: "VERIFIER_PENDING", label: "Verifier pending", sortOrder: 1, active: true }, { code: "PAID", label: "Paid", sortOrder: 2, active: true }, { code: "RETIRED", label: "Retired", sortOrder: 3, active: false }] });
    // The read returns the same list, ordered by the configured sort order.
    expect((await manager.pmc.verificationStatuses(scope)).map(status => status.code)).toEqual(["VERIFIER_PENDING", "PAID", "RETIRED"]);
    const pending = saved.find(s => s.code === "VERIFIER_PENDING")!;
    const retired = saved.find(s => s.code === "RETIRED")!;
    await manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A2, activityDefinitionId: ACT_A_WALLS, status: "IN_PROGRESS", verificationStatusId: pending.id });
    const [cell] = await connection.query<{ verificationStatusId: string }[]>("SELECT verificationStatusId FROM pmc_unit_activity_progress WHERE unitId = ? AND activityDefinitionId = ?", [UNIT_A2, ACT_A_WALLS]);
    expect(cell[0].verificationStatusId).toBe(pending.id);
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A2, activityDefinitionId: ACT_A_WALLS, status: "IN_PROGRESS", verificationStatusId: retired.id })).rejects.toThrow("PROJECT_OS_PMC_VERIFICATION_STATUS_INACTIVE");
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A2, activityDefinitionId: ACT_A_WALLS, status: "IN_PROGRESS", verificationStatusId: id(998) })).rejects.toThrow("PROJECT_OS_PMC_VERIFICATION_STATUS_NOT_FOUND");
    await expect(manager.pmc.saveVerificationStatuses({ ...scope, statuses: [{ code: "X", label: "x", sortOrder: 1, active: true }, { code: "X", label: "y", sortOrder: 2, active: true }] })).rejects.toThrow("PROJECT_OS_PMC_STATUS_CODE_DUPLICATE");
    // Changing only the verification status changes the cell but writes no status history.
    const [before] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_unit_activity_history WHERE tenantId = ?", [T]);
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A2, activityDefinitionId: ACT_A_WALLS, status: "IN_PROGRESS", verificationStatusId: saved.find(s => s.code === "PAID")!.id })).resolves.toMatchObject({ changed: true });
    const [after] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_unit_activity_history WHERE tenantId = ?", [T]);
    expect(Number(after[0].n)).toBe(Number(before[0].n));
  }, 60_000);

  it("runs an inspection request through its five steps and records the consultant's answer once", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    await expect(manager.pmc.createInspection({ ...scope, requestCode: "IR-1", activityDefinitionId: ACT_A_WALLS, unitIds: [UNIT_A1, UNIT_B1], requestedAt: new Date("2026-10-01T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL");
    const created = await manager.pmc.createInspection({ ...scope, requestCode: "IR-1", activityDefinitionId: ACT_A_WALLS, unitIds: [UNIT_A1, UNIT_A2, UNIT_A1], contractorLabel: "Contractor A", consultantLabel: "Consultant X", requestedAt: new Date("2026-10-01T00:00:00.000Z") });
    expect(created.units).toBe(2);
    await expect(manager.pmc.createInspection({ ...scope, requestCode: "IR-1", activityDefinitionId: ACT_A_WALLS, unitIds: [UNIT_A1], requestedAt: new Date() })).rejects.toThrow("PROJECT_OS_PMC_INSPECTION_CODE_DUPLICATE");
    let [request] = await manager.pmc.inspections(scope);
    expect(request.steps.map(s => [s.stepCode, s.status])).toEqual([["CONFIGURATIONS", "in_progress"], ["MANAGER_APPROVAL", "pending"], ["TECHNICAL_ASSISTANT", "pending"], ["WAITING_CONSULTANT", "pending"], ["RESULT_RECEIVING", "pending"]]);
    expect(request.unitIds.sort()).toEqual([UNIT_A1, UNIT_A2].sort());
    await expect(manager.pmc.respondInspection({ ...scope, inspectionRequestId: created.id, responseCode: "A" })).rejects.toThrow("PROJECT_OS_PMC_INSPECTION_NOT_AT_RESULT_STEP");
    await expect(manager.pmc.advanceInspection({ ...scope, inspectionRequestId: created.id, stepCode: "WAITING_CONSULTANT", outcome: "complete" })).rejects.toThrow("PROJECT_OS_PMC_INSPECTION_STEP_NOT_ACTIVE");
    for (const stepCode of ["CONFIGURATIONS", "MANAGER_APPROVAL", "TECHNICAL_ASSISTANT", "WAITING_CONSULTANT"] as const) await manager.pmc.advanceInspection({ ...scope, inspectionRequestId: created.id, stepCode, outcome: "complete", nextHolderLabel: stepCode === "WAITING_CONSULTANT" ? "Consultant X" : "Technical office" });
    await expect(manager.pmc.respondInspection({ ...scope, inspectionRequestId: created.id, responseCode: "B" })).resolves.toEqual({ responseCode: "B" });
    await expect(manager.pmc.respondInspection({ ...scope, inspectionRequestId: created.id, responseCode: "A" })).rejects.toThrow("PROJECT_OS_PMC_INSPECTION_ALREADY_ANSWERED");
    [request] = await manager.pmc.inspections(scope);
    expect(request.responseCode).toBe("B");
    expect(request.steps.every(s => s.status === "complete")).toBe(true);
    expect(request.steps.find(s => s.stepCode === "RESULT_RECEIVING")?.holderLabel).toBe("Consultant X");
  }, 60_000);

  it("blocks every PMC call when the licence has no PMC feature, and allows it again once restored", async () => {
    const manager = callerFor(users.manager, "pmc-manager");
    const [[plan]] = await connection.query<{ id: string }[]>("SELECT id FROM commercial_plans WHERE code = 'ALL_IN_ONE_STANDARD' LIMIT 1");
    const [[feature]] = await connection.query<{ id: string }[]>("SELECT id FROM commercial_features WHERE code = 'PMC' LIMIT 1");
    expect(plan && feature).toBeTruthy();
    await connection.query("INSERT INTO tenant_licenses (id, tenantId, subscriptionId, planId, status, seats, startsAt) VALUES ('pmc-license-a', ?, 'pmc-sub-a', ?, 'active', 5, NOW())", [T, plan.id]);
    await connection.query("INSERT INTO tenant_license_feature_overrides (id, tenantLicenseId, featureId, active) VALUES ('pmc-override-a', 'pmc-license-a', ?, false)", [feature.id]);
    await expect(manager.pmc.progress(scope)).rejects.toThrow("PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE");
    await expect(manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A2, activityDefinitionId: ACT_A_FINISH, status: "COMPLETE" })).rejects.toThrow("PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE");
    await connection.query("DELETE FROM tenant_license_feature_overrides WHERE id = 'pmc-override-a'");
    await expect(manager.pmc.progress(scope)).resolves.toBeDefined();
  }, 60_000);
});
