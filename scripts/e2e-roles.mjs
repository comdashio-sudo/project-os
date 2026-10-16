// Browser rehearsal for the twelve operating roles, in Arabic, at desktop width and at 390px.
//
// For every role: sign in THROUGH THE REAL SCREEN (e-mail, then the code the fake mail provider received), walk the role's
// core path, and confirm what the role must NOT do is refused (both on the screen and straight at the API with the role's own session).
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)
//   node scripts/migrate.mjs
//   pnpm build
//   node --import tsx scripts/e2e-roles.mjs            [ROLES=pm,site]  [EXPLORE=1]
//
// The script starts the production server itself (PORT, default 3200) with RESEND_API_URL pointing at a fake provider on 127.0.0.1,
// so no mail leaves the machine. Playwright is not a project dependency (see measure-mobile-entry.mjs): PLAYWRIGHT_MODULE_DIR
// (default /opt/node-tools/node_modules/) and PLAYWRIGHT_CHROMIUM (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome) locate it.
// Run it on a database that was migrated fresh (the live test runner deletes global permission rows that a new company re-creates, but
// leaves other companies' grants short). Nothing here prints a secret.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import mysql from "mysql2/promise";
import { seedDemoData } from "./lib/demoData.mjs";
import { ROLE_DEFINITIONS, createRoleFixture } from "./lib/roleFixture.mjs";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const PORT = Number(process.env.PORT ?? 3200);
const BASE_URL = `http://localhost:${PORT}`;
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const only = process.env.ROLES ? process.env.ROLES.split(",") : null;

// ---------------------------------------------------------------- fake mail provider (Resend's POST /emails, on loopback)
const inbox = new Map(); // address -> [text, ...]
const mailServer = createServer((request, response) => {
  let body = "";
  request.on("data", chunk => { body += chunk; });
  request.on("end", () => {
    try {
      const mail = JSON.parse(body);
      for (const to of mail.to ?? []) inbox.set(String(to).toLowerCase(), [...(inbox.get(String(to).toLowerCase()) ?? []), String(mail.text ?? "")]);
      response.writeHead(200, { "content-type": "application/json" }).end('{"id":"fake"}');
    } catch { response.writeHead(400).end(); }
  });
});
await new Promise(resolve => mailServer.listen(0, "127.0.0.1", resolve));
const mailPort = mailServer.address().port;
// The code in the NEXT message for this address: a message already in the inbox is an older code.
const mailCount = address => (inbox.get(address.toLowerCase()) ?? []).length;
const codeFor = async (address, alreadyHad) => {
  for (let i = 0; i < 150; i++) {
    const texts = inbox.get(address.toLowerCase()) ?? [];
    const match = texts.length > alreadyHad ? texts.at(-1).match(/\b(\d{6})\b/) : null;
    if (match) return match[1];
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`no sign-in code reached the fake provider for ${address}`);
};

// ---------------------------------------------------------------- the production server, pointed at the fake provider
const server = spawn(process.execPath, ["dist/index.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), RESEND_API_KEY: "e2e-fake-provider-key", EMAIL_FROM: "PROJECT OS <login@mail.example.test>", RESEND_API_URL: `http://127.0.0.1:${mailPort}/emails`, APP_BASE_URL: BASE_URL, API_RATE_LIMIT_PER_MINUTE: "20000" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", chunk => { serverLog += chunk; });
server.stderr.on("data", chunk => { serverLog += chunk; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-600)); process.exit(1); }
}

// ---------------------------------------------------------------- fixture
const fixture = await createRoleFixture();
const { tenantId, projectId, people, asOwner } = fixture;
const connection = await mysql.createConnection(dbUrl.toString());
await seedDemoData({ caller: asOwner, connection, tenantId, projectId, user: people.owner.row });
console.log(`fixture: tenant ${tenantId.slice(0, 8)} project ${projectId.slice(0, 8)} ${ROLE_DEFINITIONS.length} roles`);

