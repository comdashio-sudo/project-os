# مواصفة المناقصات قبل الترسية (TENDERING)

## 1. الهدف والنطاق

**الحالة:** مواصفة بنائية مبنية على الكود في الفرع `main` عند `da61754`. لا تغيّر هذه الوثيقة أي صف في `docs/STATE.md`، ولا تُعد دليل `PROVEN`.

**المحرك:** تستعمل المواصفة أنواع MySQL/TiDB كما هي في `drizzle/schema.ts`: `varchar(36)` للمعرّفات، و`int` لمعرّف المستخدم، و`mysqlEnum` للحالات، و`decimal(18,2)` للمبالغ، و`timestamp` للتواريخ. لم تُكتب بمفردات PostgreSQL، لأن رأس `CLAUDE.md` يقول إن مسار تغيير قاعدة البيانات غير معتمد، وأن `docs/DECISIONS.md` (ADR-001) يثبت MySQL لكل البيئة الجديدة. انظر البند 8، أول سؤال.

**الهدف:** تنظيم ما قبل الترسية داخل مشروع واحد: حزمة مناقصة، ثم قائمة مدعوين، ثم إدخال العروض، ثم مقارنتها وتسويتها، ثم ترسية واحدة تنشئ العقد والالتزام معًا في معاملة واحدة.

**داخل النطاق:**
- حزم المناقصة (`tender_packages`) ودورة حالتها: `draft` ثم `open` ثم `closed` ثم `awarded`، مع `cancelled`، وإعادة الفتح `closed` إلى `open` لمورد متأخر.
- قائمة المدعوين (`tender_invitees`) من موردي السجل النشطين (`suppliers`).
- إدخال العروض (`tender_bids`) وتصحيحها وسحبها ما دامت الحزمة مفتوحة.
- التسويات (`tender_bid_adjustments`) واستبعاد العرض وجدول المقارنة بالترتيب.
- الترسية: اختيار عرض حي، ثم في معاملة واحدة إنشاء `contracts` و`commitments` وتحويل الحزمة إلى `awarded`.

**خارج النطاق:**
- استيراد العروض من Excel أو CSV. لا يوجد استيراد للمناقصات في `shared/importPermissions.ts`.
- إرسال الدعوات بالبريد، وبوابة مورد، والإشعارات. لا تملك هذه الوحدة أيًّا منها.
- تقييم فني أو تقييم أداء للمورد. لا يوجد ذلك في الكود.
- ربط الالتزام ببند ميزانية أو رمز تكلفة. جدول `commitments` لا يحمل `budgetLineId`. انظر البند 8.
- أي دفع أو فوترة أو تحويل عملات.
- حفظ نسخ زمنية لشروط المناقصة.

**المصادر:** `server/tenderService.ts` (كل الدوال المصدَّرة)، و`server/domain/tenders.ts` (`levelBids`، و`tenderTransitions`، و`ADJUSTMENT_KINDS`، و`BID_STATUSES`)، و`drizzle/schema.ts` (`tenderPackages`، `tenderInvitees`، `tenderBids`، `tenderBidAdjustments`)، و`server/routers.ts` (المجموعة `tenders`).

## 2. الجداول والحقول والقيود

كل جدول من الأربعة يحمل `tenantId` و`projectId`، وكل استعلام يُقيَّد بهما معًا عبر الدالة `mine()` في `server/tenderService.ts`. لا توجد قيود `CHECK` في المخطط الحالي. قيود الإشارة والمبلغ تُفرض في الخدمة وفي مخطط `zod` للمسار، وتُقترح قيود قاعدة البيانات في البند 8.

