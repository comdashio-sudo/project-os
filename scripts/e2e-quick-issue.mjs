// Work order 12, item 3: issuing material from a phone in under 20 seconds, measured in a real browser at 390px against the real server and database.
//
// The path is the one the screen is built for: open the quick-issue screen → type part of the material's name → tap the result → type the quantity →
// type the unit number → pick the activity → tap Save → read the confirmation. The clock starts when the page is requested and stops when the confirmation
// shows; the database is then read to prove the issue, its cost entry and the shelf all moved (screen → database).
//
// Honest limit: Playwright types and taps for a person. To keep the figure from being a machine-speed fantasy, every keystroke waits KEY_DELAY_MS and every
// tap is preceded by THINK_MS, a quick-but-human pace; the script prints both, the number of actions, and the time spent waiting on the application alone.
// A second pass starts with the unit and the activity remembered from the first, which is the usual day on site (find → quantity → save).
// Synthetic data only (*.example.test). Nothing here prints a secret.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)     pnpm build
//   node --import tsx scripts/e2e-quick-issue.mjs
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { serverDatabaseEnv } from "./lib/serverEnv.mjs";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";
import { upsertUser } from "../server/db.ts";

const PORT = Number(process.env.QUICK_ISSUE_PORT ?? 3310);
const BASE_URL = `http://localhost:${PORT}`;
const BUDGET_MS = 20_000;
// PACE=quick (default, the work-order-12 figure): 120 ms a keystroke, 700 ms before each tap. PACE=ordinary (work order 14): 250 ms a keystroke and 1500 ms
// before each tap — a person who is reading the screen, not racing it. MODE=camera replaces typing the search with tapping "scan QR" and holding a real
// QR code (tests/fixtures/camera-qr-cem-1.y4m, an encoded "CEM-1") in front of Chromium's fake camera: the screen's own getUserMedia → <video> → detector
// loop runs; the detector is a shim around jsQR decoding the actual video frames, because headless Chromium on Linux has no native BarcodeDetector.
const ORDINARY = process.env.PACE === "ordinary";
const CAMERA = process.env.MODE === "camera";
const KEY_DELAY_MS = ORDINARY ? 250 : 120;
const THINK_MS = ORDINARY ? 1500 : 700;
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");

