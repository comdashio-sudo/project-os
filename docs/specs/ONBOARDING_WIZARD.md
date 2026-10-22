# مواصفة معالج الإعداد الأول (ONBOARDING_WIZARD)

## 1. الهدف والنطاق

**الحالة:** مواصفة بنائية مبنية على الكود في الفرع `main` عند `da61754`. لا تغيّر هذه الوثيقة أي صف في `docs/STATE.md`، ولا تُعد دليل `PROVEN`.

**المحرك:** تستعمل المواصفة أنواع MySQL/TiDB كما في `drizzle/schema.ts`. لم تُكتب بمفردات PostgreSQL، للسبب المذكور في `docs/specs/TENDERING.md` البند 1، وهو قرار المالك (البند 8.1).

**الهدف:** مسار الإعداد الأول لشركة جديدة بأربع خطوات بهذا الترتيب: إنشاء الشركة، ثم أول مشروع، ثم استيراد بياناته، ثم دعوة الفريق بالأدوار الجاهزة. كل خطوة تستعمل إجراءات موجودة في `server/routers.ts`، ولا يُضيف المعالج أي إجراء خادم جديد.

**الترتيب والمسارات:**
- `/setup` بلا شركة، و`/setup/:tenantId` بشركة محددة (`client/src/App.tsx`). المعالج محمي بـ`withAuth`.
- الخطوة الحالية في عنوان الصفحة `#company` أو `#project` أو `#import` أو `#invite`. لا تُحفظ في الخادم.

**داخل النطاق:**
- إنشاء الشركة بالخطة وعدد المقاعد من قائمة الخطط العامة.
- إنشاء أول مشروع في الشركة، أو اختيار مشروع قائم.
- الانتقال إلى مكوّن الاستيراد للمشروع المختار، مع تخطي الخطوة.
- دعوة عضو بدور جاهز ونطاق المشروع الأول أو الشركة كلها، وعرض رابط الدعوة مرة واحدة.

**خارج النطاق:**
- الفوترة والدفع. اختيار الخطة لا يحصّل مالًا. انظر `server/routers.ts` (المجموعة `billing`) إن لزم.
- تحديد الأسعار، ومدة التجربة، وعدد المقاعد الافتراضي كقرار تجاري (البند 8.5).
- استيراد المشاريع ومحتواه، وقواعده في `docs/IMPORT_EXPORT.md`. المعالج يعرض مكوّن الاستيراد فقط.
- إرسال البريد بالدعوة. الرابط يُعرض، ولا يُرسل المعالج أي رسالة (البند 8.7).
- إلغاء دعوة أو إعادة إرسالها. لا توجد إجراءات لذلك (عيب «دعوة معلقة لا تُلغى ولا تنتهي» في البند 8).
- إنشاء أكثر من شركة من المعالج. الواجهة تخفي النموذج بعد وجود شركة، والخادم لا يمنع ذلك (البند 8.6).

**المصادر:** `client/src/pages/SetupWizard.tsx` (171 سطرًا)، و`client/src/pages/SetupWizard.interaction.test.tsx` (5 اختبارات)، و`client/src/pages/ProjectImports.tsx`، و`client/src/App.tsx`، و`server/routers.ts` (المجموعات `selfService`، و`projects`، و`dataImports`، و`tenant`)، و`server/db.ts` (`createSelfServiceTenant`، و`createProjectForTenant`، و`createMembershipInvitation`، و`acceptMembershipInvitation`، و`getTenantAdministration`)، و`server/domain/operationalRoles.ts`، و`shared/importPermissions.ts`، و`shared/projectErrors.ts`.

**الإجراءات التي يستدعيها المعالج:**

| الخطوة | الإجراء (`trpc.…`) | النوع | الدالة في الخادم |
|---|---|---|---|
| 1 | `selfService.plans` | استعلام | `getPublicCommercialPlans` |
| 1 | `selfService.signup` | تعديل | `createSelfServiceTenant` |
| 1، 2 | `tenant.mine` | استعلام | `listTenantsForUser` |
| 2 | `projects.list` | استعلام | `listProjectsForTenant` |
| 2 | `projects.create` | تعديل | `createProjectForTenant` |
| 3 | `dataImports.list`، و`detail`، و`analyze`، و`reanalyze`، و`confirm` | استعلام وتعديل | دوال `server/domain/dataImport.ts` ومكوّن `ProjectImports` |
| 4 | `tenant.administration` | استعلام يكتب (انظر البند 8) | `getTenantAdministration` |
| 4 | `tenant.createInvitation` | تعديل | `createMembershipInvitation` |
| 4 (من رابط الدعوة) | `tenant.acceptInvitation` | تعديل | `acceptMembershipInvitation` |

