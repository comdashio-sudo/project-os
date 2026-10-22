// After a bulk import, refresh the planner's table statistics so the first dashboard query over the new rows is planned on real numbers.
// PostgreSQL's autovacuum would catch up within about a minute; this closes that gap for a big load. Never blocks the import and never
// fails it: the import already committed, and a refresh that cannot run is only logged.
//
// ANALYZE needs table ownership and the application role is deliberately not the owner, so it goes through project_os_analyze(), a
// SECURITY DEFINER function in the baseline that analyses only existing public tables (never audit_logs) and is executable by that role alone.
import { sql } from "drizzle-orm";
import { logInfo, logWarn } from "./_core/logger";
import { createInFlight } from "./inFlight";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Below this many rows autovacuum is quick enough that doing it ourselves buys nothing. */
export const ANALYZE_ROW_THRESHOLD = 1000;

const running = createInFlight<RefreshResult>();

export type RefreshResult = { ran: boolean; reason: "refreshed" | "small-load" | "failed"; tables: string[] };

/** `tables` may include a trailing `*` prefix pattern (e.g. "pmc_*") that is expanded from the catalogue. Returns when finished; callers normally `void` it. */
export function refreshStatisticsAfterBulkLoad(db: Db, tables: string[], rowsWritten: number): Promise<RefreshResult> {
  return running.run(tables.slice().sort().join(","), async () => {
    try {
      if (rowsWritten < ANALYZE_ROW_THRESHOLD) return { ran: false, reason: "small-load", tables: [] };
      const expanded: string[] = [];
      for (const entry of tables) {
        if (!entry.endsWith("*")) { expanded.push(entry); continue; }
        const like = `${entry.slice(0, -1).replace(/[_%\\]/g, "\\$&")}%`;
        const rows = (await db.execute(sql`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE ${like}`)).rows as Array<{ t: string }>;
        expanded.push(...rows.map(row => row.t));
      }
      const analysed = Number(((await db.execute(sql`SELECT project_os_analyze(ARRAY[${sql.join(expanded.map(table => sql`${table}`), sql`, `)}]::text[]) AS n`)).rows[0] as { n: number } | undefined)?.n ?? 0);
      logInfo("database.statistics_refreshed", { tables: analysed, rowsWritten });
      return { ran: true, reason: "refreshed", tables: expanded };
    } catch (error) {
      logWarn("database.statistics_refresh_failed", { reason: error instanceof Error ? error.name : "unknown" });
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
