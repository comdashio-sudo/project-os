# مواصفة قوالب الأدوار الجاهزة (ROLE_TEMPLATES) بمصطلحات PostgreSQL

**الحالة:** WRITTEN (مواصفة). لا تغيّر هذه الوثيقة أي صف في `docs/STATE.md`، ولا تُعد دليل `PROVEN`، ولم يُشغَّل أي اختبار على قاعدة بيانات. حُدِّثت في 22 أكتوبر 2026 بقرارات المالك المسجّلة بوسم `WRITTEN`.

**المرجع:** الكود عند `c59fc5c` (الفرع `main`)، وهو مطابق عند `36d3a15` في `server/domain/operationalRoles.ts` و`server/db.ts` (لا فرق بين الالتزامين فيهما). خط الأساس PostgreSQL على `origin/feat/postgres-migration`: `drizzle/0000_baseline.sql`، و`drizzle/schema.ts`، و`docs/ADR-0002-POSTGRES-SUPABASE-VERCEL.md`. قرار الانتقال: `docs/STATE.md` قسم «قرار المالك: الانتقال إلى PostgreSQL». القرارات المدمجة هنا: `docs/AFTER_MIGRATION.md` البنود R-1 وR-2 وR-3 وU-2 وS-7 وT-1 (قرار المالك، 22 أكتوبر 2026). بند W-1 يُلغى في آليته بالقرار 6 (انظر 8.2).

**الوسوم:** `PROPOSED` شيء غير موجود في الكود اليوم. `AFTER_MIGRATION` تغيير خادم أو قاعدة يبنيه الوكيل 1 بعد النقل. `BLOCKED_BY_OWNER` قرار لم يُحسم ولا يُفترض. `WRITTEN` قرار مسجّل للمالك (قرار المالك، 22 أكتوبر 2026) لم يُبنَ بعد، ويُذكر بجانبه البناء المطلوب.

## 1. الهدف والنطاق

**الهدف:** تعريف القوالب الجاهزة التي تحصل عليها كل شركة، وما يمنحه كل قالب بالضبط، وكيف تُرقّى القوالب دون أن تكتب فوق تعديلات المستأجر، وقواعد فصل المهام التي تحكم تركيبها. القالب يصف ما يفعله حامله، ونطاق المستأجر والمشروع يفرضه الخادم وحده (`CLAUDE.md` §4).

**في النطاق:**
- القوالب السبعة عشر كلها في `operationalRoleDefinitions` (`server/domain/operationalRoles.ts`): عشرة قبل أمر العمل 5 (منها `PROJECT_MANAGER`)، وسبعة بعده (`EXECUTIVE`، `PMO_LEAD`، `COST_CONTROLLER`، `PROJECT_COORDINATOR`، `DESIGN_COORDINATOR_ARCHITECTURAL`، `DESIGN_COORDINATOR_TECHNICAL`، `CONTRACTS_MANAGER`). أُضيفت السبعة بالالتزام `c2eb303`. يُضاف `TENDER_OFFICER` (مقترح، القرار 1)، فيصبح العدد 18 بعد البناء. النسخة السابقة من هذه المواصفة غطّت ثمانية قوالب فقط؛ الترقية بالإصدارات (R-1) تسري على كل قالب نظامي، لذلك تغطي هذه النسخة الكل.
- الجداول والقيود المقترحة للإصدارات والتجاوزات والدفعات (البند 2).
- الشاشات التي تعرض القوالب أو تكتب بها (البند 3).
- المصفوفة الكاملة للقوالب مقابل رموز الصلاحيات، ومنها الرموز المقترحة (البند 4).
- قواعد الفصل بين المهام، وحالات الرفض، ومعايير القبول، والاختبارات (البنود 4 و5 و6 و7).

**خارج النطاق:**
- الدور `TENANT_OWNER`: يحمل كل رموز الكتالوج بالتعريف (`ensureTenantOperationalRoles` في `server/db.ts`)، وليس قالبًا. هل يُدعى كدور في الدعوات: `BLOCKED_BY_OWNER` (البند 8).
- المناقصات: `docs/specs/TENDERING.md`. التنسيق الفني والمعماري: `docs/specs/DESIGN_COORDINATION.md`. معالج الإعداد والدعوات: `docs/specs/ONBOARDING_WIZARD.md`. تذكر هذه الوثيقة منها الصلاحيات التي تعتمد عليها فقط.
- نقل البيانات من MySQL وتنفيذ الترحيل نفسه (الوكيل 1، `AFTER_MIGRATION` G-3).
- المرحلة B من PMC فما بعدها (لا تبدأ دون أمر صريح من المالك).
- الأسعار والتجربة والمقاعد: `BLOCKED_BY_OWNER`، ولا تُكتب هنا.

## 2. الجداول والحقول والقيود

**قاعدة الأنواع (قرار المالك، 22 أكتوبر 2026، `WRITTEN`):** نوع المعرّف يبقى `varchar(36)` كما في خط الأساس `drizzle/0000_baseline.sql`، فكل المعرّفات مثل `companies.id` و`roles.id` و`projects.id` من هذا النوع، ومعرّف المستخدم `integer` (`users.id`). الجداول الجديدة تستعمل الأنواع نفسها، ولا يُغيَّر خط الأساس إلى `uuid` في هذه المواصفة. لم يعد هذا بندًا مفتوحًا، ويبقى توثيقه في `docs/DECISIONS.md` لسجل التدقيق (AM-8، البند 8.3).

القوالب ليست جدولًا؛ تعريفها في الكود. تُضاف ثلاثة جداول `PROPOSED`: `role_template_versions` (عام)، و`tenant_role_overrides` (لكل شركة)، و`project_payments` (لكل شركة ومشروع، ويُستعمل للفصل بين المُعِدّ والمعتمِد).

**الجداول الموجودة تُستعمل كما هي** (`drizzle/schema.ts` على الفرع): `companies` (`id`)، و`users` (`id` integer)، و`roles` (`tenant_id` FK، و`code` varchar(80)، و`product_code` من التعداد `roles_product_code`، و`system_managed` boolean، وUNIQUE `roles_tenant_code_unique` على (`tenant_id`, `code`))، و`permissions` (`code` فريد بالفهرس `permissions_code_unique`)، و`role_permissions` (مفتاح مركّب (`role_id`, `permission_id`))، و`membership_roles`، و`memberships`، و`audit_logs`.

