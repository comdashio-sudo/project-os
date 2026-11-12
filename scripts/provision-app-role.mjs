// DBA-run, once per database and again whenever the password is rotated. Connects with DATABASE_URL (the OWNER of the schema: `postgres` on
// Supabase, a superuser locally) and makes sure the restricted application role exists, can log in with PROJECT_OS_APP_DB_PASSWORD, and holds
// exactly what drizzle/baseline-security.sql gives it, on every table that exists now (project_os_apply_conventions()).
//
//   DATABASE_URL=postgres://owner:…@host:5432/db PROJECT_OS_APP_DB_PASSWORD=… node scripts/provision-app-role.mjs
//
// The password is sent as a query literal built by the driver and never printed. The application connects as this role, so it has no DDL,
// no TRUNCATE and no UPDATE/DELETE on audit_logs, and row-level security applies to everything it does.
import pg from "pg";
import { explainProvisioningFailure, setAppRoleLogin } from "./lib/appRole.mjs";
import { parseDatabaseUrlOrExit } from "./lib/pgErrorReport.mjs";

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

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parseDatabaseUrlOrExit(rootUrl, { script: "provision-app-role" }).hostname);
const client = new pg.Client({ connectionString: rootUrl, ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off", ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n").trim() } : {}) } });
let stage = "connect";
try {
  await client.connect();
  stage = "create role";
  await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN CREATE ROLE project_os_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$");
  stage = "set login";
  await setAppRoleLogin(client, appPassword); // reads the role's attributes back and refuses a role that holds a power it must not
  stage = "grant";
  await client.query("GRANT USAGE ON SCHEMA public TO project_os_app");
  const { rows } = await client.query("SELECT current_database() AS database, project_os_apply_conventions() AS tables");
  console.log(JSON.stringify({ role: "project_os_app", database: rows[0].database, tablesConfigured: rows[0].tables, auditedTablePrivileges: ["SELECT", "INSERT"] }, null, 2));
} catch (error) {
  // Names the stage and the SQLSTATE, never the statement: it carries the password.
  const code = error?.code ?? error?.name ?? "UNKNOWN";
  console.error(`App role provisioning failed during ${stage} with ${code}.`);
  if (process.env.BOOTSTRAP_NOTE_FILE) { try { (await import("node:fs")).appendFileSync(process.env.BOOTSTRAP_NOTE_FILE, explainProvisioningFailure(stage, code, error) + "\n"); } catch { /* the note is a convenience */ } }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
