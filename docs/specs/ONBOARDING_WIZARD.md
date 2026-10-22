# مواصفة معالج الإعداد الأول (ONBOARDING_WIZARD)

**الحالة:** مواصفة بنائية (`WRITTEN`). لا تُعد دليل `PROVEN`، ولا تغيّر صفًا في `docs/STATE.md`.
**الأساس:** الكود على الفرع `claude/wonderful-thompson-c3wdtm` عند `0826abc`. أسماء الجداول والأعمدة بمصطلحات PostgreSQL من `origin/feat/postgres-migration:drizzle/schema.ts` و`drizzle/0000_baseline.sql` و`drizzle/baseline-security.sql`.
**المحرك:** PostgreSQL وفق `docs/ADR-0002-POSTGRES-SUPABASE-VERCEL.md` على `origin/feat/postgres-migration` (قرار المالك، 22 أكتوبر 2026). الفرع الحاكم `main` ما زال على MySQL/TiDB في `CLAUDE.md` و`docs/DECISIONS.md` (ADR-001)، فدمج ADR-0002 قرار مفتوح (البند 8.1، و`docs/AFTER_MIGRATION.md` G-1).
**ما هو `PROPOSED`:** كل إجراء خادم أو جدول أو قيد أو رمز خطأ لا يوجد في الكود أو في المخطط الحالي. وما عداه مأخوذ من ملف ورد اسمه.

## 1. الهدف والنطاق

**الهدف:** أن تبدأ شركة جديدة العمل في أربع خطوات: إنشاء الشركة، ثم أول مشروع، ثم استيراد بيانات المشروع، ثم دعوة الفريق بالأدوار الجاهزة. كل خطوة تستعمل إجراء خادم موجودًا يفرض صلاحياته بنفسه، ولا يملك المعالج صلاحية خاصة به.

**القرارات المحسومة (قرار المالك، 22 أكتوبر 2026):**
1. **الترتيب:** الشركة، ثم أول مشروع، ثم الاستيراد، ثم دعوة المستخدمين بالقوالب. الخطوة التالية تتطلب ما قبلها (§3).
2. **إنشاء أول مشروع:** يسمح به مالك الشركة (`TENANT_OWNER`)، ودور PMO (`PMO_LEAD`)، ودور التنفيذي (`EXECUTIVE`). الصلاحية المسوِّرة هي `project.write` كما يتحقق منها `createProjectForTenant` في `server/db.ts`. والقوالب الجاهزة تمنح `project.write` لهذه الأدوار الثلاثة بالضبط (§4).
3. **الباقات:** المعالج متاح في كل باقة، ولا يعتمد عليها: ظهوره وخطواته الأربع وترتيبها لا تتوقف على الباقة التي اشترتها الشركة. لوحة التنفيذي (`/executive/:tenantId`) وحدها لباقة `EXECUTIVE`، ويفرضها `getExecutiveDashboard` بمنتج `EXECUTIVE` وصلاحية `executive.read`. الفجوة بين هذا القرار والكود (خطوتا المشروع والدعوة تطلبان منتجًا بعينه) في §8.2.
4. **الدعوات:** تنتهي الدعوة بعد 7 أيام. الدعوة المنتهية تُعاد إرسالها بمدة جديدة وبالقالب نفسه، وإعادة الإرسال حدث مسجَّل في `audit_logs`. كل دعوة تحمل قالبًا (`role_id` إلى صف الدور المثبَّت للشركة)، ويأخذ المدعو صلاحيات القالب عند القبول. الحقلان `expires_at` و`status` بقيم `pending` و`accepted` و`expired` و`cancelled` مع قيد CHECK. يُعالج العيب S-4 في `docs/AFTER_MIGRATION.md`.

**داخل النطاق:**
- إنشاء الشركة بالخطة وعدد المقاعد (`selfService.signup`)، أو اختيار شركة قائمة (`tenant.mine`).
- إنشاء أول مشروع أو اعتماد مشروع قائم (`projects.create`، `projects.list`).
- عرض مكوّن الاستيراد `ProjectImports` للمشروع المعتمد، مع إمكان التخطي.
- دعوة عضو بقالب ونطاق (المشروع المعتمد، أو الشركة كلها باختيار صريح)، وإعادة إرسال دعوة منتهية، وإلغاء دعوة، وعرض الدعوات، وقبول الدعوة من الرابط.

**خارج النطاق:**
- الفوترة والدفع. اختيار الخطة لا يحصّل مالًا.
- الأسعار ومدة التجربة وعدد المقاعد الافتراضي: قرارات تجارية مفتوحة (§8.5).
- استيراد البيانات وقواعده: `docs/IMPORT_EXPORT.md`. المعالج يعرض المكوّن فقط.
- إرسال بريد الدعوة. الرابط يُعرض، ولا يرسل المعالج رسالة (§8.4).
- تعدد الشركات لكل حساب (§8.6). ولوحة التنفيذي نفسها.

**تصحيح للنسخة السابقة:** خطوة المشروع تفرض `project.write` في الواجهة والخادم، لا `project.manage`، ويثبت ذلك `SetupWizard.access.test.tsx`، والبند P-6 في `docs/AFTER_MIGRATION.md` مُصلح. أما عيبا «اختيار المشروع لا يُحفظ» و«أعلام الاكتمال ثابتة» فما زالا قائمين (§3).

**المصادر:** `client/src/pages/SetupWizard.tsx` (171 سطرًا، والمكوّنات `CompanyStep` و`ProjectStep` و`InviteStep`)، و`client/src/pages/SetupWizard.interaction.test.tsx` (5 اختبارات)، و`client/src/pages/SetupWizard.access.test.tsx` (4 اختبارات)، و`client/src/App.tsx` (`/setup` و`/setup/:tenantId` و`/invite/accept` و`withAuth`)، و`server/routers.ts` (`selfService` و`tenant` و`projects`)، و`server/db.ts`، و`server/domain/operationalRoles.ts`، و`server/domain/authorization.ts`، و`shared/projectErrors.ts`.