### 2.1 `role_template_versions` (PROPOSED)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `role_code` | varchar(80) | لا | — | رمز القالب، مثل `PLANNING_ENGINEER` |
| `template_version` | integer | لا | — | يبدأ من 1 ويزيد بواحد لكل نشر |
| `product_code` | `roles_product_code` | نعم | — | المنتج كما في `productCode` (والافتراضي `PROJECT`) |
| `permission_codes` | text[] | لا | — | مرتبة وبلا تكرار؛ كل رمز موجود في `permissions.code` (يفحصه الخادم) |
| `source_ref` | text | لا | — | الالتزام الذي عرّف هذا الإصدار |
| `published_at` | timestamptz | لا | `now()` | |

- القيود: PRIMARY KEY (`id`)؛ UNIQUE (`role_code`, `template_version`)؛ CHECK (`template_version >= 1`)؛ CHECK (`role_code ~ '^[A-Z][A-Z0-9_]*$'`)؛ CHECK (`cardinality(permission_codes) >= 1`).
- لا يحمل عمود `updated_at`، والصف لا يُعدَّل أبدًا. الفهرس الفريد يكفي للبحث عن آخر إصدار.
- **فئة RLS:** جدول عام للقراءة، يكتبه النظام فقط. البنية الافتراضية للجداول العامة في `project_os_apply_conventions()` (`drizzle/0000_baseline.sql` على الفرع) تضع `USING (true) WITH CHECK (true)` فتسمح بالكتابة لأي خادم، لذلك لا يكفي إدراجه في `global_tables`. `PROPOSED`: قائمة `global_readonly_tables` تمنح `SELECT` للجميع، و`INSERT` بشرط `app_system()`، ولا تمنح `UPDATE` ولا `DELETE`، ومنح `project_os_app` لـ`SELECT, INSERT` فقط (`AM-2`).

### 2.2 `tenant_role_overrides` (PROPOSED)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenant_id` | varchar(36) | لا | — | FK ← `companies.id` |
| `role_id` | varchar(36) | لا | — | نسخة الشركة من الدور النظامي (`roles.id`، و`system_managed = true`) |
| `role_code` | varchar(80) | لا | — | رمز القالب الذي يُتجاوز |
| `base_version` | integer | لا | — | رقم الإصدار الذي بُني عليه التجاوز |
| `granted_permission_codes` | text[] | لا | `'{}'` | رموز تضيفها الشركة فوق القالب |
| `removed_permission_codes` | text[] | لا | `'{}'` | رموز تحذفها الشركة من القالب |
| `status` | text | لا | `'active'` | `active` أو `superseded` |
| `created_by_user_id` | integer | لا | — | FK ← `users.id` |
| `created_at`، `updated_at` | timestamptz | لا | `now()` | |

- القيود: PRIMARY KEY (`id`)؛ FOREIGN KEY (`tenant_id`, `role_id`) REFERENCES `roles` (`tenant_id`, `id`)، وهذا يتطلب UNIQUE (`tenant_id`, `id`) على `roles` (`AM-2`)؛ CHECK (`status` IN (`active`, `superseded`))؛ CHECK (`base_version >= 1`)؛ CHECK (NOT (`granted_permission_codes` && `removed_permission_codes`))؛ فهرس فريد جزئي على (`tenant_id`, `role_code`) WHERE `status` = `active`؛ فهرس (`tenant_id`, `role_code`).
- **التجاوز يبقى عند الترقية:** رمز حذفته الشركة يبقى محذوفًا حين يضيفه إصدار جديد، ويُعرض في الفرق بعبارة «محفوظ بتجاوز الشركة».
- **الصلاحيات الفعلية** تُكتب في `role_permissions` في المعاملة نفسها التي تحفظ التجاوز، فيبقى لقراءة الصلاحيات في `getTenantAccessSnapshot` (`server/db.ts`) جدول واحد.
- **فئة RLS:** `tenant_id`، أي سياسة `project_os_isolation` بالشرط `tenant_id = ANY(app_tenant_ids())` (`ADR-0002`).

### 2.3 `project_payments` (PROPOSED، الحد الأدنى للفصل)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenant_id` | varchar(36) | لا | — | FK ← `companies.id` |
| `project_id` | varchar(36) | لا | — | FK ← `projects.id` |
| `amount` | numeric(18,2) | لا | — | CHECK (`amount > 0`) |
| `status` | text | لا | `'prepared'` | `prepared`، `approved`، `cancelled` |
| `prepared_by_user_id` | integer | لا | — | FK ← `users.id`، من أعدّ الدفعة |
| `prepared_at` | timestamptz | لا | `now()` | |
| `approved_by_user_id` | integer | نعم | — | FK ← `users.id`، من اعتمدها |
| `approved_at` | timestamptz | نعم | — | |
| `created_at`، `updated_at` | timestamptz | لا | `now()` | |

- القيود: CHECK (`approved_by_user_id` IS NULL OR `approved_by_user_id` <> `prepared_by_user_id`)؛ CHECK ((`status` = `approved`) = (`approved_by_user_id` IS NOT NULL))؛ CHECK (`status` IN (`prepared`, `approved`, `cancelled`))؛ فهرس (`tenant_id`, `project_id`, `status`).
- الاسم `project_payments` متعمد: `payment_records` في خط الأساس هو دفع اشتراك الشركة في المنصة، وليس دفعة مشروع.
- **فئة RLS:** `tenant_id`، كما في 2.2.
- **تحذير:** لا تعرّف المواصفة كيان الدفعة نفسه (المستفيد، والمستند المصدر، والعملة). هذا `BLOCKED_BY_OWNER` (البند 8.1)، والجدول أعلاه هو الحد الأدنى لقاعدة المعِدّ والمعتمِد فقط.

### 2.4 تغييرات على الجداول الموجودة

- `roles`: UNIQUE (`tenant_id`, `id`) لتمكين المفتاح المركّب في 2.2 (`PROPOSED`، `AM-2`).
- `project_os_apply_conventions()`: قائمة `global_readonly_tables` لجدول `role_template_versions` (`PROPOSED`، `AM-2`).

### 2.5 التدقيق والموافقة على الترقية

- كل كتابة محمية تضيف صف `audit_logs` في المعاملة نفسها (`CLAUDE.md` §4). الأفعال المقترحة: `tenant.role_template_upgraded`، و`tenant.role_override_saved`، و`payment.prepared`، و`payment.approved` (`PROPOSED`).
- حماية `audit_logs` في خط الأساس: triggers تمنع UPDATE وDELETE وTRUNCATE، و`project_os_app` لا يملك إلا `SELECT, INSERT`. ولا تُوصف بأنها «غير قابلة للعبث»: من يملك الجدول يستطيع حذف الـtrigger (`ADR-0002`، الحد 2).
- **الموافقة على الترقية ليست جدولًا جديدًا.** تُسجَّل كصف تدقيق، ويُرفع `tenant_role_overrides.base_version` في المعاملة نفسها.
- **من يعتمد:** `PROPOSED` أن يشترط الخادم الدور `TENANT_OWNER` في عضوية المعتمِد، لا `tenant.manage` وحده. السبب: `tenant.manage` من منتج `EXECUTIVE`، و`createTenantRole` يسمح لأي دور مخصص من منتج `EXECUTIVE` بحمله. القالب النظامي لا يحمله (انظر المصفوفة).

