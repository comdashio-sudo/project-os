// Q-22 (adviser's decision I24): the readiness journey ON PRODUCTION, run by one manual GitHub Actions button (.github/workflows/readiness-journey.yml).
// It needs no secret from the owner: with the database secrets the launch button already uses it makes its own invented company and one invented person,
// gives that person a one-run password at Supabase Auth, then walks the platform's own HTTP API and pages exactly as a person would:
//   sign in with the password → a project → its villas and activities imported (direct upload to Storage, background analysis, confirm) → one villa chosen →
//   progress COMPLETE and QC received on one activity → the platform's own read-back says what was entered → screenshots at 390 and 1280
// and at the end takes the password away (the person can no longer sign in). Nothing outside its own company is read or written; every name is invented.
//
//   run      (default) the journey; every check printed, a JSON summary on the last line; exit 1 when any check fails
//   disable  only takes the password away
//
// Environment: DATABASE_URL (the owner connection the bootstrap step builds; locally the test database), READINESS_BASE_URL (the site), JWT_SECRET (any value: the
// server code it loads asks for one; no session is minted here), OUT_DIR (screenshots), PLAYWRIGHT_MODULE_DIR / PLAYWRIGHT_CHROMIUM (as tests/ui/audit.mjs).
// The password is random per run, masked in Actions, never printed or stored anywhere but Supabase Auth's bcrypt column.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";
import { openIdForEmail } from "../../server/_core/auth/emailCode.ts";
import { createTenantForUser, upsertUser } from "../../server/db.ts";

const ACTION = process.argv[2] ?? "run";
const BASE_URL = (process.env.READINESS_BASE_URL ?? "").replace(/\/+$/, "");
const OUT_DIR = process.env.OUT_DIR ?? "./readiness-out";
const EMAIL = "readiness.journey@readiness.example.test";
// the audience Supabase Auth signs its users into: "authenticated" on Supabase; a local GoTrue (scripts/gotrue-local.mjs) is configured with none
const AUTH_AUDIENCE = process.env.READINESS_AUTH_AUDIENCE ?? "authenticated";
const COMPANY = { legalName: "شركة اختبار الجاهزية (مختلقة)", slug: "readiness-test" };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(2); }
if (ACTION === "run" && !/^https?:\/\//.test(BASE_URL)) { console.error("READINESS_BASE_URL (the site) is required."); process.exit(2); }

mkdirSync(OUT_DIR, { recursive: true });
// on Supabase the bootstrap step also gives the certificate authority (verified TLS), as for every other step that connects
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ...(process.env.DATABASE_SSL_CA ? { ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA } } : {}) });
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 400)}`}`); };

/** The one invented person's password at Supabase Auth: replaced each run (bcrypt by pgcrypto in the database), or removed. */
async function setPassword(password) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = $1)", [EMAIL]);
    await client.query("DELETE FROM auth.users WHERE lower(email) = $1", [EMAIL]);
    if (password) {
      const id = randomUUID();
      // pgcrypto lives in the `extensions` schema on Supabase; a plain PostgreSQL may have it in public
      const crypt = (await client.query("SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'crypt' LIMIT 1")).rows[0]?.nspname;
      if (!crypt) throw new Error("pgcrypto is not installed in this database");
      await client.query(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change)
        VALUES ('00000000-0000-0000-0000-000000000000', $1::uuid, $4, $4, $2, "${crypt}".crypt($3, "${crypt}".gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')`, [id, EMAIL, password, AUTH_AUDIENCE]);
      await client.query(`INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES ($1::uuid, $1::uuid, $1::text, $2::jsonb, 'email', now(), now(), now())`, [id, JSON.stringify({ sub: id, email: EMAIL, email_verified: true })]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

if (ACTION === "disable") {
  await setPassword(null);
  console.log(JSON.stringify({ disabled: EMAIL }));
  await pool.end(); process.exit(0);
}

// ------------------------------------------------------------------------------------------------ 1. the invented company and person (the app's own functions)
const openId = openIdForEmail(EMAIL);
await upsertUser({ openId, name: "مهندس اختبار الجاهزية (مختلق)", email: EMAIL, loginMethod: "password" });
const userId = Number((await pool.query("SELECT id FROM users WHERE open_id = $1", [openId])).rows[0].id);
let tenantId = (await pool.query("SELECT id FROM companies WHERE slug = $1", [COMPANY.slug])).rows[0]?.id;
if (!tenantId) ({ tenantId } = await createTenantForUser({ userId, ...COMPANY, packageCode: "ALL-IN-ONE" }));
check("the invented company exists and its owner is the invented person", Boolean(tenantId));
const password = randomBytes(24).toString("base64url");
if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${password}`);
await setPassword(password);

// ------------------------------------------------------------------------------------------------ 2. sign in with the password, over HTTP
let cookie = "";
try {
  const signIn = await fetch(`${BASE_URL}/api/auth/password/sign-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password }) });
  cookie = (signIn.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).map(part => part.split(";")[0].trim()).filter(part => part.startsWith("app_session_id=")).join("; ");
  check("sign-in with the password answers 200 and sets the session cookie", signIn.status === 200 && cookie, { status: signIn.status });
} catch (error) { check("sign-in with the password answers 200 and sets the session cookie", false, String(error)); }

