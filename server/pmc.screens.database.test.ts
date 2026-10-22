import mysql from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { getPmcScreen, exportPmcScreen } from "./pmcScreensService";

// The hand-checked dataset of docs/PMC_PHASE_C_HAND_CHECKS.md, stored in a real
// database and read back through the loader. Synthetic data only.
const T = "60000000-0000-4000-8000-0000000000a1";
const T_OTHER = "60000000-0000-4000-8000-0000000000b1";
const P = "60000000-0000-4000-8000-0000000000a2";
const P_OTHER = "60000000-0000-4000-8000-0000000000b2";
const uid = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [Z1, Z2, B1, B2, G_CIV, G_FIN, S_INT, S_EXT, D_WALLS, D_PAINT, V1, V2] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => uid(100 + n));
const U = [1, 2, 3, 4].map(n => uid(200 + n)); // units 1..4
const C = [1, 2, 3, 4, 5].map(n => uid(300 + n));
const NOW = new Date("2026-10-15T12:00:00.000Z");
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: mysql.Connection;
const users = { reader: 0, none: 0, one: 0, two: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };

async function clear() {
  const t = [T, T_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  for (const table of ["pmc_unit_activity_history", "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_verification_statuses", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [P, P_OTHER]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('pmcs-reader','pmcs-none','pmcs-one','pmcs-two')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC screens read from a real database match the hand calculation", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pmcs-reader','Screen Reader','pmcs-reader@pmc.example.test','user'),('pmcs-none','Screen None','pmcs-none@pmc.example.test','user'),('pmcs-one','Eng One','pmcs-one@pmc.example.test','user'),('pmcs-two','Eng Two','pmcs-two@pmc.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pmcs-%'");
    const idOf = (openId: string) => rows.find(r => r.openId === openId)!.id;
    users.reader = idOf("pmcs-reader"); users.none = idOf("pmcs-none"); users.one = idOf("pmcs-one"); users.two = idOf("pmcs-two");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'PMC Screens Tenant', 'pmc-screens'), (?, 'PMC Screens Other', 'pmc-screens-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PS-A', 'Screens project', 'villas', 'SAR', 'active'), (?, ?, 'PS-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pmcs-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pmcs-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pmcs-ent-a', ?, 'pmcs-sub-a', 'PROJECT', true, NOW()), ('pmcs-ent-b', ?, 'pmcs-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('pmcs-perm-read','project.pmc.read','project.pmc.read','PROJECT'),('pmcs-perm-manage','project.pmc.manage','project.pmc.manage','PROJECT')");
    const [perms] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('project.pmc.read','project.pmc.manage')");
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pmcs-role-read', ?, 'PMCS_READ','Reader','PROJECT'), ('pmcs-role-none', ?, 'PMCS_NONE','None','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pmcs-role-read', ?)", [perms.find(p => p.code === "project.pmc.read")!.id]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pmcs-m-reader', ?, ?, 'active'),('pmcs-m-none', ?, ?, 'active')", [T, users.reader, T, users.none]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pmcs-mr-reader','pmcs-m-reader','pmcs-role-read','company'),('pmcs-mr-none','pmcs-m-none','pmcs-role-none','company')");

    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1'), (?, ?, ?, 'Z2', 'Zone 2')", [Z1, T, P, Z2, T, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1'), (?, ?, ?, ?, 'B2', 'Block 2')", [B1, T, P, Z1, B2, T, P, Z2]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1), (?, ?, ?, ?, 3, 'A', 1), (?, ?, ?, ?, 4, 'A', 1)", [U[0], T, P, B1, U[1], T, P, B1, U[2], T, P, B2, U[3], T, P, B2]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'CIV', 'Civil'), (?, ?, ?, 'FIN', 'Finishing')", [G_CIV, T, P, G_FIN, T, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal'), (?, ?, ?, ?, 'EXT', 'External')", [S_INT, T, P, G_CIV, S_EXT, T, P, G_FIN]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60), (?, ?, ?, ?, ?, 'A', 'PAINT', 'Paint', 40)", [D_WALLS, T, P, G_CIV, S_INT, D_PAINT, T, P, G_FIN, S_EXT]);
    await connection.query("INSERT INTO pmc_verification_statuses (id, tenantId, projectId, code, label, sortOrder, active, pending) VALUES (?, ?, ?, 'PENDING', 'Verifier pending', 1, true, true), (?, ?, ?, 'PAID', 'Paid', 2, true, false)", [V1, T, P, V2, T, P]);
    const cell = (id: string, unit: string, def: string, verification: string | null, user: number, at: string) => connection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status, verificationStatusId, assignedUserId, lastChangedByUserId, lastChangedAt) VALUES (?, ?, ?, ?, ?, 'COMPLETE', ?, ?, ?, ?)", [id, T, P, unit, def, verification, user, user, at]);
    await cell(C[0], U[0], D_WALLS, V2, users.one, "2026-10-13 00:00:00");
    await cell(C[1], U[1], D_WALLS, V1, users.one, "2026-10-13 00:00:00");
    await cell(C[2], U[2], D_WALLS, V1, users.two, "2026-10-15 08:00:00");
    await cell(C[3], U[0], D_PAINT, V2, users.two, "2026-10-05 00:00:00");
    await cell(C[4], U[3], D_PAINT, null, users.one, "2026-09-20 00:00:00");
    const hist = (cellId: string, from: string | null, to: string, user: number, at: string) => connection.query("INSERT INTO pmc_unit_activity_history (id, tenantId, projectId, unitActivityProgressId, fromStatus, toStatus, changedByUserId, changedAt) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)", [T, P, cellId, from, to, user, at]);
    await hist(C[0], null, "COMPLETE", users.one, "2026-10-13 00:00:00");
    await hist(C[1], null, "COMPLETE", users.one, "2026-10-13 00:00:00");
    await hist(C[2], null, "IN_PROGRESS", users.two, "2026-10-14 00:00:00");
    await hist(C[2], "IN_PROGRESS", "COMPLETE", users.two, "2026-10-15 00:00:00");
    await hist(C[3], null, "COMPLETE", users.two, "2026-10-05 00:00:00");
    await hist(C[4], null, "COMPLETE", users.one, "2026-09-20 00:00:00");
    const request = async (n: number, code: string, def: string, contractor: string, consultant: string, response: string | null, at: string, units: string[]) => {
      const id = uid(400 + n);
      await connection.query("INSERT INTO pmc_inspection_requests (id, tenantId, projectId, requestCode, activityDefinitionId, contractorLabel, consultantLabel, responseCode, requestedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, T, P, code, def, contractor, consultant, response, at]);
      for (const unit of units) await connection.query("INSERT INTO pmc_inspection_request_units (id, tenantId, projectId, inspectionRequestId, unitId) VALUES (UUID(), ?, ?, ?, ?)", [T, P, id, unit]);
      return id;
    };
    await request(1, "IR-1", D_WALLS, "C1", "X", "A", "2026-10-10 00:00:00", [U[0], U[1]]);
    await request(2, "IR-2", D_WALLS, "C1", "X", "B", "2026-10-11 00:00:00", [U[2]]);
    const r3 = await request(3, "IR-3", D_PAINT, "C2", "Y", null, "2026-10-12 00:00:00", [U[0]]);
    const r4 = await request(4, "IR-4", D_PAINT, "C2", "X", null, "2026-10-01 00:00:00", [U[3]]);
    await connection.query("INSERT INTO pmc_inspection_steps (id, tenantId, projectId, inspectionRequestId, stepCode, stepOrder, status, holderLabel) VALUES (UUID(), ?, ?, ?, 'CONFIGURATIONS', 1, 'complete', NULL), (UUID(), ?, ?, ?, 'MANAGER_APPROVAL', 2, 'in_progress', 'Manager'), (UUID(), ?, ?, ?, 'WAITING_CONSULTANT', 4, 'in_progress', 'Consultant X')", [T, P, r3, T, P, r3, T, P, r4]);
    for (const [def, at, percent] of [[D_WALLS, "2026-09-01", 50], [D_WALLS, "2026-10-01", 80], [D_WALLS, "2026-11-01", 100], [D_PAINT, "2026-10-01", 50]] as const) await connection.query("INSERT INTO pmc_baselines (id, tenantId, projectId, activityDefinitionId, periodAt, plannedPercent) VALUES (UUID(), ?, ?, ?, ?, ?)", [T, P, def, `${at} 00:00:00`, percent]);
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const base = { userId: 0, ...scope, now: NOW };
  const screen = <N extends Parameters<typeof getPmcScreen>[0]["screen"]>(name: N, filters = {}) => getPmcScreen({ ...base, userId: users.reader, screen: name, filters: { since: new Date("2026-01-01T00:00:00.000Z"), ...filters } });

  it("screen 1 and screens 7-8: updates, range, percentage added, by week and month", async () => {
    const updates = (await screen("latestUpdates")).data;
    expect(updates.engineers.map(e => [e.name, e.updates, e.activeDays, e.unitFrom, e.unitTo, e.addedProjectPercent])).toEqual([["Eng One", 3, 2, 1, 4, 40], ["Eng Two", 3, 3, 1, 3, 25]]);
    expect(updates.totals).toEqual({ updates: 6, addedProjectPercent: 65 });
    expect((await screen("weekly")).data.periods.map(p => [p.from, p.updates, p.addedProjectPercent])).toEqual([["2026-10-12", 4, 45], ["2026-10-05", 1, 10], ["2026-09-14", 1, 10]]);
    expect((await screen("monthly")).data.periods.map(p => [p.from, p.updates, p.addedProjectPercent])).toEqual([["2026-10-01", 5, 55], ["2026-09-01", 1, 10]]);
  }, 60_000);

  it("screens 2 and 4: replies per consultant, where each request stands, who holds it", async () => {
    const approvals = (await screen("approvals")).data;
    expect(approvals.byConsultant).toEqual([{ key: "X", A: 1, B: 1, C: 0, UR: 0, pending: 1, total: 3 }, { key: "Y", A: 0, B: 0, C: 0, UR: 0, pending: 1, total: 1 }]);
    expect((await screen("approvals", { consultant: "Y" })).data.requests.map(r => r.code)).toEqual(["IR-3"]);
    const flow = (await screen("inspections")).data;
    expect(flow.byStage).toEqual([{ stage: "MANAGER_APPROVAL", count: 1, percent: 25 }, { stage: "WAITING_CONSULTANT", count: 1, percent: 25 }, { stage: "ANSWERED", count: 2, percent: 50 }]);
    expect(flow.heldBy).toEqual([{ holder: "Consultant X", count: 1 }, { holder: "Manager", count: 1 }]);
    expect(flow.stalledActivities).toEqual([{ activityCode: "PAINT", activityName: "Paint", open: 2, oldestDays: 14 }]);
  }, 60_000);

  it("screens 5, 6, 9 and 11: matrix, zones, waiting at the verifier, stages and late activities", async () => {
    const matrix = (await screen("activities")).data;
    const walls = matrix.groups.find(g => g.groupCode === "CIV")!.activities[0];
    expect(walls.cells.map(c => [c.count, c.weightPoints, c.sharePercent])).toEqual([[2, 120, 50], [1, 60, 25], [1, 60, 25]]);
    const zones = (await screen("zones")).data.rows;
    expect(zones.find(r => r.zoneCode === "Z1" && r.stageCode === "INT" && r.engineer === "Eng One")).toMatchObject({ cells: 2, completeCells: 2, weightComplete: 120, completionPercent: 100 });
    expect(zones.reduce((sum, r) => sum + r.cells, 0)).toBe(8);
    const pending = (await screen("pending")).data;
    expect(pending.rows.map(r => [r.unitNumber, r.activityCode, r.ageDays])).toEqual([[2, "WALLS", 2], [3, "WALLS", 0]]);
    const stages = (await screen("stages")).data.stages;
    const internal = stages.find(s => s.stageCode === "INT")!;
    expect(internal.byStatus.filter(s => s.count).map(s => [s.status, s.count, s.percent])).toEqual([["NOT_STARTED", 1, 25], ["COMPLETE", 3, 75]]);
    expect(internal.lateActivities).toEqual([{ activityCode: "WALLS", actualPercent: 75, plannedPercent: 80 }]);
    expect(stages.find(s => s.stageCode === "EXT")!.lateActivities).toEqual([]);
  }, 60_000);

  it("every screen reports how fresh each source is", async () => {
    const { freshness } = await screen("latestUpdates");
    expect(freshness.map(f => f.source)).toEqual(["locations", "catalog", "status", "requests", "baseline"]);
    expect(freshness.find(f => f.source === "status")).toMatchObject({ ageDays: 0 });
  }, 60_000);

  it("exports a screen to Excel with the same rows", async () => {
    const exported = await exportPmcScreen({ ...base, userId: users.reader, screen: "approvals", locale: "en", filters: { since: new Date("2026-01-01T00:00:00.000Z") } });
    expect(exported.rows).toBe(4);
    expect(Buffer.from(exported.base64, "base64").subarray(0, 2).toString()).toBe("PK");
  }, 60_000);

  it("is available through the API to a reader, and closed to a role without the permission and to another tenant's project", async () => {
    const reader = callerFor(users.reader, "pmcs-reader");
    const none = callerFor(users.none, "pmcs-none");
    await expect(reader.pmc.latestUpdates({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.approvals({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.inspectionFlow({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.activitiesMatrix({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.zonesView({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.weeklyReport({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.monthlyReport({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.pendingAtVerifier({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(reader.pmc.stagesView({ ...scope, filters: { since: new Date("2026-01-01T00:00:00.000Z") } })).resolves.toMatchObject({ data: expect.anything(), freshness: expect.any(Array) });
    await expect(none.pmc.approvals(scope)).rejects.toThrow("Required permission is not granted.");
    await expect(reader.pmc.approvals({ tenantId: T, projectId: P_OTHER })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    // Export is a read and needs only the read permission; the file holds this project's rows.
    await expect(reader.pmc.exportScreen({ ...scope, screen: "zones", locale: "ar", filters: undefined })).resolves.toMatchObject({ fileName: "pmc-zones.xlsx" });
    await expect(none.pmc.exportScreen({ ...scope, screen: "zones", locale: "ar", filters: undefined })).rejects.toThrow("Required permission is not granted.");
  }, 60_000);
});