## 3. الشاشات

| المسار | الملف | من يراها | الإجراءات | الحالات |
|---|---|---|---|---|
| `/tenants/:tenantId/administration` (موجودة) | `client/src/pages/TenantAdministration.tsx` | حامل `tenant.manage` (`assertTenantManager`، `server/db.ts`) | إنشاء دور مخصص (`tenant.createRole`)، وتعديل دور غير نظامي (`tenant.updateRole`)، وتعيين دور لعضو (`tenant.assignMembershipRole`)، ودعوة عضو (`tenant.createInvitation`) | التحميل: `query.isLoading` (السطر 119) يعرض الهيكل ورأس الصفحة. الخطأ: `getLocalizedProjectError` (السطر 120). الفارغ: لم أجد حالة فارغة مكتوبة لقائمة الأدوار أو الأعضاء. |
| القسم الجديد «قوالب النظام» (`PROPOSED`) | الصفحة نفسها | حامل `tenant.manage`؛ زر الموافقة لحامل `TENANT_OWNER` فقط | عرض رقم الإصدار الحالي لكل قالب، و«عرض الفرق» (مضاف ومحذوف لكل دور)، و«موافقة على الترقية»، و«تخصيص» لكل دور نظامي (يكتب `tenant_role_overrides`، لا يعدّل الدور) | التحميل: «جاري حساب الفرق…». الفارغ: «القوالب محدّثة؛ لا توجد ترقية متاحة.». الخطأ: رمز `PROJECT_OS_` المناسب من البند 5. |
| `/setup/:tenantId` (موجودة) | `client/src/pages/SetupWizard.tsx` | حامل `tenant.manage` | دعوات بقالب دور | يستبعد `TENANT_OWNER` (السطر 146: `role.code !== "TENANT_OWNER"`) إلى أن يُحسم البند 8.1. |
| المناقصات قبل الترسية (موجودة) | `client/src/pages/ProjectTenders.tsx` | حسب الصلاحية | إدخال العروض وتصحيحها وسحبها بـ`project.tender.bids` (السطور 108 و126)؛ التسوية والاستبعاد بـ`project.tender.level` (124 و127 و132)؛ الترسية بـ`project.tender.award` (143)؛ الحزم والدعوات بـ`project.tender.manage` (75 و93 و102) | تبقى الشاشة كما هي. بعد القرار 1 تُدخل العروض `TENDER_OFFICER`، وتُرسّي `CONTRACTS_MANAGER`، ولا قالب نظامي يجمع الاثنين. |
| إنشاء مشروع (موجود، يتغير رمزه) | `server/db.ts` `createProjectForTenant` (السطر 1122) | اليوم حامل `project.write` (السطر 1134)، أي `TENANT_OWNER` وحده | إنشاء مشروع | بعد القرار 6: حامل `project.create` (`TENANT_OWNER` و`EXECUTIVE` و`PMO_LEAD`). التغيير بند بناء AM-11. |
| الخطة الرئيسية (موجودة) | `client/src/components/MasterPlanTools.tsx` | حامل `project.read` للعرض | تكتب بـ`masterPlans.setVersionGeometry` و`masterPlans.updateEntityLayout` و`masterPlans.setSnapshotSharing` (`server/routers.ts:183-185`) | تبقى كما هي. الكتابة تتغير بـR-3 (البند 4.3). |
| الأنشطة والجدول الزمني (موجودة) | router `activities` (`server/routers.ts:539`) | حسب الصلاحية | `createActivity` | كما هي. تتغير صلاحيتها بـR-3 بإضافة `schedule.write`. |
| شاشة الدفعات (`PROPOSED`) | لا مسار | حامل `payment.prepare` للإعداد، و`payment.approve` للاعتماد | إعداد دفعة، واعتمادها | **لا تُصمَّم هنا:** كيان الدفعة غير معرَّف (البند 8.1، Q6). |

## 4. الصلاحيات

### 4.1 المصفوفة الكاملة

**كيف وُلّدت:** أُعيد توليد الجدول في 22 أكتوبر 2026 من المصدر عند الالتزام `36d3a15` (المطابق لـ`c59fc5c` في هذين الملفين): `operationalRoleDefinitions` و`operationalPermissionCatalog` في `server/domain/operationalRoles.ts`، و`ownerPermissions` في `server/db.ts` (الأسطر 834 إلى 841). عدّت القراءة 17 قالبًا في المصدر و39 رمز كتالوج و6 رموز مالك، والجدول فيه 49 صفًا و18 عمود قالب (يضيف `TENDER_OFFICER`). الرموز المقترحة في آخر أربعة صفوف. `x` = ممنوح في المصدر اليوم، `-` = غير ممنوح، `p` = منح مقترح بقرار أو بخطة (R-2، R-3، القرار 1، القرار 6)، `p*` = منح مقترح يخالف قاعدة المنتج (Q2)، و`r` = ممنوح في المصدر اليوم وأزالته القرار 1. الخلايا `p` و`p*` و`r` هي وحدها ما يُطبَّق فوق المصدر. يُعاد توليد الجدول كاملًا عند أي تعديل على المصدر، ولا يُحرَّر يدويًا. السكربت الذي وُلّد به الجدول خارج المستودع، ويقرأ الملفين أعلاه مباشرة.

الاختصارات: WC = WAREHOUSE_CUSTODIAN، PO = PROCUREMENT_OFFICER، FM = FINANCE_MANAGER، AC = ACCOUNTANT، HR = HR_MANAGER، PE = PLANNING_ENGINEER، SE = SITE_ENGINEER، QA = QA_QC_MANAGER، HSE = HSE_MANAGER، PM = PROJECT_MANAGER، EX = EXECUTIVE، PMO = PMO_LEAD، CC = COST_CONTROLLER، PC = PROJECT_COORDINATOR، DCA = DESIGN_COORDINATOR_ARCHITECTURAL، DCT = DESIGN_COORDINATOR_TECHNICAL، CM = CONTRACTS_MANAGER، TD = TENDER_OFFICER (مقترح).

`TENANT_OWNER` ليس عمودًا: يحمل كل الرموز الخمسة والأربعين في المصدر، ويُمنح الجديدة تلقائيًا عند كل تشغيل (`ensureTenantOperationalRoles`، الأسطر 850 إلى 855 من `server/db.ts`). ولأن `project.create` سيُضاف للكتالوج، يصل إلى `TENANT_OWNER` تلقائيًا.