### 2.1 `tender_packages` (`tenderPackages`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي، معرّف نصي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `packageCode` | varchar(120) | لا | — | رمز الحزمة داخل المشروع |
| `title` | varchar(255) | لا | — | عنوان الحزمة، ويُنسخ إلى العقد |
| `scopeSummary` | text | نعم | — | ملخص النطاق |
| `estimateAmount` | decimal(18,2) | نعم | — | تقدير المالك. بلا تقدير لا تُحسب نسبة عن التقدير |
| `currency` | varchar(3) | لا | `'SAR'` | عملة الحزمة وعملة العروض الافتراضية |
| `status` | mysqlEnum(`draft`, `open`, `closed`, `awarded`, `cancelled`) | لا | `draft` | |
| `closingAt` | timestamp | نعم | — | موعد الإغلاق للعرض فقط؛ لا يغلق الحزمة آليًا |
| `awardedBidId` | varchar(36) | نعم | — | بلا FK في المخطط؛ يُكتب عند الترسية فقط |
| `awardedContractId` | varchar(36) | نعم | — | بلا FK في المخطط؛ يُكتب عند الترسية فقط |
| `awardedCommitmentId` | varchar(36) | نعم | — | بلا FK في المخطط؛ يُكتب عند الترسية فقط |
| `awardedAt` | timestamp | نعم | — | |
| `awardedByUserId` | int | نعم | — | FK ← `users.id` |
| `awardJustification` | text | نعم | — | إلزامي إذا كان عدد العروض القابلة للمقارنة أقل من اثنين |
| `createdByUserId` | int | لا | — | FK ← `users.id` |
| `createdAt` | timestamp | لا | الآن | |
| `updatedAt` | timestamp | لا | الآن، ويتجدد عند التعديل | |

- المفتاح الأساسي: `id`.
- UNIQUE `tender_packages_project_code_unique` على (`projectId`, `packageCode`).
- INDEX `tender_packages_tenant_project_status_idx` على (`tenantId`, `projectId`, `status`, `createdAt`).

### 2.2 `tender_invitees` (`tenderInvitees`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `packageId` | varchar(36) | لا | — | FK ← `tender_packages.id` |
| `supplierId` | varchar(36) | لا | — | FK ← `suppliers.id` |
| `status` | mysqlEnum(`invited`, `declined`, `submitted`) | لا | `invited` | `declined` لا يضبطه أي إجراء. انظر البند 8 |
| `invitedAt` | timestamp | لا | الآن | |
| `invitedByUserId` | int | لا | — | FK ← `users.id` |

- UNIQUE `tender_invitees_package_supplier_unique` على (`packageId`, `supplierId`).
- INDEX `tender_invitees_tenant_project_idx` على (`tenantId`, `projectId`).

### 2.3 `tender_bids` (`tenderBids`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `packageId` | varchar(36) | لا | — | FK ← `tender_packages.id` |
| `supplierId` | varchar(36) | لا | — | FK ← `suppliers.id` |
| `amount` | decimal(18,2) | لا | — | السعر. موجب (يُفرض في `zod` لا في القاعدة) |
| `currency` | varchar(3) | لا | `'SAR'` | يُنسخ من الحزمة إن لم يُكتب غيره |
| `durationDays` | int | نعم | — | مدة التنفيذ |
| `validityDays` | int | نعم | — | صلاحية العرض |
| `notes` | text | نعم | — | |
| `status` | mysqlEnum(`submitted`, `withdrawn`, `disqualified`) | لا | `submitted` | |
| `statusReason` | varchar(500) | نعم | — | سبب السحب أو الاستبعاد |
| `enteredByUserId` | int | لا | — | FK ← `users.id`. هو الذي يحدد فصل المهام في الترسية |
| `enteredAt` | timestamp | لا | الآن | |
| `updatedAt` | timestamp | لا | الآن، ويتجدد عند التعديل | |

- UNIQUE `tender_bids_package_supplier_unique` على (`packageId`, `supplierId`): عرض واحد لكل مورد في الحزمة.
- INDEX `tender_bids_package_status_idx` على (`packageId`, `status`)، وINDEX `tender_bids_tenant_project_idx` على (`tenantId`, `projectId`).

### 2.4 `tender_bid_adjustments` (`tenderBidAdjustments`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `packageId` | varchar(36) | لا | — | FK ← `tender_packages.id` |
| `bidId` | varchar(36) | لا | — | FK ← `tender_bids.id` |
| `kind` | mysqlEnum(`scope_gap`, `exclusion`, `correction`, `discount`) | لا | — | النوع يحدد إشارة المبلغ |
| `description` | varchar(500) | لا | — | |
| `amount` | decimal(18,2) | لا | — | موجب للإضافة وسالب للخصم حسب النوع |
| `createdByUserId` | int | لا | — | FK ← `users.id` |
| `createdAt` | timestamp | لا | الآن | |