## 2. الجداول والحقول والقيود

الجداول التي تكتبها الخطوات الأربع. كل جدول عمل يحمل `tenantId`، وجداول المشروع تحمل `projectId` أيضًا.

### 2.1 `companies` (الخطوة 1)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `legalName` | varchar(255) | لا | — | الاسم القانوني من الحقل الأول |
| `slug` | varchar(120) | لا | — | المعرّف من الحروف اللاتينية الصغيرة والأرقام والشرطات. UNIQUE `companies_slug_unique` |
| `status` | mysqlEnum(`active`، `suspended`، `archived`) | لا | `active` | يُكتب `active` |
| `defaultLocale` | mysqlEnum(`ar`، `en`) | لا | `ar` | يُكتب `ar` |
| `createdAt` / `updatedAt` | timestamp | لا | الآن | |

### 2.2 `subscriptions` و`tenant_licenses` و`tenant_entitlements` (الخطوة 1)

- `subscriptions`: `id` وَ`tenantId` (FK ← `companies.id`)، و`packageCode` (mysqlEnum من `subscriptionPackageCodes`) مأخوذ من الخطة، و`status` = `trialing`، و`startsAt` = الآن، و`endsAt` فارغ. INDEX `subscriptions_tenant_status_idx`.
- `tenant_licenses`: `id`، و`tenantId`، و`subscriptionId` (UNIQUE `tenant_licenses_subscription_unique`)، و`planId` (FK ← `commercial_plans`)، و`status` = `trialing`، و`seats` = المقاعد المُدخلة (من 1 إلى 100000)، و`priceAmount` = 0، و`discountAmount` = 0، و`manualActivation` = `false`، و`startsAt` = الآن، و`trialEndsAt` = الآن + 14 يومًا، و`createdByUserId` = المنشئ.
- `tenant_entitlements`: صف لكل منتج في الباقة (`productsForPackage`) بالأعمدة `id`، و`tenantId`، و`subscriptionId`، و`productCode`، و`active` = `true`، و`startsAt`.

### 2.3 `memberships` و`roles` و`role_permissions` و`membership_roles` (الخطوة 1)

- `memberships`: صف لمنشئ الشركة بحالة `active` و`joinedAt` = الآن. UNIQUE `memberships_tenant_user_unique` على (`tenantId`, `userId`).
- `roles`: دور `TENANT_OWNER` بـ`systemManaged = true`، ويُنشأ مع الشركة في المعاملة نفسها. UNIQUE `roles_tenant_code_unique` على (`tenantId`, `code`).
- `role_permissions`: يربط `TENANT_OWNER` بكل صلاحيات الكتالوج (`allCatalogPermissions`).
- `membership_roles`: صف يربط العضوية بدور المالك بنطاق `company`.

### 2.4 `self_service_signup_attempts` (الخطوة 1)

صف لكل محاولة إنشاء: `id`، و`userId`، و`emailHash`، و`createdAt`. يُقرأ منها عدد المحاولات في آخر 24 ساعة للحد (3 محاولات).

### 2.5 `projects` (الخطوة 2)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `code` | varchar(80) | لا | — | UNIQUE `projects_tenant_code_unique` على (`tenantId`, `code`) |
| `name` | varchar(255) | لا | — | |
| `projectType` | varchar(120) | لا | — | يملؤه المعالج بـ«إنشاءات» إن لم يُغيَّر |
| `currency` | varchar(3) | لا | `USD` في المخطط | يُكتب كما أدخله المستخدم، والمعالج يفترض `SAR` |
| `status` | mysqlEnum(`draft`، `active`، `on_hold`، `closed`، `cancelled`) | لا | `draft` | يُكتب `draft` |
| `lifecycleStage` | mysqlEnum (13 مرحلة) | لا | `planning` | لا يكتبه المعالج |

