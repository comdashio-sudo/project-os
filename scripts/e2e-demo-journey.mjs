// Work order 15, item 3: one complete journey through the demonstration company "شركة العرض", in a real browser against the real server and database, by the people who
// would do it, one level after another — and at every level the number must move by the right amount.
//
//   1  a site engineer (phone) writes today's daily report and sends it; the project manager approves it  →  the unit's cell completes, progress moves, earned value moves
//   2  the coordinator registers a consultant submittal, sends it, records reply A; the quality manager asks for the inspection and records the consultant's answer A
//      →  the cell is accepted; an open NCR on that cell keeps the acceptance from counting, and closing it restores it
//   3  the warehouse keeper issues cement to that unit's activity (phone)  →  stock falls, a posted cost entry is made, actual cost, EAC and the expected profit move
//   at the end the board member opens the company dashboard and the profit on it is the one the arithmetic gives
//
// Every figure is read from the server's own level answers (scopes.project / portfolio / company / warehouse) before and after each step, and compared with what the
// laws say it must be: earned value = package value x the progress the bridge computed, actual cost = the cost entries, EAC = AC + BAC - EV, profit = the adjusted
// contract - EAC. Nothing is typed into the database by hand; the only direct SQL is READING.
//
//   . env (DATABASE_URL = the owner, SERVER_DATABASE_URL = project_os_app, both naming project_os_integration_test; JWT_SECRET)   pnpm build
//   node --import tsx scripts/e2e-demo-journey.mjs            OUT_DIR=./demo-journey-out for screenshots
// Playwright is not a project dependency: PLAYWRIGHT_MODULE_DIR / PLAYWRIGHT_CHROMIUM locate it (as in scripts/e2e-roles.mjs).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";
import { sdk } from "../server/_core/sdk.ts";
import { seedDemoCompany, deleteDemoCompany } from "./demo/demoCompany.ts";

const PORT = Number(process.env.DEMO_JOURNEY_PORT ?? 3330);
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = process.env.OUT_DIR ?? "./demo-journey-out";
const ownerUrl = new URL(process.env.DATABASE_URL ?? "");
if (ownerUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
if (!process.env.SERVER_DATABASE_URL) { console.error("SERVER_DATABASE_URL (the restricted application role) is required: the journey must run under row-level security."); process.exit(2); }
mkdirSync(OUT_DIR, { recursive: true });
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); };
const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
// Waits for a condition (polled), never for a fixed time: the answer is true as soon as it holds, false after `ms`.
const waitFor = async (condition, ms = 20000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await condition().catch(() => false)) return true; await new Promise(resolve => setTimeout(resolve, 150)); } return false; };
const money = value => Math.round(value * 100) / 100;

// ---- the demonstration company, built the way the owner's button builds it (the owner connection: it is a setup script)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await deleteDemoCompany({ ownerEmail: "demo.admin@example.test" }).catch(() => undefined);
const built = await seedDemoCompany({ ownerEmail: "demo.admin@example.test" });
const tenantId = built.tenantId; const projectId = built.projectId;
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
const many = async (sql, params = []) => (await pool.query(sql, params)).rows;

// ---- the server under test, as the restricted application role
const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), DATABASE_URL: process.env.SERVER_DATABASE_URL }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", chunk => { serverLog += chunk; }); server.stderr.on("data", chunk => { serverLog += chunk; });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-600)); process.exit(1); }
}

