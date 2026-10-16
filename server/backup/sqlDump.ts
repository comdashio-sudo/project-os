import type { Connection } from "mysql2/promise";

// A logical dump of the database as plain SQL, written one table at a time from a single consistent snapshot, so a restore is
// "run this file". It only ever READS (SHOW CREATE TABLE, SELECT): a backup account needs SELECT and nothing else.

/** Tables that are never backed up: a restored one would hand out sign-in codes or sessions that were valid at the time of the dump. */
export const EXCLUDED_TABLES = new Set(["login_codes", "auth_sessions"]);

export const quoteIdentifier = (name: string) => `\`${name.replace(/`/g, "``")}\``;

/** One value as a SQL literal. Strings are quoted and escaped; bytes become X'..'; null is NULL. */
export function sqlValue(value: string | Buffer | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  return `'${value.replace(/[\0\n\r\\'"\x1a]/g, ch => ({ "\0": "\\0", "\n": "\\n", "\r": "\\r", "\\": "\\\\", "'": "\\'", '"': '\\"', "\x1a": "\\Z" })[ch]!)}'`;
}

export type DumpOptions = {
  /** Only these tables (the tests use this); by default every base table except the excluded ones. */
  only?: string[];
  /** Rows per INSERT statement and bytes per statement at most. */
  rowsPerInsert?: number;
  bytesPerInsert?: number;
};

export type DumpSummary = { tables: Array<{ name: string; rows: number }>; totalRows: number };

type ConnectionWithStream = { query(options: { sql: string; typeCast?: unknown }): { stream(): AsyncIterable<Record<string, unknown>> } };

export async function listBackupTables(connection: Connection, only?: string[]) {
  const [rows] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
  const all = (rows as Array<{ name: string }>).map(row => row.name);
  if (only) {
    const missing = only.filter(name => !all.includes(name));
    if (missing.length) throw new Error(`Unknown table(s): ${missing.join(", ")}`);
    return all.filter(name => only.includes(name));
  }
  return all.filter(name => !EXCLUDED_TABLES.has(name));
}

/**
 * Yields the dump as chunks of SQL text. The caller consumes them as a stream (gzip, encrypt, file), so memory stays bounded whatever the size.
 * The last line, `-- BACKUP COMPLETE ...`, exists only if every table was written to its end: a file without it is a truncated dump.
 */
export async function* dumpDatabase(connection: Connection, options: DumpOptions = {}, summary: DumpSummary = { tables: [], totalRows: 0 }): AsyncGenerator<string, DumpSummary> {
  const rowsPerInsert = options.rowsPerInsert ?? 200;
  const bytesPerInsert = options.bytesPerInsert ?? 256 * 1024;
  await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  try {
    const [[{ name: database }]] = (await connection.query("SELECT DATABASE() AS name")) as unknown as [[{ name: string }]];
    yield `-- PROJECT OS logical backup\n-- database: ${database}\n-- taken: ${new Date().toISOString()}\n-- excluded (never backed up): ${Array.from(EXCLUDED_TABLES).join(", ")}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n`;
    for (const table of await listBackupTables(connection, options.only)) {
      const quoted = quoteIdentifier(table);
      const [[create]] = (await connection.query(`SHOW CREATE TABLE ${quoted}`)) as unknown as [[Record<string, string>]];
      yield `-- TABLE ${table}\n${create["Create Table"]};\n`;

      const [columnRows] = await connection.query("SELECT COLUMN_NAME AS name, DATA_TYPE AS type, CHARACTER_SET_NAME AS charset, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION", [table]);
      const columns = (columnRows as Array<{ name: string; type: string; charset: string | null; extra: string }>)// A virtual/stored generated column is computed by the database and cannot be inserted. `DEFAULT_GENERATED` (a default written as an
      // expression, like `DEFAULT (now())` on createdAt) is NOT that: its stored value is real data and must be dumped.
      .filter(column => !/(VIRTUAL|STORED) GENERATED/i.test(column.extra ?? ""));
      const binary = new Set(columns.filter(column => column.charset === null && /^(binary|varbinary|tinyblob|blob|mediumblob|longblob|bit|geometry)$/i.test(column.type)).map(column => column.name));
      const names = columns.map(column => column.name);
      const header = `INSERT INTO ${quoted} (${names.map(quoteIdentifier).join(", ")}) VALUES\n`;

      // Every value arrives as its exact text (dates untouched by any time zone, decimals and 64-bit numbers without loss) or as bytes.
      const typeCast = (field: { name: string; string(encoding?: string): string | null; buffer(): Buffer | null }) => (binary.has(field.name) ? field.buffer() : field.string("utf8"));
      const stream = (connection as unknown as { connection: ConnectionWithStream }).connection.query({ sql: `SELECT ${names.map(quoteIdentifier).join(", ")} FROM ${quoted}`, typeCast }).stream();

      let rows = 0; let pending: string[] = []; let pendingBytes = 0;
      const flush = () => { const sql = `${header}${pending.join(",\n")};\n`; pending = []; pendingBytes = 0; return sql; };
      for await (const row of stream) {
        const literal = `(${names.map(name => sqlValue(row[name] as string | Buffer | null)).join(", ")})`;
        pending.push(literal); pendingBytes += literal.length; rows += 1;
        if (pending.length >= rowsPerInsert || pendingBytes >= bytesPerInsert) yield flush();
      }
      if (pending.length) yield flush();

      // The count the database itself gives, inside the same snapshot: if the rows written differ, the dump is wrong and says so.
      const [[counted]] = (await connection.query(`SELECT COUNT(*) AS n FROM ${quoted}`)) as unknown as [[{ n: number | string }]];
      if (Number(counted.n) !== rows) throw new Error(`Backup of ${table} is incomplete: wrote ${rows} rows, the table has ${counted.n}`);
      summary.tables.push({ name: table, rows }); summary.totalRows += rows;
      yield `-- ROWS ${table} ${rows}\n\n`;
    }
    yield `SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n-- BACKUP COMPLETE tables=${summary.tables.length} rows=${summary.totalRows}\n`;
    return summary;
  } finally {
    await connection.query("ROLLBACK").catch(() => undefined);
  }
}

/** Reads a finished dump's markers: per-table row counts and the completion line (null when the file was cut short). */
export function readDumpMarkers(sqlText: string) {
  const tables = Array.from(sqlText.matchAll(/^-- ROWS (\S+) (\d+)$/gm), match => ({ name: match[1], rows: Number(match[2]) }));
  const done = /^-- BACKUP COMPLETE tables=(\d+) rows=(\d+)$/m.exec(sqlText);
  return { tables, complete: done ? { tables: Number(done[1]), rows: Number(done[2]) } : null };
}