## 2. الجداول والأعمدة والقيود والفهارس

**القاعدة:** كل جدول عمل يحمل `tenant_id`، وجداول المشروع تحمل `project_id` أيضًا. الصنف الأمني لكل جدول (RLS) من `project_os_apply_conventions()` في `drizzle/baseline-security.sql`: جدول بـ`tenant_id`، أو جدول الشركات `companies`، أو جدول عام، أو جدول فرعي يصل إلى شركته عبر أبيه، أو سجل التدقيق (قراءة وإدراج فقط).

### 2.1 الشركة والاشتراك والترخيص (الخطوة 1، بلا تغيير)
- `companies`: `id` varchar(36) PK، و`legal_name` varchar(255)، و`slug` varchar(120) وUNIQUE `companies_slug_unique`، و`status` (`companies_status`)، و`default_locale` (`companies_default_locale`، والقيمة `ar`). الصنف: جدول الشركات.
- `subscriptions`، و`tenant_entitlements` (UNIQUE `tenant_entitlements_subscription_product_unique`)، و`tenant_licenses` (UNIQUE `tenant_licenses_subscription_unique`، و`seats` integer، و`trial_ends_at`). الصنف: جدول بـ`tenant_id`.
- `self_service_signup_attempts`: صف لكل محاولة، ويُقرأ منه عدد آخر 24 ساعة بحد `selfSignupLimitPerDay` = 3 (`server/db.ts`). الصنف: عام، لأنه يُقرأ قبل وجود الشركة.
- مدة التجربة 14 يومًا وسعر 0 مكتوبان في `createSelfServiceTenant`، وهما مفتوحان (§8.5).

### 2.2 العضويات والأدوار (الخطوة 1)
- `memberships`: UNIQUE `memberships_tenant_user_unique` على (`tenant_id`, `user_id`)، و`status` (`memberships_status`: `invited`، `active`، `suspended`، `revoked`).
- `roles`: UNIQUE `roles_tenant_code_unique` على (`tenant_id`, `code`)، و`system_managed` boolean. هذه صفوف القوالب المثبتة للشركة. الصنف: جدول بـ`tenant_id`.
- `permissions`: جدول عام، UNIQUE `permissions_code_unique`. `project.write` فيه من `ownerPermissions` في `server/db.ts`.
- `role_permissions`: PK (`role_id`, `permission_id`)، صنفه فرعي عبر `roles`.
- `membership_roles`: UNIQUE `membership_roles_scope_unique` على (`membership_id`, `role_id`, `scope_type`, `scope_id`)، صنفه فرعي عبر `memberships`.
- **تثبيت القوالب (PROPOSED، عيب S-6):** `ensureTenantOperationalRoles` يُستدعى اليوم من `getTenantAdministration`، وهو استعلام قراءة يكتب دون تدقيق. المقترح أن تُثبَّت القوالب في معاملة `createSelfServiceTenant` نفسها، مع صف `tenant.role_templates_installed`، وأن يصبح `getTenantAdministration` قراءة فقط. الشركات القائمة تحتاج ترحيل بيانات لمرة واحدة. بدون ذلك لا تجد الخطوة 4 قوالب قبل فتح شاشة الإدارة.

### 2.3 المشروع (الخطوة 2، بلا تغيير في الجدول)
- `projects`: `id` varchar(36) PK، و`tenant_id` FK إلى `companies.id`، و`code` varchar(80) وUNIQUE `projects_tenant_code_unique` على (`tenant_id`, `code`)، و`name` varchar(255)، و`project_type` varchar(120)، و`currency` varchar(3) الافتراضي `USD`، و`status` (`projects_status`، ويكتبها المعالج `draft`)، و`lifecycle_stage` (الافتراضي `planning`، ولا يكتبه المعالج).
- تكرار الرمز: القيد موجود، والخطأ لا يُترجم اليوم (S-5). المقترح: `createProjectForTenant` يلتقط SQLSTATE `23505` على `projects_tenant_code_unique` ويرفض بـ`PROJECT_OS_PROJECT_DUPLICATE` (§5، PROPOSED).

### 2.4 الدعوات: `membership_invitations` (الخطوة 4)
الجدول موجود في المخطط الحالي بحقوله الأساسية. الجدول التالي يبيّن ما هو موجود وما هو مقترح.

| العمود | النوع | الحالة | ملاحظة |
|---|---|---|---|
| `id` | varchar(36) PK | موجود | |
| `tenant_id` | varchar(36) NOT NULL، FK إلى `companies.id` | موجود | صنف جدول بـ`tenant_id` |
| `email` | varchar(320) NOT NULL | موجود | CHECK مقترح `email = lower(btrim(email))`، والكود يحفظه بعد التقليم والتحويل |
| `role_id` | varchar(36) NOT NULL، FK إلى `roles.id` | موجود | قالب الدعوة: صف الدور المثبت للشركة. دور من شركة أخرى يرفض بـ`PROJECT_OS_ROLE_NOT_FOUND` |
| `scope_type` | enum (`company`، `portfolio`، `program`، `project`) NOT NULL | موجود | |
| `scope_id` | varchar(36) NULL | موجود | فارغ للشركة كلها |
| `token_hash` | varchar(64) NOT NULL، UNIQUE | موجود | SHA-256 للرمز. الرمز نفسه لا يُخزَّن |
| `status` | text NOT NULL DEFAULT `pending`، CHECK | **PROPOSED** | الحالي enum `membership_invitations_status` بقيمة `revoked` لا `cancelled`، وليس فيه كود يكتب `expired` |
| `invited_by_user_id` | integer NOT NULL، FK إلى `users.id` | موجود | |
| `accepted_by_user_id` | integer NULL، FK إلى `users.id` | موجود | |
| `expires_at` | timestamptz NOT NULL | موجود | الآن + 7 أيام عند الإنشاء وعند إعادة الإرسال |
| `accepted_at` | timestamptz NULL | موجود | |
| `token_issued_at` | timestamptz NOT NULL DEFAULT now() | **PROPOSED** | وقت إصدار الرمز الحالي |
| `resent_count` | integer NOT NULL DEFAULT 0 | **PROPOSED** | عدد إعادات الإرسال |
| `cancelled_at` | timestamptz NULL | **PROPOSED** | |
| `cancelled_by_user_id` | integer NULL، FK إلى `users.id` | **PROPOSED** | |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | موجود | `updated_at` يحدّثه trigger المشترك |

