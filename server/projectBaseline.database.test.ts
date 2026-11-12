import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-10 (a) on a real database, through the real router, as the restricted application role: the project's base-file checklist (what is uploaded, what is missing) and the contract form.
// Isolation between companies and between projects of one company; a refused write leaves no row and no audit row. Synthetic data only (*.example.test, made-up names).
const SLUG = "proj-baseline";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pb.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const projectA = "b1000000-0000-4000-8000-000000000001";
const projectB = "b1000000-0000-4000-8000-000000000002";
const projectC = "b1000000-0000-4000-8000-000000000003"; // in the other company
const KEYS = ["owner", "manager", "engineer", "otherOwner"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const audits = (action: string) => count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [tenantId, action]);
const item = (status: { items: Array<{ code: string; state: string; count: number; detail: Record<string, unknown> }> }, name: string) => status.items.find(entry => entry.code === name)!;
const contract = (overrides: Record<string, unknown> = {}) => ({ tenantId, projectId: projectA, contractValue: 12_500_000.5, plannedStartAt: "2026-01-15", plannedFinishAt: "2027-06-30", ...overrides });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["boq_items", "pmc_plan_months", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "activities", "wbs_items", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'pb-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("project base file: the checklist and the contract form on a real database (Q-10 a)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`pb-${key}`, `PB ${key}`, `pb-${key}@pb.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pb-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `pb-${key}`)!.id; callers[key] = callerFor(ids[key], `pb-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Baseline Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Baseline Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PB-A', 'Baseline A', 'villas', 'SAR', 'active'), (?, ?, 'PB-B', 'Baseline B', 'villas', 'SAR', 'active'), (?, ?, 'PB-C', 'Baseline C', 'villas', 'SAR', 'active')", [projectA, tenantId, projectB, tenantId, projectC, otherTenantId]);
    // the project manager holds project.manage on project A only; the site engineer reads A but does not manage the project
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "PB_MANAGER", name: "Project manager (A)", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const engineer = await callers.owner.tenant.createRole({ tenantId, code: "PB_ENGINEER", name: "Site engineer (A)", productCode: "PROJECT", permissionCodes: ["project.read", "project.field.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: projectA });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: engineer.id, scopeType: "project", scopeId: projectA });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("a new project has nothing: seven required items missing, labour optional, contract missing", async () => {
    const status = await callers.manager.projects.baseline.status({ tenantId, projectId: projectA });
    expect(status).toMatchObject({ ready: 0, required: 7 });
    expect(status.items.map(entry => entry.code)).toEqual(["contract", "schedule", "cashFlow", "weights", "units", "boq", "wbs", "labour"]);
    for (const name of ["contract", "schedule", "cashFlow", "weights", "units", "boq", "wbs"]) expect(item(status, name)).toMatchObject({ state: "missing", count: 0 });
    expect(item(status, "labour")).toMatchObject({ state: "optional", count: 0 });
  });

  it("the project manager saves the contract; the checklist then reads it as uploaded with its value and dates; one audit row", async () => {
    const saved = await callers.manager.projects.baseline.saveContract(contract());
    expect(item(saved, "contract")).toMatchObject({ state: "uploaded", count: 1, detail: { contractValue: "12500000.50", plannedStartAt: "2026-01-15", plannedFinishAt: "2027-06-30" } });
    expect(saved).toMatchObject({ ready: 1, required: 7 });
    expect(await audits("project.contract_saved")).toBe(1);
    // the stored columns are what the programme and finance screens already read
    const [[row]] = await connection.query<{ contractValue: string }[]>("SELECT contractValue FROM projects WHERE id = ?", [projectA]);
    expect(Number(row.contractValue)).toBe(12_500_000.5);
    // saving again replaces it, and writes a second audit row
    const again = await callers.manager.projects.baseline.saveContract(contract({ contractValue: 9_000_000, plannedFinishAt: "2027-12-31" }));
    expect(item(again, "contract").detail).toMatchObject({ contractValue: "9000000.00", plannedFinishAt: "2027-12-31" });
    expect(await audits("project.contract_saved")).toBe(2);
  });

  it("NEGATIVE: a site engineer (no project.manage) is refused, and nothing changes", async () => {
    const before = await audits("project.contract_saved");
    expect(await code(callers.engineer.projects.baseline.saveContract(contract({ contractValue: 1 })))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await audits("project.contract_saved")).toBe(before);
    const [[row]] = await connection.query<{ contractValue: string }[]>("SELECT contractValue FROM projects WHERE id = ?", [projectA]);
    expect(Number(row.contractValue)).toBe(9_000_000);
    // reading is allowed to the engineer
    expect((await callers.engineer.projects.baseline.status({ tenantId, projectId: projectA })).required).toBe(7);
  });

  it("NEGATIVE: a value that is not a positive number, or dates that are not real or out of order, is refused with its own message and writes nothing", async () => {
    const before = await audits("project.contract_saved");
    for (const value of [0, -5, Number.NaN, 1e15]) expect(await code(callers.manager.projects.baseline.saveContract(contract({ contractValue: value })))).toContain("PROJECT_OS_CONTRACT_VALUE_INVALID"); // the input layer (NaN) wraps its issue list; the issue message is the translated code
    for (const dates of [{ plannedStartAt: "2027-01-01", plannedFinishAt: "2026-12-31" }, { plannedStartAt: "2026-02-30" }, { plannedFinishAt: "31/12/2027" }, { plannedStartAt: "" }, { plannedFinishAt: "2027-12-31T00:00:00Z" }]) {
      expect(await code(callers.manager.projects.baseline.saveContract(contract(dates)))).toContain("PROJECT_OS_CONTRACT_DATES_INVALID");
    }
    expect(await audits("project.contract_saved")).toBe(before);
    const [[row]] = await connection.query<{ contractValue: string }[]>("SELECT contractValue FROM projects WHERE id = ?", [projectA]);
    expect(Number(row.contractValue)).toBe(9_000_000);
  });

  it("the other items are read from what the importers stored, and only for this project and company", async () => {
    // project A: two WBS items, one activity, one plan month, one catalogue line, one unit
    const wbsA = "b1000000-0000-4000-8000-0000000000a1";
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'W1', 'Structure', 100), (?, ?, ?, 'W2', 'Finishes', 50)", [wbsA, tenantId, projectA, "b1000000-0000-4000-8000-0000000000a2", tenantId, projectA]);
    await connection.query("INSERT INTO activities (id, tenantId, projectId, wbsItemId, code, name, status, plannedValue, plannedStartAt, plannedFinishAt) VALUES (?, ?, ?, ?, 'A1', 'Pour slab', 'not_started', 10, NOW(), NOW() + INTERVAL '5 days')", ["b1000000-0000-4000-8000-0000000000b1", tenantId, projectA, wbsA]);
    await connection.query("INSERT INTO pmc_plan_months (id, tenantId, projectId, month, plannedPercent, cumulativePercent) VALUES (?, ?, ?, '2026-02-01', 10, 10)", ["b1000000-0000-4000-8000-0000000000c1", tenantId, projectA]);
    const group = "b1000000-0000-4000-8000-0000000000d1"; const stage = "b1000000-0000-4000-8000-0000000000d2";
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'CSI-03', 'Concrete')", [group, tenantId, projectA]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'SUB-1', 'Foundation')", [stage, tenantId, projectA, group]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, 'M1', 'ACT-1', 'Excavation', 100), (?, ?, ?, ?, ?, 'M2', 'ACT-1', 'Excavation', 100)", ["b1000000-0000-4000-8000-0000000000e1", tenantId, projectA, group, stage, "b1000000-0000-4000-8000-0000000000e2", tenantId, projectA, group, stage]);
    const zone = "b1000000-0000-4000-8000-0000000000f1"; const block = "b1000000-0000-4000-8000-0000000000f2";
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [zone, tenantId, projectA]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [block, tenantId, projectA, zone]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode) VALUES (?, ?, ?, ?, 1, 'M1'), (?, ?, ?, ?, 2, 'M2'), (?, ?, ?, ?, 3, 'M2')", ["b1000000-0000-4000-8000-000000000101", tenantId, projectA, block, "b1000000-0000-4000-8000-000000000102", tenantId, projectA, block, "b1000000-0000-4000-8000-000000000103", tenantId, projectA, block]);
    // project B (same company) and project C (the other company) carry rows too, which must not show up in A
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'WB', 'Other project', 1), (?, ?, ?, 'WC', 'Other company', 1)", ["b1000000-0000-4000-8000-000000000201", tenantId, projectB, "b1000000-0000-4000-8000-000000000202", otherTenantId, projectC]);
    const status = await callers.manager.projects.baseline.status({ tenantId, projectId: projectA });
    expect(item(status, "wbs")).toMatchObject({ state: "uploaded", count: 2 });
    expect(item(status, "schedule")).toMatchObject({ state: "uploaded", count: 1 });
    expect(item(status, "cashFlow")).toMatchObject({ state: "uploaded", count: 1 });
    expect(item(status, "weights")).toMatchObject({ state: "uploaded", count: 2, detail: { models: 2 } });
    expect(item(status, "units")).toMatchObject({ state: "uploaded", count: 3 });
    expect(item(status, "boq")).toMatchObject({ state: "missing", count: 0 });
    expect(status).toMatchObject({ ready: 6, required: 7 });
    // project B has one WBS item and nothing else
    const other = await callers.owner.projects.baseline.status({ tenantId, projectId: projectB });
    expect(item(other, "wbs")).toMatchObject({ count: 1 }); expect(item(other, "units")).toMatchObject({ state: "missing", count: 0 });
  });

  it("NEGATIVE: another company cannot read or write this project, and a project of another company is not found here", async () => {
    expect(await code(callers.otherOwner.projects.baseline.status({ tenantId, projectId: projectA }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.baseline.saveContract(contract()))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    // the owner of company A names project C (which belongs to company B) under company A: not found, nothing written
    expect(await code(callers.owner.projects.baseline.saveContract(contract({ projectId: projectC })))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.owner.projects.baseline.status({ tenantId, projectId: projectC }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    const [[row]] = await connection.query<{ contractValue: string }[]>("SELECT contractValue FROM projects WHERE id = ?", [projectC]);
    expect(Number(row.contractValue)).toBe(0);
  });

  // Q-10 (b): the planned cash flow. Files are built in the test (synthetic months); project A already holds one month from the test above, which a save replaces.
  const csv = (body: string) => Buffer.from(`Month,Percent\n${body}`).toString("base64");
  const months = () => connection.query<{ month: string; plannedPercent: string; cumulativePercent: string }[]>("SELECT to_char(month, 'YYYY-MM') AS month, planned_percent AS \"plannedPercent\", cumulative_percent AS \"cumulativePercent\" FROM pmc_plan_months WHERE tenant_id = ? AND project_id = ? ORDER BY month", [tenantId, projectA]).then(result => result[0] as Array<{ month: string; plannedPercent: string; cumulativePercent: string }>);

  it("Q-10 b POSITIVE: the preview reports the months, total and S-curve and writes nothing; the save replaces the plan, audited, and the checklist shows the curve", async () => {
    const before = await months();
    const preview = await callers.manager.projects.baseline.previewCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-01,20%\n2027-02,50%\n2027-03,30%\n") });
    expect(preview).toMatchObject({ refusal: null, totalPercent: 100, issues: [] });
    expect(preview.months.map(m => m.cumulative)).toEqual([0.2, 0.7, 1]);
    expect(await months()).toEqual(before);
    const status = await callers.manager.projects.baseline.saveCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-01,20%\n2027-02,50%\n2027-03,30%\n") });
    expect((await months()).map(m => [m.month, Number(m.plannedPercent), Number(m.cumulativePercent)])).toEqual([["2027-01", 0.2, 0.2], ["2027-02", 0.5, 0.7], ["2027-03", 0.3, 1]]);
    expect(item(status, "cashFlow")).toMatchObject({ state: "uploaded", count: 3 });
    expect((item(status, "cashFlow").detail.curve as Array<{ cumulative: number }>).map(point => point.cumulative)).toEqual([0.2, 0.7, 1]);
    expect(await audits("project.cash_flow_saved")).toBe(1);
    // importing again with other months leaves exactly the new file's months: no duplicate, no leftover
    await callers.manager.projects.baseline.saveCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-02,40%\n2027-04,60%\n") });
    expect((await months()).map(m => m.month)).toEqual(["2027-02", "2027-04"]);
    const template = await callers.manager.projects.baseline.cashFlowTemplate({ tenantId, projectId: projectA, locale: "ar" });
    expect(Buffer.from(template.base64, "base64").subarray(0, 2).toString()).toBe("PK");
  });

  it("Q-10 b NEGATIVE: a total other than 100% or a refused row is reported in the preview, and the save is refused and changes nothing", async () => {
    const before = await months();
    const short = await callers.manager.projects.baseline.previewCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-01,40%\n2027-02,50%\n") });
    expect(short).toMatchObject({ refusal: "PROJECT_OS_CASHFLOW_TOTAL_NOT_100", totalPercent: 90 });
    expect(await code(callers.manager.projects.baseline.saveCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-01,40%\n2027-02,50%\n") }))).toBe("PROJECT_OS_CASHFLOW_TOTAL_NOT_100");
    const bad = await callers.manager.projects.baseline.previewCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-01,50%\nsoon,50%\n") });
    expect(bad.issues).toEqual([{ rowNumber: 3, code: "CASHFLOW_MONTH_INVALID", value: "soon" }]);
    expect(await code(callers.manager.projects.baseline.saveCashFlow({ tenantId, projectId: projectA, format: "csv", fileBase64: csv("2027-01,50%\nsoon,50%\n") }))).toBe("PROJECT_OS_CASHFLOW_ROWS_INVALID");
    expect(await months()).toEqual(before);
  });

  it("Q-10 b NEGATIVE: a site engineer (no project.manage) and another company are refused from the server, and nothing changes", async () => {
    const before = await months();
    const file = { format: "csv" as const, fileBase64: csv("2027-01,100%\n") };
    expect(await code(callers.engineer.projects.baseline.saveCashFlow({ tenantId, projectId: projectA, ...file }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.projects.baseline.previewCashFlow({ tenantId, projectId: projectA, ...file }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.otherOwner.projects.baseline.saveCashFlow({ tenantId, projectId: projectA, ...file }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    // the other company's owner, in its own company, cannot reach project A by naming it
    expect(await code(callers.otherOwner.projects.baseline.saveCashFlow({ tenantId: otherTenantId, projectId: projectA, ...file }))).not.toBe("no error");
    expect(await months()).toEqual(before);
    expect(await count("SELECT COUNT(*) AS n FROM pmc_plan_months WHERE tenant_id = ?", [otherTenantId])).toBe(0);
  });

  // Q-10 (c): the bill of quantities. The owner holds project.wbs.manage; the project manager of A (project.manage only) and the site engineer do not.
  const boqCsv = (body: string) => Buffer.from(`Item no.,Description,Unit,Quantity,Unit rate\n${body}`).toString("base64");
  const boqRows = () => connection.query<{ code: string; quantity: string; totalAmount: string }[]>("SELECT code, quantity, total_amount AS \"totalAmount\" FROM boq_items WHERE tenant_id = ? AND project_id = ? ORDER BY code", [tenantId, projectA]).then(result => result[0] as Array<{ code: string; quantity: string; totalAmount: string }>);

  it("Q-10 c POSITIVE: the preview counts new and existing items and writes nothing; the save writes them (audited); a re-import updates by code, adds the new and deletes nothing", async () => {
    const first = boqCsv("A-01,Excavation,m3,1200,18.5\nA-02,Concrete,m3,85,320\n");
    const preview = await callers.owner.projects.baseline.previewBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: first });
    expect(preview).toMatchObject({ refusal: null, count: 2, newCount: 2, updateCount: 0, totalAmount: 49400 });
    expect(await boqRows()).toEqual([]);
    const status = await callers.owner.projects.baseline.saveBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: first });
    expect(item(status, "boq")).toMatchObject({ state: "uploaded", count: 2 });
    expect(await audits("project.boq_imported")).toBe(1);
    const second = boqCsv("A-02,Concrete,m3,90,320\nA-03,Blockwork,m2,400,45\n");
    expect(await callers.owner.projects.baseline.previewBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: second })).toMatchObject({ newCount: 1, updateCount: 1 });
    await callers.owner.projects.baseline.saveBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: second });
    expect((await boqRows()).map(r => [r.code, Number(r.quantity), Number(r.totalAmount)])).toEqual([["A-01", 1200, 22200], ["A-02", 90, 28800], ["A-03", 400, 18000]]);
  });

  it("Q-10 c NEGATIVE: refused rows are reported and the save is refused; a project manager without project.wbs.manage and another company are refused from the server; nothing changes", async () => {
    const before = await boqRows();
    const bad = boqCsv("A-09,,m3,1,1\nA-10,Steel,t,abc,1\n");
    const preview = await callers.owner.projects.baseline.previewBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: bad });
    expect(preview.issues.map(issue => [issue.rowNumber, issue.code])).toEqual([[2, "BOQ_DESCRIPTION_MISSING"], [3, "BOQ_QUANTITY_INVALID"]]);
    expect(await code(callers.owner.projects.baseline.saveBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: bad }))).toBe("PROJECT_OS_BOQ_ROWS_INVALID");
    const good = boqCsv("A-01,Changed,m3,1,1\n");
    expect(await code(callers.manager.projects.baseline.saveBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: good }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.projects.baseline.previewBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: good }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.otherOwner.projects.baseline.saveBoq({ tenantId, projectId: projectA, format: "csv", fileBase64: good }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.baseline.saveBoq({ tenantId: otherTenantId, projectId: projectA, format: "csv", fileBase64: good }))).not.toBe("no error");
    expect(await boqRows()).toEqual(before);
    expect(await count("SELECT COUNT(*) AS n FROM boq_items WHERE tenant_id = ?", [otherTenantId])).toBe(0);
  });
});

