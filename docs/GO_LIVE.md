# الإطلاق — صفحة واحدة

أربعة حسابات بهذا الترتيب، ثم ضبط المتغيرات في Render، ثم فحص من الجوال، ثم حماية سجل التدقيق. كل أمر هنا جُرِّب محليًا على نسخة الإنتاج (انظر آخر الصفحة)؛ **لم يُجرَّب على الخدمات الحقيقية** لأنها حساباتك.

## ١) الحسابات الأربعة

**أ) TiDB Cloud — القاعدة.** <https://tidbcloud.com> ← سجّل ← **Create Cluster** ← **Starter** ← المنطقة الأقرب لـRender (فرانكفورت) ← **Create**. ثم **SQL Editor** ← نفّذ `CREATE DATABASE project_os;`. ثم **Connect** ← **General** ← **Generate Password** ← انسخ المستخدم (له بادئة قبل نقطة، مثل `3abc.root`) وكلمة المرور والعنوان، واجمعها (استبدل `USER` و`PASSWORD` و`gateway.example` بقيمك):
`mysql://USER:PASSWORD@gateway.example:4000/project_os?ssl=%7B%22minVersion%22%3A%22TLSv1.2%22%2C%22rejectUnauthorized%22%3Atrue%7D` ← هذا هو `DATABASE_URL`.

**ب) Resend — بريد رمز الدخول.** <https://resend.com> ← **Domains** ← **Add Domain** ← `mail.<نطاقك>` ← أضف سجلات DNS (SPF وDKIM) عند مزود النطاق ← **Verify** حتى تصير **Verified** ← **API Keys** ← **Create API Key** ← **Sending access** على هذا النطاق ← انسخ المفتاح (يظهر مرة).

**ج) Cloudflare R2 — الملفات والنسخ الاحتياطية.** <https://dash.cloudflare.com> ← **R2 Object Storage** ← فعّل ← **Create bucket** باسم `project-os-files` (خاصة) وأخرى باسم `project-os-backups` (خاصة؛ أضف فيها **Settings ← Object lifecycle rules** تحذف ما تحت `backups/` بعد 30 يومًا) ← **Manage R2 API Tokens** ← **Create API token** ← **Object Read & Write** على الحاويتين ← انسخ **Access Key ID** و**Secret Access Key** و**Account ID**.

**د) Render — التشغيل.** <https://render.com> ← **New +** ← **Blueprint** ← المستودع `comdashio-sudo/project-os` ← الفرع `main` ← يعرض `render.yaml` أربع خدمات: `project-os` (الموقع) و`project-os-license-expiry` و`project-os-email-notifications` و`project-os-backup`. أدخل القيم في الجدول أدناه ← **Apply**. (النشر التلقائي مطفأ: أنت من يضغط **Deploy**، وقبل فتح الخدمة يطبّق Render الترحيلات وإلا يفشل النشر ولا يُفتح شيء.)

## ٢) كل متغير وأين يوضع

الخانة «يوضع في» تعني **Render ← الخدمة ← Environment**. ما يُولَّد أو يُكتب في `render.yaml` لا تلمسه.

| المتغير | من أين | يوضع في | |
|---|---|---|---|
| `DATABASE_URL` | الحساب أ | `project-os` (ويصل لخدمة النسخ تلقائيًا) | إلزامي |
| `OWNER_EMAIL` | بريدك | `project-os` | إلزامي — أول دخول به يجعلك مدير المنصة |
| `APP_BASE_URL` | رابط الخدمة `https://…onrender.com` بعد أول إنشاء | `project-os` (تأخذه المهام المجدولة منه) | إلزامي، ثم أعد النشر |
| `RESEND_API_KEY` · `EMAIL_FROM` | الحساب ب · مثل `PROJECT OS <login@mail.<نطاقك>>` | `project-os` | إلزامي — بلا مرسِل لا يصل رمز |
| `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET` | الحساب ج · `project-os-files` | `project-os` (تأخذها خدمة النسخ منه) | بلا R2 تتعطل المستندات واستيراد Excel وحدها |
| `BACKUP_ENCRYPTION_KEY` | `node --import tsx scripts/export-database.mjs --generate-key` ثم احفظه في مدير كلمات المرور **خارج Render** | `project-os-backup` | إلزامي للنسخ |
| `BACKUP_R2_BUCKET` | `project-os-backups` | `project-os-backup` | إلزامي للنسخ |
| `BACKUP_DATABASE_URL` | حساب TiDB للقراءة فقط (اختياري وأفضل) | `project-os-backup` | اختياري |
| `PROJECT_OS_APP_DB_PASSWORD` | كلمة مرور طويلة جديدة تختارها | `project-os` | **الخطوة ٤** |
| `JWT_SECRET` · `CRON_SECRET` | يولّدهما Render | — | تلقائي |
| `NODE_VERSION` · `NODE_ENV` · `API_RATE_LIMIT_PER_MINUTE` · `LLM_ENABLED` · `EMAIL_NOTIFICATIONS_ENABLED` | مكتوبة في `render.yaml` | — | اجعل الأخيرة `true` بعد أن يعمل الدخول إن أردت إشعارات البريد |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `LLM_API_KEY` · `LLM_BASE_URL` | اختيارية | `project-os` | اتركها فارغة |