**القيود:**
- CHECK `membership_invitations_status_check`: `status IN ('pending','accepted','expired','cancelled')` (PROPOSED).
- CHECK `membership_invitations_scope_check`: `(scope_type = 'company') = (scope_id IS NULL)` (PROPOSED؛ الكود يرفض التناقض بـ`PROJECT_OS_INVALID_SCOPE` اليوم).
- CHECK `membership_invitations_accepted_check`: `(status = 'accepted') = (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)` (PROPOSED).
- CHECK `membership_invitations_cancelled_check`: `(status = 'cancelled') = (cancelled_at IS NOT NULL)` (PROPOSED).
- CHECK `membership_invitations_expiry_check`: `expires_at > created_at` (PROPOSED).
- CHECK `membership_invitations_resent_check`: `resent_count >= 0` (PROPOSED).
- CHECK `membership_invitations_token_hash_check`: `token_hash ~ '^[0-9a-f]{64}$'` (PROPOSED).
- UNIQUE `membership_invitations_token_hash_unique` على `token_hash` (موجود).
- UNIQUE جزئي `membership_invitations_one_pending_per_email` على (`tenant_id`, `email`) حيث `status = 'pending'` (PROPOSED). يضمن في قاعدة البيانات ما كان يفحصه الكود وحده: دعوة معلقة واحدة لكل بريد في الشركة. الدعوة المنتهية لا تحجز البريد لأن حالتها ليست `pending`.
- FK موجودة لـ`tenant_id` و`role_id` و`invited_by_user_id` و`accepted_by_user_id`، وتُضاف FK لـ`cancelled_by_user_id` (PROPOSED).

**الفهارس:**
- `membership_invitations_tenant_email_status_idx` على (`tenant_id`, `email`, `status`)، و`membership_invitations_email_status_idx` على (`email`, `status`)، وكلاهما موجود.
- `membership_invitations_tenant_pending_expiry_idx` على (`tenant_id`, `expires_at`) حيث `status = 'pending'` (PROPOSED). يخدم عد المقاعد وفحص الانتهاء دون مسح جدول الشركة كله.

**مسودة الترحيل (PROPOSED، لا تُطبَّق قبل مراجعة وخطة رجوع مكتوبة، `CLAUDE.md` §4):**
```sql
ALTER TABLE membership_invitations
  ADD COLUMN token_issued_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN resent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by_user_id integer REFERENCES users(id);
ALTER TABLE membership_invitations
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE text USING (CASE status::text WHEN 'revoked' THEN 'cancelled' ELSE status::text END),
  ALTER COLUMN status SET DEFAULT 'pending',
  ADD CONSTRAINT membership_invitations_status_check CHECK (status IN ('pending','accepted','expired','cancelled')),
  ADD CONSTRAINT membership_invitations_accepted_check CHECK ((status = 'accepted') = (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)),
  ADD CONSTRAINT membership_invitations_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  ADD CONSTRAINT membership_invitations_scope_check CHECK ((scope_type = 'company') = (scope_id IS NULL));
CREATE UNIQUE INDEX membership_invitations_one_pending_per_email ON membership_invitations (tenant_id, email) WHERE status = 'pending';
CREATE INDEX membership_invitations_tenant_pending_expiry_idx ON membership_invitations (tenant_id, expires_at) WHERE status = 'pending';
```
يبقى النوع `membership_invitations_status` بعد الترحيل، ويُسقط في ترحيل لاحق بخطة رجوع.

**الانتقالات (PROPOSED):** كل انتقال يكتب `UPDATE ... WHERE id = $1 AND status IN (...)` ويفحص عدد الصفوف.
```
pending  --قبول قبل expires_at-->  accepted   (نهائية)
pending  --expires_at <= now()-->  expired    (بالكسل عند أي عملية على البريد، أو بالمسح اليومي)
expired  --إعادة إرسال-->          pending    (expires_at جديد، token_hash جديد)
pending | expired --إلغاء-->       cancelled  (نهائية)
```
صفر صفوف يرجع خطأً صريحًا `PROJECT_OS_INVITATION_NOT_PENDING`، لا نجاحًا صامتًا (`CLAUDE.md` §1، و`docs/AFTER_MIGRATION.md` S-2).

**الانتهاء بالوقت لا بالحالة وحدها:** قبول الدعوة وعدّ المقاعد يشترطان `expires_at > now()`، فصحة الدعوة لا تتوقف على تحديث الحالة. المسح اليومي عبر `scheduled_jobs` وVercel Cron (ADR-0002) يحوّل المعلقة المنتهية إلى `expired` ويكتب `tenant.invitation_expired` دون مستخدم فاعل.

**إعادة الإرسال (PROPOSED):** للدعوة `expired` فقط. تُبدَّل `token_hash` فيبطل الرمز القديم، ويصبح `expires_at` الآن + 7 أيام، و`resent_count` + 1، و`status` = `pending`. الصف واحد لكل دعوة فيبقى السجل واحدًا. تُكتب في المعاملة نفسها `tenant.invitation_resent`. وإن وُجدت دعوة سارية أخرى للبريد نفسه، يرجع القيد الجزئي الخطأ الذي يُترجم إلى `PROJECT_OS_INVITATION_ALREADY_PENDING`.

