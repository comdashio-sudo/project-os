import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_LINK_INSTRUCTION, GuardError, TEMPLATE_TIER_INSTRUCTION, isTemplateTierRefusal, ManualStep, SUPABASE_PROJECT_REF, checkHealth, connectionUrls, deriveAppRolePassword, normalizeOwnerEmail, productionEnv, supabaseApi, vercelApi, type Fetch,
} from "../../scripts/bootstrap/lib";

// The launch bootstrap against a SIMULATED Supabase and Vercel: the guards must refuse a wrong project, a wrong organisation and a Vercel project of
// that name linked to another repository, and in every refusal nothing may have been written and no other project may have been read.
type Call = { method: string; url: string; body?: unknown };
function simulate(routes: Record<string, (call: Call) => { status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    const call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const key = `${call.method} ${url.replace("https://api.supabase.com", "").replace("https://api.vercel.com", "").replace(/\?.*$/, "")}`;
    const route = routes[key];
    if (!route) return { ok: false, status: 599, text: async () => JSON.stringify({ message: `unrouted ${key}` }) };
    const { status = 200, body = {} } = route(call);
    return { ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
  return { fetchImpl, calls, writes: () => calls.filter(call => call.method !== "GET") };
}
const REF = SUPABASE_PROJECT_REF;
const supabaseOk = (over: { id?: string; org?: string; orgName?: string } = {}) => ({
  [`GET /v1/projects/${REF}`]: () => ({ body: { id: "7a7d2d7e-0000-4000-8000-000000000001", ref: over.id ?? REF, organization_id: "org-uuid", organization_slug: over.org ?? "org-dashio", region: "ap-southeast-1", name: "dashio", status: "ACTIVE_HEALTHY" } }), // V1ProjectWithDatabaseResponse: `ref` is the project reference
  [`GET /v1/organizations/${over.org ?? "org-dashio"}`]: () => ({ body: { id: "org-uuid", slug: over.org ?? "org-dashio", name: over.orgName ?? "dashio" } }), // OrganizationResponseV1
});

describe("Supabase guard: one project, inside one organisation, checked before any write", () => {
  it("passes for the expected project in the organisation named dashio, reading nothing else", async () => {
    const sim = simulate(supabaseOk());
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).resolves.toMatchObject({ region: "ap-southeast-1", organisationCheck: "organisation" });
    expect(sim.writes()).toEqual([]);
    expect(sim.calls.map(call => call.url)).toEqual([`https://api.supabase.com/v1/projects/${REF}`, "https://api.supabase.com/v1/organizations/org-dashio"]);
  });

  it("REFUSES a different project id: nothing is read beyond that project, nothing is written", async () => {
    const sim = simulate(supabaseOk({ id: "someotherprojectref000000" }));
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toBeInstanceOf(GuardError);
    expect(sim.writes()).toEqual([]);
    expect(sim.calls).toHaveLength(1);
  });

  it("REFUSES the right project inside a differently named organisation, in Arabic", async () => {
    const sim = simulate(supabaseOk({ orgName: "another-company" }));
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toThrow(/منظمة غير "dashio"/);
    expect(sim.writes()).toEqual([]);
  });

  const scoped = () => simulate({ ...supabaseOk(), [`GET /v1/organizations/org-dashio`]: () => ({ status: 403, body: { message: "forbidden" } }) });

  it("a project-scoped token (Resource access = Project) cannot read the organisation: the project's organisation id must equal the pinned one, and then it PASSES", async () => {
    const sim = scoped();
    const target = await supabaseApi(sim.fetchImpl, "t").assertTarget(" ORG-DASHIO\n");
    expect(target).toMatchObject({ organisationCheck: "pinned", organisationSlug: "org-dashio", region: "ap-southeast-1" });
    expect(sim.writes()).toEqual([]);
  });

  it("the same token with NO pin: REFUSES in Arabic, prints the organisation the project names and the exact variable to set, writes nothing", async () => {
    const sim = scoped();
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toBeInstanceOf(GuardError);
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget("")).rejects.toThrow(/SUPABASE_ORGANIZATION_SLUG والقيمة org-dashio/);
    expect(sim.writes()).toEqual([]);
  });

  it("the same token with a pin that does not match the project's organisation: REFUSES in Arabic before any write", async () => {
    const sim = scoped();
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget("another-org")).rejects.toThrow(/لا تطابق المنظمة المثبَّتة/);
    expect(sim.writes()).toEqual([]);
  });

  it("an organisation read that fails for any other reason (a server error) still REFUSES, in Arabic: only 401/403/404 move to the project's data", async () => {
    const sim = simulate({ ...supabaseOk(), [`GET /v1/organizations/org-dashio`]: () => ({ status: 500, body: { message: "boom" } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toThrow(/تعذّرت قراءة المنظمة/);
    expect(sim.writes()).toEqual([]);
  });

  it("when the organisation CAN be read its name is still compared (readable and wrong is not rescued by the project's name)", async () => {
    const sim = simulate(supabaseOk({ orgName: "another-company" }));
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toThrow(/منظمة غير "dashio"/);
    expect((await supabaseApi(simulate(supabaseOk()).fetchImpl, "t").assertTarget()).organisationCheck).toBe("organisation");
  });

  it("REFUSES a project that does not name its organisation", async () => {
    const sim = simulate({ [`GET /v1/projects/${REF}`]: () => ({ body: { id: "7a7d2d7e-0000-4000-8000-000000000001", ref: REF } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toBeInstanceOf(GuardError);
  });

  it("never lists projects or organisations: every path it can call names the one project (or its organisation)", async () => {
    const sim = simulate({
      ...supabaseOk(),
      [`PATCH /v1/projects/${REF}/config/auth`]: () => ({ body: {} }),
      [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false, mailer_subjects_confirmation: "رمز الدخول إلى Dashio | Dashio sign-in code", mailer_templates_confirmation_content: "T", mailer_subjects_magic_link: "رمز الدخول إلى Dashio | Dashio sign-in code", mailer_templates_magic_link_content: "T" } }),
      [`PATCH /v1/projects/${REF}/postgrest`]: () => ({ body: {} }),
      [`GET /v1/projects/${REF}/postgrest`]: () => ({ body: { db_schema: "graphql_public" } }),
      [`GET /v1/projects/${REF}/api-keys`]: () => ({ body: [{ name: "service_role", api_key: "SERVICE-ROLE-MUST-NOT-LEAK" }, { name: "anon", api_key: "anon-key-value" }] }),
      [`GET /v1/projects/${REF}/config/database/pooler`]: () => ({ body: [{ identifier: "x", database_type: "READ_REPLICA", db_user: "postgres", db_host: "replica-0.pooler.supabase.com", db_port: 6543, db_name: "postgres", pool_mode: "transaction", is_using_scram_auth: true }, { identifier: "x", database_type: "PRIMARY", db_user: "postgres", db_host: "aws-0-ap-southeast-1.pooler.supabase.com", db_port: 6543, db_name: "postgres", pool_mode: "transaction", is_using_scram_auth: true }] }), // SupavisorConfigResponse[]: the PRIMARY entry is the one to use
    });
    const api = supabaseApi(sim.fetchImpl, "t");
    await api.assertTarget(); await api.applyAuthSettings("T"); await api.closeDataApi();
    expect(await api.anonKey()).toBe("anon-key-value");
    expect(await api.poolerHost()).toBe("aws-0-ap-southeast-1.pooler.supabase.com");
    for (const call of sim.calls) expect(call.url, call.url).toMatch(new RegExp(`^https://api\\.supabase\\.com/v1/(projects/${REF}(/|$)|organizations/org-dashio$)`));
    expect(JSON.stringify(sim.calls)).not.toContain("SERVICE-ROLE-MUST-NOT-LEAK");
  });

  it("sends exactly the sign-in settings the guide asks for, and fails loudly if the project did not keep them", async () => {
    const patch = vi.fn(() => ({ body: {} }));
    const kept = { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false, mailer_subjects_confirmation: "رمز الدخول إلى Dashio | Dashio sign-in code", mailer_templates_confirmation_content: "T", mailer_subjects_magic_link: "رمز الدخول إلى Dashio | Dashio sign-in code", mailer_templates_magic_link_content: "T" };
    const sim = simulate({ [`PATCH /v1/projects/${REF}/config/auth`]: patch, [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: { ...kept, mailer_otp_length: 8 } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").applyAuthSettings("T")).rejects.toThrow(/mailer_otp_length/);
    expect(sim.writes()[0].body).toMatchObject({ external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false });
  });

  it("reads the templates back after writing them: the subject and the content of BOTH Confirm signup and Magic Link must be what was sent, else the run fails (WO18 follow-up)", async () => {
    const settings = { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false };
    const subject = "رمز الدخول إلى Dashio | Dashio sign-in code";
    const stored = { mailer_subjects_confirmation: subject, mailer_templates_confirmation_content: "T", mailer_subjects_magic_link: subject, mailer_templates_magic_link_content: "T" };
    const run = (read: Record<string, unknown>) => supabaseApi(simulate({ [`PATCH /v1/projects/${REF}/config/auth`]: () => ({ body: {} }), [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: { ...settings, ...read } }) }).fetchImpl, "t").applyAuthSettings("T");
    await expect(run(stored)).resolves.toEqual({ templates: "applied" });
    for (const key of Object.keys(stored)) await expect(run({ ...stored, [key]: "something else" }), key).rejects.toThrow(new RegExp(key));
  });

  it("launch run 31: a free-tier project refuses the e-mail templates (400); the settings are kept, the refusal is reported, nothing else is hidden", async () => {
    const refusal = { status: 400, body: { message: "Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or set up a custom SMTP provider." } };
    let calls = 0;
    const settings = { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false };
    const sim = simulate({ [`PATCH /v1/projects/${REF}/config/auth`]: () => (++calls === 1 ? { body: {} } : refusal), [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: settings }) });
    const result = await supabaseApi(sim.fetchImpl, "t").applyAuthSettings("T");
    expect(result).toMatchObject({ templates: "refused" });
    expect(result.refusal).toMatch(/-> 400 Email template modification is not available for free tier/); // the status and Supabase's own words, in full
    expect(sim.writes().map(call => Object.keys(call.body as object).length)).toEqual([5, 4]); // the settings first, the templates second
  });

  it("any OTHER refusal of the templates still stops the run (a 400 that is not the free-tier one, a 403, a 500)", async () => {
    for (const status of [400, 403, 500]) {
      let calls = 0;
      const sim = simulate({ [`PATCH /v1/projects/${REF}/config/auth`]: () => (++calls === 1 ? { body: {} } : { status, body: { message: status === 400 ? "mailer_otp_exp must be at most 86400" : "boom" } }), [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false } }) });
      await expect(supabaseApi(sim.fetchImpl, "t").applyAuthSettings("T"), String(status)).rejects.toThrow(new RegExp(`-> ${status}`));
    }
  });

  it("the owner's instruction names where to click, is in Arabic, and carries no secret", () => {
    expect(TEMPLATE_TIER_INSTRUCTION).toMatch(/Authentication ← Emails ← SMTP Settings/);
    expect(TEMPLATE_TIER_INSTRUCTION).toMatch(/Custom SMTP/);
    expect(isTemplateTierRefusal("PATCH /v1/projects/x/config/auth -> 400 Email template modification is not available for free tier projects using the default email provider.")).toBe(true);
    expect(isTemplateTierRefusal("PATCH /v1/projects/x/config/auth -> 403 forbidden")).toBe(false);
  });

  it("fails if the Data API still exposes public afterwards", async () => {
    const sim = simulate({ [`PATCH /v1/projects/${REF}/postgrest`]: () => ({}), [`GET /v1/projects/${REF}/postgrest`]: () => ({ body: { db_schema: "public,graphql_public" } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").closeDataApi()).rejects.toThrow(/public/);
  });
});

describe("Data API closing when Supabase answers 500 (launch run 35)", () => {
  const PG = `/v1/projects/${REF}/postgrest`;
  const timeout500 = { status: 500, body: { message: "Postgrest config update did not succeed within the expected time frame. The intended change might not have been applied." } };
  it("500 on the PATCH but the read-back shows public closed: succeeds and says it recovered", async () => {
    const sim = simulate({ [`PATCH ${PG}`]: () => timeout500, [`GET ${PG}`]: () => ({ body: { db_schema: "graphql_public" } }) });
    expect(await supabaseApi(sim.fetchImpl, "t").closeDataApi(0)).toEqual({ attempts: 1, recovered: true });
  });
  it("500 and public still exposed: repeats, then succeeds when a later PATCH takes", async () => {
    let patches = 0;
    const sim = simulate({ [`PATCH ${PG}`]: () => (++patches < 2 ? timeout500 : { body: {} }), [`GET ${PG}`]: () => ({ body: { db_schema: patches < 2 ? "public,graphql_public" : "graphql_public" } }) });
    expect(await supabaseApi(sim.fetchImpl, "t").closeDataApi(0)).toEqual({ attempts: 2, recovered: false });
  });
  it("500 every time and public still exposed: FAILS after 3 attempts with Supabase's words", async () => {
    const sim = simulate({ [`PATCH ${PG}`]: () => timeout500, [`GET ${PG}`]: () => ({ body: { db_schema: "public" } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").closeDataApi(0)).rejects.toThrow(/after 3 attempts.*500/);
  });
  it("a 403 is a real refusal: no read-back rescue, no repeat", async () => {
    const sim = simulate({ [`PATCH ${PG}`]: () => ({ status: 403, body: { message: "forbidden" } }), [`GET ${PG}`]: () => ({ body: { db_schema: "graphql_public" } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").closeDataApi(0)).rejects.toThrow(/403/);
    expect(sim.writes().length).toBe(1);
  });
});

describe("owner email from the workflow input", () => {
  // The run that failed (run 26 on main) received "comdashio@gmail.com " with a trailing space and stopped in the first guard, before any call.
  it("accepts an address with a trailing space or newline, and returns it trimmed", () => {
    expect(normalizeOwnerEmail("comdashio@gmail.com ")).toBe("comdashio@gmail.com");
    expect(normalizeOwnerEmail(" owner@example.test\n")).toBe("owner@example.test");
  });
  it("still refuses something that is not an address, in Arabic, and does not echo it", () => {
    expect(() => normalizeOwnerEmail("owner example.test")).toThrow(GuardError);
    expect(() => normalizeOwnerEmail("owner example.test")).toThrow(/ليس عنوان بريد صالحًا/);
    expect(() => normalizeOwnerEmail("owner example.test")).not.toThrow(/owner example/);
  });
  it("the workflow step reads OWNER_EMAIL through that check, so a space in the input cannot stop the run", () => {
    expect(text("scripts/bootstrap/run.ts")).toContain('normalizeOwnerEmail(need("OWNER_EMAIL"))');
  });
});

describe("generated secrets and connection strings", () => {
  it("derives the same application-role password for the same database password, a different one for another, and refuses a missing one", () => {
    expect(deriveAppRolePassword("database-password-1")).toBe(deriveAppRolePassword("database-password-1"));
    expect(deriveAppRolePassword("database-password-1")).not.toBe(deriveAppRolePassword("database-password-2"));
    expect(deriveAppRolePassword("database-password-1")).toHaveLength(40);
    expect(() => deriveAppRolePassword("")).toThrow(GuardError);
  });

  it("builds the session pooler URL for setup (postgres.<ref>, 5432) and the transaction pooler URL for the app (project_os_app.<ref>, 6543), encoding the passwords", () => {
    const urls = connectionUrls({ ref: REF, poolerHost: "aws-0-ap-southeast-1.pooler.supabase.com", databasePassword: "p@ss/word", appRolePassword: "app+pass" });
    expect(urls.adminSession).toBe(`postgresql://postgres.${REF}:p%40ss%2Fword@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`); // secret-scan:allow: قيم وهمية في اختبار
    expect(urls.appTransaction).toBe(`postgresql://project_os_app.${REF}:app%2Bpass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`); // secret-scan:allow: قيم وهمية في اختبار
  });
});

const text = (file: string) => readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
const REPO = "comdashio-sudo/project-os";
describe("Vercel guard: one project named dashio, linked to the one repository", () => {
  it("REFUSES a project named dashio that is linked to another repository, and writes nothing", async () => {
    const sim = simulate({ "GET /v9/projects/dashio": () => ({ body: { id: "prj_1", link: { type: "github", org: "someone-else", repo: "other-repo" } } }) });
    await expect(vercelApi(sim.fetchImpl, "t").ensureProject()).rejects.toBeInstanceOf(GuardError);
    expect(sim.writes()).toEqual([]);
  });

  it("creates the project linked to the repository, in sin1, when it does not exist", async () => {
    const sim = simulate({ "GET /v9/projects/dashio": () => ({ status: 404 }), "POST /v11/projects": () => ({ status: 200, body: { id: "prj_new" } }) });
    await expect(vercelApi(sim.fetchImpl, "t").ensureProject()).resolves.toEqual({ id: "prj_new", created: true });
    expect(sim.writes()[0].body).toMatchObject({ name: "dashio", serverlessFunctionRegion: "sin1", gitRepository: { type: "github", repo: REPO }, buildCommand: "pnpm build:vercel" });
  });

  it("accepts an existing project linked to the right repository and fixes only its region", async () => {
    const sim = simulate({
      "GET /v9/projects/dashio": () => ({ body: { id: "prj_1", serverlessFunctionRegion: "iad1", link: { type: "github", org: "comdashio-sudo", repo: "project-os" } } }),
      "PATCH /v9/projects/prj_1": () => ({}),
    });
    await expect(vercelApi(sim.fetchImpl, "t").ensureProject()).resolves.toEqual({ id: "prj_1", created: false });
    expect(sim.writes()).toHaveLength(1);
    expect(sim.writes()[0].body).toEqual({ serverlessFunctionRegion: "sin1" });
  });

  it("when Vercel's GitHub app cannot see the repository it stops with the exact click, not a guess", async () => {
    const sim = simulate({ "GET /v9/projects/dashio": () => ({ status: 404 }), "POST /v11/projects": () => ({ status: 400, body: { error: { code: "repo_not_found" } } }) });
    const failure = await vercelApi(sim.fetchImpl, "t").ensureProject().catch(error => error);
    expect(failure).toBeInstanceOf(ManualStep);
    expect(failure.instruction).toBe(GITHUB_LINK_INSTRUCTION);
    expect(GITHUB_LINK_INSTRUCTION).toContain("Repository access");
  });

  it("never lists projects: every path names dashio or its id", async () => {
    const sim = simulate({
      "GET /v9/projects/dashio": () => ({ body: { id: "prj_1", serverlessFunctionRegion: "sin1", link: { type: "github", org: "comdashio-sudo", repo: "project-os" } } }),
      "GET /v10/projects/prj_1/env": () => ({ body: { envs: [{ key: "JWT_SECRET", target: ["production"] }] } }),
      "POST /v10/projects/prj_1/env": () => ({}),
    });
    const api = vercelApi(sim.fetchImpl, "t");
    const project = await api.ensureProject();
    await api.existingEnvKeys(project.id); await api.setEnv(project.id, [{ key: "A", value: "b", secret: false }]);
    for (const call of sim.calls) expect(call.url, call.url).toMatch(/\/v\d+\/projects\/(dashio|prj_1)(\/|\?|$)/);
  });

  it("sends secrets as sensitive and the rest as plain, Production only", async () => {
    const sim = simulate({ "POST /v10/projects/prj_1/env": () => ({}) });
    await vercelApi(sim.fetchImpl, "t").setEnv("prj_1", [{ key: "JWT_SECRET", value: "x", secret: true }, { key: "LLM_ENABLED", value: "false", secret: false }]);
    expect(sim.writes()[0].body).toEqual([{ key: "JWT_SECRET", value: "x", type: "sensitive", target: ["production"] }, { key: "LLM_ENABLED", value: "false", type: "plain", target: ["production"] }]);
    expect(sim.writes()[0].url).toContain("upsert=true");
  });
});

describe("production variables", () => {
  const base = { ownerEmail: "owner@example.test", databaseUrl: "postgresql://x", databaseCa: "CA", supabaseUrl: "https://ref.supabase.co", anonKey: "anon", storageEndpoint: "https://ref.storage.supabase.co/storage/v1/s3", storageRegion: "ap-southeast-1", jwtSecret: "J", cronSecret: "C" };
  it("fills the guide's Production variables, with notifications and the model OFF and no SMTP", () => {
    const vars = Object.fromEntries(productionEnv({ ...base, existing: new Set() }).map(v => [v.key, v.value]));
    expect(vars).toMatchObject({ OWNER_EMAIL: "owner@example.test", EMAIL_NOTIFICATIONS_ENABLED: "false", LLM_ENABLED: "false", STORAGE_BUCKET: "project-os-files", JWT_SECRET: "J", CRON_SECRET: "C" });
    expect(Object.keys(vars).filter(key => key.startsWith("SMTP"))).toEqual([]);
    expect(Object.keys(vars)).not.toContain("STORAGE_S3_ACCESS_KEY_ID");
  });
  it("on a re-run does not re-send generated secrets that already exist, and sends the storage keys only when given", () => {
    const keys = productionEnv({ ...base, existing: new Set(["JWT_SECRET", "CRON_SECRET"]) }).map(v => v.key);
    expect(keys).not.toContain("JWT_SECRET"); expect(keys).not.toContain("CRON_SECRET"); expect(keys).toContain("DATABASE_URL");
    expect(productionEnv({ ...base, existing: new Set(), storageKeys: { id: "i", secret: "s" } }).map(v => v.key)).toEqual(expect.arrayContaining(["STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY"]));
  });
});

describe("deployment polling and health", () => {
  it("waits for READY, fails on ERROR", async () => {
    let n = 0;
    const ready = simulate({ "GET /v13/deployments/d1": () => ({ body: { readyState: ++n < 3 ? "BUILDING" : "READY", url: "dashio-x.vercel.app", alias: ["dashio.vercel.app"] } }) });
    await expect(vercelApi(ready.fetchImpl, "t").waitReady("d1", { sleep: async () => undefined })).resolves.toEqual({ url: "dashio-x.vercel.app", aliases: ["dashio.vercel.app"] });
    const bad = simulate({ "GET /v13/deployments/d2": () => ({ body: { readyState: "ERROR" } }) });
    await expect(vercelApi(bad.fetchImpl, "t").waitReady("d2", { sleep: async () => undefined })).rejects.toThrow(/ERROR/);
  });
  it("accepts only the word ok from /healthz, and retries while the deployment warms up", async () => {
    let n = 0;
    const fetchImpl: Fetch = async () => { n += 1; return { ok: n > 2, status: n > 2 ? 200 : 502, text: async () => (n > 2 ? "ok\n" : "bad gateway") }; };
    await expect(checkHealth(fetchImpl, "https://dashio.vercel.app", { sleep: async () => undefined })).resolves.toEqual({ ok: true, status: 200 });
    const wrong: Fetch = async () => ({ ok: true, status: 200, text: async () => "<html>login</html>" });
    await expect(checkHealth(wrong, "https://x", { attempts: 2, sleep: async () => undefined })).resolves.toMatchObject({ ok: false });
  });
});

describe("the workflow", () => {
  it("runs ONLY on workflow_dispatch: the button holds the real secrets, so no pull_request, push, schedule or other trigger may ever start it", () => {
    const file = readFileSync(path.resolve(import.meta.dirname, "../..", ".github/workflows/bootstrap.yml"), "utf8");
    const onBlock = file.slice(file.indexOf("\non:"), file.indexOf("\npermissions:"));
    expect(onBlock.match(/^ {2}[a-z_]+:/gm)).toEqual(["  workflow_dispatch:"]);
  });

  const text = (file: string) => readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
  const workflow = text(".github/workflows/bootstrap.yml");
  it("is manual, takes owner_email plus an optional organisation identifier, and reads exactly the three secrets the owner puts in GitHub (plus optional ones)", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow.match(/^ {6}[a-z_]+:\n {8}description:/gm)).toHaveLength(3);
    expect(workflow).toContain("owner_email:");
    expect(workflow).toContain("supabase_org_slug:");
    expect(workflow).toContain("preflight_only:");
    for (const secret of ["SUPABASE_ACCESS_TOKEN", "VERCEL_TOKEN", "SUPABASE_DB_PASSWORD"]) expect(workflow).toContain(`secrets.${secret}`);
    expect(workflow).not.toMatch(/\bon:\s*\n\s*(push|schedule|pull_request)/);
  });
  it("puts the input in an environment variable, never interpolated into a shell command, and prints no secret", () => {
    expect(workflow).not.toMatch(/run:.*\$\{\{\s*(inputs|secrets)\./);
    expect(workflow).not.toMatch(/echo .*secrets\./);
    expect(workflow).toContain("if: always()");
  });
  it("names a failed phase in Arabic in the summary the owner reads on a phone", () => {
    const run = text("scripts/bootstrap/run.ts");
    expect(run).toContain('supabase: "مرحلة Supabase"');
    expect(run).toContain('vercel: "مرحلة Vercel"');
    expect(run).toContain("PHASE_LABEL[phase] ?? phase");
  });
  it("masks every secret it creates before use", () => {
    const run = text("scripts/bootstrap/run.ts");
    for (const secret of ["databasePassword", "appRolePassword", "jwtSecret", "cronSecret", "anonKey", "urls.adminSession", "urls.appTransaction"]) expect(run, secret).toMatch(new RegExp(`mask\\(${secret.replace(".", "\\.")}\\)`));
    expect(run).not.toMatch(/console\.log\([^)]*(Password|Secret|anonKey|jwt)/i);
  });
});

describe("the calls match the official API shapes (work order 11)", () => {
  it("reads the Vercel environment list from the current /v10 route and deploys with the documented query flags", async () => {
    const sim = simulate({
      "GET /v10/projects/prj_1/env": () => ({ body: { envs: [{ key: "JWT_SECRET", target: ["production"] }] } }),
      "POST /v13/deployments": () => ({ body: { id: "dpl_1" } }),
    });
    const api = vercelApi(sim.fetchImpl, "t");
    expect(Array.from(await api.existingEnvKeys("prj_1"))).toEqual(["JWT_SECRET"]);
    await api.deployProduction();
    const deploy = sim.calls.find(call => call.method === "POST")!;
    expect(deploy.url).toBe("https://api.vercel.com/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1");
    expect(deploy.body).toEqual({ name: "dashio", project: "dashio", target: "production", gitSource: { type: "github", org: "comdashio-sudo", repo: "project-os", ref: "main" } });
  });

  it("the workflow file is valid for GitHub: no `runner` context in a job-level env (it made every push show a failed run with no jobs)", () => {
    const yml = readFileSync(path.join(process.cwd(), ".github/workflows/bootstrap.yml"), "utf8");
    const jobEnv = yml.slice(yml.indexOf("    env:"), yml.indexOf("    steps:"));
    expect(jobEnv).not.toMatch(/\$\{\{\s*runner\./);
    expect(yml).toMatch(/BOOTSTRAP_STATE=\$RUNNER_TEMP\/bootstrap-state\.json/);
  });
});

describe("the workflow's pre-flight", () => {
  const workflow = readFileSync(path.resolve(__dirname, "../../.github/workflows/bootstrap.yml"), "utf8");
  it("runs first and read-only; every writing step after it is skipped when only the check is asked for", () => {
    const steps = workflow.split(/\n      - /).slice(1);
    const names = steps.map(step => /name: ([^\n]+)/.exec(step)?.[1] ?? "");
    const index = names.findIndex(name => /^Pre-flight/.test(name));
    expect(index).toBeGreaterThan(-1);
    expect(names.slice(0, index).every(name => !/Supabase|Database|Storage|Vercel/.test(name))).toBe(true); // nothing that writes comes before it
    for (const step of steps.slice(index + 1)) {
      const name = /name: ([^\n]+)/.exec(step)?.[1] ?? "";
      if (/^Summary/.test(name)) { expect(step).toContain("if: always()"); continue; }
      expect(step, name).toContain("if: ${{ !inputs.preflight_only }}");
    }
  });
});