const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), ...serverDatabaseEnv() }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", chunk => { serverLog += chunk; }); server.stderr.on("data", chunk => { serverLog += chunk; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-600)); process.exit(1); }
}
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);
const connection = await mysql.createConnection(dbUrl.toString());
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); if (!ok) console.log("FAILED:", name, detail ?? ""); };
const openIdOf = email => `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
const run = randomUUID().slice(0, 6);
// superjson on the wire: a Date travels as an ISO string plus a note saying so
const wire = input => { const dates = Object.entries(input).filter(([, value]) => value instanceof Date).map(([key]) => key); return { json: input, ...(dates.length ? { meta: { values: Object.fromEntries(dates.map(key => [key, ["Date"]])) } } : {}) }; };
const trpc = async (token, path, input, method = "POST") => {
  const url = method === "POST" ? `${BASE_URL}/api/trpc/${path}?batch=1` : `${BASE_URL}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: wire(input) }))}`;
  const response = await fetch(url, { method, headers: { "content-type": "application/json", cookie: `app_session_id=${token}` }, body: method === "POST" ? JSON.stringify({ 0: wire(input) }) : undefined });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.[0]?.error) throw new Error(`${path}: ${JSON.stringify(body?.[0]?.error?.json?.message ?? response.status)}`);
  return body[0].result.data.json;
};

// ---- seed: a company, a project with a unit and an activity linked to a WBS item, a warehouse with priced cement, and a custodian for that project only
const email = `quick.owner.${run}@example.test`;
await upsertUser({ openId: openIdOf(email), name: `Quick owner ${run}`, email, loginMethod: "email" });
const ownerToken = await sdk.issueSession(openIdOf(email), { name: `Quick owner ${run}` });
const { tenantId } = await trpc(ownerToken, "tenant.create", { legalName: `Quick Issue Co ${run}`, slug: `quick-issue-${run}`, packageCode: "ALL-IN-ONE" });
const projectId = randomUUID();
await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, ?, ?, 'villas', 'SAR', 'active')", [projectId, tenantId, `QI-${run}`, `Quick issue ${run}`]);
const [zone, block, wbs, group, stage] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const units = Array.from({ length: 60 }, (_, index) => ({ id: randomUUID(), number: index + 1 }));
await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'WBS-1', 'Masonry')", [wbs, tenantId, projectId]);
await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [zone, tenantId, projectId]);
await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [block, tenantId, projectId, zone]);
for (const unit of units) await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, ?, 'A', 1)", [unit.id, tenantId, projectId, block, unit.number]);
await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'FIN', 'Finishing')", [group, tenantId, projectId]);
await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [stage, tenantId, projectId, group]);
const [walls, paint] = [randomUUID(), randomUUID()];
await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, wbsItemId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 60), (?, ?, ?, ?, ?, ?, 'A', 'PAINT', 'Paint', 40)", [walls, tenantId, projectId, group, stage, wbs, paint, tenantId, projectId, group, stage, wbs]);
await trpc(ownerToken, "materials.createMaster", { tenantId, code: "CEM-1", description: "Cement bag 50kg", unitOfMeasure: "bag", category: "cement" });
const [[material]] = await connection.query("SELECT id FROM material_masters WHERE tenantId = ? AND code = 'CEM-1'", [tenantId]);
await trpc(ownerToken, "warehouses.create", { tenantId, projectId, code: "WH-1", name: "Main store" });
const [[warehouse]] = await connection.query("SELECT id FROM project_warehouses WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
await trpc(ownerToken, "warehouses.recordInventory", { tenantId, projectId, warehouseId: warehouse.id, materialId: material.id, transactionType: "receipt", quantityDelta: 500, unitCost: 22, occurredAt: new Date() });
const administration = await trpc(ownerToken, "tenant.administration", { tenantId }, "GET");
const custodianRole = administration.roles.find(role => role.code === "WAREHOUSE_CUSTODIAN").id;
const keeperEmail = `quick.keeper.${run}@example.test`;
await upsertUser({ openId: openIdOf(keeperEmail), name: `Quick keeper ${run}`, email: keeperEmail, loginMethod: "email" });
const keeperToken = await sdk.issueSession(openIdOf(keeperEmail), { name: `Quick keeper ${run}` });
const invitation = await trpc(ownerToken, "tenant.createInvitation", { tenantId, email: keeperEmail, roleId: custodianRole, scopeType: "project", scopeId: projectId });
await trpc(keeperToken, "tenant.acceptInvitation", { inviteToken: invitation.inviteToken });

// ---- the walk
const cameraArgs = CAMERA ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${new URL("../tests/fixtures/camera-qr-cem-1.y4m", import.meta.url).pathname}`] : [];
const browser = await chromium.launch({ args: cameraArgs, executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "ar-SA" });
if (CAMERA) {
  await context.grantPermissions(["camera"], { origin: BASE_URL });
  const jsqrSource = readFileSync(createRequire(import.meta.url).resolve("jsqr/dist/jsQR.js"), "utf8");
  await context.addInitScript(`${jsqrSource}
    window.__scan = { frames: 0, hits: 0 };
    window.BarcodeDetector = class { constructor() {} async detect(video) {
      if (!video.videoWidth) return [];
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height); window.__scan.frames += 1;
      const code = window.jsQR(image.data, image.width, image.height);
      if (code) { window.__scan.hits += 1; return [{ rawValue: code.data }]; }
      return [];
    } };`);
}
await context.addCookies([{ name: "app_session_id", value: keeperToken, url: BASE_URL }]);
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(String(error.message).slice(0, 160)));
const think = () => page.waitForTimeout(THINK_MS);

const scans = [];
async function pass(label, { fresh }) {
  const marks = []; let actions = 0; let waiting = 0;
  const mark = name => marks.push([name, Math.round(performance.now() - started)]);
  const act = async work => { actions += 1; await think(); await work(); };
  const await_ = async work => { const before = performance.now(); await work(); waiting += performance.now() - before; };
  const started = performance.now();
  await page.goto(`${BASE_URL}/m/${tenantId}/${projectId}/issue?lang=ar`, { waitUntil: "load" });
  await await_(() => page.getByLabel("ابحث بالرمز أو الاسم").waitFor({ timeout: 20_000 })); mark("screen ready");
  if (CAMERA) {
    await act(() => page.getByRole("button", { name: "مسح QR" }).click());
    try { await await_(() => page.waitForFunction(() => document.querySelector("input")?.value === "CEM-1", null, { timeout: 15_000 })); } catch (error) {
      console.log("camera diagnostics:", JSON.stringify(await page.evaluate(() => ({ scan: window.__scan, video: (v => v && { w: v.videoWidth, h: v.videoHeight, ready: v.readyState, paused: v.paused })(document.querySelector("video")), input: document.querySelector("input")?.value, alert: document.querySelector("[role=alert]")?.textContent }))));
      console.log("getUserMedia in the page:", JSON.stringify(await page.evaluate(async () => { try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); return { ok: true, tracks: s.getTracks().length }; } catch (e) { return { ok: false, name: e.name, message: String(e.message).slice(0, 120) }; } })));
      throw error;
    }
    mark("QR read from the camera");
  } else {
    await act(() => page.getByLabel("ابحث بالرمز أو الاسم").pressSequentially("cem", { delay: KEY_DELAY_MS }));
  }
  await await_(() => page.getByText("CEM-1").first().waitFor({ timeout: 10_000 })); mark("result shown");
  await act(() => page.getByText("CEM-1").first().click());
  await act(async () => { await page.getByLabel(/الكمية/).fill(""); await page.getByLabel(/الكمية/).pressSequentially("5", { delay: KEY_DELAY_MS }); });
  if (fresh) {
    await act(() => page.getByLabel("رقم الوحدة").pressSequentially("12", { delay: KEY_DELAY_MS }));
    await act(() => page.getByLabel(/النشاط/).selectOption(walls));
  } else {
    check(`${label}: the unit and the activity of the last issue are already there`, (await page.getByLabel("رقم الوحدة").inputValue()) === "12" && (await page.getByLabel(/النشاط/).inputValue()) === walls);
  }
  mark("form filled");
  await act(() => page.getByRole("button", { name: "حفظ الصرف" }).click());
  await await_(() => page.getByRole("status").filter({ hasText: "تم الصرف" }).waitFor({ timeout: 10_000 })); mark("confirmed");
  if (CAMERA) scans.push(await page.evaluate(() => window.__scan));
  const total = Math.round(performance.now() - started);
  return { total, actions, waitingOnApplicationMs: Math.round(waiting), marks };
}

