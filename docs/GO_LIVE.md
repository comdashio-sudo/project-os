# الإطلاق — صفحة واحدة (Supabase + Vercel)

مشروعان **جديدان ومنفصلان تمامًا** لهذه المنصة: مشروع Supabase باسم `dashio`، ومشروع Vercel باسم `dashio`. لا تُعِد استعمال قاعدة أو مفتاح أو مشروع من أي منصة أخرى عندك، ولا تضع مفتاحًا من هنا في أي مكان آخر. الترتيب: Supabase ← الترحيلات ← حساب التطبيق ← Vercel ← فحص من الجوال. كل أمر هنا يُنفَّذ في شاشة تراها أو في طرفية على جهازك؛ لا شيء منها يعمل من داخل المستودع.

## ١) مشروع Supabase باسم `dashio`

<https://supabase.com/dashboard> ← **New project** ← الاسم `dashio` ← كلمة مرور قاعدة طويلة (احفظها في مدير كلمات المرور، لا تلصقها في أي محادثة) ← المنطقة الأقرب لمستخدميك وللمنطقة التي ستختارها لـVercel في الخطوة ٣.

**أ) الاتصالات.** **Connect** ← انسخ نصَّين:
- **Direct connection** (المنفذ 5432) ← للترحيلات وحدها: `postgresql://postgres:<كلمة المرور>@db.<المعرّف>.supabase.co:5432/postgres`.
- **Transaction pooler** (المنفذ 6543) ← للتطبيق: `postgresql://project_os_app.<المعرّف>:<كلمة مرور حساب التطبيق>@aws-…pooler.supabase.com:6543/postgres`. اسم المستخدم فيه **`project_os_app.`** ثم معرّف المشروع، لا `postgres`.
- **Project Settings ← Database ← SSL Configuration** ← نزّل شهادة الجذر (CA) ← محتواها يوضع في `DATABASE_SSL_CA` (سطر واحد بـ`\n` بين الأسطر) ليكون الاتصال **موثَّقًا** لا مشفَّرًا فقط.

**ب) الدخول برمز البريد (Authentication).**
١. **Authentication ← Providers ← Email** ← مفعّل ← **Confirm email** مفعّل ← **Email OTP Length = 6** ← **Email OTP Expiration = 3600**. (الشاشة تقبل 6 أرقام؛ لا تغيّر الطول.)
٢. **Authentication ← Emails ← Templates** ← افتح **Confirm signup** و**Magic Link** ← الصق في **كلٍّ منهما** محتوى الملف `docs/auth-email-templates/otp.html` (يعرض `{{ .Token }}` وهو الرمز؛ بدونه يصل رابط لا يستعمله التطبيق) ← الموضوع: `PROJECT OS sign-in code`.
٣. **Authentication ← SMTP Settings** ← **Enable Custom SMTP** ← بيانات مزود بريد تملك نطاقه (SPF وDKIM مضبوطان) ← مرسل مثل `PROJECT OS <login@mail.<نطاقك>>`. بريد Supabase المدمج محدود بعدد قليل في الساعة ولا يصلح للإنتاج.
٤. **Authentication ← Rate Limits** ← ارفع **Rate limit for sending emails** و**Rate limit for token verifications** إلى ما يناسب عدد مستخدميك (حد التحقق يُحسب لكل عنوان IP، وكل مستخدمي Vercel يصلون من عدد قليل من العناوين؛ الإعداد الافتراضي ضيق).
٥. **Authentication ← Sign In / Providers** ← **Allow new users to sign up** مفعّل (العناوين الجديدة تسجّل دخولها بالرمز وتنشئ شركتها بعد ذلك). لا تفعّل أي مزود آخر هنا: Google اختياري ويعمل من التطبيق مباشرة.

**ج) التخزين (Storage).**
١. **Storage ← New bucket** مرتين، كلاهما **Private** (غير عام): `project-os-files` للملفات، و`project-os-backups` للنسخ الاحتياطية المشفّرة.
٢. **Storage ← S3 Connection** ← انسخ **Endpoint** و**Region** ← **New access key** ← انسخ **Access key ID** و**Secret access key** (لا يظهر السر ثانية). هذا الزوج للخادم فقط.

**د) الواجهة البرمجية العامة (Data API).** **Project Settings ← Data API** ← أوقفها (أو اترك `public` خارج **Exposed schemas**). التطبيق لا يستعملها، وكل جدول فيه حماية صفوف بلا أي سياسة لأدوار `anon` و`authenticated`، فهي مغلقة أصلًا؛ هذا إغلاق ثانٍ.

