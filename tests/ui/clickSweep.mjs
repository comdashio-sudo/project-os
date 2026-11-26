// Q-68: a click sweep. tests/ui/audit.mjs opens every route and reads it; this one also PRESSES: on each route it presses, one at a time (a fresh page for each press), the
// buttons of the page's own content — the ones a person reaches for first — and fails on whatever breaks: the page's error screen («تعذّر عرض هذه الصفحة» with its R- code),
// an uncaught error, a console error, a 5xx or a missing API route. Menu, header and language buttons are skipped (the audit and the side-menu check cover them), and so is anything
// that deletes, removes, rolls back or signs out (the sweep runs on a synthetic database, but one press must never change what the next page shows).
//
//   . env (BASE_URL, TENANT_ID, PROJECT_ID, SESSION_FILE, OUT_DIR; optional ROUTE_FILTER=/pmc,/m/ , MAX_PRESSES=8, AUDIT_LANGUAGE=ar|en|ur, ROLE)
//   node tests/ui/clickSweep.mjs
//
// Playwright is not a project dependency (see tests/ui/audit.mjs): PLAYWRIGHT_MODULE_DIR and PLAYWRIGHT_CHROMIUM locate it. Nothing here prints a secret.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/", "noop.js"));
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const { TENANT_ID, PROJECT_ID, SESSION_FILE } = process.env;
const OUT_DIR = process.env.OUT_DIR ?? "./click-sweep-out";
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const LANGUAGE = process.env.AUDIT_LANGUAGE ?? "ar";
const ROLE = process.env.ROLE ?? "owner";
const MAX_PRESSES = Number(process.env.MAX_PRESSES ?? 8);
if (!["ar", "en", "ur"].includes(LANGUAGE)) throw new Error(`AUDIT_LANGUAGE must be ar, en or ur (got ${LANGUAGE})`);
if (!TENANT_ID || !PROJECT_ID || !SESSION_FILE) throw new Error("TENANT_ID, PROJECT_ID and SESSION_FILE are required");
const LOCALE = { ar: "ar-SA", en: "en-US", ur: "ur-PK" }[LANGUAGE];
const VIEWPORTS = [{ name: "desktop", width: 1280, height: 800, mobile: false }, { name: "phone", width: 390, height: 844, mobile: true }];
const ROUTE_FILTER = String(process.env.ROUTE_FILTER ?? "").split(",").map(item => item.trim()).filter(Boolean);
const PMC_TABS = ["approvals", "inspections", "activities", "zones", "weekly", "monthly", "pending", "stages", "editors", "import"];
const APP_SOURCE = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const ROUTES = [...new Set([...APP_SOURCE.matchAll(/path="([^"]+)"/g)].map(match => match[1]))]
  .filter(pattern => !/^\/(login|404|platform|design-preview|invite|companies)/.test(pattern))
  .flatMap(pattern => (pattern.endsWith("/pmc") ? [pattern, ...PMC_TABS.map(tab => `${pattern}?tab=${tab}`)] : [pattern]))
  .flatMap(pattern => (pattern.endsWith("/import/:kind") ? ["programme", "operational", "reference", "master-plan"].map(kind => pattern.replace(":kind", kind)) : [pattern]))
  .map(pattern => pattern.replace(":tenantId", TENANT_ID).replace(":projectId", PROJECT_ID).replace(":unitNumber", "101"))
  .filter(route => !ROUTE_FILTER.length || ROUTE_FILTER.some(fragment => route.includes(fragment)));

// what a press must never do: it deletes, removes, rolls back, signs out, or leaves the page for the platform's own pages
const NEVER = /delete|remove|rollback|discard|sign.?out|log.?out|erase|حذف|إزالة|تراجع|تراجُع|إلغاء|مسح|خروج|حذف|ہٹ|منسوخ|لاگ آؤٹ/i;
const FAILURE_SCREEN = /تعذّر عرض هذه الصفحة|This page could not be shown|یہ صفحہ دکھائی نہیں جا سکی|حدث خطأ غير متوقع|An unexpected error occurred/;

const token = readFileSync(SESSION_FILE, "utf8").trim();
const results = []; let pressed = 0;
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] });

