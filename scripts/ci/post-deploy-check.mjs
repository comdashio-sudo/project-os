// The post-deploy check (2026-10-26, after a release broke sign-in on production while every test was green). It calls the deployed site the way a visitor would:
//   1. /healthz must answer 200;
//   2. the sign-in code check, given a WRONG code, must answer 4xx with the application's own JSON error — never 5xx (a 5xx here is exactly "sign-in is broken");
//   3. /api/readyz says whether the database has what this release names; pending migrations are a WARNING (the release tolerates them), not a failure.
// A host page that is not the application (a protection wall, a 401 from the platform) must not pass for "4xx": the answer has to be the application's JSON `code`.
//
//   node scripts/ci/post-deploy-check.mjs <https://address>      env: BYPASS_SECRET (optional, for a protected preview)
// Exit 0 = healthy, 1 = failed. Prints addresses and statuses, never a secret.
const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(base)) { console.error("usage: node scripts/ci/post-deploy-check.mjs https://address"); process.exit(2); }
const headers = { "content-type": "application/json", ...(process.env.BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.BYPASS_SECRET } : {}) };
const failures = [];

async function call(path, init) {
  try { const response = await fetch(base + path, { ...init, headers: { ...headers, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(20_000) }); return { status: response.status, text: await response.text() }; }
  catch (error) { return { status: 0, text: String(error?.message ?? error) }; }
}

const health = await call("/healthz");
console.log(`healthz: ${health.status}`);
if (health.status !== 200) failures.push(`/healthz answered ${health.status}, not 200`);
if (/schema behind/.test(health.text)) console.log(`::warning title=Schema behind on ${base}::${health.text.trim()} — apply the migrations with the Bootstrap / Supabase setup run.`);

const verify = await call("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ email: "post-deploy-probe@example.test", code: "000000" }) });
let body = null; try { body = JSON.parse(verify.text); } catch { /* not JSON */ }
console.log(`wrong sign-in code: ${verify.status} ${body?.code ?? "(no application code in the answer)"}`);
if (verify.status >= 500 || verify.status === 0) failures.push(`the sign-in code check answered ${verify.status} (a server error) for a wrong code`);
else if (verify.status < 400 || !body || typeof body.code !== "string" || !body.code.startsWith("PROJECT_OS_")) failures.push(`the sign-in code check did not answer with the application's 4xx error (status ${verify.status}); this is not proof that sign-in works`);

const ready = await call("/api/readyz");
let pending = []; try { pending = JSON.parse(ready.text).pendingMigrations ?? []; } catch { /* not JSON */ }
console.log(`readyz: ${ready.status}${pending.length ? ` — migrations pending: ${pending.join(", ")}` : ""}`);
if (ready.status === 503 && pending.length) console.log(`::warning title=Migrations pending on ${base}::${pending.join(", ")} — apply them with the Bootstrap / Supabase setup run. The release tolerates it, but the new features stay off until then.`);

if (failures.length) { for (const failure of failures) console.log(`::error title=Post-deploy check failed::${failure}`); process.exit(1); }
console.log("post-deploy check: ok");