### 2.6 `membership_invitations` (الخطوة 4)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `email` | varchar(320) | لا | — | يُحفظ بعد `trim` وتحويل إلى أحرف صغيرة |
| `roleId` | varchar(36) | لا | — | FK ← `roles.id` |
| `scopeType` | mysqlEnum(`company`، `portfolio`، `program`، `project`) | لا | — | |
| `scopeId` | varchar(36) | نعم | — | فارغ للشركة كلها |
| `tokenHash` | varchar(64) | لا | — | SHA-256 للرمز. الرمز نفسه لا يُخزَّن. UNIQUE `membership_invitations_token_hash_unique` |
| `status` | mysqlEnum(`pending`، `accepted`، `expired`، `revoked`) | لا | `pending` | `expired` و`revoked` لا يضبطهما أي كود (انظر عيب الدعوة المعلقة في البند 8) |
| `invitedByUserId` | int | لا | — | FK ← `users.id` |
| `acceptedByUserId` | int | نعم | — | FK ← `users.id` |
| `expiresAt` | timestamp | لا | الآن + 7 أيام | |
| `acceptedAt` | timestamp | نعم | — | |
| `createdAt` / `updatedAt` | timestamp | لا | الآن | |

- INDEX `membership_invitations_tenant_email_status_idx` على (`tenantId`, `email`, `status`)، وINDEX `membership_invitations_email_status_idx` على (`email`, `status`).

**القبول (`acceptMembershipInvitation`):** يتحقق من انتهاء `expiresAt` ومن تطابق البريد. عند النجاح يُنشأ صف `memberships` بحالة `active`، وصف `membership_roles` بالدور والنطاق المحفوظين، ويصبح صف الدعوة `accepted`.

### 2.7 صفوف التدقيق

| الإجراء (`action`) | `entityType` | المرحلة |
|---|---|---|
| `self_service.tenant_created` | `company` | الخطوة 1، في المعاملة نفسها |
| `project.created` | `project` | الخطوة 2، في المعاملة نفسها |
| `tenant.member_invited` | `membership_invitation` | الخطوة 4 |
| `tenant.invitation_accepted` | `membership_invitation` | قبول الدعوة |

**فجوة:** `tenant.administration` يثبّت الأدوار الجاهزة (`ensureTenantOperationalRoles`) دون صف تدقيق، وكذلك الصلاحيات والأدوار التي يحتاجها. انظر البند 8.

## 3. الشاشات

**المعالج:** صفحة واحدة بأربع خطوات، بعنوان «معالج الإعداد لأول شركة»، ومعالجة بالعربية والإنجليزية (`isArabic`). شريط الخطوات أعلاه، وكل خطوة في قسم `SectionErrorBoundary` مستقل. العودة إلى مساحة العمل من الرابط العلوي.

| الخطوة | من يراها | ما تفعله | الحالة الفارغة أو التحميل |
|---|---|---|---|
| 1. الشركة | كل مستخدم مسجل دخوله بعنوان التحقق من البريد | تختار خطة من `selfService.plans`، وتكتب الاسم القانوني والمعرّف والمقاعد، ثم «إنشاء الشركة». بعد النجاح تنتقل إلى `/setup/{tenantId}#project` | تحميل الخطط: «جارٍ التحميل…». بلا خطط: الخيار الأول يقول «اختر خطة» ولا يُرسل النموذج |
| 1. الشركة (شركة قائمة) | مستخدم له شركة أو أكثر | تختار شركة من قائمة، ويظهر إقرار بأنها أُنشئت. النموذج مخفي | — |
| 2. أول مشروع | من يحمل `project.manage` في الواجهة (انظر البند 4) | يعرض المشاريع القائمة مع زر «اعتمد هذا المشروع»، وينشئ مشروعًا بالرمز والاسم والنوع والعملة. يعتمد المشروع الوحيد تلقائيًا | نص «لا مشروع بعد: أنشئ أول مشروع.» |
| 3. الاستيراد | من يملك صلاحية الوحدة المختارة (انظر البند 4) | يعرض مكوّن `ProjectImports` للمشروع المختار. زر «تخطَّ هذه الخطوة الآن» يذهب إلى الدعوة | رسالة `role="status"`: «اختر المشروع في الخطوة السابقة أولًا.» |
| 4. دعوة الفريق | من يحمل `tenant.manage` ومنتج EXECUTIVE (انظر البند 4) | يختار بريدًا ودورًا من الأدوار الجاهزة بلا مالك، ونطاقًا (المشروع الأول افتراضيًا). يعرض بطاقة الغرض والتركيز والحد الفاصل للدور، ويعرض الرابط مرة واحدة مع قائمة «دعوات هذه الجلسة» | «لا أدوار متاحة.» عند عدم تحميل الأدوار. «اختر المشروع أولًا.» عند عدم اختيار مشروع |
| 4. الإنهاء | — | رابط «إنهاء الإعداد والانتقال إلى المشروع» إلى `/projects/{tenantId}/{projectId}/controls` | بلا مشروع: نص «اختر المشروع أولًا.» |