| Permission | Product | WC | PO | FM | AC | HR | PE | SE | QA | HSE | PM | EX | PMO | CC | PC | DCA | DCT | CM | TD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `tenant.manage` | EXECUTIVE | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `executive.read` | EXECUTIVE | - | - | - | - | - | - | - | - | - | - | x | - | - | - | - | - | - | - |
| `pmo.read` | PMO | - | - | - | - | - | - | - | - | - | - | - | x | - | - | - | - | - | - |
| `pmo.write` | PMO | - | - | - | - | - | - | - | - | - | - | - | x | - | - | - | - | - | - |
| `project.read` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | x | x | x | x | x | p |
| `project.write` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.inventory.manage` | PROJECT | x | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.procurement.manage` | PROJECT | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.budget.manage` | PROJECT | - | - | x | - | - | - | - | - | - | x | - | - | x | - | - | - | - | - |
| `project.cost.enter` | PROJECT | - | - | x | x | - | - | - | - | - | x | - | - | x | - | - | - | - | - |
| `project.cashflow.read` | PROJECT | - | - | x | - | - | - | - | - | - | x | - | - | x | - | - | - | - | - |
| `project.commitment.manage` | PROJECT | - | - | x | - | - | - | - | - | - | x | - | - | - | - | - | - | x | - |
| `project.invoice.match` | PROJECT | - | - | x | x | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.payroll.run` | PROJECT | - | - | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.payroll.approve` | PROJECT | - | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.payroll.sensitive.read` | PROJECT | - | - | x | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.hr.manage` | PROJECT | - | - | - | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.hr.sensitive.read` | PROJECT | - | - | - | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.payroll.structure` | PROJECT | - | - | - | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.attendance.manage` | PROJECT | - | - | - | - | x | - | - | - | - | x | - | - | - | - | - | - | - | - |
| `project.performance.read_own` | PROJECT | x | x | x | x | x | x | x | x | x | x | - | - | x | x | x | x | x | p |
| `project.performance.manage` | PROJECT | - | - | - | - | x | - | - | - | - | x | - | - | - | - | - | - | - | - |
| `project.wbs.manage` | PROJECT | - | - | - | - | - | x | - | - | - | x | - | - | - | - | - | - | - | - |
| `project.schedule.manage` | PROJECT | - | - | - | - | - | x | - | - | - | x | - | - | - | - | - | - | - | - |
| `project.evm.manage` | PROJECT | - | - | - | - | - | x | - | - | - | x | - | - | x | - | - | - | - | - |
| `project.progress.manage` | PROJECT | - | - | - | - | - | - | x | - | - | x | - | - | - | - | - | - | - | - |
| `project.field.manage` | PROJECT | - | - | - | - | - | - | x | - | x | x | - | - | - | x | - | - | - | - |
| `project.quality.manage` | PROJECT | - | - | - | - | - | - | x | x | - | x | - | - | - | - | - | - | - | - |
| `project.hse.manage` | PROJECT | - | - | - | - | - | - | x | - | x | x | - | - | - | - | - | - | - | - |
| `project.rfi.manage` | PROJECT | - | - | - | - | - | - | x | - | - | x | - | - | - | x | x | x | - | - |
| `project.ncr.manage` | PROJECT | - | - | - | - | - | - | x | x | - | x | - | - | - | - | - | - | - | - |
| `project.material.request` | PROJECT | - | - | - | - | - | - | x | - | - | x | - | - | - | x | - | - | - | - |
| `project.pmc.read` | PROJECT | - | - | x | - | - | x | x | x | - | x | - | - | x | x | x | x | x | - |
| `project.pmc.update` | PROJECT | - | - | - | - | - | - | x | x | - | x | - | - | - | x | - | - | - | - |
| `project.pmc.manage` | PROJECT | - | - | - | - | - | x | - | - | - | x | - | - | - | - | - | - | - | - |
| `project.settings.labour` | PROJECT | - | - | x | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.manage` | PROJECT | - | - | - | - | - | - | - | - | - | x | - | - | - | - | - | - | - | - |
| `project.design.manage` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | x | x | - | - |
| `project.design.architectural` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | x | - | - | - |
| `project.design.technical` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | x | - | - |
| `project.design.approve` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | x | - | - | - | - |
| `project.tender.manage` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | x | - |
| `project.tender.bids` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | r | p |
| `project.tender.level` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | x | - | - | - | - | - |
| `project.tender.award` | PROJECT | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | p | - |
| `payment.prepare (PROPOSED)` | PROJECT | - | - | - | p | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `payment.approve (PROPOSED)` | PROJECT | - | - | p | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `schedule.write (PROPOSED)` | PROJECT | - | - | - | - | - | p | - | - | - | - | - | - | - | - | - | - | - | - |
| `project.create (PROPOSED)` | PROJECT | - | - | - | - | - | - | - | - | - | - | p* | p* | - | - | - | - | - | - |

### 4.2 ما تكشفه المصفوفة

- **`project.write` لا يحمله أي قالب.** يحمله `TENANT_OWNER` وحده (`ownerPermissions`). بالقرار 6 يبقى كما هو، ولا يُمنح لـ`EXECUTIVE` ولا لـ`PMO_LEAD`، وإنشاء المشروع ينتقل إلى رمز منفصل `project.create`. مهندس التخطيط لا يحمله، وهذا ما يطلبه R-3.
- **`project.create` (PROPOSED، القرار 6).** يحمله `TENANT_OWNER` و`PMO_LEAD` و`EXECUTIVE`. الرمز غير موجود في الكود اليوم، ومنتجه PROJECT بحكم بادئته. إسناده إلى دورين من منتجين آخرين يخالف القاعدة القائمة (Q2).
- **`project.read` لا تحمله العشرة الأولى** (من `WAREHOUSE_CUSTODIAN` إلى `PROJECT_MANAGER`)، ولا `EXECUTIVE` ولا `PMO_LEAD`. `listProjectsForTenant` (`server/db.ts`) يتطلب `project.read`، فلا تعرض قائمة المشاريع لهؤلاء عبر ذلك المسار. انظر Q4 في البند 8.1.
- **`tenant.manage` لا يحمله قالب.** لكن `createTenantRole` يسمح بحمله لدور مخصص من منتج `EXECUTIVE`، لذلك يشترط اعتماد الترقية دور `TENANT_OWNER` (البند 2.5).
- **`project.tender.award` يحمله `CONTRACTS_MANAGER` افتراضًا (`p`، القراران 1 و4).** المصدر اليوم لا يمنحه لأحد: تعليق `operationalRoles.ts` عند السطر 101 يقول إن الترسية تبقى لمالك الشركة أو دور مخصص. المنحة لـ`CONTRACTS_MANAGER` تغيير في القالب، يُعرض فرقًا ولا يُطبَّق إلا بموافقة مالك المستأجر (R-1)، ولا يمسّ أي شركة قائمة بلا موافقتها. `PROJECT_MANAGER` لا يحمله (القرار 4)، ومن أراده لشركة يمنحه مالكها يدويًا.
- **`project.tender.bids` انتقل من `CONTRACTS_MANAGER` إلى `TENDER_OFFICER` (القرار 1، `r` و`p`).** زوج `bids`/`award` في `conflictingPermissionPairs` يبقى، لأنه يمنع الدور المخصص الذي يجمع الاثنين (البندان 4.3 و5).
- **`TENDER_OFFICER` (مقترح، القرار 1).** دور جديد بمنتج PROJECT، وهو من يُدخل العروض. تكوينه `project.read` و`project.tender.bids` و`project.performance.read_own`، على غرار `CONTRACTS_MANAGER` بعد حذف ما نُقل منه. هذا التكوين اقتراح من هذه المواصفة وليس قرارًا من المالك، ويحتاج تأكيده قبل البناء (AM-10).
- **`PROJECT_MANAGER` لا يحمل `project.write` ولا `schedule.write` ولا `project.tender.award`.** وفي المصدر لا يكتب الخطة الرئيسية أحد من القوالب غير المالك. بند بناء `schedule.write`: انظر البند 8.2.

### 4.3 قواعد الفصل بين المهام

| القاعدة | الأدوار | نقطة الإنفاذ | رمز الخطأ |
|---|---|---|---|
| مُعِدّ الدفعة لا يعتمدها | `ACCOUNTANT` (`payment.prepare`) مقابل `FINANCE_MANAGER` (`payment.approve`) | زوج مقترح في `conflictingPermissionPairs` (`server/domain/operationalPermissions.ts`)؛ الزوج الاسمي `ACCOUNTANT`/`FINANCE_MANAGER` في `conflictingOperationalRolePairs` عند `assignTenantMembershipRole`؛ قيد `project_payments` (البند 2.3)؛ فحص الخدمة قبل الاعتماد | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` (موجود) للدور والصلاحيات؛ `PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN` (مقترح) للسجل |
| المُعِدّ لا يعتمد دفعته حتى لو كان `TENANT_OWNER` | كل من يملك الصلاحيتين | قيد الجدول وفحص الخدمة لا يُعفيان أحدًا. الفحص الزوجي يُعفي `TENANT_OWNER` في `updateTenantRole` (فرع `others.isOwner`) وفي تعيين دور `TENANT_OWNER` نفسه في `assignTenantMembershipRole` | `PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN` (مقترح) |
| المشتري لا يستلم المواد ولا يطابق الفاتورة، والمستلم لا يطابقها | الصلاحيات `project.procurement.manage`، و`project.inventory.manage`، و`project.invoice.match` | ثلاثة أزواج في `conflictingPermissionPairs`؛ تُفحص في `createTenantRole` و`updateTenantRole` و`assignTenantMembershipRole` | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` |
| الدفع لا يُشغَّل ممن يسجّل الموظفين أو يضع الهياكل، ولا يعتمده من يشغّله | `ACCOUNTANT` مقابل `HR_MANAGER` و`FINANCE_MANAGER` | أزواج `project.payroll.run` مع `project.hr.manage` و`project.payroll.structure` و`project.payroll.approve`؛ والاسمي `HR_MANAGER`/`ACCOUNTANT` و`ACCOUNTANT`/`FINANCE_MANAGER` | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` |
| من يصدر الرسم لا يعتمده | `DCA` و`DCT` مقابل `PC` (`project.design.approve`) | زوج `project.design.manage` مع `project.design.approve` | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` |
| من يدخل العروض لا يرسيها (القرار 1) | `TENDER_OFFICER` (`project.tender.bids`) مقابل `CONTRACTS_MANAGER` (`project.tender.award`) | القوالب النظامية لا يجمعها دور واحد. وزوج `bids`/`award` في `conflictingPermissionPairs` يرفض الدور المخصص الذي يجمعهما | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` |
| من يدخل العروض لا يقارنها | `TENDER_OFFICER` مقابل `COST_CONTROLLER` (`project.tender.level`) | الفصل بالدور، وزوج `bids`/`level` يرفض الدور المخصص الذي يجمعهما | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` |
| مهندس التخطيط يكتب الجدول والخطة بـ`schedule.write` دون `project.write` | `PE` | قالب `PE` لا يحمل `project.write` (اختبار، البند 7)؛ كتابة الخطة الرئيسية تقبل `schedule.write` وتُرفض بـ`project.write` وحده (`AM-5`) | رفض عام (انظر البند 5، الصف 10) |
| لا أحد يغيّر عضويته أو امتيازاته من خلال هذا المسار | أي عضو | `assignTenantMembershipRole` و`updateTenantRole` | `PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN` (موجود) |

## 5. حالات الرفض

| # | الإجراء | الرمز | ما يراه المستخدم | الإنفاذ |
|---|---|---|---|---|
| 1 | تعديل دور نظامي بالمسار القديم `tenant.updateRole` | `PROJECT_OS_SYSTEM_ROLE_IMMUTABLE` (موجود) | «لا يمكن تعديل دور يديره النظام.» | `updateTenantRole`. يبقى كما هو، والتجاوز يمر عبر `tenant_role_overrides` فقط. |
| 2 | حفظ دور أو تجاوز بصلاحية من منتج آخر، أو رمز غير موجود في الكتالوج | `PROJECT_OS_INVALID_ROLE_PERMISSIONS` (موجود) | «يجب أن تنتمي جميع الصلاحيات المختارة إلى منتج الدور المحدد وأن تكون موجودة في الكتالوج.» | `createTenantRole`، `updateTenantRole`، وتجاوز مقترح |
| 3 | تجاوز أو دور يجمع زوجًا متعارضًا | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` (موجود) | «لا يمكن جمع هذين الدورين المتعارضين للمستخدم نفسه ضمن نطاق متداخل.» | `findPermissionConflict` في `createTenantRole` و`updateTenantRole` |
| 4 | تعيين دورين متعارضين لعضو في نطاق متداخل | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` (موجود) | النص نفسه | `assertOperationalRoleSeparation` في `assignTenantMembershipRole` |
| 5 | تعديل عضويتك أو دورك بنفسك | `PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN` (موجود) | «لا يمكنك تعديل عضويتك أو امتيازاتك من خلال هذا المسار.» | `assignTenantMembershipRole` و`updateTenantRole` |
| 6 | اعتماد ترقية من غير حامل `TENANT_OWNER`، أو من لا عضوية نشطة له | `PROJECT_OS_TENANT_ACCESS_DENIED` (موجود) | «لا تملك وصولاً إلى مساحة العمل المطلوبة.» | `assertTenantManager` (لغياب اللقطة) وشرط `TENANT_OWNER` (مقترح) |
| 7 | اعتماد ترقية على فرق قديم (تغيّر `base_version` أو الإصدار بعد عرض الفرق) | `PROJECT_OS_ROLE_TEMPLATE_VERSION_STALE` (مقترح، CONFLICT) | «تغيّر القالب منذ عرض الفرق. أعد مراجعة التغييرات ثم أعد الاعتماد.» (مقترح، يُضاف للعربية والإنجليزية في `shared/projectErrors.ts`) | خدمة الترقية، قبل أي كتابة |
| 8 | اعتماد دفعة أعدّها المستخدم نفسه | `PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN` (مقترح) | «لا يمكن اعتماد دفعة أعددتها بنفسك.» (مقترح) | خدمة الاعتماد وقيد `project_payments` |
| 9 | اعتماد دفعة بلا صلاحية `payment.approve` (كالمحاسب) | لا رمز `PROJECT_OS_`: `assertTenantAccess` يرفض بنص إنجليزي (`server/domain/authorization.ts`) | «تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة.» (الرسالة العامة، `client/src/lib/projectErrors.ts:13`) | `assertTenantAccess`. هذه ثغرة في الرسالة وليست في المنع (البند 8.2). |
| 10 | كتابة الخطة الرئيسية بـ`project.write` وحده، دون `schedule.write` | لا رمز `PROJECT_OS_` (كالصف 9) | الرسالة العامة نفسها | `AM-5` يغيّر الفحص إلى `schedule.write` |
| 11 | تعديل قالب نظامي مباشرة (UPDATE على `role_template_versions`) | خطأ قاعدة 42501، ولا يصل للواجهة | الرسالة العامة نفسها | منح `project_os_app` لـ`SELECT, INSERT` فقط (البند 2.1) |
| 12 | دور مخصص يجمع `project.tender.bids` و`project.tender.award` | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` (موجود) | «لا يمكن جمع هذين الدورين المتعارضين للمستخدم نفسه ضمن نطاق متداخل.» | `findPermissionConflict` في `createTenantRole` و`updateTenantRole`. القرار 1 يفصل الزوج في القوالب النظامية، والرفض للدور المخصص يبقى. |
| 13 | إسناد `project.create` إلى دور مخصص من منتج `EXECUTIVE` أو `PMO` | `PROJECT_OS_INVALID_ROLE_PERMISSIONS` (موجود) | «يجب أن تنتمي جميع الصلاحيات المختارة إلى منتج الدور المحدد وأن تكون موجودة في الكتالوج.» | `createTenantRole` و`updateTenantRole`. القالب النظامي لا يمر بهذا الفحص (`ensureTenantOperationalRoles` لا يفحص المنتج)، والتناقض بين المسارين في Q2. |

