import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

// DATABASE_URL names a superuser on the local test server. The test database is derived from it; the schema comes from the migrations alone
// (an empty database is enough), so a migration that cannot run fails here. Tests seed fixtures as the owner and run the application as the
// restricted role project_os_app, so every database test also exercises row-level security.
const adminUrl = new URL(process.env.DATABASE_URL);
const ownerUrl = new URL(adminUrl);
ownerUrl.pathname = "/project_os_integration_test";
const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD ?? "project-os-local-test-only";
const appUrl = new URL(ownerUrl);
appUrl.username = "project_os_app";
appUrl.password = appPassword;

const run = (script, env) => new Promise(resolve => spawn(process.execPath, [script], { stdio: "inherit", env: { ...process.env, ...env } }).on("exit", code => resolve(code ?? 1)));
const setupCode = await run("scripts/setup-integration-test-db.mjs", { DATABASE_URL: adminUrl.toString(), PROJECT_OS_APP_DB_PASSWORD: appPassword });
if (setupCode !== 0) process.exit(setupCode);

const files = readdirSync("server").filter(name => /\.database\.test\.ts$|\.integration\.test\.ts$|\.live\.test\.ts$/.test(name)).sort().map(name => `server/${name}`);
const child = spawn("pnpm", ["vitest", "run", "--no-file-parallelism", ...files], {
  stdio: "inherit",
  // The application connects as the restricted role (DATABASE_URL); fixtures are written by the owner (TEST_DATABASE_URL). The *.live.test.ts files
  // (a real Supabase Auth, a real bucket) skip themselves unless GOTRUE_LIVE_URL / STORAGE_* name one.
  env: { ...process.env, DATABASE_URL: appUrl.toString(), TEST_DATABASE_URL: ownerUrl.toString() },
});
child.on("exit", code => process.exit(code ?? 1));