**هـ) النسخ الاحتياطي.** **Database ← Backups** ← النسخ اليومية مفعّلة بالخطة المدفوعة، و**Point in Time Recovery** إضافة اختيارية. هذا هو النسخ الأساسي. والتصدير المشفّر `scripts/export-database.mjs` أداة تشغيل يدوي أو من CI، ليست مهمة Vercel (قد يتجاوز تفريغ كامل مهلة الدالة).

## ٢) الترحيلات وحساب التطبيق (من جهازك، مرة واحدة ثم عند كل إصدار فيه ترحيل)

```
export DATABASE_URL='<الاتصال المباشر ٥٤٣٢ بحساب postgres>'     # للترحيل فقط
export DATABASE_SSL_CA='<محتوى شهادة الجذر>'
pnpm db:migrate                       # يبني المخطط كاملًا من ملف الأساس، ويفعّل حماية الصفوف على كل جدول، ويفشل إن بقي جدول بلا حماية
export PROJECT_OS_APP_DB_PASSWORD='<كلمة مرور جديدة طويلة>'
pnpm provision:app-role               # ينشئ الدور project_os_app بلا صلاحية DDL ويعطيه كلمة مرور (لا يطبعها)
pnpm verify:db-security               # يثبت: لا UPDATE ولا DELETE ولا TRUNCATE على audit_logs، وحماية الصفوف تعمل، وأدوار Data API فارغة
```
الأوامر الثلاثة تطبع أسماء وأعدادًا لا أسرارًا. إن فشل `verify:db-security` فلا تنشر.

## ٣) مشروع Vercel باسم `dashio`

<https://vercel.com/new> ← استورد المستودع `comdashio-sudo/project-os` ← الفرع `main` ← **اسم المشروع `dashio`** ← Framework Preset: **Other** (الأوامر مكتوبة في `vercel.json`، لا تغيّرها) ← **Settings ← Functions ← Function Region**: أقرب منطقة إلى منطقة Supabase ← **Environment Variables** (الجدول أدناه، للبيئة Production) ← **Deploy**. لا تربط نطاقًا عامًا قبل اكتمال الفحص في الخطوة ٥ (النشر العام يحتاج أمرًا منك).

## ٤) كل متغير وأين يوضع

الخانة «يوضع في» هي **Vercel ← `dashio` ← Settings ← Environment Variables ← Production**.

