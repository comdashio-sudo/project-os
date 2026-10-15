# ما يحتاج المالك فعله — PROJECT OS

**الحالة:** كل بند هنا `BLOCKED_BY_OWNER`: يحتاج حسابًا أو مفتاحًا أو دفعًا لا يملكه الوكيل. الكود المرتبط به يُكتب ويُختبر بالمحاكاة الآن، ويبقى تفعيله الحي معلَّقًا على بندك.

**قواعد لا تُكسر:**

- لا تلصق أي مفتاح أو رمز أو كلمة مرور أو رابط اتصال في المحادثة. تضعه في المكان المذكور فقط، وتخبرني باسم المتغير الذي وضعته.
- المتغيرات المذكورة أدناه **أسماء بلا قيم**.
- مكانان فقط لوضع القيم:
  - **(أ) بيئة جلسة Claude**: شريط عنوان الجلسة ← قائمة البيئة ← **Edit** ← **Environment variables**. تلتقطها **الجلسات الجديدة فقط**. للاختبارات.
  - **(ب) Render**: لوحة الخدمة ← **Environment**. للتشغيل الفعلي.
- بيئة الجلسة تحمل **قاعدة الاختبار وحدها** (`project_os_integration_test`). قاعدة التشغيل لا توضع فيها أبدًا.

الترتيب بالأهمية: كل بند يفتح ما بعده.

---

## 1. قاعدة TiDB باسمك — يفتح خط الأساس والاختبارات الحية

**لماذا:** لا شيء مما أُثبِت سابقًا على TiDB يمكن إعادة إثباته (28 صفًا `UNVERIFIED` في `docs/STATE.md`) قبل وجود قاعدة. هذا أهم بند.

**الخطوات:**

1. افتح <https://tidbcloud.com> وسجّل بحسابك.
2. اضغط **Create Cluster** ← اختر **Starter** ← اختر منطقة قريبة (مثلًا Frankfurt أو Bahrain إن وُجدت) ← **Create**.
3. بعد أن يصير الكلستر **Active** اضغط اسمه ← **SQL Editor** (أو **Chat2Query**) ← الصق ونفّذ:
   ```sql
   CREATE DATABASE IF NOT EXISTS project_os_integration_test;
   ```
4. اضغط **Connect** (أعلى يمين الكلستر):
   - **Connect With**: `General`.
   - اضغط **Generate Password** وانسخها إلى مدير كلمات المرور عندك (تظهر مرة واحدة).
   - انسخ رابط الاتصال بصيغة `mysql://...` أو اجمعه: المستخدم، كلمة المرور، المضيف، المنفذ `4000`.
5. ضع في **بيئة الجلسة (أ)** هذين المتغيرين بنفس القيمة، ويجب أن ينتهي المسار فيها بـ`/project_os_integration_test`:
   - `DATABASE_URL`
   - `TEST_DATABASE_URL`
6. اختر لحساب التطبيق المقيَّد كلمة مرور جديدة وطويلة (غير كلمة الجذر) وضعها في **بيئة الجلسة (أ)**:
   - `PROJECT_OS_APP_DB_PASSWORD`
7. **السماح بالشبكة:** من قائمة البيئة ← **Edit** ← **Network access** ← أضف المضيف الظاهر في رابط الاتصال تحت **Allowed domains** (يشبه `gateway01.<region>.prod.aws.tidbcloud.com`) وأبقِ **Allow package managers** مفعَّلًا.
8. افتح جلسة جديدة على المستودع وقل: «القاعدة جاهزة». أشغّل فورًا `node scripts/run-integration-database-test.mjs` وأثبّت خط الأساس (المتوقع 80/80).

**قاعدة التشغيل (لاحقًا):** كلستر ثانٍ منفصل (أو تفرّع منه) باسم `project_os`. رابطه يوضع في **Render (ب)** فقط تحت `DATABASE_URL`، ولا يوضع في بيئة الجلسة.

---

## 2. الاستضافة على Render — لتشغيل المنصة خارج Manus

**الخطوات:**

1. افتح <https://render.com> ← سجّل بحسابك ← اربط GitHub.
2. **New +** ← **Blueprint** ← اختر مستودع `comdashio-sudo/project-os` ← الفرع `main`. (يعمل بعد أن أدمج `render.yaml`، البند 9 من أمر العمل.)
3. ستظهر الخدمة `project-os` بخطة **Starter** (قرابة 7$ شهريًا). أكمل المتغيرات المطلوبة (البنود 3 و4 و5 و6 أدناه) تحت **Environment** ثم **Save, rebuild and deploy**.
4. بعد النشر افتح `https://<اسم-الخدمة>.onrender.com/healthz` ويجب أن يعيد `ok`.
5. **النشر على نطاق عام قراره لك**: الوكيل لا ينشر. أنت تضغط **Deploy** بنفسك.

