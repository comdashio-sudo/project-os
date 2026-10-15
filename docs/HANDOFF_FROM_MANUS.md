# HANDOFF_FROM_MANUS — PROJECT OS

**تاريخ التسليم:** 8 أكتوبر 2026  
**المستودع الحاكم:** `github.com/comdashio-sudo/project-os` (نُقل من `ramezsamerr-collab/project-os` في 2026-10-15)، الفرع `main`  
**حالة PMC:** المرحلة A مغلقة ومثبتة؛ المرحلة B لم تبدأ.

## 1. الخلاصة التنفيذية

PROJECT OS مستقل عن TASLEEM. المحرك الفعلي هو **MySQL/TiDB Serverless** عبر Drizzle و`mysql2`، وليس Supabase/PostgreSQL.

المستودع الحاكم هو `github/main`. يوجد أيضًا remote باسم `origin` يشير إلى قناة نشر داخلية لمانوس على `artifacts.cloudflare.net`; لم يُستخدم كمرجع عهدة، ولم يُدفع إليه في عملية التسليم هذه.

## 2. اعتماد المشروع على خدمات Manus

### 2.1 تسجيل الدخول والمصادقة

- **الخدمة:** Manus OAuth، مع جلسة موقعة في Cookie.
- **التدفق:** التطبيق يبدأ تسجيل الدخول من بوابة OAuth، ثم يستقبل `/api/oauth/callback`، يتحقق من nonce في Cookie، يستبدل الرمز، يحدث المستخدم، وينشئ Session Token.
- **الملفات: **
  - `server/_core/oauth.ts` — مسار callback والتحقق من OAuth state.
  - `server/_core/sdk.ts` — عميل Manus OAuth والمصادقة على الطلبات.
  - `server/_core/context.ts` — يضع المستخدم المصادق عليه في سياق tRPC.
  - `server/_core/cookies.ts` و`shared/const.ts` — إعدادات Cookie وأسماء الجلسة.
  - `client/src/_core/hooks/useAuth.ts` — حالة المستخدم وبدء تسجيل الدخول في الواجهة.
  - `client/src/App.tsx` و`client/src/components/DashboardLayout.tsx` — الحماية والتنقل.
- **متغيرات البيئة، بلا قيم:**
  - `VITE_APP_ID`
  - `OAUTH_SERVER_URL`
  - `VITE_OAUTH_PORTAL_URL` (يُستخدم من الواجهة إن كان متاحًا)
  - `JWT_SECRET`
  - `OWNER_OPEN_ID`
  - `OWNER_NAME`

### 2.2 قاعدة البيانات وملكيتها

- **الخدمة:** MySQL/TiDB Serverless.
- **الاستخدام:** بيانات التشغيل والهوية والعضويات والمشروعات والتدقيق وجداول PMC.
- **الوصول:** Drizzle ORM عبر `drizzle-orm/mysql2`.
- **الملفات:**
  - `drizzle/schema.ts` — المخطط.
  - `drizzle/*.sql` — الترحيلات.
  - `drizzle.config.ts` — إعداد Drizzle.
  - `server/db.ts` — الاتصال ومساعدات الاستعلام.
  - `server/_core/env.ts` — قراءة عنوان قاعدة البيانات.
  - `docs/DEPLOYMENT.md` — سياسة التشغيل وحسابات التدقيق.
- **متغيرات البيئة، بلا قيم:**
  - `DATABASE_URL` — اتصال قاعدة التشغيل.
  - `TEST_DATABASE_URL` — اختياريًا اتصال قاعدة الاختبار؛ إذا لم يُستخدم، يشتق المشغل قاعدة الاختبار المعزولة من اتصال TiDB الأساسي.
  - `AUDIT_APP_DATABASE_URL` — اتصال حساب التطبيق المقيّد لسجل التدقيق، عند تشغيل فحص المنح.
  - `PROJECT_OS_APP_DB_PASSWORD` — كلمة مرور حساب التطبيق المقيد عند provisioning.
  - `PROJECT_OS_AUDIT_ADMIN_PASSWORD` — كلمة مرور حساب الإدارة المنفصل عند provisioning.
  - `PROJECT_OS_USE_ADMIN_DATABASE_URL` — مفتاح صريح لتشغيل مسار إداري، ولا ينبغي تفعيله للتطبيق العادي.
