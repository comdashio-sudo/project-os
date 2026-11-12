# الإطلاق — صفحة واحدة، نقرٌ فقط (Supabase + Vercel + GitHub)

مشروعان **جديدان ومنفصلان تمامًا**: مشروع Supabase باسم `dashio` ومشروع Vercel باسم `dashio`. لا تُعِد استعمال قاعدة أو مفتاح أو مشروع من أي منصة أخرى عندك. **لا حاجة إلى طرفية، وأسرع منها زر واحد (القسم التالي):** كل ما كان يحتاج أمرًا صار زرًّا في GitHub (Actions ← **Supabase setup** ← **Run workflow**) أو إعدادًا تنقر عليه في لوحة Supabase أو Vercel.

**الخطة الآن مجانية:** Supabase Free وVercel Hobby. القسم ٦ يذكر صراحةً ما يتعطل أو يتغير بدون Pro. المنطقة: مشروع Supabase في **سنغافورة**، ودوال Vercel مضبوطة في الملف على `sin1` (سنغافورة) فلا تغيّرها.

## الإطلاق الآلي بعد كل دمج (27 أكتوبر 2026) — بعده لا يلزم زر Bootstrap إلا لتغيير إعدادات Supabase أو Vercel

ملف `.github/workflows/migrate-production.yml` يعمل وحده بعد أن يخضرّ تشغيل CI على `main` للدمج نفسه (لا عند الدفع مباشرة: الفحوص الثقيلة تسبق الترحيل والترقية، تحديث 27 أكتوبر)، ويكفيه سرّان: `SUPABASE_DB_PASSWORD` و`VERCEL_TOKEN` (تحديث D-78، 9 نوفمبر 2026: ينشر الإنتاج بنفسه بـ Vercel CLI؛ لا `SUPABASE_ACCESS_TOKEN` ولا Deploy Hook). قبل أي ترحيلة يُفحص `VERCEL_TOKEN` بـ`vercel whoami`، فإن رُفض يقف التشغيل برسالة «VERCEL_TOKEN rejected» ولا يُرحَّل شيء. الترتيب هو الأمان:
1. فحص أن الترحيلات **متوافقة للخلف** (`scripts/ci/check-migration-compat.mjs`، ويعمل في CI أيضًا).
2. تطبيق الترحيلات على قاعدة الإنتاج ثم `verify-db-security` (نتيجتهما في ملخص التشغيل).
3. بناء النسخة المرشّحة في المشغّل وتشغيلها على القاعدة بعد الترحيل بحساب التطبيق المقيَّد: `/healthz` يرجع 200، ورمز دخول خاطئ يرجع 4xx لا 5xx، و`/api/readyz` لا يذكر ترحيلة معلّقة.
4b. فقط عندها يُنشر الإنتاج من المشغّل نفسه بـ Vercel CLI (نسخة مثبّتة 65.2.0): `vercel pull --yes --environment=production` ثم `vercel build --prod` ثم `vercel deploy --prebuilt --prod --skip-domain`، لفريق ومشروع `post-deploy.yml` نفسيهما. بـ`--skip-domain` لا ينتقل نطاق الإنتاج إلى النشر الجديد بعد. لا يلزم أي إعداد في Vercel.
5. `vercel inspect` يثبت أن النشر الجديد `READY` وهدفه `production`، ثم `scripts/ci/post-deploy-check.mjs` يفحص **عنوانه هو**. فشلٌ هنا لا يغيّر الإنتاج (لا تراجع لازم) ويحمرّ التشغيل.
   ثم `vercel promote`، ثم يُسأل `vercel inspect` عن عنوان الإنتاج كل 10 ثوانٍ حتى يسمّي النشر الجديد (مهلة 300 ثانية، لا انتظار ثابت)، ثم الفحص نفسه على عنوان الإنتاج. أي فشل بعد الترقية ← `vercel rollback` إلى النشر الذي كان يخدم قبل 4b، ويحمرّ التشغيل. والترقية الصريحة تعيد أيضًا الإسناد الآلي للنطاقات الذي يعطّله أي تراجع سابق.
   إن كان عنوان النشر محميًا (401/403) ولا سرّ `VERCEL_AUTOMATION_BYPASS_SECRET`، فلا يُعدّ ذلك عطلًا: يُكتب تنبيه ويُكتفى بالفحص على عنوان الإنتاج بعد الترقية، والتراجع خلفه.
