// Applies the SQL migrations in ./drizzle (NNNN_name.sql, in order) to the database in DATABASE_URL, each in its own transaction, and records
// them in drizzle.__project_os_migrations with a checksum. Used by the deploy's pre-deploy step so the schema and the application ship together
// or not at all.
//
//   DATABASE_URL=postgres://... node scripts/migrate.mjs
//
// Use the DIRECT connection (port 5432), not the transaction pooler: this is DDL, and it is the one place a session-level lock_timeout matters.
// After every migration it runs project_os_apply_conventions() (updated_at upkeep, row-level security and grants on every table, see
// drizzle/baseline-security.sql) and then refuses to finish if any table lacks row-level security or the application role cannot read it.
// Prints the database name and the counts, never the URL.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const migrationsDir = new URL("../drizzle", import.meta.url).pathname;
const client = new pg.Client({ connectionString: url, ssl: ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname) || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off" } });
await client.connect();
try {
  const { rows: [{ name }] } = await client.query("SELECT current_database() AS name");
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query("CREATE TABLE IF NOT EXISTS drizzle.__project_os_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Map((await client.query("SELECT name, checksum FROM drizzle.__project_os_migrations")).rows.map(row => [row.name, row.checksum]));
  const files = (await readdir(migrationsDir)).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort();
  let newlyApplied = 0;
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) throw new Error(`Migration ${file} changed after it was applied. Add a new migration instead of editing an applied one.`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query(sql);
      const hasSweep = (await client.query("SELECT to_regprocedure('project_os_apply_conventions()') IS NOT NULL AS present")).rows[0].present;
      if (hasSweep) await client.query("SELECT project_os_apply_conventions()");
      await client.query("INSERT INTO drizzle.__project_os_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      newlyApplied += 1;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`${file}: ${error?.message ?? error}`);
    }
  }
  const { rows: [guard] } = await client.query(`
    SELECT count(*)::int AS tables,
           count(*) FILTER (WHERE NOT c.relrowsecurity)::int AS without_rls,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') AND NOT has_table_privilege('project_os_app', c.oid, 'SELECT'))::int AS unreadable
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`);
  if (guard.without_rls > 0 || guard.unreadable > 0) throw new Error(`After the migrations ${guard.without_rls} table(s) have no row-level security and ${guard.unreadable} are unreadable by project_os_app.`);
  console.log(JSON.stringify({ database: name, migrations: files.length, newlyApplied, tables: guard.tables, tablesWithoutRowLevelSecurity: guard.without_rls }));
} catch (error) {
  console.error(`Migration failed: ${String(error?.message ?? error).slice(0, 600)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
