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
const ca = (process.env.DATABASE_SSL_CA ?? "").replace(/\\n/g, "\n").trim();
const client = new pg.Client({ connectionString: url, ssl: ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname) || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off", ...(ca ? { ca } : {}) } });
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
      // The baseline is regenerated from drizzle/schema.ts whenever the schema moves (a test keeps the two equal); a database that applied an older baseline gets the
      // same change from the numbered migration that accompanies it. So a changed baseline checksum is expected and is not an error; any OTHER changed file still is.
      if (applied.get(file) !== checksum && file !== "0000_baseline.sql") throw new Error(`Migration ${file} changed after it was applied. Add a new migration instead of editing an applied one.`);
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
  // Work order 18 (docs/TASLEEM_LESSONS.md section 4; Supabase stops granting new objects automatically on 2026-10-30): the same guard for sequences and functions.
  // A sequence the application role cannot use fails the first insert that needs it (42501, which reads like a policy fault); a function open to PUBLIC is open to anon.
  const { rows: [objects] } = await client.query(`
    SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('project_os_app', c.oid, 'USAGE') END) AS unusable_sequences,
           (SELECT string_agg(DISTINCT p.proname, ', ') FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             WHERE p.pronamespace = 'public'::regnamespace AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
               AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) AS functions_open_to_public`);
  if (objects.unusable_sequences > 0) throw new Error(`After the migrations ${objects.unusable_sequences} sequence(s) cannot be used by project_os_app. Grant USAGE, SELECT on them in the migration that creates them.`);
  if (objects.functions_open_to_public) throw new Error(`After the migrations these functions grant EXECUTE to PUBLIC: ${objects.functions_open_to_public}. Revoke it in the migration that creates the function, and grant EXECUTE to project_os_app only if the application calls it.`);
  console.log(JSON.stringify({ database: name, migrations: files.length, newlyApplied, tables: guard.tables, tablesWithoutRowLevelSecurity: guard.without_rls }));
} catch (error) {
  console.error(`Migration failed: ${String(error?.message ?? error).slice(0, 600)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