6. أخيرًا يُقدَّم فرع `production` إلى هذا الالتزام (fast-forward، بلا force-push). صار سجلًا لما يخدمه الإنتاج (عليه يُحسب «ما الذي سيُشحن»)، فلا يتحرك إلا بعد نجاح 5، والنشر الفاشل يُعاد في التشغيل التالي.
وآخر خطوة تحذف `.vercel/` دائمًا (فيها متغيرات الإنتاج المسحوبة)، ولا يُرفع منها شيء.
فشلت أي خطوة قبل 4b ← لا نشر، والموقع يبقى على النسخة السابقة. وتغيير يمسّ التوثيق وملفات العمل فقط لا ينشر ولا يرحّل.

**قاعدة الترحيلات (توسيع ثم انكماش):** كل ترحيلة تُطبَّق والنسخة السابقة ما زالت تخدم الناس، فلا تكسرها. مسموح: جدول جديد، عمود يقبل NULL أو بقيمة افتراضية، فهرس، قيمة enum جديدة، تخفيف قيد. ممنوع في الإصدار نفسه: حذف/إعادة تسمية جدول أو عمود أو نوع أو دالة، تغيير نوع عمود، `SET NOT NULL`، عمود `NOT NULL` بلا `DEFAULT`. الانكماش يأتي في إصدار **لاحق** حين لا يقرأ أي كود شغّال ذلك العمود، ويحمل الملف سطر `-- contract-ok: <الإصدار الذي توقف عن استعماله>`. الحارس يُسقط البناء إن خولف هذا.

**ما تفعله أنت مرة واحدة:**
1. السرّ `SUPABASE_DB_PASSWORD` موجود عندك أصلًا (يستعمله زر Bootstrap) — لا جديد فيه.
2. **المفتاح العام لـSupabase في المستودع، لا في GitHub (D-35، 2026-11-08):** سير الإطلاق يقرأ عنوان المشروع ومفتاحه **العام** من `config/supabase.public.json` (`url` و`publishableKey`)، ولا يقرأ أي متغير GitHub. القيمة: Supabase ← مشروع dashio ← **Project Settings ← API Keys ← Publishable key** (يبدأ بـ`sb_publishable_`؛ **لا تنسخ `sb_secret_` ولا `service_role` أبدًا** — يرفضهما السير واختبار `server/testing/supabasePublicConfig.test.ts`، و`scan-secrets` يرفض أي JWT فلا يصلح مفتاح anon القديم هنا). المفتاح **اختياري منذ D-69 (2026-11-08)**: ما دام `publishableKey` فارغًا يجري الإطلاق كاملًا، ويستبدل فحص ما قبل الترقية «رمز خاطئ يُرد 4xx» (يرد بلا مفتاح 503 `MAIL_UNAVAILABLE` بالتصميم) بالإجراء العام `system.health` (200 و`ok=true`)، و`/healthz` و`/api/readyz` كما هما (`scripts/ci/public-config-check.sh` ثم `post-deploy-check.mjs --without-sign-in`). وحين يُملأ المفتاح يعود فحص الرمز الخاطئ تلقائيًا. أي قيمة غير فارغة لا تبدأ بـ`sb_publishable_` تُسقط الإطلاق قبل أي ترحيل. المتغير القديم `SUPABASE_ANON_KEY` في GitHub لم يعد يُقرأ.
3. السرّ `VERCEL_TOKEN` موجود أصلًا (البند 11 في `docs/OWNER_ACTIONS.md`)؛ إن انتهى فالتشغيل يقول «VERCEL_TOKEN rejected» قبل أي ترحيلة، فأنشئ رمزًا جديدًا (Vercel ← Account Settings ← Tokens، نطاق الفريق dashio) وضعه مكانه. **ولا حاجة بعد الآن إلى نقرة Production Branch (O-5):** اتركها `main`؛ `scripts/ci/vercel-ignore.sh` يرفض بناء إنتاج من `main` عبر git، ونشر CLI بـ`--prebuilt` لا بناء له على Vercel أصلًا فلا تنطبق عليه خطوة التجاهل. وإن غيّرتها إلى `production` فسيُبنى الالتزام نفسه مرة ثانية من git بعد الخطوة 6 (نشر مكرر، لا ضرر سوى الحصة).
4. اختياري: متغير `SUPABASE_POOLER_HOST` (Supabase ← Connect ← Session pooler ← الجزء بعد `@` وقبل `:5432`) يوفّر محاولة اكتشاف المضيف؛ بدونه يجرّب التشغيل مضيفين معروفين ويسمّي الذي نجح في الملخص.
لماذا لا Deploy Hook: دفع الفرع `production` هو المُطلِق نفسه، فلا رابط سري يُنشأ أو يُدار أو يُسرَّب.

