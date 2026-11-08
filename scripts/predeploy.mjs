// The deploy's pre-deploy step (docs/GO_LIVE.md): runs before a new version takes traffic, and a non-zero exit stops the deploy (the old
// version keeps serving).
//   1. apply the schema migrations (each re-applies the row-level-security / grant conventions to every table);
//   2. when PROJECT_OS_APP_DB_PASSWORD is set — i.e. the application connects as the restricted role project_os_app — (re)provision that role so
//      it holds the tables this migration created, then PROVE it (scripts/verify-db-security.mjs): it must read every table, hold only
//      SELECT/INSERT on audit_logs, and see no tenant row without a context. Otherwise the new version would start against tables its own
//      database account cannot touch, or against an unprotected audit trail.
// Without that password the site would run as the owner role (the first deployment): a loud warning, not a failure.
// Prints names and counts, never a URL or a password.
import { spawnSync } from "node:child_process";
import { failureDetail, secretsFromEnvironment } from "./lib/pgErrorReport.mjs";

// the owner's password (DATABASE_URL) as well as the application role's: provisioning connects as the owner, and its error must not print either
const secrets = secretsFromEnvironment(process.env);

// a proof that ran to the end and said no prints its checks on stdout, not stderr: name them, so the reason is never empty
const checksOf = stdout => { try { return { checks: JSON.parse(stdout).checks }; } catch { return "verify-db-security printed no reason"; } };
const run = args => spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
const migrated = run(["scripts/migrate.mjs"]);
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

if (!process.env.PROJECT_OS_APP_DB_PASSWORD) {
  console.warn(JSON.stringify({ auditProtection: "OFF", warning: "PROJECT_OS_APP_DB_PASSWORD is not set: the site would write as the owner role, so audit_logs and row-level security are NOT enforced on the application's connection. Do the application-role step (docs/GO_LIVE.md)." }));
  process.exit(0);
}
const provisioned = spawnSync(process.execPath, ["scripts/provision-app-role.mjs"], { encoding: "utf8", env: process.env });
if (provisioned.status !== 0) { console.error(JSON.stringify({ auditProtection: "FAILED", reason: failureDetail(provisioned.stderr, secrets) || "provisioning failed" })); process.exit(1); }
const report = JSON.parse(provisioned.stdout);
const verified = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-db-security.mjs"], { encoding: "utf8", env: process.env });
process.stdout.write(verified.stdout ?? "");
if (verified.status !== 0) { console.error(JSON.stringify({ auditProtection: "FAILED", reason: "verify-db-security did not approve the application role", detail: failureDetail(verified.stderr, secrets) || checksOf(verified.stdout) })); process.exit(1); }
console.log(JSON.stringify({ auditProtection: "provisioned", role: report.role, tables: report.tablesConfigured, restrictedRoleSees: JSON.parse(verified.stdout).tables }));
