import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// Q-5 on a real database, through the real router, as the restricted application role: «received / not received» for one activity on several villas, saved
// atomically with an event per villa, apart from the site's progress; counters per activity; a villa's two states; a warning when the villa is not complete on
// site. Refusals: an unknown villa, a future date, a role without project.qc.receive (the site engineer's role included), another company's project.
const T = "50000000-0000-4000-8000-0000000005a1";
const T_OTHER = "50000000-0000-4000-8000-0000000005b1";
const P = "50000000-0000-4000-8000-0000000005a2";
const P_OTHER = "50000000-0000-4000-8000-0000000005b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

const MODELS = ["A", "B", "C", "D", "E"];
const UNITS = 500;
const ACTIVITIES = 60;
const weightOf = (activityIndex: number) => (activityIndex < 50 ? 1.6 : 2); // 50 x 1.6 + 10 x 2 = 100
const modelOf = (unit: number) => MODELS[(unit - 1) % MODELS.length];
const STATUS_WORDS = ["Not started", "In progress", "Under review", "Complete"];
const MANAGER_EMAIL = "q5q-manager@pmc.example.test";

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
  for (const table of ["pmc_qc_receipt_events", "pmc_qc_receipts", "pmc_unit_activity_history", "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "pmc_baselines", "pmc_status_factors", "pmc_verification_statuses", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [P, P_OTHER]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('q5q-manager','q5q-reader')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-5: the QC engineer's receipts, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q5q-manager','Import Manager', ?, 'user'),('q5q-reader','Import Reader','q5q-reader@pmc.example.test','user')", [MANAGER_EMAIL]);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q5q-%'");
    users.manager = rows.find(r => r.openId === "q5q-manager")!.id;
    users.reader = rows.find(r => r.openId === "q5q-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q5 QC Tenant', 'q5q-import'), (?, 'Q5 QC Other', 'q5q-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q5-A', 'Import project', 'villas', 'SAR', 'active'), (?, ?, 'Q5-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q5q-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q5q-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q5q-ent-a', ?, 'q5q-sub-a', 'PROJECT', true, NOW()), ('q5q-ent-b', ?, 'q5q-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, code] of [["q5q-perm-read", "project.pmc.read"], ["q5q-perm-update", "project.pmc.update"], ["q5q-perm-manage", "project.pmc.manage"], ["q5q-perm-qc", "project.qc.receive"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q5q-role-manager', ?, 'Q5Q_MANAGER','Manager','PROJECT'), ('q5q-role-reader', ?, 'Q5Q_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q5q-role-manager', ?),('q5q-role-manager', ?),('q5q-role-manager', ?),('q5q-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q5q-m-manager', ?, ?, 'active'),('q5q-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q5q-mr-manager','q5q-m-manager','q5q-role-manager','company'),('q5q-mr-reader','q5q-m-reader','q5q-role-reader','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const manager = () => callerFor(users.manager, "q5q-manager");
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

  const qc = () => callerFor(users.manager, "q5q-manager");

  it("the QC grant: only a role with project.qc.receive may write; the manager is given it here, the reader is not", async () => {
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'q5q-role-manager', id FROM permissions WHERE code = 'project.qc.receive' ON CONFLICT DO NOTHING");
    await expect(callerFor(users.reader, "q5q-reader").pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["1"], received: true, date: today })).rejects.toThrow();
  });

  it("received on two villas: saved at once with an event each; the site's progress is untouched; the counters and the villa's card show it", async () => {
    await qc().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["1"], status: "COMPLETE", date: today });
    const result = await qc().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["1", "3"], received: true, date: yesterday });
    expect(result).toMatchObject({ changed: 2, unchanged: 0, warnings: [{ code: "QC_NOT_COMPLETE_ON_SITE", villas: ["3"] }] });
    expect(await count("pmc_qc_receipt_events")).toBe(2);
    expect(await progressOf(3)).toBe(0); // QC does not move the site's progress
    expect((await qc().pmc.qcCounters(scope)).find(row => row.code === "FOOT")).toEqual({ code: "FOOT", name: "Footings", received: 2, total: 4, notReceived: 2 });
    const card = await qc().pmc.villaStates({ ...scope, villa: "1" });
    expect(card!.activities.find(row => row.code === "FOOT")).toEqual({ code: "FOOT", name: "Footings", siteStatus: "COMPLETE", qcReceived: true, qcOn: yesterday });
    const history = await qc().pmc.qcHistory({ ...scope, villa: "3" });
    expect(history.map(row => `${row.activityCode}:${row.from}>${row.to}:${row.by}`)).toEqual(["FOOT:null>true:Import Manager"]);
  });

  it("not received changes the state and writes its event; the same answer again writes nothing", async () => {
    expect((await qc().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", blockCode: "B2", received: false, date: today })).changed).toBe(2); // villa 3 back to not received, villa 4 new
    expect((await qc().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", blockCode: "B2", received: false, date: today })).changed).toBe(0);
    expect((await qc().pmc.qcCounters(scope)).find(row => row.code === "FOOT")!.received).toBe(1);
  });

  it("atomic: one unknown villa or a future date refuses the whole entry, and nothing is written", async () => {
    const before = await count("pmc_qc_receipt_events");
    const error = await qc().pmc.updateQcReceipts({ ...scope, activityCode: "PAINT", villas: ["2", "999"], received: true, date: today }).then(() => null, caught => caught);
    expect(issueCodes(error)).toEqual(["SITE_VILLA_UNKNOWN:999"]);
    expect(issueCodes(await qc().pmc.updateQcReceipts({ ...scope, activityCode: "PAINT", villas: ["2"], received: true, date: tomorrow }).then(() => null, caught => caught))).toEqual(["SITE_DATE_IN_FUTURE"]);
    expect(await count("pmc_qc_receipt_events")).toBe(before);
  });

  it("isolation: another company's project is refused, and nothing is written there", async () => {
    await expect(qc().pmc.updateQcReceipts({ tenantId: T_OTHER, projectId: P_OTHER, activityCode: "FOOT", villas: ["1"], received: true, date: today })).rejects.toThrow();
    const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM pmc_qc_receipts WHERE tenantId = ?", [T_OTHER]);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("Q-8: the QC map gives one activity's state on every villa (no receipt = not received; another model = none), reads with project.pmc.read, and refuses another company", async () => {
    expect(await qc().pmc.qcMap({ ...scope, activityCode: "FOOT" })).toEqual([
      { unitNumber: 1, modelCode: "A", blockCode: "B1", status: "RECEIVED" },
      { unitNumber: 2, modelCode: "A", blockCode: "B1", status: "NOT_RECEIVED" },
      { unitNumber: 3, modelCode: "B", blockCode: "B2", status: "NOT_RECEIVED" },
      { unitNumber: 4, modelCode: "B", blockCode: "B2", status: "NOT_RECEIVED" },
    ]);
    expect((await qc().pmc.qcMap({ ...scope, activityCode: "NO-SUCH" })).map(row => row.status)).toEqual([null, null, null, null]);
    expect((await callerFor(users.reader, "q5q-reader").pmc.qcMap({ ...scope, activityCode: "FOOT" }))[0]!.status).toBe("RECEIVED");
    await expect(qc().pmc.qcMap({ tenantId: T_OTHER, projectId: P_OTHER, activityCode: "FOOT" })).rejects.toThrow();
  });
});