- INDEX `tender_adjustments_bid_idx` على (`bidId`)، وINDEX `tender_adjustments_package_idx` على (`packageId`). لا يوجد UNIQUE.
- إشارة المبلغ تُفرض في `addTenderBidAdjustment` بالرمز `PROJECT_OS_TENDER_ADJUSTMENT_SIGN`، لا في القاعدة.

### 2.5 الجداول التي تكتبها الترسية ولا تملكها هذه الوحدة

| الجدول | القيود ذات الصلة | ما تكتبه الترسية |
|---|---|---|
| `contracts` | UNIQUE `contracts_project_code_unique` على (`projectId`, `code`)؛ FK `supplierId` ← `suppliers.id`؛ `status` افتراضيًا `draft` | `code` = رمز العقد المُدخل، و`title` = عنوان الحزمة، و`counterparty` = الاسم القانوني للمورد، و`counterpartyKind` = `supplier`، و`supplierId`، و`contractValue` = المجموع المُسوّى للعرض الفائز، و`currency` = عملة العرض، و`status` = `draft` |
| `commitments` | UNIQUE `commitments_project_code_unique` على (`projectId`, `code`)؛ FK `contractId` ← `contracts.id`؛ `status` من `draft`، `committed`، `released`، `cancelled` | `code` = `${contractCode}-C1`، و`contractId`، و`amount` = المجموع المُسوّى، و`status` = `committed`، و`committedAt` = الآن |
| `auditLogs` | `id`، `tenantId`، `actorUserId`، `action`، `entityType`، `entityId`، `metadata` (نص JSON)، `createdAt`. لا يوجد عمود `projectId` | صفوف التدقيق في الجدول أدناه |

### 2.6 صفوف التدقيق: كل كتابة في معاملتها

كل كتابة تكتب صف تدقيق في المعاملة نفسها. `projectId` يُحفظ داخل `metadata` لأن جدول `audit_logs` لا يملك عمودًا له. المصدر: دالة `audit()` في `server/tenderService.ts`.

| الإجراء (`action`) | `entityType` | الدالة |
|---|---|---|
| `tender.package_created` | `tender_package` | `createTenderPackage` |
| `tender.supplier_invited` | `tender_package` | `inviteTenderSupplier` |
| `tender.package_status_transitioned` | `tender_package` | `transitionTenderPackage` |
| `tender.bid_entered` | `tender_bid` | `enterTenderBid` |
| `tender.bid_revised` | `tender_bid` | `reviseTenderBid` |
| `tender.bid_withdrawn` | `tender_bid` | `withdrawTenderBid` |
| `tender.bid_disqualified` | `tender_bid` | `disqualifyTenderBid` |
| `tender.adjustment_added` | `tender_bid` | `addTenderBidAdjustment` |
| `tender.adjustment_removed` | `tender_bid` | `removeTenderBidAdjustment` |
| `tender.awarded` | `tender_package` | `awardTender` |
| `project.contract_created` | `contract` | `awardTender` (مصدره `tender_award`) |
| `project.commitment_created` | `commitment` | `awardTender` (مصدره `tender_award`) |

## 3. الشاشات

**المسار:** لا توجد صفحة مستقلة للمناقصات. القسم داخل صفحة الضبط `/projects/:tenantId/:projectId/controls` (`client/src/pages/ProjectControls.tsx`)، بالمعرّف `manager-tenders` وعنوان «المناقصات قبل الترسية»، ويُحمَّل كسولًا. المكوّن هو `client/src/pages/ProjectTenders.tsx`، وكل زر كتابة يُغلَّف بـ`WriteGate` من `client/src/lib/permissions.tsx`، فيظهر لمن لا يملك الصلاحية نص السبب بدل النموذج.