**القاعدة في الشريط:** الخطوات 2 إلى 4 تُفتح بمعرّف الشركة في المسار فقط. زر «التالي» بعد الشركة والمشروع يُعطَّل حتى يكتمل الشرط. الاستيراد والدعوة لا يُعلَّمان مكتملين أبدًا (انظر البند 8).

**الأخطاء:** تظهر في `role="alert"` عبر `getLocalizedProjectError`. تحميل الشركات والمشاريع والخطط يظهر في `SourceNotice`.

## 4. الصلاحيات

| الإجراء | ما يُفحص في الخادم | ما تُظهره الواجهة | ملاحظة |
|---|---|---|---|
| إنشاء الشركة | مستخدم مسجل بعنوان بريد تحقق بطريقة `email` أو `google` (`VERIFIED_LOGIN_METHODS` في `createSelfServiceTenant`)، وخطة فعالة، ومعرّف غير مستعمل، وأقل من 3 محاولات في 24 ساعة | النموذج بلا بوابة صلاحيات | لا رمز صلاحية. الشرط هو التحقق من البريد |
| قراءة الخطط | مستخدم مسجل (`protectedProcedure`) | القائمة | — |
| قراءة المشاريع | `project.read` في المنتج `PROJECT` | القائمة | `listProjectsForTenant` |
| إنشاء المشروع | `project.write` في المنتج `PROJECT`، وحد المشاريع في الترخيص | `WriteGate permission="project.manage"` | **عدم تطابق**: الخادم يطلب `project.write`، والواجهة تطلب `project.manage` (انظر البند 8) |
| الاستيراد | صلاحية الوحدة المختارة من `importModulePermissions` في `shared/importPermissions.ts`: `wbs`: `project.wbs.manage`؛ و`budget`: `project.budget.manage`؛ و`contracts`: `project.commitment.manage`؛ و`materials`: `project.procurement.manage` أو `project.inventory.manage`؛ و`openingBalances`: `project.inventory.manage`؛ و`schedule`: `project.schedule.manage` أو `project.wbs.manage` | رفع الملفات لا يظهر إلا لمن يحمل الصلاحية | الوحدات الأخرى تُحكم بـ`anyImportPermission` (`server/db.ts`) |
| قراءة الأدوار الجاهزة وتثبيتها | `tenant.manage` مع منتج `EXECUTIVE` (`assertTenantManager`) | `WriteGate permission="tenant.manage"` للنموذج، وتحميل القائمة بلا بوابة | القراءة تكتب (البند 8) |
| إنشاء الدعوة | `tenant.manage` مع منتج `EXECUTIVE`، والدور للشركة نفسها، ومنتج الدور مرخّص، والنطاق يتبع الشركة، وعدم وجود عضوية أو دعوة معلقة، ومقعد متاح | `WriteGate permission="tenant.manage"` | لا يُرفض `TENANT_OWNER` بالخادم (البند 8) |
| قبول الدعوة | مستخدم مسجل بالبريد نفسه المسجل في الدعوة، وألا تكون عضوية قائمة، والدعوة غير منتهية، ومقعد متاح | صفحة القبول (خارج المعالج) | لا صلاحية مسماة |

**الأدوار الجاهزة التي تُعرض في الخطوة 4:** كل ما في `operationalRoleDefinitions` ما عدا `TENANT_OWNER` (المعالج يصفّيه بـ`roles.filter`). انظر `docs/specs/ROLE_TEMPLATES.md` لصلاحياتها.

**رموز جديدة:** لا يلزم رمز صلاحية جديد للمعالج. تغيير بوابة إنشاء المشروع يحتاج قرار المالك (البند 8.2).

## 5. حالات الرفض

الرسالة المعروضة هي المعرّبة من `shared/projectErrors.ts` عبر `getLocalizedProjectError`. الأخطاء العامة للصلاحية والمنتج تُحوَّل كما في `docs/specs/TENDERING.md` البند 5.

