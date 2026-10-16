// Render's preDeployCommand: runs before a new version takes traffic, and a non-zero exit stops the deploy (the old version keeps serving).
//   1. apply the schema migrations (on TiDB, refresh the table statistics when the schema changed);
//   2. when PROJECT_OS_APP_DB_PASSWORD is set — i.e. audit_logs protection is switched on — re-provision the restricted application account so it
//      holds the tables this migration created, then PROVE it: it must see and read EVERY table, and the audit_logs probes must pass
//      (scripts/verify-audit-log-grants.mjs). Otherwise the new version would start against tables its own database account cannot touch.
// Without that password the site runs as the administrative account (the first deployment, docs/GO_LIVE.md step 3): a loud warning, not a failure.
// Prints names and counts, never a URL or a password.
import { spawnSync } from "node:child_process";
import { provisionAuditAppAccount, restrictedAccountVisibility } from "./lib/auditProtection.mjs";

const run = script => spawnSync(process.execPath, script, { stdio: "inherit", env: process.env });
const migrated = run(["scripts/migrate.mjs"]);
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

const rootUrl = process.env.DATABASE_URL; const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD;
if (!appPassword) {
  console.warn(JSON.stringify({ auditProtection: "OFF", warning: "PROJECT_OS_APP_DB_PASSWORD is not set: the site writes as the administrative account, so audit_logs is NOT protected at the database level. Do the audit protection step (docs/GO_LIVE.md, step 5) before real data." }));
  process.exit(0);
}
try {
  const provisioned = await provisionAuditAppAccount({ rootUrl, appPassword });
  const seen = await restrictedAccountVisibility({ rootUrl, appPassword });
  if (seen.visible === 0 || seen.missing.length) {
    console.error(JSON.stringify({ auditProtection: "FAILED", reason: "the restricted application account cannot see every table", expected: seen.expected, visible: seen.visible, missing: seen.missing.slice(0, 20) }));
    process.exit(1);
  }
  console.log(JSON.stringify({ auditProtection: "provisioned", account: provisioned.account, tables: provisioned.tableCount, restrictedAccountSees: seen.visible }));
} catch (error) {
  console.error(JSON.stringify({ auditProtection: "FAILED", reason: String(error?.message ?? error).slice(0, 200) }));
  process.exit(1);
}
const verified = run(["--import", "tsx", "scripts/verify-audit-log-grants.mjs"]);
if (verified.status !== 0) { console.error(JSON.stringify({ auditProtection: "FAILED", reason: "verify-audit-log-grants did not approve the account" })); process.exit(1); }
