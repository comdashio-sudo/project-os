import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPABASE_PROJECT_REF, type Fetch } from "../../scripts/bootstrap/lib";
import { cronIsOncePerDay, renderPreflight, runPreflight, type PreflightDeps, type Probe } from "../../scripts/bootstrap/preflight";

// The launch button's pre-flight against SIMULATED Supabase, Vercel, database and S3: read-only, every problem in one list, nothing secret in it.
const REF = SUPABASE_PROJECT_REF;
const SECRETS = { SUPABASE_ACCESS_TOKEN: "sbp_SECRET_TOKEN_VALUE_1", SUPABASE_DB_PASSWORD: "DB_PASSWORD_VALUE_2", VERCEL_TOKEN: "VERCEL_SECRET_VALUE_3", STORAGE_S3_ACCESS_KEY_ID: "S3KEYID_VALUE_4", STORAGE_S3_SECRET_ACCESS_KEY: "S3SECRET_VALUE_5", OWNER_EMAIL: "owner@example.test", SUPABASE_ORGANIZATION_SLUG: "org-dashio" }; // secret-scan:allow: made-up placeholder values to prove they never reach the output
type Reply = { status?: number; body?: unknown };
function simulate(routes: Record<string, Reply | ((url: string) => Reply)>) {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchImpl: Fetch = async (url, init) => {
    const method = init?.method ?? "GET"; calls.push({ method, url });
    const key = `${method} ${url.replace("https://api.supabase.com", "SB").replace("https://api.vercel.com", "VC").replace(/[?&]teamId=[^&]*/, "").replace(/\?$/, "")}`;
    const hit = Object.entries(routes).find(([pattern]) => key === pattern || (pattern.endsWith("*") && key.startsWith(pattern.slice(0, -1))));
    const reply = hit ? (typeof hit[1] === "function" ? hit[1](url) : hit[1]) : { status: 599, body: { message: `unrouted ${key}` } };
    const status = reply.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(reply.body ?? {}) };
  };
  return { fetchImpl, calls };
}
const good = (over: Record<string, Reply> = {}) => ({
  [`GET SB/v1/projects/${REF}`]: { body: { ref: REF, status: "ACTIVE_HEALTHY", region: "ap-southeast-1", organization_slug: "org-dashio", organization_id: "org-uuid", name: "whatever" } },
  "GET SB/v1/organizations/org-dashio": { status: 403, body: { message: "forbidden" } },
  [`GET SB/v1/projects/${REF}/config/auth`]: { body: { smtp_host: "smtp.example.test" } },
  [`GET SB/v1/projects/${REF}/postgrest`]: { body: { db_schema: "public,graphql_public" } },
  [`GET SB/v1/projects/${REF}/api-keys`]: { body: [{ name: "anon", api_key: "ANON_KEY_VALUE" }, { name: "service_role", api_key: "SERVICE_ROLE_VALUE" }] },
  [`GET SB/v1/projects/${REF}/config/database/pooler`]: { body: [{ db_host: "aws-0-ap-southeast-1.pooler.supabase.com", database_type: "PRIMARY" }] },
  "GET VC/v2/user": { body: { user: { id: "u", defaultTeamId: "team_default" } } },
  "GET VC/v9/projects/dashio": { status: 404, body: { error: { code: "not_found" } } },
  "GET VC/v1/integrations/search-repo*": { body: { repos: [{ name: "project-os", namespace: "comdashio-sudo" }] } },
  ...over,
});
const database = (rows: Record<string, Array<Record<string, any>>>): PreflightDeps["openDatabase"] => async () => ({
  query: async sql => {
    const key = Object.keys(rows).find(pattern => sql.includes(pattern));
    return key ? rows[key] : [];
  },
  close: async () => undefined,
} as Probe & { close: () => Promise<void> });
const goodDatabase = () => database({
  "current_user AS name": [{ name: "postgres", superuser: false, createrole: true, version: "15.8" }],
  "FROM pg_roles WHERE rolname = 'project_os_app'": [],
  "storage.buckets": [{ present: true, can_insert: true, can_update: true }],
  "anon','authenticated','service_role'": [{ n: 0 }],
  "__project_os_migrations": [{ n: 9 }],
});
const deps = (routes: Record<string, Reply | ((url: string) => Reply)>, extra: Partial<PreflightDeps> = {}, env: Record<string, string | undefined> = SECRETS): PreflightDeps => ({
  fetch: simulate(routes).fetchImpl, env, openDatabase: goodDatabase(), tryAppRole: async () => "ok", listBuckets: async () => "ok", migrationFilesCount: 9, ...extra,
});
const blocks = (findings: Awaited<ReturnType<typeof runPreflight>>) => findings.filter(item => item.status === "block");

