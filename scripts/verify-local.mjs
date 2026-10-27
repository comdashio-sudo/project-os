// The full check, run LOCALLY before every push (owner's order 2026-10-27: GitHub Actions minutes ran out; a pull request now runs only the light checks).
//   DATABASE_URL=postgres://<admin>@127.0.0.1:5432/postgres node scripts/verify-local.mjs      (= pnpm verify:local)
// Steps, stopping at the first failure: pnpm check -> migration compatibility -> secret scan -> pnpm build -> pnpm test -> the database suite.
// The unit tests run WITHOUT DATABASE_URL (the vitest guard refuses any database but the integration one); the database suite builds that one itself from DATABASE_URL.
// Prints each step's duration and the total; never a URL.
import { spawnSync } from "node:child_process";

const withoutDatabase = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["DATABASE_URL", "TEST_DATABASE_URL", "TEST_APP_DATABASE_URL"].includes(key)));
const steps = [
  ["pnpm check", ["pnpm", ["check"]], withoutDatabase],
  ["migration compatibility", [process.execPath, ["scripts/ci/check-migration-compat.mjs"]], withoutDatabase],
  ["secret scan (whole tree)", [process.execPath, ["scripts/scan-secrets.mjs", "--all"]], withoutDatabase],
  ["pnpm build", ["pnpm", ["build"]], withoutDatabase],
  ["pnpm test", ["pnpm", ["test"]], withoutDatabase],
  ["database suite", [process.execPath, ["scripts/run-integration-database-test.mjs"]], process.env],
];
if (!process.env.DATABASE_URL) { console.error("verify-local: DATABASE_URL (an administrator of a LOCAL PostgreSQL) is required for the database suite."); process.exit(2); }
const started = Date.now(); const times = [];
for (const [name, [command, args], env] of steps) {
  const at = Date.now();
  console.log(`\n=== ${name}`);
  const result = spawnSync(command, args, { stdio: "inherit", env });
  times.push(`${name}: ${((Date.now() - at) / 1000).toFixed(0)} s`);
  if (result.status !== 0) { console.log(`\nverify-local: FAILED at "${name}"\n${times.join("\n")}`); process.exit(result.status ?? 1); }
}
console.log(`\nverify-local: ok\n${times.join("\n")}\ntotal: ${((Date.now() - started) / 1000).toFixed(0)} s`);