| الجزء | من يراه | ما يفعله | الحالة الفارغة أو التحميل |
|---|---|---|---|
| قائمة الحزم | من يملك `project.read` ضمن المشروع | يقرأ الحزم مع عدد المدعوين والعروض وأدنى سعر مُسوّى، ويفتح حزمة | نص `t.loading` أثناء التحميل، ونص `t.empty` بلا حزم |
| إنشاء حزمة | `project.tender.manage` | يُدخل الرمز والعنوان والنطاق والتقدير والعملة | — |
| تغيير الحالة | `project.tender.manage` | `open` أو `closed` أو `cancelled` حسب الحالة الحالية | — |
| المدعوون | القراءة لـ`project.read`، والدعوة لـ`project.tender.manage` | يختار موردًا من السجل النشط ويدعوه | قائمة فارغة تعرض `t.empty` |
| إدخال العرض وتصحيحه وسحبه | `project.tender.bids` | يظهر النموذج عندما تكون الحزمة `open` فقط | — |
| المقارنة والتسوية والاستبعاد | `project.tender.level` | يظهر عندما تكون الحزمة `closed` فقط. الجدول يرتّب الأفضل أولًا، والمسحوب والمستبعد دون رتبة | — |
| الترسية | `project.tender.award` | نموذج يظهر عند `closed`: عرض حي، ورمز عقد، وتسبيب اختياري | — |
| حزمة مرسّاة | كل من يصل إلى القسم | يعرض رقم العقد والالتزام (أول ثماني خانات) ولا يعرض أي إجراء ترسية | — |

**الأخطاء:** تظهر في `role="alert"` عبر `getLocalizedProjectError` من `client/src/lib/projectErrors.ts`، ويُختار النص العربي أو الإنجليزي من `shared/projectErrors.ts`.

**فجوة معروفة:** نموذج الترسية يظهر لكل من يملك `project.tender.award`، بما فيهم من أدخل عرضًا في الحزمة. الخادم يرفض ذلك بـ`PROJECT_OS_TENDER_SELF_AWARD` بعد الإرسال فقط. المطلوب (مقترح): لا يظهر النموذج لمن أدخل عرضًا، أو يظهر تفسير مكانه.

## 4. الصلاحيات

كل إجراء يمر بـ`assertTenderAccess` في `server/tenderService.ts` بهذا الترتيب: عضوية نشطة، ثم ترخيص منتج `PROJECT`، ثم الصلاحية المسمّاة، ثم نطاق المشروع، ثم أن يتبع المشروع للمستأجر (`assertProjectWithinTenant`). الرموز الخمسة موجودة في `operationalPermissionCatalog` في `server/domain/operationalRoles.ts`.

| الرمز | يُمنح لـ | الإجراءات التي يحميها (الدالة) | الوجود في المصدر |
|---|---|---|---|
| `project.read` | القراءة | `listTenderSuppliers`، `listTenderPackages`، `listTenderInvitees`، `getTenderComparison` | `ownerPermissions` في `server/db.ts` |
| `project.tender.manage` | الحزم والدعوات وتغيير الحالة | `createTenderPackage`، `inviteTenderSupplier`، `transitionTenderPackage` | `operationalPermissionCatalog` |
| `project.tender.bids` | إدخال العرض وتصحيحه وسحبه | `enterTenderBid`، `reviseTenderBid`، `withdrawTenderBid` | `operationalPermissionCatalog` |
| `project.tender.level` | المقارنة والتسوية والاستبعاد | `disqualifyTenderBid`، `addTenderBidAdjustment`، `removeTenderBidAdjustment` | `operationalPermissionCatalog` |
| `project.tender.award` | الترسية | `awardTender` | `operationalPermissionCatalog` |

**فصل المهام على مستوى القوى:** `conflictingPermissionPairs` في `server/domain/operationalPermissions.ts` تحتوي زوجين لهذه الوحدة:
- `project.tender.bids` مع `project.tender.award`: «من يُدخل العروض لا يرسّي».
- `project.tender.bids` مع `project.tender.level`: «من يُدخل العروض لا يسوّيها».

تُفرض الأزواج عند إنشاء الدور وتعديله وإسناده في `server/db.ts` (`createTenantRole`، و`updateTenantRole`، و`assignTenantMembershipRole`)، ويُعفى المالك (`TENANT_OWNER`) من فحص الزوج عند الإسناد، كما في `rolePermissionCodesForMembership`.

**فصل المهام على مستوى الأشخاص:** `awardTender` يرفض إذا كان أي عرض في الحزمة، بما فيه المسحوب والمستبعد، مُدخَلًا من المستخدم نفسه (`bids.some(bid => bid.enteredByUserId === input.userId)`). القاعدة تسري على المالك أيضًا، لأن الإعفاء في الزوج لا يمتد إلى هذا الفحص.