| # | الخطوة | الحالة | رمز tRPC | الرمز المعرّب | ما يراه المستخدم |
|---|---|---|---|---|---|
| 1 | 1 | بريد المستخدم غير موجود | FORBIDDEN | `PROJECT_OS_SIGNUP_EMAIL_REQUIRED` | رسالة البريد المطلوب |
| 2 | 1 | البريد غير متحقق منه | FORBIDDEN | `PROJECT_OS_SIGNUP_EMAIL_NOT_VERIFIED` | رسالة التحقق |
| 3 | 1 | الخطة غير موجودة أو غير فعالة | NOT_FOUND | `PROJECT_OS_COMMERCIAL_PLAN_NOT_FOUND` | رسالة الخطة |
| 4 | 1 | معرّف الشركة مستعمل | CONFLICT | `PROJECT_OS_WORKSPACE_SLUG_EXISTS` | رسالة المعرّف المستعمل |
| 5 | 1 | أكثر من 3 محاولات في 24 ساعة | TOO_MANY_REQUESTS | `PROJECT_OS_SIGNUP_RATE_LIMITED` | رسالة الحد |
| 6 | 1 | المقاعد خارج المدى 1 إلى 100000 | BAD_REQUEST | `PROJECT_OS_REQUEST_FAILED` | «تعذر إتمام الطلب. تحقق من البيانات» |
| 7 | 1 | فشل غير متوقع في المعاملة | INTERNAL_SERVER_ERROR | `PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE` | رسالة الخدمة غير المتاحة |
| 8 | 2 | مستخدم بلا `project.write` | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` | التنبيه بعد الإرسال، وقبله نص `WriteGate` لمن لا يحمل `project.manage` |
| 9 | 2 | الترخيص لا يتيح المشاريع | FORBIDDEN | `PROJECT_OS_LICENSE_FEATURE_NOT_AVAILABLE` | رسالة الترخيص |
| 10 | 2 | بلوغ حد المشاريع في الترخيص | FORBIDDEN | `PROJECT_OS_LICENSE_LIMIT_EXCEEDED` | رسالة الحد |
| 11 | 2 | رمز مشروع مكرر | INTERNAL_SERVER_ERROR (لا يُعالج) | `PROJECT_OS_SERVER_ERROR` بعد التحويل | «خطأ في الخادم» بدل رفض صريح (انظر البند 8) |
| 12 | 3 | ملف غير صالح، أو صيغة غير مدعومة (من مخطط المسار) | BAD_REQUEST | `PROJECT_OS_IMPORT_FILE_INVALID`، و`PROJECT_OS_IMPORT_FORMAT_INVALID` | رسالة الملف |
| 13 | 3 | الوحدة غير معروفة، أو الملف غير متاح | BAD_REQUEST | `PROJECT_OS_IMPORT_MODULE_INVALID`، و`PROJECT_OS_IMPORT_FILE_UNAVAILABLE` | رسالة الوحدة أو الملف |
| 14 | 3 | التحقق يرفض الصفوف | BAD_REQUEST | `PROJECT_OS_IMPORT_VALIDATION_FAILED` | رسالة الصفوف المرفوضة |
| 15 | 3 | تكرار مكتشف | CONFLICT | `PROJECT_OS_IMPORT_DUPLICATE_DETECTED` | رسالة التكرار |
| 16 | 3 | تأكيد استيراد لم يُحلَّل بعد | BAD_REQUEST | `PROJECT_OS_IMPORT_NOT_CONFIRMABLE` | رسالة عدم الجاهزية |
| 17 | 3 | حجم الطلب يتجاوز الحد (HTTP 413 من طبقة الخادم، وليس من إجراء tRPC) | — | `PROJECT_OS_REQUEST_TOO_LARGE` | رسالة الحجم |
| 18 | 4 | الدعوة لدور من منتج غير مرخّص، أو المعالج يعمل بلا `EXECUTIVE` | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة عدم الترخيص، وتظهر في تنبيه الخطوة 4 |
| 19 | 4 | المستخدم بلا `tenant.manage` | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` | نص `WriteGate` للنموذج |
| 20 | 4 | الدور ليس للشركة | NOT_FOUND | `PROJECT_OS_ROLE_NOT_FOUND` | رسالة الدور |
| 21 | 4 | البريد عضو قائم في الشركة | CONFLICT | `PROJECT_OS_MEMBER_ALREADY_EXISTS` | رسالة العضوية القائمة |
| 22 | 4 | دعوة معلقة للبريد نفسه، ولو منتهية زمنيًا | CONFLICT | `PROJECT_OS_INVITATION_ALREADY_PENDING` | رسالة الدعوة المعلقة. لا خيار لإلغائها (البند 8) |
| 23 | 4 | لا مقعد متاح (الدعوات المعلقة تحجز مقاعد) | FORBIDDEN | `PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED` | رسالة المقاعد |
| 24 | 4 | نطاق لا يتبع الشركة، أو معرّف نطاق مع نطاق الشركة كله | BAD_REQUEST أو NOT_FOUND | `PROJECT_OS_INVALID_SCOPE` | رسالة النطاق |
| 25 | القبول | الدعوة غير موجودة، أو انتهت مدتها (`expiresAt`) | NOT_FOUND | `PROJECT_OS_INVITATION_INVALID_OR_EXPIRED` | رسالة الدعوة المنتهية |
| 26 | القبول | بريد الحساب غير بريد الدعوة | FORBIDDEN | `PROJECT_OS_INVITATION_EMAIL_MISMATCH` | رسالة البريد |
| 27 | القبول | العضوية موجودة | CONFLICT | `PROJECT_OS_MEMBER_ALREADY_EXISTS` | رسالة العضوية |

