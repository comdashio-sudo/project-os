// The launch button's PRE-FLIGHT: read-only requests to everything the later phases will need, every problem collected into ONE list in Arabic, nothing written anywhere.
// (Owner's order after launch runs 26-34: stop finding the problems one run at a time.) Each check stands alone: one failing does not stop the next. A finding is
//   ok       the thing the later phase needs is there
//   warn     it will work but the owner should know (or do one thing later)
//   block    the run would fail here: the button stops BEFORE writing anything
//   unknown  the platform decides at the moment of the real run (a plan limit, a deploy-time rule): said so, not guessed
// No secret is ever put in a finding: only names, statuses, short codes and the platform's own words.
import { NEAREST_VERCEL_REGION, GITHUB_LINK_INSTRUCTION, GITHUB_OWNER, GITHUB_REPO, SUPABASE_ORGANIZATION_NAME, SUPABASE_PROJECT_REF, TEMPLATE_TIER_INSTRUCTION, VERCEL_PROJECT_NAME, VERCEL_REGION, GuardError, supabaseApi, type Fetch } from "./lib.ts";

export type Status = "ok" | "warn" | "block" | "unknown";
export type Finding = { area: "الأسرار" | "Supabase" | "قاعدة البيانات" | "التخزين" | "Vercel" | "حدود الخطة"; status: Status; text: string };

/** The few catalogue questions the database checks ask (read-only SELECTs); injected so a test needs no server. */
export type Probe = { query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>> };
export type PreflightDeps = {
  fetch: Fetch;
  env: Record<string, string | undefined>;
  /** connects as the owner through the session pooler (host from the Management API); the caller closes it */
  openDatabase?: (input: { poolerHost: string }) => Promise<Probe & { close: () => Promise<void> }>;
  /** tries to log in as the restricted role through the pooler; resolves to an SQLSTATE or "ok" */
  tryAppRole?: (input: { poolerHost: string; port: 5432 | 6543 }) => Promise<string>;
  /** lists the buckets with the S3 keys (a read); resolves to "ok" or an error name / HTTP status */
  listBuckets?: () => Promise<string>;
  migrationFilesCount?: number;
};

const trim = (value: string | undefined) => (value ?? "").trim();
const short = (value: unknown, n = 220) => String(value ?? "").replace(/\s+/g, " ").slice(0, n);
const reason = (data: any) => short(data?.error?.message ?? data?.message ?? data?.error?.code ?? data?.code ?? "");

/** Every cron that is NOT the pro-plan set must fire at most once a day: five fields, minute and hour fixed, the rest "*". (Hobby refuses anything more frequent at deploy time.) */
export function cronIsOncePerDay(schedule: string): boolean {
  const [minute, hour, dom, month, dow, ...rest] = schedule.trim().split(/\s+/);
  return rest.length === 0 && /^\d+$/.test(minute ?? "") && /^\d+$/.test(hour ?? "") && dom === "*" && month === "*" && dow === "*";
}

