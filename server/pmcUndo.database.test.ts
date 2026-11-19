import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// Q-44 (adviser 18-11) on a real database, through the real router, as the restricted application role: «undo the last save» for a progress batch and a QC
// receipt batch. Positive: the cells go back to what they were, by a reverse save (history rows noted «undo <batch>», a new QC event), with an audit row; the
// original rows stay. Negative, each refused with nothing written: another person, after 15 minutes, a cell changed after the save, a second undo, another
// company, a role without the save's permission. Synthetic data only.
const T = "44000000-0000-4000-8000-0000000044a1";
const T_OTHER = "44000000-0000-4000-8000-0000000044b1";
const P = "44000000-0000-4000-8000-0000000044a2";
const P_OTHER = "44000000-0000-4000-8000-0000000044b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

const MANAGER_EMAIL = "q44u-manager@pmc.example.test";

let connection: fixtureDb.Connection;
const users = { manager: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const asBase64 = (bytes: Buffer) => bytes.toString("base64");

async function sheet(headers: string[], data: unknown[][]) {
  return asBase64(await buildSpreadsheet({ sheetName: "data", headers, rows: data, format: "xlsx" }));
}

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
  await connection.query("DELETE FROM users WHERE openId IN ('q44u-manager','q44u-reader')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-44: undo the last progress or QC save, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q44u-manager','Import Manager', ?, 'user'),('q44u-reader','Import Reader','q44u-reader@pmc.example.test','user')", [MANAGER_EMAIL]);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q44u-%'");
    users.manager = rows.find(r => r.openId === "q44u-manager")!.id;
    users.reader = rows.find(r => r.openId === "q44u-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q44 Undo Tenant', 'q44u-import'), (?, 'Q44 Undo Other', 'q44u-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q44-A', 'Import project', 'villas', 'SAR', 'active'), (?, ?, 'Q44-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q44u-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q44u-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q44u-ent-a', ?, 'q44u-sub-a', 'PROJECT', true, NOW()), ('q44u-ent-b', ?, 'q44u-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, code] of [["q44u-perm-read", "project.pmc.read"], ["q44u-perm-update", "project.pmc.update"], ["q44u-perm-manage", "project.pmc.manage"], ["q44u-perm-qc", "project.qc.receive"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, code, code]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code LIKE 'project.pmc.%'");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q44u-role-manager', ?, 'Q44U_MANAGER','Manager','PROJECT'), ('q44u-role-reader', ?, 'Q44U_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q44u-role-manager', ?),('q44u-role-manager', ?),('q44u-role-manager', ?),('q44u-role-reader', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q44u-m-manager', ?, ?, 'active'),('q44u-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q44u-mr-manager','q44u-m-manager','q44u-role-manager','company'),('q44u-mr-reader','q44u-m-reader','q44u-role-reader','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const manager = () => callerFor(users.manager, "q44u-manager");
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
  const importFile = async (kind: "locations" | "catalog", base64: string) => { const report = await manager().pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 }); expect(report.errorCount).toBe(0); await manager().pmc.confirmImport({ ...scope, kind, format: "xlsx", base64, approvedHash: report.fileHash }); };
  const progressOf = async (unitNumber: number) => (await manager().pmc.progress(scope)).units.find(unit => unit.unitNumber === unitNumber)!.progressPercent;
  const issueCodes = (error: unknown) => (((error as { cause?: { issues?: Array<{ code: string; villa?: string }> } }).cause?.issues) ?? []).map(issue => `${issue.code}${issue.villa ? `:${issue.villa}` : ""}`);

  const other = () => callerFor(users.reader, "q44u-reader");
  const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
  const statusOf = async (unitNumber: number, activity: string) => {
    const [rows] = await connection.query<{ status: string }[]>("SELECT p.status FROM pmc_unit_activity_progress p JOIN pmc_units u ON u.id = p.unitId JOIN pmc_activity_definitions d ON d.id = p.activityDefinitionId WHERE p.tenantId = ? AND u.unitNumber = ? AND d.code = ?", [T, unitNumber, activity]);
    return rows[0]?.status ?? null;
  };
  const receiptOf = async (unitNumber: number) => {
    const [rows] = await connection.query<{ received: boolean }[]>("SELECT r.received FROM pmc_qc_receipts r JOIN pmc_units u ON u.id = r.unitId JOIN pmc_activity_definitions d ON d.id = r.activityDefinitionId WHERE r.tenantId = ? AND u.unitNumber = ? AND d.code = 'FOOT'", [T, unitNumber]);
    return rows[0] ? Boolean(rows[0].received) : null; // the compatibility layer returns booleans as 1 / 0
  };
  const audits = async (action: string) => (await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [T, action]))[0][0].n;
  const writes = async () => (await count("pmc_unit_activity_history")) + (await count("pmc_qc_receipt_events")) + (await audits("pmc.progress_batch_undone")) + (await audits("pmc.qc_receipt_batch_undone"));
  const ageBatch = async (batchId: string, minutes: number) => connection.query("UPDATE audit_logs SET createdAt = NOW() - (? || ' minutes')::interval WHERE tenantId = ? AND metadata::jsonb ->> 'batchId' = ?", [String(minutes), T, batchId]);

  beforeAll(async () => {
    await importFile("locations", await sheet(["Zone", "Block", "Unit", "Model"], [["Z1", "B1", 1, "A"], ["Z1", "B1", 2, "A"], ["Z1", "B2", 3, "B"], ["Z1", "B2", 4, "B"]]));
    await importFile("catalog", await sheet(["Model", "Group", "Stage", "Activity", "Activity name", "Weight"], ["A", "B"].flatMap(model => [[model, "03 Concrete", "S1", "FOOT", "Footings", 40], [model, "09 Finishes", "S2", "PAINT", "Paint", 60]])));
    // both people save progress and QC (the second one is the «someone else» of the negatives)
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'q44u-role-manager', id FROM permissions WHERE code = 'project.qc.receive' ON CONFLICT DO NOTHING");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'q44u-role-reader', id FROM permissions WHERE code IN ('project.pmc.update', 'project.qc.receive') ON CONFLICT DO NOTHING");
  });

  it("POSITIVE (progress): the batch's cells go back — a cell that had a status gets it back, a cell the batch created goes to «not started» — by a reverse save with its history and audit; the original rows stay", async () => {
    await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["1"], status: "IN_PROGRESS", date: today });
    const historyBefore = await count("pmc_unit_activity_history");
    const saved = await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["1", "2"], status: "COMPLETE", date: today });
    expect([await statusOf(1, "FOOT"), await statusOf(2, "FOOT")]).toEqual(["COMPLETE", "COMPLETE"]);
    expect(await manager().pmc.undoProgressBatch({ ...scope, batchId: saved.batchId })).toEqual({ batchId: saved.batchId, cells: 2 });
    expect([await statusOf(1, "FOOT"), await statusOf(2, "FOOT")]).toEqual(["IN_PROGRESS", "NOT_STARTED"]);
    expect(await count("pmc_unit_activity_history")).toBe(historyBefore + 4); // two rows of the save kept, two of the undo added
    const [notes] = await connection.query<{ note: string }[]>("SELECT note FROM pmc_unit_activity_history WHERE tenantId = ? AND note = ?", [T, `undo ${saved.batchId}`]);
    expect(notes).toHaveLength(2);
    expect(await audits("pmc.progress_batch_undone")).toBe(1);
    expect(await audits("pmc.progress_batch_updated")).toBe(2);
  });

  it("NEGATIVE (progress): a second undo, another person, after 15 minutes, a cell changed after the save, another company, a role without the permission — each refused, nothing written", async () => {
    const first = await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", villas: ["1"], status: "IN_PROGRESS", date: today });
    await manager().pmc.undoProgressBatch({ ...scope, batchId: first.batchId });
    let before = await writes();
    expect(await code(manager().pmc.undoProgressBatch({ ...scope, batchId: first.batchId }))).toBe("PROJECT_OS_UNDO_ALREADY_DONE");
    const mine = await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", villas: ["2"], status: "IN_PROGRESS", date: today });
    before = await writes();
    expect(await code(other().pmc.undoProgressBatch({ ...scope, batchId: mine.batchId }))).toBe("PROJECT_OS_UNDO_NOT_YOURS");
    expect(await code(manager().pmc.undoProgressBatch({ tenantId: T_OTHER, projectId: P_OTHER, batchId: mine.batchId }))).not.toBe("no error");
    expect(await code(manager().pmc.undoProgressBatch({ ...scope, batchId: "44000000-0000-4000-8000-00000000dead" }))).toBe("PROJECT_OS_UNDO_BATCH_NOT_FOUND");
    expect(await writes()).toBe(before);
    // someone else saves the same cell afterwards: the undo is refused whole and names the villa
    await other().pmc.updateProgress({ ...scope, activityCode: "PAINT", villas: ["2"], status: "COMPLETE", date: today });
    before = await writes();
    const changed = await manager().pmc.undoProgressBatch({ ...scope, batchId: mine.batchId }).then(() => null, (error: { message: string; cause?: { villas?: string[] } }) => error);
    expect(changed?.message).toBe("PROJECT_OS_UNDO_CELLS_CHANGED");
    expect(changed?.cause?.villas).toEqual(["2"]);
    expect(await statusOf(2, "PAINT")).toBe("COMPLETE");
    expect(await writes()).toBe(before);
    // after 15 minutes
    const late = await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["3"], status: "IN_PROGRESS", date: today });
    await ageBatch(late.batchId, 16);
    before = await writes();
    expect(await code(manager().pmc.undoProgressBatch({ ...scope, batchId: late.batchId }))).toBe("PROJECT_OS_UNDO_EXPIRED");
    expect(await statusOf(3, "FOOT")).toBe("IN_PROGRESS");
    expect(await writes()).toBe(before);
  });

  it("POSITIVE (QC): the receipts go back by a new event, the new receipt to «not received»; NEGATIVE: another person, a receipt changed after, a second undo — refused, nothing written", async () => {
    await manager().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["1"], received: false, date: yesterday });
    const saved = await manager().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["1", "2"], received: true, date: today });
    expect([await receiptOf(1), await receiptOf(2)]).toEqual([true, true]);
    let before = await writes();
    expect(await code(other().pmc.undoQcReceiptBatch({ ...scope, batchId: saved.batchId }))).toBe("PROJECT_OS_UNDO_NOT_YOURS");
    expect(await writes()).toBe(before);
    const eventsBefore = await count("pmc_qc_receipt_events");
    expect(await manager().pmc.undoQcReceiptBatch({ ...scope, batchId: saved.batchId })).toEqual({ batchId: saved.batchId, receipts: 2 });
    expect([await receiptOf(1), await receiptOf(2)]).toEqual([false, false]);
    expect(await count("pmc_qc_receipt_events")).toBe(eventsBefore + 2);
    expect(await audits("pmc.qc_receipt_batch_undone")).toBe(1);
    before = await writes();
    expect(await code(manager().pmc.undoQcReceiptBatch({ ...scope, batchId: saved.batchId }))).toBe("PROJECT_OS_UNDO_ALREADY_DONE");
    const again = await manager().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["3"], received: true, date: today });
    await other().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["3"], received: false, date: today });
    before = await writes();
    expect(await code(manager().pmc.undoQcReceiptBatch({ ...scope, batchId: again.batchId }))).toBe("PROJECT_OS_UNDO_CELLS_CHANGED");
    expect(await receiptOf(3)).toBe(false);
    expect(await writes()).toBe(before);
  });

  it("a QC receipt after a progress save blocks undoing that progress save (the cell was acted on)", async () => {
    const saved = await manager().pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["4"], status: "COMPLETE", date: today });
    await other().pmc.updateQcReceipts({ ...scope, activityCode: "FOOT", villas: ["4"], received: true, date: today });
    expect(await code(manager().pmc.undoProgressBatch({ ...scope, batchId: saved.batchId }))).toBe("PROJECT_OS_UNDO_CELLS_CHANGED");
    expect(await statusOf(4, "FOOT")).toBe("COMPLETE");
  });

  it("a role without the save's permission is refused before anything", async () => {
    await connection.query("DELETE FROM role_permissions WHERE roleId = 'q44u-role-reader' AND permissionId IN (SELECT id FROM permissions WHERE code IN ('project.pmc.update', 'project.qc.receive'))");
    const saved = await manager().pmc.updateProgress({ ...scope, activityCode: "PAINT", villas: ["3"], status: "IN_PROGRESS", date: today });
    expect(await code(other().pmc.undoProgressBatch({ ...scope, batchId: saved.batchId }))).toMatch(/PERMISSION_DENIED|FEATURE/);
  });
});
