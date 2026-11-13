// Helpers that keep a large import inside PostgreSQL's limits. A statement carries at most 65,535 bind parameters, so a 67,000-row XER (nine columns a row)
// cannot be one INSERT, and `column IN ($1 … $67000)` cannot be a list of parameters.
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

/** Rows per INSERT. 2,000 rows × up to 30 columns stays well under the 65,535-parameter ceiling. */
export const INSERT_CHUNK_ROWS = 2_000;

export function chunk<T>(items: readonly T[], size = INSERT_CHUNK_ROWS): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size) as T[]);
  return out;
}

type InsertExecutor = { insert: (table: never) => { values: (rows: never) => PromiseLike<unknown> } };

/** `INSERT … VALUES` of any number of rows, in statements of `INSERT_CHUNK_ROWS`. Runs inside the caller's transaction. */
export async function insertChunked<T extends PgTable>(executor: unknown, table: T, rows: readonly T["$inferInsert"][], onChunk?: (done: number, total: number) => void | Promise<void>): Promise<void> {
  let done = 0;
  for (const part of chunk(rows)) {
    await (executor as InsertExecutor).insert(table as never).values(part as never);
    done += part.length;
    await onChunk?.(done, rows.length);
  }
}

/** `column = ANY($1)` with ONE array parameter: no list of 67,000 parameters. Same meaning as `inArray`. */
export function anyOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} = ANY(${sql.param(values as string[])}::text[])`;
}

/** Rows per UPDATE (G-140, D-32). 500 rows × a few columns is far under the parameter ceiling and keeps one statement's lock short. */
export const UPDATE_CHUNK_ROWS = 500;

type ExecuteExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

/**
 * G-140 (D-32): `UPDATE … SET col = v.col FROM (VALUES …) v WHERE t.id = v.id AND t.tenant_id = $tenant`, 500 rows a statement, instead of one
 * statement a row. Same rows, same values, same tenant filter (and row-level security still applies to every row it touches); the values travel
 * as parameters and are cast to the column's own type. `scope` is the tenant (and project) every touched row must belong to. Runs inside the caller's transaction.
 */
export async function updateChunked<T extends PgTable>(executor: unknown, table: T, scope: readonly (readonly [AnyPgColumn, string])[], columns: readonly AnyPgColumn[], rows: readonly { id: string; values: readonly (string | number | null)[] }[]): Promise<void> {
  if (!rows.length || !columns.length) return;
  if (!scope.length) throw new Error("updateChunked needs the tenant (and project) it may touch");
  const where = sql.join(scope.map(([column, value]) => sql`t.${sql.identifier(column.name)} = ${value}`), sql` AND `);
  const names = columns.map(column => column.name);
  const setClause = sql.join(columns.map(column => sql`${sql.identifier(column.name)} = v.${sql.identifier(column.name)}::${sql.raw(column.getSQLType())}`), sql`, `);
  const alias = sql.raw(`v(id, ${names.map(name => `"${name.replace(/"/g, '""')}"`).join(", ")})`);
  for (const part of chunk(rows, UPDATE_CHUNK_ROWS)) {
    const values = sql.join(part.map(row => sql`(${row.id}::text, ${sql.join(row.values.map(value => sql`${value === null ? null : String(value)}::text`), sql`, `)})`), sql`, `);
    await (executor as ExecuteExecutor).execute(sql`UPDATE ${table} AS t SET ${setClause} FROM (VALUES ${values}) AS ${alias} WHERE t.id = v.id AND ${where}`);
  }
}
