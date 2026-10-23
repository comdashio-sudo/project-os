// The all-roles visit: every operating role (and the demo administrator) opens every route of the app at 1280px and 390px, in Arabic, and
// the run records what that person would hit. Local only; no CI job runs it (the owner allowed only the screenshot artifact in CI).
//
//   DATABASE_URL=postgres://<owner>@127.0.0.1:5433/project_os_integration_test
//   ROLE_RUN_DIR=<protected directory outside the repository>
//   pnpm build && node --import tsx tests/ui/runRoleVisits.mjs
//
// What it does, in order:
//   1. tests/ui/prepareRoleUsers.mjs: one synthetic user per role in the demo tenant, and one session per user, each token in its own file
//      in ROLE_RUN_DIR (mode 600). The owner's database is used for this, as scripts/e2e-roles.mjs does.
//   2. Starts the production server (dist/index.js) on PORT, connected as the owner unless SERVER_DATABASE_URL names another role (a parity
//      run; see the summary's serverConnection). Skipped when BASE_URL names a server that is already running (it must share JWT_SECRET).
//   3. Runs tests/ui/audit.mjs once per role, with the role's own SESSION_FILE and OUT_DIR (ROLE_RUN_DIR/out/<role>/audit.json).
//   4. Writes ROLE_RUN_DIR/summary.json and summary.md, and prints the summary table.
//
// Findings are data, not failures: the exit code is 1 only when the visit itself could not run for a role. Nothing secret is printed:
// tokens, JWT_SECRET and the database URLs never leave the process.
//
// Env: DATABASE_URL (required, the owner), ROLE_RUN_DIR (default: a new directory under the OS temp dir), JWT_SECRET (default: a random
// value for this run), PORT (3200), BASE_URL (use a running server instead; it must use the same JWT_SECRET), SERVER_DATABASE_URL (default: the
// owner's connection, see below), ROLES (comma-separated role codes, default all), ROLE_CONCURRENCY (default 2), SCREENSHOTS (default 0).
import { spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { TEST_DATABASE } from "./roleUsers.mjs";

const fail = message => { console.error(message); process.exit(2); };
if (!process.env.DATABASE_URL) fail("DATABASE_URL is required (the owner of the test database).");
const ownerUrl = new URL(process.env.DATABASE_URL);
if (ownerUrl.pathname !== `/${TEST_DATABASE}`) fail(`Refusing to run: DATABASE_URL must name ${TEST_DATABASE}.`);
const runDir = process.env.ROLE_RUN_DIR ?? mkdtempSync(path.join(os.tmpdir(), "dashio-role-visit-"));
mkdirSync(runDir, { recursive: true, mode: 0o700 });
chmodSync(runDir, 0o700);
const jwtSecret = process.env.JWT_SECRET || randomBytes(32).toString("hex");
const port = Number(process.env.PORT ?? 3200);
const baseUrl = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const concurrency = Math.max(1, Number(process.env.ROLE_CONCURRENCY ?? 2));
const only = process.env.ROLES ? new Set(process.env.ROLES.split(",").map(code => code.trim().toUpperCase())) : null;

// The server's connection. Default: the owner's, a parity run (what the screens show, with no row-level security in the path), as
// scripts/lib/serverEnv.mjs does for the role rehearsal. SERVER_DATABASE_URL names the restricted role project_os_app instead (the security
// run). That role must be allowed to log in; the integration setup (scripts/setup-integration-test-db.mjs) grants it.
const serverDbUrl = process.env.SERVER_DATABASE_URL ?? ownerUrl.toString();
const serverConnection = process.env.SERVER_DATABASE_URL ? "restricted role project_os_app (row-level security applies)" : "owner (parity run: no row-level security in the path)";

const run = (args, env, cwd = process.cwd()) => new Promise(resolve => {
  const child = spawn(process.execPath, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.on("exit", code => resolve({ code: code ?? 1, output }));
});

// 1. users and sessions
const prepared = await run(["--import", "tsx", "tests/ui/prepareRoleUsers.mjs"], { ...process.env, DATABASE_URL: ownerUrl.toString(), JWT_SECRET: jwtSecret, ROLE_SESSION_DIR: runDir });
if (prepared.code !== 0) fail(`preparing the role users failed:\n${prepared.output.slice(-1200)}`);
console.log(prepared.output.trim());
const manifest = JSON.parse(readFileSync(path.join(runDir, "roles.json"), "utf8"));
const roles = manifest.roles.filter(role => !only || only.has(role.code));

// 2. the server under test
let server = null;
let serverDied = false;
if (!process.env.BASE_URL) {
  const built = path.resolve("dist/index.js");
  if (!existsSync(built)) fail("dist/index.js is missing: run pnpm build first.");
  server = spawn(process.execPath, [built], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATABASE_URL: serverDbUrl, JWT_SECRET: jwtSecret, APP_BASE_URL: baseUrl, API_RATE_LIMIT_PER_MINUTE: "20000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The server's own log goes to the protected run directory (it can name requests, never a secret).
  const serverLog = createWriteStream(path.join(runDir, "server.log"), { mode: 0o600 });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  server.on("exit", code => { serverDied = true; console.log(`server exited with code ${code} during the visit; see ${path.join(runDir, "server.log")}`); });
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    try { up = (await fetch(`${baseUrl}/healthz`)).ok; } catch { /* not up yet */ }
    if (!up) await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!up) { server.kill(); fail(`the server did not start; see ${path.join(runDir, "server.log")}`); }
}

// 3. one audit per role, its own session and its own output directory; the browser run gets no database URL and no secret
const auditEnv = role => Object.fromEntries(Object.entries({
  PATH: process.env.PATH, HOME: process.env.HOME,
  PLAYWRIGHT_MODULE_DIR: process.env.PLAYWRIGHT_MODULE_DIR, PLAYWRIGHT_CHROMIUM: process.env.PLAYWRIGHT_CHROMIUM,
  BASE_URL: baseUrl, TENANT_ID: manifest.tenantId, PROJECT_ID: manifest.projectId, SESSION_FILE: role.sessionFile,
  OUT_DIR: path.join(runDir, "out", role.code.toLowerCase().replaceAll("_", "-")), ROLE: role.code, SCREENSHOTS: process.env.SCREENSHOTS ?? "0",
}).filter(([, value]) => value !== undefined));
const visits = [];
const queue = [...roles];
const worker = async () => {
  while (queue.length) {
    const role = queue.shift();
    const env = auditEnv(role);
    mkdirSync(env.OUT_DIR, { recursive: true });
    const started = Date.now();
    const result = await run(["tests/ui/audit.mjs"], env);
    const reportPath = path.join(env.OUT_DIR, "audit.json");
    const visit = { role, seconds: Math.round((Date.now() - started) / 1000), exitCode: result.code, report: null, error: null };
    if (existsSync(reportPath)) visit.report = JSON.parse(readFileSync(reportPath, "utf8"));
    else visit.error = result.output.slice(-400);
    visits.push(visit);
    console.log(`${role.code}: ${visit.report ? `hard ${visit.report.summary.hard}, soft ${visit.report.summary.soft}` : "NO REPORT"} (${visit.seconds}s)`);
  }
};
try {
  await Promise.all(Array.from({ length: concurrency }, worker));
} finally {
  server?.kill();
}

// 4. the summary: per role, what it hit, and which routes the server refused it on with 403
const order = new Map(roles.map((role, index) => [role.code, index]));
visits.sort((a, b) => order.get(a.role.code) - order.get(b.role.code));
const summary = visits.map(({ role, report, error, seconds }) => {
  if (!report) return { role: role.code, name: role.name, failed: true, error };
  const refused = new Map();
  for (const page of report.pages) {
    if (!page.refusals?.length) continue;
    const entry = refused.get(page.route) ?? { route: page.route, procedures: new Set(), viewports: [], clearEverywhere: true };
    page.refusals.forEach(procedure => entry.procedures.add(procedure));
    entry.viewports.push(page.viewport);
    // a clear state is the no-permission sentence on a page that has finished loading (a sentence beside one control is not a page state)
    if (!page.noPermissionText || page.stillLoading) entry.clearEverywhere = false;
    refused.set(page.route, entry);
  }
  const refusedRoutes = [...refused.values()].map(entry => ({ route: entry.route, viewports: entry.viewports, procedures: [...entry.procedures], clearState: entry.clearEverywhere }));
  // every other failed response (static files, API 404s, 5xx), by status and path, so a console error can be traced to its request
  const failedResponses = [...new Set(report.pages.flatMap(page => page.badResponses ?? []).filter(item => !/^403 /.test(item)))].sort();
  const hardByKind = {};
  for (const finding of report.hard) hardByKind[finding.kind] = (hardByKind[finding.kind] ?? 0) + 1;
  const console403 = report.hard.filter(finding => finding.kind === "console-error" && JSON.stringify(finding.detail).includes("403")).map(finding => `${finding.route} (${finding.viewport})`);
  return {
    role: role.code, name: role.name, failed: false, seconds, hard: report.hard.length, soft: report.soft.length, hardByKind,
    refusedRoutes, refusedWithClearState: refusedRoutes.filter(r => r.clearState).length, refusedWithoutClearState: refusedRoutes.filter(r => !r.clearState).length,
    console403Routes: console403, failedResponses,
  };
});
writeFileSync(path.join(runDir, "summary.json"), JSON.stringify({ tenantId: manifest.tenantId, projectId: manifest.projectId, serverConnection: process.env.BASE_URL ? "external server (not started here)" : serverConnection, routes: visits[0]?.report?.routes ?? null, roles: summary }, null, 2));

const lines = [
  "| Role | Hard | Soft | Routes refused (403) | Refused, clear state | Refused, no clear state | Console 403 |",
  "|---|---|---|---|---|---|---|",
  ...summary.map(row => row.failed ? `| ${row.role} | visit failed | | | | | |` : `| ${row.role} | ${row.hard} | ${row.soft} | ${row.refusedRoutes.length} | ${row.refusedWithClearState} | ${row.refusedWithoutClearState} | ${row.console403Routes.length} |`),
];
for (const row of summary.filter(item => !item.failed && item.refusedRoutes.length)) {
  lines.push("", `**${row.role}** refused on:`, ...row.refusedRoutes.map(r => `- ${r.route} (${r.viewports.join(", ")}): ${r.procedures.join(", ")}${r.clearState ? "" : " [no clear state]"}`));
}
for (const row of summary.filter(item => !item.failed && item.failedResponses.length)) {
  lines.push("", `**${row.role}** other failed responses: ${row.failedResponses.join("; ")}`);
}
writeFileSync(path.join(runDir, "summary.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`summary: ${path.join(runDir, "summary.md")}`);
process.exit(summary.some(row => row.failed) || serverDied ? 1 : 0);
