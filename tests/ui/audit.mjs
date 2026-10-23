// UI audit: opens every route of the app in Arabic at desktop width (1280px) and at phone width (390px), with the synthetic demo
// administrator, and records what a person would hit: console errors, uncaught page errors, server failures (5xx and API 404), blank
// pages, horizontal page scroll, touch targets under 44px, and English text that is left on screen in Arabic mode.
//
// Hard failures (console error, uncaught error, 5xx, blank page, horizontal scroll on phone) make the run exit 1.
// Soft findings (touch targets, English text) are written to the report for the audit document and do not fail the run.
//
//   . env (BASE_URL, TENANT_ID, PROJECT_ID, SESSION_FILE, OUT_DIR)
//   node tests/ui/audit.mjs
//
// Playwright is not a project dependency (see scripts/e2e-roles.mjs): PLAYWRIGHT_MODULE_DIR (default /opt/node-tools/node_modules/) and
// PLAYWRIGHT_CHROMIUM (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome) locate it. Nothing here prints a secret.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/", "noop.js"));
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const TENANT_ID = process.env.TENANT_ID;
const PROJECT_ID = process.env.PROJECT_ID;
const SESSION_FILE = process.env.SESSION_FILE;
const OUT_DIR = process.env.OUT_DIR ?? "./ui-audit-out";
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
if (!TENANT_ID || !PROJECT_ID || !SESSION_FILE) throw new Error("TENANT_ID, PROJECT_ID and SESSION_FILE are required");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];

// The routes of the app (client/src/App.tsx), with the synthetic tenant and project in place of the parameters.
const APP_SOURCE = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const ROUTES = [...new Set([...APP_SOURCE.matchAll(/path="([^"]+)"/g)].map(match => match[1]))]
  .map(pattern => pattern.replace(":tenantId", TENANT_ID).replace(":projectId", PROJECT_ID));

// Words that are allowed to stay in English: product codes, units and standard acronyms the Arabic glossary keeps.
const ALLOWED_ENGLISH = new Set(["WBS", "EVM", "PV", "EV", "AC", "SPI", "CPI", "EAC", "ETC", "VAC", "TCPI", "FPAC", "PMC", "PMO", "XER", "XLSX", "CSV", "PDF", "Excel", "Dashio", "SAR", "USD", "API", "ID", "OK", "RFI", "NCR", "HSE", "BOQ", "GRN", "PO", "MRN", "EOS", "AI", "ZATCA", "Power", "BI", "Primavera", "Microsoft", "Google", "Gmail", "Supabase", "Vercel", "Resend", "Chrome", "Edge", "Safari", "Firefox",
  // Added with the English-leftovers pass (sanctioned by the owner's list): the product name in capitals, and an image file format named in upload hints.
  "DASHIO", "WEBP"]);

const findings = [];
const pages = [];

function note(kind, route, vp, detail) {
  findings.push({ kind, route, viewport: vp, detail });
}

async function auditPage(browser, route, vp, token) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "ar-SA", deviceScaleFactor: 1 });
  await context.addInitScript(() => { try { window.localStorage.setItem("project-os-language", "ar"); } catch { /* storage blocked */ } });
  await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const serverFailures = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240)); });
  page.on("pageerror", error => pageErrors.push(String(error.message ?? error).slice(0, 240)));
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.origin !== new URL(BASE_URL).origin) return;
    const status = response.status();
    if (status >= 500 || (status === 404 && url.pathname.startsWith("/api/"))) serverFailures.push(`${status} ${url.pathname}`);
  });
  const started = Date.now();
  try {
    await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const measured = await page.evaluate(vpMobile => {
      const visible = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none"; };
      // The language switcher names the OTHER language ("English" while the page is in Arabic). That is its name, not text the screen is written in,
      // so its label is hidden for the reading below and restored after it.
      const switchers = [...document.querySelectorAll("button")].filter(button => button.textContent.trim() === "English");
      const restore = switchers.map(button => [button, button.style.display]);
      switchers.forEach(button => { button.style.display = "none"; });
      const raw = document.body?.innerText ?? "";
      restore.forEach(([button, display]) => { button.style.display = display; });
      // An e-mail address is data (the synthetic *.example.test addresses are kept on purpose), and "PROJECT OS" is the product name.
      const text = raw.replace(/[\w.+-]+@[\w.-]+/g, " ").replace(/PROJECT OS/g, " ");
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const targets = [...document.querySelectorAll("button, a[href], [role='button'], input, select, textarea")].filter(visible);
      const small = vpMobile ? targets.filter(element => { const box = element.getBoundingClientRect(); return box.height < 44 || box.width < 44; }).length : 0;
      // Every distinct word of four or more Latin letters on the screen (not only the first forty), so a long page is read whole.
      const latin = [...new Set(text.match(/\b[A-Za-z]{4,}\b/g) ?? [])];
      return { textLength: raw.trim().length, overflow, targets: targets.length, small, latin, dir: document.documentElement.dir, lang: document.documentElement.lang };
    }, vp.mobile);
    const shot = path.join(OUT_DIR, `${route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "home"}-${vp.name}.jpg`);
    await page.screenshot({ path: shot, type: "jpeg", quality: 70, fullPage: false });
    pages.push({ route, viewport: vp.name, ms: Date.now() - started, dir: measured.dir, lang: measured.lang, targets: measured.targets, smallTargets: measured.small, latinCount: measured.latin.length, latinSample: measured.latin.slice(0, 40), screenshot: path.basename(shot) });
    if (consoleErrors.length) note("console-error", route, vp.name, consoleErrors.slice(0, 3));
    if (pageErrors.length) note("uncaught-error", route, vp.name, pageErrors.slice(0, 3));
    if (serverFailures.length) note("server-failure", route, vp.name, [...new Set(serverFailures)].slice(0, 5));
    if (measured.textLength < 30) note("blank-page", route, vp.name, `text length ${measured.textLength}`);
    if (vp.mobile && measured.overflow > 1) note("horizontal-scroll", route, vp.name, `overflow ${measured.overflow}px`);
    if (vp.mobile && measured.small > 0) note("small-touch-target", route, vp.name, `${measured.small} of ${measured.targets} controls under 44px`);
    if (measured.dir !== "rtl") note("not-rtl", route, vp.name, `dir=${measured.dir}`);
    const unexpected = measured.latin.filter(word => !ALLOWED_ENGLISH.has(word));
    if (unexpected.length) note("english-text", route, vp.name, unexpected.slice(0, 12));
  } catch (error) {
    note("navigation-failed", route, vp.name, String(error.message ?? error).slice(0, 240));
  } finally {
    await context.close();
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const token = readFileSync(SESSION_FILE, "utf8").trim();
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
try {
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) await auditPage(browser, route, vp, token);
  }
} finally {
  await browser.close();
}

const hard = findings.filter(f => ["console-error", "uncaught-error", "server-failure", "blank-page", "horizontal-scroll", "navigation-failed"].includes(f.kind));
const soft = findings.filter(f => !hard.includes(f));
const report = { routes: ROUTES.length, viewports: VIEWPORTS.map(v => v.name), pages, hard, soft, summary: { hard: hard.length, soft: soft.length } };
writeFileSync(path.join(OUT_DIR, "audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ routes: ROUTES.length, pages: pages.length, hard: hard.length, soft: soft.length, outDir: OUT_DIR }));
process.exit(hard.length > 0 ? 1 : 0);
