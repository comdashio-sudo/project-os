import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// D-87 (operator, 11-12): wbs.create answered 500 on a code already used in the project — from the single-row form and from the #254 sheet, which calls the same
// procedure per row. Rule 18: every create path behind a (project, code) unique index is checked here, through the real procedure, as the restricted application role.
// The second create with the same code is a translated 409 (tRPC CONFLICT) with the code's own message, writes no row and no audit line; the same code in another
// company's project is accepted (the index is per project). Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("a code already used in the project is a 409, not a 500 (D-87)", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let owner: pg.Client;
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await owner.connect();
    a = await createRoleFixture({ label: "dup-a" }); b = await createRoleFixture({ label: "dup-b" });
  });
  afterAll(async () => { await owner.end(); });

  type Caller = ReturnType<Fixture["callerFor"]>;
  const scope = (f: Fixture) => ({ tenantId: f.tenantId, projectId: f.projectId });
  // each path: its table, the column holding the code, its message, and the create call for a code
  const PATHS: Array<[string, string, string, string, (caller: Caller, f: Fixture, code: string) => Promise<unknown>]> = [
    ["wbs.create", "wbs_items", "code", "PROJECT_OS_WBS_CODE_EXISTS", (caller, f, code) => caller.wbs.create({ ...scope(f), code, name: "Work package" })],
    ["activities.create", "activities", "code", "PROJECT_OS_ACTIVITY_CODE_EXISTS", (caller, f, code) => caller.activities.create({ ...scope(f), code, name: "Activity", plannedStartAt: new Date("2026-11-01"), plannedFinishAt: new Date("2026-11-10") })],
    ["resources.create", "project_resources", "resource_code", "PROJECT_OS_RESOURCE_CODE_EXISTS", (caller, f, code) => caller.resources.create({ ...scope(f), resourceCode: code, name: "Crane", resourceType: "equipment", plannedUnits: 2, allocatedUnits: 1, unitCost: 10, currency: "SAR" })],
    ["contracts.create", "contracts", "code", "PROJECT_OS_CONTRACT_CODE_EXISTS", (caller, f, code) => caller.contracts.create({ ...scope(f), code, title: "Main contract", counterparty: "Client Example", contractValue: 1000, currency: "SAR" })],
    ["contracts.createCommitment", "commitments", "code", "PROJECT_OS_COMMITMENT_CODE_EXISTS", (caller, f, code) => caller.contracts.createCommitment({ ...scope(f), code, description: "Steel order", amount: 500, currency: "SAR" })],
    ["pmo.createRisk", "risks", "code", "PROJECT_OS_RISK_CODE_EXISTS", (caller, f, code) => caller.pmo.createRisk({ ...scope(f), code, title: "Late steel", probability: 3, severity: 4 })],
    ["warehouses.create", "project_warehouses", "code", "PROJECT_OS_WAREHOUSE_CODE_EXISTS", (caller, f, code) => caller.warehouses.create({ ...scope(f), code, name: "Main store" })],
    ["boq.create", "boq_items", "code", "PROJECT_OS_BOQ_CODE_EXISTS", (caller, f, code) => caller.boq.create({ ...scope(f), code, description: "Concrete", unitOfMeasure: "m3", quantity: 10, unitRate: 300 })],
    ["subcontracts.create", "subcontract_contracts", "code", "PROJECT_OS_SUBCONTRACT_CODE_EXISTS", (caller, f, code) => caller.subcontracts.create({ ...scope(f), code, title: "Finishes", subcontractorName: "Sub Example", contractValue: 2000 })],
  ];

  const count = async (table: string, column: string, f: Fixture, code: string) => Number((await owner.query(`SELECT count(*) FROM ${table} WHERE project_id = $1 AND ${column} = $2`, [f.projectId, code])).rows[0].count);
  const audits = async (f: Fixture) => Number((await owner.query("SELECT count(*) FROM audit_logs WHERE tenant_id = $1", [f.tenantId])).rows[0].count);

  it.each(PATHS)("%s: the same code twice in one project is CONFLICT with its own message; one row, one audit line; another company's project may use it", async (_name, table, column, message, create) => {
    const code = `DUP-${table.slice(0, 6)}-1`;
    const caller = a.callerFor(a.owner);
    await create(caller, a, code);
    const before = await audits(a);
    const failure = await create(caller, a, code).then(() => null, error => error);
    expect(failure, "the second create must be refused").not.toBeNull();
    expect(failure).toMatchObject({ code: "CONFLICT", message });
    expect(await count(table, column, a, code)).toBe(1);
    expect(await audits(a)).toBe(before);
    // positive: the index is per project, so another company may use the very same code
    await create(b.callerFor(b.owner), b, code);
    expect(await count(table, column, b, code)).toBe(1);
  });

  it("NEGATIVE: two people saving the same new WBS code at the same moment: one row, and the other gets CONFLICT — not a 500 (the index decides, not a pre-check)", async () => {
    const code = "DUP-RACE-1";
    const results = await Promise.allSettled([a.callerFor(a.owner).wbs.create({ ...scope(a), code, name: "One" }), a.callerFor(a.owner).wbs.create({ ...scope(a), code, name: "Two" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT", message: "PROJECT_OS_WBS_CODE_EXISTS" } });
    expect(await count("wbs_items", "code", a, code)).toBe(1);
  });
});