### 2.5 صفوف التدقيق
| الإجراء (`action`) | `entity_type` | المرحلة | الحالة |
|---|---|---|---|
| `self_service.tenant_created` | `company` | الخطوة 1، في المعاملة نفسها | موجود |
| `project.created` | `project` | الخطوة 2، في المعاملة نفسها | موجود |
| `tenant.member_invited` | `membership_invitation` | إنشاء الدعوة | موجود |
| `tenant.invitation_accepted` | `membership_invitation` | القبول | موجود |
| `tenant.invitation_resent` | `membership_invitation` | إعادة الإرسال | PROPOSED |
| `tenant.invitation_cancelled` | `membership_invitation` | الإلغاء | PROPOSED |
| `tenant.invitation_expired` | `membership_invitation` | الانتهاء بالمسح (بلا `actor_user_id`) | PROPOSED |
| `tenant.role_templates_installed` | `role` | تثبيت القوالب (§2.2) | PROPOSED |

`audit_logs` يملك التطبيق عليه `SELECT, INSERT` فقط (`drizzle/baseline-security.sql`). لا يوصف الصف بأنه غير قابل للعبث بإطلاق: الـtrigger يمنع التعديل، وحيازة حساب المالك تبقى شأنًا مستقلًا (ADR-0002، الحدود 1 و2).

## 3. الشاشات

**المسارات:** `/setup` بلا شركة، و`/setup/:tenantId` لشركة محددة، ويحميهما `withAuth` (`client/src/App.tsx`). رابط القبول `/invite/accept?token=` خارج المعالج.
**الخطوة الحالية:** في الهاش `#company` أو `#project` أو `#import` أو `#invite` (دالة `goto` في `SetupWizard.tsx`). المشروع المعتمد **PROPOSED** في `?project=<id>`، وهذا يعالج عيب «اختيار المشروع لا يُحفظ».
**الترويسة:** العنوان «معالج الإعداد لأول شركة»، والعربية والإنجليزية بمفتاح `isArabic`. شريط الخطوات، وكل خطوة في `SectionErrorBoundary` مستقل. الخطوات 2 إلى 4 لا تُفتح بلا شركة في المسار (الزر معطَّل).

| الخطوة | من يراها | ما تفعله | الحالة الفارغة أو التحميل |
|---|---|---|---|
| 1. الشركة | كل مستخدم تحقق من بريده (§4) | تختار خطة من `selfService.plans`، وتكتب الاسم القانوني والمعرّف (`^[a-z0-9]+(-[a-z0-9]+)*$`، 3 أحرف على الأقل) والمقاعد (الافتراضي 5)، ثم «إنشاء الشركة». النجاح يوجّه إلى `/setup/{tenantId}#project`. أو تختار شركة قائمة من `tenant.mine` فيظهر إقرار بأنها أُنشئت. | الخطط: «جارٍ التحميل…». بلا خطط: الإرسال معطَّل ويظهر «اختر خطة» |
| 2. أول مشروع | من يملك `project.write` (§4) | يعرض مشاريع الشركة (`projects.list`) مع زر «اعتمد هذا المشروع». ينشئ مشروعًا بالرمز والاسم والنوع (الافتراضي «إنشاءات») والعملة (الافتراضي `SAR` في الواجهة، والخادم يطلب 3 أحرف ويحوّلها للكبيرة). المشروع الوحيد يُعتمد تلقائيًا. | «لا مشروع بعد: أنشئ أول مشروع.» ولمن لا يملك الصلاحية يظهر نص `WriteGate` بدل النموذج |
| 3. الاستيراد | من يملك صلاحية الوحدة (`shared/importPermissions.ts`) | يعرض `ProjectImports` للمشروع المعتمد. زر «تخطَّ هذه الخطوة الآن» ينقل إلى الدعوة دون كتابة | `role="status"`: «اختر المشروع في الخطوة السابقة أولًا.» |
| 4. دعوة الفريق | من يملك `tenant.manage` مع منتج `EXECUTIVE` حاليًا (§8.2) | يختار بريدًا ودورًا من القوالب (بلا `TENANT_OWNER`) ونطاقًا: المشروع المعتمد افتراضيًا، أو الشركة كلها باختيار صريح. يعرض بطاقة الغرض والتركيز والحد الفاصل للدور. بعد الإرسال يعرض الرابط **مرة واحدة**. وتعرض قائمة الدعوات من `tenant.listInvitations` (PROPOSED) بالحالة والانتهاء، مع «أعد الإرسال» للمنتهية و«ألغِ» للمعلقة والمنتهية | «لا أدوار متاحة.» وعند فشل القراءة يظهر `role="alert"` بسبب الخطأ |
| الإنهاء | من وصل إلى الخطوة 4 | رابط «إنهاء الإعداد والانتقال إلى المشروع» إلى `/projects/{tenantId}/{projectId}/controls` | بلا مشروع: الرابط معطَّل مع نص «اختر المشروع أولًا.» |

**الحالة المقروءة للخطوات (PROPOSED، بدل الأعلام الثابتة):** تُعلَّم الخطوة مكتملة من بيانات الخادم: الشركة إذا كانت في `tenant.mine`؛ والمشروع إذا كان المعتمد في `projects.list`؛ والاستيراد إذا وُجد صف في `data_imports` للمشروع بحالة `completed`؛ والدعوة إذا وُجد أي صف في `membership_invitations` للشركة. اليوم `complete.import` و`complete.invite` ثابتتان على `false` في `SetupWizard.tsx`.

**الاستئناف بعد إعادة التحميل:** تُستعاد الخطوة من الهاش، ويُستعاد المشروع من `?project=`. إن لم يوجد وكان للشركة مشروع واحد اعتُمد تلقائيًا، وإن وُجد أكثر من مشروع يختار المستخدم من جديد. الدعوات تُقرأ من الخادم لا من الجلسة. لا يُستعمل `localStorage` لحالة الشركة، لأنها يجب أن تُقرأ بعد أي إعادة تحميل وليست تفضيلًا محليًا.

