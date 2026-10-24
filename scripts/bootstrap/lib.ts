// Launch bootstrap (work order 9): everything docs/GO_LIVE.md asks a person to click, done through the Supabase Management API and the Vercel API.
// This file holds the logic with `fetch` injected, so the guards can be tested against a simulated API. Nothing here prints a secret: values that are secrets
// are masked by the caller, and error messages carry a status and a short code, never a response body.
import { createHmac } from "node:crypto";

/** The ONLY Supabase project this tool may touch, and the organisation it must belong to. Both are checked before any write. */
export const SUPABASE_PROJECT_REF = "dzfxgxccnlyhcjgqstgn";
export const SUPABASE_ORGANIZATION_NAME = "dashio";
/** The ONLY Vercel project this tool may create or update, and the only repository it may be linked to. */
export const VERCEL_PROJECT_NAME = "dashio";
export const GITHUB_OWNER = "comdashio-sudo";
export const GITHUB_REPO = "project-os";
export const VERCEL_REGION = "sin1";
export const OTP_SUBJECT = "PROJECT OS sign-in code";
export const STORAGE_BUCKET = "project-os-files";
/** Supabase's published root certificate for database connections (pooler included). */
export const SUPABASE_CA_URL = "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt";

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/** A guard refused: nothing was written. */
export class GuardError extends Error { constructor(message: string) { super(message); this.name = "GuardError"; } }
/** A step only a person can do: the exact click is in `instruction`. */
export class ManualStep extends Error { constructor(readonly instruction: string) { super(instruction); this.name = "ManualStep"; } }

/** A pasted address often ends with a space or a newline: trim it first, then check the shape. The address itself is never printed. */
export function normalizeOwnerEmail(raw: string): string {
  const email = raw.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new GuardError("بريد المالك في خانة owner_email ليس عنوان بريد صالحًا. لم يُكتب شيء.");
  return email;
}

const parse = (text: string) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };
const shortCode = (body: unknown) => { const b = body as { message?: unknown; error?: { code?: unknown; message?: unknown } | string; code?: unknown } | null; const raw = b?.error && typeof b.error === "object" ? (b.error.code ?? b.error.message) : (b?.code ?? b?.message ?? b?.error); return typeof raw === "string" ? raw.slice(0, 120) : ""; };

