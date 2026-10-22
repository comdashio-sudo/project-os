// Prepares the local test database: creates project_os_integration_test when it is missing, applies every migration, and gives the
// application role a login so tests can connect as it. DATABASE_URL (or ADMIN_DATABASE_URL) must be a superuser or database owner on a
// LOCAL or otherwise non-production PostgreSQL; the database name is forced to project_os_integration_test.
//
//   PROJECT_OS_APP_DB_PASSWORD  password to give project_os_app for the tests (default: a fixed local-only value, refused off localhost)
import { spawn } from "node:child_process";
import pg from "pg";

const sourceUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL (a superuser on the local test server) is required.");
const admin = new URL(sourceUrl);
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
  const exists = (await root.query("SELECT 1 FROM pg_database WHERE datname = 'project_os_integration_test'")).rowCount;
  if (!exists) await root.query("CREATE DATABASE project_os_integration_test");
} finally {
  await root.end();
}

const code = await new Promise(resolve => spawn(process.execPath, ["scripts/migrate.mjs"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: testUrl.toString() } }).on("exit", c => resolve(c ?? 1)));
if (code !== 0) process.exit(code);

const owner = new pg.Client({ connectionString: testUrl.toString() });
await owner.connect();
try {
  await owner.query(`ALTER ROLE project_os_app WITH LOGIN PASSWORD ${pg.Client.prototype.escapeLiteral.call(owner, appPassword)}`);
  const { rows } = await owner.query("SELECT current_database() AS database_name, (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS table_count");
  console.log(JSON.stringify(rows));
} finally {
  await owner.end();
}
