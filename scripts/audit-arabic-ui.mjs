// Opens every main screen in Arabic in a real browser against a LOCAL production-mode server and lists every piece of text a person would SEE
// (or hear from a screen reader: aria-label, placeholder, title, alt, button values) that still contains English words. Run it after any UI change:
//
//   NODE_ENV=production node dist/index.js &          # after pnpm build, on the test database with the demo tenant seeded
//   node --import tsx scripts/audit-arabic-ui.mjs [--json]
//
// NOTE: run scripts/run-integration-database-test.mjs BEFORE seeding the demo tenant, not after: integration.database.test.ts deletes the global permission rows
// (project.read, project.write, pmo.write, executive.read) and with them every tenant's grants of them, so a demo tenant seeded earlier answers 403 afterwards.
//
// Same fixtures and rules as capture-screenshots.mjs: DATABASE_URL must name project_os_integration_test; Playwright is not a dependency.
// Technical terms that are the same in Arabic construction practice (WBS, EVM, BOQ, SAR...) are allowed; everything else is reported with where it appeared.
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
const ALLOWED = new Set(["WBS", "EVM", "BOQ", "SAR", "PMO", "PMC", "NCR", "RFI", "HSE", "KPI", "GRN", "PO", "CPI", "SPI", "EAC", "BAC", "ETC", "VAC", "FPAC", "XLSX", "CSV", "XER", "PDF", "SKU", "ID", "OK", "AM", "PM", "SMS", "IBAN", "GOSI", "VAT", "PROJECT", "OS", "Dashio", "Master", "Plan", "P6", "Excel", "Resend", "TiDB", "R2", "GeoJSON", "QR", "URL", "API", "CRM", "ERP", "EN", "AR", "ITP", "PV", "EV", "AC", "SV", "CV", "TCPI", "CO", "MR", "WIR", "MIR", "SI", "DWG", "LLM", "ZATCA", "PNG", "JPG", "JPEG", "WEBP", "USD", "DASHIO", "English", "A3", "A", "alt", "PDF-A3", "PDF-A", "ACCOUNTANT"]);
// "English" is the name of the other language, shown in that language, as every language switch does.

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
const SCREENS = [["login", "/login", true], ["home", "/"], ["registry", `/projects/${t}`], ["controls", `/projects/${t}/${p}/controls`], ["commercial", `/projects/${t}/${p}/commercial`], ["profitability", `/projects/${t}/${p}/profitability`], ["my-performance", `/projects/${t}/${p}/my-performance`], ["pmc", `/projects/${t}/${p}/pmc`], ["field-entry", `/m/${t}/${p}`], ["payroll", `/payroll/${t}`], ["people", `/people/${t}`], ["executive", `/executive/${t}`], ["pmo", `/pmo/${t}`], ["licensing", `/licensing/${t}`], ["billing", `/billing/${t}`], ["support", `/support/${t}`], ["administration", `/tenants/${t}/administration`], ["profile", "/profile"], ["evm", "/evm"]];

const token = await sdk.issueSession(openId, { name: user.name ?? "Demo Admin" });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const found = new Map();
for (const [name, path, anonymous] of SCREENS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar-SA" });
  if (!anonymous) await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${path}?lang=ar`, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(2500);
  // open everything that is collapsed, so the text inside is audited too (tabs on the PMC screen are visited one by one below)
  for (let round = 0; round < 3; round++) { await page.evaluate(() => document.querySelectorAll("details").forEach(element => { element.open = true; })); await page.waitForTimeout(1200); }
  const tabs = await page.getByRole("tab").all();
  const texts = [];
  const collect = async () => texts.push(...await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode; const el = node.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || el.closest("[translate=no]")) continue;
      // a code shown on purpose in a left-to-right span (a role or permission code beside its Arabic name) is an identifier, not prose
      if (el.closest("[dir=ltr]") && /^[A-Za-z0-9_.:\- ]+$/.test(node.textContent.trim()) && /[._]/.test(node.textContent)) continue;
      const style = getComputedStyle(el); if (style.display === "none" || style.visibility === "hidden") continue;
      const text = node.textContent.replace(/\s+/g, " ").trim(); if (text) out.push({ kind: "text", text, tag: el.tagName.toLowerCase() });
    }
    for (const el of document.querySelectorAll("[aria-label],[placeholder],[title],img[alt],input[type=button],input[type=submit]")) for (const attr of ["aria-label", "placeholder", "title", "alt", "value"]) { const v = el.getAttribute(attr); if (v && v.trim()) out.push({ kind: attr, text: v.trim(), tag: el.tagName.toLowerCase() }); }
    return out;
  }));
  await collect();
  for (const tab of tabs.slice(0, 12)) { await tab.click({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(900); await collect(); }
  for (const item of texts) {
    // a database code shown on purpose (TENANT_OWNER, project.read) is an identifier, not prose
    if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(item.text) || /^[a-z]+(\.[a-z_]+)+$/.test(item.text)) continue;
    const words = item.text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? [];
    const offenders = words.filter(word => !ALLOWED.has(word) && !ALLOWED.has(word.toUpperCase()));
    if (!offenders.length) continue;
    const key = `${item.kind}|${item.text.slice(0, 140)}`;
    if (!found.has(key)) found.set(key, { screens: new Set(), kind: item.kind, text: item.text.slice(0, 140), words: [...new Set(offenders)] });
    found.get(key).screens.add(name);
  }
  await context.close();
}
await browser.close();
const rows = [...found.values()].map(row => ({ ...row, screens: [...row.screens] }));
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
else { for (const row of rows) console.log(`[${row.screens.join(",")}] (${row.kind}) ${row.text}   <= ${row.words.join(" ")}`); console.log(`\n${rows.length} text(s) with English words`); }
process.exit(0);
