// After a bulk import, refresh the table statistics — on TiDB only (see scripts/lib/tidbStats.mjs for why). Never blocks the import and never
// fails it: the import already committed; a refresh that cannot run is logged and TiDB's own automatic ANALYZE catches up later.
import { sql } from "drizzle-orm";
import { logInfo, logWarn } from "./_core/logger";
import { createInFlight } from "./inFlight";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Below this many rows TiDB's automatic ANALYZE is quick enough that doing it ourselves buys nothing. */
export const ANALYZE_ROW_THRESHOLD = 1000;

export const isTiDBVersion = (version: unknown) => /tidb/i.test(String(version ?? ""));

const engine = new WeakMap<object, Promise<boolean>>();
export function isTiDB(db: Db): Promise<boolean> {
  let known = engine.get(db);
  if (!known) {
    known = (db.execute(sql`SELECT VERSION() AS v`) as unknown as Promise<[Array<{ v: string }>, unknown]>).then(result => isTiDBVersion(result[0][0]?.v));
    known.catch(() => engine.delete(db));
    engine.set(db, known);
  }
  return known;
}

const running = createInFlight<RefreshResult>();

export type RefreshResult = { ran: boolean; reason: "refreshed" | "not-tidb" | "small-load" | "failed"; tables: string[] };

/** `tables` may include a trailing `*` prefix pattern (e.g. "pmc_*") that is expanded from the schema. Returns when finished; callers normally `void` it. */
export function refreshStatisticsAfterBulkLoad(db: Db, tables: string[], rowsWritten: number): Promise<RefreshResult> {
  return running.run(tables.slice().sort().join(","), async () => {
    try {
      if (rowsWritten < ANALYZE_ROW_THRESHOLD) return { ran: false, reason: "small-load", tables: [] };
      if (!(await isTiDB(db))) return { ran: false, reason: "not-tidb", tables: [] };
      const expanded: string[] = [];
      for (const entry of tables) {
        if (!entry.endsWith("*")) { expanded.push(entry); continue; }
        const like = `${entry.slice(0, -1).replace(/[_%]/g, "\\$&")}%`;
        const rows = (await db.execute(sql`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name LIKE ${like}`)) as unknown as [Array<{ t: string }>, unknown];
        expanded.push(...rows[0].map(row => row.t));
      }
      for (const table of expanded) await db.execute(sql`ANALYZE TABLE ${sql.identifier(table)}`);
      logInfo("tidb.statistics_refreshed", { tables: expanded.length, rowsWritten });
      return { ran: true, reason: "refreshed", tables: expanded };
    } catch (error) {
      logWarn("tidb.statistics_refresh_failed", { reason: error instanceof Error ? error.name : "unknown" });
      return { ran: false, reason: "failed", tables: [] };
    }
  });
}

/** The tables each import kind writes to. */
export const IMPORT_TABLES: Record<string, string[]> = {
  wbs: ["wbs_items"],
  budget: ["budget_lines"],
  contracts: ["contracts", "commitments"],
  materials: ["material_masters", "project_material_overrides"],
  schedule: ["wbs_items", "activities"],
  openingBalances: ["warehouse_inventory_transactions"],
};