| المتغير | القيمة | |
|---|---|---|
| `DATABASE_URL` | رابط **Transaction pooler** (٦٥٤٣) باسم المستخدم `project_os_app.<المعرّف>` | إلزامي |
| `DATABASE_SSL_CA` | محتوى شهادة جذر Supabase | إلزامي (يوثّق الاتصال) |
| `DATABASE_POOL_MAX` | `3` | اختياري (الافتراضي ١٠؛ كل نسخة دالة تفتح هذا العدد من الاتصالات) |
| `JWT_SECRET` | سلسلة عشوائية ≥ ٣٢ حرفًا تولّدها (`openssl rand -base64 48`) | إلزامي |
| `CRON_SECRET` | سلسلة عشوائية ≥ ١٦ حرفًا؛ **Vercel يرسلها بنفسه** في ترويسة المهام المجدولة | إلزامي |
| `OWNER_EMAIL` | بريدك؛ أول دخول به يجعلك مدير المنصة | إلزامي |
| `APP_BASE_URL` | رابط المشروع `https://…vercel.app` ثم نطاقك | إلزامي |
| `SUPABASE_URL` | `https://<المعرّف>.supabase.co` | إلزامي (الدخول) |
| `SUPABASE_ANON_KEY` | **anon / publishable key** من Project Settings ← API. هذا هو المفتاح الوحيد من Supabase الذي يلمسه الخادم للدخول | إلزامي |
| `AUTH_CODE_TTL_SECONDS` | `3600` (يطابق Email OTP Expiration) | اختياري |
| `STORAGE_S3_ENDPOINT` · `STORAGE_S3_REGION` · `STORAGE_S3_ACCESS_KEY_ID` · `STORAGE_S3_SECRET_ACCESS_KEY` | من S3 Connection (١-ج) | إلزامي |
| `STORAGE_BUCKET` | `project-os-files` | إلزامي |
| `BACKUP_BUCKET` · `BACKUP_ENCRYPTION_KEY` · `BACKUP_DATABASE_URL` | `project-os-backups` · مفتاح تولّده بـ`node --import tsx scripts/export-database.mjs --generate-key` وتحفظه في مدير كلمات المرور **خارج Vercel** · الاتصال المباشر بحساب المالك | لأداة التصدير فقط، لا تضعها في Vercel |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` · `EMAIL_FROM` | حساب بريد الإشعارات (قد يكون نفسه المستعمل في ١-ب-٣) | عند تفعيل إشعارات البريد |
| `EMAIL_NOTIFICATIONS_ENABLED` | `false` حتى تجهّز البريد، ثم `true` | اختياري |
| `API_RATE_LIMIT_PER_MINUTE` | `600` | اختياري |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | اختيارية | اتركها فارغة |
| `LLM_ENABLED` · `LLM_API_KEY` · `LLM_BASE_URL` | `false` وفارغة | اتركها |
| `VITE_MAX_UPLOAD_BYTES` · `VERCEL_FUNCTION_MAX_DURATION` | حد حجم الملف في الواجهة (الافتراضي ٣٠٠٠٠٠٠) · مهلة الدالة بالثواني (الافتراضي ٣٠٠) | يُقرآن عند البناء |

**لا تضع أبدًا** في أي مكان: مفتاح `service_role` (الخادم لا يحتاجه ولا يستعمله)، ولا `DATABASE_SSL=off`، ولا `DATABASE_SSL_VERIFY=off`، ولا `TEST_DATABASE_URL`، ولا `PROJECT_OS_USE_ADMIN_DATABASE_URL`، ولا `TEST_DB_NO_FALLBACK`، ولا `GOTRUE_LIVE_URL`، ولا `SUPABASE_AUTH_URL` (لمحرك دخول محلي فقط).

## ٥) فحص ما بعد النشر من الجوال (خمس دقائق)

١. `https://<الرابط>/healthz` ← كلمة **ok**. ٢. `/login` ← تظهر بالعربية ← اكتب `OWNER_EMAIL` ← يصلك **رمز من 6 أرقام** (ليس رابطًا) خلال دقيقة ← ادخل ← تصل للوحة. ٣. اكتب رمزًا خطأ ٥ مرات ← تُغلق المحاولة ١٥ دقيقة بالرسالة العامة نفسها. ٤. أنشئ شركة تجريبية ← أضف مشروعًا ← ارفع ملفًا أصغر من ٣ MB ← يظهر في السجل وينزل. ٥. من **Vercel ← Settings ← Cron Jobs** تظهر ثلاث مهام (انتهاء التراخيص ٠٢:٠٠ UTC، لقطات الربحية ٠٢:١٠، إشعارات البريد كل ساعة) ← شغّل واحدة بـ**Run** ← في **Logs** الرد ٢٠٠. ٦. من **Supabase ← Logs ← Postgres** لا أخطاء `permission denied` ولا `row-level security` على الصفحات الرئيسية.

## ٦) حدود تعرفها قبل أن تعد بها أحدًا

- **حجم الرفع.** Vercel يرفض أي طلب أكبر من **4.5 MB** قبل أن يبلغ الخادم، والملفات تسافر داخل الطلب مرمَّزة (×٤/٣). لذلك تُمنع الواجهة الملف الأكبر من **3 MB** برسالة واضحة. الاستيراد حتى ٨–١٠ MB يحتاج رفعًا مباشرًا إلى Storage بعنوان موقَّع ثم معالجة الخادم له بمفتاحه؛ هذا تغيير معماري **لم يُنفَّذ** وينتظر موافقتك (اقتراح في التقرير).
- **المهام المجدولة.** الخطة المجانية (Hobby) في Vercel تسمح بتشغيل مهمة مجدولة **مرة في اليوم**؛ مهمة الإشعارات كل ساعة تحتاج خطة Pro، أو غيّر `0 * * * *` في `scripts/build-vercel.mjs` إلى وقت يومي.
- **مدة الدالة.** ٣٠٠ ثانية افتراضيًا، ويمكن رفعها حسب الخطة. أطول مهمة معروفة (لقطات الربحية لأكبر شركة) أقل من ذلك بكثير.
- **الاتصالات.** كل نسخة دالة تحمل `DATABASE_POOL_MAX` اتصالًا بالمجمّع (٦٥٤٣)؛ المجمّع هو الذي يحمي القاعدة من كثرة النسخ. لا تستعمل الاتصال المباشر (٥٤٣٢) في التطبيق.

---
**ما جُرِّب محليًا:** `pnpm test:db` (كل اختبارات القاعدة بحساب التطبيق المقيَّد على PostgreSQL محلي)، ومحرك دخول Supabase Auth حقيقي (`pnpm auth:local` ثم `server/auth.gotrue.live.test.ts`)، وحزمة الدالة (`pnpm build:vercel` ثم تشغيلها خلف خادم HTTP محلي). ما لم يُجرَّب: أي شيء على Supabase أو Vercel الحقيقيين — لا يوجد في هذا المستودع اتصال بأيٍّ منهما.
