// Test and script fixtures only. The application never imports this file.
//
// The database tests and operational scripts seed and inspect data with plain SQL written in the shape the MySQL driver took:
// `connection.query("... WHERE tenantId IN (?, ?)", [a, b])` answering `[rows]`. This module answers the same call on PostgreSQL, so a
// fixture reads the way it always did while the database underneath is the real thing:
//   - `?` placeholders become $1, $2 … (an array parameter expands to a list, an empty one to NULL);
//   - camelCase column names (the names the application's TypeScript uses) become the snake_case columns they are stored as, and result
//     columns come back under the camelCase name again, so `row.tenantId` keeps working;
//   - backticks become double quotes, UUID() becomes gen_random_uuid(), INSERT IGNORE and ON DUPLICATE KEY UPDATE become ON CONFLICT;
//   - boolean columns come back as 1/0, as the driver returned them.
// Only identifiers outside string literals are rewritten, and only those that are real column names in drizzle/schema.ts.
import pg from "pg";
import { getTableColumns, is } from "drizzle-orm";
import { PgBoolean, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../drizzle/schema";

pg.types.setTypeParser(20, value => Number(value)); // bigint (COUNT, SUM) as a number, as the driver returned it

const camelToSnake = new Map<string, string>();
const snakeToCamel = new Map<string, string>();
const booleanColumns = new Set<string>();
/** table -> the columns of its unique key that ON DUPLICATE KEY UPDATE meant. */
const conflictTargets: Record<string, string> = { permissions: "code", users: "open_id", companies: "slug", tenant_settings: "tenant_id" };

for (const value of Object.values(schema)) {
  if (!is(value, PgTable)) continue;
  for (const [key, column] of Object.entries(getTableColumns(value))) {
    if (key !== column.name) camelToSnake.set(key, column.name);
    if (key !== column.name) snakeToCamel.set(column.name, key);
    if (is(column, PgBoolean)) booleanColumns.add(column.name);
  }
  getTableConfig(value);
}

/** Applies `change` to the parts of the SQL that are not inside '…' literals. */
function outsideLiterals(sql: string, change: (part: string) => string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const quote = sql.indexOf("'", i);
    if (quote < 0) { out += change(sql.slice(i)); break; }
    out += change(sql.slice(i, quote));
    let end = quote + 1;
    for (;;) {
      if (end >= sql.length) break;
      if (sql[end] === "'" && sql[end + 1] === "'") { end += 2; continue; }
      if (sql[end] === "'") break;
      end += 1;
    }
    out += sql.slice(quote, end + 1);
    i = end + 1;
  }
  return out;
}

const mapName = (name: string, used?: Map<string, string>) => {
  const snake = camelToSnake.get(name);
  if (snake && used) used.set(snake, name);
  return snake ?? name;
};