**أخطاء الشاشة:** تظهر في `role="alert"` عبر `getLocalizedProjectError` (`client/src/lib/projectErrors.ts`). تحميل الشركات والمشاريع والخطط يظهر في `SourceNotice`. لا تظهر رسالة خادم خام.

## 4. الصلاحيات

| الإجراء | ما يفحصه الخادم | ما تُظهره الواجهة | ملاحظة |
|---|---|---|---|
| قراءة الخطط | مستخدم مسجل (`protectedProcedure`) | القائمة | `getPublicCommercialPlans` |
| إنشاء الشركة | تحقق البريد بطريقة `email` أو `google` (`VERIFIED_LOGIN_METHODS` في `server/domain/loginMethods.ts`)، وخطة فعالة، ومعرّف غير مستعمل، وأقل من 3 محاولات في 24 ساعة | النموذج بلا بوابة صلاحية | لا دور قبل وجود الشركة |
| إنشاء المشروع | `assertTenantAccess` بمنتج `PROJECT` وصلاحية `project.write` (`createProjectForTenant`)، ثم سقف المشاريع في الترخيص (`assertTenantProjectCapacity`) | `WriteGate permission="project.write"` في `ProjectStep` | المنتج `PROJECT` شرط في الخادم (§8.2) |
| الاستيراد | صلاحية الوحدة من `importModulePermissions` (`shared/importPermissions.ts`)، والباقي بـ`anyImportPermission` (`server/db.ts`) | رفع الملفات يظهر لمن يحمل الصلاحية | تفاصيل الاستيراد في `docs/IMPORT_EXPORT.md` |
| قراءة الأعضاء والقوالب | `tenant.manage` مع منتج `EXECUTIVE` (`getTenantAdministration`) | القائمة | تصبح قراءة فقط بعد PROPOSED في §2.2 |
| إنشاء الدعوة، وإعادة الإرسال، والإلغاء، والقائمة | `assertTenantManager` (`tenant.manage` مع `EXECUTIVE`)، والدور للشركة (`assertTenantScopeOwnership`)، ومنتج الدور مرخّص (`assertRoleProductEntitled`)، ومقعد متاح | `WriteGate permission="tenant.manage"` | إعادة الإرسال والإلغاء والقائمة PROPOSED |
| قبول الدعوة | مستخدم مسجل بالبريد نفسه، والدعوة `pending` وغير منتهية، وليست عضوية قائمة، ومقعد متاح | صفحة `/invite/accept` | المستخدم ليس عضوًا بعد، فيُقرأ صف الدعوة بسياق نظام صريح (`withSystemContext`، ADR-0002)، ويبقى الفحص بالتجزئة والبريد |
| دعوة `TENANT_OWNER` | الخادم يقبلها اليوم | تُخفى من القائمة | §8.3 |

**القوالب ومنح `project.write` (القرار 2):** المصفوفة الحالية في `operationalRoleDefinitions` (`server/domain/operationalRoles.ts`، سبعة عشر قالبًا):

| القالب | `project.write` اليوم | المقترح |
|---|---|---|
| `TENANT_OWNER` (ليس في القائمة، ويثبته الخادم) | نعم، من `ownerPermissions` | نعم |
| `PMO_LEAD` (منتج `PMO`) | لا: يحمل `pmo.read` و`pmo.write` | **نعم (PROPOSED)** |
| `EXECUTIVE` (منتج `EXECUTIVE`) | لا: يحمل `executive.read` | **نعم (PROPOSED)** |
| `PROJECT_MANAGER` | لا: يحمل `project.manage` | لا، يبقى كما هو (القرار يقصر الإنشاء على الثلاثة) |
| الأدوار الأربعة عشر الأخرى | لا | لا |

التغيير المقترح سطران في `operationalRoleDefinitions` يضيفان `project.write` إلى `PMO_LEAD` و`EXECUTIVE`. ويُحدَّث `docs/specs/ROLE_TEMPLATES.md` (السطر 154 يقول إن لا قالب يمنح `project.write`، وتعدّ المواصفة القوالب «ثمانية» بينما الكود فيه سبعة عشر). ويضاف اختبار وحدة يثبت أن الحاملين له هم `TENANT_OWNER` و`PMO_LEAD` و`EXECUTIVE` وحدهم.
**ملاحظة على المنتج:** كل من `PMO_LEAD` و`EXECUTIVE` أحادي المنتج اسمًا، لكن `assertTenantAccess` (`server/domain/authorization.ts`) لا يفحص منتج الدور، بل منتجات الشركة المرخّصة وصلاحيات الأدوار. فالشرط الفعلي لإنشاء المشروع هو ترخيص `PROJECT` للشركة (§8.2).

## 5. حالات الرفض

الرسالة المعروضة هي المعرّبة من `shared/projectErrors.ts` عبر `getProjectError` ثم `getLocalizedProjectError`. كل رفض يظهر في `role="alert"`، فلا فشل صامت.

