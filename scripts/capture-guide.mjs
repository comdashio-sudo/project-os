// Takes the user-guide pictures (item 12) from the REAL screens: one JPEG per guide step into client/public/guide/<section>-<n>.jpg.
// Synthetic data only (run it on the database scripts/capture-screenshots.mjs seeded, or any test database whose newest company has a project).
// The person is the owner of that company. Each step's `focus` (a heading or label on the screen) is scrolled to the top of the picture so
// different steps in the same lane show different parts of it.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET, BASE_URL)
//   NODE_ENV=production node dist/index.js &              # after pnpm build
//   node --import tsx scripts/capture-guide.mjs           [LIST=1 → print the headings found in each lane instead of taking pictures]
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { sdk } from "../server/_core/sdk.ts";
import { userGuide, guideImage, guideStepHref } from "../client/src/lib/userGuide.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public");
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const connection = await mysql.createConnection(dbUrl.toString());
const [[project]] = await connection.query("SELECT p.id, p.tenantId FROM projects p JOIN companies c ON c.id = p.tenantId WHERE c.slug NOT LIKE 'perf-volume-%' ORDER BY c.createdAt DESC, p.createdAt LIMIT 1");
const [[owner]] = await connection.query("SELECT u.openId, u.name FROM users u JOIN memberships m ON m.userId = u.id JOIN membership_roles mr ON mr.membershipId = m.id JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ? AND r.code = 'TENANT_OWNER' LIMIT 1", [project.tenantId]);
await connection.end();
const token = await sdk.issueSession(owner.openId, { name: owner.name });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
mkdirSync(join(ROOT, "guide"), { recursive: true });
const report = [];
for (const section of userGuide) {
  for (const [index, step] of section.steps.entries()) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, locale: "ar-SA" });
    await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
    const page = await context.newPage();
    const href = guideStepHref(step.screen, project.tenantId, project.id);
    try {
      const [hrefPath, hrefHash] = href.split("#"); // the query goes BEFORE the hash, or the page reads "#pmc?lang=ar" and opens nothing
      await page.goto(`${BASE_URL}${hrefPath}?lang=ar${hrefHash ? `#${hrefHash}` : ""}`, { waitUntil: "load", timeout: 45_000 });
      await page.waitForTimeout(2500);
      const lane = step.screen.split("#")[1];
      if (lane && lane !== "pmc") { await page.evaluate(id => { const el = document.getElementById(id); if (el instanceof HTMLDetailsElement) el.open = true; }, lane); await page.waitForTimeout(2500); }
      if (process.env.LIST) {
        const headings = await page.evaluate(id => { const root = id ? document.getElementById(id) : document.body; return [...(root?.querySelectorAll("h2, h3, legend, summary, [data-slot=card-title]") ?? [])].map(el => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70)).filter(Boolean).slice(0, 40); }, lane && lane !== "pmc" ? lane : null);
        report.push({ shot: `${section.id}-${index + 1}`, screen: step.screen, headings });
      } else {
        const found = await page.evaluate(({ id, focus }) => {
          const pick = root => [...(root?.querySelectorAll("h2, h3, legend, summary, label, [data-slot=card-title], p") ?? [])].find(el => (el.textContent ?? "").trim().startsWith(focus));
          const root = id && id !== "pmc" ? document.getElementById(id) : document.body;
          const target = focus ? (pick(root) ?? pick(document.body)) : root;
          if (!target) return false;
          if (focus) { const box = target.closest("section, article, [data-slot=card], form") ?? target; box.style.outline = "4px solid #f59e0b"; box.style.outlineOffset = "4px"; box.style.borderRadius = "16px"; }
          target.scrollIntoView({ block: "start" }); window.scrollBy(0, -16); return true;
        }, { id: lane ?? null, focus: step.focus ?? null });
        await page.waitForTimeout(500);
        const file = join(ROOT, guideImage(section.id, index + 1).slice(1));
        await page.screenshot({ path: file, type: "jpeg", quality: 78 });
        report.push({ shot: `${section.id}-${index + 1}`, screen: step.screen, focus: step.focus ?? null, focusFound: step.focus ? found : null });
      }
    } catch (error) { report.push({ shot: `${section.id}-${index + 1}`, error: String(error.message).split("\n")[0] }); }
    await context.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
process.exit(report.some(item => item.error || item.focusFound === false) ? 1 : 0);
