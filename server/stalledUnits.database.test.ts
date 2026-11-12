import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// Q-14 (a) on a real database, through the real router, as the restricted application role: villas whose last movement is backdated are classified by
// working days; complete and not-started villas are left out; the project's threshold changes the result and only a PMC manager may set it; another
// company's project is refused. Synthetic data only.
const T = "50000000-0000-4000-8000-0000000014a1";
const T_OTHER = "50000000-0000-4000-8000-0000000014b1";
const P = "50000000-0000-4000-8000-0000000014a2";
const P_OTHER = "50000000-0000-4000-8000-0000000014b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

const MODELS = ["A", "B", "C", "D", "E"];
const UNITS = 500;
const ACTIVITIES = 60;
const weightOf = (activityIndex: number) => (activityIndex < 50 ? 1.6 : 2); // 50 x 1.6 + 10 x 2 = 100
const modelOf = (unit: number) => MODELS[(unit - 1) % MODELS.length];
const STATUS_WORDS = ["Not started", "In progress", "Under review", "Complete"];
const MANAGER_EMAIL = "q14s-manager@pmc.example.test";

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
  for (const table of ["project_stall_settings", "pmc_qc_receipt_events", "pmc_qc_receipts", "pmc_unit_activity_history", "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_verification_statuses", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [P, P_OTHER]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('q14s-manager','q14s-reader')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-14 (a): stalled villas, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q14s-manager','Import Manager', ?, 'user'),('q14s-reader','Import Reader','q14s-reader@pmc.example.test','user')", [MANAGER_EMAIL]);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q14s-%'");
    users.manager = rows.find(r => r.openId === "q14s-manager")!.id;
    users.reader = rows.find(r => r.openId === "q14s-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q14 Stall Tenant', 'q14s-import'), (?, 'Q14 Stall Other', 'q14s-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q14-A', 'Import project', 'villas', 'SAR', 'active'), (?, ?, 'Q14-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q14s-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q14s-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q14s-ent-a', ?, 'q14s-sub-a', 'PROJECT', true, NOW()), ('q14s-ent-b', ?, 'q14s-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, code] of [["q14s-perm-read", "project.pmc.read"], ["q14s-perm-update", "project.pmc.update"], ["q14s-perm-manage", "project.pmc.manage"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q14s-role-manager', ?, 'Q14S_MANAGER','Manager','PROJECT'), ('q14s-role-reader', ?, 'Q14S_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q14s-role-manager', ?),('q14s-role-manager', ?),('q14s-role-manager', ?),('q14s-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q14s-m-manager', ?, ?, 'active'),('q14s-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q14s-mr-manager','q14s-m-manager','q14s-role-manager','company'),('q14s-mr-reader','q14s-m-reader','q14s-role-reader','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const manager = () => callerFor(users.manager, "q14s-manager");
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

  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
  const backdate = (unitNumber: number, when: Date) => connection.query("UPDATE pmc_unit_activity_progress SET lastChangedAt = ? WHERE unitId = (SELECT id FROM pmc_units WHERE tenantId = ? AND unitNumber = ?)", [when, T, unitNumber]);

  it("a villa last moved 12 calendar days ago is stalled, one moved today is active; the complete and the never-started villas are left out", async () => {
    await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["1", "2", "3"], status: "IN_PROGRESS", date: today });
    await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["3"], status: "COMPLETE", date: today });
    await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", villas: ["3"], status: "COMPLETE", date: today });
    await backdate(1, daysAgo(12));
    const result = await manager().pmc.stalledUnits(scope);
    expect(result.threshold).toBe(3);
    expect(result.rows.map(row => `${row.villa}:${row.state}:${row.lastActivity?.code}>${row.nextActivity?.code}`)).toEqual(["1:stalled:FOOT>FOOT", "2:active:FOOT>FOOT"]);
    expect(result.rows[0].workingDays).toBeGreaterThan(3);
    expect(result.counts).toEqual({ stalled: 1, long: 0, active: 1 });
  });

  it("the threshold is the project's: raised to 60 the same villa is active; a reader may read but not set it; out of range is refused", async () => {
    await expect(callerFor(users.reader, "q14s-reader").pmc.setStallThreshold({ ...scope, thresholdDays: 60 })).rejects.toThrow();
    await expect(manager().pmc.setStallThreshold({ ...scope, thresholdDays: 0 })).rejects.toThrow();
    expect(await manager().pmc.setStallThreshold({ ...scope, thresholdDays: 60 })).toEqual({ thresholdDays: 60 });
    const result = await callerFor(users.reader, "q14s-reader").pmc.stalledUnits(scope);
    expect(result.rows.find(row => row.villa === "1")!.state).toBe("active");
    await manager().pmc.setStallThreshold({ ...scope, thresholdDays: 3 });
  });

  it("over 14 working days is long-stalled", async () => {
    await backdate(1, daysAgo(40));
    expect((await manager().pmc.stalledUnits(scope)).rows.find(row => row.villa === "1")!.state).toBe("long");
  });

  it("isolation: another company's project is refused", async () => {
    await expect(manager().pmc.stalledUnits({ tenantId: T_OTHER, projectId: P_OTHER })).rejects.toThrow();
  });
});