function client(fetchImpl: Fetch, base: string, token: string) {
  return async function call<T = any>(method: string, path: string, body?: unknown, allowed: number[] = []): Promise<{ status: number; data: T }> {
    const response = await fetchImpl(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = parse(await response.text());
    if (!response.ok && !allowed.includes(response.status)) throw new Error(`${method} ${path.replace(/\?.*$/, "")} -> ${response.status} ${shortCode(data)}`.trim());
    return { status: response.status, data };
  };
}

// ---------------------------------------------------------------------------------------------------------------- Supabase
export function supabaseApi(fetchImpl: Fetch, token: string) {
  const call = client(fetchImpl, "https://api.supabase.com", token);
  const ref = SUPABASE_PROJECT_REF;

  /** Reads THIS project (never lists projects) and refuses unless the id and the organisation's name both match. Call before any write. */
  async function assertTarget() {
    const { data: project } = await call("GET", `/v1/projects/${ref}`);
    const id = project?.ref ?? project?.id; // `ref` is the project reference in the Management API response (V1ProjectWithDatabaseResponse); `id` is kept as a fallback
    if (id !== ref) throw new GuardError(`المشروع الذي أعاده Supabase ليس المشروع المقصود (${ref}). لم يُكتب شيء.`);
    const slug = project?.organization_slug ?? project?.organization_id;
    if (!slug) throw new GuardError("مشروع Supabase لم يذكر منظمته، فلم يُتحقَّق من أنها dashio. لم يُكتب شيء.");
    // A token scoped to one project may not be allowed to read its organisation. Then the name cannot be checked, so the run stops: it never assumes.
    let organisation: any;
    try {
      ({ data: organisation } = await call("GET", `/v1/organizations/${encodeURIComponent(slug)}`));
    } catch (error) {
      throw new GuardError(`تعذّرت قراءة المنظمة من Supabase (${(error as Error).message})، فلم يُتحقَّق من أنها "${SUPABASE_ORGANIZATION_NAME}". لم يُكتب شيء. تأكد أن SUPABASE_ACCESS_TOKEN يملك صلاحية قراءة هذه المنظمة.`);
    }
    if (String(organisation?.name ?? "").trim().toLowerCase() !== SUPABASE_ORGANIZATION_NAME) throw new GuardError(`المشروع يتبع منظمة غير "${SUPABASE_ORGANIZATION_NAME}". لم يُكتب شيء.`);
    return { region: String(project?.region ?? "") };
  }

  return {
    assertTarget,
    async applyAuthSettings(template: string) {
      const patch = {
        external_email_enabled: true, mailer_autoconfirm: false, mailer_otp_length: 6, mailer_otp_exp: 3600, disable_signup: false,
        mailer_subjects_confirmation: OTP_SUBJECT, mailer_templates_confirmation_content: template,
        mailer_subjects_magic_link: OTP_SUBJECT, mailer_templates_magic_link_content: template,
      };
      await call("PATCH", `/v1/projects/${ref}/config/auth`, patch);
      const { data: now } = await call("GET", `/v1/projects/${ref}/config/auth`);
      const wrong = (Object.keys(patch) as Array<keyof typeof patch>).filter(key => now?.[key] !== patch[key]);
      if (wrong.length) throw new Error(`auth settings did not take: ${wrong.join(", ")}`);
    },
    /** The Data API serves only graphql_public: `public` (where the application's tables are) is not exposed. */
    async closeDataApi() {
      await call("PATCH", `/v1/projects/${ref}/postgrest`, { db_schema: "graphql_public" });
      const { data: now } = await call("GET", `/v1/projects/${ref}/postgrest`);
      const schemas = String(now?.db_schema ?? "").split(",").map((s: string) => s.trim());
      if (schemas.includes("public")) throw new Error("the Data API still exposes the public schema");
    },
    /** Only the anon key is read from the list; the service_role entry is never copied, stored or printed. */
    async anonKey(): Promise<string> {
      const { data } = await call("GET", `/v1/projects/${ref}/api-keys`);
      const keys = Array.isArray(data) ? data : [];
      const anon = keys.find((key: any) => key?.name === "anon" && typeof key?.api_key === "string") ?? keys.find((key: any) => key?.type === "publishable" && typeof key?.api_key === "string");
      if (!anon) throw new Error("no anon/publishable key found for the project");
      return anon.api_key as string;
    },
    async poolerHost(): Promise<string> {
      const { data } = await call("GET", `/v1/projects/${ref}/config/database/pooler`);
      const entry = (Array.isArray(data) ? data : []).find((item: any) => typeof item?.db_host === "string" && /pooler\.supabase\.com$/.test(item.db_host) && (item.database_type === undefined || item.database_type === "PRIMARY")); // SupavisorConfigResponse: PRIMARY, never a read replica
      if (!entry) throw new Error("no pooler host found for the project");
      return entry.db_host as string;
    },
  };
}

/** Deterministic, so a re-run provisions the same application-role password and never breaks the DATABASE_URL already set in Vercel. */
export function deriveAppRolePassword(databasePassword: string): string {
  if (!databasePassword || databasePassword.length < 8) throw new GuardError("كلمة مرور قاعدة Supabase (SUPABASE_DB_PASSWORD) غير موجودة أو قصيرة جدًا.");
  return createHmac("sha256", databasePassword).update("project-os/app-role-password/v1").digest("base64url").slice(0, 40);
}

export function connectionUrls(input: { ref: string; poolerHost: string; databasePassword: string; appRolePassword: string }) {
  const q = encodeURIComponent;
  return {
    adminSession: `postgresql://postgres.${input.ref}:${q(input.databasePassword)}@${input.poolerHost}:5432/postgres`, // secret-scan:allow: يبني الرابط من متغيرات وقت التشغيل، لا سرّ حرفي
    appTransaction: `postgresql://project_os_app.${input.ref}:${q(input.appRolePassword)}@${input.poolerHost}:6543/postgres`, // secret-scan:allow: يبني الرابط من متغيرات وقت التشغيل، لا سرّ حرفي
  };
}

/** The S3 endpoint is public information of the project; the access keys are not (see GO_LIVE: the one manual step). */
export function storageEndpoint(ref: string) { return `https://${ref}.storage.supabase.co/storage/v1/s3`; }

export async function downloadCa(fetchImpl: Fetch): Promise<string> {
  const response = await fetchImpl(SUPABASE_CA_URL);
  const text = await response.text();
  if (!response.ok || !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(text)) throw new Error(`could not fetch Supabase's root certificate (${response.status})`);
  return text.trim();
}

// ------------------------------------------------------------------------------------------------------------------ Vercel
export type VercelEnv = { key: string; value: string; secret: boolean };

export function vercelApi(fetchImpl: Fetch, token: string, teamId?: string) {
  const call = client(fetchImpl, "https://api.vercel.com", token);
  const scope = teamId ? `teamId=${encodeURIComponent(teamId)}` : "";
  const q = (path: string) => (scope ? `${path}${path.includes("?") ? "&" : "?"}${scope}` : path);
  const linkedRepo = (project: any) => (project?.link?.type === "github" ? `${project.link.org}/${project.link.repo}`.toLowerCase() : null);
  const want = `${GITHUB_OWNER}/${GITHUB_REPO}`.toLowerCase();

  /** One project, by its exact name. Refuses a project of that name linked to another repository; creates it (linked) when absent. */
  async function ensureProject(): Promise<{ id: string; created: boolean }> {
    const found = await call("GET", q(`/v9/projects/${VERCEL_PROJECT_NAME}`), undefined, [404]);
    if (found.status === 404) {
      const created = await call("POST", q("/v11/projects"), {
        name: VERCEL_PROJECT_NAME, framework: null, installCommand: "pnpm install --frozen-lockfile", buildCommand: "pnpm build:vercel", serverlessFunctionRegion: VERCEL_REGION,
        gitRepository: { type: "github", repo: `${GITHUB_OWNER}/${GITHUB_REPO}` },
      }, [400, 403, 404]);
      if (created.status !== 200 && created.status !== 201) throw new ManualStep(GITHUB_LINK_INSTRUCTION);
      return { id: created.data.id, created: true };
    }
    const project = found.data;
    const repo = linkedRepo(project);
    if (repo && repo !== want) throw new GuardError(`يوجد مشروع Vercel باسم "${VERCEL_PROJECT_NAME}" مربوط بمستودع آخر. لم يُكتب شيء.`);
    if (!repo) {
      // Not in the public OpenAPI (the documented way to connect a repository is `gitRepository` when the project is created). This is the call `vercel git connect` makes; any non-2xx falls back to the manual step.
      const linked = await call("POST", q(`/v9/projects/${project.id}/link`), { type: "github", repo: `${GITHUB_OWNER}/${GITHUB_REPO}` }, [400, 403, 404]);
      if (linked.status !== 200 && linked.status !== 201) throw new ManualStep(GITHUB_LINK_INSTRUCTION);
    }
    if (project.serverlessFunctionRegion !== VERCEL_REGION) await call("PATCH", q(`/v9/projects/${project.id}`), { serverlessFunctionRegion: VERCEL_REGION });
    return { id: project.id, created: false };
  }

  return {
    ensureProject,
    async existingEnvKeys(projectId: string): Promise<Set<string>> {
      const { data } = await call("GET", q(`/v10/projects/${projectId}/env`));
      return new Set((data?.envs ?? []).filter((env: any) => (env.target ?? []).includes("production")).map((env: any) => env.key as string));
    },
    async setEnv(projectId: string, vars: VercelEnv[]) {
      if (!vars.length) return;
      await call("POST", q(`/v10/projects/${projectId}/env?upsert=true`), vars.map(v => ({ key: v.key, value: v.value, type: v.secret ? "sensitive" : "plain", target: ["production"] })));
    },
    async deployProduction(): Promise<{ id: string }> {
      const deployed = await call("POST", q("/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1"), { name: VERCEL_PROJECT_NAME, project: VERCEL_PROJECT_NAME, target: "production", gitSource: { type: "github", org: GITHUB_OWNER, repo: GITHUB_REPO, ref: "main" } }, [400, 403, 404]);
      if (deployed.status !== 200 && deployed.status !== 201) throw new ManualStep(GITHUB_LINK_INSTRUCTION);
      return { id: deployed.data.id };
    },
    async waitReady(deploymentId: string, options: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}) {
      const interval = options.intervalMs ?? 10_000; const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000);
      const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
      for (;;) {
        const { data } = await call("GET", q(`/v13/deployments/${deploymentId}`));
        const state = data?.readyState ?? data?.status;
        if (state === "READY") return { url: String(data.url ?? ""), aliases: (data.alias ?? []) as string[] };
        if (state === "ERROR" || state === "CANCELED") throw new Error(`deployment ended as ${state}`);
        if (Date.now() > deadline) throw new Error("deployment did not finish in 15 minutes");
        await sleep(interval);
      }
    },
    /** The project's own production address (not the per-deployment one, which Vercel protects on the free plan). */
    async productionHost(projectId: string, fallbackAliases: string[]): Promise<string> {
      const { data } = await call("GET", q(`/v9/projects/${projectId}`));
      const aliases: string[] = [...(data?.targets?.production?.alias ?? []), ...fallbackAliases].filter((a: string) => typeof a === "string");
      const host = aliases.find(a => a === `${VERCEL_PROJECT_NAME}.vercel.app`) ?? aliases.find(a => a.endsWith(".vercel.app"));
      if (!host) throw new Error("the project has no production address yet");
      return host;
    },
  };
}

