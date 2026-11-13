// Prepares the local test database: DROPS and re-creates project_os_integration_test (D-15: a database left from an earlier run — a demo company, a half
// run — made later runs fail falsely), applies every migration, and gives the application role a login so tests can connect as it. DATABASE_URL (or
// ADMIN_DATABASE_URL) must be a superuser or database owner on a LOCAL or otherwise non-production PostgreSQL, naming the maintenance database
// «postgres» or project_os_integration_test itself: any other database name is REFUSED before anything is connected to, so a URL pointing at a real
// database can never reach the drop below. Only the literal name project_os_integration_test is ever dropped.
//
//   PROJECT_OS_APP_DB_PASSWORD  password to give project_os_app for the tests (default: a fixed local-only value, refused off localhost)
import { spawn } from "node:child_process";
import pg from "pg";

const sourceUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL (a superuser on the local test server) is required.");
const admin = new URL(sourceUrl);
const named = decodeURIComponent(admin.pathname.replace(/^\//, ""));
if (!["", "postgres", "project_os_integration_test"].includes(named)) {
  console.error(`Refusing to run: the URL names the database «${named}». Name the maintenance database «postgres» (or project_os_integration_test); this script only ever drops and builds project_os_integration_test.`);
  process.exit(2);
}
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(admin.hostname);
const testUrl = new URL(sourceUrl);
testUrl.pathname = "/project_os_integration_test";
const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD ?? (local ? "project-os-local-test-only" : "");
if (!appPassword) throw new Error("PROJECT_OS_APP_DB_PASSWORD is required off localhost.");

const maintenance = new URL(sourceUrl);
maintenance.pathname = "/postgres";
const root = new pg.Client({ connectionString: maintenance.toString() });
await root.connect();
try {
  await root.query("DROP DATABASE IF EXISTS project_os_integration_test WITH (FORCE)");
  await root.query("CREATE DATABASE project_os_integration_test");
} finally {
  await root.end();
}

const code = await new Promise(resolve => spawn(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: testUrl.toString() } }).on("exit", c => resolve(c ?? 1)));
if (code !== 0) process.exit(code);

const owner = new pg.Client({ connectionString: testUrl.toString() });
await owner.connect();
try {
  await owner.query(`ALTER ROLE project_os_app WITH LOGIN PASSWORD ${pg.Client.prototype.escapeLiteral.call(owner, appPassword)}`);
  // D-15: no autovacuum on this short-lived database. The convention sweep (project_os_apply_conventions, which a test runs after creating a table) takes an
  // exclusive lock on every table, and an autovacuum on one of them was its deadlock partner on CI («autovacuum: VACUUM ANALYZE public.audit_logs»). Statistics
  // come from project_os_analyze where a test needs them. Production keeps autovacuum: this runs on the test database only.
  await owner.query(`DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP EXECUTE format('ALTER TABLE public.%I SET (autovacuum_enabled = false, toast.autovacuum_enabled = false)', t.tablename); END LOOP; END $$`);
  const { rows } = await owner.query("SELECT current_database() AS database_name, (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS table_count");
  console.log(JSON.stringify(rows));
} finally {
  await owner.end();
}