**القاعدة المؤكدة:** لا يحمل أي دور جاهز `project.tender.award`. الترسية لصاحب الشركة أو لدور مخصص (تعليق `CONTRACTS_MANAGER` في `server/domain/operationalRoles.ts`).

**تفاوت:** الترسية تنشئ العقد والالتزام بصلاحية `project.tender.award` وحدها. `governedActionPermissions` في `server/domain/operationalPermissions.ts` تشترط `project.commitment.manage` على إنشاء العقد والالتزام يدويًا (`createContractForTenant`، و`createCommitmentForTenant`). انظر البند 8.

**رموز جديدة:** لا يلزم أي رمز صلاحية جديد لهذه الوحدة.

## 5. حالات الرفض

الرمز الذي يراه المستخدم هو الرسالة المعرّبة لرمز `PROJECT_OS_*` في `shared/projectErrors.ts`. رسائل `assertTenantAccess` العامة (`Tenant scope`، و`membership`، و`not licensed`، و`permission`، و`Role scope`) تُحوَّل إلى ثلاثة رموز بواسطة `getProjectError` في الملف نفسه: `PROJECT_OS_TENANT_ACCESS_DENIED`، و`PROJECT_OS_PRODUCT_NOT_ENTITLED`، و`PROJECT_OS_PERMISSION_DENIED`. يصل الخطأ إلى الواجهة عبر `errorFormatter` في `server/_core/trpc.ts`.