متغيرات Render الثابتة (تُولَّد أو تُكتب في `render.yaml`، لا قيمة منك): `NODE_ENV`, `PORT`.
متغيرات من عندك (ب): `DATABASE_URL`, `PROJECT_OS_APP_DB_PASSWORD`, `JWT_SECRET`, `OWNER_EMAIL`, `APP_BASE_URL`.

- `JWT_SECRET`: في `render.yaml` سيُولَّد تلقائيًا (`generateValue: true`) فلا تحتاج فعل شيء.
- `OWNER_EMAIL`: بريدك الذي تدخل به؛ هو من يصير مدير المنصة الأول.
- `APP_BASE_URL`: رابط الخدمة النهائي مثل `https://<اسم-الخدمة>.onrender.com` (يُستعمل في روابط الدخول).

---

## 3. البريد عبر Resend — تسجيل الدخول برمز بريد

**الخطوات:**

1. افتح <https://resend.com> ← سجّل ← **Domains** ← **Add Domain** ← اكتب نطاقًا فرعيًا خاصًا بـPROJECT OS (مثل `mail.<نطاقك>`). لا تستعمل نطاق منصة أخرى.
2. أضف سجلات DNS التي يعرضها Resend عند مزود نطاقك (SPF وDKIM)، ثم اضغط **Verify** وانتظر **Verified**.
3. **API Keys** ← **Create API Key** ← صلاحية **Sending access** على هذا النطاق فقط ← انسخ المفتاح.
4. ضع في **Render (ب)**:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (مثل `PROJECT OS <login@mail.<نطاقك>>`)

بدون هذا البند يعمل الكود في الاختبارات بمحاكاة، ولا يصل رمز دخول لأي بريد حقيقي.

---

## 4. التخزين على Cloudflare R2

**الخطوات:**

1. افتح <https://dash.cloudflare.com> ← سجّل ← **R2 Object Storage** ← فعّل R2 (قد يطلب بطاقة؛ الحصة المجانية 10GB).
2. **Create bucket** ← الاسم `project-os-files` ← **Create**. اترك الوصول **خاصًّا** (لا Public access).
3. **Manage R2 API Tokens** ← **Create API token** ← الصلاحية **Object Read & Write** على هذه الحاوية فقط ← **Create** ← انسخ **Access Key ID** و**Secret Access Key** و**Account ID** (تظهر مرة واحدة).
4. ضع في **Render (ب)**:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`

---

## 5. أصول الهوية (الشعار والأيقونات)

الواجهة ما زالت تقرأ الشعار والأيقونات من مسارات `/manus-storage/` التي لا تعمل خارج Manus. سأحاول جلبها؛ إن تعذّر فهذه خطوتك:

1. من حزمة الهوية عندك أرسل إلى الجلسة (بالإرفاق في المحادثة) الملفات: الشعار الأفقي، الشعار الأفقي على خلفية داكنة، الأيقونة، وأيقونات المتصفح 16 و32 و48 و192.
2. هذه ليست أسرارًا، يجوز إرفاقها.

---

## 6. Google للدخول — اختياري

يمكن تركه. بدونه يعمل الدخول بالبريد وحده.

1. <https://console.cloud.google.com> ← مشروع جديد ← **APIs & Services** ← **OAuth consent screen** ← **External** ← أكمل الاسم والبريد.
2. **Credentials** ← **Create credentials** ← **OAuth client ID** ← **Web application**.
3. **Authorized redirect URIs**: `<APP_BASE_URL>/api/auth/google/callback`.
4. ضع في **Render (ب)**: `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET`.

---

## 7. إجراءات أمان على حساباتك

- **حماية فرع `main`:** GitHub ← المستودع ← **Settings** ← **Branches** ← **Add branch ruleset** ← الهدف `main` ← فعّل **Require status checks to pass** واختر `check, build, test` و`secret scan` ← **Create**. هكذا لا يُدمج شيء ما لم يمرّ الـCI.
- **تدوير أسرار Manus:** كل قيمة كانت في بيئة Manus (`JWT_SECRET`, `DATABASE_URL`, مفاتيح Forge) تعتبر منتهية بعد الخروج. لا تعيد استعمالها في أي مكان.
- **التحقق من حساب TiDB القديم:** التسليم لا يثبت من يملك حساب TiDB القديم. تحقق من مزوّده قبل إيقافه، فهو ما زال يحمل بيانات Manus.

---

## 8. قرارات بانتظارك (لا نقر فيها)

| القرار | الحالة |
|---|---|
| تشغيل الـLLM (مساعد الدعم ومستشار المشروع): يلزم مزود ومفتاح `LLM_API_KEY` ومتغير `LLM_ENABLED=true` | معطَّل افتراضيًا حتى تقرر |
| الخريطة | مخفية، لا شيء مطلوب |
| بقاء الصور والصوت وData API | محذوفة بقرارك |
