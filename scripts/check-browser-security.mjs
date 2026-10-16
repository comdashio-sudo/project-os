// Opens every main screen in a real browser against a LOCAL production-mode server and reports (a) any Content-Security-Policy violation the
// browser raised, (b) the security headers of the main document, and (c) a control: a deliberate violation IS reported, so a silent run means
// "nothing was blocked" and not "the detector is broken". (HttpOnly on the session cookie is proven by server/auth.session.database.test.ts: the cookie
// here is injected by the script, so it says nothing about the server's own Set-Cookie.)
//
//   NODE_ENV=production node dist/index.js &                       # after pnpm build, on the test database
//   node --import tsx scripts/check-browser-security.mjs
//
// Same fixtures and rules as capture-screenshots.mjs: DATABASE_URL must name project_os_integration_test; Playwright is not a dependency.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema.ts";
import { sdk } from "../server/_core/sdk.ts";
import { getDb } from "../server/db.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const url = new URL(process.env.DATABASE_URL ?? "");
if (url.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

const email = process.env.SEED_DEMO_EMAIL ?? "demo.admin@example.test";
const openId = `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
const db = await getDb();
const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
if (!user) { console.error("No demo user: seed the demo tenant first."); process.exit(2); }
const connection = await mysql.createConnection(url.toString());
const [[company]] = await connection.query("SELECT id FROM companies ORDER BY createdAt LIMIT 1");
const [[project]] = await connection.query("SELECT id FROM projects WHERE tenantId = ? ORDER BY createdAt LIMIT 1", [company.id]);
await connection.end();
const t = company.id, p = project.id;
const PATHS = ["/login", "/", `/projects/${t}`, `/projects/${t}/${p}/controls`, `/projects/${t}/${p}/commercial`, `/projects/${t}/${p}/profitability`, `/projects/${t}/${p}/my-performance`, `/projects/${t}/${p}/pmc`, `/m/${t}/${p}`, `/payroll/${t}`, `/people/${t}`, `/executive/${t}`, `/pmo/${t}`, `/licensing/${t}`, `/billing/${t}`, `/support/${t}`, `/tenants/${t}/administration`, "/profile", "/evm"];

const token = await sdk.issueSession(openId, { name: user.name ?? "Demo Admin" });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
await context.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });

const report = { screens: [], violations: [], headers: null, control: null };
for (const path of PATHS) {
  const page = await context.newPage();
  const consoleCsp = [];
  page.on("console", message => { if (/Content Security Policy|Refused to/i.test(message.text())) consoleCsp.push(message.text().slice(0, 200)); });
  const response = await page.goto(`${BASE_URL}${path}?lang=ar`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(2500);
  const violations = await page.evaluate(() => window.__csp);
  if (path === "/") {
    const rendered0 = (await page.locator("body").innerText()).trim().length > 0;
    report.screens.push({ path, status: response.status(), rendered: rendered0 });
    for (const v of consoleCsp) report.violations.push(`/: ${v}`);
    for (const v of violations) report.violations.push(`/: ${v}`);
    report.headers = Object.fromEntries(["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"].map(name => [name, response.headers()[name] ? "present" : "MISSING"]));
    // The control: the page asks for something the policy forbids. The browser must refuse it and say so.
    await page.evaluate(() => { fetch("https://not-allowed.example.test/ping").catch(() => undefined); const s = document.createElement("script"); s.textContent = "window.__ranInline = true"; document.head.appendChild(s); });
    await page.waitForTimeout(500);
    const seen = await page.evaluate(() => ({ csp: window.__csp.slice(), ranInline: window.__ranInline === true }));
    report.control = { connectBlocked: seen.csp.some(v => v.startsWith("connect-src")), inlineScriptBlocked: seen.csp.some(v => v.startsWith("script-src")) && !seen.ranInline };
    await page.close();
    continue;
  }
  const rendered = (await page.locator("body").innerText()).trim().length > 0;
  report.screens.push({ path: path.replace(t, ":t").replace(p, ":p"), status: response.status(), rendered });
  for (const v of [...violations, ...consoleCsp]) report.violations.push(`${path.replace(t, ":t").replace(p, ":p")}: ${v}`);
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ screensOpened: report.screens.length, allRendered: report.screens.every(s => s.rendered && s.status === 200), headers: report.headers, control: report.control, cspViolations: [...new Set(report.violations)] }, null, 2));
process.exit(report.violations.length === 0 && report.control?.connectBlocked && report.control?.inlineScriptBlocked ? 0 : 1);
