import pg from "pg";

// A logical dump of the DATA of the database as plain SQL, written one table at a time from a single consistent snapshot, so a restore is
// "build the schema with the migrations (an empty database), then run this file as the table owner". It only ever READS: a backup role needs SELECT
// and nothing else. It must read as a role that sees every row (the owner), because row-level security applies to the application role.
//
// Every value is read as the database's own text for it (`col::text`) and written back as a quoted literal that PostgreSQL coerces to the
// column's type on INSERT, so numbers, timestamps with their offset, booleans, enums and bytea (hex) round-trip exactly, with no driver in between.
// PostgreSQL text cannot hold a NUL byte, so unlike the previous engine there is nothing to escape beyond the single quote.

/** Tables that are never backed up: a restored one would hand out sessions that were valid at the time of the dump. */
export const EXCLUDED_TABLES = new Set(["auth_sessions"]);

export const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** One value as a SQL literal. Strings are quoted with the quote doubled (standard_conforming_strings is on, so a backslash is just a backslash); null is NULL. */
export function sqlValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

export type DumpOptions = {
  /** Only these tables (the tests use this); by default every base table except the excluded ones. */
  only?: string[];
  /** Rows per INSERT statement and bytes per statement at most. */
  rowsPerInsert?: number;
  bytesPerInsert?: number;
};

export type DumpSummary = { tables: Array<{ name: string; rows: number }>; totalRows: number };

/** Base tables in dependency order: a table comes after every table its foreign keys point at, so a plain restore never meets a missing parent. */
export async function listBackupTables(client: pg.Client, only?: string[]) {
  const { rows: tableRows } = await client.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  const all = tableRows.map(row => row.name);
  const wanted = only ?? all.filter(name => !EXCLUDED_TABLES.has(name));
  if (only) {
    const missing = only.filter(name => !all.includes(name));
    if (missing.length) throw new Error(`Unknown table(s): ${missing.join(", ")}`);
  }
  const { rows: edges } = await client.query<{ child: string; parent: string }>(
    "SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE k.contype = 'f' AND n.nspname = 'public' AND c.oid <> p.oid",
  );
  const remaining = new Set(wanted);
  const parentsOf = new Map<string, Set<string>>();
  for (const name of wanted) parentsOf.set(name, new Set());
  for (const edge of edges) if (remaining.has(edge.child) && remaining.has(edge.parent)) parentsOf.get(edge.child)!.add(edge.parent);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = Array.from(remaining).filter(name => Array.from(parentsOf.get(name)!).every(parent => !remaining.has(parent))).sort();
    // A cycle would leave nothing ready; take the rest by name rather than loop (the schema has none, and the restore says so if it ever does).
    const next = ready.length ? ready : Array.from(remaining).sort();
    for (const name of next) { ordered.push(name); remaining.delete(name); }
  }
  return ordered;
}

/**
 * Yields the dump as chunks of SQL text. The caller consumes them as a stream (gzip, encrypt, file), so memory stays bounded whatever the size.
 * The last line, `-- BACKUP COMPLETE ...`, exists only if every table was written to its end: a file without it is a truncated dump.
 */
export async function* dumpDatabase(client: pg.Client, options: DumpOptions = {}, summary: DumpSummary = { tables: [], totalRows: 0 }): AsyncGenerator<string, DumpSummary> {
  const rowsPerInsert = options.rowsPerInsert ?? 200;
  const bytesPerInsert = options.bytesPerInsert ?? 256 * 1024;
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
    await client.query("SET LOCAL bytea_output = 'hex'");
    await client.query("SET LOCAL extra_float_digits = 3");
    const { rows: [{ name: database }] } = await client.query<{ name: string }>("SELECT current_database() AS name");
    yield `-- PROJECT OS logical backup (PostgreSQL, data only)\n-- database: ${database}\n-- taken: ${new Date().toISOString()}\n-- excluded (never backed up): ${Array.from(EXCLUDED_TABLES).join(", ")}\n-- restore: build the schema first (node scripts/migrate.mjs on an empty database), then run this file as the table owner.\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\nSET TIME ZONE 'UTC';\nBEGIN;\n\n`;
    let cursorNumber = 0;
    for (const table of await listBackupTables(client, options.only)) {
      const quoted = quoteIdentifier(table);
      yield `-- TABLE ${table}\n`;
      const { rows: columnRows } = await client.query<{ name: string; identity: string }>(
        "SELECT a.attname AS name, a.attidentity AS identity FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' ORDER BY a.attnum",
        [`public.${quoted}`],
      );
      const names = columnRows.map(column => column.name);
      const header = `INSERT INTO ${quoted} (${names.map(quoteIdentifier).join(", ")}) VALUES\n`;

      const cursor = `backup_${cursorNumber++}`;
      await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT ${names.map(name => `${quoteIdentifier(name)}::text`).join(", ")} FROM public.${quoted}`);
      let rows = 0; let pending: string[] = []; let pendingBytes = 0;
      const flush = () => { const sql = `${header}${pending.join(",\n")};\n`; pending = []; pendingBytes = 0; return sql; };
      for (;;) {
        const { rows: batch } = await client.query({ text: `FETCH 500 FROM ${cursor}`, rowMode: "array" });
        if (!batch.length) break;
        for (const row of batch as Array<Array<string | null>>) {
          const literal = `(${row.map(value => sqlValue(value)).join(", ")})`;
          pending.push(literal); pendingBytes += literal.length; rows += 1;
          if (pending.length >= rowsPerInsert || pendingBytes >= bytesPerInsert) yield flush();
        }
      }
      await client.query(`CLOSE ${cursor}`);
      if (pending.length) yield flush();

      // An identity column keeps counting from where the data ends, not from 1.
      for (const column of columnRows.filter(column => column.identity !== "")) {
        yield `SELECT setval(pg_get_serial_sequence('${quoted}', '${column.name}'), GREATEST((SELECT COALESCE(MAX(${quoteIdentifier(column.name)}), 0) FROM ${quoted}), 1), (SELECT MAX(${quoteIdentifier(column.name)}) IS NOT NULL FROM ${quoted})); -- SEQUENCE ${table}\n`;
      }

      // The count the database itself gives, inside the same snapshot: if the rows written differ, the dump is wrong and says so.
      const { rows: [counted] } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM public.${quoted}`);
      if (Number(counted.n) !== rows) throw new Error(`Backup of ${table} is incomplete: wrote ${rows} rows, the table has ${counted.n}`);
      summary.tables.push({ name: table, rows }); summary.totalRows += rows;
      yield `-- ROWS ${table} ${rows}\n\n`;
    }
    yield `COMMIT;\n-- BACKUP COMPLETE tables=${summary.tables.length} rows=${summary.totalRows}\n`;
    return summary;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

/** Reads a finished dump's markers: per-table row counts and the completion line (null when the file was cut short). */
export function readDumpMarkers(sqlText: string) {
  const tables = Array.from(sqlText.matchAll(/^-- ROWS (\S+) (\d+)$/gm), match => ({ name: match[1], rows: Number(match[2]) }));
  const done = /^-- BACKUP COMPLETE tables=(\d+) rows=(\d+)$/m.exec(sqlText);
  return { tables, complete: done ? { tables: Number(done[1]), rows: Number(done[2]) } : null };
}
