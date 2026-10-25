// Work order 19, phase A: screenshots of /design-preview for the owner, in a real browser against the production build.
//   . env: DATABASE_URL (owner, project_os_integration_test), SERVER_DATABASE_URL (project_os_app), JWT_SECRET; `pnpm build` first
//   node --import tsx scripts/design-preview-shots.mjs     OUT_DIR=docs/design/phase-a
// The platform owner is a SYNTHETIC account (*.example.test) in the TEST database only; OWNER_EMAIL names it, which is how the application gives the administrator role.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";
import { openIdForEmail } from "../server/_core/auth/emailCode.ts";
import { sdk } from "../server/_core/sdk.ts";

const PORT = Number(process.env.DESIGN_SHOTS_PORT ?? 3340);
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = process.env.OUT_DIR ?? "docs/design/phase-a";
const OWNER_EMAIL = "design.owner@mail.example.test";
if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
if (!process.env.SERVER_DATABASE_URL) { console.error("SERVER_DATABASE_URL (the restricted application role) is required."); process.exit(2); }
mkdirSync(OUT_DIR, { recursive: true });
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const openId = openIdForEmail(OWNER_EMAIL);
await pool.query("INSERT INTO users (open_id, name, email, role, login_method) VALUES ($1, 'Design Owner', $2, 'admin', 'email') ON CONFLICT (open_id) DO UPDATE SET role = 'admin'", [openId, OWNER_EMAIL]);

const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), DATABASE_URL: process.env.SERVER_DATABASE_URL, OWNER_EMAIL }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
process.on("exit", () => server.kill("SIGTERM"));
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 200)); if (i === 99) { console.error("server did not start:\n" + log.slice(-600)); process.exit(1); } }

const token = await sdk.issueSession(openId, { name: "Design Owner" });
const browser = await chromium.launch({ executablePath: CHROMIUM });
const report = [];
const open = async (viewport, lang) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  await context.addInitScript(value => { try { localStorage.setItem("project-os-language", value); } catch { /* blocked */ } }, lang);
  return { context, page: await context.newPage() };
};
const PHONE = { width: 390, height: 844 }; const DESKTOP = { width: 1280, height: 800 };
const settle = async page => { await page.waitForLoadState("networkidle"); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };

for (const [direction, modes] of [["a", ["light", "dark"]], ["b", ["light"]], ["c", ["light", "dark"]]]) {
  for (const mode of modes) {
    for (const screen of ["setup", "import"]) {
      for (const [label, viewport] of [["390", PHONE], ["1280", DESKTOP]]) {
        const { context, page } = await open(viewport, "ar");
        const errors = []; page.on("pageerror", e => errors.push(String(e)));
        await page.goto(`${BASE_URL}/design-preview/frame/${direction}/${screen}?lang=ar&mode=${mode}`, { waitUntil: "networkidle" });
        await settle(page);
        const facts = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, direction: document.documentElement.dataset.direction, sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, font: getComputedStyle(document.body).fontFamily.slice(0, 60) }));
        const file = path.join(OUT_DIR, `${direction}-${mode}-${screen}-${label}.png`);
        await page.screenshot({ path: file, fullPage: true });
        report.push({ file, ...facts, errors });
        await context.close();
      }
    }
  }
  const { context, page } = await open(DESKTOP, "ar");
  await page.goto(`${BASE_URL}/design-preview?d=${direction}`, { waitUntil: "networkidle" }); await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${direction}-preview-page-1280.png`), fullPage: true }); await context.close();
}
await browser.close(); await pool.end();
console.log(JSON.stringify(report, null, 1));
server.kill("SIGTERM");