## الطريق المختصر: زر واحد (يُنصح به)

يُعدّ الزر كل ما في هذه الوثيقة آليًا: إعدادات الدخول وقالبا الرمز في Supabase، وإغلاق Data API، وبناء الاتصالات، والترحيلات وحساب التطبيق والحاويات والتحقق، ثم مشروع Vercel `dashio` بمنطقة `sin1` ومتغيرات Production والنشر والرابط وفحص `/healthz`. **ثلاثة أسرار فقط** تضعها في GitHub (المستودع ← **Settings ← Secrets and variables ← Actions ← New repository secret**):

| السر | من أين تنسخه |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase ← صورتك أسفل اليسار ← **Account preferences ← Access Tokens ← Generate new token** (اسمه مثلًا `dashio-bootstrap`) ← انسخه فور ظهوره |
| `VERCEL_TOKEN` | Vercel ← صورتك ← **Account Settings ← Tokens ← Create Token** (النطاق: حسابك) ← انسخه فور ظهوره |
| `SUPABASE_DB_PASSWORD` | كلمة مرور قاعدة مشروع `dashio` التي اخترتها عند إنشائه (إن نسيتها: **Project Settings ← Database ← Reset database password**، ثم اكتب الجديدة هنا) |

ثم: GitHub ← **Actions ← Bootstrap launch ← Run workflow** ← اكتب بريدك في `owner_email` ← **Run workflow**. في آخر التشغيل افتح **Summary** (بالعربية): فيه ما أُنجز والرابط ونتيجة `/healthz` وأي خطوة يدوية متبقية.

**الحراسة (المفتاحان يريان مشاريعك الأخرى):** الزر لا يعمل إلا على مشروع Supabase واحد معرّفه `dzfxgxccnlyhcjgqstgn` داخل منظمة اسمها `dashio`، ويتحقق من الاثنين قبل أي كتابة ويتوقف إن لم يتطابقا؛ ولا يسرد مشاريعك ولا يقرأ غير هذا المشروع. وفي Vercel لا ينشئ أو يحدّث إلا مشروعًا اسمه `dashio` مربوطًا بالمستودع `comdashio-sudo/project-os`، ويتوقف إن وجد مشروعًا بهذا الاسم مربوطًا بمستودع آخر. **بعد نجاح الإطلاق احذف الرمزين** (Supabase وVercel) من حسابيك ومن GitHub Secrets، وأنشئ غيرهما عند الحاجة.

**آمن لإعادة التشغيل:** كلمة مرور حساب التطبيق تُشتق ثابتةً من `SUPABASE_DB_PASSWORD` فلا تتغير؛ و`JWT_SECRET` و`CRON_SECRET` يُولَّدان مرة واحدة ولا يُستبدلان إن كانا موجودين في Vercel؛ والترحيلات والحاويات تكرارها لا يضر.

**الخطوة اليدوية الوحيدة المتوقعة: مفتاح التخزين (S3).** واجهة Supabase البرمجية لا تنشئه. بعد أول تشغيل: Supabase ← **Project Settings ← Storage ← S3 Connection ← New access key** ← انسخ **Access key ID** و**Secret access key** (السر يظهر مرة واحدة) ← الصقهما في Vercel ← `dashio` ← **Settings ← Environment Variables** باسمَي `STORAGE_S3_ACCESS_KEY_ID` و`STORAGE_S3_SECRET_ACCESS_KEY` (Production) ثم **Deployments ← Redeploy**؛ أو أضفهما سرّين في GitHub بالاسمين نفسهما وأعد تشغيل الزر. بدونهما يعمل كل شيء عدا رفع الملفات. **لماذا لا يُستغنى عنه (D-55، 2026-11-08):** البديل الوحيد بالمفاتيح الموجودة (مفتاح anon/publishable وحده، أو معه رمز جلسة المستخدم) تمرّ طلباته بحماية الصفوف على `storage.objects`، والتخزين يرفض كل رفع بلا سياسة؛ فلا يعمل إلا بسياسة لدور `anon` أو `authenticated` — والمفتاح العام في كل متصفح، فتلك السياسة تفتح الملفات لغير شركتها، والمستودع لا يمنح صلاحيات. الدليل في `docs/STATE.md` «D-55».

