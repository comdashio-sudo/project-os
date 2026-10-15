// Measures the two phone entry flows at 390px in a real browser against a real
// server and a real (local, non-production) database, and checks the rows landed.
//
//   node --import tsx scripts/measure-mobile-entry.mjs
//
// Needs: a server on BASE_URL (default http://localhost:3100) started with the
// same DATABASE_URL and JWT_SECRET as this script; the demo tenant from
// `pnpm db:seed-demo`; and Playwright with a Chromium build, located by
// PLAYWRIGHT_MODULE_DIR (default /opt/node-tools/node_modules/) and
// PLAYWRIGHT_CHROMIUM (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
// Playwright is deliberately not a project dependency.
//
// "Seconds" below are automation time on this machine: they bound the app's own
// latency, not a human's. `taps` and `typedFields` are the human-relevant
// numbers; the estimate multiplies them by the stated per-action costs.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { companies, users } from "../drizzle/schema.ts";
import { sdk } from "../server/_core/sdk.ts";
import { getDb } from "../server/db.ts";
import { appRouter } from "../server/routers.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const TAP_SECONDS = 1.5;
const TYPED_FIELD_SECONDS = 4;
const TARGETS = { progress: 15, issue: 20 };

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.pathname !== "/project_os_integration_test") {
  console.error("Refusing to run: DATABASE_URL must name project_os_integration_test.");
  process.exit(2);
}
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

// ---------------------------------------------------------------- fixtures
const db = await getDb();
const [company] = await db.select().from(companies).limit(1);
if (!company) { console.error("No demo tenant: run pnpm db:seed-demo first."); process.exit(2); }
const email = process.env.SEED_DEMO_EMAIL ?? "demo.admin@example.test";
const openId = `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
const connection = await mysql.createConnection(url.toString());
const [[project]] = await connection.query("SELECT id FROM projects WHERE tenantId = ? ORDER BY createdAt LIMIT 1", [company.id]);
const tenantId = company.id;
const projectId = project.id;
const caller = appRouter.createCaller({ user, req: { protocol: "https", headers: {} }, res: {} });
const suffix = Date.now().toString(36).toUpperCase();
const warehouse = await caller.warehouses.create({ tenantId, projectId, code: `WH-${suffix}`, name: "Measure store" });
const material = await caller.materials.createMaster({ tenantId, code: `M-${suffix}`, description: "Measure cement", unitOfMeasure: "bag", category: "concrete" });
const [[wbs]] = await connection.query("SELECT id FROM wbs_items WHERE projectId = ? ORDER BY code LIMIT 1", [projectId]);
await caller.warehouses.recordInventory({ tenantId, projectId, warehouseId: warehouse.id, materialId: material.id, transactionType: "receipt", quantityDelta: 500, occurredAt: new Date() });
// One earlier issue, so the screen can default the unit cost the way a real second day does.
await caller.warehouses.issueToWork({ tenantId, projectId, warehouseId: warehouse.id, materialId: material.id, wbsItemId: wbs.id, issuedQuantity: 1, unitCost: 18.5, issuedAt: new Date() });

// ---------------------------------------------------------------- browser
const token = await sdk.createSessionToken(openId, { name: user.name ?? "Demo Admin" });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const results = [];

async function measure(name, steps) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.addCookies([{ name: "app_session_id", value: token, url: BASE_URL }]);
  const page = await context.newPage();
  let taps = 0;
  let typedFields = 0;
  const actions = {
    tap: async locator => { const box = await locator.boundingBox(); if (!box || box.height < 44 || box.width < 44) throw new Error(`touch target below 44px: ${JSON.stringify(box)}`); taps += 1; await locator.tap(); },
    type: async (locator, value) => { typedFields += 1; await locator.fill(value); },
  };
  const started = Date.now();
  await page.goto(`${BASE_URL}/m/${tenantId}/${projectId}`, { waitUntil: "domcontentloaded" });
  await steps(page, actions);
  await page.getByRole("status").filter({ hasText: /Saved|تم الحفظ/ }).waitFor({ timeout: 10_000 });
  const seconds = (Date.now() - started) / 1000;
  const estimatedHuman = taps * TAP_SECONDS + typedFields * TYPED_FIELD_SECONDS;
  results.push({ flow: name, taps, typedFields, automationSeconds: Number(seconds.toFixed(2)), estimatedHumanSeconds: Number(estimatedHuman.toFixed(1)), targetSeconds: TARGETS[name], withinTarget: estimatedHuman <= TARGETS[name] && seconds <= TARGETS[name] });
  await context.close();
}

const [[progressBefore]] = await connection.query("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ?", [projectId]);
const [[issuesBefore]] = await connection.query("SELECT COUNT(*) AS n FROM material_issues WHERE projectId = ?", [projectId]);

await measure("progress", async (page, a) => {
  await a.tap(page.getByRole("button", { name: /^1 · / }).first());
  await a.tap(page.getByRole("button", { name: "75%" }));
  await a.tap(page.getByRole("button", { name: /^Save$/ }));
});
await measure("issue", async (page, a) => {
  await a.tap(page.getByRole("tab", { name: "Issue material" }));
  await a.tap(page.getByRole("button", { name: new RegExp(`^M-${suffix}`) }));
  await a.type(page.getByLabel("Quantity"), "10");
  await a.tap(page.getByRole("button", { name: /^Save$/ }));
});

const [[progressAfter]] = await connection.query("SELECT COUNT(*) AS n FROM progress_entries WHERE projectId = ?", [projectId]);
const [[issuesAfter]] = await connection.query("SELECT COUNT(*) AS n FROM material_issues WHERE projectId = ?", [projectId]);
const [[issued]] = await connection.query("SELECT issuedQuantity, unitCost FROM material_issues WHERE projectId = ? AND materialId = ? ORDER BY issuedAt DESC, createdAt DESC LIMIT 1", [projectId, material.id]);
await browser.close();
await connection.end();

const landed = { progressRows: Number(progressAfter.n) - Number(progressBefore.n), issueRows: Number(issuesAfter.n) - Number(issuesBefore.n), lastIssue: { quantity: Number(issued.issuedQuantity), unitCost: Number(issued.unitCost) } };
console.log(JSON.stringify({ viewport: "390x844", model: { tapSeconds: TAP_SECONDS, typedFieldSeconds: TYPED_FIELD_SECONDS }, results, landed }, null, 2));
const ok = results.every(r => r.withinTarget) && landed.progressRows === 1 && landed.issueRows === 1 && landed.lastIssue.quantity === 10 && landed.lastIssue.unitCost === 18.5;
process.exit(ok ? 0 : 1);
