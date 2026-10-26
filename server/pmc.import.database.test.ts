import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// Phase B closure on a real database: 500 units x 60 activities, imported twice,
// the count stays put; a file with deliberate errors is refused with the right report.
// Synthetic data only.
const T = "50000000-0000-4000-8000-0000000000a1";
const T_OTHER = "50000000-0000-4000-8000-0000000000b1";
const P = "50000000-0000-4000-8000-0000000000a2";
const P_OTHER = "50000000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

const MODELS = ["A", "B", "C", "D", "E"];
const UNITS = 500;
const ACTIVITIES = 60;
const weightOf = (activityIndex: number) => (activityIndex < 50 ? 1.6 : 2); // 50 x 1.6 + 10 x 2 = 100
const modelOf = (unit: number) => MODELS[(unit - 1) % MODELS.length];
const STATUS_WORDS = ["Not started", "In progress", "Under review", "Complete"];
const MANAGER_EMAIL = "pmc-import-manager@pmc.example.test";

let connection: fixtureDb.Connection;
const users = { manager: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const asBase64 = (bytes: Buffer) => bytes.toString("base64");

async function sheet(headers: string[], data: unknown[][]) {
  return asBase64(await buildSpreadsheet({ sheetName: "data", headers, rows: data, format: "xlsx" }));
}

const files = {
  locations: () => sheet(["Zone", "Block", "Unit", "Model"], Array.from({ length: UNITS }, (_unused, index) => { const unit = index + 1; return [`Z${Math.ceil(unit / 100)}`, `B${String(Math.ceil(unit / 20)).padStart(2, "0")}`, unit, modelOf(unit)]; })),
  catalog: () => sheet(["Model", "Group", "Stage", "Activity", "Activity name", "Weight"], MODELS.flatMap(model => Array.from({ length: ACTIVITIES }, (_unused, index) => [model, `G${Math.floor(index / 10) + 1}`, `S${Math.floor(index / 5) + 1}`, `ACT${String(index + 1).padStart(2, "0")}`, `Activity ${index + 1}`, weightOf(index)]))),
  status: () => sheet(["Unit", "Activity", "Status", "Engineer", "Date"], Array.from({ length: UNITS }, (_unused, u) => Array.from({ length: ACTIVITIES }, (_inner, i) => [u + 1, `ACT${String(i + 1).padStart(2, "0")}`, STATUS_WORDS[(u + 1 + i) % 4], MANAGER_EMAIL, `2026-09-${String((i % 28) + 1).padStart(2, "0")}`])).flat()),
  requests: () => sheet(["Request", "Activity", "Units", "Date", "Contractor", "Consultant", "Response"], Array.from({ length: 50 }, (_unused, index) => { const start = index * 10 + 1; return [`IR-${index + 1}`, "ACT01", `${start}, ${start + 5}`, "2026-09-15", "Contractor A", "Consultant X", ["A", "B", "C", "UR", ""][index % 5]]; })),
  baseline: () => sheet(["Model", "Activity", "Month", "Planned"], MODELS.flatMap(model => Array.from({ length: ACTIVITIES }, (_unused, i) => [10, 30, 50, 70, 90, 100].map((percent, month) => [model, `ACT${String(i + 1).padStart(2, "0")}`, `2026-${String(month + 1).padStart(2, "0")}-01`, percent])).flat())),
};

async function count(table: string) {
  const [rows] = await connection.query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table} WHERE tenantId = ?`, [T]);
  return Number(rows[0].n);
}

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
  await connection.query("DELETE FROM users WHERE openId IN ('pmc-import-manager','pmc-import-reader')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC import (500 units x 60 activities) on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('pmc-import-manager','Import Manager', ?, 'user'),('pmc-import-reader','Import Reader','pmc-import-reader@pmc.example.test','user')", [MANAGER_EMAIL]);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pmc-import-%'");
    users.manager = rows.find(r => r.openId === "pmc-import-manager")!.id;
    users.reader = rows.find(r => r.openId === "pmc-import-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'PMC Import Tenant', 'pmc-import'), (?, 'PMC Import Other', 'pmc-import-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PI-A', 'Import project', 'villas', 'SAR', 'active'), (?, ?, 'PI-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pmci-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('pmci-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pmci-ent-a', ?, 'pmci-sub-a', 'PROJECT', true, NOW()), ('pmci-ent-b', ?, 'pmci-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, code] of [["pmci-perm-read", "project.pmc.read"], ["pmci-perm-update", "project.pmc.update"], ["pmci-perm-manage", "project.pmc.manage"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pmci-role-manager', ?, 'PMCI_MANAGER','Manager','PROJECT'), ('pmci-role-reader', ?, 'PMCI_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('pmci-role-manager', ?),('pmci-role-manager', ?),('pmci-role-manager', ?),('pmci-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pmci-m-manager', ?, ?, 'active'),('pmci-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pmci-mr-manager','pmci-m-manager','pmci-role-manager','company'),('pmci-mr-reader','pmci-m-reader','pmci-role-reader','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  it("analyses without saving anything, then saves each template once approved", async () => {
    const manager = callerFor(users.manager, "pmc-import-manager");
    const apply = async (kind: "locations" | "catalog" | "status" | "requests" | "baseline") => {
      const base64 = await files[kind]();
      const analysis = await manager.pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 });
      expect(analysis.errorCount, JSON.stringify(analysis.errors.slice(0, 3))).toBe(0);
      expect(analysis.canConfirm).toBe(true);
      const saved = await manager.pmc.confirmImport({ ...scope, kind, format: "xlsx", base64, approvedHash: analysis.fileHash });
      return { analysis, saved };
    };

    const locations = await files.locations();
    const dry = await manager.pmc.analyzeImport({ ...scope, kind: "locations", format: "xlsx", base64: locations });
    expect(dry.counts).toEqual({ create: UNITS, update: 0, unchanged: 0 });
    expect(await count("pmc_units")).toBe(0); // analysis wrote nothing

    await manager.pmc.confirmImport({ ...scope, kind: "locations", format: "xlsx", base64: locations, approvedHash: dry.fileHash });
    expect([await count("pmc_zones"), await count("pmc_blocks"), await count("pmc_units")]).toEqual([5, 25, UNITS]);

    const catalog = await apply("catalog");
    expect(catalog.analysis.counts.create).toBe(MODELS.length * ACTIVITIES);
    expect(await count("pmc_activity_definitions")).toBe(MODELS.length * ACTIVITIES);
    expect([await count("pmc_activity_groups"), await count("pmc_activity_stages")]).toEqual([6, 12]);

    const status = await apply("status");
    expect(status.analysis.totalRows).toBe(UNITS * ACTIVITIES);
    expect(await count("pmc_unit_activity_progress")).toBe(UNITS * ACTIVITIES);
    expect(await count("pmc_unit_activity_history")).toBe(UNITS * ACTIVITIES);

    await apply("requests");
    expect(await count("pmc_inspection_requests")).toBe(50);
    expect(await count("pmc_inspection_request_units")).toBe(100);
    expect(await count("pmc_inspection_steps")).toBe(250);

    await apply("baseline");
    expect(await count("pmc_baselines")).toBe(MODELS.length * ACTIVITIES * 6);
  }, 600_000);

  it("computes the project's progress from the imported cells, matching an independent hand calculation", async () => {
    const manager = callerFor(users.manager, "pmc-import-manager");
    // Only status "Complete" ((unit + activity) mod 4 = 3) earns weight; every unit counts the same.
    let total = 0;
    for (let unit = 1; unit <= UNITS; unit += 1) for (let i = 0; i < ACTIVITIES; i += 1) if ((unit + 1 + i) % 4 === 3) total += weightOf(i);
    const expected = Math.round((total / UNITS + Number.EPSILON) * 10000) / 10000;
    const progress = await manager.pmc.progress(scope);
    expect(progress.unitsWithoutNumber).toBe(0);
    expect(progress.projectProgressPercent).toBe(expected);
    // Each activity is complete in about a quarter of its units, and never above 100%.
    expect(progress.activities.every(activity => activity.completionPercent <= 100)).toBe(true);
    const [assigned] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_unit_activity_progress WHERE tenantId = ? AND assignedUserId = ?", [T, users.manager]);
    expect(Number(assigned[0].n)).toBe(UNITS * ACTIVITIES);
  }, 120_000);

  it("importing the same five files again changes nothing (the count is stable)", async () => {
    const manager = callerFor(users.manager, "pmc-import-manager");
    const before = [await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_unit_activity_progress"), await count("pmc_unit_activity_history"), await count("pmc_inspection_requests"), await count("pmc_baselines")];
    for (const kind of ["locations", "catalog", "status", "requests", "baseline"] as const) {
      const base64 = await files[kind]();
      const analysis = await manager.pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 });
      expect(analysis.errorCount).toBe(0);
      expect(analysis.counts.create + analysis.counts.update, kind).toBe(0);
      expect(analysis.canConfirm).toBe(false);
      await manager.pmc.confirmImport({ ...scope, kind, format: "xlsx", base64, approvedHash: analysis.fileHash });
    }
    expect([await count("pmc_units"), await count("pmc_activity_definitions"), await count("pmc_unit_activity_progress"), await count("pmc_unit_activity_history"), await count("pmc_inspection_requests"), await count("pmc_baselines")]).toEqual(before);
  }, 600_000);

  it("changes only what changed when a status file is imported again with one cell moved", async () => {
    const manager = callerFor(users.manager, "pmc-import-manager");
    const base64 = await sheet(["Unit", "Activity", "Status"], [[1, "ACT01", "Complete"], [1, "ACT02", "In progress"]]);
    const analysis = await manager.pmc.analyzeImport({ ...scope, kind: "status", format: "xlsx", base64 });
    // Unit 1, ACT01 was (1 + 1 + 0) % 4 = 2 -> "Under review"; ACT02 was (1 + 1 + 1) % 4 = 3 -> "Complete".
    expect(analysis.counts).toEqual({ create: 0, update: 2, unchanged: 0 });
    const before = await count("pmc_unit_activity_history");
    await manager.pmc.confirmImport({ ...scope, kind: "status", format: "xlsx", base64, approvedHash: analysis.fileHash });
    expect(await count("pmc_unit_activity_history")).toBe(before + 2);
  }, 120_000);

  it("refuses a file with deliberate errors, with a report that names each row and reason, and saves nothing", async () => {
    const manager = callerFor(users.manager, "pmc-import-manager");
    const before = [await count("pmc_unit_activity_progress"), await count("pmc_activity_definitions")];

    // Weights: model F totals 99, and one row has no group.
    const wrongCatalog = await sheet(["Model", "Group", "Stage", "Activity", "Activity name", "Weight"], [["F", "G1", "S1", "X1", "x1", 60], ["F", "G1", "S1", "X2", "x2", 39], ["A", "", "S1", "ACT01", "a", 100]]);
    const catalogReport = await manager.pmc.analyzeImport({ ...scope, kind: "catalog", format: "xlsx", base64: wrongCatalog });
    expect(catalogReport.canConfirm).toBe(false);
    expect(catalogReport.errors).toEqual(expect.arrayContaining([
      { rowNumber: 0, code: "PMC_MODEL_WEIGHTS_NOT_100", field: "F", detail: "F totals 99" },
      { rowNumber: 4, code: "PMC_CLASSIFICATION_BLANK", field: "groupCode" },
    ]));

    const wrongStatus = await sheet(["Unit", "Activity", "Status", "Engineer"], [[9999, "ACT01", "Complete", ""], [1, "ACT01", "finished-ish", ""], [1, "NOPE", "Complete", ""], [1, "ACT03", "Complete", "stranger@example.test"], [2, "ACT03", "Complete", ""], [2, "ACT03", "In progress", ""]]);
    const statusReport = await manager.pmc.analyzeImport({ ...scope, kind: "status", format: "xlsx", base64: wrongStatus });
    expect(statusReport.errors.map(e => [e.rowNumber, e.code])).toEqual([[2, "PMC_UNIT_NOT_FOUND"], [3, "PMC_STATUS_INVALID"], [4, "PMC_ACTIVITY_NOT_FOUND"], [5, "PMC_ENGINEER_NOT_A_MEMBER"], [7, "IMPORT_DUPLICATE_FILE_KEY"]]);
    await expect(manager.pmc.confirmImport({ ...scope, kind: "status", format: "xlsx", base64: wrongStatus, approvedHash: statusReport.fileHash })).rejects.toThrow("PROJECT_OS_IMPORT_VALIDATION_FAILED");

    const notAWorkbook = await manager.pmc.analyzeImport({ ...scope, kind: "status", format: "xlsx", base64: Buffer.from("not a workbook").toString("base64") });
    expect(notAWorkbook.errors).toEqual([{ rowNumber: 0, code: "IMPORT_WORKBOOK_INVALID" }]);

    expect([await count("pmc_unit_activity_progress"), await count("pmc_activity_definitions")]).toEqual(before);
  }, 120_000);

  it("saves nothing when the bytes differ from the file that was approved", async () => {
    const manager = callerFor(users.manager, "pmc-import-manager");
    const approved = await sheet(["Unit", "Activity", "Status"], [[3, "ACT01", "Complete"]]);
    const swapped = await sheet(["Unit", "Activity", "Status"], [[3, "ACT01", "Not started"]]);
    const analysis = await manager.pmc.analyzeImport({ ...scope, kind: "status", format: "xlsx", base64: approved });
    await expect(manager.pmc.confirmImport({ ...scope, kind: "status", format: "xlsx", base64: swapped, approvedHash: analysis.fileHash })).rejects.toThrow("PROJECT_OS_PMC_IMPORT_FILE_CHANGED");
  }, 60_000);

  it("is closed to a read-only role and to another tenant's project", async () => {
    const reader = callerFor(users.reader, "pmc-import-reader");
    const manager = callerFor(users.manager, "pmc-import-manager");
    const base64 = await sheet(["Unit", "Activity", "Status"], [[3, "ACT01", "Complete"]]);
    await expect(reader.pmc.analyzeImport({ ...scope, kind: "status", format: "xlsx", base64 })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    await expect(manager.pmc.analyzeImport({ tenantId: T, projectId: P_OTHER, kind: "status", format: "xlsx", base64 })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
  }, 60_000);
});