const first = await pass("first issue", { fresh: true });
console.log(JSON.stringify({ mode: CAMERA ? "camera" : "typed", pace: ORDINARY ? "ordinary" : "quick", pass: "first issue (unit and activity typed)", keyDelayMs: KEY_DELAY_MS, thinkMs: THINK_MS, ...first }));
check(`first issue: confirmed in ${first.total} ms (budget ${BUDGET_MS} ms, ${first.actions} actions)`, first.total < BUDGET_MS, first.total);
await page.getByRole("button", { name: "صرف آخر" }).click();
const second = await pass("next issue", { fresh: false });
console.log(JSON.stringify({ mode: CAMERA ? "camera" : "typed", pace: ORDINARY ? "ordinary" : "quick", pass: "next issue (unit and activity remembered)", keyDelayMs: KEY_DELAY_MS, thinkMs: THINK_MS, ...second }));
check(`next issue: confirmed in ${second.total} ms (budget ${BUDGET_MS} ms, ${second.actions} actions)`, second.total < BUDGET_MS && second.actions < first.actions, second.total);

// ---- screen → database
const [issues] = await connection.query("SELECT i.issuedQuantity, i.totalCost, i.pmcUnitId, i.pmcActivityDefinitionId, i.wbsItemId, c.amount, c.status FROM material_issues i JOIN cost_entries c ON c.id = i.costEntryId WHERE i.tenantId = ? AND i.projectId = ?", [tenantId, projectId]);
check("both issues are in the database, charged to the activity's WBS item at the shelf's average (5 × 22)", issues.length === 2 && issues.every(row => Number(row.issuedQuantity) === 5 && Number(row.totalCost) === 110 && Number(row.amount) === 110 && row.status === "posted" && row.wbsItemId === wbs && row.pmcActivityDefinitionId === walls && row.pmcUnitId === units[11].id), issues.length);
const [[shelf]] = await connection.query("SELECT SUM(quantityDelta) q FROM warehouse_inventory_transactions WHERE tenantId = ? AND warehouseId = ? AND materialId = ?", [tenantId, warehouse.id, material.id]);
check("the shelf went from 500 to 490", Number(shelf.q) === 490, shelf.q);
if (CAMERA) check(`the camera path really ran in both passes (frames decoded / frames that read the QR): ${JSON.stringify(scans)}`, scans.length === 2 && scans.every(scan => scan.hits >= 1), scans);
check("no page error while walking the screen", errors.length === 0, errors);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("the screen does not scroll sideways at 390px", overflow <= 1, overflow);
// NEGATIVE: the custodian of this project may not issue in the other direction of the rule — a unit that does not exist is refused by the server, nothing booked
let refused = false;
try { await trpc(keeperToken, "warehouses.issueToCell", { tenantId, projectId, warehouseId: warehouse.id, materialId: material.id, pmcUnitId: randomUUID(), pmcActivityDefinitionId: walls, issuedQuantity: 1, issuedAt: new Date() }); } catch { refused = true; } // the server answers with its generic wording; that nothing was booked is proved by the count below
check("NEGATIVE: an unknown unit is refused by the server and books nothing", refused);
const [[after]] = await connection.query("SELECT COUNT(*) n FROM material_issues WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
check("NEGATIVE: still two issues after the refused one", Number(after.n) === 2, after.n);

await connection.end(); await browser.close(); stop();
const failed = checks.filter(item => !item.ok);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length, results: checks }, null, 1));
process.exit(failed.length ? 1 : 0);
