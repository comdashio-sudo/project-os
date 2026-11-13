// Times the main screens against the synthetic volume of scripts/perf-seed.mjs (50 projects, 20,000 activities, 100,000 movements),
// in a real browser against the production build. "Settled" = from the moment navigation starts until the LAST API call of the screen
// has answered (the screen is not useful before that). Each screen is loaded three times; the table shows the cold first load and the
// median of the other two. The slowest API calls of the cold load are listed, because they are where a fix goes.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)
//   node scripts/migrate.mjs && node --import tsx scripts/perf-seed.mjs
//   pnpm build
//   node --import tsx scripts/perf-measure.mjs         [LIMIT_MS=2000] [HEAVY=<project id>]
//
// Exit code 1 when a screen's cold load is over LIMIT_MS (default 2000). Playwright is not a project dependency (see measure-mobile-entry.mjs).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { serverDatabaseEnv } from "./lib/serverEnv.mjs";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const PORT = Number(process.env.PORT ?? 3300);
const BASE_URL = `http://localhost:${PORT}`;
const LIMIT = Number(process.env.LIMIT_MS ?? 2000);
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

const connection = await mysql.createConnection(dbUrl.toString());
const [[company]] = await connection.query("SELECT id FROM companies WHERE slug LIKE 'perf-volume-%' ORDER BY createdAt DESC LIMIT 1");
if (!company) { console.error("No perf company: run scripts/perf-seed.mjs first."); process.exit(2); }
const tenantId = company.id;
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id WHERE m.tenantId = ? LIMIT 1", [tenantId]);
// the project with the most movements is the heaviest one a person can open
const [[heavy]] = await connection.query("SELECT projectId, COUNT(*) AS n FROM warehouse_inventory_transactions WHERE tenantId = ? GROUP BY projectId ORDER BY n DESC LIMIT 1", [tenantId]);
const projectId = process.env.HEAVY ?? heavy.projectId;
const [[sizes]] = await connection.query("SELECT (SELECT COUNT(*) FROM projects WHERE tenantId = ?) AS projects, (SELECT COUNT(*) FROM activities WHERE tenantId = ?) AS activities, (SELECT COUNT(*) FROM warehouse_inventory_transactions WHERE tenantId = ?) AS movements", [tenantId, tenantId, tenantId]);
await connection.end();

const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, ...serverDatabaseEnv(), NODE_ENV: "production", PORT: String(PORT), API_RATE_LIMIT_PER_MINUTE: "20000" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", c => { serverLog += c; }); server.stderr.on("data", c => { serverLog += c; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-500)); process.exit(1); }
}

const ALL_SCREENS = [
  { name: "الصفحة الرئيسية", path: "/" },
  { name: "سجل المشاريع (50 مشروعًا)", path: "/projects/:t" },
  { name: "لوحة المشروع الثقيل", path: "/projects/:t/:p/controls", open: true },
  { name: "ربحية المشروع", path: "/projects/:t/:p/profitability" },
  { name: "السلسلة التجارية", path: "/projects/:t/:p/commercial" },
  { name: "لوحة PMO", path: "/pmo/:t" },
  { name: "لوحة القيادة التنفيذية", path: "/executive/:t" },
  { name: "الموظفون", path: "/people/:t" },
  { name: "الرواتب", path: "/payroll/:t" },
  { name: "إدخال الجوال", path: "/m/:t/:p" },
  { name: "ضبط المشروع PMC", path: "/projects/:t/:p/pmc" },
];
// PERF_SCREENS=<path>,<path> measures only those screens (the weekly check on main, .github/workflows/perf-weekly.yml, measures three). A path that is not
// in the list stops the run (exit 2) instead of measuring nothing and passing.
const wanted = (process.env.PERF_SCREENS ?? "").split(",").map(item => item.trim()).filter(Boolean);
const unknown = wanted.filter(path => !ALL_SCREENS.some(screen => screen.path === path));
if (unknown.length) { console.error(`PERF_SCREENS names screens that are not measured here: ${unknown.join(", ")}`); server.kill(); process.exit(2); }
const SCREENS = wanted.length ? ALL_SCREENS.filter(screen => wanted.includes(screen.path)) : ALL_SCREENS;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "ar-SA" });
await context.addCookies([{ name: "app_session_id", value: await sdk.issueSession(owner.openId, { name: owner.name }), url: BASE_URL }]);
const page = await context.newPage();

let calls = [];
page.on("requestfinished", async request => {
  if (!request.url().includes("/api/trpc/")) return;
  const timing = request.timing();
  const response = await request.response();
  calls.push({ path: decodeURIComponent(new URL(request.url()).pathname.replace("/api/trpc/", "")).slice(0, 80), ms: Math.round(timing.responseEnd), end: Date.now(), status: response?.status() });
});
async function loadOnce(screen) {
  calls = [];
  const started = Date.now();
  await page.goto(`${BASE_URL}${screen.path.replace(":t", tenantId).replace(":p", projectId)}?lang=ar`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (screen.open) {
    for (let i = 0; i < await page.locator("summary").count(); i++) {
      const summary = page.locator("summary").nth(i);
      if (/^(تحديث|العقود|سجل|التخطيط|المتابعة)/.test((await summary.innerText()).trim())) await summary.click().catch(() => {});
    }
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  await new Promise(resolve => setTimeout(resolve, 150));
  const last = calls.reduce((latest, call) => Math.max(latest, call.end), started);
  return { settled: last - started, calls: [...calls] };
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
for (const screen of SCREENS) {
  const runs = [await loadOnce(screen), await loadOnce(screen), await loadOnce(screen)];
  const slowest = [...runs[0].calls].sort((a, b) => b.ms - a.ms).slice(0, 3).map(call => `${call.path} ${call.ms}ms`);
  const failed = runs[0].calls.filter(call => call.status && call.status >= 400).length;
  rows.push({ screen: screen.name, coldMs: runs[0].settled, warmMs: median(runs.slice(1).map(run => run.settled)), calls: runs[0].calls.length, failedCalls: failed, slowest });
}
await browser.close();
server.kill();
console.log(JSON.stringify({ volume: sizes, limitMs: LIMIT, rows }, null, 1));
const slow = rows.filter(row => row.coldMs > LIMIT);
console.log(slow.length ? `OVER ${LIMIT}ms: ${slow.map(row => `${row.screen} ${row.coldMs}ms`).join("; ")}` : `all ${rows.length} screens settle within ${LIMIT}ms (cold)`);
process.exit(slow.length ? 1 : 0);
