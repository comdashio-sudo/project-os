import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { activities } from "../drizzle/schema";
import { getDb, runWithDbContext, type DbContext } from "./_core/database";
import { bulkUpdate } from "./bulkUpdate";
import fixtureDb, { type Connection } from "./testing/pgCompat";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// D-4 (#153), engineering review @ 441821c, item 2: bulkUpdate checks the count of rows it wrote. An id that is not a row of THIS company and THIS project
// (another project of the same company, another company, or no row at all) matches nothing, so the count falls short: CONFLICT, and the transaction writes nothing —
// not even the rows of the same call that did match. Run as the restricted application role (project_os_app), so row-level security applies as well.
const ownerUrl = process.env.TEST_DATABASE_URL;
const T = "7b000000-0000-4000-8000-0000000000a1";
const T2 = "7b000000-0000-4000-8000-0000000000b1";
const PA = "7b000000-0000-4000-8000-0000000000a2";
const PB = "7b000000-0000-4000-8000-0000000000a3"; // the same company, another project
const PX = "7b000000-0000-4000-8000-0000000000b2"; // another company's project
const ids = { a1: "7b000000-0000-4000-8000-00000000a001", a2: "7b000000-0000-4000-8000-00000000a002", a3: "7b000000-0000-4000-8000-00000000a003", b1: "7b000000-0000-4000-8000-00000000b001", x1: "7b000000-0000-4000-8000-00000000c001", missing: "7b000000-0000-4000-8000-00000000dead" };
let owner: Connection;
let userId = 0;
const asBoth = (): DbContext => ({ userId, tenantIds: [T, T2], system: false }); // a user in both companies: RLS lets every row through, so only the scope filter stands between them
const scope = { tenantId: T, projectId: PA };
const snapshot = async () => (await owner.query<Array<{ id: string; name: string; status: string; updatedAt: Date }>>("SELECT id, name, status, updatedAt FROM activities WHERE tenantId IN (?, ?) ORDER BY id", [T, T2]))[0].map(row => `${row.id}|${row.name}|${row.status}|${new Date(row.updatedAt).toISOString()}`);
const countNamed = async (name: string) => Number(((await owner.query<Array<{ n: number }>>("SELECT COUNT(*) AS n FROM activities WHERE tenantId IN (?, ?) AND name = ?", [T, T2, name]))[0][0]).n);
const write = (rows: string[], batch?: number) => runWithDbContext(asBoth(), async () => {
  const db = (await getDb())!;
  return db.transaction(tx => bulkUpdate(tx, { table: activities, columns: { name: activities.name, status: activities.status }, scope, batch, rows: rows.map(id => ({ id, values: { name: "renamed by bulkUpdate", status: "in_progress" } })) }));
});

async function cleanup() {
  await owner.query("DELETE FROM activities WHERE tenantId IN (?, ?)", [T, T2]);
  await owner.query("DELETE FROM projects WHERE tenantId IN (?, ?)", [T, T2]);
  await owner.query("DELETE FROM companies WHERE id IN (?, ?)", [T, T2]);
  await owner.query("DELETE FROM users WHERE openId = 'bulk-update-test'");
}

describe.skipIf(!isTestDatabaseUrl(ownerUrl))("bulkUpdate: an id outside the company and project fails the whole write (as the restricted application role)", () => {
  beforeAll(async () => {
    owner = await fixtureDb.createConnection(ownerUrl!);
    await cleanup();
    userId = ((await owner.query("INSERT INTO users (openId, name, email) VALUES ('bulk-update-test', 'Bulk', 'bulk@bulk.example.test')"))[0] as { insertId: number }).insertId;
    await owner.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Bulk A', 'bulk-a'), (?, 'Bulk B', 'bulk-b')", [T, T2]);
    await owner.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'BU-A', 'A', 'villas', 'SAR', 'active'), (?, ?, 'BU-B', 'B', 'villas', 'SAR', 'active'), (?, ?, 'BU-X', 'X', 'villas', 'SAR', 'active')", [PA, T, PB, T, PX, T2]);
    await owner.query("INSERT INTO activities (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'A1', 'a1'), (?, ?, ?, 'A2', 'a2'), (?, ?, ?, 'A3', 'a3'), (?, ?, ?, 'A1', 'b1'), (?, ?, ?, 'A1', 'x1')",
      [ids.a1, T, PA, ids.a2, T, PA, ids.a3, T, PA, ids.b1, T, PB, ids.x1, T2, PX]);
  }, 60_000);
  afterAll(async () => { await cleanup(); await owner.end(); });

  for (const [label, foreign] of [["another project of the same company", "b1"], ["another company", "x1"], ["an id that does not exist", "missing"]] as const) {
    it(`an id from ${label} beside valid ids: CONFLICT, and not one row is written (counted before and after)`, async () => {
      const before = await snapshot();
      expect(before).toHaveLength(5);
      // the foreign id last, in a batch of its own: the first batch matched and was written inside the transaction, and must be rolled back with it
      const failure = await write([ids.a1, ids.a2, ids[foreign]], 2).catch(error => error);
      expect(failure).toBeInstanceOf(TRPCError);
      expect(failure).toMatchObject({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" });
      expect(await snapshot()).toEqual(before);
      expect(await countNamed("renamed by bulkUpdate")).toBe(0);
      // and the foreign id alone, in one batch
      await expect(write([ids[foreign]])).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await snapshot()).toEqual(before);
    });
  }

  it("positive: ids of this company and project are all written, and the count returned is theirs", async () => {
    expect(await write([ids.a1, ids.a2, ids.a3], 2)).toBe(3);
    expect(await countNamed("renamed by bulkUpdate")).toBe(3);
    const [rows] = await owner.query<Array<{ id: string; status: string }>>("SELECT id, status FROM activities WHERE tenantId IN (?, ?) AND name <> 'renamed by bulkUpdate' ORDER BY id", [T, T2]);
    expect(rows).toEqual([{ id: ids.b1, status: "not_started" }, { id: ids.x1, status: "not_started" }]); // the other project and the other company untouched
  });
});