// Negative control (E2E_NEGATIVE_CONTROL=1): hand the site engineer the accountant's role. The checks that say "a site engineer cannot enter costs"
// MUST now fail, which proves they are measuring the permission and not just passing.
if (process.env.E2E_NEGATIVE_CONTROL) {
  const [[membership]] = await connection.query("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, people.site.id]);
  await asOwner.tenant.assignMembershipRole({ tenantId, membershipId: membership.id, roleId: fixture.roleIds.ACCOUNTANT, scopeType: "company" });
  console.log("negative control: the site engineer now also holds the accountant role");
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const VIEWS = [
  { key: "desktop", viewport: { width: 1366, height: 900 }, options: {} },
  { key: "mobile", viewport: { width: 390, height: 844 }, options: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];

// ---------------------------------------------------------------- what each role may do (written by hand from the permission catalogue,
// NOT read back from the screens, so a screen that shows too much or too little is a failure and not a baseline)
const NAV = {
  projects: "سجل المشاريع", executive: "القيادة التنفيذية", pmo: "PMO", people: "الموظفون والقوى العاملة", payroll: "الرواتب وتكلفة العمالة",
  admin: "إدارة الشركة", controls: "ضوابط المشروع", mine: "مؤشراتي",
};
const EXPECTED_NAV = {
  owner: ["executive", "pmo", "projects", "people", "payroll", "admin", "controls", "mine"],
  executive: ["executive"],
  pmo: ["pmo"],
  pm: ["controls", "mine"],
  planner: ["controls", "mine"],
  costControl: ["projects", "controls", "mine"],
  procurement: ["projects", "controls", "mine"],
  warehouse: ["controls", "mine"],
  accountant: ["projects", "payroll", "controls", "mine"],
  finance: ["projects", "payroll", "controls", "mine"],
  hr: ["projects", "people", "payroll", "controls", "mine"],
  site: ["controls", "mine"],
};
// A page that holds data only some roles may read: where it is, the text that proves the data is on screen, and who may see it.
const GUARDED_PAGES = [
  { name: "سجل الموظفين", path: "/people/:t", marker: "Employee One", who: ["owner", "hr"] },
  { name: "الرواتب (هوية الموظف)", path: "/payroll/:t", marker: "Employee One", who: ["owner", "hr"] },
  { name: "لوحة القيادة التنفيذية", path: "/executive/:t", marker: "Role Rehearsal Villas", who: ["owner", "executive"] },
  { name: "لوحة PMO", path: "/pmo/:t", marker: "Role Rehearsal Villas", who: ["owner", "pmo"] },
  { name: "إدارة الشركة", path: "/tenants/:t/administration", marker: "Role Rehearsal Villas", who: ["owner"] },
  { name: "ربحية المشروع", path: "/projects/:t/:p/profitability", marker: "Foundations", who: ["owner", "pm", "costControl", "finance"] },
  { name: "إدخال الموقع: التقدم", path: "/m/:t/:p", marker: "Foundations", who: ["owner", "pm", "site"] },
  { name: "إدخال الموقع: المواد", path: "/m/:t/:p", marker: "CEM-42", who: ["warehouse"] },
];
// Who sees the "run payroll" action (the accountant runs it; HR and the finance manager do not)
const PAYROLL_RUN = ["owner", "accountant"];
// Governed writes, tried at the API with each role's own session. The permission each one needs, and who holds it.
const WHO_HAS = {
  "project.inventory.manage": ["owner", "warehouse"],
  "project.procurement.manage": ["owner", "procurement"],
  "project.budget.manage": ["owner", "pm", "costControl", "finance"],
  "project.cost.enter": ["owner", "pm", "costControl", "accountant", "finance"],
  "project.wbs.manage": ["owner", "pm", "planner"],
  "project.schedule.manage": ["owner", "pm", "planner"],
  "project.progress.manage": ["owner", "pm", "site"],
  "project.field.manage": ["owner", "pm", "site"],
};
const iso = new Date(Date.now() - 86400000).toISOString();
const WRITES = [
  { path: "warehouses.create", needs: "project.inventory.manage", input: n => ({ tenantId, projectId, code: `W${n}`, name: `Store ${n}` }) },
  { path: "procurement.createSupplier", needs: "project.procurement.manage", input: n => ({ tenantId, code: `S${n}`, legalName: `Supplier ${n} Co.` }) },
  { path: "budgets.create", needs: "project.budget.manage", input: n => ({ tenantId, projectId, costCode: `B${n}`, originalAmount: 100, currentAmount: 100 }) },
  { path: "costs.createActual", needs: "project.cost.enter", dates: ["incurredAt"], input: n => ({ tenantId, projectId, amount: 10 + Number(n.slice(-2)) / 100, incurredAt: iso }) },
  { path: "wbs.create", needs: "project.wbs.manage", input: n => ({ tenantId, projectId, code: `X${n}`, name: `Package ${n}` }) },
  { path: "activities.create", needs: "project.schedule.manage", dates: ["plannedStartAt", "plannedFinishAt"], input: n => ({ tenantId, projectId, code: `A${n}`, name: `Activity ${n}`, plannedStartAt: iso, plannedFinishAt: new Date(Date.now() + 86400000 * 5).toISOString() }) },
  { path: "progress.create", needs: "project.progress.manage", dates: ["reportedAt"], input: () => ({ tenantId, projectId, wbsItemId: fixture.wbsId, percentComplete: 45, reportedAt: iso }) },
  { path: "fieldReports.create", needs: "project.field.manage", dates: ["reportedAt"], input: n => ({ tenantId, projectId, reportNumber: `FR-${n}`, reportType: "daily", reportedAt: iso, shift: "day", workforceCount: 12, summary: "Daily site report for the rehearsal" }) },
];
const [[{ id: wbsId }]] = await connection.query("SELECT id FROM wbs_items WHERE projectId = ? AND code = '1' LIMIT 1", [projectId]);
fixture.wbsId = wbsId;

const results = [];
const check = (role, view, name, ok, detail = "") => { results.push({ role, view, name, ok: Boolean(ok), detail: String(detail).slice(0, 160) }); if (!ok) console.log(`  FAIL ${role}/${view}: ${name} ${detail}`); };

// The service asks for 30 s between two codes for one address (a rule of the product, not of this script).
const lastCodeRequest = new Map();
async function signIn(page, person) {
  const wait = 31_000 - (Date.now() - (lastCodeRequest.get(person.email) ?? 0));
  if (wait > 0 && lastCodeRequest.has(person.email)) await new Promise(resolve => setTimeout(resolve, wait));
  await page.goto(`${BASE_URL}/login?lang=ar`, { waitUntil: "load" });
  await page.locator("#login-email").fill(person.email);
  const alreadyHad = mailCount(person.email);
  await page.getByRole("button", { name: /إرسال/ }).click();
  lastCodeRequest.set(person.email, Date.now());
  const code = await codeFor(person.email, alreadyHad);
  await page.locator("#login-code").fill(code);
  await page.getByRole("button", { name: /تحقق|دخول/ }).click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}
const url = (template, extra = "") => `${BASE_URL}${template.replace(":t", tenantId).replace(":p", projectId)}${template.includes("?") ? "&" : "?"}lang=ar${extra}`;
async function visit(page, template, settle = 2200) { await page.goto(url(template), { waitUntil: "load" }); await page.waitForTimeout(settle); return page.locator("body").innerText(); }
async function trpcCall(context, path, input, dates = []) {
  const meta = dates.length ? { values: Object.fromEntries(dates.map(key => [key, ["Date"]])) } : undefined;
  const response = await context.request.post(`${BASE_URL}/api/trpc/${path}`, { data: { json: input, ...(meta ? { meta } : {}) }, headers: { "content-type": "application/json" } });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}
const costRows = async amount => Number((await connection.query("SELECT COUNT(*) AS n FROM cost_entries WHERE projectId = ? AND ABS(amount - ?) < 0.001", [projectId, amount]))[0][0].n);

for (const view of VIEWS) {
  for (const person of Object.values(people)) {
    if (only && !only.includes(person.key)) continue;
    if (process.env.VIEW && process.env.VIEW !== view.key) continue;
    const role = person.key; const v = view.key;
    // Behind the platform's proxy each person arrives from their own address and over https; the sign-in limit per address is the product's (20 requests / 10 min), so twelve people must not share one.
    const index = Object.keys(people).indexOf(role) + 1;
    const context = await browser.newContext({ viewport: view.viewport, ...view.options, locale: "ar-SA", extraHTTPHeaders: { "x-forwarded-proto": "https", "x-forwarded-for": `10.77.${view.key === "desktop" ? 1 : 2}.${index}` } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error.message).slice(0, 100)));

    // 1. sign in through the real screen
    try { await signIn(page, person); check(role, v, "الدخول برمز البريد عبر الشاشة", true); } catch (error) { check(role, v, "الدخول برمز البريد عبر الشاشة", false, error.message.split("\n")[0]); await context.close(); continue; }
    const cookie = (await context.cookies()).find(item => item.name === "app_session_id");
    check(role, v, "كوكي الجلسة HttpOnly وSecure وSameSite", cookie?.httpOnly && cookie?.secure && ["Lax", "Strict"].includes(cookie?.sameSite), JSON.stringify({ h: cookie?.httpOnly, s: cookie?.secure, ss: cookie?.sameSite }));
    await page.waitForTimeout(1200);

    try {
    // 2. Arabic, right-to-left, and no sideways scroll at this width
    const shell = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, overflow: document.documentElement.scrollWidth - window.innerWidth, arabic: /[؀-ۿ]/.test(document.body.innerText) }));
    check(role, v, "الصفحة الرئيسية بالعربية واتجاه RTL", shell.lang === "ar" && shell.dir === "rtl" && shell.arabic, JSON.stringify(shell));
    check(role, v, "لا تمرير أفقي في الصفحة الرئيسية", shell.overflow <= 1, `overflow ${shell.overflow}px`);
    const home = await page.locator("body").innerText();
    check(role, v, "تظهر شركته في الصفحة الرئيسية", home.includes("Role Rehearsal Co."));

    // 3. the modules this role is shown
    await visit(page, "/projects/:t/:p/controls", 2800);
    const shown = (await page.locator('[aria-label="الوحدات المصرح بها"] a').allInnerTexts()).map(text => text.trim());
    const want = EXPECTED_NAV[role].map(key => NAV[key]);
    check(role, v, "الوحدات الظاهرة له هي المصرح بها فقط", shown.length === new Set(shown).size && want.every(label => shown.includes(label)) && shown.every(label => want.includes(label)), `shown=${shown.join("،")} want=${want.join("،")}`);
    const controlsShell = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(role, v, "لا تمرير أفقي في لوحة المشروع", controlsShell <= 1, `overflow ${controlsShell}px`);

    // 4. pages that hold guarded data: visible to those who may, absent for everyone else
    const seen = new Map();
    for (const guarded of GUARDED_PAGES) {
      if (v === "mobile" && !guarded.path.startsWith("/m/") && !["/people/:t", "/payroll/:t"].includes(guarded.path)) continue;
      const key = guarded.path; const text = seen.get(key) ?? await visit(page, guarded.path); seen.set(key, text);
      const may = guarded.who.includes(role); const has = text.includes(guarded.marker);
      check(role, v, `${guarded.name}: ${may ? "يرى بياناتها" : "لا يرى بياناتها"}`, may === has, `marker "${guarded.marker}" ${has ? "present" : "absent"}`);
    }
    const payrollText = await visit(page, "/payroll/:t");
    const runOffered = await page.getByRole("button", { name: "إنشاء دورة رواتب" }).count() > 0;
    check(role, v, `الرواتب: ${PAYROLL_RUN.includes(role) ? "يُعرض له تشغيل الدورة" : "لا يُعرض له تشغيل الدورة"}`, PAYROLL_RUN.includes(role) === runOffered, payrollText.length ? "" : "empty page");

    if (v === "desktop") {
      // 5. one write through the screen: the actual-cost form. Those who hold project.cost.enter save a row; the others are refused in Arabic and no row appears.
      const amount = 500 + Object.keys(people).indexOf(role) + 0.37; // unique per role so a row can be traced to its author
      const mayCost = WHO_HAS["project.cost.enter"].includes(role);
      await visit(page, "/projects/:t/:p/controls", 2500);
      const section = page.locator("summary").filter({ hasText: "تحديث التخطيط والتكلفة" }).first();
      if (await section.count()) await section.click();
      await page.waitForTimeout(800);
      const submit = page.getByRole("button", { name: "تسجيل تكلفة فعلية" });
      if (await submit.count()) {
        await page.locator("form").filter({ has: submit }).locator('input[type="number"]').fill(String(amount));
        await submit.click();
        await page.waitForTimeout(2500);
        const banner = (await page.locator("p.bg-red-50").allInnerTexts()).join(" ");
        const rows = await costRows(amount);
        if (mayCost) check(role, v, "تسجيل تكلفة من الشاشة ينجح ويُحفظ صفّه", rows === 1 && !banner, `rows=${rows} banner="${banner.slice(0, 60)}"`);
        else check(role, v, "تسجيل تكلفة من الشاشة يُرفض بالعربية ولا يُحفظ صف", rows === 0 && /لا تملك الصلاحية/.test(banner), `rows=${rows} banner="${banner.slice(0, 60)}"`);
      } else check(role, v, "تسجيل تكلفة: النموذج غير معروض له", !mayCost, mayCost ? "form missing for a role that may" : "form not offered");

      // 6. the same writes at the API, with this role's own session: allowed exactly where the permission is held, refused (403, in Arabic) elsewhere
      const stamp = `${person.key}${fixture.run}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) + String(Math.floor(Math.random() * 90 + 10));
      for (const write of WRITES) {
        const may = WHO_HAS[write.needs].includes(role);
        const answer = await trpcCall(context, write.path, write.input(stamp), write.dates);
        const message = answer.body?.error?.json?.data?.projectError?.messages?.ar ?? "";
        if (may) check(role, v, `API ${write.path}: مسموح له`, answer.status === 200, `status ${answer.status} ${JSON.stringify(answer.body?.error?.json?.message ?? "").slice(0, 60)}`);
        else check(role, v, `API ${write.path}: مرفوض بـ403 ورسالة عربية`, answer.status === 403 && /لا تملك الصلاحية/.test(message), `status ${answer.status} "${message.slice(0, 50)}"`);
      }
    } else if (["owner", "pm", "site"].includes(role)) {
      // 7. the phone entry sheet: progress saved from the screen
      await visit(page, "/m/:t/:p", 2500);
      const countProgress = async () => Number((await connection.query("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ? AND progressPercent = 50", [projectId]))[0][0].n);
      const before = await countProgress();
      const row = page.getByRole("button", { name: /Excavation/ }).first();
      if (await row.count()) {
        await row.click();
        await page.getByRole("button", { name: "50%", exact: true }).click();
        await page.getByRole("button", { name: "حفظ" }).first().click();
        await page.waitForTimeout(2500);
        const status = await page.getByRole("status").first().innerText().catch(() => "");
        check(role, v, "إدخال الجوال: حفظ تقدم بند", (await countProgress()) === before + 1 && /50%/.test(status), `rows ${before}→${await countProgress()} "${status.slice(0, 50)}"`);
      } else check(role, v, "إدخال الجوال: حفظ تقدم بند", false, "row not found");
    }

    // 8. signing out ends the session on the SERVER: the cookie a thief kept no longer works
    if (v === "mobile") {
      const token = cookie?.value;
      await visit(page, "/", 1500);
      const before = await fetch(`${BASE_URL}/api/trpc/auth.me`, { headers: { cookie: `app_session_id=${token}` } }).then(r => r.status);
      await page.getByRole("button", { name: /تسجيل الخروج/ }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      const after = await fetch(`${BASE_URL}/api/trpc/auth.me`, { headers: { cookie: `app_session_id=${token}` } }).then(async r => ({ status: r.status, text: await r.text() }));
      const meAfter = /"result"/.test(after.text) && !/"json":null/.test(after.text);
      check(role, v, "الخروج يبطل الجلسة في الخادم", before === 200 && !meAfter, `before ${before}, after ${after.status} ${after.text.slice(0, 60)}`);
    }
    } catch (error) { check(role, v, "السيناريو انتهى دون استثناء", false, String(error.message).split("\n")[0]); }
    check(role, v, "لا أخطاء جافاسكربت في الصفحة", errors.length === 0, errors.join(" | "));
    await context.close();
    console.log(`${role}/${v}: ${results.filter(item => item.role === role && item.view === v && item.ok).length}/${results.filter(item => item.role === role && item.view === v).length}`);
  }
}
await browser.close();
await connection.end();
server.kill();
mailServer.close();
const failed = results.filter(item => !item.ok);
console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed: failed.map(item => `${item.role}/${item.view}: ${item.name} — ${item.detail}`) }, null, 1));
process.exit(failed.length ? 1 : 0);
