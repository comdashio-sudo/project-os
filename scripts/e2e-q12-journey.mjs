// Q-12 in a real browser, against the production build and a real database (the server runs as the restricted application role when SERVER_DATABASE_URL is
// set): an owner of TWO companies invites a planning engineer onto project A from the «Project team» screen; the engineer accepts on the invitation screen
// and, from the same team screen, invites a site engineer, a QA/QC engineer and an HSE engineer; each accepts. Then the daily report: the site engineer saves
// the day's report, the HSE engineer adds a safety event and the QA/QC engineer a material — each seeing their own section only — and the planning engineer
// reads the whole report. NEGATIVES at the API with each person's own session: a section that is not theirs, a whole-report save, company B.
// Accounts are real users with server-issued sessions (sign-in itself is rehearsed by e2e-roles.mjs). Synthetic data only (*.example.test); nothing printed is a secret.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)     pnpm build
//   node --import tsx scripts/e2e-q12-journey.mjs      [Q12_SHOTS=<directory for 390 / 1280 screenshots>]
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { serverDatabaseEnv } from "./lib/serverEnv.mjs";
import mysql from "../server/testing/pgCompat.ts";
import { sdk } from "../server/_core/sdk.ts";
import { upsertUser } from "../server/db.ts";
import { openIdForEmail } from "../server/_core/auth/emailCode.ts";

const PORT = Number(process.env.Q12_PORT ?? 3400);
const BASE_URL = `http://localhost:${PORT}`;
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/")("playwright");
const SHOTS = process.env.Q12_SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const run = randomUUID().slice(0, 6);
const emailOf = key => `q12.${key}.${run}@example.test`;
// creating a company is the platform owner's (db.ts assertMayCreateCompany): here the owner of the two companies is the platform owner (OWNER_EMAIL), as in production
const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), ...serverDatabaseEnv(), OWNER_EMAIL: emailOf("owner"), APP_BASE_URL: BASE_URL, API_RATE_LIMIT_PER_MINUTE: "20000" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", chunk => { serverLog += chunk; }); server.stderr.on("data", chunk => { serverLog += chunk; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE_URL}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (i === 99) { console.error("server did not start:\n" + serverLog.slice(-600)); process.exit(1); }
}
process.on("exit", () => server.kill("SIGTERM"));
const connection = await mysql.createConnection(dbUrl.toString());
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok) }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const openIdOf = email => openIdForEmail(email); // the identity a sign-in by e-mail code gives (the platform owner is matched on it)
const trpc = async (token, path, input, method = "POST") => {
  const query = method === "GET" ? `&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}` : "";
  const response = await fetch(`${BASE_URL}/api/trpc/${path}?batch=1${query}`, { method, headers: { "content-type": "application/json", cookie: `app_session_id=${token}` }, ...(method === "POST" ? { body: JSON.stringify({ 0: { json: input } }) } : {}) });
  const body = (await response.json().catch(() => null))?.[0] ?? null;
  return { ok: response.ok, data: body?.result?.data?.json, error: body?.error?.json?.message };
};

// ---------------------------------------------------------------- five real accounts, none in any company yet
const KEYS = ["owner", "planner", "site", "qc", "hse"];
const people = {};
for (const key of KEYS) {
  const email = emailOf(key);
  await upsertUser({ openId: openIdOf(email), name: `Q12 ${key} ${run}`, email, loginMethod: "email", ...(key === "owner" ? { role: "admin" } : {}) });
  people[key] = { email, token: await sdk.issueSession(openIdOf(email), { name: `Q12 ${key} ${run}` }) };
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
async function pageFor(key, viewport = { width: 1280, height: 900 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options, locale: "ar-SA" });
  await context.addCookies([{ name: "app_session_id", value: people[key].token, url: BASE_URL }]);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(`${key}: ${String(error.message).slice(0, 160)}`));
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

// ---------------------------------------------------------------- 1. the owner holds two companies, each with a project
const created = [];
for (const suffix of ["a", "b"]) {
  const result = await trpc(people.owner.token, "tenant.create", { legalName: `Q12 Builders ${suffix.toUpperCase()} ${run}`, slug: `q12-${run}-${suffix}`, packageCode: "ALL-IN-ONE" });
  if (!result.ok) console.log("tenant.create:", result.error); created.push(result.data?.tenantId);
}
const [companyA, companyB] = created;
check("1. the owner created two companies", companyA && companyB, created);
const projectA = randomUUID(), projectB = randomUUID();
await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'QA-1', 'Q12 Villas A', 'villas', 'SAR', 'active'), (?, ?, 'QB-1', 'Q12 Villas B', 'villas', 'SAR', 'active')", [projectA, companyA, projectB, companyB]);
await trpc(people.owner.token, "tenant.administration", { tenantId: companyA }, "GET"); // the role templates are written on the first administration read
const [roleRows] = await connection.query("SELECT id, code, name FROM roles WHERE tenantId = ?", [companyA]);
const roleName = code => roleRows.find(row => row.code === code)?.name;

