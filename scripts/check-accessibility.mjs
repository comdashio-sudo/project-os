// Automatic accessibility check (axe-core) over every screen, in Arabic, at desktop width and at 390px, with every collapsed section
// opened and every tab visited so what is inside is checked too. Reports each rule once per screen with a few offending elements,
// grouped by impact. Exit code 1 when any CRITICAL violation is found (serious ones are listed and counted, not failing).
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)
//   NODE_ENV=production node dist/index.js &              # after pnpm build, on the test database with a company that has a project
//   node --import tsx scripts/check-accessibility.mjs     [JSON=1]
//
// axe-core and Playwright are deliberately not project dependencies (see measure-mobile-entry.mjs): AXE_MODULE_DIR / PLAYWRIGHT_MODULE_DIR
// (default /opt/node-tools/node_modules/) locate them; AXE_FILE overrides the path of axe.min.js. The person is the owner of the newest company.
// Automatic checks catch roughly a third of real accessibility problems: a clean run is "no violation axe can detect", not "accessible".
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const modules = process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/";
const require = createRequire(modules);
const { chromium } = require("playwright");
const axeSource = readFileSync(process.env.AXE_FILE ?? `${process.env.AXE_MODULE_DIR ?? modules}axe-core/axe.min.js`, "utf8");

const connection = await mysql.createConnection(dbUrl.toString());
const [[project]] = await connection.query("SELECT p.id, p.tenantId FROM projects p JOIN companies c ON c.id = p.tenantId WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC, p.createdAt LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [project.tenantId]);
await connection.end();
const t = project.tenantId, p = project.id;
const SCREENS = [
  ["الدخول", "/login", true], ["الدخول: خطوة الرمز", "/login", true, "code"], ["الصفحة الرئيسية", "/"], ["سجل المشاريع", `/projects/${t}`], ["لوحة المشروع", `/projects/${t}/${p}/controls`],
  ["السلسلة التجارية", `/projects/${t}/${p}/commercial`], ["ربحية المشروع", `/projects/${t}/${p}/profitability`], ["مؤشراتي", `/projects/${t}/${p}/my-performance`],
  ["ضبط المشروع PMC", `/projects/${t}/${p}/pmc`], ["إدخال الجوال", `/m/${t}/${p}`], ["القيادة التنفيذية", `/executive/${t}`], ["PMO", `/pmo/${t}`],
  ["الموظفون", `/people/${t}`], ["الرواتب", `/payroll/${t}`], ["إدارة الشركة", `/tenants/${t}/administration`], ["التراخيص", `/licensing/${t}`],
  ["الفوترة", `/billing/${t}`], ["الدعم", `/support/${t}`], ["الملف الشخصي", "/profile"], ["حاسبة EVM", "/evm"], ["قبول الدعوة", "/invite/accept", true], ["صفحة غير موجودة", "/404", true],
];
const VIEWS = [{ key: "desktop", viewport: { width: 1280, height: 900 }, options: {} }, { key: "mobile", viewport: { width: 390, height: 844 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }];
const token = await sdk.issueSession(owner.openId, { name: owner.name });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const findings = new Map(); // key -> { impact, rule, help, screens:Set, nodes:[] , count }
let analysed = 0;
for (const view of VIEWS) {
  for (const [name, path, anonymous, step] of SCREENS) {
    const context = await browser.newContext({ viewport: view.viewport, ...view.options, locale: "ar-SA" });
    if (!anonymous) await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}${path}${path.includes("?") ? "&" : "?"}lang=ar`, { waitUntil: "load", timeout: 45_000 });
      await page.waitForTimeout(2200);
      if (step === "code") { await page.locator('input[autocomplete="email"]').fill("a11y.check@example.test"); await page.getByRole("button", { name: /إرسال/ }).click().catch(() => {}); await page.waitForTimeout(1500); }
      for (let round = 0; round < 3; round++) { await page.evaluate(() => document.querySelectorAll("details").forEach(element => { element.open = true; })); await page.waitForTimeout(900); }
      const tabs = await page.getByRole("tab").all();
      const passes = [null, ...tabs.slice(0, 12)];
      for (const tab of passes) {
        if (tab) { await tab.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(800); }
        await page.evaluate(axeSource);
        const result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } })).violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => ({ target: n.target.join(" "), html: n.html.slice(0, 140) })), count: v.nodes.length })));
        analysed++;
        for (const violation of result) {
          const key = `${violation.id}`;
          const entry = findings.get(key) ?? { impact: violation.impact, rule: violation.id, help: violation.help, screens: new Set(), nodes: [], count: 0 };
          entry.screens.add(`${name}/${view.key}`); entry.count += violation.count;
          if (entry.nodes.length < 4) entry.nodes.push(...violation.nodes.slice(0, 2).map(node => `${name}/${view.key}: ${node.target} — ${node.html}`));
          findings.set(key, entry);
        }
      }
    } catch (error) { console.log(`could not analyse ${name}/${view.key}: ${String(error.message).split("\n")[0]}`); }
    await context.close();
  }
}
await browser.close();
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const list = [...findings.values()].sort((a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9) || b.count - a.count);
const summary = { analysedPages: analysed, byImpact: Object.fromEntries(["critical", "serious", "moderate", "minor"].map(level => [level, list.filter(item => item.impact === level).length])) };
if (process.env.JSON) console.log(JSON.stringify({ summary, list: list.map(item => ({ ...item, screens: [...item.screens] })) }, null, 1));
else {
  console.log(JSON.stringify(summary));
  for (const item of list) console.log(`[${item.impact}] ${item.rule} — ${item.help} (${item.count} elements on ${item.screens.size} screens)\n    ${item.nodes.slice(0, 2).join("\n    ")}`);
}
process.exit(list.some(item => item.impact === "critical") ? 1 : 0);