export async function runPreflight(deps: PreflightDeps): Promise<Finding[]> {
  const out: Finding[] = [];
  const add = (area: Finding["area"], status: Status, text: string) => out.push({ area, status, text });
  const guard = async (area: Finding["area"], label: string, work: () => Promise<void>) => {
    try { await work(); } catch (error) { add(area, "block", `${label}: ${short((error as Error)?.message ?? error)}`); }
  };
  const env = deps.env;

  // ------------------------------------------------------------------------------------------------------------------ secrets (names only)
  for (const name of ["OWNER_EMAIL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "VERCEL_TOKEN"]) if (!trim(env[name])) add("الأسرار", "block", `المتغير ${name} غير مضبوط في GitHub (Settings ← Secrets and variables ← Actions).`);
  if (!trim(env.STORAGE_S3_ACCESS_KEY_ID) || !trim(env.STORAGE_S3_SECRET_ACCESS_KEY)) add("الأسرار", "warn", "مفتاحا التخزين STORAGE_S3_ACCESS_KEY_ID وSTORAGE_S3_SECRET_ACCESS_KEY غير موضوعين: سيعمل كل شيء عدا رفع الملفات حتى تضعهما (Supabase ← Project Settings ← Storage ← S3 Connection ← New access key).");
  else add("الأسرار", "ok", "الأسرار الخمسة المطلوبة موجودة (الأسماء فقط فُحصت).");

  // ------------------------------------------------------------------------------------------------------------------ Supabase Management API (GET only)
  let poolerHost = "";
  const supabaseToken = trim(env.SUPABASE_ACCESS_TOKEN);
  if (supabaseToken) {
    const api = supabaseApi(deps.fetch, supabaseToken);
    const base = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}`;
    const get = async (path: string) => {
      const response = await deps.fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${supabaseToken}` } });
      const text = await response.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { status: response.status, ok: response.ok, data };
    };
    await guard("Supabase", "المشروع والمنظمة", async () => {
      const project = await get("");
      if (!project.ok) {
        add("Supabase", "block", project.status === 401 || project.status === 403
          ? `مفتاح SUPABASE_ACCESS_TOKEN مرفوض (${project.status}) عند قراءة المشروع ${SUPABASE_PROJECT_REF}. الأرجح أنه منتهي (صلاحيته 7 أيام) أو محصور بمشروع آخر: أنشئ مفتاحًا جديدًا محصورًا بهذا المشروع (Account ← Access Tokens).`
          : `قراءة المشروع ${SUPABASE_PROJECT_REF} رجعت ${project.status}${reason(project.data) ? `: ${reason(project.data)}` : ""}.`);
        return;
      }
      const state = String(project.data?.status ?? "");
      if (state && state !== "ACTIVE_HEALTHY") add("Supabase", "block", `حالة مشروع Supabase «${state}» وليست ACTIVE_HEALTHY: قد يكون موقوفًا (Paused) أو قيد التشغيل. أعده من لوحة Supabase ثم أعد التشغيل.`);
      else add("Supabase", "ok", `المشروع ${SUPABASE_PROJECT_REF} نشط (المنطقة ${short(project.data?.region)}).`);
      const databaseRegion = String(project.data?.region ?? "");
      const nearest = NEAREST_VERCEL_REGION[databaseRegion];
      if (databaseRegion && nearest && nearest !== VERCEL_REGION) add("Supabase", "warn", `قاعدة البيانات في ${databaseRegion} (الأقرب لها في Vercel: ${nearest}) والدوال مضبوطة على ${VERCEL_REGION}: كل جملة SQL تدفع المسافة بين المنطقتين. غيّر المنطقة في vercel.json وscripts/build-vercel.mjs وVERCEL_REGION.`);
      else if (databaseRegion && nearest) add("Supabase", "ok", `منطقة الدوال ${VERCEL_REGION} هي الأقرب لمنطقة القاعدة ${databaseRegion}.`);
      else if (databaseRegion) add("Supabase", "unknown", `منطقة القاعدة ${databaseRegion} ليست في جدول المطابقة؛ تحقق يدويًا أن ${VERCEL_REGION} الأقرب لها.`);
      try {
        const target = await api.assertTarget(trim(env.SUPABASE_ORGANIZATION_SLUG));
        add("Supabase", "ok", target.organisationCheck === "organisation" ? `المنظمة ${SUPABASE_ORGANIZATION_NAME} قُرئت وطابقت.` : `المفتاح محصور بالمشروع ولا يقرأ المنظمة؛ طابق معرّفها المثبَّت (${short(target.organisationSlug)}).`);
      } catch (error) {
        add("Supabase", "block", error instanceof GuardError ? error.message : `فحص المنظمة: ${short((error as Error).message)}`);
      }
    });
    await guard("Supabase", "إعدادات الدخول", async () => {
      const auth = await get("/config/auth");
      if (!auth.ok) { add("Supabase", "block", `قراءة إعدادات الدخول رجعت ${auth.status}${reason(auth.data) ? `: ${reason(auth.data)}` : ""}. المفتاح المحصور يحتاج صلاحية قراءة وكتابة «Auth» على المشروع.`); return; }
      if (!auth.data?.smtp_host) add("Supabase", "warn", `لا يوجد SMTP مخصّص في Supabase: ${TEMPLATE_TIER_INSTRUCTION}`);
      else add("Supabase", "ok", "SMTP مخصّص مضبوط: يمكن وضع قالب رمز الدخول.");
    });
    await guard("Supabase", "إعدادات Data API", async () => {
      const rest = await get("/postgrest");
      if (!rest.ok) add("Supabase", "block", `قراءة إعدادات Data API رجعت ${rest.status}${reason(rest.data) ? `: ${reason(rest.data)}` : ""}. (التعديل يحتاج صلاحية كتابة لا تُفحص إلا بالتشغيل الحقيقي.)`);
      else add("Supabase", "ok", "إعدادات Data API مقروءة.");
    });
    await guard("Supabase", "مفاتيح API", async () => {
      await api.anonKey(); add("Supabase", "ok", "مفتاح anon/publishable موجود (يُقرأ ولا يُطبع).");
    });
    await guard("Supabase", "عنوان الـpooler", async () => {
      poolerHost = await api.poolerHost(); add("Supabase", "ok", `عنوان الـpooler: ${poolerHost}`);
    });
  }

  // ------------------------------------------------------------------------------------------------------------------ the database, as the owner (SELECT only)
  if (poolerHost && deps.openDatabase && trim(env.SUPABASE_DB_PASSWORD)) {
    let db: (Probe & { close: () => Promise<void> }) | undefined;
    try {
      db = await deps.openDatabase({ poolerHost });
      add("قاعدة البيانات", "ok", "الاتصال بالمالك (postgres) عبر الـpooler يعمل.");
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      add("قاعدة البيانات", "block", code === "28P01" || code === "28000"
        ? `كلمة مرور قاعدة Supabase (SUPABASE_DB_PASSWORD) مرفوضة (${code}). انسخها من Project Settings ← Database ← Reset database password.`
        : `تعذّر الاتصال بقاعدة البيانات عبر الـpooler (${code || short((error as Error).message, 120)}).`);
    }
    if (db) {
      const probe = db;
      await guard("قاعدة البيانات", "صلاحيات المالك", async () => {
        const [me] = await probe.query("SELECT current_user AS name, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser, (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user) AS createrole, current_setting('server_version') AS version");
        if (!me?.createrole && !me?.superuser) add("قاعدة البيانات", "block", `حساب ${me?.name} لا يملك CREATEROLE فلن يستطيع إنشاء دور التطبيق project_os_app.`);
        else add("قاعدة البيانات", "ok", `حساب المالك ${me.name} ${me.superuser ? "superuser" : "ليس superuser (كما في Supabase) ويملك CREATEROLE"}، PostgreSQL ${short(me.version, 12)}.`);
      });
      await guard("قاعدة البيانات", "دور التطبيق", async () => {
        const [role] = await probe.query("SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = 'project_os_app'");
        if (!role) { add("قاعدة البيانات", "ok", "دور التطبيق project_os_app غير موجود بعد: سيُنشأ بكل قيوده."); return; }
        const excess = ["rolsuper", "rolcreatedb", "rolcreaterole", "rolbypassrls", "rolreplication"].filter(name => role[name]).map(name => name.replace(/^rol/, ""));
        add("قاعدة البيانات", excess.length ? "block" : "ok", excess.length ? `دور التطبيق يحمل صلاحيات ممنوعة (${excess.join("، ")}): لن يقبله الزر. صحّحها من Supabase ثم أعد التشغيل.` : "دور التطبيق موجود وبلا أي صلاحية ممنوعة.");
      });
      await guard("قاعدة البيانات", "التخزين (storage.buckets)", async () => {
        const [row] = await probe.query("SELECT to_regclass('storage.buckets') IS NOT NULL AS present, COALESCE(has_table_privilege(current_user, to_regclass('storage.buckets'), 'INSERT'), false) AS can_insert, COALESCE(has_table_privilege(current_user, to_regclass('storage.buckets'), 'UPDATE'), false) AS can_update");
        if (!row?.present) add("قاعدة البيانات", "block", "الجدول storage.buckets غير موجود: ليست قاعدة مشروع Supabase.");
        else if (!row.can_insert || !row.can_update) add("قاعدة البيانات", "block", "حساب المالك لا يملك INSERT/UPDATE على storage.buckets: لن تُنشأ سلال الملفات. أنشئ السلتين project-os-files وproject-os-backups (خاصتين) يدويًا من Storage ثم أعد التشغيل.");
        else add("قاعدة البيانات", "ok", "حساب المالك يستطيع إنشاء سلال التخزين.");
      });
      await guard("قاعدة البيانات", "حماية Data API", async () => {
        const [row] = await probe.query(`SELECT count(*)::int AS n FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE r.rolname IN ('anon','authenticated','service_role') AND ns.nspname = 'public' AND c.relkind = 'r' AND (has_table_privilege(r.oid, c.oid, 'SELECT') OR has_table_privilege(r.oid, c.oid, 'INSERT') OR has_table_privilege(r.oid, c.oid, 'UPDATE') OR has_table_privilege(r.oid, c.oid, 'DELETE'))`);
        add("قاعدة البيانات", row?.n ? "warn" : "ok", row?.n ? `أدوار Data API (anon/authenticated/service_role) تملك ${row.n} صلاحية على جداول التطبيق؛ تُسحب في الترحيلات، وإن بقيت فسيرفض verify-db-security.` : "أدوار Data API لا تملك أي صلاحية على جداول التطبيق.");
      });
      await guard("قاعدة البيانات", "EXECUTE على الدوال", async () => {
        // Read only, with the ACL functions (never a text pattern): functions in public that grant EXECUTE to PUBLIC (a NULL ACL means everyone), and whether the default for new ones excludes PUBLIC.
        const [row] = await probe.query(`SELECT (SELECT count(DISTINCT p.proname)::int FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND a.grantee = 0 AND a.privilege_type = 'EXECUTE' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) AS open_now, EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclobjtype = 'f' AND d.defaclnamespace = 0 AND d.defaclrole = 'postgres'::regrole AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0)) AS closed_by_default`);
        if (!row) { add("قاعدة البيانات", "unknown", "تعذّرت قراءة صلاحيات EXECUTE على الدوال."); return; }
        if (row.open_now || !row.closed_by_default) add("قاعدة البيانات", "warn", `${row.open_now ? `${row.open_now} دالة في public تمنح EXECUTE للجميع (PUBLIC) ` : ""}${row.closed_by_default ? "" : "والدوال الجديدة ستُمنح EXECUTE للجميع افتراضيًا "}— تعالجه الترحيلة 0009 التي يطبّقها الزر، ويتحقق منها verify-db-security بعد التطبيق.`);
        else add("قاعدة البيانات", "ok", "لا دالة في public تمنح EXECUTE للجميع، والدوال الجديدة مغلقة افتراضيًا.");
      });
      await guard("قاعدة البيانات", "الترحيلات", async () => {
        const [row] = await probe.query("SELECT CASE WHEN to_regclass('drizzle.__project_os_migrations') IS NULL THEN 0 ELSE (SELECT count(*) FROM drizzle.__project_os_migrations) END::int AS n");
        add("قاعدة البيانات", "ok", `الترحيلات المطبَّقة ${row?.n ?? 0}${deps.migrationFilesCount ? ` من ${deps.migrationFilesCount} في المستودع` : ""}؛ إعادة التشغيل تتخطى المطبَّق.`);
      });
      await probe.close().catch(() => undefined);
      if (deps.tryAppRole) for (const port of [5432, 6543] as const) {
        const result = await deps.tryAppRole({ poolerHost, port }).catch(error => String((error as Error).message));
        if (result === "ok") add("قاعدة البيانات", "ok", `دخول دور التطبيق عبر الـpooler (المنفذ ${port}) يعمل.`);
        else add("قاعدة البيانات", "warn", `دخول دور التطبيق عبر المنفذ ${port} لم ينجح بعد (${short(result, 80)}): طبيعي قبل أول تهيئة للدور، وستتحقق منه خطوة الإثبات.`);
      }
    }
  } else if (!poolerHost) add("قاعدة البيانات", "unknown", "لم يُفحص شيء في القاعدة لأن عنوان الـpooler لم يُقرأ (انظر بند Supabase أعلاه).");

  // ------------------------------------------------------------------------------------------------------------------ the S3 keys (a read)
  if (deps.listBuckets && trim(env.STORAGE_S3_ACCESS_KEY_ID) && trim(env.STORAGE_S3_SECRET_ACCESS_KEY)) {
    const result = await deps.listBuckets().catch(error => String((error as Error)?.name ?? error));
    if (result === "ok") add("التخزين", "ok", "مفتاحا S3 يعملان (قراءة قائمة السلال نجحت).");
    else if (/InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|403|Forbidden/i.test(result)) add("التخزين", "block", `مفتاحا S3 مرفوضان (${short(result, 60)}): أعد إنشاءهما من Supabase ← Project Settings ← Storage ← S3 Connection وانسخ Access key ID وSecret كاملين.`);
    else add("التخزين", "warn", `تعذّر فحص مفتاحي S3 (${short(result, 80)}). لم يُحكم عليهما.`);
  }

  // ------------------------------------------------------------------------------------------------------------------ Vercel (GET only)
  const vercelToken = trim(env.VERCEL_TOKEN);
  if (vercelToken) {
    const vget = async (path: string) => {
      const response = await deps.fetch(`https://api.vercel.com${path}`, { headers: { Authorization: `Bearer ${vercelToken}` } });
      const text = await response.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { status: response.status, ok: response.ok, data };
    };
    let teamId = trim(env.VERCEL_TEAM_ID);
    await guard("Vercel", "المفتاح", async () => {
      const user = await vget("/v2/user");
      if (!user.ok) { add("Vercel", "block", `VERCEL_TOKEN مرفوض (${user.status}${reason(user.data) ? `: ${reason(user.data)}` : ""}). الأرجح منتهٍ (صلاحيته 7 أيام): أنشئ مفتاحًا جديدًا من Vercel ← Account Settings ← Tokens.`); return; }
      const defaultTeamId = String(user.data?.user?.defaultTeamId ?? "");
      if (!teamId && defaultTeamId) teamId = defaultTeamId;
      add("Vercel", "ok", `المفتاح يعمل. النطاق المعتمد: ${teamId ? `الفريق ${teamId}${trim(env.VERCEL_TEAM_ID) ? " (من VERCEL_TEAM_ID)" : " (الفريق الافتراضي لحسابك، اكتُشف تلقائيًا)"}` : "حسابك الشخصي"}.`);
    });
    const scope = teamId ? `teamId=${encodeURIComponent(teamId)}` : "";
    const q = (path: string) => (scope ? `${path}${path.includes("?") ? "&" : "?"}${scope}` : path);
    await guard("Vercel", "مشروع dashio", async () => {
      const project = await vget(q(`/v9/projects/${VERCEL_PROJECT_NAME}`));
      if (project.status === 404) { add("Vercel", "ok", `لا يوجد مشروع Vercel باسم ${VERCEL_PROJECT_NAME} بعد: سيُنشأ مربوطًا بالمستودع في المنطقة ${VERCEL_REGION}.`); return; }
      if (project.status === 403) { add("Vercel", "block", `قراءة مشروع ${VERCEL_PROJECT_NAME} رُفضت (403${reason(project.data) ? `: ${reason(project.data)}` : ""}): نطاق المفتاح لا يشمل هذا الحساب/الفريق. أنشئ مفتاحًا بنطاق الفريق الذي سيحمل المشروع، أو ضع VERCEL_TEAM_ID.`); return; }
      if (!project.ok) { add("Vercel", "block", `قراءة مشروع ${VERCEL_PROJECT_NAME} رجعت ${project.status}${reason(project.data) ? `: ${reason(project.data)}` : ""}.`); return; }
      const link = project.data?.link;
      const repo = link?.type === "github" ? `${link.org}/${link.repo}`.toLowerCase() : null;
      const want = `${GITHUB_OWNER}/${GITHUB_REPO}`.toLowerCase();
      if (repo && repo !== want) add("Vercel", "block", `مشروع ${VERCEL_PROJECT_NAME} مربوط بمستودع آخر (${short(repo, 60)}). لن يلمسه الزر.`);
      else if (!repo) add("Vercel", "warn", `مشروع ${VERCEL_PROJECT_NAME} موجود بلا ربط بالمستودع؛ سيحاول الزر الربط، وإلا فخطوة يدوية.`);
      else add("Vercel", "ok", `مشروع ${VERCEL_PROJECT_NAME} موجود ومربوط بالمستودع الصحيح.`);
      const functionRegion = project.data?.serverlessFunctionRegion;
      add("Vercel", functionRegion === VERCEL_REGION ? "ok" : "warn", functionRegion === VERCEL_REGION ? `منطقة الدوال في إعداد المشروع الحيّ: ${VERCEL_REGION}.` : `منطقة الدوال في إعداد المشروع الحيّ «${short(functionRegion) || "غير مضبوطة"}» لا ${VERCEL_REGION}؛ الزر يضبطها، وvercel.json يحدّدها لكل نشر على أي حال.`);
      const fluid = project.data?.resourceConfig?.fluid;
      add("حدود الخطة", "unknown", `Fluid compute على المشروع: ${fluid === true ? "مفعّل" : fluid === false ? "غير مفعّل (الدالة بمدة 300 ثانية قد ترفضها خطة Hobby: الحد 60)" : "لم يُقرأ"}. القبول النهائي عند أول نشر حقيقي.`);
    });
    await guard("Vercel", "رؤية المستودع", async () => {
      const repos = await vget(q(`/v1/integrations/search-repo?provider=github&query=${encodeURIComponent(GITHUB_REPO)}`));
      if (!repos.ok) { add("Vercel", "unknown", `تعذّر سؤال Vercel عن المستودعات المرئية (${repos.status}). لا يُعرف إلا بالتشغيل الحقيقي.`); return; }
      const names = (repos.data?.repos ?? []) as Array<{ name?: string; namespace?: string; owner?: any; slug?: string }>;
      const seen = names.some(item => String(item.slug ?? `${item.namespace ?? ""}/${item.name ?? ""}`).toLowerCase() === `${GITHUB_OWNER}/${GITHUB_REPO}`.toLowerCase() || (item.name === GITHUB_REPO && String(item.namespace ?? item.owner ?? "").toLowerCase() === GITHUB_OWNER));
      add("Vercel", seen ? "ok" : "block", seen ? `Vercel يرى المستودع ${GITHUB_OWNER}/${GITHUB_REPO}.` : `Vercel لا يرى المستودع ${GITHUB_OWNER}/${GITHUB_REPO}. ${GITHUB_LINK_INSTRUCTION}`);
    });
  }

  // ------------------------------------------------------------------------------------------------------------------ plan limits the code already respects, and what only the real run can say
  add("حدود الخطة", "ok", "الكرون على Hobby: مهمة يومية واحدة فقط (0 2 * * *)، وهو الحد المسموح (مرة في اليوم).");
  add("حدود الخطة", "ok", `الدوال في منطقة واحدة (${VERCEL_REGION})، وHobby يسمح بمنطقة واحدة.`);
  add("حدود الخطة", "unknown", "حد الرفع العام في Supabase على الخطة المجانية 50 ميجابايت: سلة الملفات (50 م.ب) تعمل بكامل حدها، أما سلة النسخ الاحتياطية (1 جيجابايت) فلن يُرفع إليها ما يتجاوز الحد العام حتى ترفعه من Storage ← Settings أو تترقى.");
  add("حدود الخطة", "unknown", "خطة Hobby من Vercel للاستعمال غير التجاري، وهذا قرار تعاقدي لك لا يفحصه الزر.");
  add("حدود الخطة", "unknown", "قبول النشر (مدة الدالة، الحجم، الكرون) يقرره Vercel عند أول نشر فعلي ولا يُقرأ قبله.");
  return out;
}

export function renderPreflight(findings: Finding[]): string[] {
  const icon: Record<Status, string> = { ok: "✅", warn: "🟡", block: "❌", unknown: "❔" };
  const lines: string[] = [];
  const areas = Array.from(new Set(findings.map(item => item.area)));
  for (const area of areas) { lines.push(`**${area}**`); for (const item of findings.filter(entry => entry.area === area)) lines.push(`- ${icon[item.status]} ${item.text}`); }
  return lines;
}
