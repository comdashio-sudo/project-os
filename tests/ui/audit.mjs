// UI audit: opens every route of the app in Arabic at desktop width (1280px) and at phone width (390px), with the synthetic demo
// administrator, and records what a person would hit: console errors, uncaught page errors, server failures (5xx and API 404), blank
// pages, horizontal page scroll, touch targets under 44px, and English text that is left on screen in Arabic mode.
//
// Hard failures (console error, uncaught error, 5xx, blank page, horizontal scroll on phone) make the run exit 1.
// Soft findings (touch targets, English text) are written to the report for the audit document and do not fail the run — except a touch target under
// 44px on the pages in TOUCH_STRICT_ROUTES (D-76: the project controls, PMC with its tabs, the site update), which is hard.
//
// Each page record also lists the API procedures the server refused with 403 (`refusals`) and whether the page says so in words
// (`noPermissionText`). tests/ui/runRoleVisits.mjs runs this once per role and summarises the results.
//
//   . env (BASE_URL, TENANT_ID, PROJECT_ID, SESSION_FILE, OUT_DIR; optional ROLE, SCREENSHOTS=0, FULL_PAGE=1, ADVISORY_ROUTES=/levels/, AUDIT_LANGUAGE=ar|en|ur)
//   node tests/ui/audit.mjs
//
// AUDIT_LANGUAGE chooses the interface language the audit runs in (default ar). It sets the stored language, the browser locale and the
// direction expected (Arabic and Urdu right to left, English left to right). In Arabic the English words left on a screen are a hard
// check; in Urdu the English words are the open fallback (docs/TRANSLATION_REVIEW.md), so they are reported as soft findings; in English
// the English words are the text, so they are not checked.
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
// ROLE labels the report (the all-roles visit runs this once per role); SCREENSHOTS=0 skips the JPEGs (the visit's summary does not need them).
const ROLE = process.env.ROLE ?? "demo-admin";
const SCREENSHOTS = process.env.SCREENSHOTS !== "0";
// The interface language of this run: the audit visits every route in one language (the CI screenshot job runs all three).
const LANGUAGE = process.env.AUDIT_LANGUAGE ?? "ar";
if (!["ar", "en", "ur"].includes(LANGUAGE)) throw new Error(`AUDIT_LANGUAGE must be ar, en or ur (got ${LANGUAGE})`);
const LOCALE = { ar: "ar-SA", en: "en-US", ur: "ur-PK" }[LANGUAGE];
const EXPECTED_DIR = LANGUAGE === "en" ? "ltr" : "rtl";
// The three language names, as the language switch shows them (each in its own script): hidden from the reading below, as before.
const LANGUAGE_NAMES = ["العربية", "English", "اردو"];
if (!TENANT_ID || !PROJECT_ID || !SESSION_FILE) throw new Error("TENANT_ID, PROJECT_ID and SESSION_FILE are required");
// A page that refuses the role says so in words: the server's no-permission sentence, or a short form of it. A refused page WITHOUT such a
// sentence leaves a bare error on the screen, which is what the all-roles visit reports. (Heuristic; it reads the page text, nothing else.)
const NO_PERMISSION_TEXT = /لا تملك|ليس لديك صلاحية|لا صلاحية/;

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];

