// Many rows of ONE table updated in batches: `UPDATE t SET c = v.c … FROM (VALUES …) AS v(id, c, …) WHERE t.id = v.id AND t.tenant_id = … [AND t.project_id = …]`.
// One statement per batch of ≤500 rows instead of one per row (D-4, review of #153): a P6 export that changes 10,000 activities is 20 statements, not 10,000.
// Every value is cast to its column's own SQL type inside VALUES, so a NULL or a date is read the same in the first row as in any other.
// The scope stays in the WHERE clause (row-level security applies as well), and the count of rows written is checked: rows = 0 is never taken for success.
import { TRPCError } from "@trpc/server";
import { getTableName, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export const BULK_UPDATE_BATCH = 500;
type Executor = { execute: (query: SQL) => Promise<{ rows: unknown[] }> };

export async function bulkUpdate<K extends string>(tx: Executor, input: {
  table: PgTable;
  /** the columns written, by the key each row carries its value under */
  columns: Record<K, PgColumn>;
  rows: Array<{ id: string; values: Record<K, unknown> }>;
  scope: { tenantId: string; projectId?: string };
  batch?: number;
}): Promise<number> {
  const keys = Object.keys(input.columns) as K[];
  if (!input.rows.length || !keys.length) return 0;
  const size = input.batch ?? BULK_UPDATE_BATCH;
  const table = sql.identifier(getTableName(input.table));
  const cast = (column: PgColumn, value: unknown) => sql`CAST(${value === null || value === undefined ? null : column.mapToDriverValue(value)} AS ${sql.raw(column.getSQLType())})`;
  const names = sql.join([sql.identifier("id"), ...keys.map(key => sql.identifier(`v_${key}`))], sql`, `);
  const set = sql.join(keys.map(key => sql`${sql.identifier(input.columns[key].name)} = v.${sql.identifier(`v_${key}`)}`), sql`, `);
  const projectFilter = input.scope.projectId === undefined ? sql`` : sql` AND t.project_id = ${input.scope.projectId}`;
  let written = 0;
  for (let start = 0; start < input.rows.length; start += size) {
    const part = input.rows.slice(start, start + size);
    const values = sql.join(part.map(row => sql`(CAST(${row.id} AS varchar), ${sql.join(keys.map(key => cast(input.columns[key], row.values[key])), sql`, `)})`), sql`, `);
    const result = await tx.execute(sql`UPDATE ${table} AS t SET ${set} FROM (VALUES ${values}) AS v(${names}) WHERE t.id = v.id AND t.tenant_id = ${input.scope.tenantId}${projectFilter} RETURNING t.id`);
    if (result.rows.length !== part.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" });
    written += result.rows.length;
  }
  return written;
}