## 6. معايير القبول

1. الخطوات تُعرض بالترتيب: الشركة، ثم المشروع، ثم الاستيراد، ثم الدعوة. الانتقال إلى خطوة تتطلب ما قبلها يُعطَّل بوضوح.
2. إنشاء الشركة بخطة ومقاعد يكتب الصفوف في الجداول المذكورة في البند 2.1 إلى 2.4 في معاملة واحدة، ويكتب `self_service.tenant_created`. عند فشل أي صف لا يبقى أي صف.
3. لا تُنشأ شركة ثانية بالمعرّف نفسه، وتُرفض المحاولة بـ`PROJECT_OS_WORKSPACE_SLUG_EXISTS`.
4. المحاولة الرابعة في 24 ساعة تُرفض بـ`PROJECT_OS_SIGNUP_RATE_LIMITED`، ولا يُنشأ صف في الجداول بعدها.
5. إنشاء المشروع يطلب `project.write` على الخادم. المستخدم الذي يملك `project.manage` فقط يرى قرارًا واضحًا، لا نموذجًا يفشل بعد الإرسال. (المطلوب بعد قرار البند 8.2.)
6. مشروع بالرمز نفسه في الشركة نفسها يُرفض برسالة مكرر صريحة، لا برسالة خادم عامة (البند 8).
7. بعد إنشاء المشروع يُعتمد تلقائيًا إن كان الوحيد، وتُعرض قائمة المشاريع القائمة مع زر الاعتماد.
8. الاستيراد يعمل بمكوّن `ProjectImports` للمشروع المختار، ويُخطى دون أن يتأثر ما بعده.
9. زر «تخطَّ هذه الخطوة الآن» ينقل إلى الدعوة دون أي كتابة.
10. الدعوة تكتب `membership_invitations` بالتجزئة SHA-256 للرمز، ولا يُخزَّن الرمز نفسه. الرابط يُعرض مرة واحدة، ويحمل الرمز في `/invite/accept?token=`.
11. الدعوة للدور المختار بالنطاق المختار: المشروع الأول افتراضيًا، والشركة كلها بقرار صريح.
12. الدور الذي يحمله `TENANT_OWNER` لا يُعرض في القائمة، ولا يُرسل من المعالج (ما تُثبته الواجهة اليوم. الخادم يحتاج قرار البند 8.4).
13. بطاقة الدور تعرض الغرض والتركيز والحد الفاصل بالعربية والإنجليزية.
14. الإنهاء يرسل إلى `/projects/{tenantId}/{projectId}/controls` للمشروع المعتمد، وبلا مشروع يُعطّل الرابط ويقول السبب.
15. قبول الدعوة بالبريد نفسه يكتب `memberships` و`membership_roles` بالدور والنطاق المحفوظين، ويصبح الصف `accepted`، ويكتب `tenant.invitation_accepted`.
16. دعوة لبريد له دعوة معلقة (حتى المنتهية زمنيًا) تُرفض بـ`PROJECT_OS_INVITATION_ALREADY_PENDING`، وتنتهي المشكلة بعد إصلاح عيب الدعوة المعلقة في البند 8.
17. إعادة تحميل الصفحة تُبقي الخطوة من الرابط، وتعيد المشروع المعتمد عند وجود مشروع واحد فقط. مع أكثر من مشروع يختار المستخدم من جديد (البند 8).
18. كل عنصر بالعربية والإنجليزية، ولا تظهر رسالة خام من الخادم.

