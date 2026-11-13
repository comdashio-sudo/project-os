// Browser walk of the first-company setup wizard (item 11) as a brand-new person with no company, in Arabic, at desktop width and at 390px:
//   company → first project → import (a WBS CSV and a Primavera XER schedule, both through the real importer) → invite one person per new role template.
// Afterwards the database is read to prove each step really wrote what the screen claimed, and a second new person accepts an invitation through
// the API to prove the link the wizard showed is a working invitation (and carries the project scope the wizard promised).
// NEGATIVES: a person without tenant.manage cannot invite; an invited cost controller is refused a tender award.
// Synthetic data only (*.example.test). Nothing here prints a secret.
//
// The script starts the production server itself (WIZARD_PORT, default 3300) with storage pointed at a tiny fake S3 on 127.0.0.1 (STORAGE_S3_ENDPOINT, accepted
// only for loopback), so the importer's file storage works without any external service.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)     pnpm build
//   node --import tsx scripts/e2e-setup-wizard.mjs
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { serverDatabaseEnv } from "./lib/serverEnv.mjs";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";
import { upsertUser } from "../server/db.ts";

const PORT = Number(process.env.WIZARD_PORT ?? 3300);
const BASE_URL = `http://localhost:${PORT}`;
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
// ---------------------------------------------------------------- fake S3 (objects kept in memory) and the production server pointed at it
const objects = new Map();
const s3 = createServer((request, response) => {
  // the browser PUTs the import file here (a signed URL), from another origin: answer the preflight and allow the page
  response.setHeader("Access-Control-Allow-Origin", "*"); response.setHeader("Access-Control-Allow-Methods", "PUT, GET, HEAD, DELETE, OPTIONS"); response.setHeader("Access-Control-Allow-Headers", "*"); response.setHeader("Access-Control-Expose-Headers", "ETag");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const chunks = []; request.on("data", chunk => chunks.push(chunk));
  request.on("end", () => {
    const key = decodeURIComponent((request.url ?? "").split("?")[0]);
    if (request.method === "PUT") { const body = Buffer.concat(chunks); objects.set(key, body); response.writeHead(200, { ETag: `"${createHash("md5").update(body).digest("hex")}"` }); response.end(); }
    else if (request.method === "GET" || request.method === "HEAD") { const body = objects.get(key); if (!body) { response.writeHead(404); response.end(); } else { response.writeHead(200, { "content-length": body.length }); response.end(request.method === "GET" ? body : undefined); } }
    else if (request.method === "DELETE") { objects.delete(key); response.writeHead(204); response.end(); }
    else { response.writeHead(405); response.end(); }
  });
});
await new Promise(resolve => s3.listen(0, "127.0.0.1", resolve));
const server = spawn(process.execPath, ["dist/index.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), ...serverDatabaseEnv(), STORAGE_S3_ENDPOINT: `http://127.0.0.1:${s3.address().port}`, STORAGE_S3_REGION: "local", STORAGE_S3_ACCESS_KEY_ID: "rehearsal-key", STORAGE_S3_SECRET_ACCESS_KEY: "rehearsal-secret", STORAGE_BUCKET: "rehearsal-bucket" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = ""; server.stdout.on("data", chunk => { serverLog += chunk; }); server.stderr.on("data", chunk => { serverLog += chunk; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-600)); process.exit(1); }
}
const stop = () => { server.kill("SIGTERM"); s3.close(); };
process.on("exit", stop);
const connection = await mysql.createConnection(dbUrl.toString());
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); if (!ok) console.log("FAILED:", name, detail ?? ""); };
const openIdOf = email => `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
const run = randomUUID().slice(0, 6);
const trpcPost = async (token, path, input) => {
  const response = await fetch(`${BASE_URL}/api/trpc/${path}?batch=1`, { method: "POST", headers: { "content-type": "application/json", cookie: `app_session_id=${token}` }, body: JSON.stringify({ 0: { json: input } }) });
  const body = await response.json().catch(() => null);
  return { status: response.status, body: body?.[0] ?? null };
};
const trpcGet = async (token, path, input) => {
  const response = await fetch(`${BASE_URL}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`, { headers: { cookie: `app_session_id=${token}` } });
  const body = await response.json().catch(() => null);
  return { status: response.status, body: body?.[0] ?? null };
};
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const XER = "%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\twbs_cost\n%R\t900\tWZ-WBS-1\tحزمة أعمال الإعداد\t1000\n%T\tTASK\n%F\ttask_code\ttask_name\twbs_id\ttarget_start_date\ttarget_end_date\ttarget_cost\tstatus_code\n%R\tWZ-ACT-1\tنشاط الإعداد\t900\t2026-11-01 00:00:00\t2026-11-05 00:00:00\t500\tTK_Active\n";
const CSV = "﻿WBS Code,WBS Name,Planned Value\nWZ-1.1,الأعمال التمهيدية,100000\nWZ-1.2,الحفر,250000\n";
const invitees = [["cost", "COST_CONTROLLER"], ["design", "DESIGN_COORDINATOR_ARCHITECTURAL"], ["contracts", "CONTRACTS_MANAGER"]];
let lastTenant = null, lastProject = null, lastTokens = [];

for (const [view, viewport, options] of [["desktop", { width: 1280, height: 900 }, {}], ["mobile-390", { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const tag = `${run}${view === "desktop" ? "d" : "m"}`;
  const ownerEmail = `wizard.owner.${tag}@example.test`;
  await upsertUser({ openId: openIdOf(ownerEmail), name: `Wizard owner ${tag}`, email: ownerEmail, loginMethod: "email" });
  const ownerToken = await sdk.issueSession(openIdOf(ownerEmail), { name: `Wizard owner ${tag}` });
  const context = await browser.newContext({ viewport, ...options, locale: "ar-SA" });
  await context.addCookies([{ name: "app_session_id", value: ownerToken, url: BASE_URL }]);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", error => errors.push(String(error.message).slice(0, 160)));

  // 1. company
  await page.goto(`${BASE_URL}/setup?lang=ar`, { waitUntil: "load" });
  await page.getByLabel("الاسم القانوني").waitFor({ timeout: 20_000 });
  check(`${view}: step 1 offers the company form to a person with no company`, await page.getByRole("button", { name: "إنشاء الشركة" }).isVisible());
  check(`${view}: Next is disabled until a company exists`, await page.getByRole("button", { name: "التالي" }).isDisabled());
  await page.getByLabel("الاسم القانوني").fill(`شركة المعالج ${tag}`);
  await page.getByLabel(/المعرّف/).fill(`wizard-${tag}`);
  await page.locator("#setup-plan").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("#setup-plan option").length > 1, null, { timeout: 20_000 });
  await page.locator("#setup-plan").selectOption({ index: 1 });
  await page.getByRole("button", { name: "إنشاء الشركة" }).click();
  await page.getByLabel("رمز المشروع").waitFor({ timeout: 30_000 });
  const [[company]] = await connection.query("SELECT id, legalName FROM companies WHERE slug = ?", [`wizard-${tag}`]);
  check(`${view}: the company was really created`, Boolean(company), company?.legalName);
  const tenantId = company?.id; lastTenant = tenantId;
  check(`${view}: the address carries the company and the project step`, page.url().includes(`/setup/${tenantId}`) && page.url().includes("#project"), page.url());

  // 2. project
  await page.getByLabel("رمز المشروع").fill(`WZ-${tag}`);
  await page.getByLabel("اسم المشروع").fill(`مشروع المعالج ${tag}`);
  await page.getByRole("button", { name: "إنشاء المشروع" }).click();
  await page.getByText("المشروع المعتمد").first().waitFor({ timeout: 30_000 });
  const [[project]] = await connection.query("SELECT id, name FROM projects WHERE tenantId = ? AND code = ?", [tenantId, `WZ-${tag}`]);
  check(`${view}: the first project was really created inside that company`, Boolean(project), project?.name);
  const projectId = project?.id; lastProject = projectId;

  // 3. import (WBS CSV, then the XER schedule)
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("heading", { name: "3. استيراد بيانات المشروع" }).waitFor();
  await page.getByRole("button", { name: "WBS", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "wizard-wbs.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByRole("button", { name: "تحليل الملف" }).click();
  await page.getByRole("button", { name: "تأكيد الاستيراد" }).first().click({ timeout: 30_000 }).catch(async error => { if (process.env.WIZ_SHOT) await page.screenshot({ path: process.env.WIZ_SHOT, fullPage: true }); console.log("CONFIRM NOT OFFERED; the importer says:", (await page.locator("section").filter({ hasText: "تحليل" }).last().innerText().catch(() => "?")).replace(/\s+/g, " ").slice(-800)); throw error; });
  await page.getByText(/أُنشئ|تم الإنشاء|Created/).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.getByRole("button", { name: "الجدول الزمني", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "wizard.xer", mimeType: "text/plain", buffer: Buffer.from(XER) });
  await page.getByRole("button", { name: "تحليل الملف" }).click();
  await page.getByRole("button", { name: "تأكيد الاستيراد" }).first().click({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  const [[wbsCount]] = await connection.query("SELECT COUNT(*) n FROM wbs_items WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
  const [[activityCount]] = await connection.query("SELECT COUNT(*) n FROM activities WHERE tenantId = ? AND projectId = ?", [tenantId, projectId]);
  check(`${view}: the CSV and the XER really wrote WBS items and an activity (screen → database)`, Number(wbsCount.n) >= 3 && Number(activityCount.n) >= 1, { wbs: Number(wbsCount.n), activities: Number(activityCount.n) });

  // 4. invite one person per new template
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByLabel("بريد المدعو").waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("#setup-role option").length > 3, null, { timeout: 30_000 });
  const optionValues = await page.locator("#setup-role option").evaluateAll(options => options.map(option => option.textContent));
  check(`${view}: the ready-made roles are offered by name, without the owner role`, ["كوست كنترول", "منسق التصميم المعماري", "منسق التصميم الفني", "مدير العقود", "المدير التنفيذي", "مسؤول مكتب إدارة المشاريع", "منسق المشاريع"].every(name => optionValues.some(text => (text ?? "").includes(name))) && !optionValues.some(text => /مالك الشركة|TENANT_OWNER/.test(text ?? "")), optionValues);
  lastTokens = [];
  for (const [key, roleCode] of invitees) {
    const [[roleRow]] = await connection.query("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]);
    check(`${view}: template ${roleCode} was installed for the company`, Boolean(roleRow));
    await page.locator("#setup-role").selectOption(roleRow.id);
    await page.getByLabel("بريد المدعو").fill(`wizard.${key}.${tag}@example.test`);
    await page.getByRole("button", { name: "إنشاء الدعوة" }).click();
    await page.getByText(new RegExp(`wizard\\.${key}\\.${tag}@example\\.test`)).first().waitFor({ timeout: 30_000 });
    const link = await page.locator("code").first().textContent();
    lastTokens.push({ key, roleCode, token: new URL(link ?? "", BASE_URL).searchParams.get("token") });
  }
  const [invites] = await connection.query("SELECT i.email, r.code roleCode, i.scopeType, i.scopeId FROM membership_invitations i JOIN roles r ON r.id = i.roleId WHERE i.tenantId = ?", [tenantId]);
  check(`${view}: three invitations exist, one per template, scoped to the first project by default`, invites.length === 3 && invites.every(row => row.scopeType === "project" && row.scopeId === projectId), invites.map(row => `${row.roleCode}/${row.scopeType}`));
  check(`${view}: the finish link goes to the project controls`, (await page.getByRole("link", { name: "إنهاء الإعداد والانتقال إلى المشروع" }).getAttribute("href")) === `/projects/${tenantId}/${projectId}/controls`);
  check(`${view}: no page error while walking the wizard`, errors.length === 0, errors);
  if (view === "mobile-390") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("mobile-390: the wizard does not scroll sideways", overflow <= 1, overflow);
  }
  await context.close();
}

// the invitation links really work, with the scope the wizard promised, and the roles hold the separation the order demands
const inviteeEmail = key => `wizard.${key}.${run}m@example.test`;
for (const { key, roleCode, token } of lastTokens) {
  const email = inviteeEmail(key);
  await upsertUser({ openId: openIdOf(email), name: `Wizard ${key}`, email, loginMethod: "email" });
  const session = await sdk.issueSession(openIdOf(email), { name: `Wizard ${key}` });
  const accepted = await trpcPost(session, "tenant.acceptInvitation", { inviteToken: token });
  check(`invitation link for ${roleCode} is a working invitation`, accepted.status === 200 && !accepted.body?.error, accepted.body?.error?.json?.message ?? accepted.status);
  if (key === "cost") {
    const award = await trpcPost(session, "tenders.award", { tenantId: lastTenant, projectId: lastProject, packageId: randomUUID(), bidId: randomUUID(), contractCode: "X-1" });
    check("NEGATIVE: the invited cost controller is refused a tender award (server)", award.status === 403 || award.status === 401 || /PERMISSION|FORBIDDEN|DENIED/i.test(JSON.stringify(award.body ?? {})), award.status);
    const invite = await trpcPost(session, "tenant.createInvitation", { tenantId: lastTenant, email: `x.${run}@example.test`, roleId: randomUUID(), scopeType: "company" });
    check("NEGATIVE: the invited cost controller cannot invite anyone (server)", invite.status !== 200 || Boolean(invite.body?.error), invite.status);
  }
}
check("the importer really stored the uploaded files (fake S3 received them)", objects.size >= 4, objects.size);
await connection.end(); await browser.close(); stop();
const failed = checks.filter(item => !item.ok);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length, results: checks }, null, 1));
process.exit(failed.length ? 1 : 0);