describe("launch pre-flight", () => {
  it("everything in order: no blocking finding, and the plan limits the code respects are said", async () => {
    const findings = await runPreflight(deps(good()));
    expect(blocks(findings)).toEqual([]);
    expect(findings.some(item => item.area === "Vercel" && /سيُنشأ/.test(item.text))).toBe(true);
    expect(findings.some(item => item.area === "حدود الخطة" && item.status === "ok" && /مرة في اليوم/.test(item.text))).toBe(true);
    expect(findings.some(item => item.status === "unknown" && /غير التجاري/.test(item.text))).toBe(true);
  });

  it("READ-ONLY: every request it makes is a GET, nothing is written anywhere", async () => {
    const sim = simulate(good());
    await runPreflight({ ...deps(good()), fetch: sim.fetchImpl });
    expect(sim.calls.length).toBeGreaterThan(6);
    expect(sim.calls.filter(call => call.method !== "GET")).toEqual([]);
  });

  it("collects EVERY problem in one list instead of stopping at the first (expired keys, wrong DB password, bad S3 keys, repo not visible)", async () => {
    const bad = {
      ...good(),
      [`GET SB/v1/projects/${REF}`]: { status: 401, body: { message: "Unauthorized" } },
      "GET VC/v2/user": { status: 403, body: { error: { code: "forbidden", message: "Not authorized" } } },
    };
    const findings = await runPreflight(deps(bad, { openDatabase: async () => { throw Object.assign(new Error("auth"), { code: "28P01" }); }, listBuckets: async () => "InvalidAccessKeyId 403" }));
    const areas = new Set(blocks(findings).map(item => item.area));
    expect(areas).toEqual(new Set(["Supabase", "Vercel", "التخزين", "قاعدة البيانات"]));
    expect(blocks(findings).length).toBeGreaterThanOrEqual(4);
  });

  it("when the pooler host cannot be read the database checks say so (unknown) instead of guessing", async () => {
    const findings = await runPreflight(deps(good({ [`GET SB/v1/projects/${REF}/config/database/pooler`]: { status: 403, body: { message: "forbidden" } } })));
    expect(findings.some(item => item.area === "قاعدة البيانات" && item.status === "unknown")).toBe(true);
    expect(blocks(findings).some(item => /عنوان الـpooler/.test(item.text))).toBe(true);
  });

  it("a wrong database password is named as such (28P01) while the other checks still run", async () => {
    const findings = await runPreflight(deps(good(), { openDatabase: async () => { throw Object.assign(new Error("auth"), { code: "28P01" }); } }));
    expect(blocks(findings).map(item => item.text).join("\n")).toMatch(/SUPABASE_DB_PASSWORD.*28P01/);
    expect(findings.some(item => item.area === "Vercel" && item.status === "ok")).toBe(true);
  });

  it("a paused Supabase project is a blocking finding", async () => {
    const findings = await runPreflight(deps(good({ [`GET SB/v1/projects/${REF}`]: { body: { ref: REF, status: "INACTIVE", organization_slug: "org-dashio" } } })));
    expect(blocks(findings).some(item => /INACTIVE/.test(item.text))).toBe(true);
  });

  it("no custom SMTP is a warning that carries the owner's one action, not a block", async () => {
    const findings = await runPreflight(deps(good({ [`GET SB/v1/projects/${REF}/config/auth`]: { body: {} } })));
    const smtp = findings.find(item => /SMTP/.test(item.text));
    expect(smtp?.status).toBe("warn");
    expect(smtp?.text).toMatch(/Authentication ← Emails ← SMTP Settings/);
    expect(blocks(findings)).toEqual([]);
  });

  it("the owner account's powers: no CREATEROLE, no INSERT on storage.buckets, a role holding a forbidden power -- each is a block with its own words", async () => {
    const findings = await runPreflight(deps(good(), { openDatabase: database({
      "current_user AS name": [{ name: "postgres", superuser: false, createrole: false, version: "15.8" }],
      "FROM pg_roles WHERE rolname = 'project_os_app'": [{ rolcanlogin: true, rolsuper: false, rolcreatedb: true, rolcreaterole: false, rolbypassrls: false, rolreplication: false }],
      "storage.buckets": [{ present: true, can_insert: false, can_update: true }],
      "anon','authenticated','service_role'": [{ n: 3 }],
      "__project_os_migrations": [{ n: 9 }],
    }) }));
    const text = blocks(findings).map(item => item.text).join("\n");
    expect(text).toMatch(/CREATEROLE/);
    expect(text).toMatch(/storage\.buckets/);
    expect(text).toMatch(/createdb/);
    expect(findings.some(item => item.status === "warn" && /Data API/.test(item.text))).toBe(true);
  });

  it("Vercel: a project linked to another repository, a repository Vercel cannot see, and a token whose scope excludes the account are each a block", async () => {
    const other = await runPreflight(deps(good({ "GET VC/v9/projects/dashio": { body: { id: "p", link: { type: "github", org: "someone-else", repo: "other" } } } })));
    expect(blocks(other).some(item => /مستودع آخر/.test(item.text))).toBe(true);
    const unseen = await runPreflight(deps(good({ "GET VC/v1/integrations/search-repo*": { body: { repos: [] } } })));
    expect(blocks(unseen).some(item => /لا يرى المستودع/.test(item.text) && /Installed GitHub Apps/.test(item.text))).toBe(true);
    const scope = await runPreflight(deps(good({ "GET VC/v9/projects/dashio": { status: 403, body: { error: { code: "forbidden", message: "Not authorized: Trying to access resource under scope" } } } })));
    expect(blocks(scope).some(item => /403.*Not authorized/.test(item.text) && /VERCEL_TEAM_ID/.test(item.text))).toBe(true);
  });

  it("the team the token acts for is discovered when VERCEL_TEAM_ID is empty, and every Vercel read then carries it", async () => {
    const sim = simulate(good());
    const findings = await runPreflight({ ...deps(good()), fetch: sim.fetchImpl });
    expect(findings.some(item => /اكتُشف تلقائيًا/.test(item.text) && /team_default/.test(item.text))).toBe(true);
    expect(sim.calls.filter(call => call.url.includes("/v9/projects/dashio")).every(call => call.url.includes("teamId=team_default"))).toBe(true);
  });

  it("missing secrets are named (never their values), and the S3 keys are optional", async () => {
    const findings = await runPreflight(deps(good(), {}, { OWNER_EMAIL: "o@example.test" }));
    const text = blocks(findings).map(item => item.text).join("\n");
    expect(text).toMatch(/SUPABASE_ACCESS_TOKEN/); expect(text).toMatch(/SUPABASE_DB_PASSWORD/); expect(text).toMatch(/VERCEL_TOKEN/);
    expect(findings.some(item => item.status === "warn" && /STORAGE_S3_ACCESS_KEY_ID/.test(item.text))).toBe(true);
  });

  it("NO secret value appears anywhere in the findings or the rendered list", async () => {
    const findings = await runPreflight(deps(good({ "GET VC/v9/projects/dashio": { status: 403, body: { error: { message: "denied" } } } }), { listBuckets: async () => "InvalidAccessKeyId 403" }));
    const everything = JSON.stringify(findings) + renderPreflight(findings).join("\n");
    for (const [name, value] of Object.entries(SECRETS)) if (name.includes("TOKEN") || name.includes("PASSWORD") || name.includes("S3")) expect(everything, name).not.toContain(value);
    expect(everything).not.toContain("ANON_KEY_VALUE"); expect(everything).not.toContain("SERVICE_ROLE_VALUE");
  });

  it("renders by area with an icon per status, in Arabic", async () => {
    const lines = renderPreflight(await runPreflight(deps(good({ [`GET SB/v1/projects/${REF}/config/auth`]: { body: {} } }))));
    expect(lines.some(line => line === "**Supabase**")).toBe(true);
    expect(lines.some(line => line.startsWith("- 🟡"))).toBe(true);
    expect(lines.some(line => line.startsWith("- ✅"))).toBe(true);
    expect(lines.some(line => line.startsWith("- ❔"))).toBe(true);
  });
});

describe("plan limits the code relies on", () => {
  it("the free-plan cron is exactly one job and it fires once a day; the pro set is not used unless asked", () => {
    expect(cronIsOncePerDay("0 2 * * *")).toBe(true);
    for (const frequent of ["*/5 * * * *", "0 * * * *", "0 2 * * 1,3", "0 2,14 * * *"]) expect(cronIsOncePerDay(frequent), frequent).toBe(false);
    const build = readFileSync(path.resolve(__dirname, "../../scripts/build-vercel.mjs"), "utf8");
    const free = /: \[\{ path: "(\/api\/scheduled\/daily)", schedule: "([^"]+)" \}\]/.exec(build);
    expect(free?.[1]).toBe("/api/scheduled/daily");
    expect(cronIsOncePerDay(free![2])).toBe(true);
    expect(build).toMatch(/const PRO_CRONS = process\.env\.CRON_PLAN === "pro"/);
    expect(build).toMatch(/regions: \[REGION\]/); // one region: what Hobby allows
  });
});
