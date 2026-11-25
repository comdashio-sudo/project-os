// Q-57 (3): the print preview of the main dashboards, in a real browser, against the real server and the demonstration company (synthetic data).
// For each page it switches the browser to print media, checks what the sheet must and must not hold (the frame, the buttons and the menu are gone; the printed
// header names the company, the project, the day and the person; nothing runs wider than the sheet) and writes the A4 landscape PDF (page.pdf). It also
// presses «Export tables» on a page that has tables and opens the file it downloads.
//
//   . env (DATABASE_URL = the owner on project_os_integration_test, SERVER_DATABASE_URL = project_os_app on the same, JWT_SECRET)   pnpm build
//   node --import tsx scripts/e2e-print-preview.mjs            OUT_DIR=./print-preview-out
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";
import { sdk } from "../server/_core/sdk.ts";
import { seedDemoCompany, deleteDemoCompany } from "./demo/demoCompany.ts";

const PORT = Number(process.env.PRINT_PREVIEW_PORT ?? 3331);
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = process.env.OUT_DIR ?? "./print-preview-out";
const LANGUAGE = process.env.AUDIT_LANGUAGE ?? "ar";
const ownerUrl = new URL(process.env.DATABASE_URL ?? "");
if (ownerUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
if (!process.env.SERVER_DATABASE_URL) { console.error("SERVER_DATABASE_URL (the restricted application role) is required."); process.exit(2); }
mkdirSync(OUT_DIR, { recursive: true });
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); };

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await deleteDemoCompany({ ownerEmail: "demo.admin@example.test" }).catch(() => undefined);
const built = await seedDemoCompany({ ownerEmail: "demo.admin@example.test" });
const { tenantId, projectId } = built;
const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), DATABASE_URL: process.env.SERVER_DATABASE_URL }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", chunk => { serverLog += chunk; }); server.stderr.on("data", chunk => { serverLog += chunk; });
process.on("exit", () => server.kill("SIGTERM"));
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-600)); process.exit(1); }
}
const owner = (await pool.query("SELECT id, open_id, name FROM users WHERE email = $1", ["demo.admin@example.test"])).rows[0];
const token = await sdk.issueSession(owner.open_id, { name: owner.name });

const project = `/projects/${tenantId}/${projectId}`;
const PAGES = [
  ["project-board", `${project}/controls`], ["operations", `/operations/${tenantId}`], ["pmo", `/pmo/${tenantId}`], ["executive", `/executive/${tenantId}`],
  ["weekly-report", `${project}/weekly-report`], ["monthly-report", `${project}/monthly-report`], ["live-schedule", `${project}/schedule`], ["risks", `${project}/risks`],
  ["safety", `${project}/safety`], ["quality", `${project}/quality`], ["stalled-units", `${project}/stalled`],
];

const browser = await chromium.launch({ executablePath: CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: LANGUAGE === "en" ? "en-US" : "ar-SA", acceptDownloads: true });
await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
await context.addInitScript(language => { try { window.localStorage.setItem("project-os-language", language); } catch { /* storage may be blocked */ } }, LANGUAGE);
const page = await context.newPage(); page.setDefaultTimeout(30_000);
const errors = []; page.on("pageerror", error => errors.push(String(error.message).slice(0, 160)));

for (const [name, url] of PAGES) {
  await page.emulateMedia({ media: "screen" });
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" }).catch(() => undefined);
  await page.waitForSelector("[data-page-content]", { timeout: 20_000 }).catch(() => undefined);
  const framed = (await page.locator("[data-page-content]").count()) > 0;
  const tableCount = framed ? await page.locator("[data-page-content] table").count() : 0;
  check(`${name}: opens inside the frame (${tableCount} tables drawn)`, framed);
  if (!framed) continue;
  check(`${name}: the page has its Print and Export buttons`, (await page.locator("[data-page-actions] button").count()) === 2);
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 1123, height: 794 }); // A4 landscape at 96 dpi
  const facts = await page.evaluate(() => {
    const shown = selector => Array.from(document.querySelectorAll(selector)).filter(element => getComputedStyle(element).display !== "none" && element.getClientRects().length > 0);
    const header = document.querySelector("[data-print-header]");
    return {
      menu: shown("aside[data-app-sidebar]").length, topBar: shown("body header.sticky").length, actions: shown("[data-page-actions]").length, buttons: shown("button").length,
      printHeader: header ? getComputedStyle(header).display !== "none" : false, printHeaderText: header?.textContent ?? "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  check(`${name}: print drops the menu, the top bar, the page buttons and every button`, facts.menu === 0 && facts.topBar === 0 && facts.actions === 0 && facts.buttons === 0, facts);
  check(`${name}: print shows the header (company, day, person)`, facts.printHeader && facts.printHeaderText.includes(owner.name) && /\d{4}-\d{2}-\d{2}/.test(facts.printHeaderText), facts.printHeaderText.slice(0, 160));
  check(`${name}: nothing is wider than the sheet`, facts.overflow <= 2, facts.overflow);
  const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
  const file = path.join(OUT_DIR, `${LANGUAGE}-${name}.pdf`); writeFileSync(file, pdf);
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  check(`${name}: A4 landscape PDF written (${pages} sheets, ${statSync(file).size} bytes)`, pages >= 1 && pdf.subarray(0, 5).toString() === "%PDF-");
}

// the Excel export of a page that has tables: the file downloads, opens, and holds a sheet per table
await page.emulateMedia({ media: "screen" });
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE_URL}/pmo/${tenantId}`, { waitUntil: "networkidle" }).catch(() => undefined);
await page.waitForSelector("[data-page-actions]", { timeout: 20_000 });
const tables = await page.locator("[data-page-content] table").count();
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }).catch(() => null), page.locator("[data-page-actions] button").first().click()]);
if (tables === 0) check("pmo: no tables, so the page says so and downloads nothing", download === null && (await page.getByRole("status").count()) > 0);
else {
  check("pmo: Export tables downloads an .xlsx", download !== null && download.suggestedFilename().endsWith(".xlsx"), download?.suggestedFilename());
  if (download) {
    const file = path.join(OUT_DIR, download.suggestedFilename()); await download.saveAs(file);
    const { default: ExcelJS } = await import("exceljs"); const book = new ExcelJS.Workbook(); await book.xlsx.readFile(file);
    check(`pmo: the workbook opens and has ${tables} table(s) as sheets`, book.worksheets.length === tables, { sheets: book.worksheets.map(sheet => sheet.name) });
  }
}
check("no uncaught page errors", errors.length === 0, errors.slice(0, 3));
await browser.close();
await deleteDemoCompany({ ownerEmail: "demo.admin@example.test" }).catch(() => undefined);
await pool.end();
writeFileSync(path.join(OUT_DIR, `${LANGUAGE}-summary.json`), JSON.stringify(checks, null, 2));
const failed = checks.filter(item => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
