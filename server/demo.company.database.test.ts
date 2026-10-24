import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixtureDb, { type Connection } from "./testing/pgCompat";
import { isTestDatabaseUrl } from "./testing/testDatabase";
import { wbsProgressFromPmc } from "./domain/pmcEvmBridge";

// Work order 15, item 1: the demonstration company "شركة العرض" is built on a real database, is built once, touches no other company, is complete enough to sell with,
// and is erased by the platform's audited erasure with a verification that nothing of it is left. The seed runs as the OWNER role (it is a setup script, like a migration);
// what the people see is then asked through the platform's own procedures, each as the person of that level.
const ownerUrl = process.env.TEST_DATABASE_URL;
const run = ownerUrl && isTestDatabaseUrl(ownerUrl);
if (run) process.env.DATABASE_URL = ownerUrl; // the seed script writes directly, which row-level security would refuse for the application role

describe.skipIf(!run)("the demonstration company", () => {
  let connection: Connection;
  let seed: typeof import("../scripts/demo/demoCompany");
  let routers: typeof import("./routers");
  const OWNER = "demo.admin@example.test";
  const asPerson = async (email: string) => {
    const [[row]] = await connection.query<{ id: number; openId: string; name: string; email: string }[]>("SELECT id, openId, name, email FROM users WHERE email = ?", [email]);
    return routers.appRouter.createCaller({ user: { ...row, loginMethod: "email", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as never);
  };
  let tenantId = ""; let projectId = ""; let warehouseId = "";
  const count = async (table: string, extra = "") => Number(((await connection.query<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table} WHERE tenantId = ? ${extra}`, [tenantId]))[0][0]).n);

  beforeAll(async () => {
    connection = await fixtureDb.createConnection(ownerUrl!);
    seed = await import("../scripts/demo/demoCompany");
    routers = await import("./routers");
    await seed.deleteDemoCompany({ ownerEmail: OWNER }).catch(() => undefined); // a leftover from an interrupted run
  }, 120_000);
  afterAll(async () => { await seed.deleteDemoCompany({ ownerEmail: OWNER }).catch(() => undefined); await connection.end(); }, 120_000);

  it("is built once, with everything a presentation needs", async () => {
    const [before] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM companies WHERE slug <> 'demo-show-company'");
    const result = await seed.seedDemoCompany({ ownerEmail: OWNER });
    expect(result.created).toBe(true);
    tenantId = result.tenantId; projectId = result.projectId!;
    const [[wh]] = await connection.query<{ id: string }[]>("SELECT id FROM project_warehouses WHERE tenantId = ? AND code = 'WH-MAIN'", [tenantId]); warehouseId = wh.id;
    expect(await count("pmc_units")).toBe(500 + 24);
    expect(await count("site_daily_reports")).toBeGreaterThanOrEqual(55);
    expect(await count("consultant_submittals")).toBeGreaterThanOrEqual(40);
    const [codes] = await connection.query<{ replyCode: string }[]>("SELECT DISTINCT replyCode FROM consultant_submittals WHERE tenantId = ? AND replyCode IS NOT NULL ORDER BY 1", [tenantId]);
    expect(codes.map(row => (row as unknown as { replyCode: string }).replyCode)).toEqual(["A", "B", "C", "D"]);
    expect(await count("pmc_inspection_requests")).toBeGreaterThanOrEqual(30);
    expect(await count("ncrs")).toBe(12);
    expect(await count("material_issues")).toBeGreaterThanOrEqual(100);
    expect(await count("warehouse_inventory_transactions")).toBeGreaterThanOrEqual(100);
    expect(await count("master_plan_spatial_entities")).toBe(525);
    expect(await count("contracts")).toBeGreaterThanOrEqual(5);
    expect(await count("change_requests")).toBe(2);
    expect(await count("project_commercial_invoices")).toBe(3);
    const [[snapshots]] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM evm_snapshots WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
    expect(Number(snapshots.n)).toBe(3);
    const [after] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM companies WHERE slug <> 'demo-show-company'");
    expect(after[0].n).toBe(before[0].n); // no other company was created, changed or removed
  }, 180_000);

  it("a second run changes nothing: still one company, the same rows", async () => {
    const rows = await count("pmc_units"); const reports = await count("site_daily_reports");
    const again = await seed.seedDemoCompany({ ownerEmail: OWNER });
    expect(again.created).toBe(false);
    expect(again.tenantId).toBe(tenantId);
    const [companies] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM companies WHERE slug = 'demo-show-company'");
    expect(companies[0].n).toBe(1);
    expect(await count("pmc_units")).toBe(rows); expect(await count("site_daily_reports")).toBe(reports);
  }, 60_000);

  it("each level sees its own answers, and the figures agree with each other", async () => {
    const board = await asPerson("board.member@show.example.test"); const pmo = await asPerson("portfolio.lead@show.example.test");
    const pm = await asPerson("project.manager@show.example.test"); const keeper = await asPerson("warehouse.keeper@show.example.test");
    const company = await board.scopes.company({ tenantId });
    expect(company.readOnly).toBe(true);
    expect(company.projects.map(item => item.code)).toEqual(["PRJ-DEMO-1", "PRJ-DEMO-2"]);
    const portfolio = await pmo.scopes.portfolio({ tenantId });
    expect(portfolio.totals.projectCount).toBe(2);
    const project = (await pm.scopes.project({ tenantId, projectId })).project;
    const evm = project.evm as { cpi: number; spi: number; ev: number; ac: number; bac: number; eac: number };
    expect(evm.bac).toBe(380_000_000);
    expect(evm.cpi).toBeGreaterThan(0.9); expect(evm.cpi).toBeLessThan(1);
    expect(evm.spi).toBeGreaterThan(0.8); expect(evm.spi).toBeLessThan(1);
    expect((project.progress as { percent: number }).percent).toBeGreaterThan(14); expect((project.progress as { percent: number }).percent).toBeLessThan(19);
    // the profit the board sees is the adjusted contract (450 M + the approved 9 M change) less the forecast at completion, to the cent
    const expected = Math.round((459_000_000 - evm.eac) * 100) / 100;
    expect((project.expectedProfit as { value: number }).value).toBeCloseTo(expected, 1);
    const board1 = company.projects.find(item => item.code === "PRJ-DEMO-1")!;
    expect((board1.expectedProfit as { value: number }).value).toBeCloseTo(expected, 1);
    expect(company.totals.stockValue).toBeGreaterThan(0);
    expect(company.totals.materialsBelowReorder).toBeGreaterThanOrEqual(1);
    const store = await keeper.scopes.warehouse({ tenantId, projectId, warehouseId });
    expect(store.totals.materials).toBeGreaterThanOrEqual(5);
    // narrower people are refused the wider level
    await expect(pm.scopes.company({ tenantId })).rejects.toThrow();
    await expect(keeper.scopes.project({ tenantId, projectId })).rejects.toThrow();
  }, 60_000);

  it("the progress the project carries is what the platform's own bridge computes from the cells (no jump on the first real change)", async () => {
    const [defs] = await connection.query<{ id: string; modelCode: string; weightPercent: number; wbsItemId: string }[]>("SELECT id, modelCode, weightPercent, wbsItemId FROM pmc_activity_definitions WHERE tenantId = ? AND projectId = ? AND wbsItemId IS NOT NULL", [tenantId, projectId]);
    const [units] = await connection.query<{ id: string; modelCode: string }[]>("SELECT id, modelCode FROM pmc_units WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
    const [cells] = await connection.query<{ unitId: string; definitionId: string; status: "COMPLETE" }[]>("SELECT unitId, activityDefinitionId AS definitionId, status FROM pmc_unit_activity_progress WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
    const computed = wbsProgressFromPmc({ units: units.map(unit => ({ id: unit.id, modelCode: unit.modelCode, weight: 1 })), definitions: defs.map(item => ({ id: item.id, modelCode: item.modelCode, weightPercent: Number(item.weightPercent), wbsItemId: item.wbsItemId })), cells, factors: { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 1 } });
    const [latest] = await connection.query<{ wbsItemId: string; progressPercent: number }[]>("SELECT DISTINCT ON (wbsItemId) wbsItemId, progressPercent FROM progress_entries WHERE tenantId = ? AND projectId = ? AND status = 'submitted' ORDER BY wbsItemId, measuredAt DESC", [tenantId, projectId]);
    expect(latest.length).toBeGreaterThanOrEqual(5); // a package nobody has started has no entry
    for (const row of latest) expect(Number(row.progressPercent)).toBeCloseTo(computed.get(row.wbsItemId)!, 2);
  }, 60_000);

  it("NEGATIVE: the erasure refuses a company that has someone in it who is not the demonstration's own, and changes nothing", async () => {
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('demo-stranger', 'Stranger', 'stranger@elsewhere.example.test', 'user') ON CONFLICT DO NOTHING");
    const [[stranger]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'demo-stranger'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (gen_random_uuid(), ?, ?, 'active')", [tenantId, stranger.id]);
    const rows = await count("pmc_units");
    await expect(seed.deleteDemoCompany({ ownerEmail: OWNER })).rejects.toThrow(/not the demonstration's own/);
    expect(await count("pmc_units")).toBe(rows);
    await connection.query("DELETE FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, stranger.id]);
    await connection.query("DELETE FROM users WHERE id = ?", [stranger.id]);
  }, 60_000);

  it("is erased by the audited erasure, with a verification that nothing is left, and can then be built again", async () => {
    const result = await seed.deleteDemoCompany({ ownerEmail: OWNER });
    expect(result).toMatchObject({ deleted: true, verification: "PASS", remaining: [] });
    expect((result as { rowsDeleted: number }).rowsDeleted).toBeGreaterThan(8000);
    const [left] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM companies WHERE slug = 'demo-show-company'");
    expect(left[0].n).toBe(0);
    expect(await count("pmc_units")).toBe(0); expect(await count("site_daily_reports")).toBe(0);
    const again = await seed.seedDemoCompany({ ownerEmail: OWNER });
    expect(again.created).toBe(true);
    expect(again.tenantId).not.toBe(tenantId);
  }, 180_000);
});