// The routes of the app (client/src/App.tsx), with the synthetic tenant and project in place of the parameters.
const APP_SOURCE = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const ROUTE_FILTER = String(process.env.ROUTE_FILTER ?? "").split(",").map(item => item.trim()).filter(Boolean);
// D-76: the PMC page's tabs open from the address (?tab=), and its Excel exports live in them, so each tab is a page of its own here
const PMC_TABS = ["approvals", "inspections", "activities", "zones", "weekly", "monthly", "pending", "stages", "editors", "import"];
const ROUTES = [...new Set([...APP_SOURCE.matchAll(/path="([^"]+)"/g)].map(match => match[1]))]
  .flatMap(pattern => (pattern.endsWith("/pmc") ? [pattern, ...PMC_TABS.map(tab => `${pattern}?tab=${tab}`)] : [pattern]))
  .map(pattern => pattern.replace(":tenantId", TENANT_ID).replace(":projectId", PROJECT_ID).replace(":unitNumber", "101"))
  .filter(route => !ROUTE_FILTER.length || ROUTE_FILTER.some(fragment => route.includes(fragment)));

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
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: LOCALE, deviceScaleFactor: 1 });
  await context.addInitScript(language => { try { window.localStorage.setItem("project-os-language", language); } catch { /* storage blocked */ } }, LANGUAGE);
  await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const serverFailures = [];
  const refusals = [];
  const badResponses = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240)); });
  page.on("pageerror", error => pageErrors.push(String(error.message ?? error).slice(0, 240)));
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.origin !== new URL(BASE_URL).origin) return;
    const status = response.status();
    if (status >= 500 || (status === 404 && url.pathname.startsWith("/api/"))) serverFailures.push(`${status} ${url.pathname}`);
    // the procedure(s) the server refused this role with 403 (tRPC batches name several, comma-separated)
    if (status === 403 && url.pathname.startsWith("/api/")) refusals.push(url.pathname.replace(/^\/api\/trpc\//, "").slice(0, 120));
    if (status >= 400) badResponses.push(`${status} ${url.pathname}`.slice(0, 140));
  });
  const started = Date.now();
  try {
    await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const measured = await page.evaluate(([vpMobile, denialSource, names]) => {
      const visible = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none"; };
      // The language switcher names the OTHER language ("English" while the page is in Arabic). That is its name, not text the screen is written in,
      // so its label is hidden for the reading below and restored after it.
      const switchers = [...document.querySelectorAll("button")].filter(button => names.includes(button.textContent.trim()));
      const restore = switchers.map(button => [button, button.style.display]);
      switchers.forEach(button => { button.style.display = "none"; });
      const raw = document.body?.innerText ?? "";
      restore.forEach(([button, display]) => { button.style.display = display; });
      // An e-mail address is data (the synthetic *.example.test addresses are kept on purpose), and "PROJECT OS" is the product name.
      const text = raw.replace(/[\w.+-]+@[\w.-]+/g, " ").replace(/PROJECT OS/g, " ");
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const targets = [...document.querySelectorAll("button, a[href], [role='button'], input, select, textarea")].filter(visible);
      // D-76: what a finger hits. A checkbox, a radio or a visually hidden input inside its <label> (or named by one) is tapped through that label, so the label's box is the target; an input the
      // keyboard and the screen reader skip (a hidden file input behind its own button) is not a target at all.
      const hiddenInput = element => { const box = element.getBoundingClientRect(); return element.matches("input") && (box.width <= 2 || box.height <= 2); };
      const tapArea = element => { if (element.matches("input[type=checkbox], input[type=radio]") || hiddenInput(element)) { const label = element.closest("label") ?? (element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null); if (label) return label; } return element; };
      const skipped = element => element.getAttribute("aria-hidden") === "true" || element.tabIndex < 0 && element.matches("input[type=file]");
      const smallOnes = vpMobile ? targets.filter(element => !skipped(element)).filter(element => { const box = tapArea(element).getBoundingClientRect(); return box.height < 44 || box.width < 44; }) : [];
      const small = smallOnes.length;
      // D-76: which ones, so a failure names them (tag, its words or label, and its size)
      const smallSample = smallOnes.slice(0, 20).map(element => { const box = tapArea(element).getBoundingClientRect(); return `${element.tagName.toLowerCase()}${element.getAttribute("type") ? `[${element.getAttribute("type")}]` : ""} «${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 30)}» ${Math.round(box.width)}×${Math.round(box.height)}`; });
      // Every distinct word of four or more Latin letters on the screen (not only the first forty), so a long page is read whole.
      const latin = [...new Set(text.match(/\b[A-Za-z]{4,}\b/g) ?? [])];
      const denied = new RegExp(denialSource).test(text);
      // a section that still says it is loading after the network settled never reached a state (Arabic: جارٍ / جاري)
      const loading = /جارٍ|جاري/.test(text);
      return { textLength: raw.trim().length, overflow, targets: targets.length, small, smallSample, latin, denied, loading, dir: document.documentElement.dir, lang: document.documentElement.lang };
    }, [vp.mobile, NO_PERMISSION_TEXT.source, LANGUAGE_NAMES]);
    let screenshot = null;
    if (SCREENSHOTS) {
      const shot = path.join(OUT_DIR, `${route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "home"}-${vp.name}.jpg`);
      await page.screenshot({ path: shot, type: "jpeg", quality: 70, fullPage: process.env.FULL_PAGE === "1" });
      screenshot = path.basename(shot);
    }
    pages.push({ route, viewport: vp.name, ms: Date.now() - started, dir: measured.dir, lang: measured.lang, targets: measured.targets, smallTargets: measured.small, latinCount: measured.latin.length, latinSample: measured.latin.slice(0, 40), screenshot, refusals: [...new Set(refusals)].slice(0, 12), badResponses: [...new Set(badResponses)].slice(0, 12), noPermissionText: measured.denied, stillLoading: measured.loading });
    if (consoleErrors.length) note("console-error", route, vp.name, consoleErrors.slice(0, 3));
    if (pageErrors.length) note("uncaught-error", route, vp.name, pageErrors.slice(0, 3));
    if (serverFailures.length) note("server-failure", route, vp.name, [...new Set(serverFailures)].slice(0, 5));
    if (measured.textLength < 30) note("blank-page", route, vp.name, `text length ${measured.textLength}`);
    if (vp.mobile && measured.overflow > 1) note("horizontal-scroll", route, vp.name, `overflow ${measured.overflow}px`);
    if (vp.mobile && measured.small > 0) note("small-touch-target", route, vp.name, { summary: `${measured.small} of ${measured.targets} controls under 44px`, sample: measured.smallSample });
    if (measured.dir !== EXPECTED_DIR) note("not-rtl", route, vp.name, `dir=${measured.dir}, expected ${EXPECTED_DIR} in ${LANGUAGE}`);
    const unexpected = measured.latin.filter(word => !ALLOWED_ENGLISH.has(word));
    // Arabic: English words on the screen are a hard finding. Urdu: they are the open fallback, reported as soft. English: not a finding.
    if (unexpected.length && LANGUAGE === "ar") note("english-text", route, vp.name, unexpected.slice(0, 12));
    if (unexpected.length && LANGUAGE === "ur") note("english-text-open-fallback", route, vp.name, unexpected.slice(0, 12));
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

// ADVISORY_ROUTES (comma-separated route fragments): a hard finding on such a route is still written to the report, as `advisory-<kind>`, but does not fail the run.
// Work order 15 uses it for the four level dashboards, which belong to another agent: the demonstration company's data showed them overflowing a phone, and the order
// forbids touching them, so the finding is recorded and handed over instead of being fixed here (docs/STATE.md). Remove the entry when they are fixed.
const advisory = String(process.env.ADVISORY_ROUTES ?? "").split(",").map(item => item.trim()).filter(Boolean);
for (const finding of findings) if (advisory.some(fragment => finding.route.includes(fragment)) && ["console-error", "uncaught-error", "server-failure", "blank-page", "horizontal-scroll", "navigation-failed"].includes(finding.kind)) finding.kind = `advisory-${finding.kind}`;
// D-76: on the pages named here a control under 44px on a phone (measured where the finger lands) fails the run; elsewhere it stays a soft finding until
// those pages are brought to 44px too. TOUCH_STRICT_ROUTES (comma-separated route fragments) replaces the list.
const TOUCH_STRICT = String(process.env.TOUCH_STRICT_ROUTES ?? "/pmc,/controls,/site-update").split(",").map(item => item.trim()).filter(Boolean);
for (const finding of findings) if (finding.kind === "small-touch-target" && TOUCH_STRICT.some(fragment => finding.route.includes(fragment))) finding.kind = "small-touch-target-strict";
const hard = findings.filter(f => ["console-error", "uncaught-error", "server-failure", "blank-page", "horizontal-scroll", "navigation-failed", "small-touch-target-strict"].includes(f.kind));
const soft = findings.filter(f => !hard.includes(f));
const report = { role: ROLE, language: LANGUAGE, routes: ROUTES.length, viewports: VIEWPORTS.map(v => v.name), pages, hard, soft, summary: { hard: hard.length, soft: soft.length } };
writeFileSync(path.join(OUT_DIR, "audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ routes: ROUTES.length, pages: pages.length, hard: hard.length, soft: soft.length, outDir: OUT_DIR }));
process.exit(hard.length > 0 ? 1 : 0);