## 6. معايير القبول

1. لكل قالب نظامي (17 في المصدر، و18 بعد إضافة `TENDER_OFFICER`) صف في `role_template_versions` على الأقل، و`permission_codes` لآخر إصدار تطابق `operationalRoleDefinitions` عند `source_ref`.
2. نشر تعريف مختلف ينشئ إصدارًا بـ`template_version + 1`، ولا يعدّل أي صف قديم، وUPDATE عليه مرفوض لـ`project_os_app`.
3. فتح شاشة الإدارة لا يكتب في `role_permissions` لأي دور نظامي (عدّ الكتابات صفر). اليوم تكتب: `ensureTenantOperationalRoles` تُستدعى من `getTenantAdministration`.
4. حفظ تجاوز لا يغيّر `role_template_versions` ولا `permissions` ولا أي دور نظامي آخر.
5. الفرق المعروض لكل دور يساوي الإصدار الجديد ناقص القديم (مضاف)، والقديم ناقص الجديد (محذوف)، مع تمييز ما يُبقيه تجاوز الشركة.
6. لا تُطبَّق ترقية إلا بطلب من حامل `TENANT_OWNER`. طلب من حامل `tenant.manage` غير المالك يُرفض بـ`PROJECT_OS_TENANT_ACCESS_DENIED`.
7. ترقية على فرق قديم تُرفض بـ`PROJECT_OS_ROLE_TEMPLATE_VERSION_STALE` (مقترح)، ولا تغيّر `role_permissions`.
8. فشل كتابة صف التدقيق داخل معاملة الترقية يُلغي تغيير الصلاحيات كله (اختبار سلبي).
9. المصفوفة في البند 4.1 تطابق المولّدة من المصدر (الاختبار يقرأ المصدر ويقارن).
10. `ACCOUNTANT` يملك `payment.prepare` ولا يملك `payment.approve`، و`FINANCE_MANAGER` يملك `payment.approve` ولا يملك `payment.prepare`.
11. اعتماد دفعة بالمستخدم نفسه مرفوض بـ`PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN` (مقترح)، بما فيها حالة `TENANT_OWNER`، والإدراج المباشر بالشرط نفسه يرفضه قيد `project_payments`.
12. دور مخصص يجمع `payment.prepare` و`payment.approve` يُرفض بـ`PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT`.
13. `PLANNING_ENGINEER` يملك `schedule.write` ولا يملك `project.write`. كتابة الخطة الرئيسية بـ`project.write` وحده تُرفض، وبـ`schedule.write` تُقبل.
14. صف التجاوز أو الإصدار لشركة لا يُقرأ من شركة أخرى (اختبار سلبي بعضويتين).
15. كل رمز خطأ جديد له نص عربي وإنجليزي في `shared/projectErrors.ts`.
16. لا تُكتب `PROVEN` في `STATE.md` لهذه المواصفة إلا بعد تشغيل اختبارات البند 7 على قاعدة PostgreSQL اختبارية (`project_os_integration_test`)، مع العدد والتاريخ والـhash في الصف نفسه.
17. (القرار 1) `TENDER_OFFICER` يملك `project.tender.bids` ولا يملك `project.tender.award`، و`CONTRACTS_MANAGER` يملك `project.tender.award` ولا يملك `project.tender.bids`. دور مخصص يجمع `bids` و`award` يُرفض بـ`PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` (اختبار سلبي، وآخر إيجابي لكل دور نظامي).
18. (القرار 4) `PROJECT_MANAGER` لا يملك `project.tender.award`. ترقية القالب لا تغيّر صلاحيات أي شركة قائمة قبل موافقة مالكها (اختبار سلبي على `role_permissions` قبل الموافقة وبعدها).
19. (القرار 6) `project.create` محمول من `TENANT_OWNER` و`PMO_LEAD` و`EXECUTIVE` فقط، و`project.write` من `TENANT_OWNER` وحده. إنشاء المشروع يُقبل بـ`project.create` ويُرفض لمن لا يحمله (اختباران إيجابي وسلبي)، وهذا بعد حل Q2.