async function openPage(route, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: LOCALE, deviceScaleFactor: 1 });
  await context.addInitScript(language => { try { window.localStorage.setItem("project-os-language", language); } catch { /* storage blocked */ } }, LANGUAGE);
  await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  const page = await context.newPage();
  const seen = { console: [], page: [], server: [] };
  page.on("console", message => { if (message.type() === "error") seen.console.push(message.text().slice(0, 200)); });
  page.on("pageerror", error => seen.page.push(String(error.message ?? error).slice(0, 200)));
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.origin !== new URL(BASE_URL).origin) return;
    if (response.status() >= 500 || (response.status() === 404 && url.pathname.startsWith("/api/"))) seen.server.push(`${response.status()} ${url.pathname}`.slice(0, 160));
  });
  await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  return { context, page, seen };
}

/** The labels of the page's own buttons, in order, without the ones the sweep never presses. */
const candidates = page => page.evaluate(never => {
  const re = new RegExp(never, "i");
  const roots = [...document.querySelectorAll("[data-page-content], main")].filter((element, index, all) => !all.some(other => other !== element && other.contains(element)));
  const seenLabels = new Set(); const out = [];
  for (const root of roots) for (const button of root.querySelectorAll("button:not([disabled]), [role='button']:not([aria-disabled='true'])")) {
    const box = button.getBoundingClientRect(); const style = getComputedStyle(button);
    if (box.width <= 0 || box.height <= 0 || style.visibility === "hidden" || style.display === "none") continue;
    if (button.closest("nav, header, aside, [role='navigation'], [role='dialog'], [data-sidebar]")) continue;
    const label = (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!label || re.test(label) || seenLabels.has(label)) continue;
    seenLabels.add(label); out.push(label);
  }
  return out;
}, NEVER.source);

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    let labels = [];
    try { const opened = await openPage(route, vp); labels = (await candidates(opened.page)).slice(0, MAX_PRESSES); await opened.context.close(); } catch (error) { results.push({ route, viewport: vp.name, press: null, problem: `open: ${String(error.message ?? error).slice(0, 160)}` }); continue; }
    for (const label of labels) {
      let opened;
      try {
        opened = await openPage(route, vp);
        const target = opened.page.locator("[data-page-content] button, [data-page-content] [role='button'], main button, main [role='button']").filter({ hasText: label }).first();
        const byAria = opened.page.locator(`[aria-label="${label.replace(/"/g, '\\"')}"]`).first();
        const chosen = (await target.count()) ? target : byAria;
        await chosen.click({ timeout: 4000, noWaitAfter: true }).then(() => { pressed += 1; }, () => undefined);
        await opened.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
        await opened.page.waitForTimeout(500);
        const text = await opened.page.evaluate(() => document.body?.innerText ?? "");
        const code = await opened.page.evaluate(() => document.querySelector("[data-failure-code]")?.textContent ?? null);
        const problems = [];
        if (FAILURE_SCREEN.test(text)) problems.push(`error screen${code ? ` ${code}` : " WITHOUT a code"}`);
        if (opened.seen.page.length) problems.push(`uncaught: ${opened.seen.page[0]}`);
        if (opened.seen.console.length) problems.push(`console: ${opened.seen.console[0]}`);
        if (opened.seen.server.length) problems.push(`server: ${opened.seen.server[0]}`);
        if (problems.length) results.push({ route, viewport: vp.name, press: label, problem: problems.join(" | ") });
      } catch (error) { results.push({ route, viewport: vp.name, press: label, problem: `press: ${String(error.message ?? error).slice(0, 160)}` }); }
      finally { await opened?.context.close().catch(() => undefined); }
    }
  }
}
await browser.close();
mkdirSync(OUT_DIR, { recursive: true });
const report = { role: ROLE, language: LANGUAGE, routes: ROUTES.length, pressed, problems: results.length, results };
writeFileSync(path.join(OUT_DIR, `click-sweep-${ROLE}-${LANGUAGE}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ role: ROLE, language: LANGUAGE, routes: ROUTES.length, pressed, problems: results.length }));
for (const item of results.slice(0, 40)) console.log(`PROBLEM ${item.viewport} ${item.route.replace(TENANT_ID, ":t").replace(PROJECT_ID, ":p")} [${item.press ?? "-"}] ${item.problem}`);
process.exit(results.length ? 1 : 0);
