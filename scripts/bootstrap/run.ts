// One button: sets up everything docs/GO_LIVE.md describes, from the GitHub Actions workflow .github/workflows/bootstrap.yml.
//   node --import tsx scripts/bootstrap/run.ts supabase   guard, sign-in settings, Data API, keys, connection strings, secrets  -> exports to the next steps
//   node --import tsx scripts/bootstrap/run.ts vercel     project, variables, production deploy, address, health check
//   node --import tsx scripts/bootstrap/run.ts database   guard, then ONLY the connection string and certificate for the next steps (changes nothing; the demonstration company's workflow uses it)
//   node --import tsx scripts/bootstrap/run.ts summary    renders the Arabic job summary from the state file (runs even after a failure)
// Secrets are masked (::add-mask::) the moment they exist and are never printed. Re-running is safe: generated secrets are kept, the app-role password is derived.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPreflight, renderPreflight, type Finding } from "./preflight.ts";
import { GuardError, ManualStep, discoverVercelTeam, TEMPLATE_TIER_INSTRUCTION, SUPABASE_PROJECT_REF, checkHealth, connectionUrls, deriveAppRolePassword, downloadCa, normalizeOwnerEmail, productionEnv, storageEndpoint, supabaseApi, vercelApi, type Fetch } from "./lib.ts";

type Step = { name: string; status: "ok" | "manual" | "failed"; note?: string };
type State = { steps: Step[]; url?: string; health?: string; manual: string[]; preflight?: Finding[] };
const STATE_FILE = process.env.BOOTSTRAP_STATE ?? join(process.env.RUNNER_TEMP ?? ".", "bootstrap-state.json");
const readState = (): State => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { steps: [], manual: [] });
const state = readState();
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state));
const step = (name: string, status: Step["status"], note?: string) => { state.steps.push({ name, status, ...(note ? { note } : {}) }); save(); };
const mask = (value: string) => { if (value) console.log(`::add-mask::${value}`); };
// Values pasted into GitHub often carry a trailing space or newline; trimming them is not a loosening of any guard, the checks still run on the value.
const optional = (name: string) => (process.env[name] ?? "").trim();
const need = (name: string) => { const value = optional(name); if (!value) throw new GuardError(`المتغير ${name} غير مضبوط في GitHub (Settings ← Secrets and variables ← Actions).`); return value; };
const PHASE_LABEL: Record<string, string> = { preflight: "الفحص المسبق", supabase: "مرحلة Supabase", vercel: "مرحلة Vercel" };
const exportEnv = (name: string, value: string) => { const file = process.env.GITHUB_ENV; if (!file) throw new Error("GITHUB_ENV is not available"); const tag = `EOF_${randomBytes(6).toString("hex")}`; appendFileSync(file, `${name}<<${tag}\n${value}\n${tag}\n`); };
const realFetch: Fetch = (url, init) => fetch(url, init as RequestInit);

