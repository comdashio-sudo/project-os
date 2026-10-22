# مواصفة قوالب الأدوار الجاهزة (ROLE_TEMPLATES)

## 1. الهدف والنطاق

**الحالة:** مواصفة بنائية مبنية على الكود في الفرع `main` عند `da61754`. لا تغيّر هذه الوثيقة أي صف في `docs/STATE.md`، ولا تُعد دليل `PROVEN`.

**المحرك:** تستعمل المواصفة أنواع MySQL/TiDB كما في `drizzle/schema.ts`. لم تُكتب بمفردات PostgreSQL، للسبب المذكور في `docs/specs/TENDERING.md` البند 1، وهو قرار المالك (البند 8.1).

**الهدف:** تعريف القوالب الجاهزة التي تحصل عليها كل شركة، وما تمنحه كل قالب بالضبط، وقواعد فصل المهام التي تحكم تركيبها. القالب يصف ما يفعله حامله، ولا يحل محل نطاق المستأجر والمشروع الذي يفرضه الخادم.

**القوالب الداخلة في النطاق (ثمانية، كما تُعرَّف في `operationalRoleDefinitions`):**

| القالب (`roles.code`) | الاسم الإنجليزي | المنتج | ملاحظة |
|---|---|---|---|
| `EXECUTIVE` | Executive | `EXECUTIVE` | عرض تنفيذي للشركة، بلا مشروع |
| `PMO_LEAD` | PMO Lead | `PMO` | عرض مكتب المشاريع، بلا مشروع |
| `COST_CONTROLLER` | Cost Controller | `PROJECT` | الكوست كنترول: الميزانية والتكلفة الفعلية والتدفق والتسوية |
| `PLANNING_ENGINEER` | Planning Engineer | `PROJECT` | التخطيط. من القوالب الأولى التسعة، ولم يتغير في أمر العمل 5 |
| `PROJECT_COORDINATOR` | Project Coordinator | `PROJECT` | منسق المشاريع: الموقع والمواد والمراسلات والاعتماد الفني |
| `DESIGN_COORDINATOR_ARCHITECTURAL` | Design Coordinator (Architectural) | `PROJECT` | منسق التصميم للتخصصات المعمارية فقط |
| `DESIGN_COORDINATOR_TECHNICAL` | Design Coordinator (Technical) | `PROJECT` | منسق التصميم للتخصصات الفنية فقط |
| `CONTRACTS_MANAGER` | Contracts Manager | `PROJECT` | العقود: المناقصة والمدعوون والعروض والالتزامات |

**خارج النطاق:**
- القوالب الأخرى الموجودة في الكود: `WAREHOUSE_CUSTODIAN`، و`PROCUREMENT_OFFICER`، و`FINANCE_MANAGER`، و`ACCOUNTANT`، و`HR_MANAGER`، و`SITE_ENGINEER`، و`QA_QC_MANAGER`، و`HSE_MANAGER`، و`PROJECT_MANAGER`. تُذكر هنا فقط حين تدخل في قاعدة فصل مع قالب من النطاق.
- الدور `TENANT_OWNER`: دور النظام لمالك الشركة، يحمل كل الصلاحيات بالتعريف، وليس قالبًا.
- الأدوار المخصصة (`createTenantRole`): تخضع للقواعد نفسها، وتُوصف في البند 5 حيث تُرفض.

