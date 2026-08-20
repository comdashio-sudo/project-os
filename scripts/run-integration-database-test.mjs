import { spawn } from "node:child_process";

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/project_os_integration_test";
const child = spawn("pnpm", ["vitest", "run", "--no-file-parallelism", "server/integration.database.test.ts", "server/pilot.roleAcceptance.database.test.ts", "server/pilot.backupRestore.database.test.ts"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString(), TEST_DATABASE_URL: url.toString(), PROJECT_OS_USE_ADMIN_DATABASE_URL: "true" } });
child.on("exit", code => process.exit(code ?? 1));