// ---------------------------------------------------------------- 2-3. invitations from the «Project team» screen, accepted on the invitation screen
// the screen names a template role in the reader's language
const ROLE_AR = { PLANNING_ENGINEER: "مهندس تخطيط", SITE_ENGINEER: "مهندس موقع", QA_QC_MANAGER: "مدير الجودة", HSE_MANAGER: "مدير السلامة" };
async function inviteFromTeamScreen(inviter, email, roleCode) {
  const page = await pageFor(inviter);
  await page.goto(`${BASE_URL}/projects/${companyA}/${projectA}/team?lang=ar`, { waitUntil: "load" });
  await page.getByLabel("البريد").waitFor({ timeout: 20_000 });
  await page.getByLabel("البريد").fill(email);
  await page.getByRole("combobox").last().click();
  const options = page.getByRole("option"); await options.first().waitFor({ timeout: 15_000 });
  const names = await options.allInnerTexts();
  const pick = names.findIndex(name => name.trim() === roleName(roleCode) || name.trim() === ROLE_AR[roleCode]);
  if (pick < 0) throw new Error(`role ${roleCode} not offered: ${names.join(" | ")}`);
  await options.nth(pick).click();
  await page.getByRole("button", { name: "إرسال الدعوة" }).click();
  const link = await page.locator("code").filter({ hasText: "/invite/accept?token=" }).textContent({ timeout: 15_000 });
  await page.context().close();
  return link.trim();
}
async function acceptOnScreen(key, link) {
  const page = await pageFor(key);
  await page.goto(`${link}&lang=ar`, { waitUntil: "load" });
  await page.getByRole("button", { name: "قبول الدعوة" }).click();
  const done = await page.getByText("تم قبول الدعوة").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await page.context().close();
  return done;
}
// the planning engineer sets projects up for the whole company (project.create at company scope, Q-12 d), so the owner invites them company-wide — the team
// screen offers project roles only; the engineer accepts on the invitation screen
{
  const invite = await trpc(people.owner.token, "tenant.createInvitation", { tenantId: companyA, email: people.planner.email, roleId: roleRows.find(row => row.code === "PLANNING_ENGINEER")?.id, scopeType: "company" });
  check("2. the owner invites the planning engineer to company A; the engineer accepts on the invitation screen", invite.ok && await acceptOnScreen("planner", `${BASE_URL}/invite/accept?token=${invite.data.inviteToken}`), invite.error);
}
for (const [key, code] of [["site", "SITE_ENGINEER"], ["qc", "QA_QC_MANAGER"], ["hse", "HSE_MANAGER"]]) {
  check(`3. the planning engineer invites the ${key} engineer from the team screen; they accept`, await acceptOnScreen(key, await inviteFromTeamScreen("planner", people[key].email, code)));
}
{
  const page = await pageFor("planner");
  await page.goto(`${BASE_URL}/projects/${companyA}/${projectA}/team?lang=ar`, { waitUntil: "load" });
  await page.getByTestId("team-members").locator("li").nth(4).waitFor({ timeout: 20_000 }).catch(() => undefined);
  const team = await page.getByTestId("team-members").innerText();
  check("3. the team screen lists the five on project A", KEYS.every(key => team.includes(people[key].email)), team);
  await shot(page, "q12-journey-team-1280"); await page.context().close();
}