const wire = input => ({ json: input });
async function trpc(procedure, input, method = "GET") {
  const url = method === "POST" ? `${BASE_URL}/api/trpc/${procedure}?batch=1` : `${BASE_URL}/api/trpc/${procedure}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: wire(input) }))}`;
  const response = await fetch(url, { method, headers: { "content-type": "application/json", cookie }, body: method === "POST" ? JSON.stringify({ 0: wire(input) }) : undefined });
  const [body] = await response.json();
  if (body.error) throw new Error(`${procedure}: ${body.error.json?.message ?? response.status}`);
  return body.result.data.json;
}
const today = new Date().toISOString().slice(0, 10);
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14); // to the second: two runs in one minute are two projects

/** One file the way the browser sends it: a signed URL from the server, a PUT straight to Storage, then the background analysis and the confirm. */
async function importFile(projectId, moduleCode, fileName, csv) {
  const target = await trpc("dataImports.createUpload", { tenantId, projectId, moduleCode, fileName, sourceFormat: "csv" }, "POST");
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(csv, "utf8") });
  if (!put.ok) throw new Error(`upload ${moduleCode}: ${put.status}`);
  const registered = await trpc("dataImports.registerUpload", { tenantId, projectId, moduleCode, fileName, sourceFormat: "csv", uploadKey: target.uploadKey }, "POST");
  const settle = async () => { for (let i = 0; i < 240; i += 1) { const view = await trpc("dataImports.progress", { tenantId, projectId, importId: registered.id }); if (view.status !== "analyzing" && view.status !== "importing") return view; await new Promise(resolve => setTimeout(resolve, 500)); } throw new Error(`${moduleCode}: still running`); };
  const analysed = await settle();
  if (analysed.status !== "validated") throw new Error(`${moduleCode}: ${analysed.status} ${JSON.stringify(analysed.external?.report ?? analysed.analysis?.errors ?? null).slice(0, 300)}`);
  const confirmed = await trpc("dataImports.confirm", { tenantId, projectId, importId: registered.id }, "POST");
  return confirmed.status === "completed" ? confirmed : settle();
}