| # | الخطوة | الحالة | رمز tRPC | الرمز المعرّب | ما يراه المستخدم |
|---|---|---|---|---|---|
| 1 | 1 | بريد المستخدم غير موجود | FORBIDDEN | `PROJECT_OS_SIGNUP_EMAIL_REQUIRED` | رسالة البريد المطلوب |
| 2 | 1 | البريد غير متحقق منه | FORBIDDEN | `PROJECT_OS_SIGNUP_EMAIL_NOT_VERIFIED` | رسالة التحقق |
| 3 | 1 | الخطة غير موجودة أو غير فعالة | NOT_FOUND | `PROJECT_OS_COMMERCIAL_PLAN_NOT_FOUND` | رسالة الخطة |
| 4 | 1 | المعرّف مستعمل (فحص مسبق، أو قيد `companies_slug_unique`) | CONFLICT | `PROJECT_OS_WORKSPACE_SLUG_EXISTS` | رسالة المعرّف المستعمل |
| 5 | 1 | أكثر من 3 محاولات في 24 ساعة | TOO_MANY_REQUESTS | `PROJECT_OS_SIGNUP_RATE_LIMITED` | رسالة الحد، ولا يُكتب صف |
| 6 | 1 | المقاعد خارج 1 إلى 100000 | BAD_REQUEST | `PROJECT_OS_REQUEST_FAILED` | «تعذر إتمام الطلب. تحقق من البيانات» |
| 7 | 1 | فشل المعاملة | INTERNAL_SERVER_ERROR | `PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE` | رسالة الخدمة غير المتاحة، والخطأ يُسجَّل بلا بيانات شخصية |
| 8 | 2 | بلا `project.write` | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` | نص `WriteGate` قبل النموذج، وعند الإرسال رسالة الخادم |
| 9 | 2 | الشركة بلا منتج `PROJECT` مرخّص | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة عدم الترخيص. الخادم يرمي نصًا إنجليزيًا «not licensed» تطابقه الواجهة (`getProjectError`). PROPOSED: رمي الرمز من الخادم |
| 10 | 2 | الترخيص لا يتيح المشاريع | FORBIDDEN | `PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE` | رسالة الترخيص |
| 11 | 2 | بلوغ سقف المشاريع في الترخيص | FORBIDDEN | `PROJECT_OS_LICENSE_LIMIT_EXCEEDED` | رسالة السقف |
| 12 | 2 | رمز مكرر في الشركة (SQLSTATE `23505`) | CONFLICT | `PROJECT_OS_PROJECT_DUPLICATE` (PROPOSED، S-5) | «رمز المشروع مستعمل في هذه الشركة»، بدل خطأ الخادم العام اليوم |
| 13 | 2 و4 | المشروع المعتمد لا يتبع الشركة (من `?project=`) | NOT_FOUND | `PROJECT_OS_PROJECT_NOT_FOUND` | رسالة المشروع غير موجود. الكود يرميه خطأ عاديًا (`assertProjectWithinTenant`)، والمقترح TRPCError من NOT_FOUND (PROPOSED) |
| 14 | 3 | ملف غير صالح أو صيغة غير مدعومة | BAD_REQUEST | `PROJECT_OS_IMPORT_FILE_INVALID`، `PROJECT_OS_IMPORT_FORMAT_INVALID` | رسالة الملف |
| 15 | 3 | الوحدة غير معروفة، أو الملف غير متاح | BAD_REQUEST | `PROJECT_OS_IMPORT_MODULE_INVALID`، `PROJECT_OS_IMPORT_FILE_UNAVAILABLE` | رسالة الوحدة أو الملف |
| 16 | 3 | التحقق يرفض الصفوف | BAD_REQUEST | `PROJECT_OS_IMPORT_VALIDATION_FAILED` | الصفوف المرفوضة |
| 17 | 3 | تكرار مكتشف | CONFLICT | `PROJECT_OS_IMPORT_DUPLICATE_DETECTED` | رسالة التكرار |
| 18 | 3 | تأكيد استيراد غير جاهز | BAD_REQUEST | `PROJECT_OS_IMPORT_NOT_CONFIRMABLE` | رسالة عدم الجاهزية |
| 19 | 3 | الملف فوق 50 MB (HTTP 413، خارج إجراءات tRPC) | — | `PROJECT_OS_REQUEST_TOO_LARGE` | رسالة الحجم. الرفع المباشر بعنوان موقّع (ADR-0002) |
| 20 | 4 | منتج `EXECUTIVE` غير مرخّص (`assertTenantManager`) | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة في تنبيه الخطوة 4 (§8.2) |
| 21 | 4 | دور من منتج غير مرخّص (`assertRoleProductEntitled`) | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة عدم الترخيص في تنبيه الخطوة 4 |
| 22 | 4 | بلا `tenant.manage` | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` | نص `WriteGate` للنموذج |
| 23 | 4 | الدور ليس للشركة | NOT_FOUND | `PROJECT_OS_ROLE_NOT_FOUND` | رسالة الدور |
| 24 | 4 | البريد عضو قائم | CONFLICT | `PROJECT_OS_MEMBER_ALREADY_EXISTS` | رسالة العضوية القائمة |
| 25 | 4 | دعوة سارية للبريد نفسه (المنتهية تُعاد ولا تمنع) | CONFLICT | `PROJECT_OS_INVITATION_ALREADY_PENDING` | رسالة الدعوة السارية، مع «ألغِ الدعوة السارية أولًا». الكود اليوم يمنع حتى المنتهية (S-4) |
| 26 | 4 | لا مقعد متاح (الدعوة السارية تحجز مقعدًا، والمنتهية لا) | FORBIDDEN | `PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED` | رسالة المقاعد |
| 27 | 4 | نطاق لا يتبع الشركة، أو معرّف مع نطاق الشركة كله | BAD_REQUEST أو NOT_FOUND | `PROJECT_OS_INVALID_SCOPE` | رسالة النطاق |
| 28 | 4 | إعادة إرسال دعوة ليست منتهية (سارية، أو مقبولة، أو ملغاة) | CONFLICT | `PROJECT_OS_INVITATION_NOT_RESENDABLE` (PROPOSED) | «لا تُعاد إلا الدعوة المنتهية» |
| 29 | 4 | الدعوة غير موجودة في الشركة | NOT_FOUND | `PROJECT_OS_INVITATION_NOT_FOUND` (PROPOSED) | رسالة الدعوة غير موجودة |
| 30 | 4 | إلغاء دعوة مقبولة | CONFLICT | `PROJECT_OS_INVITATION_NOT_CANCELLABLE` (PROPOSED) | «الدعوة المقبولة لا تُلغى» |
| 31 | 4 | تحديث شرطي بصفر صفوف (تغيّرت الحالة بين القراءة والكتابة) | CONFLICT | `PROJECT_OS_INVITATION_NOT_PENDING` (PROPOSED) | «تغيّرت حالة الدعوة. حدّث الصفحة» |
| 32 | قبول | الرمز غير موجود، أو ملغى، أو منتهٍ | NOT_FOUND | `PROJECT_OS_INVITATION_INVALID_OR_EXPIRED` | رسالة الدعوة المنتهية |
| 33 | قبول | بريد الحساب غير بريد الدعوة | FORBIDDEN | `PROJECT_OS_INVITATION_EMAIL_MISMATCH` | رسالة البريد |
| 34 | قبول | العضوية موجودة | CONFLICT | `PROJECT_OS_MEMBER_ALREADY_EXISTS` | رسالة العضوية |
| 35 | قبول | لا مقعد متاح عند التفعيل | FORBIDDEN | `PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED` | رسالة المقاعد |
| 36 | 4 | دعوة بدور `TENANT_OWNER` | — | يُحدَّد بعد §8.3 | الخادم يقبلها اليوم، والمعالج يخفيها |