**لا تضع أبدًا** `RESEND_API_URL` (للتجارب المحلية فقط) ولا `PROJECT_OS_USE_ADMIN_DATABASE_URL` ولا `TEST_DATABASE_URL`.

## ٣) النشر الأول
**Render ← `project-os` ← Manual Deploy ← Deploy latest commit.** انتظر **Live**. إن فشل فافتح **Logs** وانسخ أول سطر فيه `"level":"error"` (يحوي «رقم الطلب» ولا يحوي سرًّا ولا بريدًا).

## ٤) فحص ما بعد النشر من الجوال (خمس دقائق)
١. `https://<الرابط>/healthz` ← كلمة **ok**. ٢. `/login` ← تظهر بالعربية ← اكتب `OWNER_EMAIL` ← يصلك **رمز من 6 أرقام** خلال دقيقة (إن لم يصل: **Resend ← Logs**). ٣. اكتب الرمز ← الصفحة الرئيسية. ٤. أنشئ شركتك ← تُفتح مساحة العمل. ٥. **سجل المشاريع** ← أنشئ مشروعًا تجريبيًا ← **ضبط المشروع** بلا شاشة خطأ حمراء. ٦. ارفع ملفًا صغيرًا في **المستندات** (يثبت R2). ٧. أغلق التبويب وافتح الرابط بعد دقيقة ← ما زلت داخلًا. ٨. **إدارة الشركة** ← بطاقة «بيانات الشركة» تعرض حجم بياناتك (يثبت أنك مالك الشركة).

## ٥) حماية سجل التدقيق (قبل أي بيانات حقيقية، ولا قبلها)
بلا هذه الخطوة يكتب الخادم بحساب الإدارة فيستطيع نظريًا تعديل `audit_logs`.
١. ضع في Render (`project-os`) كلمة المرور الجديدة باسم `PROJECT_OS_APP_DB_PASSWORD` ← **Save** (يعيد التشغيل). ٢. **Render ← `project-os` ← Shell** ← نفّذ بالترتيب: `pnpm provision:audit-app` ثم `pnpm verify:audit-grants`. هذا ينشئ الحساب المقيّد `<بادئة>.project_os_app` (يملك `SELECT, INSERT, UPDATE, DELETE` على كل جدول **عدا** `audit_logs` فله `SELECT, INSERT` فقط). ٣. المطلوب في الناتج: `"approved": true` و`"updateDenied": true` و`"deleteDenied": true` و`"hasForbiddenAuditGrant": false` — أرسله لأسجّله في `docs/STATE.md`. ٤. **بعد كل نشر فيه ترحيل جديد** أعد `pnpm provision:audit-app` (الجدول الجديد لا يراه الحساب المقيّد حتى يُمنَح، فيرفع الموقع أخطاء حتى تعيدها). ٥. أعد فحص الجوال (٤).

## ٦) النسخ الاحتياطي
أول تشغيل: **Render ← `project-os-backup` ← Trigger Run** ← في **Logs** سطر فيه `"ok":true`. اختبر الاسترجاع مرة (`docs/OWNER_ACTIONS.md` القسم 4ب) قبل أن تحتاجه.

---
**ما جُرِّب محليًا بنسخة الإنتاج** (`node scripts/deploy-rehearsal.mjs`، 19 فحصًا، على MySQL وعلى TiDB المحلي، قبل الخطوة ٥ وبعدها): بدء الإنتاج بمتغيرات `render.yaml` · `/healthz` · الرؤوس الأمنية · تقديم الواجهة المبنية · الدخول برمز يصل مزوّد بريد وهميًا · كوكي `Secure; HttpOnly; SameSite` · عدم قبول الرمز مرتين · قاعدة تُجيب · الخروج يُبطل الجلسة في الخادم · رفض المهمة المجدولة بلا السر · سجل خادم بلا بريد ولا رمز ولا مفتاح. **لم يُجرَّب:** TiDB Cloud وResend وR2 وRender الحقيقية (حساباتك)، ولا الكلفة.
