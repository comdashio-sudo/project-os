import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { ANALYZE_ROW_THRESHOLD, isTiDB, isTiDBVersion, refreshStatisticsAfterBulkLoad } from "./tidbStats";

const dialect = new MySqlDialect();
const text = (statement: unknown) => dialect.sqlToQuery(statement as never).sql;

function fakeDb(version: string, tablesLike: string[] = []) {
  const statements: string[] = [];
  const db = {
    execute: async (statement: unknown) => {
      const sqlText = text(statement); statements.push(sqlText);
      if (/VERSION\(\)/.test(sqlText)) return [[{ v: version }], []];
      if (/information_schema/.test(sqlText)) return [tablesLike.map(t => ({ t })), []];
      if (/ANALYZE/.test(sqlText) && version.includes("BROKEN")) throw new Error("boom");
      return [[], []];
    },
  };
  return { db: db as never, statements };
}

describe("statistics refresh after a bulk load (TiDB only)", () => {
  it("recognises TiDB by its version string and nothing else", () => {
    expect(isTiDBVersion("8.0.11-TiDB-v8.5.1")).toBe(true);
    expect(isTiDBVersion("8.0.46-0ubuntu0.24.04.4")).toBe(false);
    expect(isTiDBVersion(undefined)).toBe(false);
  });

  it("on MySQL it does nothing at all — no ANALYZE is ever sent", async () => {
    const { db, statements } = fakeDb("8.0.46-0ubuntu0.24.04.4");
    expect(await refreshStatisticsAfterBulkLoad(db, ["wbs_items"], 500_000)).toEqual({ ran: false, reason: "not-tidb", tables: [] });
    expect(statements.some(statement => /ANALYZE/i.test(statement))).toBe(false);
  });

  it("on TiDB it analyses exactly the tables the import wrote, once the load is big enough", async () => {
    const { db, statements } = fakeDb("8.0.11-TiDB-v8.5.1");
    const result = await refreshStatisticsAfterBulkLoad(db, ["activities", "wbs_items"], ANALYZE_ROW_THRESHOLD);
    expect(result).toMatchObject({ ran: true, reason: "refreshed", tables: ["activities", "wbs_items"] });
    expect(statements.filter(statement => /ANALYZE/i.test(statement))).toEqual(["ANALYZE TABLE `activities`", "ANALYZE TABLE `wbs_items`"]);
  });

  it("a small load is left to TiDB's own automatic ANALYZE (and never even asks the engine)", async () => {
    const { db, statements } = fakeDb("8.0.11-TiDB-v8.5.1");
    expect(await refreshStatisticsAfterBulkLoad(db, ["activities"], ANALYZE_ROW_THRESHOLD - 1)).toMatchObject({ ran: false, reason: "small-load" });
    expect(statements).toEqual([]);
  });

  it("expands a prefix pattern from the schema (the PMC import writes many pmc_ tables)", async () => {
    const { db, statements } = fakeDb("8.0.11-TiDB-v8.5.1", ["pmc_units", "pmc_blocks"]);
    const result = await refreshStatisticsAfterBulkLoad(db, ["pmc_*"], 5000);
    expect(result.tables).toEqual(["pmc_units", "pmc_blocks"]);
    expect(statements.filter(statement => /ANALYZE/i.test(statement)).length).toBe(2);
  });

  it("a failing ANALYZE is reported as failed and never thrown into the import", async () => {
    const { db } = fakeDb("8.0.11-TiDB-v8.5.1 BROKEN");
    await expect(refreshStatisticsAfterBulkLoad(db, ["wbs_items"], 9000)).resolves.toEqual({ ran: false, reason: "failed", tables: [] });
  });

  it("asks the engine once per connection", async () => {
    const { db, statements } = fakeDb("8.0.46");
    await isTiDB(db); await isTiDB(db);
    expect(statements.filter(statement => /VERSION/.test(statement)).length).toBe(1);
  });
});
