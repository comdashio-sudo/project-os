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