**المصادر:** `server/domain/operationalRoles.ts` (`operationalPermissionCatalog`، و`operationalRoleDefinitions`، و`conflictingOperationalRolePairs`، و`assertOperationalRoleSeparation`)، و`server/domain/operationalPermissions.ts` (`conflictingPermissionPairs`، و`findPermissionConflict`)، و`server/db.ts` (`ownerPermissions`، و`ensureTenantOperationalRoles`، و`createTenantRole`، و`updateTenantRole`، و`assignTenantMembershipRole`)، و`client/src/lib/operationalRolePresentation.ts` (`operationalRoleProfiles`). سجل التغيير: الالتزام `c2eb303` (#59) لمس `server/domain/operationalRoles.ts` لإضافة القوالب السبعة الجديدة وفصل المهام.

## 2. الجداول والحقول والقيود

القوالب نفسها ليست جدولًا. تعريفها في الكود (`operationalRoleDefinitions`)، وتُثبَّت في الجداول الآتية لكل شركة عند أول فتح لشاشة إدارة الشركة (انظر البند 3).

### 2.1 `roles` (`roles`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `code` | varchar(80) | لا | — | رمز القالب، مثل `COST_CONTROLLER` |
| `name` | varchar(160) | لا | — | الاسم الإنجليزي الافتراضي |
| `productCode` | mysqlEnum(`EXECUTIVE`، `PMO`، `PROJECT`) | نعم | — | المنتج الذي يخص الدور. القوالب الثمانية لها منتج محدد |
| `description` | text | نعم | — | |
| `systemManaged` | boolean | لا | `false` | `true` للقوالب الجاهزة وللمالك. لا يُعدَّل بالكتابة |
| `createdAt` | timestamp | لا | الآن | |
| `updatedAt` | timestamp | لا | الآن، ويتجدد عند التعديل | |

- UNIQUE `roles_tenant_code_unique` على (`tenantId`, `code`). الرمز واحد لكل شركة.

### 2.2 `permissions` (`permissions`)

| الحقل | النوع | قابل للفراغ | ملاحظة |
|---|---|---|---|
| `id` | varchar(36) | لا | المفتاح الأساسي |
| `code` | varchar(120) | لا | رمز الصلاحية، مثل `project.tender.award` |
| `name` | varchar(160) | لا | الاسم المعروض |
| `productCode` | mysqlEnum(`EXECUTIVE`، `PMO`، `PROJECT`) | لا | |
| `description` | text | نعم | |
| `createdAt` | timestamp | لا | |

- UNIQUE `permissions_code_unique` على (`code`). الجدول عام لكل الشركات، ويُملأ من `ownerPermissions` و`operationalPermissionCatalog`.

### 2.3 `role_permissions` (`rolePermissions`)

| الحقل | النوع | قابل للفراغ | ملاحظة |
|---|---|---|---|
| `roleId` | varchar(36) | لا | FK ← `roles.id` |
| `permissionId` | varchar(36) | لا | FK ← `permissions.id` |
| `createdAt` | timestamp | لا | |

- المفتاح الأساسي المركّب `role_permissions_pk` على (`roleId`, `permissionId`).

### 2.4 `membership_roles` (`membershipRoles`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `membershipId` | varchar(36) | لا | — | FK ← `memberships.id` |
| `roleId` | varchar(36) | لا | — | FK ← `roles.id` |
| `scopeType` | mysqlEnum(`company`، `portfolio`، `program`، `project`) | لا | `company` | |
| `scopeId` | varchar(36) | نعم | — | معرّف النطاق. فارغ للشركة كلها |
| `createdAt` | timestamp | لا | الآن | |

- UNIQUE `membership_roles_scope_unique` على (`membershipId`, `roleId`, `scopeType`, `scopeId`).
- INDEX `membership_roles_membership_idx` على (`membershipId`).

### 2.5 صفوف التدقيق

| الإجراء (`action`) | `entityType` | متى | الدالة |
|---|---|---|---|
| `tenant.role_created` | `role` | إنشاء دور مخصص | `createTenantRole` |
| `tenant.role_updated` | `role` | تعديل دور مخصص | `updateTenantRole` |
| `tenant.membership_role_assigned` | `membership_role` | إسناد دور لعضو بنطاق | `assignTenantMembershipRole` |
| `tenant.membership_role_revoked` | `membership_role` | إلغاء إسناد | `revokeTenantMembershipRole` |

**فجوة:** تثبيت القوالب الجاهزة (`ensureTenantOperationalRoles`) يكتب في `roles` و`permissions` و`role_permissions` دون أي صف تدقيق، وهو يعمل داخل استعلام القراءة `tenant.administration`. انظر البند 8.

## 3. الشاشات

**المسار:** `/tenants/:tenantId/administration` (`client/src/pages/TenantAdministration.tsx`، 221 سطرًا). عنوانه «أعضاء وأدوار الشركة»، ويعرض الأعضاء والأدوار ونطاقات الوصول. تستعمل `WriteGate` من `client/src/lib/permissions.tsx`. لم أحصر كل رمز صلاحية في الواجهة، والخادم هو الحكم.

**من يراها:** من يملك `tenant.manage` في الشركة، وهو لا يُمنح إلا لمالك الشركة أو لدور مخصص. انظر البند 5 والبند 8.

| الجزء | ما يفعله | الحالة الفارغة أو التحميل |
|---|---|---|
| قائمة الأعضاء | يعرض العضوية وحالتها والأدوار ونطاقاتها | `query.isLoading` يعرض نص التحميل |
| الأدوار | يعرض الأدوار ومنها الجاهزة (`systemManaged`)، والجاهزة لا تُعدَّل | — |
| إنشاء دور مخصص | يختار اسمًا ورمزًا ومنتجًا وصلاحيات من منتجه فقط | — |
| إسناد دور وإلغاؤه | يسند دورًا بنطاق، ويلغي إسنادًا | — |
| دعوة عضو | ينشئ رابط قبول لمرة واحدة، يظهر مرة واحدة | — |
| حالة العضوية | يعطّل عضوًا أو يعيد تفعيله | — |

**البطاقة التعريفية للقالب:** `client/src/lib/operationalRolePresentation.ts` يملك `operationalRoleProfiles`، لكل قالب: الغرض والتركيز والحد الفاصل، بالعربية والإنجليزية. تظهر في خطوة الدعوة من المعالج (`client/src/pages/SetupWizard.tsx`، الخطوة 4)، وفي شاشة الإدارة حسب ما يعرضه الكود. الاختبار: `client/src/lib/operationalRolePresentation.test.tsx`.

## 4. الصلاحيات

### 4.1 مصفوفة القوالب الثمانية

كل صف صلاحية ورد في قالب واحد على الأقل من الثمانية. «✓» تعني أن القالب يمنحها، و«—» أنه لا يمنحها. المصفوفة مُولَّدة من `operationalRoleDefinitions` بتشغيل سكربت يقرأ الملف، وليست منسوخة يدويًا.

الأعمدة بالترتيب: (1) `EXECUTIVE`، (2) `PMO_LEAD`، (3) `COST_CONTROLLER`، (4) `PLANNING_ENGINEER`، (5) `PROJECT_COORDINATOR`، (6) `DESIGN_COORDINATOR_ARCHITECTURAL`، (7) `DESIGN_COORDINATOR_TECHNICAL`، (8) `CONTRACTS_MANAGER`.

| الصلاحية | (1) | (2) | (3) | (4) | (5) | (6) | (7) | (8) |
|---|---|---|---|---|---|---|---|---|
| `executive.read` | ✓ | — | — | — | — | — | — | — |
| `pmo.read` | — | ✓ | — | — | — | — | — | — |
| `pmo.write` | — | ✓ | — | — | — | — | — | — |
| `project.read` | — | — | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `project.pmc.read` | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `project.performance.read_own` | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `project.budget.manage` | — | — | ✓ | — | — | — | — | — |
| `project.cost.enter` | — | — | ✓ | — | — | — | — | — |
| `project.cashflow.read` | — | — | ✓ | — | — | — | — | — |
| `project.evm.manage` | — | — | ✓ | ✓ | — | — | — | — |
| `project.tender.level` | — | — | ✓ | — | — | — | — | — |
| `project.pmc.manage` | — | — | — | ✓ | — | — | — | — |
| `project.wbs.manage` | — | — | — | ✓ | — | — | — | — |
| `project.schedule.manage` | — | — | — | ✓ | — | — | — | — |
| `project.pmc.update` | — | — | — | — | ✓ | — | — | — |
| `project.rfi.manage` | — | — | — | — | ✓ | ✓ | ✓ | — |
| `project.field.manage` | — | — | — | — | ✓ | — | — | — |
| `project.material.request` | — | — | — | — | ✓ | — | — | — |
| `project.design.approve` | — | — | — | — | ✓ | — | — | — |
| `project.design.manage` | — | — | — | — | — | ✓ | ✓ | — |
| `project.design.architectural` | — | — | — | — | — | ✓ | — | — |
| `project.design.technical` | — | — | — | — | — | — | ✓ | — |
| `project.commitment.manage` | — | — | — | — | — | — | — | ✓ |
| `project.tender.manage` | — | — | — | — | — | — | — | ✓ |
| `project.tender.bids` | — | — | — | — | — | — | — | ✓ |

**عدد الصلاحيات في كل قالب:** `EXECUTIVE` 1، `PMO_LEAD` 2، `COST_CONTROLLER` 8، `PLANNING_ENGINEER` 6، `PROJECT_COORDINATOR` 8، `DESIGN_COORDINATOR_ARCHITECTURAL` 6، `DESIGN_COORDINATOR_TECHNICAL` 6، `CONTRACTS_MANAGER` 6.

**ما لا يمنحه أي قالب من الثمانية:** `project.tender.award`، و`tenant.manage`، و`project.write`، و`project.manage`، و`project.commitment.manage` لغير `CONTRACTS_MANAGER`.

**الغرض والحد الفاصل لكل قالب** (من `operationalRoleProfiles`، والنص الكامل في الملف):
- `COST_CONTROLLER`: يتحكم في المال دون أن يحركه: الميزانيات والتكلفة الفعلية والتدفق والقيمة المكتسبة وتسوية العروض. لا يملك الالتزامات ولا مطابقة الفواتير.
- `PROJECT_COORDINATOR`: يُبقي العمل متحركًا بين الفرق والاستشاري، وله الجانب الاعتمادي من التصميم (اعتماد المخطط وتسجيل رد الاستشاري).
- `DESIGN_COORDINATOR_ARCHITECTURAL` و`DESIGN_COORDINATOR_TECHNICAL`: يصدران المخططات ويتابعانها في تخصصهما فقط، ولا يعتمد أيٌّ منهما ما يصدره.
- `CONTRACTS_MANAGER`: يُعد المناقصات ويُدخل العروض ويدير الالتزامات التي تصبح عنها. لا يسوّي ولا يرسّي (تعليق `server/domain/operationalRoles.ts`: «the award stays with the company owner or a custom role»).

### 4.2 قواعد فصل المهام

**على مستوى القوى:** `conflictingPermissionPairs` في `server/domain/operationalPermissions.ts`. لا يحمل أي شخص طرفي زوج، سواء من دور واحد أو من عدة أدوار أو من دور مخصص:

| الزوج | السبب المكتوب في الكود | القوالب المعنية |
|---|---|---|
| `project.design.manage` + `project.design.approve` | من يصدر مخططًا لا يعتمده، ولا يسجل رد الاستشاري على تقديمه | `DESIGN_COORDINATOR_*` مع `PROJECT_COORDINATOR` |
| `project.tender.bids` + `project.tender.award` | من يُدخل العروض لا يرسّي المناقصة | `CONTRACTS_MANAGER` مع أي دور يحمل `project.tender.award` |
| `project.tender.bids` + `project.tender.level` | من يُدخل العروض لا يسوّيها، لأن المقارنة لا تكون مستقلة إلا إن أجراها غيره | `CONTRACTS_MANAGER` مع `COST_CONTROLLER` |
| `project.procurement.manage` + `project.inventory.manage` | المشتري لا يستلم البضاعة ويصرفها | لا يحمله قالب من الثمانية |
| `project.procurement.manage` + `project.invoice.match` | المشتري لا يطابق فاتورة المورد | لا يحمله قالب من الثمانية |
| `project.inventory.manage` + `project.invoice.match` | من يستلم البضاعة لا يطابق فاتورتها | لا يحمله قالب من الثمانية |
| `project.payroll.run` + `project.payroll.approve` | من يشغّل الرواتب لا يعتمدها | لا يحمله قالب من الثمانية |
| `project.payroll.run` + `project.hr.manage` | لا تُشغَّل الرواتب من يحفظ سجلات الموظفين | لا يحمله قالب من الثمانية |
| `project.payroll.run` + `project.payroll.structure` | لا تُشغَّل الرواتب من يضع هياكل الرواتب | لا يحمله قالب من الثمانية |

**على مستوى الأدوار المسماة:** `conflictingOperationalRolePairs` في `server/domain/operationalRoles.ts`: `PROCUREMENT_OFFICER` مع `WAREHOUSE_CUSTODIAN`، و`ACCOUNTANT` مع `FINANCE_MANAGER`، و`HR_MANAGER` مع `ACCOUNTANT`. لا تشمل القوالب الثمانية.

**فحص القوالب الثمانية مجتمعة:** كل قالب على حدة لا يحمل زوجًا. مجتمعة، يظهر زوجان: `project.design.manage` مع `project.design.approve`، و`project.tender.bids` مع `project.tender.level`. لذلك يُرفض إسناد الدورين معًا للشخص نفسه في النطاق نفسه (انظر البند 5).

**على مستوى الأشخاص (في الخدمات):**
- `awardTender`: من أدخل أي عرض في الحزمة لا يرسّيها، ولو كان مالكًا (`PROJECT_OS_TENDER_SELF_AWARD`).
- `approveDesignDrawing`: مُصدر المراجعة لا يعتمدها (`PROJECT_OS_DESIGN_SELF_APPROVAL`).
- `transitionDesignComment`: من ردّ على التعليق لا يغلقه (`PROJECT_OS_DESIGN_SELF_CLOSE`).
- `transitionDesignSubmittal`: مُرسل التقديم لا يسجّل رده (`PROJECT_OS_DESIGN_SELF_REPLY`).
- إسناد الدور أو تعديله لنفسك: مرفوض (`PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN`).
- آخر مالك نشط للشركة: لا يُعطَّل (`PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN`).

**الإعفاء:** مالك الشركة يُعفى من فحص الزوج عند الإسناد (`rolePermissionCodesForMembership` يعيد `isOwner`). الإعفاء لا يمتد إلى فحوص الأشخاص أعلاه.

**زوج لم يُعرَّف:** لا توجد صلاحية في الكتالوج لإصدار المدفوعات أو اعتمادها. الزوج الأقرب هو تشغيل الرواتب مع اعتمادها (`project.payroll.run` و`project.payroll.approve`). مطلوب قرار المالك قبل تعريف زوج جديد (البند 8.5).

## 5. حالات الرفض

| # | الحالة | رمز tRPC | الرمز المعرّب | ما يراه المستخدم |
|---|---|---|---|---|
| 1 | إنشاء دور مخصص برمز موجود في الشركة | CONFLICT | `PROJECT_OS_ROLE_CODE_EXISTS` | رسالة الرمز المكرر |
| 2 | صلاحية غير موجودة في الكتالوج، أو من منتج غير منتج الدور | BAD_REQUEST | `PROJECT_OS_INVALID_ROLE_PERMISSIONS` | رسالة الصلاحيات غير الصالحة |
| 3 | الدور المخصص يجمع طرفي زوج | FORBIDDEN | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` | رسالة فصل المهام |
| 4 | تعديل قالب جاهز | FORBIDDEN | `PROJECT_OS_SYSTEM_ROLE_IMMUTABLE` | رسالة الدور الجاهز |
| 5 | تعديل دور يحمله المستخدم نفسه | FORBIDDEN | `PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN` | رسالة تغيير الصلاحية الذاتية |
| 6 | تعديل دور سيجمع طرفي زوج عند أحد حامليه | FORBIDDEN | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` | رسالة فصل المهام |
| 7 | إسناد دور يجمع مع أدوار العضو في النطاق نفسه طرفي زوج | FORBIDDEN | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` | رسالة فصل المهام |
| 8 | إسناد دور يجمع رمزين من `conflictingOperationalRolePairs` | FORBIDDEN | `PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT` | رسالة فصل المهام |
| 9 | إسناد دور لعضو غير موجود في الشركة | NOT_FOUND | `PROJECT_OS_MEMBER_NOT_FOUND` | رسالة عدم الوجود |
| 10 | إسناد دور موجود للعضو نفسه بالنطاق نفسه | CONFLICT | `PROJECT_OS_ROLE_ASSIGNMENT_EXISTS` | رسالة التكرار |
| 11 | نطاق لا يتبع الشركة (BAD_REQUEST إن كان نطاق الشركة بمعرّف، وNOT_FOUND إن كان المشروع أو الوحدة غير موجودة فيها) | BAD_REQUEST أو NOT_FOUND | `PROJECT_OS_INVALID_SCOPE` | رسالة النطاق |
| 12 | إسناد دور لمنتج غير مرخّص للشركة | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة عدم الترخيص |
| 13 | إلغاء إسناد غير موجود | NOT_FOUND | `PROJECT_OS_ROLE_ASSIGNMENT_NOT_FOUND` | رسالة عدم الوجود |
| 14 | تعطيل آخر مالك نشط | FORBIDDEN | `PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN` | رسالة آخر مالك |
| 15 | المستخدم بلا `tenant.manage`، أو بلا منتج EXECUTIVE | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` أو `PROJECT_OS_PRODUCT_NOT_ENTITLED` | نص `WriteGate` قبل الإرسال، والتنبيه بعده |

**ملاحظة على الرفض 15:** `assertTenantManager` في `server/db.ts` يطلب المنتج `EXECUTIVE` مع `tenant.manage`. الشركة التي اشترت باقة `PROJECT` وحدها لا تملك هذا المنتج، فلا يستطيع مالكها إدارة الأدوار أو الدعوات. انظر البند 8.

## 6. معايير القبول

1. كل قالب من الثمانية يُثبَّت في الشركة بالمنتج الذي يحمله تعريفه، وبالصلاحيات المطابقة لعمود المصفوفة في البند 4.1، لا أكثر ولا أقل.
2. عدد الصلاحيات المعروض لكل قالب يساوي العدد في البند 4.1.
3. لا يحمل أي قالب من الثمانية صلاحية خارج عموده في المصفوفة، وإن تغيّر التعريف في الكود تفشل الاختبارات حتى تُحدَّث المواصفة.
4. لا يُسند لشخص واحد في النطاق نفسه قالبان يجمعان طرفي زوج من `conflictingPermissionPairs`، ويُرفض الإسناد بـ`PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT`.
5. إسناد `CONTRACTS_MANAGER` ثم `COST_CONTROLLER` للشخص نفسه في النطاق نفسه يُرفض.
6. إسناد `DESIGN_COORDINATOR_ARCHITECTURAL` مع `PROJECT_COORDINATOR` للشخص نفسه في النطاق نفسه يُرفض.
7. مُصدر المراجعة لا يعتمدها بأي دور يحمله، حتى لو أُسند إليه `PROJECT_COORDINATOR` في نطاق آخر، لأن فحص `PROJECT_OS_DESIGN_SELF_APPROVAL` يقوم على المستخدم لا على الدور.
8. القالب الجاهز لا يُعدَّل ولا يُحذف: `PROJECT_OS_SYSTEM_ROLE_IMMUTABLE`.
9. `EXECUTIVE` و`PMO_LEAD` لا يفتحان مشروعًا، ولا يحملان `project.read`.
10. كل قالب يعرض البطاقة التعريفية بالعربية والإنجليزية، وتتطابق الكلمات الثلاث (الغرض والتركيز والحد الفاصل) مع التعريف.
11. تثبيت القوالب مرة ثانية لا يكرر الصفوف، ولا يضيف صلاحية لم تكن في التعريف.
12. تغيير تعريف قالب في إصدار لاحق لا يسحب صلاحية كانت ممنوحة، إلا بخطوة صريحة (انظر البند 8.2).
13. كل كتابة في إنشاء دور مخصص أو تعديله أو إسناده أو إلغاء إسنادها تنتج صف التدقيق المذكور في البند 2.5. تثبيت القوالب الجاهزة مستثنى من ذلك حاليًا، وهو عيب مذكور في البند 8.

## 7. الاختبارات المطلوبة

**اختبارات وحدة (دوال نقية، دون قاعدة):**
- الموجود: `server/domain/operationalRoles.test.ts` (اختباران، لمدير المشروع وللجودة والسلامة فقط)، و`server/domain/operationalPermissions.test.ts` (يثبت أن كل صلاحية مفروضة في مكان ما، وأن «no built-in role holds both sides of a pair»، وأن كل زوج يسمّي صلاحيات حقيقية).
- المطلوب: اختبار يقرأ `operationalRoleDefinitions` ويقارنه بجدول المصفوفة في البند 4.1 بالكامل: الصلاحيات، وعددها، والمنتج. إذا تغيّر التعريف دون تحديث الجدول، يفشل الاختبار.
- المطلوب: لكل قالب من الثمانية، لا يحمل أي زوج من `conflictingPermissionPairs`، ومجتمعًا يُعرف ما يُعارض.
- المطلوب: `findPermissionConflict` على كل الأزواج الممكنة من قالبين.

**اختبارات تكامل قاعدة البيانات (على `project_os_integration_test` فقط، وتُتخطى بلا `TEST_DATABASE_URL`):**
- الموجود: `server/role.templates.database.test.ts` (6 اختبارات): تثبيت كل قالب بمنتجه وصلاحياته، وأن كل قالب يُسمح له بإجراءات المناقصات والتصميم التي يحملها ويُرفض الباقي بالرسالة الصحيحة، والمصمّمون مقيّدون بتخصصهم ولا يعتمدون ما يصدرون، و`CONTRACTS_MANAGER` يُعد ويُدخل ولا يسوّي ولا يرسّي، و`COST_CONTROLLER` يسوّي ولا يُدخل العروض، و«powers that must not meet cannot be combined on one person, even across two templates»، و`EXECUTIVE` و`PMO_LEAD` لا يفتحان مشروعًا.
- الموجود: `server/design.coordination.database.test.ts` (يختبر أن الدور المفرد لا يصدر ويعتمد معًا).
- الموجود: `server/integration.database.test.ts`، الاختبار «governs tenant role and membership administration with scope and self-privilege guards».
- المطلوب: تثبيت القوالب مرتين يترك العدد كما هو، ويطابق المصفوفة.
- المطلوب: تغيير تعريف قالب في الكود بعد تثبيته، وإعادة التثبيت، وإثبات بقاء الصلاحية القديمة (لتوثيق الخطر في البند 8.2).
- المطلوب: إسناد دور جاهز بمنتج غير مرخّص يُرفض بـ`PROJECT_OS_PRODUCT_NOT_ENTITLED`.

**اختبارات مكوّنات الواجهة:**
- الموجود: `client/src/lib/operationalRolePresentation.test.tsx`، و`client/src/pages/TenantAdministration.access.test.tsx`، و`client/src/pages/TenantAdministration.loading.test.tsx`، و`client/src/lib/permissions.test.tsx`.
- المطلوب: البطاقة التعريفية تعرض الغرض والتركيز والحد الفاصل بالكلمات نفسها التي في `operationalRoleProfiles`، بالعربية والإنجليزية.
- المطلوب: زر تعديل القالب الجاهز غائب.

## 8. مخاطر وأسئلة مفتوحة

**قرارات المالك (BLOCKED_BY_OWNER، لا تُفترض):**
1. **المحرك.** نفس قرار `docs/specs/TENDERING.md` البند 8.1.
2. **تعديل القالب بعد التثبيت.** `ensureTenantOperationalRoles` يُضيف صلاحيات التعريف إلى الدور الجاهز، لكنه لا يحذف صلاحية أُزيلت من التعريف. الشركة التي ثبّتت القالب القديم تحتفظ بالصلاحية المحذوفة. هل تُحذف الصلاحيات الزائدة عند التثبيت (مع صف تدقيق)، أم تُعامل التعديلات بإجراء صريح؟
3. **`PROJECT_COORDINATOR` يعتمد المخططات في كل التخصصات.** `approveDesignDrawing` لا يفحص سلطة التخصص، والقالب يحمل `project.design.approve` دون `project.design.architectural` أو `project.design.technical`. هل يعتمد المنسق العام المعماري والفني معًا؟ (البند 8 في `docs/specs/DESIGN_COORDINATION.md`).
4. **إنشاء العقود والالتزامات يدويًا لـ`CONTRACTS_MANAGER`.** يحمل `project.commitment.manage`، فيستطيع إنشاء عقد والتزام دون مناقصة مرسّاة. التعليق في الكود يقول إن الالتزامات «they become»، أي أنها نتيجة المناقصات. هل هذا مقصود؟
5. **زوج لإصدار الدفعات واعتمادها.** لا توجد صلاحية لإصدار المدفوعات في الكتالوج. السؤال: ما الصلاحيتان، وما الفعل الذي يُعدّ «الإصدار»؟ لا يُعرَّف زوج قبل الجواب.
6. **منتج الإدارة.** `assertTenantManager` يطلب `EXECUTIVE`. هل تُدار الأدوار والدعوات في باقات `PROJECT` و`PMO` و`PMO + PROJECT` التي لا تحمل `EXECUTIVE`؟ السؤال تجاري ومنتجي، ولا يُحل في الكود.
7. **`TENANT_OWNER` قابل للدعوة.** `createMembershipInvitation` يقبل أي `roleId` للشركة، ومنه دور المالك. الواجهة تخفيه في المعالج، والخادم لا يرفضه. هل يُمنع أم يُسمح لمدير الشركة بتعيين مالك جديد؟
8. **القالب `PLANNING_ENGINEER` لا يحمل `project.read`.** القوالب الأولى التسعة لا تحمله، وتعليق الكود يقول إن قوالب أمر العمل 5 وحدها تحمله. `listProjectsForTenant` يطلب `project.read`، فحامل قالب التخطيط وحده لا يرى قائمة المشاريع. هل يُضاف `project.read` لكل القوالب، أم يُترك الأمر لمنح منفصلة؟

**عيوب في الكود (OPEN):**
- **تثبيت الأدوار بلا صف تدقيق**، داخل استعلام قراءة (`getTenantAdministration`). الإصلاح: نقل التثبيت إلى إنشاء الشركة في المعاملة نفسها، أو كتابة صف تدقيق باسم مقترح `tenant.system_roles_installed` عند أول تثبيت فعلي.
- **تعليق في `server/domain/operationalRoles.ts` يذكر `assertNoPermissionConflict`** بوصفه الحارس، بينما `server/db.ts` يستعمل `findPermissionConflict` مباشرة، و`assertNoPermissionConflict` مصدَّرة ولا يستدعيها كود الخادم. الإصلاح: تصحيح التعليق، أو استدعاء الدالة في الموضعين.
- **فحص الزوج عند الإسناد يقتصر على الأدوار المتقاطعة في النطاق.** الدور المسند للشركة كلها يتقاطع مع كل نطاق، فيُرفض إسناده لعضو يحمل في أي نطاق الطرف الآخر من الزوج. هذا محافظ، ويحتاج تأكيد المالك قبل اعتباره المقصود.
- **قبول الدعوة لا يُعيد فحص الفصل.** الدعوة تحمل دورًا واحدًا لعضو جديد، فلا تتكون أزواج في الدور الواحد (لأن الدور نفسه يُفحص عند إنشائه وتعديله). الفحص نفسه يغيب عن `acceptMembershipInvitation`، وينبغي أن يبقى غيابه مرهونًا بهذا الشرط.
**مخاطر تشغيلية:**
- إضافة صلاحية إلى الكتالوج تمنحها تلقائيًا للمالك (`allCatalogPermissions`)، لكنها لا تدخل أي قالب إلا بتعديل التعريف. هذا مقصود، لكنه يصعّب مراجعة الأثر على الأدوار القائمة.