export function translateSql(source: string, params: unknown[] = []): { text: string; values: unknown[]; camelUsed: Map<string, string>; selectsAll: boolean } {
  let ignore = false;
  const camelUsed = new Map<string, string>(); // snake name -> the camelCase name the statement used
  const selectsAll = /\bSELECT\s+(DISTINCT\s+)?(\w+\.)?\*|,\s*\w+\.\*/i.test(source);
  let upsert: { table: string; sets: string } | null = null;
  const values: unknown[] = [];
  let text = outsideLiterals(source, part => {
    let p = part.replace(/`([^`]+)`/g, (_m, name: string) => `"${mapName(name, camelUsed)}"`);
    p = p.replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, () => { ignore = true; return "INSERT INTO"; });
    p = p.replace(/\bUUID\(\)/gi, "gen_random_uuid()");
    p = p.replace(/\bDATABASE\(\)/gi, "current_database()");
    // DATE_SUB(x, INTERVAL n UNIT) / DATE_ADD(...)
    p = p.replace(/\bDATE_(SUB|ADD)\(\s*([^,()]*(?:\([^()]*\))?)\s*,\s*INTERVAL\s+(\?|\d+)\s+([A-Za-z]+)\s*\)/gi, (_m, direction: string, base: string, amount: string, unit: string) =>
      `(${base.trim()} ${direction.toUpperCase() === "SUB" ? "-" : "+"} ${amount === "?" ? `(? * INTERVAL '1 ${unit.toLowerCase()}')` : `INTERVAL '${amount} ${unit.toLowerCase()}'`})`);
    p = p.replace(/\bSET\s+FOREIGN_KEY_CHECKS\s*=\s*0\b/gi, "SET session_replication_role = replica");
    p = p.replace(/\bSET\s+FOREIGN_KEY_CHECKS\s*=\s*1\b/gi, "SET session_replication_role = DEFAULT");
    // An alias that is not a column keeps its case (PostgreSQL folds an unquoted alias to lower case; the test reads `row.tenantCount`).
    p = p.replace(/\b(AS\s+)([A-Za-z_][A-Za-z0-9_]*)\b/gi, (m, as: string, name: string) => (/[A-Z]/.test(name) && !camelToSnake.has(name) ? `${as}"${name}"` : m));
    p = p.replace(/(?<!")\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b(?!")/g, (_m, name: string) => mapName(name, camelUsed));
    // boolean columns compared to 0/1
    p = p.replace(/\b([a-z_][a-z0-9_]*)\s*(=|<>|!=)\s*([01])\b(?!\.)/g, (m, col: string, op: string, bit: string) => (booleanColumns.has(col) ? `${col} ${op === "=" ? "=" : "<>"} ${bit === "1" ? "true" : "false"}` : m));
    return p;
  });

  // DELETE x FROM t x [INNER JOIN t2 y ON cond] WHERE w   ->   DELETE FROM t x [USING t2 y] WHERE (cond) AND (w)
  text = text.replace(/^\s*DELETE\s+(\w+)\s+FROM\s+(\w+)\s+\1(?:\s+INNER\s+JOIN\s+(\w+)\s+(\w+)\s+ON\s+(.+?))?\s+WHERE\s+([\s\S]+)$/i, (_m, alias: string, table: string, joined?: string, joinedAlias?: string, on?: string, where?: string) =>
    joined ? `DELETE FROM ${table} ${alias} USING ${joined} ${joinedAlias} WHERE (${on}) AND (${where})` : `DELETE FROM ${table} ${alias} WHERE ${where}`);

  const duplicate = /\s+ON\s+DUPLICATE\s+KEY\s+UPDATE\s+([\s\S]*)$/i.exec(text);
  if (duplicate) {
    const table = /INSERT\s+INTO\s+"?([a-z_0-9]+)"?/i.exec(text)?.[1] ?? "";
    const target = conflictTargets[table];
    if (!target) throw new Error(`pgCompat: ON DUPLICATE KEY UPDATE on ${table || "an unknown table"} needs a conflict target (add it to conflictTargets)`);
    upsert = { table, sets: duplicate[1].replace(/VALUES\(\s*([a-z_0-9]+)\s*\)/gi, "EXCLUDED.$1") };
    text = text.slice(0, duplicate.index) + ` ON CONFLICT (${target}) DO UPDATE SET ${upsert.sets}`;
  } else if (ignore) {
    text = `${text.trimEnd().replace(/;$/, "")} ON CONFLICT DO NOTHING`;
  }

  // ? -> $n, expanding arrays
  let index = 0;
  text = outsideLiterals(text, part => part.replace(/\?/g, () => {
    const value = params[index++];
    if (Array.isArray(value)) {
      if (value.length === 0) return "NULL";
      return value.map(item => { values.push(item); return `$${values.length}`; }).join(", ");
    }
    values.push(value === undefined ? null : value);
    return `$${values.length}`;
  }));
  return { text, values, camelUsed, selectsAll };
}

export type RowDataPacket = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type ResultSetHeader = { affectedRows: number; insertId: number };

const toCompatValue = (value: unknown) => (typeof value === "boolean" ? (value ? 1 : 0) : value);

export class Connection {
  private superuser: boolean | null = null;
  constructor(private readonly client: pg.Client) {}

  /**
   * A fixture DELETE removes rows in the order the test lists them, which was never checked against foreign keys on the previous engine;
   * the schema now declares and the database enforces them. Cleanup therefore runs with foreign-key triggers off (superuser only), for that
   * statement alone. Inserts are NOT relaxed: a fixture row that points nowhere still fails, and the application's own connection never
   * goes through this class.
   */
  private async deleteWithoutForeignKeyChecks<T>(text: string, values: unknown[]): Promise<[T, pg.FieldDef[]]> {
    this.superuser ??= (await this.client.query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")).rows[0]?.rolsuper === true;
    if (!this.superuser) { const result = await this.client.query({ text, values }); return [{ affectedRows: result.rowCount ?? 0, insertId: 0 } as unknown as T, []]; }
    await this.client.query("BEGIN");
    try {
      await this.client.query("SET LOCAL session_replication_role = replica");
      const result = await this.client.query({ text, values });
      await this.client.query("COMMIT");
      return [{ affectedRows: result.rowCount ?? 0, insertId: 0 } as unknown as T, []];
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async query<T = any>(sql: string, params: unknown[] = []): Promise<[T, pg.FieldDef[]]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { text, values, camelUsed, selectsAll } = translateSql(sql, params);
    // The audit trail refuses UPDATE, DELETE and TRUNCATE for everyone, the table owner included (that is the point of it). A fixture that has to
    // leave the TEST database clean, or to back-date a row, lifts the guard for that one statement, in a transaction, and puts it back before
    // anything else runs. It only ever does so in project_os_integration_test.
    if (/^\s*(DELETE\s+FROM|TRUNCATE(\s+TABLE)?|UPDATE)\s+"?audit_logs"?\b/i.test(text)) return this.changeAuditRows<T>(text, values);
    if (/^\s*DELETE\s+FROM\b/i.test(text) && !/\bRETURNING\b/i.test(text)) return this.deleteWithoutForeignKeyChecks<T>(text, values);
    const needsId = /^\s*INSERT\s+INTO\s+"?users"?\b/i.test(text) && !/RETURNING/i.test(text);
    const result = await this.client.query({ text: needsId ? `${text} RETURNING id` : text, values, rowMode: "array" });
    const fields = result.fields ?? [];
    if (fields.length > 0 && !needsId) {
      const names = fields.map(field => (selectsAll ? snakeToCamel.get(field.name) : camelUsed.get(field.name)) ?? field.name);
      const rows = result.rows.map((row: unknown[]) => Object.fromEntries(names.map((name, i) => [name, toCompatValue(row[i])])));
      return [rows as unknown as T, fields];
    }
    const header: ResultSetHeader = { affectedRows: result.rowCount ?? 0, insertId: needsId ? Number((result.rows[0] as unknown[] | undefined)?.[0] ?? 0) : 0 };
    return [header as unknown as T, fields];
  }

  private async changeAuditRows<T>(text: string, values: unknown[]): Promise<[T, pg.FieldDef[]]> {
    const database = (await this.client.query("SELECT current_database() AS name")).rows[0]?.name;
    if (database !== "project_os_integration_test") throw new Error("pgCompat: the audit trail is only ever cleared in the test database");
    const triggers = ["audit_logs_refuse_update", "audit_logs_refuse_delete", "audit_logs_refuse_truncate"];
    await this.client.query("BEGIN");
    try {
      for (const name of triggers) await this.client.query(`ALTER TABLE audit_logs DISABLE TRIGGER ${name}`);
      const result = await this.client.query({ text, values });
      for (const name of triggers) await this.client.query(`ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER ${name}`);
      await this.client.query("COMMIT");
      return [{ affectedRows: result.rowCount ?? 0, insertId: 0 } as unknown as T, []];
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  execute = this.query;
  async end() { await this.client.end(); }
  destroy() { void this.client.end().catch(() => undefined); }
}

export async function createConnection(options: string | { uri: string }): Promise<Connection> {
  const connectionString = typeof options === "string" ? options : options.uri;
  const client = new pg.Client({ connectionString });
  await client.connect();
  return new Connection(client);
}

/** A literal for a value, the way the MySQL driver escaped one into SQL text. */
export function escape(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const compat = { createConnection, escape };
// The type names the tests used (`mysql.Connection`, `mysql.RowDataPacket`) live on a namespace of the same name.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace compat {
  type Connection = import("./pgCompat").Connection;
  type RowDataPacket = import("./pgCompat").RowDataPacket;
  type ResultSetHeader = import("./pgCompat").ResultSetHeader;
}
export default compat;