- **الملكية:** المستودع يثبت أن قاعدة PROJECT OS هي MySQL/TiDB وأن الاتصال يحقن في بيئة Manus WebDev. لا يثبت المستودع وحده اسم مالك حساب TiDB أو عقد الفوترة؛ لذلك لا ينبغي افتراض أن حساب قاعدة البيانات مملوك للمالك النهائي قبل التحقق المباشر من مزود TiDB. المستودع مملوك لحساب `comdashio-sudo` بعد نقله من `ramezsamerr-collab` في 2026-10-15.
- **قيد التدقيق:** TiDB Serverless لا يوفر Triggers اللازمة لمنع `UPDATE/DELETE` على `audit_logs`. الحماية المعتمدة هي حساب تطبيق بصلاحيات `SELECT/INSERT` وحساب إداري منفصل ومراقَب، موثقة في `ADR-0001-AUDIT-LOG-ACCESS-CONTROL.md` وفحص `pnpm verify:audit-grants`.

### 2.3 التخزين للملفات

- **الخدمة:** Manus Built-in Forge Storage، عبر presigned PUT/GET.
- **الملفات:**
  - `server/storage.ts` — طلب presigned URL والرفع والتخزين المرجعي.
  - `server/_core/storageProxy.ts` — مسار `/manus-storage/*` للتنزيل.
  - `server/_core/imageGeneration.ts` — حفظ مخرجات الصور عند استخدام توليد الصور.
  - `client/index.html` و`client/src/components/BrandMark.tsx` — مراجع أصول الهوية المخزنة.
  - `docs/DEPLOYMENT.md` — مبدأ حفظ المرجع لا البايتات داخل قاعدة البيانات.
- **متغيرات البيئة، بلا قيم:**
  - `BUILT_IN_FORGE_API_URL`
  - `BUILT_IN_FORGE_API_KEY`
- **ملاحظة:** المسارات `/manus-storage/...` مراجع تشغيلية وليست ملفات محلية داخل Git. لا تُنقل إلى GitHub كبديل للتخزين.

### 2.4 الاستضافة وبيئة WebDev

- **الخدمة:** Manus WebDev full-stack، وتشغّل خادم Express/tRPC وواجهة Vite المبنية.
- **الملفات:**
  - `server/_core/index.ts` — نقطة تشغيل الخادم.
  - `server/_core/vite.ts` — تكامل التطوير والبناء.
  - `vite.config.ts` و`package.json` — البناء والتشغيل.
  - `template.json` و`.project-config.json` — إعدادات بيئة Manus المحلية؛ `.project-config.json` غير متتبع وممنوع إدخاله إلى Git.
- **أمر التطوير:** `pnpm dev`
- **أمر الإنتاج بعد البناء:** `pnpm start`
- **نطاق Manus المسجل سابقًا:** `proj-os-faxqyypc.manus.space`.
- **بوابة النشر:** نقاط تحقق Manus قد تتكامل مع النشر. لا ينبغي اعتبار كل Commit نشرًا إنتاجيًا محكومًا ببوابة مالك؛ النشر إلى نطاق عام يجب أن يكون فعلًا صريحًا من المالك إلى أن يتم التحقق من إعدادات المنصة خارج المستودع.

### 2.5 APIs الداخلية الاختيارية

الخدمات التالية تمر عبر Forge عند استدعائها، وليست مطلوبة لعمل نواة PMC:

- **Data API:** `server/_core/dataApi.ts`، للبيانات الخارجية عند الحاجة.
- **إشعارات المالك:** `server/_core/notification.ts` و`server/_core/heartbeat.ts`.
- **توليد الصور:** `server/_core/imageGeneration.ts`.
- **تحويل الصوت إلى نص:** `server/_core/voiceTranscription.ts`.
- **خرائط/Proxy:** `server/_core/map.ts` و`client/src/components/Map.tsx`.
- **LLM/Forge APIs:** `server/_core/llm.ts` عند وجود ميزة تستخدمها.
- **المتغيرات المشتركة:** `BUILT_IN_FORGE_API_URL` و`BUILT_IN_FORGE_API_KEY`.

## 3. التشغيل والاختبارات

### 3.1 تثبيت وتشغيل محلي

```bash
cd /path/to/project-os
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
```

لا تُنشئ ملف `.env` داخل المستودع ولا تطبع قيم متغيرات البيئة. حقن القيم يتم من مدير أسرار البيئة.

### 3.2 آخر نتائج مسجلة