async function supabasePhase() {
  const ownerEmail = normalizeOwnerEmail(need("OWNER_EMAIL"));
  const databasePassword = need("SUPABASE_DB_PASSWORD"); mask(databasePassword);
  const token = need("SUPABASE_ACCESS_TOKEN"); mask(token);
  const api = supabaseApi(realFetch, token);

  const { region, organisationCheck, organisationSlug } = await api.assertTarget(optional("SUPABASE_ORGANIZATION_SLUG")); // refuses (nothing written) unless project id AND organisation name match
  step("التحقق من أن المشروع والمنظمة هما المقصودان فقط", "ok", `المشروع ${SUPABASE_PROJECT_REF}؛ ${organisationCheck === "organisation" ? "المنظمة dashio قُرئت وطابقت" : `المفتاح محصور بالمشروع ولا يقرأ المنظمة، فطُبِّق التحقق بالمعرّف المثبَّت (${organisationSlug})`}`);

  const auth = await api.applyAuthSettings(readFileSync("docs/auth-email-templates/otp.html", "utf8"));
  if (auth.templates === "applied") step("إعدادات الدخول: البريد مفعّل، تأكيد البريد، رمز 6 أرقام، صلاحية 3600 ثانية، التسجيل مسموح، وقالبا Confirm signup وMagic Link", "ok");
  else {
    step("إعدادات الدخول: البريد مفعّل، رمز 6 أرقام، صلاحية 3600 ثانية، التسجيل مسموح", "ok");
    state.manual.unshift(TEMPLATE_TIER_INSTRUCTION); // first in the list: until it is done nobody can sign in with a code
    step("قالبا بريد الدخول (Confirm signup وMagic Link)", "manual", "رفضتهما Supabase على الخطة المجانية بمزوّد البريد الافتراضي — انظر أول بند أسفل الملخص");
  }
  const dataApi = await api.closeDataApi();
  step("واجهة Data API: أُزيل المخطط public من المكشوف", "ok", dataApi.recovered ? "ردّ Supabase بخطأ خادم (500) لكن القراءة اللاحقة أثبتت أن التغيير طُبِّق" : dataApi.attempts > 1 ? `نجح بعد ${dataApi.attempts} محاولات` : undefined);

  const anonKey = await api.anonKey(); mask(anonKey);
  const poolerHost = await api.poolerHost();
  const ca = await downloadCa(realFetch);
  const appRolePassword = deriveAppRolePassword(databasePassword); mask(appRolePassword);
  const urls = connectionUrls({ ref: SUPABASE_PROJECT_REF, poolerHost, databasePassword, appRolePassword });
  mask(urls.adminSession); mask(urls.appTransaction);
  const jwtSecret = randomBytes(48).toString("base64url"); mask(jwtSecret);
  const cronSecret = randomBytes(32).toString("base64url"); mask(cronSecret);

  // for the next steps of the same job (migrate / storage / verify) and for the Vercel phase
  exportEnv("DATABASE_URL", urls.adminSession); exportEnv("DATABASE_SSL_CA", ca); exportEnv("PROJECT_OS_APP_DB_PASSWORD", appRolePassword);
  exportEnv("BOOTSTRAP_APP_DATABASE_URL", urls.appTransaction); exportEnv("BOOTSTRAP_ANON_KEY", anonKey);
  exportEnv("BOOTSTRAP_JWT_SECRET", jwtSecret); exportEnv("BOOTSTRAP_CRON_SECRET", cronSecret); exportEnv("BOOTSTRAP_REGION", region || "ap-southeast-1");
  step("روابط الاتصال وشهادة SSL والأسرار المولَّدة (محجوبة في السجل)", "ok");
}

/** The one project's connection, nothing else: no sign-in setting, Data API or key is touched (used by workflows that only need to reach the database). */
async function databasePhase() {
  const databasePassword = need("SUPABASE_DB_PASSWORD"); mask(databasePassword);
  const token = need("SUPABASE_ACCESS_TOKEN"); mask(token);
  const api = supabaseApi(realFetch, token);
  const target = await api.assertTarget(optional("SUPABASE_ORGANIZATION_SLUG")); // refuses (nothing written) unless project id AND organisation name match
  const poolerHost = await api.poolerHost();
  const ca = await downloadCa(realFetch);
  const urls = connectionUrls({ ref: SUPABASE_PROJECT_REF, poolerHost, databasePassword, appRolePassword: deriveAppRolePassword(databasePassword) });
  mask(urls.adminSession);
  exportEnv("DATABASE_URL", urls.adminSession); exportEnv("DATABASE_SSL_CA", ca);
  // for the daily backup, which also reads the storage buckets through the project's S3 endpoint (public information; the access keys are the repository's secrets)
  exportEnv("STORAGE_S3_ENDPOINT", storageEndpoint(SUPABASE_PROJECT_REF)); exportEnv("STORAGE_S3_REGION", target.region || "ap-southeast-1");
  step("اتصال قاعدة البيانات للمشروع المقصود فقط", "ok");
}