## 6. معايير القبول

1. تظهر الخطوات الأربع بالترتيب: الشركة، ثم المشروع، ثم الاستيراد، ثم الدعوة. زر «التالي» بعد الشركة والمشروع يبقى معطَّلًا حتى يتحقق الشرط.
2. إنشاء الشركة يكتب في معاملة واحدة `companies` و`subscriptions` و`tenant_licenses` و`tenant_entitlements` و`memberships` و`roles` (لـ`TENANT_OWNER`) و`role_permissions` و`membership_roles` و`audit_logs` (`self_service.tenant_created`). فشل أي صف يلغي الكل.
3. القوالب الجاهزة مثبتة للشركة عند إنشائها (PROPOSED، §2.2)، فتجد الخطوة 4 قائمتها دون فتح شاشة الإدارة.
4. المحاولة الرابعة في 24 ساعة ترجع `PROJECT_OS_SIGNUP_RATE_LIMITED`، ولا يُكتب صف في أي جدول.
5. `project.write` وحده يفتح نموذج المشروع. من يحمل `project.manage` فقط يرى نص السبب لا النموذج.
6. `TENANT_OWNER` و`PMO_LEAD` و`EXECUTIVE` تنشئ المشروع، و`PROJECT_MANAGER` لا ينشئه (PROPOSED، §4).
7. مشروع برمز مكرر في الشركة نفسها يرجع `PROJECT_OS_PROJECT_DUPLICATE` مترجمًا، لا خطأ خادم عامًا، ولا يُكتب صف.
8. بعد إنشاء أول مشروع يُعتمد تلقائيًا. ومع أكثر من مشروع يختار المستخدم، ويبقى الاختيار بعد إعادة التحميل بـ`?project=`.
9. الاستيراد يعمل للمشروع المعتمد. وزر التخطي ينقل إلى الدعوة دون أي كتابة.
10. الدعوة تكتب صفًا بـ`token_hash` (SHA-256) و`expires_at` = الآن + 7 أيام. الرمز لا يُخزَّن، ويظهر الرابط مرة واحدة، ويحمل الرمز في `/invite/accept?token=`.
11. دعوة لبريد له دعوة سارية تُرفض. دعوة لبريد له دعوة منتهية تُقبل، بعد أن يصير الصف المنتهي `expired`.
12. الدعوة المنتهية تُعاد في الصف نفسه: `token_hash` جديد، و`expires_at` جديد، و`resent_count` + 1، ويكتب `tenant.invitation_resent`. الرمز القديم يفشل في القبول.
13. الإلغاء يحوّل `pending` أو `expired` إلى `cancelled`، ويحرر البريد والمقعد، ويكتب `tenant.invitation_cancelled`. الإلغاء بعد القبول مرفوض.
14. الدعوة المنتهية لا تحجز مقعدًا، والسارية تحجزه.
15. القبول بالبريد نفسه يكتب `memberships` و`membership_roles` بالقالب والنطاق المحفوظين، ويصبح الصف `accepted`، ويكتب `tenant.invitation_accepted`.
16. القيود في قاعدة البيانات تمنع: حالة خارج القائمة، ودعوتين سارييتين للبريد نفسه في الشركة نفسها، ونطاقًا متناقضًا، و`accepted` بلا `accepted_at`.
17. إعادة تحميل الصفحة على الخطوة 4 تعيد الخطوة من الهاش، وقائمة الدعوات من الخادم لا من الجلسة.
18. الخطوتان «الاستيراد» و«الدعوة» تُعلَّمان مكتملتين من بيانات الخادم (§3)، لا بثوابت.
19. كل عنصر بالعربية والإنجليزية، ولا تظهر رسالة خادم خام.
20. الإنهاء يرسل إلى `/projects/{tenantId}/{projectId}/controls` للمشروع المعتمد، وبلا مشروع يُعطَّل الرابط ويذكر السبب.
21. بيانات الاختبار أمثلة مختلقة مثل `new.user@example.test` و`example-co`، ولا بريد أو اسم شركة حقيقيين (`docs/PILOT_DATA_POLICY.md`).

## 7. الاختبارات المطلوبة

**اختبارات وحدة:**
- `server/domain/operationalRoles.test.ts` (يُضاف): الأدوار التي تحمل `project.write` في القوالب هي `PMO_LEAD` و`EXECUTIVE` وحدهما، و`PROJECT_MANAGER` لا يحمله. و`TENANT_OWNER` يحمله من `ownerPermissions` (PROPOSED).
- دالة انتهاء الدعوة وحساب المقاعد وقواعد الانتقال (PROPOSED، ملف جديد تحت `server/domain/`): `expired` هي `status = expired` أو (`pending` و`expires_at <= now`)، وعد المقاعد يستبعد المنتهية، والانتقالات كما في §2.4.
- `shared/projectErrors.ts`: الرموز المقترحة مترجمة بالعربية والإنجليزية، وكل رمز له نص.