## 7. الاختبارات المطلوبة

**اختبارات واجهة (موجودة):** `client/src/pages/SetupWizard.interaction.test.tsx` (5 اختبارات):
- الخطوة 1: إنشاء الشركة بالخطة والمقاعد، ثم الانتقال إلى `#project`، وزر «التالي» معطّل قبل الشركة.
- الخطوة 2: إنشاء المشروع داخل الشركة المختارة، وعرض المشاريع القائمة.
- الخطوة 3: طلب اختيار المشروع أولًا، ثم عرض المكوّن للمشروع، وزر التخطي.
- الخطوة 4: قائمة الأدوار بلا `TENANT_OWNER`، وبطاقة الحدود، والدعوة بنطاق المشروع الافتراضي، ورابط الإنهاء.
- الإنجليزية والنطاق على الشركة كلها بقرار صريح.

**اختبارات واجهة مطلوبة:**
- مستخدم يحمل `project.manage` دون `project.write`: يرى النموذج أو نصًا يشرح ذلك، حسب القرار في البند 8.2.
- الخطة `PROJECT_STANDARD` (بلا `EXECUTIVE`): تظهر في الخطوة 4 رسالة `PROJECT_OS_PRODUCT_NOT_ENTITLED` بالنص المعرّب، ولا تتعطل الخطوة.
- زر «إنهاء» بلا مشروع معطّل مع نص السبب.
- إعادة التحميل على الخطوة 4 تعيد الخطوة من الرابط، وتطلب اختيار المشروع إن وُجد أكثر من واحد.

**اختبارات تكامل قاعدة البيانات (على `project_os_integration_test` فقط):**
- المرتبطة الموجودة: `server/integration.database.test.ts` (يغطي إدارة الأدوار والعضويات، واختبار «governs tenant role and membership administration with scope and self-privilege guards»).
- المطلوب: إنشاء الشركة يكتب الصفوف كلها في معاملة واحدة، ويفشل كله عند فشل أي صف (مثلًا بمعرّف مكرر في الصف الأخير).
- المطلوب: المحاولة الرابعة في 24 ساعة تُرفض بـ`PROJECT_OS_SIGNUP_RATE_LIMITED` دون صف.
- المطلوب: البريد غير المتحقق منه يُرفض بـ`PROJECT_OS_SIGNUP_EMAIL_NOT_VERIFIED`.
- المطلوب: رمز مشروع مكرر يُرفض بالرسالة الصريحة بعد الإصلاح (البند 8).
- المطلوب: دعوة لدور من منتج غير مرخّص تُرفض، ودعوة بريد له دعوة منتهية تُرفض بعد الإصلاح (عيب الدعوة المعلقة في البند 8).
- المطلوب: `tenant.administration` يسجل صف تدقيق لتثبيت الأدوار بعد الإصلاح (عيب تثبيت الأدوار دون تدقيق في البند 8).
- القاعدة: بيانات الاختبار أمثلة مُختلقة مثل `new.user@example.test`. لا بريد حقيقي، ولا اسم شركة حقيقي (`docs/PILOT_DATA_POLICY.md`).

## 8. مخاطر وأسئلة مفتوحة