// ---- the people: a session for each (the same signed session the sign-in code would issue)
const people = {};
for (const [key, email] of Object.entries({ site: "site.engineer.1@show.example.test", pm: "project.manager@show.example.test", coord: "project.coordinator@show.example.test", qc: "quality.manager@show.example.test", keeper: "warehouse.keeper@show.example.test", board: "board.member@show.example.test", pmo: "portfolio.lead@show.example.test" })) {
  const user = await one("SELECT id, open_id, name FROM users WHERE email = $1", [email]);
  people[key] = { id: user.id, token: await sdk.issueSession(user.open_id, { name: user.name }) };
}
const wire = input => ({ json: input });
const call = async (who, procedure, input, method = "GET") => {
  const url = method === "POST" ? `${BASE_URL}/api/trpc/${procedure}?batch=1` : `${BASE_URL}/api/trpc/${procedure}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: wire(input) }))}`;
  const response = await fetch(url, { method, headers: { "content-type": "application/json", cookie: `app_session_id=${people[who].token}` }, body: method === "POST" ? JSON.stringify({ 0: wire(input) }) : undefined });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.[0]?.error) throw Object.assign(new Error(`${procedure}: ${JSON.stringify(body?.[0]?.error?.json?.message ?? response.status)}`), { refused: true });
  return body[0].result.data.json;
};

/** What each level answers right now. */
async function levels() {
  const project = (await call("pm", "scopes.project", { tenantId, projectId })).project;
  const portfolio = (await call("pmo", "scopes.portfolio", { tenantId })).totals;
  const company = await call("board", "scopes.company", { tenantId });
  const warehouseId = (await one("SELECT id FROM project_warehouses WHERE tenant_id = $1 AND code = 'WH-MAIN'", [tenantId])).id;
  const warehouse = await call("keeper", "scopes.warehouse", { tenantId, projectId, warehouseId });
  const row = company.projects.find(item => item.projectId === projectId);
  return { project, portfolio, company: company.totals, companyRow: row, warehouse };
}
const figures = state => ({ ev: state.project.evm.ev, ac: state.project.evm.ac, eac: state.project.evm.eac, profit: state.project.expectedProfit.value, progress: state.project.progress.percent });

// ---- the target cell: a block-work activity that is in progress on a villa of model A with no NCR on it
const cell = await one(`SELECT u.id AS unit_id, u.unit_number, d.id AS def_id, c.status FROM pmc_unit_activity_progress c JOIN pmc_units u ON u.id = c.unit_id JOIN pmc_activity_definitions d ON d.id = c.activity_definition_id
  WHERE c.tenant_id = $1 AND d.code = 'BLK' AND d.model_code = 'A' AND c.status = 'IN_PROGRESS' AND NOT EXISTS (SELECT 1 FROM ncrs n WHERE n.pmc_unit_id = u.id AND n.pmc_activity_definition_id = d.id) ORDER BY u.unit_number LIMIT 1`, [tenantId]);
if (!cell) { console.error("no in-progress block-work cell to walk through"); process.exit(1); }
const unitNumber = cell.unit_number;
const wbsOfBlk = await one("SELECT w.id, w.planned_value FROM wbs_items w JOIN pmc_activity_definitions d ON d.wbs_item_id = w.id WHERE d.id = $1", [cell.def_id]);
const latestProgress = async () => Number((await one("SELECT progress_percent FROM progress_entries WHERE wbs_item_id = $1 AND status = 'submitted' ORDER BY measured_at DESC, created_at DESC LIMIT 1", [wbsOfBlk.id])).progress_percent);

const browser = await chromium.launch({ executablePath: CHROMIUM });
const open = async (who, viewport) => {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, locale: "en-US" });
  await context.addCookies([{ name: "app_session_id", value: people[who].token, url: BASE_URL }]);
  const page = await context.newPage(); page.setDefaultTimeout(20_000);
  const errors = []; page.on("pageerror", error => errors.push(String(error.message).slice(0, 160)));
  return { context, page, errors };
};
const PHONE = { width: 390, height: 844 }; const DESKTOP = { width: 1280, height: 800 };
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true }); };
const walk = `/m/${tenantId}/${projectId}`;

const S0 = await levels();
const base = figures(S0);
console.log(JSON.stringify({ start: base, unitNumber }));

// The design system's list (client/src/components/ds/Select.tsx) is not the browser's select: open it from its trigger, then click the option
// that carries the wanted value (each option has data-value). Work order 21 moved the phone screens onto it.
async function choose(page, trigger, value) {
  await trigger.click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}