**إن توقف الزر عند Vercel** بأن المستودع غير مرئي: GitHub ← صورتك ← **Settings ← Applications ← Installed GitHub Apps ← Vercel ← Configure ← Repository access ← Only select repositories ← أضف `project-os` ← Save**، ثم أعد تشغيل الزر (يقول الملخص هذا بالضبط).

**البريد (SMTP) مؤجَّل** إلى ما قبل دعوة مستخدمين آخرين: الزر لا يضبطه. إلى ذلك الحين يصل رمز الدخول عبر بريد Supabase المدمج، وهو محدود جدًا وقد لا يرسل إلا لعناوين أعضاء منظمة `dashio` في Supabase؛ فاستعمل بريدًا هو عضو فيها. قبل أي مستخدم آخر نفّذ الخطوة ١-٣ أدناه.

الأقسام التالية هي **الطريق اليدوي البديل** (نقر في اللوحات) لمن لا يريد استعمال الرموز، وتبقى مرجعًا لما يفعله الزر.

---

## الأسرار كلها: الاسم ← من أين تنسخ ← أين تلصق

> **أين تلصق في GitHub:** المستودع `comdashio-sudo/project-os` ← **Settings ← Secrets and variables ← Actions ← New repository secret**.
> **أين تلصق في Vercel:** المشروع `dashio` ← **Settings ← Environment Variables** ← البيئة **Production**.
> **لا تلصق أي سر في محادثة.** «تُولِّد» تعني: مولّد كلمات المرور في مدير كلمات المرور عندك (طول 48 حرفًا، حروف وأرقام).