**قرارات المالك (BLOCKED_BY_OWNER، لا تُفترض):**
1. **المحرك.** نفس قرار `docs/specs/TENDERING.md` البند 8.1.
2. **من يُنشئ المشروع.** الخادم يطلب `project.write`، وهو لا يحمله إلا المالك ودور مخصص، ولا يحمله أي قالب جاهز (انظر `docs/specs/ROLE_TEMPLATES.md`). الواجهة تطلب `project.manage`، وهو في قالب `PROJECT_MANAGER`. إن بقي الخادم على `project.write` فيُعدَّل شرط الواجهة، وإن نُقل الخادم إلى `project.manage` فيُعدَّل الخادم وتُحدَّث `governedActionPermissions` والاختبارات. القرار للمالك.
3. **منتج `EXECUTIVE` للدعوات وإدارة الأدوار.** `assertTenantManager` يطلب `EXECUTIVE`، والباقات `PROJECT` و`PMO` و`PMO + PROJECT` لا تحمله. مالك شركة اشترى `PROJECT` وحده لا يستطيع إكمال الخطوة 4، ولا قائمة الأدوار. هل هذا مقصود بالباقة؟
4. **دعوة `TENANT_OWNER`.** الخادم يقبل دعوة بدور المالك، والواجهة تخفيه فقط. هل يُمنع ذلك في الخادم، أم يُسمح لمدير الشركة بتعيين مالك مشترك؟
5. **التجربة والأسعار والمقاعد.** مدة التجربة 14 يومًا، والسعر 0، والمقاعد الافتراضية 5 في الواجهة. هذه قرارات تجارية (`CLAUDE.md` §6: الأسعار والخطة) تُسجَّل `BLOCKED_BY_OWNER` ولا تُفترض.
6. **عدد الشركات لكل حساب.** الواجهة تخفي نموذج إنشاء الشركة بعد وجود شركة، والخادم لا يحد عدد الشركات لكل مستخدم. هل يُسمح بشركات متعددة للحساب الواحد؟
7. **مزود البريد لإرسال الدعوة.** المعالج يعرض الرابط فقط. إرسال البريد يحتاج قرار المالك (`CLAUDE.md` §6: مزود البريد)، ولا يُفترض.
8. **الاستيراد قبل الدعوة.** الواجهة تسمح بتخطي الاستيراد والدعوة قبل أي بيانات. هل يُطلب ترتيب آخر؟

**عيوب في الكود (OPEN):**
- **دعوة معلقة لا تُلغى ولا تنتهي.** الفحص في `createMembershipInvitation` يبحث عن `status = pending` دون النظر إلى `expiresAt`، ولا يوجد كود يضبط `expired` أو `revoked` على الدعوات، ولا يوجد إجراء لإلغاء دعوة أو إعادة إرسالها. النتيجة: دعوة أخطأ فيها المستخدم في البريد تمنع دعوة جديدة لذلك البريد، وتحجز مقعدًا (`assertTenantSeatAvailability` يعد الدعوات المعلقة)، إلى الأبد. الإصلاح: إجراء إلغاء دعوة بصلاحية `tenant.manage`، وشرط `expiresAt` في فحص التكرار مع تحديث الحالة إلى `expired`.
- **رمز مشروع مكرر يصل كخطأ خادم.** `createProjectForTenant` لا يعالج خطأ التكرار (بخلاف `createSelfServiceTenant`)، فيصل إلى الواجهة رسالة خادم عامة. الإصلاح: رمز `PROJECT_OS_PROJECT_DUPLICATE` (CONFLICT، مقترح) يُضاف إلى `shared/projectErrors.ts`.
- **`tenant.administration` يكتب دون تدقيق.** تثبيت الأدوار الجاهزة يحدث داخل استعلام قراءة، وهو يحتاج صف تدقيق أو نقلًا إلى إنشاء الشركة.
- **أعلام الاكتمال كاذبة.** `complete.import` و`complete.invite` ثابتتان على `false` في `client/src/pages/SetupWizard.tsx`، والنص «كل خطوة تُحفظ فور إتمامها» لا يصح للاستيراد والدعوة، لأنهما لا تحفظان حالة إكمال.
- **اختيار المشروع لا يُحفظ.** `projectId` حالة في الذاكرة، وتُختار تلقائيًا إن وُجد مشروع واحد. مع أكثر من مشروع، إعادة التحميل تُسقط الاختيار، والخطوة وحدها تُحفظ في عنوان الصفحة.
- **شاشة الدعوة تعرض الرابط مرة واحدة**، ولا توجد قائمة بالدعوات المعلقة في المعالج، فإن أُغلقت الصفحة يضيع الرابط، ولا يمكن استرجاعه لأن الخادم يخزن التجزئة فقط.
- **الحالة `expired`** لا تُستعمل، و`status` للدعوة لا يدل على الانتهاء الفعلي (انظر عيب الدعوة المعلقة أعلاه).

**مخاطر تشغيلية:**
- الترخيص يُكتب بسعر 0 ومدة تجربة 14 يومًا. انتهاء التجربة يُحسب في `server/db.ts` (المتغير `trialExpired`) ويحوّل الترخيص إلى `expired`. هذا المسار خارج نطاق المعالج، ويجب التحقق منه قبل أي استخدام تجريبي.
- `signup` يكتب صفوف الترخيص والاشتراك حتى لو لم يُكمل المستخدم الخطوات التالية. الشركة الفارغة تبقى بلا مشروع، وهذا مقصود، لكنه يحتاج تنظيفًا أو تأكيدًا من المالك.
