import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// Q-3 on a real database, through the real router, as the restricted application role: a villa list with no zone column (block | villa | model), then the weights
// table (CSI | sub-item | activity | weight, plus columns the tool does not know) applied to every model, imported again without duplicates; a table that does not
// total 100% refused with the difference; and the other company's manager refused. Synthetic data only.
const T = "50000000-0000-4000-8000-0000000003a1";
const T_OTHER = "50000000-0000-4000-8000-0000000003b1";
const P = "50000000-0000-4000-8000-0000000003a2";
const P_OTHER = "50000000-0000-4000-8000-0000000003b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

const MODELS = ["A", "B", "C", "D", "E"];
const UNITS = 500;
const ACTIVITIES = 60;
const weightOf = (activityIndex: number) => (activityIndex < 50 ? 1.6 : 2); // 50 x 1.6 + 10 x 2 = 100
const modelOf = (unit: number) => MODELS[(unit - 1) % MODELS.length];
const STATUS_WORDS = ["Not started", "In progress", "Under review", "Complete"];
const MANAGER_EMAIL = "q3w-manager@pmc.example.test";

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
  await connection.query("DELETE FROM users WHERE openId IN ('q3w-manager','q3w-reader')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-3: the weights table and the villa list in the owner's own format, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q3w-manager','Import Manager', ?, 'user'),('q3w-reader','Import Reader','q3w-reader@pmc.example.test','user')", [MANAGER_EMAIL]);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q3w-%'");
    users.manager = rows.find(r => r.openId === "q3w-manager")!.id;
    users.reader = rows.find(r => r.openId === "q3w-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q3 Weights Tenant', 'q3w-import'), (?, 'Q3 Weights Other', 'q3w-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q3-A', 'Import project', 'villas', 'SAR', 'active'), (?, ?, 'Q3-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q3w-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q3w-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q3w-ent-a', ?, 'q3w-sub-a', 'PROJECT', true, NOW()), ('q3w-ent-b', ?, 'q3w-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, code] of [["q3w-perm-read", "project.pmc.read"], ["q3w-perm-update", "project.pmc.update"], ["q3w-perm-manage", "project.pmc.manage"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q3w-role-manager', ?, 'Q3W_MANAGER','Manager','PROJECT'), ('q3w-role-reader', ?, 'Q3W_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q3w-role-manager', ?),('q3w-role-manager', ?),('q3w-role-manager', ?),('q3w-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q3w-m-manager', ?, ?, 'active'),('q3w-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q3w-mr-manager','q3w-m-manager','q3w-role-manager','company'),('q3w-mr-reader','q3w-m-reader','q3w-role-reader','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const manager = () => callerFor(users.manager, "q3w-manager");
  const villas = () => sheet(["البلوك", "الفيلا", "النموذج"], [["B1", 1, "A"], ["B1", 2, "A"], ["B2", 3, "B"], ["B2", 4, "B"]]);
  const weights = (rows: unknown[][]) => sheet(["بند CSI", "البند الفرعي", "النشاط", "NEW Percentage", "ملاحظات"], rows);
  const fullTable = [["03 Concrete", "Foundations", "Footings", 0.25, "x"], ["03 Concrete", "Frame", "Columns and slabs", 0.35, ""], ["09 Finishes", "", "Paint", 0.4, ""], ["09 Finishes", "", "Cleaning", 0, "skipped"]];
  const run = async (kind: "locations" | "weights", base64: string) => { const analysis = await manager().pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 }); return analysis; };

  it("a villa list without a zone column, then a weights table in fractions, apply to every model; zero rows are skipped and said", async () => {
    const list = await villas();
    const villaReport = await run("locations", list);
    expect(villaReport.errorCount).toBe(0);
    await manager().pmc.confirmImport({ ...scope, kind: "locations", format: "xlsx", base64: list, approvedHash: villaReport.fileHash });
    expect(await count("pmc_units")).toBe(4);
    const table = await weights(fullTable);
    const report = await run("weights", table);
    expect(report.errorCount).toBe(0);
    expect(report.details).toMatchObject({ ignoredZeroWeight: 1, scaledFromFractions: true, models: ["A", "B"] });
    expect(report.counts).toEqual({ create: 6, update: 0, unchanged: 0 }); // 3 activities x 2 models
    await manager().pmc.confirmImport({ ...scope, kind: "weights", format: "xlsx", base64: table, approvedHash: report.fileHash });
    const [rows] = await connection.query<{ modelCode: string; weightPercent: string }[]>("SELECT modelCode, weightPercent FROM pmc_activity_definitions WHERE tenantId = ? ORDER BY modelCode, weightPercent", [T]);
    expect(rows.map(row => `${row.modelCode}:${Number(row.weightPercent)}`)).toEqual(["A:25", "A:35", "A:40", "B:25", "B:35", "B:40"]);
    const structure = await manager().pmc.structure(scope);
    expect(structure.models.find(model => model.modelCode === "A")!.activities.map(activity => activity.section).sort()).toEqual(["03 Concrete", "03 Concrete", "09 Finishes"]);
  });

  it("importing the same table again changes nothing (no duplicate activity)", async () => {
    const report = await run("weights", await weights(fullTable));
    expect(report.counts).toEqual({ create: 0, update: 0, unchanged: 6 });
    expect(report.canConfirm).toBe(false);
    expect(await count("pmc_activity_definitions")).toBe(6);
  });

  it("a table that does not total 100% is refused, the report names the model and the difference, and nothing is saved", async () => {
    const short = await weights([["03 Concrete", "Foundations", "Footings", 25, ""], ["03 Concrete", "Frame", "Columns and slabs", 35, ""], ["09 Finishes", "", "Paint", 38.5, ""]]);
    const report = await run("weights", short);
    expect(report.canConfirm).toBe(false);
    const totals = report.errors.filter(error => error.code === "PMC_MODEL_WEIGHTS_NOT_100");
    expect(totals.map(error => error.detail)).toEqual(["A totals 98.5 (missing 1.5)", "B totals 98.5 (missing 1.5)"]);
    await expect(manager().pmc.confirmImport({ ...scope, kind: "weights", format: "xlsx", base64: short, approvedHash: report.fileHash })).rejects.toThrow();
    const [rows] = await connection.query<{ weightPercent: string }[]>("SELECT weightPercent FROM pmc_activity_definitions WHERE tenantId = ? AND name = 'Paint'", [T]);
    expect(rows.map(row => Number(row.weightPercent))).toEqual([40, 40]);
  });

  it("isolation: the manager of this company cannot import into another company's project, and a reader cannot import at all", async () => {
    await expect(manager().pmc.analyzeImport({ tenantId: T_OTHER, projectId: P_OTHER, kind: "weights", format: "xlsx", base64: await weights(fullTable) })).rejects.toThrow();
    await expect(callerFor(users.reader, "q3w-reader").pmc.analyzeImport({ ...scope, kind: "weights", format: "xlsx", base64: await weights(fullTable) })).rejects.toThrow();
    const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_activity_definitions WHERE tenantId = ?", [T_OTHER]);
    expect(Number(rows[0].n)).toBe(0);
  });
});
