// Runs a REAL Supabase Auth (GoTrue) on this machine against the local PostgreSQL, for the sign-in tests and the role rehearsal. Nothing here talks
// to a hosted Supabase project. It needs Docker and the image `supabase/gotrue:v2.176.1` (the version the hosted service ran when this was written).
//
//   DATABASE_URL=postgres://<superuser>@127.0.0.1:5432/project_os_integration_test node scripts/gotrue-local.mjs [--stop]
//
// What it does: creates the `auth` schema (and the Data API roles Supabase pre-creates) in the TEST database, starts the container on port 9999 with
// its mail pointed at 127.0.0.1:2525 (the SMTP sink the tests start; see server/testing/smtpSink.ts) and with the e-mail templates served from
// 127.0.0.1:2526 (docs/auth-email-templates/otp.html, the same text the owner pastes into the dashboard), then waits until /health answers.
// Prints the Auth URL and the generated JWT secret's location only; the secret is never printed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const NAME = "project-os-gotrue-local";
const IMAGE = "supabase/gotrue:v2.176.1";
const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });

if (process.argv.includes("--stop")) { docker("rm", "-f", NAME); console.log(JSON.stringify({ stopped: NAME })); process.exit(0); }

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL (a superuser on the local test server, database project_os_integration_test) is required.");
const url = new URL(databaseUrl);
if (url.pathname !== "/project_os_integration_test" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("This only runs against project_os_integration_test on this machine.");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT CREATEROLE; END IF;
  END $$`);
  await client.query("CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin");
  await client.query(`GRANT supabase_auth_admin TO ${client.escapeIdentifier(decodeURIComponent(url.username))}`);
  await client.query(`GRANT ALL ON SCHEMA auth TO ${client.escapeIdentifier(decodeURIComponent(url.username))}`);
} finally {
  await client.end();
}

// The JWT secret lives in a private file, never in the command line of this script's output.
const secretFile = join(tmpdir(), "project-os-gotrue-jwt-secret");
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString("base64url"), { mode: 0o600 });
const jwtSecret = readFileSync(secretFile, "utf8").trim();

docker("rm", "-f", NAME);
const dbForGoTrue = new URL(databaseUrl);
dbForGoTrue.search = "?search_path=auth";
const run = docker("run", "-d", "--name", NAME, "--network", "host",
  "-e", "GOTRUE_API_HOST=127.0.0.1", "-e", "PORT=9999", "-e", "API_EXTERNAL_URL=http://127.0.0.1:9999",
  "-e", "GOTRUE_DB_DRIVER=postgres", "-e", "GOTRUE_DB_NAMESPACE=auth", "-e", `DATABASE_URL=${dbForGoTrue.toString()}`,
  "-e", "GOTRUE_SITE_URL=http://127.0.0.1:3000", "-e", `GOTRUE_JWT_SECRET=${jwtSecret}`, "-e", "GOTRUE_JWT_EXP=3600",
  "-e", "GOTRUE_DISABLE_SIGNUP=false", "-e", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true", "-e", "GOTRUE_MAILER_AUTOCONFIRM=false",
  "-e", "GOTRUE_SMTP_HOST=127.0.0.1", "-e", "GOTRUE_SMTP_PORT=2525", "-e", "GOTRUE_SMTP_USER=sink", "-e", "GOTRUE_SMTP_PASS=sink", "-e", "GOTRUE_SMTP_ADMIN_EMAIL=no-reply@mail.example.test", "-e", "GOTRUE_SMTP_SENDER_NAME=Dashio",
  "-e", "GOTRUE_MAILER_OTP_LENGTH=6", "-e", "GOTRUE_MAILER_OTP_EXP=3600", "-e", "GOTRUE_SMTP_MAX_FREQUENCY=2s", "-e", "GOTRUE_RATE_LIMIT_EMAIL_SENT=1000",
  "-e", "GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:2526/otp.html", "-e", "GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://127.0.0.1:2526/otp.html",
  "-e", "GOTRUE_MAILER_SUBJECTS_CONFIRMATION=رمز الدخول إلى Dashio | Dashio sign-in code", "-e", "GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=رمز الدخول إلى Dashio | Dashio sign-in code",
  IMAGE);
if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr.trim().slice(0, 300)}`);

for (let i = 0; i < 60; i += 1) {
  try { const response = await fetch("http://127.0.0.1:9999/health"); if (response.ok) { console.log(JSON.stringify({ authUrl: "http://127.0.0.1:9999", container: NAME, image: IMAGE, jwtSecretFile: secretFile, smtp: "127.0.0.1:2525", templates: "127.0.0.1:2526/otp.html" })); process.exit(0); } } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
console.error(docker("logs", "--tail", "20", NAME).stdout);
throw new Error("GoTrue did not become healthy");