| الاسم | من أين تنسخه بالضبط | أين تلصقه |
|---|---|---|
| `SUPABASE_ADMIN_DATABASE_URL` | لوحة Supabase ← مشروع `dashio` ← زر **Connect** أعلى الصفحة ← **Connection String** ← **Method: Session pooler** ← **URI**؛ استبدل `[YOUR-PASSWORD]` بكلمة مرور القاعدة التي اخترتها عند إنشاء المشروع. اسم المستخدم فيه `postgres.<المعرّف>`. **لا تستعمل Direct connection:** على الخطة المجانية لا يعمل إلا عبر IPv6 ولن يصله GitHub. | GitHub فقط |
| `SUPABASE_DB_CA` | ← **Project Settings ← Database ← SSL Configuration ← Download certificate** ← افتح الملف المنزَّل بمحرر نصوص وانسخ **كل** محتواه (من `-----BEGIN CERTIFICATE-----` إلى `-----END CERTIFICATE-----`) | GitHub **و** Vercel باسم `DATABASE_SSL_CA` |
| `PROJECT_OS_APP_DB_PASSWORD` | تُولِّدها أنت (16 حرفًا فأكثر). هي كلمة مرور حساب التطبيق `project_os_app` الذي ينشئه الزر. احفظها في مدير كلمات المرور. | GitHub **و** داخل `DATABASE_URL` في Vercel (الصف التالي) |
| `DATABASE_URL` | زر **Connect** ← **Method: Transaction pooler** ← **URI**؛ ثم غيّر فيه شيئين: اسم المستخدم من `postgres.<المعرّف>` إلى `project_os_app.<المعرّف>`، وكلمة المرور إلى `PROJECT_OS_APP_DB_PASSWORD`. المنفذ فيه `6543`. | Vercel فقط |
| `DATABASE_SSL_CA` | نفس محتوى `SUPABASE_DB_CA` أعلاه | Vercel فقط |
| `SUPABASE_URL` | ← **Project Settings ← API** ← **Project URL** (`https://<المعرّف>.supabase.co`) | Vercel |
| `SUPABASE_ANON_KEY` | ← **Project Settings ← API Keys** ← المفتاح **anon / publishable** (الذي يُسمّى «public»). هو الوحيد من مفاتيح Supabase الذي يلمسه الخادم. **لا تنسخ `service_role`/secret أبدًا.** | Vercel |
| `STORAGE_S3_ENDPOINT` · `STORAGE_S3_REGION` | ← **Project Settings ← Storage ← S3 Connection** ← **Endpoint** و**Region** | Vercel |
| `STORAGE_S3_ACCESS_KEY_ID` · `STORAGE_S3_SECRET_ACCESS_KEY` | نفس الصفحة ← **New access key** ← انسخ **Access key ID** و**Secret access key** (السر يظهر مرة واحدة) | Vercel |
| `STORAGE_BUCKET` | القيمة الثابتة `project-os-files` (ينشئها زر `storage`) | Vercel |
| `STORAGE_MODE` | اختياري: `database` يُبقي الملفات في قاعدة البيانات صراحةً (D-79). بلا متغيرات S3 الخمسة كلها يُستعمل وضع القاعدة تلقائيًا، وضبط بعضها فقط يُرفض باسم الناقص | Vercel |
| `JWT_SECRET` | تُولِّده (48 حرفًا) | Vercel |
| `CRON_SECRET` | تُولِّده (32 حرفًا فأكثر)؛ Vercel يرسله بنفسه مع المهمة المجدولة | Vercel |
| `INTEGRATION_SECRET_KEY` | تُولِّده (48 حرفًا) | Vercel — يختم أسرار Webhooks وكلمات مرور الربط بأنظمة الشركة؛ إن تغيّر أُدخلت كلمات الربط من جديد (لا شيء آخر يتأثر). بدونه يُستعمل `JWT_SECRET` |
| `INTEGRATION_ALLOW_PRIVATE_WEBHOOKS` | **اتركه غير موجود** | يسمح بعناوين محلية/خاصة لـWebhooks (للاختبار المحلي فقط) |
| `OWNER_EMAIL` | بريدك؛ أول دخول به يجعلك مدير المنصة | Vercel |
| `APP_BASE_URL` | رابط المشروع بعد أول نشر: Vercel ← `dashio` ← **Domains** ← انسخ `https://….vercel.app` | Vercel |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` · `EMAIL_FROM` | لوحة مزود البريد الذي تملك نطاقه (إشعارات المنصة؛ اختياري حتى تفعّلها) | Vercel |
| `EMAIL_NOTIFICATIONS_ENABLED` | اكتب `false` الآن، و`true` حين يجهز البريد | Vercel |
| `VERCEL_GIT_COMMIT_SHA` | **لا تضعه بيدك:** يضعه Vercel بنفسه في كل نشر من Git ما دام **Settings ← Environment Variables ← Automatically expose System Environment Variables** مفعّلًا (الافتراضي). يُعرض أول 12 حرفًا منه في `/api/readyz` لتتأكد الخطوة 6b من الإطلاق أن الإنتاج يخدم الالتزام المدفوع (D-85b) | Vercel (تلقائي) |

متغيرات اختيارية بقيمها: `DATABASE_POOL_MAX` = `3` · `AUTH_CODE_TTL_SECONDS` = `3600` · `EMAIL_DAILY_LIMIT` (حد رسائل حساب SMTP اليومي حسب خطتك، الافتراضي 100) · `EMAIL_LOGIN_RESERVE` (الجزء المحجوز لرموز الدخول من ذلك الحد، الافتراضي 40: الإشعارات لا تستعمل إلا الباقي والزائد ينتظر الغد) · `EMAIL_BURST_PER_MINUTE` (الافتراضي 20: بلوغه يوقف الإرسال 15 دقيقة) · `EMAIL_BLOCK_RESERVED_DOMAINS` (الافتراضي `true` في الإنتاج: لا بريد إلى `.test` و`.invalid` و`.local` ونطاقات example) · `API_RATE_LIMIT_PER_MINUTE` = `600` · `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` (اتركهما فارغين) · `LLM_ENABLED` = `false` مع ترك `LLM_API_KEY` و`LLM_BASE_URL` فارغين · `SMART_READING_MONTHLY_CAP_USD` (الافتراضي 5: سقف التكلفة التقديرية للقراءة الذكية لكل شركة شهريًا؛ لا أثر له ما دام `LLM_ENABLED=false`) · `BACKUP_BUCKET` · `BACKUP_ENCRYPTION_KEY` · `BACKUP_DATABASE_URL` (للنسخ الاحتياطي اليدوي فقط، لا تضعها في Vercel) · `VITE_MAX_UPLOAD_BYTES` (افتراضي 3000000) · `VERCEL_FUNCTION_MAX_DURATION` (افتراضي 300) · `CRON_PLAN` (اتركه غير موجود ما دمت على Hobby). · `MFA_ENFORCEMENT` (اتركه **غير موجود**: التحقق بخطوتين إلزامي لمالك المنصة ولكل مدير شركة. اكتب `off` **فقط** إن فُقد الهاتف **ومعه** رموز الاسترداد، لتدخل وتعيد التفعيل، ثم احذفه فورًا — يرفع الإلزام ولا يمسّ المفاتيح المخزَّنة) · `REGISTRATION` (اتركه **غير موجود**: الدخول بدعوة فقط، ومالك المنصة وحده ينشئ الشركات؛ اكتب `open` فقط يوم تقرر فتح التسجيل) · `API_RATE_LIMIT_PER_MINUTE` = `600` · `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` (اتركهما فارغين) · `LLM_ENABLED` = `false` مع ترك `LLM_API_KEY` و`LLM_BASE_URL` فارغين · `SMART_READING_MONTHLY_CAP_USD` (الافتراضي 5: سقف التكلفة التقديرية للقراءة الذكية لكل شركة شهريًا؛ لا أثر له ما دام `LLM_ENABLED=false`) · `BACKUP_BUCKET` · `BACKUP_ENCRYPTION_KEY` · `BACKUP_DATABASE_URL` (للنسخ الاحتياطي اليدوي فقط، لا تضعها في Vercel) · `VITE_MAX_UPLOAD_BYTES` (افتراضي 3000000) · `VERCEL_FUNCTION_MAX_DURATION` (افتراضي 300) · `CRON_PLAN` (اتركه غير موجود ما دمت على Hobby).

**لا تضع أبدًا** في أي مكان: مفتاح `service_role`، ولا `DATABASE_SSL=off`، ولا `DATABASE_SSL_VERIFY=off`، ولا `TEST_DATABASE_URL`، ولا `PROJECT_OS_USE_ADMIN_DATABASE_URL`، ولا `TEST_DB_NO_FALLBACK`، ولا `GOTRUE_LIVE_URL`، ولا `SUPABASE_AUTH_URL` (لمحرك دخول محلي فقط).

---

## الخطوات بالترتيب

### ١) مشروع Supabase باسم `dashio`
<https://supabase.com/dashboard> ← **New project** ← الاسم `dashio` ← كلمة مرور قاعدة طويلة (تحفظها في مدير كلمات المرور) ← **Region: Southeast Asia (Singapore)** ← Plan: **Free**.

**الدخول برمز البريد (كلها نقر في لوحة Supabase):**
١. **Authentication ← Providers ← Email** ← مفعّل ← **Confirm email** مفعّل ← **Email OTP Length = 6** ← **Email OTP Expiration = 3600**. (الشاشة تقبل 6 أرقام؛ لا تغيّر الطول.)
٢. **Authentication ← Emails ← Templates** ← افتح **Confirm signup** و**Magic Link** ← الصق في **كلٍّ منهما** محتوى الملف `docs/auth-email-templates/otp.html` (افتحه من GitHub ← **Raw** ← انسخ). يعرض `{{ .Token }}` وهو الرمز؛ بدونه يصل رابط لا يستعمله التطبيق. الموضوع: `رمز الدخول إلى Dashio | Dashio sign-in code`. القالب بلا أي رابط عمدًا: نطاق المرسل غير نطاق المنصة، والزر الذي يشير إلى نطاق آخر يرفع احتمال وصول الرسالة إلى المزعجة؛ يعود الزر حين يصبح للمنصة نطاقها الخاص.
٣. **(مؤجَّل إلى ما قبل دعوة مستخدمين آخرين)** **Authentication ← SMTP Settings** ← **Enable Custom SMTP** ← بيانات مزود بريد تملك نطاقه (SPF وDKIM مضبوطان) ← مرسل مثل `PROJECT OS <login@mail.<نطاقك>>`. **هذا إلزامي حتى على المجانية:** بريد Supabase المدمج لا يرسل إلا عددًا ضئيلًا جدًا في الساعة ولا يصلح لأي مستخدم حقيقي.
٤. **Authentication ← Rate Limits** ← ارفع **Rate limit for sending emails** و**Rate limit for token verifications** إن سمحت لوحتك بذلك بعد تفعيل SMTP المخصص (حد التحقق يُحسب لكل IP، وكل مستخدمي Vercel يصلون من عدد قليل من العناوين).
٥. **Authentication ← Sign In / Providers** ← **Allow new users to sign up** مفعّل. لا تفعّل مزودًا آخر.

**الواجهة البرمجية العامة (Data API):** **Project Settings ← API** (أو **Data API**) ← أوقفها أو أزل `public` من **Exposed schemas**. التطبيق لا يستعملها، وكل جدول محمي أصلًا؛ هذا إغلاق ثانٍ.

### ٢) أسرار GitHub ثم زرّا الإعداد (بلا طرفية)
١. ألصق في GitHub الأسرار الثلاثة: `SUPABASE_ADMIN_DATABASE_URL` و`SUPABASE_DB_CA` و`PROJECT_OS_APP_DB_PASSWORD` (من الجدول أعلاه).
٢. GitHub ← **Actions ← Supabase setup ← Run workflow** ← الفرع `main` ← **action = `migrate`** ← شغّل. يبني المخطط كاملًا، ويفعّل حماية الصفوف، وينشئ الدور `project_os_app` بلا صلاحية DDL (هذا ما كان يُسمّى `pnpm db:migrate` ثم `provision:app-role`)، ثم يثبت (`verify:db-security`) أنه لا UPDATE ولا DELETE ولا TRUNCATE على `audit_logs` وأن حماية الصفوف تعمل. **إن فشل (علامة حمراء) فلا تنشر.**
٣. شغّله ثانيةً بـ**action = `storage`**: ينشئ حاويتين **Private** (غير عامتين): `project-os-files` بحد 50 MB للملف، و`project-os-backups`. بعدها: Supabase ← **Project Settings ← Storage ← S3 Connection** ← خذ Endpoint وRegion وأنشئ **New access key** (الصفوف في الجدول أعلاه).
٤. أعد تشغيل **action = `migrate`** بعد كل إصدار جديد فيه ترحيلة، وبـ**`verify`** متى أردت فحصًا للأمان بلا تغيير.

### ٣) مشروع Vercel باسم `dashio`
<https://vercel.com/new> ← استورد `comdashio-sudo/project-os` ← الفرع `main` ← **اسم المشروع `dashio`** ← Framework Preset: **Other** (الأوامر والمنطقة `sin1` في `vercel.json`؛ لا تغيّرها) ← **Environment Variables** (الصفوف الموسومة Vercel في الجدول أعلاه، للبيئة Production) ← **Deploy**. بعد النشر: **Settings ← Functions** تأكد أن **Function Region** تقول Singapore (sin1). لا تربط نطاقًا عامًا قبل اكتمال الفحص (النشر العام يحتاج أمرًا منك).

### ٤) فحص ما بعد النشر من الجوال (خمس دقائق)
١. `https://<الرابط>/healthz` ← كلمة **ok**. ٢. `/login` ← تظهر بالعربية ← اكتب `OWNER_EMAIL` ← يصلك **رمز من 6 أرقام** (ليس رابطًا) ← ادخل ← تصل للوحة. ٣. اكتب رمزًا خطأ ٥ مرات ← تُغلق المحاولة ١٥ دقيقة بالرسالة العامة نفسها. ٤. أنشئ شركة تجريبية ← أضف مشروعًا ← ارفع ملفًا أصغر من ٣ MB في المستندات ← يظهر وينزل. ٥. Vercel ← `dashio` ← **Settings ← Cron Jobs** ← تظهر **مهمة واحدة** (`/api/scheduled/daily`) ← **Run** ← في **Logs** الرد ٢٠٠ وفيه `PROJECT_OS_DAILY_JOBS_DONE`. ٦. Supabase ← **Logs ← Postgres** بلا أخطاء `permission denied` ولا `row-level security` على الصفحات الرئيسية. ٧. **الرفع الكبير من الجوال:** شاشة الاستيراد ← «الجدول الزمني» ← ارفع XER بحجم ≈٣٠ MB (أو Excel بـ٢٠ ألف صف) ← شريط «جارٍ رفع الملف» ثم «قيد المعالجة» بمراحله ثم «جاهز للتأكيد» ← أكّد ← «قيد المعالجة» ثم أعداد السجلات. فشله يظهر بـ«فشلت المعالجة» وسببه. **هذا الفحص يثبت ما لم أستطع إثباته من هنا:** أن المتصفح يرفع إلى Supabase مباشرة (Supabase لا يوفّر لوحة لضبط CORS للتخزين؛ إن رفضه المتصفح فأبلغني بنص الخطأ)، وأن الحاوية تقبل 50 MB، وأن المعالجة تكتمل بعد الرد على Vercel.

