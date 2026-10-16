import { spawn } from "node:child_process";

const url = new URL(process.env.DATABASE_URL);
url.pathname = "/project_os_integration_test";

// The schema comes from the migrations alone (an empty test database is enough);
// no test creates tables of its own, so a migration that cannot run fails here.
const run = (script) => new Promise(resolve => spawn(process.execPath, [script], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString() } }).on("exit", code => resolve(code ?? 1)));
for (const script of ["scripts/migrate.mjs", "scripts/ensure-pmc-integration-schema.mjs"]) {
  const code = await run(script);
  if (code !== 0) process.exit(code);
}
const child = spawn("pnpm", ["vitest", "run", "--no-file-parallelism", "server/integration.database.test.ts", "server/pilot.roleAcceptance.database.test.ts", "server/pilot.backupRestore.database.test.ts", "server/auth.session.database.test.ts", "server/auth.loginCodes.database.test.ts", "server/profitability.database.test.ts", "server/fieldEntry.database.test.ts", "server/pmc.database.test.ts", "server/pmc.import.database.test.ts", "server/pmc.screens.database.test.ts", "server/pmc.plan.database.test.ts", "server/pmc.programme.database.test.ts", "server/operational.permissions.database.test.ts", "server/labour.cost.database.test.ts", "server/cashflow.drill.database.test.ts", "server/teamhours.offline.database.test.ts", "server/support.escalation.database.test.ts", "server/receipt.field.database.test.ts", "server/openingBalances.database.test.ts", "server/stock.valuation.database.test.ts", "server/payroll.allocation.database.test.ts", "server/email.notifications.database.test.ts", "server/gate6.matrix.database.test.ts", "server/contracts.supplier.database.test.ts"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString(), TEST_DATABASE_URL: url.toString(), PROJECT_OS_USE_ADMIN_DATABASE_URL: "true" } });
child.on("exit", code => process.exit(code ?? 1));
