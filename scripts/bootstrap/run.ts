// One button: sets up everything docs/GO_LIVE.md describes, from the GitHub Actions workflow .github/workflows/bootstrap.yml.
//   node --import tsx scripts/bootstrap/run.ts supabase   guard, sign-in settings, Data API, keys, connection strings, secrets  -> exports to the next steps
//   node --import tsx scripts/bootstrap/run.ts vercel     project, variables, production deploy, address, health check
//   node --import tsx scripts/bootstrap/run.ts summary    renders the Arabic job summary from the state file (runs even after a failure)
// Secrets are masked (::add-mask::) the moment they exist and are never printed. Re-running is safe: generated secrets are kept, the app-role password is derived.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GuardError, ManualStep, SUPABASE_PROJECT_REF, checkHealth, connectionUrls, deriveAppRolePassword, downloadCa, normalizeOwnerEmail, productionEnv, storageEndpoint, supabaseApi, vercelApi, type Fetch } from "./lib.ts";

type Step = { name: string; status: "ok" | "manual" | "failed"; note?: string };
type State = { steps: Step[]; url?: string; health?: string; manual: string[] };
const STATE_FILE = process.env.BOOTSTRAP_STATE ?? join(process.env.RUNNER_TEMP ?? ".", "bootstrap-state.json");
const readState = (): State => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { steps: [], manual: [] });
const state = readState();
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state));
const step = (name: string, status: Step["status"], note?: string) => { state.steps.push({ name, status, ...(note ? { note } : {}) }); save(); };
const mask = (value: string) => { if (value) console.log(`::add-mask::${value}`); };
// Values pasted into GitHub often carry a trailing space or newline; trimming them is not a loosening of any guard, the checks still run on the value.
const optional = (name: string) => (process.env[name] ?? "").trim();
const need = (name: string) => { const value = optional(name); if (!value) throw new GuardError(`المتغير ${name} غير مضبوط في GitHub (Settings ← Secrets and variables ← Actions).`); return value; };
const PHASE_LABEL: Record<string, string> = { supabase: "مرحلة Supabase", vercel: "مرحلة Vercel" };
const exportEnv = (name: string, value: string) => { const file = process.env.GITHUB_ENV; if (!file) throw new Error("GITHUB_ENV is not available"); const tag = `EOF_${randomBytes(6).toString("hex")}`; appendFileSync(file, `${name}<<${tag}\n${value}\n${tag}\n`); };
const realFetch: Fetch = (url, init) => fetch(url, init as RequestInit);

async function supabasePhase() {
  const ownerEmail = normalizeOwnerEmail(need("OWNER_EMAIL"));
  const databasePassword = need("SUPABASE_DB_PASSWORD"); mask(databasePassword);
  const token = need("SUPABASE_ACCESS_TOKEN"); mask(token);
  const api = supabaseApi(realFetch, token);

  const { region } = await api.assertTarget(); // refuses (nothing written) unless project id AND organisation name match
  step("التحقق من أن المشروع والمنظمة هما المقصودان فقط", "ok", `المشروع ${SUPABASE_PROJECT_REF}`);

  await api.applyAuthSettings(readFileSync("docs/auth-email-templates/otp.html", "utf8"));
  step("إعدادات الدخول: البريد مفعّل، تأكيد البريد، رمز 6 أرقام، صلاحية 3600 ثانية، التسجيل مسموح، وقالبا Confirm signup وMagic Link", "ok");
  await api.closeDataApi();
  step("واجهة Data API: أُزيل المخطط public من المكشوف", "ok");

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

async function vercelPhase() {
  const token = need("VERCEL_TOKEN"); mask(token);
  const api = vercelApi(realFetch, token, optional("VERCEL_TEAM_ID") || undefined);
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
  if (process.env.JOB_STATUS && process.env.JOB_STATUS !== "success" && !state.steps.some(item => item.status === "failed")) lines.push(`- ❌ توقف التشغيل في خطوة قاعدة البيانات أو التخزين أو الأمان (حالة المهمة: ${process.env.JOB_STATUS}) — افتح سجل تلك الخطوة؛ لا يحمل أسرارًا.`);
  lines.push("", `**الرابط:** ${state.url ?? "لم يُنشر بعد"}`, `**نتيجة /healthz:** ${state.health ?? "لم تُفحص"}`, "");
  if (state.manual.length) { lines.push("## ما بقي بيدك", ...state.manual.map((m, i) => `${i + 1}. ${m}`)); } else lines.push("لا شيء متبقٍّ يدويًا.");
  lines.push("", "_لا أسرار في هذا الملخص. الزر آمن لإعادة التشغيل._");
  const out = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n"); else console.log(out);
}

const phase = process.argv[2];
try {
  if (phase === "supabase") await supabasePhase();
  else if (phase === "vercel") await vercelPhase();
  else if (phase === "summary") summary();
  else throw new Error("usage: run.ts supabase|vercel|summary");
} catch (error) {
  if (error instanceof ManualStep) { state.manual.push(error.instruction); step(phase, "manual", "يحتاج نقرة واحدة"); }
  else { step(PHASE_LABEL[phase] ?? phase, "failed", error instanceof GuardError ? error.message : `فشل الطلب: ${String((error as Error).message).slice(0, 200)}`); }
  save(); process.exitCode = 1;
}