---

## ٥) حدود تعرفها قبل أن تعد بها أحدًا

- **حجم الرفع.** ملف الاستيراد (Excel/CSV/XER) يُرفع مباشرة من المتصفح إلى Supabase Storage بعنوان موقَّع صالح ١٥ دقيقة، حتى **50 MB**، ثم يعالجه الخادم كمهمة خلفية بحالة تقدم؛ فلا يمسّه سقف Vercel لجسم الطلب (4.5 MB). بقية الشاشات التي ترسل ملفًا داخل الطلب (مرفقات المستندات، استيراد PMC، خطة PMC، ربط المخطط العام) على سقف **3 MB**.
- **المهمة الخلفية.** تعمل بعد إرجاع الرد (`waitUntil`)، ودالة قُتلت عند حدّها تُنعش من الاستطلاع التالي (حتى ٣ محاولات). **الذاكرة:** تحليل Excel بـ50 ألف صف بلغ ذروة ≈1.06 GB محليًا؛ دوال Hobby لها ٢ GB فتكفي.
- **الاتصالات.** كل نسخة دالة تفتح `DATABASE_POOL_MAX` اتصالًا بالمجمّع (٦٥٤٣)؛ المجمّع يحمي القاعدة. لا تستعمل Direct connection في التطبيق.

