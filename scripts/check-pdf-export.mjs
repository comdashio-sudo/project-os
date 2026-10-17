// Live proof of the PDF export (G-069): opens the PMC tab in a real browser, presses PDF, and checks the downloaded file is a real PDF
// (header, page count, size, an embedded image per page) and that the page showed no error. Optionally rasterises page 1 when pdftoppm exists
// so a person can look at the Arabic (PDF_PREVIEW=<dir>). Synthetic data only.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)   +   NODE_ENV=production node dist/index.js &
//   node --import tsx scripts/check-pdf-export.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { sdk } from "../server/_core/sdk.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const connection = await mysql.createConnection(dbUrl.toString());
const [[project]] = await connection.query("SELECT p.id, p.tenantId FROM projects p JOIN companies c ON c.id = p.tenantId WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC, p.createdAt LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [project.tenantId]);
await connection.end();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const results = [];
for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile-390", { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, locale: "ar-SA", acceptDownloads: true });
  await context.addCookies([{ name: "app_session_id", value: await sdk.issueSession(owner.openId, { name: owner.name }), url: BASE_URL }]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/projects/${project.tenantId}/${project.id}/controls?lang=ar#pmc`, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const button = page.getByRole("button", { name: "PDF", exact: true });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }).catch(() => null), button.click()]);
  const failed = await page.getByRole("alert").filter({ hasText: "PDF" }).count();
  if (!download) { results.push({ label, ok: false, why: "no download started", failedBanner: failed }); await context.close(); continue; }
  const dir = mkdtempSync(join(tmpdir(), "pdfcheck-"));
  const file = join(dir, "out.pdf"); await download.saveAs(file);
  const bytes = readFileSync(file); const text = bytes.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const images = (text.match(/\/Subtype\s*\/Image/g) ?? []).length;
  const named = /^project-os-pmc-[A-Za-z]+-\d{4}-\d{2}-\d{2}\.pdf$/.test(download.suggestedFilename());
  const entry = { label, ok: text.startsWith("%PDF-") && pages >= 1 && images >= pages && bytes.length > 5000 && failed === 0 && named, suggestedName: download.suggestedFilename(), bytes: bytes.length, pages, images, failedBanner: failed };
  if (process.env.PDF_PREVIEW) { try { execFileSync("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-jpeg", file, join(process.env.PDF_PREVIEW, `pdf-${label}`)]); entry.preview = true; } catch { entry.preview = "pdftoppm not available"; } }
  results.push(entry); await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
process.exit(results.every(item => item.ok) ? 0 : 1);