// ------------------------------------------------------------------------------------------------ 3. the journey: project → imports → one villa → progress and QC → read back
const VILLAS = ["R101", "R102", "R103", "R104", "R105", "R106"];
let projectId = "";
try {
  if (cookie) {
    const project = await trpc("projects.create", { tenantId, code: `RDY-${stamp}`, name: `مشروع الجاهزية المختلق ${stamp}`, projectType: "villas", currency: "SAR" }, "POST");
    projectId = project.id;
    // the block and model codes carry the run's stamp: the platform refuses a file already imported in the company (its hash), so each run's files differ
    const tag = stamp.slice(-8);
    check("a project is created in the invented company", Boolean(projectId));
    const units = await importFile(projectId, "pmc.locations", "villas.csv", ["Block Code,Unit Number,Model Code", ...VILLAS.map(villa => `RB${tag},${villa.slice(1)},M${tag}`)].join("\n"));
    check("the villa list is imported (direct upload, background analysis, confirm)", units.status === "completed" && Number(units.createdRows) === VILLAS.length, units);
    const catalog = await importFile(projectId, "pmc.catalog", "activities.csv", ["Model,Group Code,Group Name,Stage Code,Stage Name,Activity Code,Activity Name,Weight", `M${tag},G1,هيكل,S1,خرسانة,RDY-1,صب القواعد,60`, `M${tag},G1,هيكل,S1,خرسانة,RDY-2,صب الأعمدة,40`].join("\n"));
    check("the activities and weights are imported", catalog.status === "completed" && Number(catalog.createdRows) === 2, catalog);
    const villa = "102";
    const progress = await trpc("pmc.updateProgress", { tenantId, projectId, activityCode: "RDY-1", villas: [villa], status: "COMPLETE", date: today, clientRequestId: randomUUID() }, "POST");
    check("progress COMPLETE is recorded for one villa and one activity", progress && !progress.error, progress);
    const qc = await trpc("pmc.updateQcReceipts", { tenantId, projectId, activityCode: "RDY-1", villas: [villa], received: true, date: today, clientRequestId: randomUUID() }, "POST");
    check("QC receipt is recorded for the same villa and activity", qc && !qc.error, qc);
    const states = await trpc("pmc.villaStates", { tenantId, projectId, villa });
    const of = code => states?.activities?.find(activity => activity.code === code);
    check("the villa's own read-back: RDY-1 complete and received by QC, RDY-2 not started and not received", of("RDY-1")?.siteStatus === "COMPLETE" && of("RDY-1")?.qcReceived === true && of("RDY-2")?.siteStatus === "NOT_STARTED" && !of("RDY-2")?.qcReceived, states);
    const overall = await trpc("pmc.progress", { tenantId, projectId });
    // one villa of six (equal weights) at 60% (the activity's weight) is 10% of the project, and that villa itself reads 60%
    const unit = overall?.units?.find(item => String(item.unitNumber) === villa);
    check("the progress is what was entered: the villa 60%, the project 60% of one villa of six = 10%", Math.abs(Number(unit?.progressPercent) - 60) < 0.01 && Math.abs(Number(overall?.projectProgressPercent) - 10) < 0.01, { villa: unit?.progressPercent, project: overall?.projectProgressPercent });
  }
} catch (error) { check("the journey through the API", false, String(error?.message ?? error)); }

// ------------------------------------------------------------------------------------------------ 4. the pages a person sees, at 390 and 1280
try {
  if (cookie && projectId) {
    const require = createRequire(path.join(process.env.PLAYWRIGHT_MODULE_DIR ?? "/opt/node-tools/node_modules/", "noop.js"));
    const { chromium } = require("playwright");
    mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
    const value = cookie.replace(/^app_session_id=/, "");
    for (const [name, route] of [["unit", `/m/${tenantId}/${projectId}/unit/102`], ["pmc", `/projects/${tenantId}/${projectId}/pmc`]]) {
      for (const width of [390, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
        await context.addCookies([{ name: "app_session_id", value, url: BASE_URL }]);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(String(error)));
        const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        await page.screenshot({ path: path.join(OUT_DIR, `readiness-${name}-${width}.png`), fullPage: true });
        check(`${name} page at ${width}: loads, no page error, no horizontal scroll`, response?.ok() && !errors.length && !scroll, { status: response?.status(), errors, scroll });
        await context.close();
      }
    }
    await browser.close();
  }
} catch (error) { check("the pages at 390 and 1280", false, String(error?.message ?? error)); }

// ------------------------------------------------------------------------------------------------ 5. the password is taken away; the summary
await setPassword(null);
const gone = Number((await pool.query("SELECT COUNT(*)::int AS n FROM auth.users WHERE lower(email) = $1", [EMAIL])).rows[0].n) === 0;
let refused = false;
try { refused = (await fetch(`${BASE_URL}/api/auth/password/sign-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password }) })).status === 401; } catch { refused = false; }
check("the invented person's password is taken away at the end: the same password is now refused (401)", gone && refused, { gone, refused });
await pool.end();
const failed = checks.filter(item => !item.ok).length;
writeFileSync(path.join(OUT_DIR, "readiness.json"), JSON.stringify({ base: BASE_URL, tenantId, projectId, checks }, null, 2));
console.log(JSON.stringify({ checks: checks.length, failed, tenantId, projectId }));
process.exit(failed ? 1 : 0);
