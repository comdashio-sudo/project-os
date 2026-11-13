// D-33 (G-100): a truly COLD offline start of the field entry, in a real browser, through the shell worker (client/public/sw.js).
//   1. ONLINE: one visit to the field entry (/m/:tenant/:project); the worker takes control and keeps the page and its files.
//   2. OFFLINE (the whole browser, Playwright setOffline: no request reaches any server): reload → the field entry screen appears, saying it is offline.
//   3. NEGATIVE: the worker's cache holds the page and build files only — no /api/ answer, so no company data.
//   4. NEGATIVE: a browser that never visited, started offline, gets no page at all (it is the worker that makes the difference).
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)   +   pnpm build && NODE_ENV=production node dist/index.js &
//   node --import tsx scripts/check-offline-start.mjs        (synthetic demo data only: run after the demo company seed, never on production)
import { createRequire } from "node:module";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const connection = await mysql.createConnection(dbUrl.toString());
const [[project]] = await connection.query("SELECT p.id, p.tenantId FROM projects p JOIN companies c ON c.id = p.tenantId WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC, p.code LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [project.tenantId]);
await connection.end();

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
const FIELD = `${BASE_URL}/m/${project.tenantId}/${project.id}`;
const TITLE = "إدخال سريع من الموقع";
const session = await sdk.issueSession(owner.openId, { name: owner.name });
const contextFor = async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-SA", serviceWorkers: "allow" });
  await context.addInitScript(() => { try { localStorage.setItem("project-os-language", "ar"); } catch { /* storage blocked */ } });
  await context.addCookies([{ name: "app_session_id", value: session, url: BASE_URL }]);
  return context;
};

// 1. one online visit
const context = await contextFor();
const page = await context.newPage();
await page.goto(FIELD, { waitUntil: "load" });
await page.getByRole("heading", { name: TITLE }).waitFor({ timeout: 20_000 });
const controlled = await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 }).then(() => true).catch(() => false);
check("online visit: the shell worker controls the page", controlled);
await page.waitForTimeout(1500); // the worker keeps the files the first visit loaded (message from shellCache.ts)
const kept = await page.evaluate(async () => { const out = []; for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) out.push(new URL(request.url).pathname); return out; });
check("the page and its script and styles are kept", kept.includes("/") && kept.some(path => /^\/assets\/.+\.js$/.test(path)) && kept.some(path => /^\/assets\/.+\.css$/.test(path)), kept.length);

// 2. the network goes, the page is reloaded cold
await context.setOffline(true);
const reloaded = await page.reload({ waitUntil: "load" }).then(() => true).catch(error => String(error));
check("OFFLINE reload loads the page", reloaded === true, reloaded === true ? undefined : reloaded);
const shown = await page.getByRole("heading", { name: TITLE }).waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
check("OFFLINE: the field entry screen appears", shown);
const status = await page.getByTestId("queue-status").textContent().catch(() => null);
check("OFFLINE: the screen says it is offline", /لا اتصال/.test(status ?? ""), status);
await page.screenshot({ path: process.env.SHOT ?? "/tmp/d33-offline-field-entry.jpg", type: "jpeg", quality: 70 });

// 3. no company data in the worker's cache
check("NEGATIVE: no /api/ answer is kept", kept.every(path => !path.startsWith("/api")), kept.filter(path => path.startsWith("/api")));
await context.close();

// 4. a browser that never visited
const cold = await contextFor();
await cold.setOffline(true);
const coldPage = await cold.newPage();
const coldResult = await coldPage.goto(FIELD, { waitUntil: "load" }).then(() => "loaded").catch(() => "no page");
check("NEGATIVE: never visited + offline → no page (the worker is what makes the difference)", coldResult === "no page", coldResult);
await cold.close();

await browser.close();
console.log(JSON.stringify(checks, null, 1));
process.exit(checks.every(item => item.ok) ? 0 : 1);
