import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// Q-4 on a real database, through the real router, as the restricted application role: one activity of the weights table, several villas (list, range, block),
// one status and date, saved atomically with a history row per villa; the villa's and the project's progress come back at once. Refusals: an unknown villa, a
// date in the future, a missing field, a reader without the update permission, another company's project. Synthetic data only.
const T = "50000000-0000-4000-8000-0000000004a1";
const T_OTHER = "50000000-0000-4000-8000-0000000004b1";
const P = "50000000-0000-4000-8000-0000000004a2";
const P_OTHER = "50000000-0000-4000-8000-0000000004b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

const MODELS = ["A", "B", "C", "D", "E"];
const UNITS = 500;
const ACTIVITIES = 60;
const weightOf = (activityIndex: number) => (activityIndex < 50 ? 1.6 : 2); // 50 x 1.6 + 10 x 2 = 100
const modelOf = (unit: number) => MODELS[(unit - 1) % MODELS.length];
const STATUS_WORDS = ["Not started", "In progress", "Under review", "Complete"];
const MANAGER_EMAIL = "q4p-manager@pmc.example.test";

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
  await connection.query("DELETE FROM users WHERE openId IN ('q4p-manager','q4p-reader')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-4: the site engineer's progress update on the weights table, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q4p-manager','Import Manager', ?, 'user'),('q4p-reader','Import Reader','q4p-reader@pmc.example.test','user')", [MANAGER_EMAIL]);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q4p-%'");
    users.manager = rows.find(r => r.openId === "q4p-manager")!.id;
    users.reader = rows.find(r => r.openId === "q4p-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q4 Progress Tenant', 'q4p-import'), (?, 'Q4 Progress Other', 'q4p-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q4-A', 'Import project', 'villas', 'SAR', 'active'), (?, ?, 'Q4-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q4p-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q4p-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q4p-ent-a', ?, 'q4p-sub-a', 'PROJECT', true, NOW()), ('q4p-ent-b', ?, 'q4p-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, code] of [["q4p-perm-read", "project.pmc.read"], ["q4p-perm-update", "project.pmc.update"], ["q4p-perm-manage", "project.pmc.manage"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q4p-role-manager', ?, 'Q4P_MANAGER','Manager','PROJECT'), ('q4p-role-reader', ?, 'Q4P_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q4p-role-manager', ?),('q4p-role-manager', ?),('q4p-role-manager', ?),('q4p-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q4p-m-manager', ?, ?, 'active'),('q4p-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q4p-mr-manager','q4p-m-manager','q4p-role-manager','company'),('q4p-mr-reader','q4p-m-reader','q4p-role-reader','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const manager = () => callerFor(users.manager, "q4p-manager");
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
  const importFile = async (kind: "locations" | "catalog", base64: string) => { const report = await manager().pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 }); expect(report.errorCount).toBe(0); await manager().pmc.confirmImport({ ...scope, kind, format: "xlsx", base64, approvedHash: report.fileHash }); };
  const progressOf = async (unitNumber: number) => (await manager().pmc.progress(scope)).units.find(unit => unit.unitNumber === unitNumber)!.progressPercent;
  const issueCodes = (error: unknown) => (((error as { cause?: { issues?: Array<{ code: string; villa?: string }> } }).cause?.issues) ?? []).map(issue => `${issue.code}${issue.villa ? `:${issue.villa}` : ""}`);

  beforeAll(async () => {
    await importFile("locations", await sheet(["Zone", "Block", "Unit", "Model"], [["Z1", "B1", 1, "A"], ["Z1", "B1", 2, "A"], ["Z1", "B2", 3, "B"], ["Z1", "B2", 4, "B"]]));
    await importFile("catalog", await sheet(["Model", "Group", "Stage", "Activity", "Activity name", "Weight"], ["A", "B"].flatMap(model => [[model, "03 Concrete", "S1", "FOOT", "Footings", 40], [model, "09 Finishes", "S2", "PAINT", "Paint", 60]])));
  });

  it("lists the weights table's activities with their section and weight", async () => {
    expect(await manager().pmc.progressActivities(scope)).toEqual([{ code: "FOOT", name: "Footings", section: "03 Concrete", minWeight: 40, maxWeight: 40 }, { code: "PAINT", name: "Paint", section: "09 Finishes", minWeight: 60, maxWeight: 60 }]);
  });

  it("one activity, a list of villas across two models, COMPLETE: saved at once, the villas' and the project's progress come back, and each villa has its history row", async () => {
    const result = await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["1", "3"], status: "COMPLETE", date: yesterday });
    expect(result).toMatchObject({ changed: 2, unchanged: 0, villas: [{ villa: "1", progressPercent: 40 }, { villa: "3", progressPercent: 40 }] });
    expect(result.projectProgressPercent).toBe(20); // (40 + 0 + 40 + 0) / 4
    const history = await manager().pmc.progressHistory({ ...scope, villa: "3" });
    expect(history.map(row => `${row.activityCode}:${row.from ?? "-"}>${row.to}:${row.by}`)).toEqual(["FOOT:->COMPLETE:Import Manager"]);
    expect(new Date(history[0].at).toISOString().slice(0, 10)).toBe(yesterday);
  });

  it("a range and a whole block work the same; asking again changes nothing", async () => {
    expect((await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", range: "1-2", status: "IN_PROGRESS", date: today })).changed).toBe(2);
    expect((await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", blockCode: "B2", status: "COMPLETE", date: today })).changed).toBe(2);
    expect(await progressOf(3)).toBe(100);
    expect((await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", blockCode: "B2", status: "COMPLETE", date: today })).changed).toBe(0);
  });

  it("atomic: one unknown villa refuses the whole entry and names it; nothing is written", async () => {
    const before = await count("pmc_unit_activity_history");
    const error = await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["2", "999"], status: "COMPLETE", date: today }).then(() => null, caught => caught);
    expect(issueCodes(error)).toEqual(["SITE_VILLA_UNKNOWN:999"]);
    expect(await progressOf(2)).toBe(0);
    expect(await count("pmc_unit_activity_history")).toBe(before);
  });

  it("a date in the future and a missing field are refused before anything is read", async () => {
    expect(issueCodes(await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["2"], status: "COMPLETE", date: tomorrow }).then(() => null, caught => caught))).toEqual(["SITE_DATE_IN_FUTURE"]);
    expect(issueCodes(await manager().pmc.updateProgress({ ...scope, activityCode: "", villas: [], status: "COMPLETE", date: today }).then(() => null, caught => caught))).toEqual(["SITE_FIELD_MISSING", "SITE_FIELD_MISSING"]);
  });

  it("server permission: a reader cannot update, and the manager cannot update another company's project", async () => {
    await expect(callerFor(users.reader, "q4p-reader").pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["2"], status: "COMPLETE", date: today })).rejects.toThrow();
    await expect(manager().pmc.updateProgress({ tenantId: T_OTHER, projectId: P_OTHER, activityCode: "FOOT", villas: ["2"], status: "COMPLETE", date: today })).rejects.toThrow();
    expect(await progressOf(2)).toBe(0);
  });
});
