import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { wbsItems } from "../drizzle/schema";
import { getDb } from "./db";
import { UPDATE_CHUNK_ROWS, updateChunked } from "./importBulk";

// G-140 (D-32): an import's updated rows go in statements of UPDATE_CHUNK_ROWS, not one a row. On the real database: every row gets exactly its own
// values across several chunks, a row of another company or another project named in the same call is left untouched, and the old way and the new
// way leave the same table. Synthetic fixtures only.
const T = "79140000-0000-4000-8000-0000000000a1";
const T2 = "79140000-0000-4000-8000-0000000000b1";
const P = "79140000-0000-4000-8000-0000000000a2";
const P_OTHER = "79140000-0000-4000-8000-0000000000a3";
const P2 = "79140000-0000-4000-8000-0000000000b2";
const ROWS = UPDATE_CHUNK_ROWS * 2 + 7; // three statements, the last one partial
const idOf = (index: number) => `79140000-0000-4000-8000-${String(index).padStart(12, "0")}`;
let connection: fixtureDb.Connection;

async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenant]);
  }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("chunked update of an import's existing rows (G-140)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'bulk-a', 'bulk-a'), (?, 'bulk-b', 'bulk-b')", [T, T2]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'BU-A', 'Bulk A', 'villas', 'SAR', 'active'), (?, ?, 'BU-O', 'Bulk other', 'villas', 'SAR', 'active'), (?, ?, 'BU-B', 'Bulk B', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T, P2, T2]);
    const values = Array.from({ length: ROWS }, (_, index) => [idOf(index), T, P, `W-${index}`, `Item ${index}`, "100.00"]);
    for (let start = 0; start < values.length; start += 500) {
      const part = values.slice(start, start + 500);
      await connection.query(`INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`, part.flat());
    }
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'W-X', 'Other company', '7.00'), (?, ?, ?, 'W-Y', 'Other project', '8.00')", [idOf(900001), T2, P2, idOf(900002), T, P_OTHER]);
  });
  afterAll(async () => { await clear(); await connection.end(); });

  it(`writes each of ${ROWS} rows its own values in ${Math.ceil(ROWS / UPDATE_CHUNK_ROWS)} statements, and touches nothing outside the tenant and project`, async () => {
    const db = (await getDb())!;
    const rows = Array.from({ length: ROWS }, (_, index) => ({ id: idOf(index), values: [`Renamed ${index}`, String(index * 2 + 0.5)] as (string | null)[] }));
    // the call also names the other company's row and the other project's row: the scope keeps them out
    rows.push({ id: idOf(900001), values: ["HIJACKED", "1"] }, { id: idOf(900002), values: ["HIJACKED", "1"] });
    let statements = 0;
    await db.transaction(async tx => {
      const counting = { execute: (query: Parameters<typeof tx.execute>[0]) => { statements += 1; return tx.execute(query); } };
      await updateChunked(counting, wbsItems, [[wbsItems.tenantId, T], [wbsItems.projectId, P]], [wbsItems.name, wbsItems.plannedValue], rows);
    });
    expect(statements).toBe(Math.ceil(rows.length / UPDATE_CHUNK_ROWS));
    const [after] = await connection.query("SELECT id, name, plannedValue FROM wbs_items WHERE tenantId = ? AND projectId = ? ORDER BY code", [T, P]);
    const byId = new Map((after as Array<{ id: string; name: string; plannedValue: string }>).map(row => [row.id, row]));
    expect(byId.size).toBe(ROWS);
    for (const index of [0, 1, UPDATE_CHUNK_ROWS - 1, UPDATE_CHUNK_ROWS, ROWS - 1]) {
      expect(byId.get(idOf(index))).toMatchObject({ name: `Renamed ${index}`, plannedValue: (index * 2 + 0.5).toFixed(2) });
    }
    expect([...byId.values()].every((row, position) => row.name.startsWith("Renamed "))).toBe(true);
    const [[otherCompany]] = await connection.query("SELECT name, plannedValue FROM wbs_items WHERE id = ?", [idOf(900001)]);
    const [[otherProject]] = await connection.query("SELECT name, plannedValue FROM wbs_items WHERE id = ?", [idOf(900002)]);
    expect(otherCompany).toMatchObject({ name: "Other company", plannedValue: "7.00" });
    expect(otherProject).toMatchObject({ name: "Other project", plannedValue: "8.00" });
  });

  it("leaves the table exactly as the old one-statement-a-row loop does (a null stays null, a numeric is cast)", async () => {
    const db = (await getDb())!;
    const sample = [0, 1, 2].map(index => ({ id: idOf(index), values: [`Same ${index}`, "12.345"] as (string | null)[] }));
    await db.transaction(async tx => { for (const row of sample) await tx.update(wbsItems).set({ name: row.values[0]!, plannedValue: row.values[1]! }).where(eq(wbsItems.id, row.id)); });
    const [oldWay] = await connection.query("SELECT id, name, plannedValue FROM wbs_items WHERE id IN (?, ?, ?) ORDER BY id", sample.map(row => row.id));
    await connection.query("UPDATE wbs_items SET name = 'reset', plannedValue = 0 WHERE id IN (?, ?, ?)", sample.map(row => row.id));
    await db.transaction(async tx => updateChunked(tx, wbsItems, [[wbsItems.tenantId, T], [wbsItems.projectId, P]], [wbsItems.name, wbsItems.plannedValue], sample));
    const [newWay] = await connection.query("SELECT id, name, plannedValue FROM wbs_items WHERE id IN (?, ?, ?) ORDER BY id", sample.map(row => row.id));
    expect(newWay).toEqual(oldWay);
  });

  it("NEGATIVE: refuses to run without a tenant scope rather than update by id alone", async () => {
    const db = (await getDb())!;
    await expect(db.transaction(async tx => updateChunked(tx, wbsItems, [], [wbsItems.name], [{ id: idOf(0), values: ["x"] }]))).rejects.toThrow(/tenant/);
  });
});
