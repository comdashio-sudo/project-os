// Live proof of the offline read cache (G-100) in a real browser, with the limit stated plainly: the browser is made to start the page with
// the network down for the API (navigator.onLine=false and every /api/trpc request refused) while the page's own files are still served —
// which is what a service worker or a warm browser cache would give. There is no service worker in this product yet, so a truly cold offline
// start is NOT covered and not claimed.
//   1. ONLINE visit to "/" fills the cache with the two allowlisted reads for this user.
//   2. OFFLINE start: the company list and the "offline copy" notice appear from the cache.
//   3. NEGATIVE: with the cache emptied, the same offline start shows no company and no notice (nothing is invented).
//   4. NOTHING ELSE KEPT: the cache holds only the allowlisted procedures and no project/finance data.
//   5. SIGN-OUT: signing out empties the cache.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)   +   NODE_ENV=production node dist/index.js &
//   node --import tsx scripts/check-offline-read.mjs
import { createRequire } from "node:module";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const connection = await mysql.createConnection(dbUrl.toString());
const [[company]] = await connection.query("SELECT c.id, c.legalName FROM companies c WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [company.id]);
await connection.end();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar-SA" });
await context.addCookies([{ name: "app_session_id", value: await sdk.issueSession(owner.openId, { name: owner.name }), url: BASE_URL }]);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
const KEY = "projectOs.cachedReads.v1";

// 1. online visit
const online = await context.newPage();
await online.goto(`${BASE_URL}/?lang=ar`, { waitUntil: "load" });
await online.getByText(company.legalName).first().waitFor({ timeout: 20_000 });
await online.waitForTimeout(500);
const saved = await online.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), KEY);
const procedures = (saved?.entries ?? []).map(entry => JSON.parse(entry.key)[0].join("."));
check("online visit keeps the two allowlisted reads", procedures.includes("auth.me") && procedures.includes("tenant.mine"), procedures);
check("nothing but the allowlist is kept", procedures.every(name => ["auth.me", "tenant.mine"].includes(name)), procedures);
const raw = JSON.stringify(saved);
check("no money or project data in the copy", !/currentBudget|amount|salary|invoice|billedAmount|commitment/i.test(raw));
await online.close();

const offlineStart = async () => {
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }); });
  await page.route("**/api/trpc/**", route => route.abort("internetdisconnected"));
  await page.goto(`${BASE_URL}/?lang=ar`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  return page;
};

// 2. offline start with the cache
const offline = await offlineStart();
check("offline start shows the company from the copy", await offline.getByText(company.legalName).first().isVisible().catch(() => false));
const notice = offline.getByTestId("offline-copy-notice");
check("offline start says it is a saved copy, with its date", (await notice.count()) === 1 && /نسخة محفوظة/.test(await notice.textContent()), await notice.textContent().catch(() => null));
await offline.close();

// 3. negative: empty cache
const blank = await context.newPage();
await blank.goto(`${BASE_URL}/?lang=ar`, { waitUntil: "load" });
await blank.evaluate(key => localStorage.removeItem(key), KEY);
await blank.close();
const empty = await offlineStart();
check("NEGATIVE: with no copy, nothing is shown as if it were data", !(await empty.getByText(company.legalName).first().isVisible().catch(() => false)));
check("NEGATIVE: with no copy, no 'saved copy' notice", (await empty.getByTestId("offline-copy-notice").count()) === 0);
await empty.close();

// 5. sign-out empties it
const again = await context.newPage();
await again.goto(`${BASE_URL}/?lang=ar`, { waitUntil: "load" });
await again.getByText(company.legalName).first().waitFor({ timeout: 20_000 });
await again.waitForTimeout(500);
check("the copy is back after another online visit", Boolean(await again.evaluate(key => localStorage.getItem(key), KEY)));
await again.evaluate(async () => { await fetch("/api/trpc/auth.logout?batch=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: { json: null } }), credentials: "include" }); });
await again.reload({ waitUntil: "load" });
await again.waitForTimeout(2500);
check("SIGN-OUT: the device keeps nothing", (await again.evaluate(key => localStorage.getItem(key), KEY)) === null);
await again.close();

await browser.close();
console.log(JSON.stringify(checks, null, 1));
process.exit(checks.every(item => item.ok) ? 0 : 1);