export const GITHUB_LINK_INSTRUCTION =
  `Vercel لا يرى المستودع ${GITHUB_OWNER}/${GITHUB_REPO}. انقر: GitHub ← صورتك ← Settings ← Applications ← Installed GitHub Apps ← Vercel ← Configure ← Repository access ← Only select repositories ← أضف ${GITHUB_REPO} ← Save. ثم أعد تشغيل الزر نفسه.`;

/** Waits for /healthz to answer "ok" (a fresh deployment can take a few seconds to serve). */
export async function checkHealth(fetchImpl: Fetch, baseUrl: string, options: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let last = "no answer";
  for (let attempt = 0; attempt < (options.attempts ?? 12); attempt++) {
    try {
      const response = await fetchImpl(`${baseUrl}/healthz`);
      const text = (await response.text()).trim();
      last = `${response.status}`;
      if (response.ok && text === "ok") return { ok: true as const, status: response.status };
    } catch { last = "no connection"; }
    await sleep(5000);
  }
  return { ok: false as const, status: last };
}

/** The Production variables of GO_LIVE.md that the bootstrap can fill. Generated secrets already present in Vercel are not re-sent (see `keep`). */
export function productionEnv(input: {
  ownerEmail: string; databaseUrl: string; databaseCa: string; supabaseUrl: string; anonKey: string; storageEndpoint: string; storageRegion: string;
  jwtSecret: string; cronSecret: string; appBaseUrl?: string; existing: Set<string>; storageKeys?: { id: string; secret: string };
}): VercelEnv[] {
  const vars: VercelEnv[] = [
    { key: "DATABASE_URL", value: input.databaseUrl, secret: true },
    { key: "DATABASE_SSL_CA", value: input.databaseCa, secret: false },
    { key: "OWNER_EMAIL", value: input.ownerEmail, secret: false },
    { key: "SUPABASE_URL", value: input.supabaseUrl, secret: false },
    { key: "SUPABASE_ANON_KEY", value: input.anonKey, secret: true },
    { key: "STORAGE_S3_ENDPOINT", value: input.storageEndpoint, secret: false },
    { key: "STORAGE_S3_REGION", value: input.storageRegion, secret: false },
    { key: "STORAGE_BUCKET", value: STORAGE_BUCKET, secret: false },
    { key: "EMAIL_NOTIFICATIONS_ENABLED", value: "false", secret: false },
    { key: "LLM_ENABLED", value: "false", secret: false },
    { key: "DATABASE_POOL_MAX", value: "3", secret: false },
    { key: "AUTH_CODE_TTL_SECONDS", value: "3600", secret: false },
    { key: "API_RATE_LIMIT_PER_MINUTE", value: "600", secret: false },
  ];
  // generated once: a re-run keeps the ones that exist
  if (!input.existing.has("JWT_SECRET")) vars.push({ key: "JWT_SECRET", value: input.jwtSecret, secret: true });
  if (!input.existing.has("CRON_SECRET")) vars.push({ key: "CRON_SECRET", value: input.cronSecret, secret: true });
  if (input.appBaseUrl) vars.push({ key: "APP_BASE_URL", value: input.appBaseUrl, secret: false });
  if (input.storageKeys) {
    vars.push({ key: "STORAGE_S3_ACCESS_KEY_ID", value: input.storageKeys.id, secret: true }, { key: "STORAGE_S3_SECRET_ACCESS_KEY", value: input.storageKeys.secret, secret: true });
  }
  return vars;
}