async function preflightPhase() {
  const env = process.env as Record<string, string | undefined>;
  const ca = optional("DATABASE_SSL_CA") || (await downloadCa(realFetch).catch(() => ""));
  const { default: pg } = await import("pg");
  const open = async (user: string, password: string, host: string, port: number) => {
    const client = new pg.Client({ host, port, user, password, database: "postgres", ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, connectionTimeoutMillis: 15_000 });
    await client.connect();
    return client;
  };
  const password = optional("SUPABASE_DB_PASSWORD");
  const findings = await runPreflight({
    fetch: realFetch, env,
    migrationFilesCount: readdirSync("drizzle").filter(name => /^\d{4}_.*\.sql$/.test(name)).length,
    openDatabase: async ({ poolerHost }) => {
      const client = await open(`postgres.${SUPABASE_PROJECT_REF}`, password, poolerHost, 5432);
      return { query: async (sql, params) => (await client.query(sql, params as unknown[])).rows, close: () => client.end() };
    },
    tryAppRole: async ({ poolerHost, port }) => {
      try { const client = await open(`project_os_app.${SUPABASE_PROJECT_REF}`, deriveAppRolePassword(password), poolerHost, port); await client.end(); return "ok"; }
      catch (error) { return (error as { code?: string }).code ?? "UNKNOWN"; }
    },
    listBuckets: async () => {
      const { S3Client, ListBucketsCommand } = await import("@aws-sdk/client-s3");
      const client = new S3Client({ region: optional("BOOTSTRAP_REGION") || "ap-southeast-1", endpoint: storageEndpoint(SUPABASE_PROJECT_REF), forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", credentials: { accessKeyId: optional("STORAGE_S3_ACCESS_KEY_ID"), secretAccessKey: optional("STORAGE_S3_SECRET_ACCESS_KEY") } });
      try { await client.send(new ListBucketsCommand({})); return "ok"; }
      catch (error) { const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }; return `${e.name ?? "Error"} ${e.$metadata?.httpStatusCode ?? ""}`.trim(); }
    },
  });
  state.preflight = findings; save();
  const blocking = findings.filter(item => item.status === "block");
  step("الفحص المسبق (قراءة فقط، لم يُكتب شيء)", blocking.length ? "failed" : "ok", blocking.length ? `${blocking.length} مشكلة تمنع التشغيل — القائمة الكاملة أسفل الملخص` : "لا مشكلة تمنع التشغيل");
  if (blocking.length) process.exitCode = 1;
}

async function vercelPhase() {
  const token = need("VERCEL_TOKEN"); mask(token);
  const teamId = optional("VERCEL_TEAM_ID") || await discoverVercelTeam(realFetch, token); // a token scoped to an account's own team acts on that team
  const api = vercelApi(realFetch, token, teamId || undefined);
  const project = await api.ensureProject();
  step(project.created ? "أُنشئ مشروع Vercel باسم dashio مربوطًا بالمستودع في المنطقة sin1" : "مشروع Vercel dashio موجود ومربوط بالمستودع الصحيح، والمنطقة sin1", "ok");

  const existing = await api.existingEnvKeys(project.id);
  const storageKeys = optional("STORAGE_S3_ACCESS_KEY_ID") && optional("STORAGE_S3_SECRET_ACCESS_KEY") ? { id: optional("STORAGE_S3_ACCESS_KEY_ID"), secret: optional("STORAGE_S3_SECRET_ACCESS_KEY") } : undefined;
  if (storageKeys) { mask(storageKeys.id); mask(storageKeys.secret); }
  const base = {
    ownerEmail: need("OWNER_EMAIL"), databaseUrl: need("BOOTSTRAP_APP_DATABASE_URL"), databaseCa: need("DATABASE_SSL_CA"), supabaseUrl: `https://${SUPABASE_PROJECT_REF}.supabase.co`,
    anonKey: need("BOOTSTRAP_ANON_KEY"), storageEndpoint: storageEndpoint(SUPABASE_PROJECT_REF), storageRegion: need("BOOTSTRAP_REGION"),
    jwtSecret: need("BOOTSTRAP_JWT_SECRET"), cronSecret: need("BOOTSTRAP_CRON_SECRET"), existing, storageKeys,
  };
  await api.setEnv(project.id, productionEnv(base));
  step("متغيرات Production وُضعت (الأسرار المولَّدة القائمة لم تُغيَّر)", "ok");
  if (!storageKeys && !(existing.has("STORAGE_S3_ACCESS_KEY_ID") && existing.has("STORAGE_S3_SECRET_ACCESS_KEY"))) {
    const instruction = "مفتاح التخزين (S3) لا يُنشأ عبر واجهة Supabase البرمجية، وهذه هي الخطوة اليدوية الوحيدة: Supabase ← مشروع dashio ← Project Settings ← Storage ← S3 Connection ← New access key. انسخ Access key ID و Secret access key، والصقهما في Vercel ← dashio ← Settings ← Environment Variables باسمَي STORAGE_S3_ACCESS_KEY_ID و STORAGE_S3_SECRET_ACCESS_KEY (Production) ثم Redeploy؛ أو أضفهما سرّين في GitHub بالاسمين نفسهما وأعد تشغيل الزر. بدونهما يعمل كل شيء عدا رفع الملفات.";
    state.manual.push(instruction); step("مفاتيح التخزين S3", "manual", "خطوة يدوية واحدة (انظر أسفل الملخص)");
  }

  // 1st production deployment -> its address -> APP_BASE_URL -> 2nd deployment, only when the address is new
  const first = await api.deployProduction();
  const ready = await api.waitReady(first.id);
  const host = await api.productionHost(project.id, ready.aliases);
  const baseUrl = `https://${host}`;
  step("نُشر الإنتاج واكتمل", "ok", baseUrl);
  if (!existing.has("APP_BASE_URL")) {
    await api.setEnv(project.id, [{ key: "APP_BASE_URL", value: baseUrl, secret: false }]);
    const second = await api.deployProduction(); await api.waitReady(second.id);
    step("وُضع APP_BASE_URL وأُعيد النشر", "ok");
  }
  state.url = baseUrl;

  const health = await checkHealth(realFetch, baseUrl);
  state.health = health.ok ? "ok" : `لم يرجع ok (${health.status})`; save();
  if (!health.ok) { state.manual.push(`/healthz لم يرجع ok (${health.status}). إن كان 401 فالحماية مفعّلة: Vercel ← dashio ← Settings ← Deployment Protection ← أوقف Vercel Authentication للإنتاج. وإلا فافتح Vercel ← dashio ← Deployments ← آخر نشر ← Logs.`); step("فحص /healthz", "failed", health.status); process.exitCode = 1; }
  else step("فحص /healthz", "ok", "ok");
}

function summary() {
  const lines: string[] = ["# إعداد الإطلاق بزر واحد", ""];
  const icon = { ok: "✅", manual: "🟡", failed: "❌" } as const;
  for (const s of state.steps) lines.push(`- ${icon[s.status]} ${s.name}${s.note ? ` — ${s.note}` : ""}`);
  const noteFile = process.env.BOOTSTRAP_NOTE_FILE; const note = noteFile && existsSync(noteFile) ? readFileSync(noteFile, "utf8").trim() : "";
  if (note) lines.push(`- ❌ ${note}`);
  else if (process.env.JOB_STATUS && process.env.JOB_STATUS !== "success" && !state.steps.some(item => item.status === "failed")) lines.push(`- ❌ توقف التشغيل في خطوة قاعدة البيانات أو التخزين أو الأمان (حالة المهمة: ${process.env.JOB_STATUS}) — افتح سجل تلك الخطوة؛ لا يحمل أسرارًا.`);
  if (state.preflight?.length) lines.push("", "## الفحص المسبق (قراءة فقط)", ...renderPreflight(state.preflight));
  lines.push("", `**الرابط:** ${state.url ?? "لم يُنشر بعد"}`, `**نتيجة /healthz:** ${state.health ?? "لم تُفحص"}`, "");
  if (state.manual.length) { lines.push("## ما بقي بيدك", ...state.manual.map((m, i) => `${i + 1}. ${m}`)); } else lines.push("لا شيء متبقٍّ يدويًا.");
  lines.push("", "_لا أسرار في هذا الملخص. الزر آمن لإعادة التشغيل._");
  const out = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n"); else console.log(out);
}

const phase = process.argv[2];
try {
  if (phase === "preflight") await preflightPhase();
  else if (phase === "supabase") await supabasePhase();
  else if (phase === "database") await databasePhase();
  else if (phase === "vercel") await vercelPhase();
  else if (phase === "summary") summary();
  else throw new Error("usage: run.ts supabase|database|vercel|summary");
} catch (error) {
  if (error instanceof ManualStep) { state.manual.push(error.instruction); step(phase, "manual", "يحتاج نقرة واحدة"); }
  else { const note = error instanceof GuardError ? error.message : `فشل الطلب: ${String((error as Error).message).slice(0, 400)}`; console.error(`[${phase}] ${note}`); step(PHASE_LABEL[phase] ?? phase, "failed", note); } // the note carries a status and a short code, never a body or a secret
  save(); process.exitCode = 1;
}
