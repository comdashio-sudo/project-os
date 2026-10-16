// Rehearses the first deployment on THIS machine, the way Render will run it: the production build, started with the environment the
// blueprint (render.yaml) gives it, a fake mail provider on 127.0.0.1 instead of Resend, and the test database instead of TiDB.
// It does the checks you would do on a phone after the real deploy (docs/GO_LIVE.md, step 5), over HTTP, and reports each as ok/failed.
//
//   . env (DATABASE_URL naming project_os_integration_test)
//   node scripts/migrate.mjs           # what Render's preDeployCommand does
//   pnpm build
//   node scripts/deploy-rehearsal.mjs                      [PORT=3400]
//
// Nothing leaves the machine: the mail provider is a local fake (RESEND_API_URL accepts a loopback address only), the database is the
// local test database, and storage is left unconfigured (R2 is the one account whose absence only disables file features). Exit code 1
// when any check fails. No secret is printed: the keys are generated here for this run and never written to the output.
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
if (!existsSync("dist/index.js")) { console.error("dist/index.js is missing: run `pnpm build` first (this is what Render's build step does)."); process.exit(2); }
const PORT = Number(process.env.PORT ?? 3400);
const BASE = `http://localhost:${PORT}`;
const ownerEmail = `owner.${randomBytes(3).toString("hex")}@rehearsal.example.test`;
const secrets = { jwt: randomBytes(32).toString("hex"), cron: randomBytes(24).toString("hex"), resend: `fake-${randomUUID()}` };

// fake Resend: POST /emails, remembers the last message per recipient
const inbox = new Map();
const mail = createServer((request, response) => {
  let body = "";
  request.on("data", chunk => { body += chunk; });
  request.on("end", () => {
    const message = JSON.parse(body || "{}");
    for (const to of message.to ?? []) inbox.set(String(to).toLowerCase(), { text: String(message.text ?? ""), subject: String(message.subject ?? ""), authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json" }).end('{"id":"fake"}');
  });
});
await new Promise(resolve => mail.listen(0, "127.0.0.1", resolve));

// the environment render.yaml gives the web service (values it generates are generated here; the ones it asks for are set to local stand-ins)
const environment = {
  ...process.env,
  NODE_VERSION: "22", NODE_ENV: "production", PORT: String(PORT), JWT_SECRET: secrets.jwt, CRON_SECRET: secrets.cron,
  API_RATE_LIMIT_PER_MINUTE: "600", LLM_ENABLED: "false", EMAIL_NOTIFICATIONS_ENABLED: "false",
  OWNER_EMAIL: ownerEmail, APP_BASE_URL: BASE, RESEND_API_KEY: secrets.resend, EMAIL_FROM: "PROJECT OS <login@mail.rehearsal.example.test>",
  RESEND_API_URL: `http://127.0.0.1:${mail.address().port}/emails`,
};
// REHEARSAL_RESTRICTED=1 keeps PROJECT_OS_APP_DB_PASSWORD, i.e. rehearses the state AFTER the audit_logs protection step (docs/GO_LIVE.md, step 6)
for (const unset of [...(process.env.REHEARSAL_RESTRICTED ? [] : ["PROJECT_OS_APP_DB_PASSWORD"]), "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "LLM_API_KEY", "LLM_BASE_URL"]) delete environment[unset];
const server = spawn(process.execPath, ["dist/index.js"], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; server.stdout.on("data", chunk => { log += chunk; }); server.stderr.on("data", chunk => { log += chunk; });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 160) }); console.log(`${ok ? "ok    " : "FAILED"} ${name}${ok || !detail ? "" : ` — ${String(detail).slice(0, 160)}`}`); };
const asHttps = { "x-forwarded-proto": "https" }; // Render terminates TLS and forwards this header

let up = false;
for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(`${BASE}/healthz`)).ok; } catch { await new Promise(resolve => setTimeout(resolve, 200)); } }
check("the production build starts with Render's environment", up, log.slice(-300));
if (!up) { server.kill(); mail.close(); process.exit(1); }

const health = await fetch(`${BASE}/healthz`);
check("/healthz answers 200 'ok' and is never cached", health.status === 200 && (await health.text()) === "ok" && health.headers.get("cache-control") === "no-store");

