// DBA-run, once per database and again whenever the password is rotated. Connects with DATABASE_URL (the OWNER of the schema: `postgres` on
// Supabase, a superuser locally) and makes sure the restricted application role exists, can log in with PROJECT_OS_APP_DB_PASSWORD, and holds
// exactly what drizzle/baseline-security.sql gives it, on every table that exists now (project_os_apply_conventions()).
//
//   DATABASE_URL=postgres://owner:…@host:5432/db PROJECT_OS_APP_DB_PASSWORD=… node scripts/provision-app-role.mjs
//
// The password is sent as a query literal built by the driver and never printed. The application connects as this role, so it has no DDL,
// no TRUNCATE and no UPDATE/DELETE on audit_logs, and row-level security applies to everything it does.
import pg from "pg";

const rootUrl = process.env.DATABASE_URL;
const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD;
if (!rootUrl || !appPassword) {
  console.error("DATABASE_URL and PROJECT_OS_APP_DB_PASSWORD are required.");
  process.exit(2);
}
if (appPassword.length < 16) {
  console.error("PROJECT_OS_APP_DB_PASSWORD must be at least 16 characters.");
  process.exit(2);
}

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(rootUrl).hostname);
const client = new pg.Client({ connectionString: rootUrl, ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off" } });
let stage = "connect";
try {
  await client.connect();
  stage = "create role";
  await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN CREATE ROLE project_os_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$");
  stage = "set login";
  await client.query(`ALTER ROLE project_os_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${client.escapeLiteral(appPassword)}`);
  stage = "grant";
  await client.query("GRANT USAGE ON SCHEMA public TO project_os_app");
  const { rows } = await client.query("SELECT current_database() AS database, project_os_apply_conventions() AS tables");
  console.log(JSON.stringify({ role: "project_os_app", database: rows[0].database, tablesConfigured: rows[0].tables, auditedTablePrivileges: ["SELECT", "INSERT"] }, null, 2));
} catch (error) {
  // Names the stage and the SQLSTATE, never the statement: it carries the password.
  console.error(`App role provisioning failed during ${stage} with ${error?.code ?? error?.name ?? "UNKNOWN"}.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
