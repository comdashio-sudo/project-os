import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ANALYZE_ROW_THRESHOLD, IMPORT_TABLES, refreshStatisticsAfterBulkLoad } from "./bulkLoadStats";

const dialect = new PgDialect();
const text = (statement: unknown) => dialect.sqlToQuery(statement as never);

function fakeDb(options: { tablesLike?: string[]; fail?: boolean } = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    execute: async (statement: unknown) => {
      const query = text(statement); statements.push(query);
      if (/pg_tables/.test(query.sql)) return { rows: (options.tablesLike ?? []).map(t => ({ t })) };
      if (/project_os_analyze/.test(query.sql)) { if (options.fail) throw new Error("boom"); return { rows: [{ n: 2 }] }; }
      return { rows: [] };
    },
  };
  return { db: db as never, statements };
}

describe("statistics refresh after a bulk load", () => {
  it("does nothing for a small load", async () => {
    const { db, statements } = fakeDb();
    expect(await refreshStatisticsAfterBulkLoad(db, ["wbs_items"], ANALYZE_ROW_THRESHOLD - 1)).toEqual({ ran: false, reason: "small-load", tables: [] });
    expect(statements).toHaveLength(0);
  });
  it("analyses exactly the tables the import wrote, through the one definer function, once the load is big enough", async () => {
    const { db, statements } = fakeDb();
    expect(await refreshStatisticsAfterBulkLoad(db, ["activities", "wbs_items"], ANALYZE_ROW_THRESHOLD)).toMatchObject({ ran: true, reason: "refreshed", tables: ["activities", "wbs_items"] });
    expect(statements).toHaveLength(1);
    expect(statements[0]!.sql).toMatch(/project_os_analyze/);
    expect(statements[0]!.params).toEqual(["activities", "wbs_items"]);
    expect(statements[0]!.sql).toMatch(/ARRAY\[\$1, \$2\]::text\[\]/);
  });
  it("expands a prefix pattern from the catalogue, escaping LIKE wildcards in the prefix", async () => {
    const { db, statements } = fakeDb({ tablesLike: ["pmc_units", "pmc_zones"] });
    const result = await refreshStatisticsAfterBulkLoad(db, ["pmc_*"], 5000);
    expect(result.tables).toEqual(["pmc_units", "pmc_zones"]);
    expect(statements[0]!.params).toEqual(["pmc\\_%"]);
  });
  it("a refresh that cannot run is reported, never thrown", async () => {
    const { db } = fakeDb({ fail: true });
    expect(await refreshStatisticsAfterBulkLoad(db, ["wbs_items"], 5000)).toEqual({ ran: false, reason: "failed", tables: [] });
  });
  it("every import kind names tables that exist in the schema", async () => {
    const schema = await import("../drizzle/schema");
    const names = new Set(Object.values(schema).map(value => (value as { [key: symbol]: unknown })[Symbol.for("drizzle:Name")]).filter(Boolean));
    for (const [kind, tables] of Object.entries(IMPORT_TABLES)) for (const table of tables) expect(names.has(table), `${kind} → ${table}`).toBe(true);
  });
});
