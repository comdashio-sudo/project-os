import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_LINK_INSTRUCTION, GuardError, ManualStep, SUPABASE_PROJECT_REF, checkHealth, connectionUrls, deriveAppRolePassword, productionEnv, supabaseApi, vercelApi, type Fetch,
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
  [`GET /v1/projects/${REF}`]: () => ({ body: { id: over.id ?? REF, organization_slug: over.org ?? "org-dashio", region: "ap-southeast-1", name: "dashio" } }),
  [`GET /v1/organizations/${over.org ?? "org-dashio"}`]: () => ({ body: { name: over.orgName ?? "dashio" } }),
});

describe("Supabase guard: one project, inside one organisation, checked before any write", () => {
  it("passes for the expected project in the organisation named dashio, reading nothing else", async () => {
    const sim = simulate(supabaseOk());
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).resolves.toEqual({ region: "ap-southeast-1" });
    expect(sim.writes()).toEqual([]);
    expect(sim.calls.map(call => call.url)).toEqual([`https://api.supabase.com/v1/projects/${REF}`, "https://api.supabase.com/v1/organizations/org-dashio"]);
  });

  it("REFUSES a different project id: nothing is read beyond that project, nothing is written", async () => {
    const sim = simulate(supabaseOk({ id: "someotherprojectref000000" }));
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toBeInstanceOf(GuardError);
    expect(sim.writes()).toEqual([]);
    expect(sim.calls).toHaveLength(1);
  });

  it("REFUSES the right project inside a differently named organisation", async () => {
    const sim = simulate(supabaseOk({ orgName: "another-company" }));
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toThrow(/organisation/);
    expect(sim.writes()).toEqual([]);
  });

  it("REFUSES a project that does not name its organisation", async () => {
    const sim = simulate({ [`GET /v1/projects/${REF}`]: () => ({ body: { id: REF } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").assertTarget()).rejects.toBeInstanceOf(GuardError);
  });

  it("never lists projects or organisations: every path it can call names the one project (or its organisation)", async () => {
    const sim = simulate({
      ...supabaseOk(),
      [`PATCH /v1/projects/${REF}/config/auth`]: () => ({ body: {} }),
      [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false, mailer_subjects_confirmation: "PROJECT OS sign-in code", mailer_templates_confirmation_content: "T", mailer_subjects_magic_link: "PROJECT OS sign-in code", mailer_templates_magic_link_content: "T" } }),
      [`PATCH /v1/projects/${REF}/postgrest`]: () => ({ body: {} }),
      [`GET /v1/projects/${REF}/postgrest`]: () => ({ body: { db_schema: "graphql_public" } }),
      [`GET /v1/projects/${REF}/api-keys`]: () => ({ body: [{ name: "service_role", api_key: "SERVICE-ROLE-MUST-NOT-LEAK" }, { name: "anon", api_key: "anon-key-value" }] }),
      [`GET /v1/projects/${REF}/config/database/pooler`]: () => ({ body: [{ db_host: "aws-0-ap-southeast-1.pooler.supabase.com", db_port: 5432 }] }),
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
    const kept = { external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false, mailer_subjects_confirmation: "PROJECT OS sign-in code", mailer_templates_confirmation_content: "T", mailer_subjects_magic_link: "PROJECT OS sign-in code", mailer_templates_magic_link_content: "T" };
    const sim = simulate({ [`PATCH /v1/projects/${REF}/config/auth`]: patch, [`GET /v1/projects/${REF}/config/auth`]: () => ({ body: { ...kept, mailer_otp_length: 8 } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").applyAuthSettings("T")).rejects.toThrow(/mailer_otp_length/);
    expect(sim.writes()[0].body).toMatchObject({ external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false });
  });

  it("fails if the Data API still exposes public afterwards", async () => {
    const sim = simulate({ [`PATCH /v1/projects/${REF}/postgrest`]: () => ({}), [`GET /v1/projects/${REF}/postgrest`]: () => ({ body: { db_schema: "public,graphql_public" } }) });
    await expect(supabaseApi(sim.fetchImpl, "t").closeDataApi()).rejects.toThrow(/public/);
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
      "GET /v9/projects/prj_1/env": () => ({ body: { envs: [{ key: "JWT_SECRET", target: ["production"] }] } }),
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
  const text = (file: string) => readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");
  const workflow = text(".github/workflows/bootstrap.yml");
  it("is manual, takes one input (owner_email), and reads exactly the three secrets the owner puts in GitHub (plus optional ones)", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow.match(/^ {6}[a-z_]+:\n {8}description:/gm)).toHaveLength(1);
    expect(workflow).toContain("owner_email:");
    for (const secret of ["SUPABASE_ACCESS_TOKEN", "VERCEL_TOKEN", "SUPABASE_DB_PASSWORD"]) expect(workflow).toContain(`secrets.${secret}`);
    expect(workflow).not.toMatch(/\bon:\s*\n\s*(push|schedule|pull_request)/);
  });
  it("puts the input in an environment variable, never interpolated into a shell command, and prints no secret", () => {
    expect(workflow).not.toMatch(/run:.*\$\{\{\s*(inputs|secrets)\./);
    expect(workflow).not.toMatch(/echo .*secrets\./);
    expect(workflow).toContain("if: always()");
  });
  it("masks every secret it creates before use", () => {
    const run = text("scripts/bootstrap/run.ts");
    for (const secret of ["databasePassword", "appRolePassword", "jwtSecret", "cronSecret", "anonKey", "urls.adminSession", "urls.appTransaction"]) expect(run, secret).toMatch(new RegExp(`mask\\(${secret.replace(".", "\\.")}\\)`));
    expect(run).not.toMatch(/console\.log\([^)]*(Password|Secret|anonKey|jwt)/i);
  });
});