**اختبارات تكامل قاعدة البيانات** (على `project_os_integration_test` وحدها، عبر `scripts/run-integration-database-test.mjs`. وحارس `server/testing/databaseGuard.setup.ts` يوقف التشغيل إن سُمّي غيرها):
- الموجود: `server/integration.database.test.ts` (الاختبار «governs tenant role and membership administration with scope and self-privilege guards»)، و`server/commercial_chain.database.test.ts`، وهو يتخطى نفسه بلا قاعدة اختبار.
- المطلوب: إنشاء الشركة يكتب كل الصفوف في معاملة، ويفشل كله عند فشل صف أخير (مثلًا بمعرّف مكرر).
- المطلوب: المحاولة الرابعة في 24 ساعة تُرفض بلا صف.
- المطلوب: البريد غير المتحقق منه يُرفض بـ`PROJECT_OS_SIGNUP_EMAIL_NOT_VERIFIED`.
- المطلوب: رمز مشروع مكرر يرجع `PROJECT_OS_PROJECT_DUPLICATE` بلا صف.
- المطلوب: القيد الجزئي يرفض دعوتين سارييتين للبريد نفسه، ويقبل بعد الإلغاء أو الانتهاء.
- المطلوب: قيود CHECK ترفض حالة خارج القائمة، ونطاقًا متناقضًا، و`accepted` بلا `accepted_at`.
- المطلوب: إعادة الإرسال تبدّل التجزئة وتحدّث `expires_at` وتكتب `tenant.invitation_resent`، والرمز القديم يفشل.
- المطلوب: الانتقال بصفر صفوف يرجع `PROJECT_OS_INVITATION_NOT_PENDING`.
- المطلوب: كل صف تدقيق يُكتب في المعاملة نفسها، فإن فشل صف التدقيق يفشل الصف الأساسي.
- المطلوب: دور `PROJECT_MANAGER` لا ينشئ مشروعًا، ودور `PMO_LEAD` ينشئه على شركة مرخّصة بـ`PROJECT`، ويُرفض على شركة لا تملك `PROJECT`.
- المطلوب: دعوة `TENANT_OWNER` تُعالج كما يقرر §8.3، ويُسجَّل الخلاف قبل القرار بـ`todo` في الاختبار مع الإشارة إلى البند.

**اختبارات واجهة (مكوّنات):**
- موجود: `SetupWizard.interaction.test.tsx` (5 اختبارات): الترتيب، وإنشاء المشروع داخل الشركة، والاستيراد بعد اختيار المشروع، وقائمة الأدوار بلا `TENANT_OWNER` مع الدعوة بنطاق المشروع، والنطاق الصريح والإنجليزية.
- موجود: `SetupWizard.access.test.tsx` (4 اختبارات): `project.write` يفتح النموذج، و`project.manage` وحده لا يفتحه، وحالة التحميل، وفشل فحص الصلاحية.
- يُضاف (PROPOSED): إعادة التحميل على الخطوة 4 تستعيد الخطوة من الهاش والمشروع من `?project=`، ويُطلب الاختيار إن وُجد أكثر من مشروع.
- يُضاف: أعلام الإكمال تُقرأ من الخادم لا ثابتة.
- يُضاف: قائمة الدعوات تعرض `expired` مع زر إعادة الإرسال، و`cancelled` دون أزرار.
- يُضاف: رفض `PROJECT_OS_PRODUCT_NOT_ENTITLED` في خطوة الدعوة يظهر رسالة لا تعطل الخطوة.
- يُضاف: زر «إنهاء» بلا مشروع معطَّل مع نص السبب.

## 8. مخاطر وأسئلة مفتوحة

هذه البنود `BLOCKED_BY_OWNER`. لا يُفترض فيها شيء.

1. **المحرك (G-1).** ADR-0002 غير مدمج في `main`، و`CLAUDE.md` و`docs/DECISIONS.md` (ADR-001) يقولان MySQL/TiDB. دمجه يحتاج قرارًا كتابيًا من المالك وتحديثًا للفرعين. هذه المواصفة بمصطلحات PostgreSQL كما طُلب، ولا تفعّل التغيير.
2. **الإكمال على كل باقة (القرار 3).** الظهور متاح على كل باقة، لكن إكمال الخطوتين يطلب منتجًا: خطوة المشروع تطلب `PROJECT` (`createProjectForTenant`)، وخطوة الدعوة تطلب `EXECUTIVE` (`assertTenantManager`). باقة `EXECUTIVE` وحدها لا تنشئ مشروعًا، وباقة `PROJECT` وحدها لا تدعو. الحلول المتاحة: تحرير بوابتي الإنشاء والدعوة من المنتج، أو تحديد من يكمل ماذا حسب الباقة. الاختيار للمالك.
3. **دعوة `TENANT_OWNER`.** الخادم يقبلها في `createMembershipInvitation`، والواجهة تخفيها. هل تُمنع في الخادم، أم يُسمح لمدير الشركة بتعيين مالك مشترك؟
4. **مزود بريد الدعوة.** المعالج يعرض الرابط فقط. هل يرسل الدعوة بريد المنصة (SMTP) أم مزود آخر؟ القرار مفتوح.
5. **التجربة والأسعار والمقاعد.** 14 يومًا مكتوبة في `createSelfServiceTenant`، والسعر 0، والمقاعد الافتراضية 5 في `SetupWizard.tsx`. قرارات تجارية. الشركة الفارغة تبقى بترخيص تجريبي حتى يقرر المالك مدة التجربة وتنظيفها.
6. **تعدد الشركات لكل حساب.** الواجهة تخفي نموذج الإنشاء بعد وجود شركة، والخادم لا يحد العدد.
7. **إعادة إصدار رابط دعوة سارية.** القرار حدد إعادة الإرسال للدعوة المنتهية فقط. الرابط يظهر مرة واحدة، فإن ضاع يلزم إلغاء الدعوة وإنشاء أخرى. هل يُسمح بإعادة إصدار رابط لدعوة سارية؟