## ٦) ما يتعطل أو يتغير على المجاني بدون Pro (بصراحة)

| الخدمة | القيد على المجاني | الأثر على المنصة |
|---|---|---|
| Vercel Hobby | المهمة المجدولة **مرة في اليوم** وبحد أقصى مهمتين | لذلك صارت **مهمة واحدة** يومية (٠٢:٠٠ UTC تقريبًا؛ Hobby لا يضمن الدقيقة) تشغّل: انتهاء التراخيص، لقطات الربحية، دورة إشعارات البريد، مسح مهام الاستيراد. **تتعطل:** إشعارات البريد كل ساعة (تصير يومية)، والمسح كل ٥ دقائق (يبقى استطلاع الشاشة هو الذي ينعش المهمة الميتة، والرفوع اليتيمة تُحذف يوميًا). على Pro ضع في Vercel متغير البناء `CRON_PLAN` = `pro` فتعود المهام الأربع. |
| Vercel Hobby | مخصص للاستعمال الشخصي غير التجاري (شروط الخدمة) | تشغيل منصة تجارية للعملاء يستلزم Pro؛ راجع الشروط قبل أول عميل مدفوع. |
| Vercel Hobby | سجلات قصيرة الاحتفاظ، ومنطقة دوال واحدة | تحقق من أخطاء الإنتاج سريعًا؛ لا تعدد مناطق. |
| Supabase Free | **توقف المشروع بعد أسبوع بلا نشاط** | المهمة اليومية تستعلم القاعدة فتُبقي المشروع نشطًا؛ إن تعطّلت الجدولة أسبوعًا توقف المشروع ويُستأنف من لوحة Supabase بنقرة **Restore**. |
| Supabase Free | **لا نسخ احتياطية يومية ولا استعادة لنقطة زمنية** (هذه Pro) | **تتعطل الحماية من فقدان البيانات.** ضع Pro قبل أي بيانات عميل حقيقية. أداة التصدير المشفّر (`scripts/export-database.mjs`) تحتاج طرفية ولذلك ليست جزءًا من هذه الصفحة. |
| Supabase Free | قاعدة 500 MB وتخزين 1 GB وملف حتى 50 MB | يكفي الاختبار والتجربة؛ المشروع الحقيقي يتجاوزها سريعًا. |
| Supabase Free | الاتصال المباشر (٥٤٣٢) IPv6 فقط | لذلك يستعمل زرّ الإعداد **Session pooler** لا Direct connection. |
| Supabase Free | بريد Supabase المدمج محدود جدًا | **إلزامي** تفعيل SMTP المخصص (الخطوة ١-٣) وإلا لن يصل الرمز لأكثر من قلة. |
| GitHub Actions | دقائق مجانية شهريًا | الزر يدوي فقط ويستهلك دقائق قليلة؛ لا يعمل شيء منه تلقائيًا. |

---
**ما جُرِّب محليًا:** `pnpm test:db` (كل اختبارات القاعدة بحساب التطبيق المقيَّد على PostgreSQL محلي)، ومحرك دخول Supabase Auth حقيقي، وحزمة الدالة (`pnpm build:vercel`) وتشغيلها، ومسار المهمة اليومية. **ما لم يُجرَّب:** أي شيء على Supabase أو Vercel أو GitHub Actions الحقيقيين — لا اتصال بأيٍّ منها من هنا، وملف الـworkflow لم يُشغَّل بعد (أول تشغيل له هو اختباره).