## 7. الاختبارات المطلوبة

**موجودة:**
- `server/domain/operationalRoles.test.ts`: الكتالوج وفصل الأدوار (`assertOperationalRoleSeparation`).
- `server/domain/operationalPermissions.test.ts`: الأزواج (`conflictingPermissionPairs`، `findPermissionConflict`).
- `server/domain/authorization.test.ts`: `assertTenantAccess` و`hasScopeAccess`.
- `server/role.templates.database.test.ts`: قاعدة حية، ويتخطى نفسه دون `TEST_DATABASE_URL`.
- `server/pilot.roleAcceptance.database.test.ts`: قبول الأدوار على قاعدة حية.
- `client/src/lib/operationalRolePresentation.test.tsx` و`client/src/lib/userGuide.test.tsx`: الدليل يتحقق أن كل صلاحية يذكرها موجودة في القالب (البند U-2).
- `scripts/e2e-roles.mjs` (متصفح، ومعه `scripts/lib/roleFixture.mjs`).
- `scripts/run-integration-database-test.mjs`: يشغّل الاختبارات الحية على `project_os_integration_test` فقط (`CLAUDE.md` §7). بعد النقل يحتاج قاعدة PostgreSQL اختبارية (`AM-9`).

**مقترحة (`PROPOSED`):**
- `server/domain/roleTemplates.test.ts`: مطابقة المصفوفة مع المصدر (معيار 9)، و`PLANNING_ENGINEER` بلا `project.write` (معيار 13)، و`ACCOUNTANT`/`FINANCE_MANAGER` (معيار 10)، ولا قالب يحمل زوجًا متعارضًا، والزوج الجديد في `conflictingPermissionPairs`، و`TENDER_OFFICER` و`CONTRACTS_MANAGER` و`PROJECT_MANAGER` (معياران 17 و18)، و`project.create` (معيار 19).
- `server/role.overrides.database.test.ts`: التجاوز والترقية والرفض والتدقيق والعزل (معايير 1 إلى 8 و14).
- `server/payments.separation.database.test.ts`: قيد الجدول والخدمة (معيارا 11 و12).

