import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 21: units in bulk, a model's weights to 100%, and the status grid. Synthetic fixtures only (no real names, units or consultants).
const T = "41000000-0000-4000-8000-0000000000a1";
const T_OTHER = "41000000-0000-4000-8000-0000000000b1";
const P = "41000000-0000-4000-8000-0000000000a2";
const P_OTHER = "41000000-0000-4000-8000-0000000000b2";
const id = (n: number) => `41000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ZONE, BLOCK, GROUP, STAGE] = [id(101), id(102), id(103), id(104)];
const [UNIT_A1, UNIT_A2, UNIT_B1] = [id(111), id(112), id(113)];
const [ACT_A_WALLS, ACT_A_FINISH, ACT_B_WALLS, ACT_B_FINISH] = [id(121), id(122), id(123), id(124)];
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: fixtureDb.Connection;
const users = { manager: 0, reader: 0, none: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmce.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

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
  await connection.query("DELETE FROM users WHERE openId IN ('pmce-manager','pmce-reader','pmce-none')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC table editors (work order 21) on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pmce-manager','PMC Manager','pmce-manager@pmce.example.test','user'),('pmce-reader','PMC Reader','pmce-reader@pmce.example.test','user'),('pmce-none','PMC None','pmce-none@pmce.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pmce-%'");
    users.manager = rows.find(r => r.openId === "pmce-manager")!.id;
    users.reader = rows.find(r => r.openId === "pmce-reader")!.id;
    users.none = rows.find(r => r.openId === "pmce-none")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'PMC Editor Tenant', 'pmce-tenant'), (?, 'PMC Editor Other Tenant', 'pmce-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PMCE-A', 'PMC project', 'villas', 'SAR', 'active'), (?, ?, 'PMCE-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pmce-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pmce-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pmce-ent-a', ?, 'pmce-sub-a', 'PROJECT', true, NOW()), ('pmce-ent-b', ?, 'pmce-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    const names = [["pmce-perm-read", "project.pmc.read"], ["pmce-perm-update", "project.pmc.update"], ["pmce-perm-manage", "project.pmc.manage"]];
    for (const [pid, code] of names) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pmce-role-manager', ?, 'PMC_MANAGER','PMC manager','PROJECT'), ('pmce-role-reader', ?, 'PMC_READER','PMC reader','PROJECT'), ('pmce-role-none', ?, 'PMC_NONE','No PMC','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pmce-role-manager', ?),('pmce-role-manager', ?),('pmce-role-manager', ?),('pmce-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pmce-m-manager', ?, ?, 'active'),('pmce-m-reader', ?, ?, 'active'),('pmce-m-none', ?, ?, 'active')", [T, users.manager, T, users.reader, T, users.none]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pmce-mr-manager','pmce-m-manager','pmce-role-manager','company'),('pmce-mr-reader','pmce-m-reader','pmce-role-reader','company'),('pmce-mr-none','pmce-m-none','pmce-role-none','company')");
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

  it("lists the blocks and, per model, its activities and weight total (model A 100, model B 80 as seeded)", async () => {
    const reader = callerFor(users.reader, "pmce-reader");
    const structure = await reader.pmc.structure(scope);
    expect(structure.blocks).toEqual([{ id: BLOCK, code: "B1", name: "Block 1", zoneCode: "Z1" }]);
    expect(structure.models.find(m => m.modelCode === "A")?.totalWeight).toBe(100);
    expect(structure.models.find(m => m.modelCode === "B")?.totalWeight).toBe(80);
    expect(structure.highestUnitNumber).toBe(3);
  });

  it("creates units 10..14 of model A in one transaction with one audit row; a reader cannot", async () => {
    const reader = callerFor(users.reader, "pmce-reader");
    await expect(reader.pmc.createUnits({ ...scope, blockId: BLOCK, modelCode: "A", from: 10, to: 14 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const manager = callerFor(users.manager, "pmce-manager");
    expect(await manager.pmc.createUnits({ ...scope, blockId: BLOCK, modelCode: "A", from: 10, to: 14 })).toEqual({ created: 5, from: 10, to: 14 });
    const [rows] = await connection.query<{ unitNumber: number; modelCode: string }[]>("SELECT unitNumber, modelCode FROM pmc_units WHERE tenantId = ? AND projectId = ? AND unitNumber BETWEEN 10 AND 14 ORDER BY unitNumber", [T, P]);
    expect(rows.map(r => r.unitNumber)).toEqual([10, 11, 12, 13, 14]);
    expect(rows.every(r => r.modelCode === "A")).toBe(true);
    const [audit] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = 'pmc.units_created'", [T]);
    expect(audit[0].n).toBe(1);
  });

  it("NEGATIVE: a range that overlaps existing numbers creates nothing at all (all or nothing), and says why", async () => {
    const manager = callerFor(users.manager, "pmce-manager");
    await expect(manager.pmc.createUnits({ ...scope, blockId: BLOCK, modelCode: "A", from: 13, to: 16 })).rejects.toMatchObject({ code: "CONFLICT", message: "PROJECT_OS_PMC_UNITS_EXIST" });
    const [rows] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM pmc_units WHERE tenantId = ? AND projectId = ? AND unitNumber IN (15, 16)", [T, P]);
    expect(rows[0].n).toBe(0);
    await expect(manager.pmc.createUnits({ ...scope, blockId: BLOCK, modelCode: "A", from: 20, to: 19 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_UNIT_RANGE_INVALID" });
    await expect(manager.pmc.createUnits({ ...scope, blockId: BLOCK, modelCode: "A", from: 1000, to: 1600 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_UNIT_RANGE_INVALID" });
    await expect(manager.pmc.createUnits({ ...scope, blockId: BLOCK, modelCode: "NOPE", from: 30, to: 31 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_MODEL_NOT_FOUND" });
  });

  it("NEGATIVE: another tenant's block is not found here (tenant isolation), and nothing is written", async () => {
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'ZX', 'Other zone')", [id(201), T_OTHER, P_OTHER]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'BX', 'Other block')", [id(202), T_OTHER, P_OTHER, id(201)]);
    const manager = callerFor(users.manager, "pmce-manager");
    await expect(manager.pmc.createUnits({ ...scope, blockId: id(202), modelCode: "A", from: 40, to: 41 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_BLOCK_NOT_FOUND" });
    await expect(manager.pmc.createUnits({ tenantId: T_OTHER, projectId: P_OTHER, blockId: id(202), modelCode: "A", from: 40, to: 41 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [rows] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM pmc_units WHERE unitNumber IN (40, 41)");
    expect(rows[0].n).toBe(0);
  });

  it("saves model B's weights only when they total exactly 100, with the before and after in the audit row", async () => {
    const manager = callerFor(users.manager, "pmce-manager");
    await expect(manager.pmc.saveActivityWeights({ ...scope, modelCode: "B", weights: [{ activityDefinitionId: ACT_B_WALLS, weightPercent: 50 }, { activityDefinitionId: ACT_B_FINISH, weightPercent: 40 }] })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_WEIGHTS_NOT_100" });
    await expect(manager.pmc.saveActivityWeights({ ...scope, modelCode: "B", weights: [{ activityDefinitionId: ACT_B_WALLS, weightPercent: 100 }] })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_WEIGHTS_INCOMPLETE" });
    await expect(manager.pmc.saveActivityWeights({ ...scope, modelCode: "B", weights: [{ activityDefinitionId: ACT_B_WALLS, weightPercent: 50 }, { activityDefinitionId: ACT_A_WALLS, weightPercent: 50 }] })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_WEIGHTS_INCOMPLETE" });
    const [unchanged] = await connection.query<{ total: string }[]>("SELECT sum(weightPercent)::text AS total FROM pmc_activity_definitions WHERE tenantId = ? AND projectId = ? AND modelCode = 'B'", [T, P]);
    expect(Number(unchanged[0].total)).toBe(80);
    expect(await manager.pmc.saveActivityWeights({ ...scope, modelCode: "B", weights: [{ activityDefinitionId: ACT_B_WALLS, weightPercent: 62.5 }, { activityDefinitionId: ACT_B_FINISH, weightPercent: 37.5 }] })).toEqual({ modelCode: "B", saved: 2 });
    const progress = await manager.pmc.progress(scope);
    expect(progress.units.find(u => u.unitNumber === 3)?.progressPercent).toBe(0); // model B now has a number (it had none at 80%)
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'pmc.activity_weights_saved'", [T]);
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ modelCode: "B", after: { WALLS: 62.5, FINISH: 37.5 } });
  });

  it("the status grid shows each unit with its model's activities and the cells; a click through setUnitActivityStatus shows up in it", async () => {
    const manager = callerFor(users.manager, "pmce-manager");
    const before = await manager.pmc.statusGrid({ ...scope, from: 1, to: 3 });
    expect(before.units.map(u => u.unitNumber)).toEqual([1, 2, 3]);
    expect(before.activities.map(a => `${a.modelCode}:${a.code}`).sort()).toEqual(["A:FINISH", "A:WALLS", "B:FINISH", "B:WALLS"]);
    expect(before.cells).toEqual([]);
    await manager.pmc.setUnitActivityStatus({ ...scope, unitId: UNIT_A1, activityDefinitionId: ACT_A_WALLS, status: "IN_PROGRESS" });
    const after = await manager.pmc.statusGrid({ ...scope, from: 1, to: 3 });
    expect(after.cells).toEqual([{ unitId: UNIT_A1, activityDefinitionId: ACT_A_WALLS, status: "IN_PROGRESS" }]);
    const none = callerFor(users.none, "pmce-none");
    await expect(none.pmc.statusGrid({ ...scope })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
