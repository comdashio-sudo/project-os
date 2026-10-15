import { spawn } from "node:child_process";

const setup = spawn(process.execPath, ["scripts/ensure-pmc-integration-schema.mjs"], { stdio: "inherit", env: process.env });
const setupCode = await new Promise(resolve => setup.on("exit", code => resolve(code ?? 1)));
if (setupCode !== 0) process.exit(setupCode);

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/project_os_integration_test";
const child = spawn("pnpm", ["vitest", "run", "--no-file-parallelism", "server/integration.database.test.ts", "server/pilot.roleAcceptance.database.test.ts", "server/pilot.backupRestore.database.test.ts", "server/auth.loginCodes.database.test.ts"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString(), TEST_DATABASE_URL: url.toString(), PROJECT_OS_USE_ADMIN_DATABASE_URL: "true" } });
child.on("exit", code => process.exit(code ?? 1));