**الأوامر:**
- `pnpm check`، و`pnpm build`، و`pnpm test`.
- `pnpm exec vitest run server/domain/operationalRoles.test.ts server/domain/operationalPermissions.test.ts server/domain/authorization.test.ts`.
- `pnpm coverage:trpc` (يتحقق من إجراءات tRPC الجديدة).
- `node scripts/run-integration-database-test.mjs` على قاعدة اختبارية، و`pnpm verify:audit-grants`.

**كل رفض في البند 5 يحتاج اختبارًا سلبيًا وآخر إيجابيًا** (`CLAUDE.md` §1: كل إصلاح يحتاج دليلًا إيجابيًا وسلبيًا).

## 8. المخاطر والأسئلة المفتوحة

### 8.1 أسئلة مفتوحة للمالك (`BLOCKED_BY_OWNER`، والمُغلق منها مذكور)

- **Q1: هل يُدعى `TENANT_OWNER` كدور؟** `SetupWizard` يستبعده (السطر 146)، ولا قرار مكتوب.
- **Q2 (W-1): قاعدة المنتج لـ`project.create`.** القرار 6 يحسم الحاملين: `TENANT_OWNER` و`PMO_LEAD` و`EXECUTIVE`، و`project.write` يبقى لـ`TENANT_OWNER` وحده. يبقى السؤال عن الآلية: قاعدة `PROJECT_OS_INVALID_ROLE_PERMISSIONS` تمنع الأدوار المخصصة من هذا الإسناد، والقوالب النظامية لا تُفحص أصلًا. الخيارات: تغيير منتج الدورين، أو استثناء للقوالب النظامية، أو تعريف `project.create` بمنتج `EXECUTIVE` أو `PMO`. `BLOCKED_BY_OWNER`. (W-1 وW-D في `docs/AFTER_MIGRATION.md` ما زالا يذكران `project.write`؛ تحديثهما خارج هذه الوثيقة.)
- **Q3 (T-1): مغلق بالقرارين 1 و4.** `tender.award` لـ`CONTRACTS_MANAGER` افتراضًا، ولا يُضاف لـ`PROJECT_MANAGER` (انظر 4.2 و4.3). يبقى تحديث T-1 في `docs/AFTER_MIGRATION.md`، فهو يذكر الدورين، خارج هذه الوثيقة.
- **Q4: `project.read` للعشرة الأولى.** قائمة المشاريع تتطلبه (`listProjectsForTenant`)، ومن لا يملكه لا يراها عبر هذا المسار. الإضافة تغيّر منح القوالب، فتحتاج موافقة مالك المستأجر (R-1) وقرارًا.
- **Q5 (R-3): بند بناء، لا سؤال.** `schedule.write` مقترح لـ`PLANNING_ENGINEER` (القرار 7)، ويُبنى على الخادم بعد النقل (`AM-5`)، فتعود خطوة «اضبط الخطة الرئيسية» في دليل الاستخدام بعده فقط (`U-2`، `S-7`). تبقى `project.schedule.manage` كما هي حتى يُبنى `AM-5`، ولا تقرر هذه الوثيقة بقاءها أو استبدالها.
- **Q6 (R-2): كيان الدفعة.** ما المستفيد والمستند المصدر والعملة؟ هل تُعدّ الدفعة من `FINANCE_MANAGER` أيضًا؟ لا يُعرَّف هذا الكيان في الكود ولا في القرارات.
- **Q7: مشاركة لقطات الخطة الرئيسية.** `createMasterPlanSnapshotForTenant` (`server/db.ts`) و`setMasterPlanSnapshotSharing` (`server/masterPlanTools.ts`) يكتبان بـ`project.read`. يقضي R-3 بنقل الكتابة للخطة الرئيسية، لكن هل تبقى المشاركة قراءة؟
- **Q8: التجربة والأسعار والمقاعد وتعدد الشركات لكل حساب.** خارج هذه المواصفة، وكل منها `BLOCKED_BY_OWNER` (`AFTER_MIGRATION` البند 7.5).