// ---------------------------------------------------------------- 4. the daily report: each writes their own section, on screen
const reportPath = `${BASE_URL}/m/${companyA}/${projectA}/report?lang=ar`;
{
  const page = await pageFor("site");
  await page.goto(reportPath, { waitUntil: "load" });
  await page.getByLabel("ملخص اليوم").fill("صب سقف البلوك 3 — رحلة Q-12");
  await page.getByRole("button", { name: "حفظ المسودة" }).click();
  await page.getByText("حُفظت المسودة").waitFor({ timeout: 15_000 });
  await page.context().close();
}
const [[report]] = await connection.query("SELECT id, summary FROM site_daily_reports WHERE tenantId = ? AND projectId = ?", [companyA, projectA]);
check("4. the site engineer saved the day's report from the screen", report?.summary?.includes("رحلة Q-12"), report);
async function writeMySection(key, fill) {
  const page = await pageFor(key);
  await page.goto(reportPath, { waitUntil: "load" });
  await page.getByRole("button", { name: "حفظ قسمي" }).or(page.getByRole("button", { name: /أضف/ })).first().waitFor({ timeout: 20_000 });
  const before = await page.locator("main, body").first().innerText();
  await fill(page);
  await page.getByRole("button", { name: "حفظ قسمي" }).click();
  const saved = await page.getByText("حُفظ قسمك في التقرير").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await shot(page, `q12-journey-${key}-1280`); await page.context().close();
  return { before, saved };
}
const hse = await writeMySection("hse", async page => { await page.getByRole("button", { name: "أضف حدث سلامة" }).click(); await page.getByLabel("الوصف").last().fill("اجتماع سلامة صباحي — رحلة Q-12"); });
check("4. the HSE engineer saved the safety section from the screen", hse.saved);
check("4. the HSE engineer sees the safety section only (no labour, no materials, not the site's summary)", hse.before.includes("السلامة (HSE)") && !hse.before.includes("المواد المستلمة") && !hse.before.includes("العمالة") && !hse.before.includes("صب سقف"), hse.before.slice(0, 400));
const qc = await writeMySection("qc", async page => { await page.getByRole("button", { name: "أضف مادة" }).click(); await page.getByLabel("المادة").last().fill("حديد تسليح — رحلة Q-12"); await page.getByLabel("الكمية").last().fill("12"); await page.getByLabel("الوحدة").last().fill("طن"); });
check("4. the QA/QC engineer saved the materials section from the screen", qc.saved);
check("4. the QA/QC engineer sees the materials and inspections only (no safety, no site summary)", qc.before.includes("المواد المستلمة") && !qc.before.includes("السلامة (HSE)") && !qc.before.includes("صب سقف"), qc.before.slice(0, 400));
const [[counts]] = await connection.query("SELECT (SELECT count(*) FROM site_daily_report_hse WHERE reportId = ?)::int AS hse, (SELECT count(*) FROM site_daily_report_materials WHERE reportId = ?)::int AS materials", [report.id, report.id]);
check("4. the database holds one safety event and one material in the site engineer's report", counts.hse === 1 && counts.materials === 1, counts);
{
  const page = await pageFor("planner");
  await page.goto(reportPath, { waitUntil: "load" });
  await page.getByText("رحلة Q-12").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const text = await page.locator("body").innerText();
  check("4. the planning engineer reads the whole report: the site's summary, the safety event and the material, with the exports", ["صب سقف البلوك 3", "اجتماع سلامة صباحي", "حديد تسليح", "تنزيل PDF"].every(part => text.includes(part)) && !text.includes("حفظ قسمي"), text.slice(0, 500));
  await shot(page, "q12-journey-planner-1280"); await page.context().close();
}
if (SHOTS) {
  const page = await pageFor("hse", { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(reportPath, { waitUntil: "load" }); await page.getByRole("button", { name: "حفظ قسمي" }).waitFor({ timeout: 20_000 });
  check("4. at 390px the HSE screen has no side scroll", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await shot(page, "q12-journey-hse-390"); await page.context().close();
}

// ---------------------------------------------------------------- 5. NEGATIVES, straight at the API with each person's own session
const refused = async (key, path, input, method) => { const result = await trpc(people[key].token, path, input, method); return !result.ok ? result.error : null; };
check("5. the HSE engineer cannot write the materials section", await refused("hse", "siteReports.saveSection", { tenantId: companyA, projectId: projectA, reportId: report.id, section: "qc", materials: [{ material: "X", quantity: 1, unit: "pcs" }] }));
check("5. the QA/QC engineer cannot write the safety section", await refused("qc", "siteReports.saveSection", { tenantId: companyA, projectId: projectA, reportId: report.id, section: "hse", hse: [{ kind: "incident", description: "X" }] }));
{ const why = await refused("hse", "siteReports.save", { tenantId: companyA, projectId: projectA, reportDate: "2026-01-06", summary: "not mine", lines: [] }); check("5. the HSE engineer cannot save a whole report (the site section is not theirs)", why && /SECTION_NOT_YOURS|section of the daily report/.test(why), why); }
for (const key of ["planner", "site", "qc", "hse"]) {
  check(`5. the ${key} engineer reads nothing of company B`, await refused(key, "projects.list", { tenantId: companyB }, "GET"));
}
const [[after]] = await connection.query("SELECT (SELECT count(*) FROM site_daily_report_hse WHERE reportId = ?)::int AS hse, (SELECT count(*) FROM site_daily_report_materials WHERE reportId = ?)::int AS materials", [report.id, report.id]);
check("5. the refusals wrote nothing", after.hse === 1 && after.materials === 1, after);
check("no error in any page", errors.length === 0, errors);

await browser.close(); await connection.end();
const failed = checks.filter(item => !item.ok).length;
console.log(`\nQ-12 browser journey: ${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