| الأمر | آخر نتيجة مسجلة |
|---|---|
| `pnpm test` | 81 ملفًا ناجحًا، 3 ملفات متخطاة، 377 اختبارًا ناجحًا، 80 متخطى |
| `pnpm exec vitest run server/domain/pmc.test.ts` | 7/7 ناجحة |
| `pnpm check` | ناجح |
| `pnpm build` | ناجح؛ ظهر تحذير حجم chunks فقط، وليس فشلًا |
| `pnpm coverage:trpc` | تحقق ناجح؛ `unclassifiedProcedures: []` و`staleExceptions: []` |
| `pnpm verify:pmc-schema` | `approved: true`؛ 12/12 جدول PMC محكوم بالعزل البنيوي |
| `node scripts/run-integration-database-test.mjs` | 3 ملفات و80/80 ناجحة، متضمنة اختبار عزل PMC الحي |
| `git diff --check` | ناجح قبل الدفع |

### 3.3 اختبارات TiDB الحية خارج Manus

المشغل الحي لا يحتاج إلى WebDev API؛ يحتاج فقط إلى اتصال شبكة وبيانات اعتماد TiDB صالحة يملكها المشغّل خارجيًا.

1. أنشئ قاعدة اختبار منفصلة، مثل `project_os_integration_test`. لا تستخدم قاعدة التشغيل.
2. احقن المتغيرات من مدير أسرار خارجي، لا من Git:

```bash
export DATABASE_URL='[قيمة تُحقن من مدير الأسرار، لا تُكتب في الملف]'
# أو:
export TEST_DATABASE_URL='[اتصال قاعدة الاختبار فقط]'
```

3. ثبّت Node.js 22 وpnpm ثم:

```bash
pnpm install --frozen-lockfile
node scripts/run-integration-database-test.mjs
```

المشغل يطبق الترحيلات اللازمة على قاعدة الاختبار المعزولة، يشغّل الاختبارات، ثم ينظف بيانات الاختبار. يجب التأكد من TLS/allowlist في مزود TiDB ومن صلاحية الحساب قبل التشغيل.

4. للتحقق الإضافي:

```bash
pnpm verify:pmc-schema
pnpm exec vitest run server/domain/pmc.test.ts
pnpm check
pnpm build
```

5. لا تستخدم `PROJECT_OS_USE_ADMIN_DATABASE_URL` في التشغيل العادي، ولا تستخدم حساب التدقيق الإداري لاختبارات التطبيق إلا داخل فحص المنح المقصود.

## 4. حالة Git والتسليم

- المستودع الخاص: `comdashio-sudo/project-os` (نُقل من `ramezsamerr-collab/project-os` في 2026-10-15).
- المرجع الحاكم: `github/main`.
- تم تنظيف تاريخ `github/main` من `docs/WORK_ORDER_PMC_assets` بإعادة كتابة مصرح بها ودفع `--force-with-lease` لهذه الحالة فقط.
- نتيجة `git log github/main --oneline -- docs/WORK_ORDER_PMC_assets`: فارغة.
- لم يُدفع أي تغيير إلى `origin` الداخلي.
- لا توجد لقطات PMC محلية في `/home/ubuntu/upload` بعد التنظيف، ولا روابط manuscdn موقعة منشأة لهذه اللقطات في بيئة المشروع.
- لا توجد قيم أسرار في هذه الوثيقة أو في مخرجات التسليم.

## 5. التنبيه الأمني السابق

التنبيه كان **حادثة تسريب محتمل لملف إعدادات محلي**، وليس خطأً في محرك PMC: الملف `.project-config.json` احتوى بنية قد تتضمن اتصال قاعدة بيانات، معرّف مشروع، رمز Git مؤقتًا، وأسرار Manus/التطبيق. الفحص أثبت أنه غير متتبع ولم يظهر في تاريخ `github/main`؛ أُضيف إلى `.gitignore` مع أنماط الاعتماد ذات الصلة.

لم تظهر **قيمة سرية كاملة** في أي التزام أو في مخرج التسليم المقصود. ظهرت فقط أسماء المتغيرات وأنماط مموهة/تشخيصية دون قيم كاملة. إذا كانت هناك شكوك حول قيمة سبق عرضها خارج هذا السجل، يجب تدويرها من مزودها قبل أي تشغيل إنتاجي.

## 6. حدود التسليم

- لا تبدأ Phase B أو أي استيراد Excel/CSV/XER بناءً على هذه الوثيقة.
- هذه الوثيقة لا تمنح ملكية لحساب TiDB أو Manus؛ هي جرد للاعتمادات الموجودة في الكود وبيئة التشغيل.
- جميع الأسرار يجب أن تبقى في مدير أسرار أو إعدادات البيئة، لا في Git أو ملفات التسليم.