/** The same list, picking the option at `index` (0 = the first), when the journey does not know the value beforehand. */
async function chooseAt(page, trigger, index) {
  await trigger.click();
  await page.locator('[role="option"]').nth(index).click();
}

try {
  // ================================================================================================ 1. daily report -> approval -> progress
  const progressBefore = await latestProgress();
  const siteScreen = await open("site", PHONE);
  await siteScreen.page.goto(`${BASE_URL}${walk}/report?lang=en`, { waitUntil: "networkidle" });
  await choose(siteScreen.page, siteScreen.page.getByLabel("Weather"), "clear");
  await siteScreen.page.getByLabel("Summary of the day").fill("Walk-through report: block work finished on one villa.");
  await siteScreen.page.getByRole("button", { name: "Add work" }).click();
  await siteScreen.page.getByLabel("Unit number").nth(1).fill(String(unitNumber)); // the first one is the unit-card shortcut
  const activitySelect = siteScreen.page.getByLabel("Activity");
  await choose(siteScreen.page, activitySelect, cell.def_id);
  await choose(siteScreen.page, siteScreen.page.getByLabel("Status after the work"), "COMPLETE");
  await siteScreen.page.getByRole("button", { name: "Save draft" }).click();
  await siteScreen.page.getByText("Draft saved").waitFor();
  await siteScreen.page.getByRole("button", { name: "Send for approval" }).click();
  await siteScreen.page.getByText("The report was sent for approval").waitFor();
  await shot(siteScreen.page, "1a-site-report-sent-phone");
  const report = await one("SELECT id, status, prepared_by_user_id FROM site_daily_reports WHERE tenant_id = $1 AND project_id = $2 AND summary LIKE 'Walk-through%'", [tenantId, projectId]);
  check("the site engineer's report is in the database, sent for approval, written by them", report?.status === "submitted" && report.prepared_by_user_id === people.site.id, report);
  check("sending a report moves nothing yet: the cell is still in progress", (await one("SELECT status FROM pmc_unit_activity_progress WHERE unit_id = $1 AND activity_definition_id = $2", [cell.unit_id, cell.def_id])).status === "IN_PROGRESS");
  const S1a = await levels();
  check("…and no level's figure has moved", JSON.stringify(figures(S1a)) === JSON.stringify(base), { before: base, after: figures(S1a) });

  // NEGATIVE: the person who wrote it cannot approve it
  let refusedSelf = false; try { await call("site", "siteReports.review", { tenantId, projectId, reportId: report.id, decision: "approve" }, "POST"); } catch (error) { refusedSelf = error.refused; }
  check("NEGATIVE: the writer cannot approve their own report (the server refuses)", refusedSelf);
  check("NEGATIVE: …and the report is still waiting", (await one("SELECT status FROM site_daily_reports WHERE id = $1", [report.id])).status === "submitted");

  const pmScreen = await open("pm", DESKTOP);
  await pmScreen.page.goto(`${BASE_URL}${walk}/report?lang=en`, { waitUntil: "networkidle" });
  const target = pmScreen.page.locator(`[data-review="${report.id}"]`);
  await target.getByRole("button", { name: "What will move?" }).click();
  await pmScreen.page.getByText("These cells will move").waitFor();
  await shot(pmScreen.page, "1b-pm-preview-desktop");
  await target.getByRole("button", { name: "Approve", exact: true }).click();
  await pmScreen.page.getByText("Report approved and progress moved").waitFor();
  await shot(pmScreen.page, "1c-pm-approved-desktop");
  check("the report is approved by the project manager", (await one("SELECT status, reviewed_by_user_id FROM site_daily_reports WHERE id = $1", [report.id])).reviewed_by_user_id === people.pm.id);
  check("the cell is now COMPLETE, with the change written in its history", (await one("SELECT status FROM pmc_unit_activity_progress WHERE unit_id = $1 AND activity_definition_id = $2", [cell.unit_id, cell.def_id])).status === "COMPLETE"
    && Number((await one("SELECT count(*)::int AS n FROM pmc_unit_activity_history h JOIN pmc_unit_activity_progress c ON c.id = h.unit_activity_progress_id WHERE c.unit_id = $1 AND c.activity_definition_id = $2 AND h.to_status = 'COMPLETE'", [cell.unit_id, cell.def_id])).n) >= 1);

  const progressAfter = await latestProgress();
  const dPercent = round(progressAfter - progressBefore, 2);
  // block work is the only activity of its package: one villa of 500 completes weight 10 of the package's 5 000
  check(`the package's progress moved by one villa's share, 0.20 points (${progressBefore} → ${progressAfter})`, near(dPercent, 0.2, 0.011), { dPercent });
  const S1 = await levels(); const f1 = figures(S1);
  const expectedDEv = money((Number(wbsOfBlk.planned_value) * (progressAfter - progressBefore)) / 100);
  check(`earned value moved by the package value x the progress it gained: +${expectedDEv.toLocaleString("en-US")}`, near(f1.ev - base.ev, expectedDEv, 0.02), { moved: money(f1.ev - base.ev), expected: expectedDEv });
  check("actual cost did not move (approving progress costs nothing)", near(f1.ac, base.ac));
  check("the forecast fell by exactly that earned value (EAC = AC + BAC − EV)", near(f1.eac - base.eac, -expectedDEv, 0.02), { moved: money(f1.eac - base.eac) });
  check("the expected profit rose by exactly the same amount", near(f1.profit - base.profit, expectedDEv, 0.02), { moved: money(f1.profit - base.profit) });
  check("the project's overall progress moved by one villa's share, +0.02 points", near(f1.progress - base.progress, 0.02, 0.006), { moved: round(f1.progress - base.progress, 4) });
  check("the portfolio level carries the same profit movement", near(S1.portfolio.expectedProfit - S0.portfolio.expectedProfit, expectedDEv, 0.02), { moved: money(S1.portfolio.expectedProfit - S0.portfolio.expectedProfit) });
  check("the company (board) level carries the same profit movement, to the project's row and to the total", near(S1.companyRow.expectedProfit.value - S0.companyRow.expectedProfit.value, expectedDEv, 0.02) && near(S1.company.expectedProfit - S0.company.expectedProfit, expectedDEv, 0.02));
  await siteScreen.context.close(); await pmScreen.context.close();

  // ================================================================================================ 2. submittal -> reply A -> inspection -> acceptance
  const beforeSub = S1.project.pendingConsultant; const beforeSubCompany = S1.company.pendingConsultant;
  const coord = await open("coord", DESKTOP);
  await coord.page.goto(`${BASE_URL}${walk.replace("/m/", "/projects/")}/submittals?lang=en`, { waitUntil: "networkidle" });
  const createForm = coord.page.locator("details", { hasText: "New submittal" });
  if (!(await createForm.getAttribute("open"))) await createForm.locator("summary").click();
  await choose(coord.page, coord.page.getByLabel("Submittal type"), "material_approval");
  await coord.page.getByLabel("Submittal number").fill("MA-E2E-1");
  await coord.page.getByLabel("Title", { exact: true }).fill("Block approval (walk-through)");
  await chooseAt(coord.page, createForm.locator("label", { hasText: /^Material/ }).locator('[role="combobox"]'), 1);
  await coord.page.getByLabel("Sent to (consultant)").fill("استشاري العرض أ");
  await coord.page.getByRole("button", { name: "Create submittal" }).click();
  await coord.page.getByText("Submittal created").waitFor();
  const sub = await one("SELECT id, status, consultant FROM consultant_submittals WHERE tenant_id = $1 AND submittal_number = 'MA-E2E-1'", [tenantId]);
  check("the coordinator's submittal exists as a draft, addressed to the consultant", sub?.status === "draft" && sub.consultant === "استشاري العرض أ", sub);
  const cardOf = number => coord.page.locator(`[data-submittal="${number}"]`);
  await cardOf("MA-E2E-1").getByRole("button", { name: "Send to the consultant" }).click();
  await cardOf("MA-E2E-1").getByRole("button", { name: "Record the reply" }).waitFor();
  const S2a = await levels();
  check("sent: the consultant is now holding one more submittal, at the project, portfolio and company levels", S2a.project.pendingConsultant.submittals === beforeSub.submittals + 1 && S2a.portfolio.pendingConsultant.submittals === S1.portfolio.pendingConsultant.submittals + 1 && S2a.company.pendingConsultant.submittals === beforeSubCompany.submittals + 1, { project: S2a.project.pendingConsultant, before: beforeSub });
  // the one who sent a submittal cannot record its reply (separation of duties) -- refused with a clear message
  await cardOf("MA-E2E-1").getByRole("button", { name: "Record the reply" }).click();
  await choose(coord.page, coord.page.locator('[data-reply-form] [role="combobox"]'), "A");
  await coord.page.getByRole("button", { name: "Save the reply" }).click();
  await coord.page.locator("[role=alert]").getByText("Whoever sent the submittal does not record its reply.").waitFor();
  check("NEGATIVE: whoever sent the submittal cannot record its reply (refused, with the reason on screen)", (await one("SELECT status FROM consultant_submittals WHERE id = $1", [sub.id])).status === "sent");
  const replier = await open("pm", DESKTOP);
  await replier.page.goto(`${BASE_URL}${walk.replace("/m/", "/projects/")}/submittals?lang=en`, { waitUntil: "networkidle" });
  const pmCard = replier.page.locator('[data-submittal="MA-E2E-1"]');
  await pmCard.getByRole("button", { name: "Record the reply" }).click();
  await choose(replier.page, replier.page.locator('[data-reply-form] [role="combobox"]'), "A");
  await replier.page.getByRole("button", { name: "Save the reply" }).click();
  await pmCard.getByText(/Answered/).first().waitFor();
  await replier.context.close();
  await coord.page.reload({ waitUntil: "networkidle" });
  await shot(coord.page, "2a-submittals-register-desktop");
  const S2b = await levels();
  check("replied A: the consultant no longer holds it, at every level", S2b.project.pendingConsultant.submittals === beforeSub.submittals && S2b.company.pendingConsultant.submittals === beforeSubCompany.submittals);
  const replied = await one("SELECT reply_code, status FROM consultant_submittals WHERE id = $1", [sub.id]);
  check("the reply is recorded: code A, answered", replied.reply_code === "A" && replied.status === "replied");
  await coord.context.close();

  const qcScreen = await open("qc", DESKTOP);
  await qcScreen.page.goto(`${BASE_URL}${walk.replace("/m/", "/projects/")}/quality?lang=en`, { waitUntil: "networkidle" });
  const inspBefore = (await levels()).project.pendingConsultant.inspectionRequests;
  await qcScreen.page.waitForTimeout(1500);
  const inspForm = qcScreen.page.locator("details", { hasText: "New inspection request" });
  if (!(await inspForm.getAttribute("open"))) await inspForm.locator("summary").click();
  await qcScreen.page.getByLabel("Request code").fill("IR-E2E-1");
  await qcScreen.page.getByLabel("Unit numbers (comma separated)").fill(String(unitNumber));
  await choose(inspForm.page(), inspForm.locator("label", { hasText: /^Activity/ }).locator('[role="combobox"]'), cell.def_id);
  await qcScreen.page.getByRole("button", { name: "Create the request" }).click();
  await qcScreen.page.getByText("Request created").waitFor();
  check("an inspection request now waits for the consultant at the project level (+1)", (await levels()).project.pendingConsultant.inspectionRequests === inspBefore + 1);
  const inspection = await one("SELECT id FROM pmc_inspection_requests WHERE tenant_id = $1 AND request_code = 'IR-E2E-1'", [tenantId]);
  // the steps of the request, one by one, then the consultant's answer
  const requestCard = qcScreen.page.locator(`[data-request="IR-E2E-1"]`);
  // Walk the steps until the consultant's answer buttons appear. The loop is driven by WHAT IS ON THE SCREEN, not by a count of clicks and fixed pauses: a click that lands on the
  // button of a step already done is refused by the server and costs nothing, the next pass clicks the current one. (CI, 2026-10-25: 8 clicks with 600 ms pauses ran out on a slow runner.)
  const advanceButton = requestCard.getByRole("button", { name: "Complete this step" });
  const answerButton = requestCard.getByRole("button", { name: /^A\b|A — |Approved/ }).first();
  const walkUntil = Date.now() + 40000;
  while (Date.now() < walkUntil && (await answerButton.count()) === 0) {
    if ((await advanceButton.count()) > 0) await advanceButton.first().click({ timeout: 5000 }).catch(() => undefined);
    await qcScreen.page.waitForTimeout(400);
  }
  if ((await answerButton.count()) === 0) throw new Error(`the answer buttons never appeared on the request card; the card says: ${JSON.stringify((await requestCard.innerText().catch(() => "")).slice(0, 500))}`);
  await answerButton.click();
  await qcScreen.page.waitForTimeout(800);
  await shot(qcScreen.page, "2b-quality-answered-desktop");
  check("the consultant's answer A is recorded on the request", (await one("SELECT response_code FROM pmc_inspection_requests WHERE id = $1", [inspection.id])).response_code === "A");
  const accepted = async () => (await call("pm", "cells.card", { tenantId, projectId, unitId: cell.unit_id, activityDefinitionId: cell.def_id })).qc;
  const qcNow = await accepted();
  check("the cell is accepted (the answer is A, and no NCR is open on it)", qcNow.accepted === true, qcNow);

  // NEGATIVE then POSITIVE: an open NCR on the cell keeps the acceptance from counting; closing it restores it
  await qcScreen.page.getByRole("tab", { name: /Non-conformances/ }).click();
  const ncrForm = qcScreen.page.locator("details", { hasText: "NCR number" });
  if (!(await ncrForm.getAttribute("open"))) await ncrForm.locator("summary").click();
  await qcScreen.page.getByLabel("NCR number").fill("NCR-E2E-1");
  await qcScreen.page.getByLabel("Title", { exact: true }).last().fill("Crack at a block course (walk-through)");
  await qcScreen.page.getByLabel("Description", { exact: true }).fill("A crack found while the block work was inspected.");
  await qcScreen.page.getByLabel("Unit number (optional)").fill(String(unitNumber));
  await choose(qcScreen.page, qcScreen.page.getByLabel("Activity (optional)"), cell.def_id);
  await qcScreen.page.getByRole("button", { name: "Create NCR" }).click();
  await qcScreen.page.getByText("NCR created").waitFor();
  const held = await accepted();
  check("NEGATIVE: with an NCR open on the same cell, the same inspection no longer counts as accepted", held.accepted === false && held.heldByNcr === true, held);
  const ncr = await one("SELECT id FROM ncrs WHERE tenant_id = $1 AND ncr_number = 'NCR-E2E-1'", [tenantId]);
  // The NCR walks open -> under investigation -> corrective action -> verification -> closed, one button per stage. Each click is followed by WAITING for the database to show the new
  // stage (never a fixed pause): on a slow runner a fixed 500 ms pause let the next click land on the previous stage's button, the step was refused, and the loop ran out (CI, 2026-10-25).
  const ncrCard = qcScreen.page.locator(`[data-ncr="NCR-E2E-1"]`);
  const stages = [];
  for (let i = 0; i < 6; i++) {
    const before = (await one("SELECT status FROM ncrs WHERE id = $1", [ncr.id])).status;
    if (before === "closed") break;
    stages.push(before);
    const button = ncrCard.getByRole("button", { name: /^(Move to|Close)/ }).first();
    const label = await button.innerText();
    await button.click();
    const moved = await waitFor(async () => (await one("SELECT status FROM ncrs WHERE id = $1", [ncr.id])).status !== before, 20000);
    if (!moved) { stages.push(`stuck at ${before}`); break; }
    // the card shows the next stage's button only after the screen has re-read the NCR: wait for that before the next click (or for no button at all once closed)
    await waitFor(async () => { const next = ncrCard.getByRole("button", { name: /^(Move to|Close)/ }).first(); return (await next.count()) === 0 || (await next.innerText()) !== label; }, 20000);
  }
  const ncrNow = (await one("SELECT status FROM ncrs WHERE id = $1", [ncr.id])).status;
  check("the NCR is closed", ncrNow === "closed", { walked: stages, now: ncrNow });
  check("closing it restores the acceptance", (await accepted()).accepted === true, await accepted());
  await qcScreen.context.close();

  // ================================================================================================ 3. issue -> actual cost -> EVM -> profit
  const S3pre = await levels(); const f3pre = figures(S3pre);
  const cement = (await call("keeper", "warehouses.findMaterial", { tenantId, projectId, warehouseId: S3pre.warehouse.warehouse.id, query: "CEM" }))[0];
  const stockBefore = S3pre.warehouse.stock.find(item => item.code === "CEM-50");
  const average = stockBefore.value / stockBefore.quantity;
  const keeper = await open("keeper", PHONE);
  await keeper.page.goto(`${BASE_URL}${walk}/issue?lang=en`, { waitUntil: "networkidle" });
  await keeper.page.getByLabel("Search by code or name").fill("CEM");
  await keeper.page.getByText("CEM-50").first().click();
  await keeper.page.getByLabel(/Quantity/).fill("5");
  const unitBox = keeper.page.getByLabel("Unit number");
  await unitBox.fill(String(unitNumber));
  // CI on 2026-10-25 (twice in a day, on different commits) found the unit box EMPTY a moment after it had been filled, with the rest of the screen intact: the typed value was lost. Whether that is
  // a re-render on a slow runner or a screen that drops a keystroke is not known yet (docs/STATE.md, OPEN). So: check the box kept the value; if not, say so in the log (a loss is a finding, not
  // noise) and type it once more, so one lost keystroke does not hide the rest of the journey.
  if (!(await waitFor(async () => (await unitBox.inputValue()) === String(unitNumber), 3000))) {
    console.log(`note the unit box lost its value after it was filled (it reads ${JSON.stringify(await unitBox.inputValue().catch(() => null))}); typing it again`);
    await unitBox.fill(String(unitNumber));
  }
  // The Activity field exists only once the typed number is a unit of this project. If it never appears, say WHY (the screen's own words, a picture) instead of a bare 20 s timeout:
  // the one CI failure of this step (2026-10-25) left nothing to tell a slow runner from a screen that had lost what was typed.
  const activityField = keeper.page.getByLabel(/Activity/);
  if (!(await waitFor(async () => (await activityField.count()) === 1, 20000))) {
    await shot(keeper.page, "3x-issue-activity-missing-phone");
    throw new Error(`the Activity field did not appear after typing unit ${unitNumber}; the screen says: ${JSON.stringify((await keeper.page.locator("main").innerText()).slice(0, 600))}; unit field now: ${JSON.stringify(await keeper.page.getByLabel("Unit number").inputValue().catch(() => null))}`);
  }
  await choose(keeper.page, activityField, cell.def_id);
  await keeper.page.getByRole("button", { name: "Save issue" }).click();
  await keeper.page.getByRole("status").filter({ hasText: "Issued" }).waitFor();
  await shot(keeper.page, "3a-issue-done-phone");
  await keeper.context.close();
  void cement;
  const issue = await one("SELECT i.issued_quantity, i.unit_cost, i.total_cost, c.amount, c.status, c.entry_type FROM material_issues i JOIN cost_entries c ON c.id = i.cost_entry_id WHERE i.tenant_id = $1 AND i.reference_number IS NOT DISTINCT FROM i.reference_number ORDER BY i.created_at DESC LIMIT 1", [tenantId]).catch(() => null)
    ?? await one("SELECT i.issued_quantity, i.unit_cost, i.total_cost, c.amount, c.status, c.entry_type FROM material_issues i JOIN cost_entries c ON c.id = i.cost_entry_id WHERE i.tenant_id = $1 ORDER BY i.created_at DESC LIMIT 1", [tenantId]);
  const cost = money(5 * average);
  check(`the issue is charged at the shelf's average cost: 5 x ${money(average)} = ${cost}`, near(Number(issue.total_cost), cost, 0.05) && issue.status === "posted" && issue.entry_type === "actual" && near(Number(issue.amount), Number(issue.total_cost)), { issue, cost });
  const S3 = await levels(); const f3 = figures(S3);
  const dAc = money(Number(issue.amount));
  check(`actual cost rose by the cost entry, +${dAc.toLocaleString("en-US")}`, near(f3.ac - f3pre.ac, dAc, 0.02), { moved: money(f3.ac - f3pre.ac) });
  check("earned value did not move (an issue is not progress)", near(f3.ev, f3pre.ev));
  check("the forecast rose by the same cost", near(f3.eac - f3pre.eac, dAc, 0.02));
  check("the expected profit fell by the same cost", near(f3.profit - f3pre.profit, -dAc, 0.02), { moved: money(f3.profit - f3pre.profit) });
  check("the portfolio and the board carry the same fall", near(S3.portfolio.expectedProfit - S3pre.portfolio.expectedProfit, -dAc, 0.02) && near(S3.company.expectedProfit - S3pre.company.expectedProfit, -dAc, 0.02));
  const stockAfter = S3.warehouse.stock.find(item => item.code === "CEM-50");
  check("the warehouse level shows five bags less, and the shelf value down by their cost", near(stockBefore.quantity - stockAfter.quantity, 5, 0.001) && near(stockBefore.value - stockAfter.value, dAc, 0.05) && near(S3pre.warehouse.totals.stockValue - S3.warehouse.totals.stockValue, dAc, 0.05), { before: stockBefore, after: stockAfter });
  check("the stock value at the company level fell by the same cost", near(S3pre.company.stockValue - S3.company.stockValue, dAc, 0.05));

  // ================================================================================================ the whole journey, end to end
  const end = figures(S3);
  const adjustedContract = 450_000_000 + 9_000_000;
  check("EAC = AC + (BAC − EV) after the whole journey", near(end.eac, end.ac + 380_000_000 - end.ev, 0.05), { eac: end.eac });
  check("the expected profit = the adjusted contract (450 M + the approved 9 M) − EAC, to the cent", near(end.profit, adjustedContract - end.eac, 0.02), { profit: end.profit });
  check("from start to end the profit moved by exactly ΔEV − ΔAC", near(end.profit - base.profit, (end.ev - base.ev) - (end.ac - base.ac), 0.03), { moved: money(end.profit - base.profit) });

  const board = await open("board", DESKTOP);
  await board.page.goto(`${BASE_URL}/levels/${tenantId}/company?lang=en`, { waitUntil: "networkidle" });
  const rowText = await board.page.locator(`[data-project-row="${projectId}"] td`).first().innerText();
  const shown = Number(rowText.replace(/[^\d.\-]/g, ""));
  await shot(board.page, "3b-board-company-desktop");
  check(`the board dashboard shows that project's expected profit: ${rowText.trim()}`, near(shown, end.profit, 0.5), { shown, api: end.profit });
  const pageNumbers = await board.page.locator("main").innerText();
  check("the board's page shows no error and no blank", pageNumbers.length > 200 && board.errors.length === 0, board.errors);
  await board.context.close();
} catch (error) {
  check("the journey ran to the end without a thrown error", false, String(error?.message ?? error).slice(0, 400));
  console.error(serverLog.slice(-800));
}

function round(value, digits) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
await browser.close(); stop();
await pool.end();
const failed = checks.filter(item => !item.ok);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length }));
// leave the database as found: the demonstration company is erased, audited
await deleteDemoCompany({ ownerEmail: "demo.admin@example.test" }).catch(() => undefined);
process.exit(failed.length ? 1 : 0);