| # | الحالة | رمز tRPC | الرمز المعرّب | ما يراه المستخدم |
|---|---|---|---|---|
| 1 | لا عضوية نشطة أو لا وصول للمستأجر | FORBIDDEN | `PROJECT_OS_TENANT_ACCESS_DENIED` | رسالة الوصول المعرّبة في تنبيه |
| 2 | الشركة لا تملك منتج PROJECT | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة عدم الترخيص |
| 3 | الصلاحية غير ممنوحة، أو النطاق لا يغطي المشروع | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` | قبل الإرسال: نص `WriteGate`. بعده: التنبيه |
| 4 | المشروع لا يتبع الشركة | NOT_FOUND | `PROJECT_OS_PROJECT_NOT_FOUND` | رسالة عدم الوجود |
| 5 | الحزمة غير موجودة في المستأجر والمشروع | NOT_FOUND | `PROJECT_OS_TENDER_NOT_FOUND` | رسالة عدم الوجود |
| 6 | المورد غير موجود أو غير نشط | NOT_FOUND | `PROJECT_OS_TENDER_SUPPLIER_NOT_FOUND` | رسالة عدم الوجود |
| 7 | رمز حزمة مكرر في المشروع | CONFLICT | `PROJECT_OS_TENDER_DUPLICATE` | رسالة التكرار |
| 8 | دعوة مورد على حزمة مغلقة أو ملغاة | CONFLICT | `PROJECT_OS_TENDER_INVITATION_CLOSED` | رسالة الإغلاق |
| 9 | فتح حزمة `draft` بلا مدعوين | CONFLICT | `PROJECT_OS_TENDER_NO_INVITEES` | تبقى الحزمة `draft` |
| 10 | انتقال حالة غير مسموح (`tenderTransitions`) | BAD_REQUEST | `PROJECT_OS_TENDER_TRANSITION_INVALID` | رسالة الانتقال |
| 11 | إدخال عرض والحزمة ليست `open` | CONFLICT | `PROJECT_OS_TENDER_NOT_OPEN` | رسالة عدم الفتح |
| 12 | عرض من مورد غير مدعو | CONFLICT | `PROJECT_OS_TENDER_NOT_INVITED` | رسالة عدم الدعوة |
| 13 | عرض ثانٍ للمورد نفسه في الحزمة | CONFLICT | `PROJECT_OS_TENDER_BID_EXISTS` | رسالة التكرار |
| 14 | تصحيح أو سحب عرض ليس `submitted` | CONFLICT | `PROJECT_OS_TENDER_BID_STATE_INVALID` | رسالة الحالة |
| 15 | تسوية أو استبعاد قبل `closed` | CONFLICT | `PROJECT_OS_TENDER_NOT_CLOSED` | رسالة عدم الإغلاق |
| 16 | استبعاد بسبب فارغ بعد `trim` | BAD_REQUEST | `PROJECT_OS_TENDER_REASON_REQUIRED` | رسالة السبب |
| 17 | إشارة تسوية مخالفة للنوع | BAD_REQUEST | `PROJECT_OS_TENDER_ADJUSTMENT_SIGN` | رسالة الإشارة |
| 18 | حذف تسوية غير موجودة | NOT_FOUND | `PROJECT_OS_TENDER_ADJUSTMENT_NOT_FOUND` | رسالة عدم الوجود |
| 19 | ترسية على عرض مسحوب أو مستبعد | CONFLICT | `PROJECT_OS_TENDER_BID_NOT_ELIGIBLE` | رسالة عدم الأهلية |
| 20 | ترسية بيد من أدخل عرضًا في الحزمة | CONFLICT | `PROJECT_OS_TENDER_SELF_AWARD` | رسالة فصل المهام |
| 21 | ترسية مع أقل من عرضين قابلين للمقارنة بلا تسبيب من عشرة أحرف | BAD_REQUEST | `PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED` | رسالة التسبيب |
| 22 | ترسية والحزمة لم تعد `closed` عند الكتابة (`affectedRows` ≠ 1) | CONFLICT | `PROJECT_OS_TENDER_NOT_CLOSED` | رسالة عدم الإغلاق. لا عقد ولا التزام |
| 23 | رمز عقد أو التزام مكرر في المشروع | CONFLICT | `PROJECT_OS_TENDER_DUPLICATE` | رسالة التكرار. تُلغى المعاملة كلها |
| 24 | مدخل مرفوض بمخطط `zod` في المسار، مثل سعر غير موجب أو عملة ليست ثلاثة أحرف | BAD_REQUEST | `PROJECT_OS_REQUEST_FAILED` | «تعذر إتمام الطلب. تحقق من البيانات» |
| 25 | تحديث محمي لم يتأثر بأي صف (مقترح، انظر البند 8) | CONFLICT | `PROJECT_OS_TENDER_STATE_CHANGED` (جديد) | «تغيّرت حالة الحزمة. أعد تحميل القسم» |

**قاعدة الرفض:** لا فشل صامت. كل تحديث محمي يفحص عدد الصفوف المتأثرة، فإن كان 0 يرفض بخطأ صريح. اليوم يفعل ذلك `awardTender` فقط (`affectedRows !== 1`). `transitionTenderPackage`، و`withdrawTenderBid`، و`disqualifyTenderBid`، و`addTenderBidAdjustment`، و`removeTenderBidAdjustment` لا تفحص ذلك. انظر البند 8.

## 6. معايير القبول

1. إنشاء حزمة دون `project.tender.manage` يُرفض بـ`PROJECT_OS_PERMISSION_DENIED`، ولا يُكتب أي صف.
2. كل إجراء من مستأجر آخر أو مشروع آخر يُرفض، ولا يُعاد أي صف من المستأجر الآخر.
3. فتح حزمة `draft` بلا مدعو يعيد `PROJECT_OS_TENDER_NO_INVITEES`، وتبقى الحزمة `draft`.
4. لا يُقبل عرض إلا من مورد مدعو، وفي حزمة `open`، ومرة واحدة لكل مورد.
5. تصحيح العرض وسحبه بعد الإغلاق يُرفضان، ولا يتغير `tender_bids` عند الرفض.
6. التسوية والاستبعاد لا يقبلان قبل `closed`. مبلغ `discount` الموجب ومبلغ `scope_gap` أو `exclusion` السالب يُرفضان بـ`PROJECT_OS_TENDER_ADJUSTMENT_SIGN`.
7. العرض المسحوب أو المستبعد يظهر في الجدول دون رتبة، ولا يدخل الوسيط ولا الأدنى.
8. الترتيب يعتمد المجموع المُسوّى (السعر مع التسويات)، والمتعادلون يتشاركون الرتبة.
9. الاستبعاد يتطلب سببًا غير فارغ بعد `trim`.
10. الترسية تنجح مرة واحدة فقط. ينتج عنها عقد واحد والتزام واحد. عند الفشل لا يبقى أي منهما.
11. من أدخل عرضًا في الحزمة يُرفض عند الترسية، ولو كان مالكًا، بـ`PROJECT_OS_TENDER_SELF_AWARD`.
12. مع أقل من عرضين قابلين للمقارنة لا تُقبل الترسية إلا بتسبيب من عشرة أحرف بعد `trim`.
13. قيمة العقد هي المجموع المُسوّى للعرض الفائز، ومورّده هو الاسم القانوني من السجل، وعملته هي عملة العرض.
14. بعد الترسية: الالتزام `committed`، والعقد `draft`، والحزمة `awarded` مع المعرّفات الثلاثة مملوءة.
15. كل كتابة تنتج صف التدقيق المذكور في البند 2.6 في المعاملة نفسها، وفيه `projectId` داخل `metadata`.
16. كل تحديث محمي يفحص عدد الصفوف المتأثرة. صفر صفوف ينتج خطأ صريحًا.
17. لا تُغيّر حالة حزمة `awarded` بأي إجراء، ولا يتغير `awardedContractId` بعد الترسية.
18. مستخدم بلا `project.tender.award` لا يرى نموذج الترسية. من أدخل عرضًا لا يرى النموذج، بل تفسيرًا (مقترح).
19. الحالة الفارغة والتحميل يظهران نصًا معرَّبًا، لا قائمة فارغة صامتة.
20. كل الرسائل تظهر بالعربية والإنجليزية، ولا يظهر رمز `PROJECT_OS_*` خامًا للمستخدم.

## 7. الاختبارات المطلوبة

**اختبارات وحدة (دوال نقية، دون قاعدة):**
- الموجود: `server/domain/tenders.test.ts` (7 اختبارات): ترتيب التسوية، وجمع التسويات، والمسحوب بلا رتبة، والوسيط وفرق 30%، ومقارنة التقدير، والحالات الفارغة، ومجموعة الانتقالات.
- المطلوب: جدول انتقالات كامل، 5 × 5، يُختبر كل زوج مسموح ومرفوض، وتحقق من أن `tenderTransitions.awarded` فارغ.
- المطلوب: جدول إشارات التسوية، أربعة أنواع × إشارة، بما فيها الصفر.
- المطلوب: حالة عرض واحد قابل للمقارنة، وحالة عرضين، وحالة ثلاثة مع فرق 30% بالضبط على الحد.
- المطلوب بعد قرار البند 8.4: اختبار لمعاملة العملات المختلفة.

**اختبارات تكامل قاعدة البيانات (على `project_os_integration_test` فقط):**
- الموجود: `server/tender.award.database.test.ts` (9 اختبارات): حدود الدور، والحزم والدعوات، والتسوية، والترسية بيد غير مُدخل العرض، والترسية المتزامنة لمرتين، والاستبعاد والإلغاء، والعزل بين المستأجرين والمشاريع، وصف التدقيق لكل كتابة.
- المطلوب: سباق بين `transitionTenderPackage(cancelled)` والترسية. النتيجة المقبولة: الترسية لا تُلغى، والإلغاء يُرفض بخطأ صريح.
- المطلوب: سباق بين `withdrawTenderBid` و`awardTender`، ويُثبت أن العرض المسحوب لا يُرسّى.
- المطلوب: رفض الترسية بـ`PROJECT_OS_TENDER_SELF_AWARD` لمالك الشركة نفسه.
- المطلوب بعد قرار البند 8.2: ترسية بدور يملك `project.tender.award` دون `project.commitment.manage`.
- القاعدة: هذه الاختبارات تُشغَّل من `scripts/run-integration-database-test.mjs` فقط، ولا تُستبدل بمحاكاة (`docs/DEPLOYMENT.md`).

**اختبارات مكوّنات الواجهة:**
- الموجود: `client/src/pages/ProjectTenders.interaction.test.tsx` (7 اختبارات): العرض والترتيب والتسوية والترسية، والحزمة المرسّاة، والحزمة المفتوحة، والإنجليزية.
- المطلوب: مُدخل العرض لا يرى نموذج الترسية، ويرى التفسير.
- المطلوب: تنبيه `PROJECT_OS_TENDER_SELF_AWARD` يظهر بالنص المعرّب.
- المطلوب: الحالة الفارغة والتحميل لكل جزء في الجدول أعلاه.

## 8. مخاطر وأسئلة مفتوحة

**قرارات المالك (BLOCKED_BY_OWNER، لا تُفترض):**
1. **المحرك.** المواصفة مبنية على MySQL/TiDB. يوجد على الفرع البعيد `origin/feat/postgres-migration` عمل انتقال إلى PostgreSQL، وليس على `main`، ولم أجد على `main` قرارًا معتمدًا يسمح به. رأس `CLAUDE.md` يقول إن لا مسار معتمد. يلزم قرار المالك قبل ترجمة أي نوع.
2. **من يلتزم ماليًا.** هل تكفي `project.tender.award` لإنشاء العقد والالتزام، أم يُشترط معها `project.commitment.manage`، كما هو للإنشاء اليدوي؟
3. **الميزانية.** `commitments` لا يحمل `budgetLineId`، ولا تُخصم الترسية من بند ميزانية. الالتزام يدخل التدفق النقدي كمبلغ ملتزم به فقط (`server/domain/cashFlow.ts`). هل تُطلب طريقة ربط ببند أو رمز تكلفة؟
4. **العملات.** `levelBids` يجمع المبالغ دون تحويل، و`enterTenderBid` يقبل أي عملة من ثلاثة أحرف. القرار: منع العملة المختلفة أم تحويل بسعر معتمد؟
5. **من يصحح العرض أو يسحبه.** أي حامل `project.tender.bids` يستطيع تعديل أي عرض في الحزمة، لا مُدخله وحده. هل هذا مقصود؟
6. **حد المنافسة.** هل عرضان هما الحد الأدنى للمقارنة؟ وهل عشرة أحرف كافية للتسبيب؟
7. **حالة `declined`.** `tender_invitees.status` تحمل القيمة `declined` بلا إجراء يضبطها. هل يُضاف إجراء أم تُحذف القيمة؟
8. **الإغلاق عند الموعد.** `closingAt` محفوظ ولا يغلق الحزمة آليًا. هل يُطلب الإغلاق التلقائي؟
9. **تفعيل العقد.** العقد يُنشأ `draft`، ولا توجد خطوة معرّفة لتفعيله. من يفعّله، ومتى؟

**عيوب في الكود (OPEN):**
- **سباق في `transitionTenderPackage`.** الـUPDATE يحدّد `id` دون شرط على الحالة، فإن تزامن إلغاء مع ترسية قد يحوّل حزمة `awarded` إلى `cancelled` وتبقى العقد والالتزام قائمين. الإصلاح: شرط `status` على الحالة السابقة، وفحص `affectedRows`.
- **فحص `affectedRows` مفقود** في `transitionTenderPackage`، و`withdrawTenderBid`، و`disqualifyTenderBid`، و`addTenderBidAdjustment`، و`removeTenderBidAdjustment`، ولا يفحص `awardTender` إلا الصف الواحد للحزمة. الإصلاح: الرمز المقترح `PROJECT_OS_TENDER_STATE_CHANGED`، ويُضاف إلى `shared/projectErrors.ts`.
- **نموذج الترسية** يظهر لمُدخل العرض (البند 3).
- **تدقيق بلا عمود مشروع.** `projectId` داخل `metadata` نص JSON، فاستعلام التدقيق حسب المشروع يحتاج تحليل النص. لا يغيّر الصلاحيات، لكنه يبطئ التقارير.
- **معرّفات الترسية بلا FK.** `awardedBidId` و`awardedContractId` و`awardedCommitmentId` بلا مفتاح خارجي في المخطط.

**قيود مقترحة (PROPOSED، تحتاج تحققًا من دعم TiDB لها):**
- `CHECK (amount > 0)` على `tender_bids.amount`.
- `CHECK` يربط إشارة `amount` بـ`kind` في `tender_bid_adjustments`.
- `CHECK` يربط الحقول المرسّاة بـ`status = 'awarded'` في `tender_packages`.
- المحرك: لا يُضاف أي قيد قبل الفحص على TiDB، ولا يُعتمد التحقق بالخدمة وحدها.

**مخاطر تشغيلية:**
- `contracts_project_code_unique` و`commitments_project_code_unique` تكشفان التكرار بالرمز `PROJECT_OS_TENDER_DUPLICATE` الذي يخفي سببه الحقيقي (عقد أم التزام). الرسالة لا تحدد أيهما.
- الترسية تنشئ عقدًا بعملة العرض، بينما عملة المشروع قد تختلف. لا فحص يربط العملتين.