const home = await fetch(`${BASE}/`, { headers: asHttps });
const html = await home.text();
check("the home page serves the built client", home.status === 200 && /<div id="root"/.test(html));
const asset = /(?:src|href)="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
check("a built script loads (the client files are in the image)", Boolean(asset) && (await fetch(`${BASE}${asset}`)).status === 200, String(asset));
const h = home.headers;
check("security headers: CSP, HSTS, frame, sniffing, referrer", Boolean(h.get("content-security-policy")) && /max-age=\d+/.test(h.get("strict-transport-security") ?? "") && h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff" && Boolean(h.get("referrer-policy")), [...h.keys()].join(","));
const missingApi = await fetch(`${BASE}/api/definitely-not-here`, { headers: { accept: "application/json" } });
const missingApiBody = await missingApi.text();
check("an unknown API address is a plain 404 with no technical detail", missingApi.status === 404 && missingApiBody.length < 200 && !/at |stack|node_modules/i.test(missingApiBody), missingApiBody.slice(0, 80));
const spaFallback = await fetch(`${BASE}/some/page/that/does/not/exist`, { headers: { accept: "text/html", ...asHttps } });
check("an unknown page opens the app (which shows its own Arabic 'not found' page)", spaFallback.status === 200 && /<div id="root"/.test(await spaFallback.text()));

const config = await (await fetch(`${BASE}/api/auth/config`)).json();
check("sign-in config: e-mail code on, Google off", config.emailCode === true && config.google === false, JSON.stringify(config));
const anonymous = await fetch(`${BASE}/api/trpc/auth.me`);
check("a visitor is nobody (auth.me is null)", anonymous.status === 200 && /"json":null/.test(await anonymous.text()));
const protectedCall = await fetch(`${BASE}/api/trpc/tenant.mine`);
check("a protected call without a session is refused (401)", protectedCall.status === 401);

// sign in with the fake provider, exactly as the login screen does
const request = await fetch(`${BASE}/api/auth/email/request`, { method: "POST", headers: { "content-type": "application/json", ...asHttps }, body: JSON.stringify({ email: ownerEmail }) });
check("asking for a sign-in code succeeds", request.status === 200, request.status);
const received = inbox.get(ownerEmail);
const code = /\b(\d{6})\b/.exec(received?.text ?? "")?.[1];
check("the code reaches the mail provider with the sender's key, addressed to the owner", Boolean(code) && received.authorization === `Bearer ${secrets.resend}`);
const verify = await fetch(`${BASE}/api/auth/email/verify`, { method: "POST", headers: { "content-type": "application/json", ...asHttps }, body: JSON.stringify({ email: ownerEmail, code }) });
const setCookie = verify.headers.get("set-cookie") ?? "";
const cookie = /app_session_id=([^;]+)/.exec(setCookie)?.[1];
check("the code signs the owner in with a Secure, HttpOnly, SameSite session cookie", verify.status === 200 && Boolean(cookie) && /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=(Lax|Strict)/i.test(setCookie), setCookie.replace(/app_session_id=[^;]+/, "app_session_id=…"));
const reuse = await fetch(`${BASE}/api/auth/email/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ownerEmail, code }) });
check("the same code does not work twice", reuse.status === 401, reuse.status);
const me = await (await fetch(`${BASE}/api/trpc/auth.me`, { headers: { cookie: `app_session_id=${cookie}` } })).text();
check("the session is recognised: OWNER_EMAIL is the platform administrator", me.includes(ownerEmail) && /"role":"admin"/.test(me), me.slice(0, 120));
const mine = await fetch(`${BASE}/api/trpc/tenant.mine`, { headers: { cookie: `app_session_id=${cookie}` } });
check("the database answers for a signed-in person (migrations are in place)", mine.status === 200, mine.status);
await fetch(`${BASE}/api/trpc/auth.logout`, { method: "POST", headers: { cookie: `app_session_id=${cookie}`, "content-type": "application/json", ...asHttps }, body: "{}" });
const afterLogout = await fetch(`${BASE}/api/trpc/tenant.mine`, { headers: { cookie: `app_session_id=${cookie}` } });
check("signing out ends the session on the server (the old cookie is refused)", afterLogout.status === 401, afterLogout.status);

const refused = await fetch(`${BASE}/api/scheduled/licenseExpiry`, { method: "POST" });
const allowed = await fetch(`${BASE}/api/scheduled/licenseExpiry`, { method: "POST", headers: { authorization: `Bearer ${secrets.cron}` } });
check("the scheduled job refuses a caller without the secret and runs for the cron secret", refused.status === 403 && allowed.status === 200, `${refused.status}/${allowed.status}`);

const leaks = [ownerEmail, code, secrets.jwt, secrets.cron, secrets.resend].filter(value => value && log.includes(value));
check("the server log holds no e-mail address, code or key from this run", leaks.length === 0, `${leaks.length} found`);

server.kill();
mail.close();
const failed = results.filter(item => !item.ok);
console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed: failed.map(item => item.name) }));
process.exit(failed.length ? 1 : 0);