### 8.2 المخاطر (لا تحتاج قرارًا)

- **ترقية تلقائية مخالفة لـR-1.** `ensureTenantOperationalRoles` (`server/db.ts`) تُستدعى من `getTenantAdministration` عند كل فتح للشاشة، فتكتب أسماء الأدوار النظامية ومنحها (`onDuplicateKeyUpdate`)، فيحصل كل مستأجر على أي منح جديد في القالب دون موافقة. هذا أهم عيب يلزم إصلاحه قبل أي ترقية (`AM-1`).
- **`updateTenantRole`** تحذف منح الدور وتعيد كتابتها (`delete` ثم `insert`)، ولا تفرق بين الدور النظامي والتجاوز. تبقى محصورة بالدور غير النظامي بالرفض 1.
- **رسالة الرفض العامة.** `assertTenantAccess` يرفض بنص إنجليزي لا رمز `PROJECT_OS_`، فيظهر للمستخدم الرسالة العامة (البند 5، الصفوف 9 و10 و11). الرفض نفسه سليم، والخلل في النص فقط (`AM-7`).
- **سياسة الجدول العام** الافتراضية تسمح بالكتابة (البند 2.1)، لذلك تحتاج `role_template_versions` قائمة خاصة (`AM-2`).
- **الأنواع:** حُسمت بالقرار (البند 2): `varchar(36)` كما في خط الأساس. لا خطر مفتوح في هذا الشأن.
- **حماية `audit_logs`** حسابية وليست مطلقة (البند 2.5، `ADR-0002` الحد 2).
- **الاختبارات الحية** اليوم على MySQL. بعد النقل تحتاج قاعدة PostgreSQL اختبارية (`AM-9`).
- **بند بناء `schedule.write` (القرار 7):** خطوة الخطة الرئيسية في دليل الاستخدام (`U-2`، و`client/src/lib/userGuide.test.tsx`) لا تُعاد قبل أن يوجد `schedule.write` على الخادم، لأن الاختبار يتحقق من وجود كل صلاحية يذكرها الدليل في قالب الدور. الرمز يُبنى بعد النقل (`AM-5`).
- **تعارض وثائق أخرى مع هذه المواصفة:** `docs/AFTER_MIGRATION.md` يذكر في W-1 وW-D أن `project.write` تُمنح لـ`PMO_LEAD` و`EXECUTIVE`، وفي T-1 والبند 8.5 (1 و4) أن `tender.award` تُمنح لـ`PROJECT_MANAGER`. القراران 4 و6 يلغيانها. لم تُعدَّل تلك الوثيقة هنا.

### 8.3 بنود ما بعد النقل التي تعتمد عليها المواصفة

- **AM-1** `server/db.ts`، `ensureTenantOperationalRoles`: تتوقف عن كتابة منح الأدوار النظامية عند فتح الشاشة، والنشر يكتب الإصدار في خطوة منفصلة. القرار: R-1.
- **AM-2** خط الأساس: جداول `role_template_versions` و`tenant_role_overrides` و`project_payments` بقيود البند 2، وUNIQUE (`tenant_id`, `id`) على `roles`، وقائمة `global_readonly_tables` في `project_os_apply_conventions()`. القرار: R-1 وR-2.
- **AM-3** `server/domain/operationalRoles.ts`: إضافة `payment.prepare` و`payment.approve` و`schedule.write` و`project.create` إلى `operationalPermissionCatalog` وإلى القوالب، وإضافة `TENDER_OFFICER` (AM-10). و`server/domain/operationalPermissions.ts`: زوج `payment.prepare`/`payment.approve` في `conflictingPermissionPairs`. القرار: R-2 وR-3 والقراران 1 و6.
- **AM-4** `server/db.ts`: خدمة اعتماد الدفعة بفحص المُعِدّ ≠ المعتمِد، ورمز `PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN` مع نصه في `shared/projectErrors.ts`. القرار: R-2.
- **AM-5** عشر دوال كتابة للخطة الرئيسية، تنتقل من `project.write` أو `project.read` إلى `schedule.write`: في `server/db.ts` `saveMasterPlanVisualizationRuleForTenant` (السطر 1619)، و`createMasterPlanForTenant` (1635)، و`createMasterPlanVersionForTenant` (1648)، و`createMasterPlanSpatialEntityForTenant` (1661)، و`applyMasterPlanMappingFile` (1676)، و`importMasterPlanSpatialEntitiesFromFile` (1697)، و`createMasterPlanSnapshotForTenant` (1599)؛ وفي `server/masterPlanTools.ts` `setMasterPlanVersionGeometry` (السطر 14)، و`updateMasterPlanEntityLayout` (37)، و`setMasterPlanSnapshotSharing` (67). ويُضاف `schedule.write` إلى مسارات الجدول في `governedActionPermissions` و`importModulePermissions.schedule` (`shared/importPermissions.ts`). يعود معها U-2 (دليل الاستخدام) وS-7. القرار: R-3.
- **AM-6** خدمة ترقية القالب: معاينة الفرق، والتحقق من `base_version`، وشرط `TENANT_OWNER`، وكتابة الصلاحيات وصف التدقيق في معاملة واحدة. القرار: R-1.
- **AM-7** `server/domain/authorization.ts`: رفض الصلاحية برمز `PROJECT_OS_` مترجم بدل النص الإنجليزي. لا يحتاج قرار المالك.
- **AM-8** نوع المعرّف: مغلق بالقرار (البند 2)، ولا عمل على الخط. يبقى توثيقه في `docs/DECISIONS.md` لسجل التدقيق.
- **AM-9** الاختبارات الحية: `scripts/run-integration-database-test.mjs` و`server/role.templates.database.test.ts` تحتاجان قاعدة PostgreSQL اختبارية بعد النقل (`AFTER_MIGRATION` G-3).
- **AM-10** `server/domain/operationalRoles.ts`: إزالة `project.tender.bids` من `CONTRACTS_MANAGER`، وإضافة `project.tender.award` إليه، وإضافة القالب `TENDER_OFFICER` بـ`project.read` و`project.tender.bids` و`project.performance.read_own`. تغيير قالب نظامي يُعرض فرقًا ويُطبَّق بموافقة مالك المستأجر (R-1، وبعد AM-1 وAM-6). القراران 1 و4.
- **AM-11** `server/db.ts` `createProjectForTenant` (السطر 1122): ينتقل الفحص من `project.write` (السطر 1134) إلى `project.create`. ويُضاف `project.create` إلى الكتالوج، فيصل إلى `TENANT_OWNER` تلقائيًا، وتُحسم قاعدة المنتج لـ`EXECUTIVE` و`PMO_LEAD` (Q2). القرار 6.
