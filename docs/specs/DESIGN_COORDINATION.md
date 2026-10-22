# مواصفة التنسيق الفني والمعماري (DESIGN_COORDINATION)

## 1. الهدف والنطاق

**الحالة:** مواصفة بنائية مبنية على الكود في الفرع `main` عند `da61754`. لا تغيّر هذه الوثيقة أي صف في `docs/STATE.md`، ولا تُعد دليل `PROVEN`.

**المحرك:** تستعمل المواصفة أنواع MySQL/TiDB كما في `drizzle/schema.ts`: `varchar(36)` للمعرّفات، و`int` لمعرّف المستخدم، و`mysqlEnum` للحالات، و`boolean`، و`timestamp`. لم تُكتب بمفردات PostgreSQL، للسبب نفسه المذكور في `docs/specs/TENDERING.md` البند 1، وهو قرار المالك (البند 8.1).

**الهدف:** تنظيم مرحلة التصميم في مشروع واحد عبر خمسة أجزاء:
1. سجل المخططات ومراجعاتها: تسجيل المخطط، وإصدار مراجعة جديدة، وإلغاء المخطط، واعتماده للتنفيذ.
2. الإرساليات (`design_transmittals`): إرسال مراجعات حالية إلى جهة خارجية أو استلامها.
3. تعليقات مراجعة التصميم (`design_comments`): تسجيل التعليق، والرد عليه، وإغلاقه.
4. التقديمات للاستشاري (`design_submittals`): إرسال وثيقة للاستشاري، ثم تسجيل ردّه بأحد الرموز A/B/C/D، ثم إعادة التقديم عند C أو D.
5. لوحة مرحلة التصميم: عدادات تُحسب في قاعدة البيانات، وتُختصر بدالة نقية.

**داخل النطاق:** الجداول الستة، وقواعد الحالة، وفصل المهام بين الأشخاص، والتحقق من سلطة التخصص، وشاشة المشروع، والرفض الصريح.

**خارج النطاق:**
- ملفات المخططات نفسها. لا يحمل `design_drawings` أي حقل ملف، والسجل بيانات وصفية فقط.
- طلبات المعلومات (RFI) والعيوب (NCR)، فلها وحدتهما (`project.rfi.manage`، و`project.ncr.manage`).
- تكامل مع بيئة بيانات مشتركة (CDE) أو مع برامج النمذجة.
- بوابة للاستشاري الخارجي.
- الإحالات (الإحالات): لا يوجد لها أي كيان في الكود. انظر البند 2.7 والبند 8.

**وحدات نقية مخططة لا وجود لها في هذا الفرع:** `server/domain/drawingRevisions.ts`، و`server/domain/referralNumbering.ts`، و`server/domain/designReviewComments.ts`، و`server/domain/submittalReplies.ts`. تعمل بأسمائها هنا كمكان مخطط لقواعد الترقيم والمراجعات والتعليقات والردود، ولا تعتمد المواصفة على صادراتها. `server/domain/bidComparison.ts` المخطط يخص المناقصات، وهو موضح في `docs/specs/TENDERING.md`.

**المصادر الحالية:** `server/designService.ts` (كل الدوال المصدَّرة)، و`server/domain/designCoordination.ts` (`disciplineAuthority`، و`commentTransitions`، و`transmittalTransitions`، و`replyAllowsWork`، و`replyRequiresResubmission`، و`summariseDrawings`)، و`shared/designDisciplines.ts` (`DESIGN_DISCIPLINES`)، و`drizzle/schema.ts` (من `designDrawings` إلى `designSubmittals`)، و`server/routers.ts` (المجموعة `design`).

## 2. الجداول والحقول والقيود

كل جدول يحمل `tenantId` و`projectId`، وكل استعلام يُقيَّد بهما معًا عبر `mine()` في `server/designService.ts`. المخطط لا يحتوي على قيود `CHECK`. الحالات مُمثَّلة بـ`mysqlEnum`، وانتقالات الحالة في الخدمة.

### 2.1 `design_drawings` (`designDrawings`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `drawingNumber` | varchar(120) | لا | — | رقم المخطط يكتبه المنسق |
| `title` | varchar(255) | لا | — | |
| `discipline` | mysqlEnum(`architectural`، `interior`، `landscape`، `structural`، `civil`، `mechanical`، `electrical`، `plumbing`، `fire_fighting`، `other`) | لا | — | مصدره `DESIGN_DISCIPLINES` |
| `status` | mysqlEnum(`registered`، `under_review`، `approved`، `cancelled`) | لا | `registered` | |
| `currentRevision` | varchar(20) | لا | — | نسخة نصية من الرمز الحالي، مكررة مع `isCurrent` |
| `createdByUserId` | int | لا | — | FK ← `users.id` |
| `createdAt` | timestamp | لا | الآن | |
| `updatedAt` | timestamp | لا | الآن، ويتجدد عند التعديل | |

- UNIQUE `design_drawings_project_number_unique` على (`projectId`, `drawingNumber`).
- INDEX `design_drawings_tenant_project_status_idx` على (`tenantId`, `projectId`, `status`, `discipline`).

### 2.2 `design_drawing_revisions` (`designDrawingRevisions`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `drawingId` | varchar(36) | لا | — | FK ← `design_drawings.id` |
| `revision` | varchar(20) | لا | — | رمز المراجعة (A، B، ...) |
| `description` | varchar(500) | نعم | — | |
| `isCurrent` | boolean | لا | `true` | مراجعة واحدة فقط يجب أن تكون حالية لكل مخطط (انظر البند 8) |
| `issuedAt` | timestamp | لا | الآن | |
| `issuedByUserId` | int | لا | — | FK ← `users.id`. مُصدر المراجعة لا يعتمدها |
| `approvedAt` | timestamp | نعم | — | |
| `approvedByUserId` | int | نعم | — | FK ← `users.id` |

- UNIQUE `design_revisions_drawing_revision_unique` على (`drawingId`, `revision`).
- INDEX `design_revisions_tenant_project_idx` على (`tenantId`, `projectId`, `drawingId`).

### 2.3 `design_transmittals` (`designTransmittals`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `transmittalNumber` | varchar(120) | لا | — | |
| `direction` | mysqlEnum(`outgoing`، `incoming`) | لا | `outgoing` | |
| `counterparty` | varchar(255) | لا | — | اسم الجهة المرسل إليها أو المستلمة |
| `subject` | varchar(255) | لا | — | |
| `status` | mysqlEnum(`draft`، `sent`، `acknowledged`) | لا | `draft` | |
| `sentAt` | timestamp | نعم | — | |
| `acknowledgedAt` | timestamp | نعم | — | |
| `createdByUserId` | int | لا | — | FK ← `users.id` |
| `createdAt` | timestamp | لا | الآن | |

- UNIQUE `design_transmittals_project_number_unique` على (`projectId`, `transmittalNumber`).
- INDEX `design_transmittals_tenant_project_status_idx` على (`tenantId`, `projectId`, `status`).

### 2.4 `design_transmittal_items` (`designTransmittalItems`)

| الحقل | النوع | قابل للفراغ | ملاحظة |
|---|---|---|---|
| `id` | varchar(36) | لا | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | FK ← `projects.id` |
| `transmittalId` | varchar(36) | لا | FK ← `design_transmittals.id` |
| `revisionId` | varchar(36) | لا | FK باسم `design_trm_items_revision_fk` ← `design_drawing_revisions.id` |

- UNIQUE `design_transmittal_items_unique` على (`transmittalId`, `revisionId`).
- INDEX `design_transmittal_items_revision_idx` على (`revisionId`).
- الاسم اليدوي للمفتاح الخارجي بسبب حد 64 حرفًا في MySQL، كما يذكر تعليق `drizzle/schema.ts`.

### 2.5 `design_comments` (`designComments`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `drawingId` | varchar(36) | لا | — | FK ← `design_drawings.id` |
| `revisionId` | varchar(36) | لا | — | FK ← `design_drawing_revisions.id`. المراجعة التي عُلِّق عليها |
| `commentNumber` | varchar(120) | لا | — | |
| `raisedBy` | varchar(255) | لا | — | اسم الجهة أو الشخص كما يُكتب في المراجعة (نص حر) |
| `severity` | mysqlEnum(`minor`، `major`، `critical`) | لا | `minor` | |
| `commentText` | text | لا | — | |
| `status` | mysqlEnum(`open`، `responded`، `closed`) | لا | `open` | |
| `responseText` | text | نعم | — | يُلغى عند الرفض والعودة إلى `open` |
| `respondedAt` | timestamp | نعم | — | |
| `respondedByUserId` | int | نعم | — | FK ← `users.id` |
| `closedAt` | timestamp | نعم | — | |
| `closedByUserId` | int | نعم | — | FK ← `users.id` |
| `dueAt` | timestamp | نعم | — | موعد الرد. يُحسب التأخر منه |
| `createdByUserId` | int | لا | — | FK ← `users.id` |
| `createdAt` | timestamp | لا | الآن | |

- UNIQUE `design_comments_project_number_unique` على (`projectId`, `commentNumber`).
- INDEX `design_comments_tenant_project_status_idx` على (`tenantId`, `projectId`, `status`, `dueAt`)، وINDEX `design_comments_drawing_idx` على (`drawingId`, `status`).

### 2.6 `design_submittals` (`designSubmittals`)

| الحقل | النوع | قابل للفراغ | الافتراضي | ملاحظة |
|---|---|---|---|---|
| `id` | varchar(36) | لا | — | المفتاح الأساسي |
| `tenantId` | varchar(36) | لا | — | FK ← `companies.id` |
| `projectId` | varchar(36) | لا | — | FK ← `projects.id` |
| `submittalNumber` | varchar(120) | لا | — | |
| `title` | varchar(255) | لا | — | |
| `discipline` | mysqlEnum (مثل `design_drawings.discipline`) | لا | — | تحكم سلطة الإرسال (`submitted`) فقط، ولا يفحص الرد تخصصه (انظر البند 4) |
| `drawingId` | varchar(36) | نعم | — | FK ← `design_drawings.id` |
| `resubmissionOfId` | varchar(36) | نعم | — | بلا FK في المخطط. يشير إلى التقديم الأصلي |
| `status` | mysqlEnum(`draft`، `submitted`، `replied`، `closed`) | لا | `draft` | |
| `submittedAt` | timestamp | نعم | — | |
| `submittedByUserId` | int | نعم | — | FK ← `users.id` |
| `dueAt` | timestamp | نعم | — | موعد الرد |
| `replyCode` | mysqlEnum(`A`، `B`، `C`، `D`) | نعم | — | يُملأ مع `status = replied` |
| `replyNote` | text | نعم | — | |
| `repliedAt` | timestamp | نعم | — | |
| `repliedByUserId` | int | نعم | — | FK ← `users.id` |
| `createdByUserId` | int | لا | — | FK ← `users.id` |
| `createdAt` | timestamp | لا | الآن | |

- UNIQUE `design_submittals_project_number_unique` على (`projectId`, `submittalNumber`).
- INDEX `design_submittals_tenant_project_status_idx` على (`tenantId`, `projectId`, `status`, `dueAt`).

### 2.7 قواعد الحالة

**المخطط (`design_drawings.status`):**
- `registered` عند التسجيل وعند كل إصدار مراجعة جديدة. الإصدار يجعل المراجعة السابقة غير حالية، ويُلغي أي اعتماد سابق (`addDesignRevision`).
- `registered` → `under_review` عند إرسال إرسالية صادرة تحمل المراجعة الحالية، ولا يتم ذلك إلا من `registered` (`transitionDesignTransmittal`).
- `under_review` → `approved` عند الاعتماد: يُشترط أن يكون المخطط `under_review`، وألا يكون معتمِد المراجعة هو مُصدرها، وألا توجد تعليقات `open` أو `responded` على المراجعة الحالية (`approveDesignDrawing`).
- `cancelled` نهائي. أي عمل جديد عليه يُرفض بـ`PROJECT_OS_DESIGN_DRAWING_CANCELLED`.

**التعليقات (`design_comments.status`):** `open` → `responded` بالرد، ويُشترط نص غير فارغ بعد `trim` (`transitionDesignComment`). `responded` → `closed` بقرار المعتمد، ولا يُغلقه من ردّ عليه. `responded` → `open` عند رفض الرد.

**الإرساليات (`design_transmittals.status`):** `draft` → `sent` → `acknowledged`. إرسالية فارغة لا تُنشأ.

**التقديمات (`design_submittals.status`):** `draft` → `submitted` → `replied` → `closed`. إعادة التقديم تُنشأ بعد أن يكون قد رُدّ على الأصل بالرمز C أو D، أي أن يكون `replied` أو `closed` (`createDesignSubmittal`). A وB تسمحان بالعمل، وC وD تُعيدان الوثيقة (`replyAllowsWork`، و`replyRequiresResubmission`).

**فصل المهام بين الأشخاص:** مُصدر المراجعة لا يعتمدها. من أجاب على تعليق لا يغلقه. مُرسل التقديم لا يسجّل الرد عليه.

**الإحالات:** لا يوجد كيان للإحالات في الكود. أي شاشة أو جدول يُذكر تحت هذا الاسم مقترح ويحتاج قرار المالك (البند 8.2).

### 2.8 صفوف التدقيق: كل كتابة في معاملتها

| الإجراء (`action`) | `entityType` | الدالة |
|---|---|---|
| `design.drawing_registered` | `design_drawing` | `registerDesignDrawing` (تكتب المخطط ومراجعته الأولى) |
| `design.revision_added` | `design_drawing` | `addDesignRevision` |
| `design.drawing_cancelled` | `design_drawing` | `cancelDesignDrawing` |
| `design.drawing_approved` | `design_drawing` | `approveDesignDrawing` |
| `design.transmittal_created` | `design_transmittal` | `createDesignTransmittal` |
| `design.transmittal_status_transitioned` | `design_transmittal` | `transitionDesignTransmittal` |
| `design.comment_raised` | `design_comment` | `raiseDesignComment` |
| `design.comment_status_transitioned` | `design_comment` | `transitionDesignComment` |
| `design.submittal_created` | `design_submittal` | `createDesignSubmittal` |
| `design.submittal_status_transitioned` | `design_submittal` | `transitionDesignSubmittal` |

## 3. الشاشات

**المسار:** لا توجد صفحة مستقلة. القسم داخل صفحة الضبط `/projects/:tenantId/:projectId/controls` (`client/src/pages/ProjectControls.tsx`)، بالمعرّف `manager-design` وعنوان «التنسيق الفني والمعماري»، ويُحمَّل كسولًا. المكوّن `client/src/pages/ProjectDesign.tsx`. كل زر كتابة يُغلَّف بـ`WriteGate` من `client/src/lib/permissions.tsx`.

| الجزء | من يراه | ما يفعله | الحالة الفارغة أو التحميل |
|---|---|---|---|
| لوحة مرحلة التصميم | من يملك `project.read` | يقرأ العدادات من `design.dashboard` | تحميل نصي، ولا مخططات: نص يقول إن المرحلة لم تُسجَّل بعد، وليس «0%» ولا «100%» |
| سجل المخططات والمراجعات | `project.read` للقراءة | يسجل مخططًا (`project.design.manage`)، ويصدر مراجعة، ويلغي مخططًا، ويعتمد مخططًا تحت المراجعة (`project.design.approve`) | نص `t.empty` للسجل الفارغ |
| الإرساليات | القراءة لـ`project.read` | ينشئ إرسالية من مراجعات حالية ويرسلها ويستلمها (`project.design.manage`) | نص `t.empty` |
| تعليقات المراجعة | القراءة لـ`project.read` | يسجل تعليقًا، ويرد عليه (`project.design.manage`)، ويغلقه (`project.design.approve`) | نص `t.empty` |
| التقديمات للاستشاري | القراءة لـ`project.read` | ينشئ تقديمًا، ويرسله، ويغلقه (`project.design.manage`)، ويسجل الرد A/B/C/D (`project.design.approve`) | نص `t.empty` |

**الأخطاء:** تظهر في `role="alert"` عبر `getLocalizedProjectError`.

**ملاحظات واجهة:**
- أزرار الرد A/B/C/D وإغلاق التعليق خلف `project.design.approve`. الواجهة لا تُخفي زر الإغلاق عمّن ردّ على التعليق نفسه، والخادم وحده يرفض ذلك (انظر البند 6.9).
- لم أتحقق من أن قائمة التخصصات في نموذج التسجيل تُصفّى حسب سلطة المستخدم. الخادم هو الذي يرفض، والتصفية في الواجهة غير مُثبتة.
- عدادات اللوحة: مخططات حسب التخصص مع نسبة الاعتماد (المعتمد من غير الملغى)، وتعليقات مفتوحة ومردود عليها ومغلقة ومتأخرة (`dueAt` مضى)، وتقديمات مسودة ومنتظرة الرد ومردودة ومغلقة ومتأخرة، ومتوسط أيام الرد، وعدد كل رمز A/B/C/D، وإرساليات حسب الحالة.

## 4. الصلاحيات

كل إجراء يمر بـ`assertDesignAccess` في `server/designService.ts`: عضوية نشطة، ثم ترخيص `PROJECT`، ثم الصلاحية المسمّاة، ثم نطاق المشروع، ثم أن يتبع المشروع للمستأجر. الرموز الأربعة موجودة في `operationalPermissionCatalog` في `server/domain/operationalRoles.ts` (السطور 33 إلى 37)، و`project.read` في `ownerPermissions` في `server/db.ts`.

| الرمز | يُمنح لـ | الإجراءات التي يحميها | الوجود في المصدر |
|---|---|---|---|
| `project.read` | القراءة | `listDesignDrawings`، `listDesignRevisions`، `listDesignTransmittals`، `listDesignComments`، `listDesignSubmittals`، `getDesignDashboard` | `ownerPermissions` في `server/db.ts` |
| `project.design.manage` | إدارة السجل والإرساليات والتعليقات والتقديمات | `registerDesignDrawing`، `addDesignRevision`، `cancelDesignDrawing`، `createDesignTransmittal`، `transitionDesignTransmittal`، `raiseDesignComment`، `transitionDesignComment` (إلى `responded`)، `createDesignSubmittal`، `transitionDesignSubmittal` (إلى `submitted` أو `closed`) | `operationalPermissionCatalog` |
| `project.design.approve` | الاعتماد وتسجيل الرد | `approveDesignDrawing`، و`transitionDesignComment` (إلى `closed` أو `open`)، و`transitionDesignSubmittal` (إلى `replied`) | `operationalPermissionCatalog` |
| `project.design.architectural` | سلطة على التخصصات المعمارية | شرط إضافي على الإجراءات المذكورة في الجدول أدناه | `operationalPermissionCatalog` |
| `project.design.technical` | سلطة على التخصصات الفنية | شرط إضافي على الإجراءات المذكورة في الجدول أدناه | `operationalPermissionCatalog` |

**سلطة التخصص:** `disciplineAuthority` في `server/domain/designCoordination.ts`:
- `architectural`، و`interior`، و`landscape` تتطلب `project.design.architectural`.
- `structural`، و`civil`، و`mechanical`، و`electrical`، و`plumbing`، و`fire_fighting` تتطلب `project.design.technical`.
- `other` يكفي فيه أيٌّ من الرمزين.

**الإجراءات التي تفحص سلطة التخصص:** `registerDesignDrawing`، و`addDesignRevision`، و`cancelDesignDrawing`، و`createDesignTransmittal` (لكل تخصص في المراجعات المختارة)، و`raiseDesignComment`، و`createDesignSubmittal`، و`transitionDesignSubmittal` (إلى `submitted`).

**الإجراءات التي لا تفحص سلطة التخصص:** `approveDesignDrawing`، و`transitionDesignComment`، و`transitionDesignSubmittal` (إلى `replied` أو `closed`)، و`transitionDesignTransmittal`. أي حامل `project.design.approve` يعتمد مخططات كل التخصصات. انظر البند 8.

**فصل المهام على مستوى القوى:** `conflictingPermissionPairs` في `server/domain/operationalPermissions.ts`: `project.design.manage` مع `project.design.approve` (السبب المكتوب: «من يصدر مخططًا لا يعتمده، ولا يسجل رد الاستشاري على تقديمه»). يُفرض عند إنشاء الدور وتعديله وإسناده في `server/db.ts`.

**فصل المهام على مستوى الأشخاص:**
- `approveDesignDrawing`: `revision.issuedByUserId === input.userId` يعيد `PROJECT_OS_DESIGN_SELF_APPROVAL`.
- `transitionDesignComment` إلى `closed`: `comment.respondedByUserId === input.userId` يعيد `PROJECT_OS_DESIGN_SELF_CLOSE`.
- `transitionDesignSubmittal` إلى `replied`: `submittal.submittedByUserId === input.userId` يعيد `PROJECT_OS_DESIGN_SELF_REPLY`.
- هذه القواعد تسري على المالك أيضًا، كما تقول تعليقات `server/designService.ts`.

**رموز جديدة:** لا يلزم رمز صلاحية جديد. قرار الاعتماد وسلطة التخصص يحتاج قرار المالك (البند 8).

## 5. حالات الرفض

الرموز المعرّبة من `shared/designDisciplines.ts` و`shared/projectErrors.ts` (الرسائل مُعرّفة لكل رمز هنا). الأخطاء العامة للصلاحية والعضوية تُحوَّل كما في `docs/specs/TENDERING.md` البند 5.

| # | الحالة | رمز tRPC | الرمز المعرّب | ما يراه المستخدم |
|---|---|---|---|---|
| 1 | لا عضوية أو لا وصول للمستأجر | FORBIDDEN | `PROJECT_OS_TENANT_ACCESS_DENIED` | رسالة الوصول في تنبيه |
| 2 | الصلاحية غير ممنوحة، أو سلطة التخصص غير متوفرة، أو النطاق لا يغطي المشروع | FORBIDDEN | `PROJECT_OS_PERMISSION_DENIED` | قبل الإرسال: نص `WriteGate`. بعده: التنبيه |
| 3 | الشركة لا تملك منتج PROJECT | FORBIDDEN | `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة عدم الترخيص |
| 4 | المشروع لا يتبع الشركة | NOT_FOUND | `PROJECT_OS_PROJECT_NOT_FOUND` | رسالة عدم الوجود |
| 5 | المخطط غير موجود في المستأجر والمشروع | NOT_FOUND | `PROJECT_OS_DESIGN_DRAWING_NOT_FOUND` | رسالة عدم الوجود |
| 6 | لا توجد مراجعة حالية، أو المراجعة المطلوبة غير موجودة، أو معرّف مراجعة في الإرسالية غير موجود | NOT_FOUND | `PROJECT_OS_DESIGN_REVISION_NOT_FOUND` | رسالة عدم الوجود |
| 7 | إجراء على مخطط ملغى | CONFLICT | `PROJECT_OS_DESIGN_DRAWING_CANCELLED` | رسالة الإلغاء |
| 8 | تعليق على مخطط معتمد | CONFLICT | `PROJECT_OS_DESIGN_DRAWING_APPROVED` | رسالة الاعتماد |
| 9 | اعتماد مخطط ليس `under_review` | CONFLICT | `PROJECT_OS_DESIGN_APPROVAL_STATE_INVALID` | رسالة حالة الاعتماد |
| 10 | المعتمِد هو مُصدر المراجعة | CONFLICT | `PROJECT_OS_DESIGN_SELF_APPROVAL` | رسالة فصل المهام |
| 11 | تعليقات مفتوحة أو مردود عليها على المراجعة الحالية | CONFLICT | `PROJECT_OS_DESIGN_OPEN_COMMENTS` | رسالة التعليقات |
| 12 | إرسالية بلا مراجعات | BAD_REQUEST | `PROJECT_OS_DESIGN_TRANSMITTAL_EMPTY` | رسالة الإرسالية الفارغة |
| 13 | إرسالية غير موجودة | NOT_FOUND | `PROJECT_OS_DESIGN_TRANSMITTAL_NOT_FOUND` | رسالة عدم الوجود |
| 14 | انتقال إرسالية غير مسموح | BAD_REQUEST | `PROJECT_OS_DESIGN_TRANSMITTAL_TRANSITION_INVALID` | رسالة الانتقال |
| 15 | تعليق غير موجود | NOT_FOUND | `PROJECT_OS_DESIGN_COMMENT_NOT_FOUND` | رسالة عدم الوجود |
| 16 | انتقال تعليق غير مسموح | BAD_REQUEST | `PROJECT_OS_DESIGN_COMMENT_TRANSITION_INVALID` | رسالة الانتقال |
| 17 | الرد على تعليق بنص فارغ | BAD_REQUEST | `PROJECT_OS_DESIGN_COMMENT_RESPONSE_REQUIRED` | رسالة الرد المطلوب |
| 18 | من ردّ على التعليق يحاول إغلاقه | CONFLICT | `PROJECT_OS_DESIGN_SELF_CLOSE` | رسالة فصل المهام |
| 19 | تقديم غير موجود | NOT_FOUND | `PROJECT_OS_DESIGN_SUBMITTAL_NOT_FOUND` | رسالة عدم الوجود |
| 20 | انتقال تقديم غير مسموح | BAD_REQUEST | `PROJECT_OS_DESIGN_SUBMITTAL_TRANSITION_INVALID` | رسالة الانتقال |
| 21 | تسجيل رد بلا رمز A/B/C/D | BAD_REQUEST | `PROJECT_OS_DESIGN_REPLY_CODE_REQUIRED` | رسالة الرمز المطلوب |
| 22 | مُرسل التقديم يسجل رده | CONFLICT | `PROJECT_OS_DESIGN_SELF_REPLY` | رسالة فصل المهام |
| 23 | إعادة تقديم لتقديم لم يُرد عليه بـC أو D | CONFLICT | `PROJECT_OS_DESIGN_RESUBMISSION_INVALID` | رسالة إعادة التقديم |
| 24 | رقم أو رمز مراجعة مكرر في المشروع أو المخطط | CONFLICT | `PROJECT_OS_DESIGN_DUPLICATE` | رسالة التكرار. تُلغى المعاملة |
| 25 | مدخل مرفوض بمخطط `zod` | BAD_REQUEST | `PROJECT_OS_REQUEST_FAILED` | «تعذر إتمام الطلب. تحقق من البيانات» |
| 26 | تحديث محمي لم يتأثر بأي صف (مقترح) | CONFLICT | `PROJECT_OS_DESIGN_STATE_CHANGED` (جديد) | «تغيّرت حالة العنصر. أعد تحميل القسم» |

**قاعدة الرفض:** لا فشل صامت. الخدمة اليوم لا تفحص عدد الصفوف المتأثرة في أي تحديث محمي، وهذا عيب (البند 8). الرمز 26 مقترح ويُضاف إلى `shared/projectErrors.ts`.

## 6. معايير القبول

1. تسجيل مخطط بتخصص لا تملك سلطته يُرفض بـ`PROJECT_OS_PERMISSION_DENIED`، ولا يُكتب أي صف.
2. تسجيل مخطط يكتب المخطط ومراجعته الأولى ومعرّفهما في معاملة واحدة، ويكتب `design.drawing_registered`.
3. إصدار مراجعة يجعل السابقة غير حالية، ويعيد المخطط إلى `registered`، ويلغي أي اعتماد سابق، ولا يكرر رمز المراجعة (`PROJECT_OS_DESIGN_DUPLICATE`).
4. لا توجد لحظة يكون فيها أكثر من مراجعة حالية واحدة لكل مخطط (انظر البند 8).
5. المخطط الملغى لا يقبل أي عمل جديد: مراجعة، أو إرسالية، أو تعليق، أو تقديم.
6. إرسال إرسالية صادرة يحول المخطط `registered` إلى `under_review` إن كانت المراجعة حالية. المخطط المعتمد أو المُلغى لا يتغير.
7. الاعتماد لا يقبل إلا مخططًا `under_review`، ولا يقبله مُصدر المراجعة، ولا مع تعليق `open` أو `responded` على المراجعة الحالية.
8. تعليق بلا رد لا يُغلق. الرد بنص فارغ يُرفض.
9. من ردّ على تعليق لا يغلقه. الإغلاق بعد الرد يُسجَّل بـ`closedByUserId` في المعاملة نفسها.
10. رفض الرد يعيد التعليق إلى `open` ويمسح `responseText`.
11. التقديم يُرسل من `draft` فقط. الرد يُسجَّل بأحد A/B/C/D من `submitted` فقط، ومُرسل التقديم لا يرد عليه.
12. إعادة التقديم لا تُقبل إلا إذا كان الأصل `replied` بـC أو D.
13. عدادات اللوحة تُحسب في قاعدة البيانات، وتستبعد المخطط الملغى من نسبة الاعتماد. لا مخططات تعني «لا نسبة»، وليس 0%.
14. كل كتابة تنتج صف التدقيق المذكور في البند 2.8 في المعاملة نفسها، وفيه `projectId` داخل `metadata`.
15. كل تحديث محمي يفحص عدد الصفوف المتأثرة، وصفر صفوف ينتج خطأ صريحًا.
16. عزل المستأجر والمشروع: أي معرّف من مستأجر أو مشروع آخر يعيد `NOT_FOUND` ولا يكشف وجود العنصر.
17. العرض يتطلب `project.read` في المشروع. المالك يرى كل شيء، والدور المقيّد بمشروع آخر لا يرى شيئًا من هذا المشروع.
18. لا يظهر زر الاعتماد إلا لمخطط `under_review` لمن يملك `project.design.approve`. ولا يظهر زر إغلاق التعليق لمن ردّ عليه.
19. السجل الفارغ يقول ذلك صراحة، واللوحة بلا مخططات لا تعرض نسبة.
20. كل الرسائل بالعربية والإنجليزية.

## 7. الاختبارات المطلوبة

**اختبارات وحدة (دوال نقية، دون قاعدة):**
- **لا يوجد اختبار وحدة لـ`server/domain/designCoordination.ts` في الفرع الحالي.** مطلوب إنشاء `server/domain/designCoordination.test.ts` يغطي:
  - `replyAllowsWork` و`replyRequiresResubmission` لكل من A وB وC وD.
  - `commentTransitions` و`transmittalTransitions` كاملة: كل زوج مسموح ومرفوض.
  - `disciplineAuthority` لكل تخصص من `DESIGN_DISCIPLINES`، بما فيه `other` الذي يقبل الرمزين.
  - `summariseDrawings`: قائمة فارغة تعيد `completionPercent: null`، والمخطط الملغى لا يدخل المجموع، وتقريب النسبة إلى منزلة عشرية واحدة، وترتيب التخصصات أبجديًا.
- المطلوب بعد قرار البند 8.4: اختبار لحالة معتمد على مراجعة سابقة مفتوحة التعليقات.

**اختبارات تكامل قاعدة البيانات (على `project_os_integration_test` فقط، وتُتخطى بلا `TEST_DATABASE_URL`):**
- الموجود: `server/design.coordination.database.test.ts` (8 اختبارات): حدود الدور الذي يصدر ويعتمد، وتسجيل المخطط بسلطة التخصص، والمراجعة الجديدة، ودورة المخطط كاملة من الإرسالية إلى الاعتماد، وA/B/C/D وإعادة التقديم، وعدادات اللوحة، والعزل، وصفوف التدقيق والإلغاء.
- المطلوب: سباق بين `addDesignRevision` و`approveDesignDrawing` على المخطط نفسه. النتيجة المقبولة: لا يصبح المخطط `approved` وفي `currentRevision` مراجعة لم تُعتمد.
- المطلوب: إرسالية صادرة إلى مخطط ملغى تُرفض بـ`PROJECT_OS_DESIGN_DRAWING_CANCELLED`.
- المطلوب: تقديم ثانٍ لنفس الأصل بـC يُرفض.
- المطلوب: صفر صفوف في كل تحديث محمي ينتج `PROJECT_OS_DESIGN_STATE_CHANGED` (بعد القرار).
- المطلوب بعد قرار البند 8.3: سلطة التخصص على الاعتماد والردود.

**اختبارات مكوّنات الواجهة:**
- الموجود: `client/src/pages/ProjectDesign.interaction.test.tsx` (5 اختبارات): اللوحة بالعربية مع نسبة الاعتماد والردود، وتسجيل مخطط، وزر الاعتماد للمخطط تحت المراجعة وردود A-D، وإغلاق تعليق وإرسالية مسودة، والإنجليزية والسجل الفارغ.
- المطلوب: اللوحة بلا مخططات تعرض نص «لم تُسجَّل بعد»، لا «0%».
- المطلوب: من ردّ على تعليق لا يرى زر الإغلاق.
- المطلوب: زر الاعتماد غائب لمخطط ليس `under_review`.

## 8. مخاطر وأسئلة مفتوحة

**قرارات المالك (BLOCKED_BY_OWNER، لا تُفترض):**
1. **المحرك.** نفس قرار `docs/specs/TENDERING.md` البند 8.1. لا تُترجم الأنواع إلى PostgreSQL قبل قرار المالك.
2. **الإحالات (الإحالات).** لا كيان لها في الكود، ولا تعريف لها في الوثائق المرجعية. هل المقصود نقل مخطط أو تعليق إلى تخصص آخر أو جهة أخرى لإجراء محدد؟ من يُحيل، ومن يقبل، وما حالاتها، وهل لها ترقيم خاص (`server/domain/referralNumbering.ts` المخطط)؟
   - المقترح (PROPOSED): جدول `design_referrals` بحقول `id` وَ`tenantId` وَ`projectId` وَ`referralNumber` (UNIQUE مع `projectId`)، و`drawingId` (FK اختياري)، و`fromDiscipline` و`toDiscipline` (mysqlEnum من `DESIGN_DISCIPLINES`)، و`toParty` (varchar(255)، نص حر)، و`reason` (text)، و`status` (mysqlEnum: `open`، `accepted`، `returned`، `closed`)، و`dueAt`، و`createdByUserId`، و`createdAt`. يحتاج هذا التعريف قرارًا من المالك قبل البناء.
3. **سلطة التخصص على الاعتماد والرد.** `approveDesignDrawing` و`transitionDesignSubmittal` (إلى `replied`) لا يفحصان التخصص. هل يعتمد منسق معماري مخططًا إنشائيًا، أو يعتمد منسق فني مخططًا معماريًا؟ هل يُربط الاعتماد بسلطة التخصص؟
4. **التعليقات على المراجعات السابقة.** `approveDesignDrawing` يعد التعليقات المفتوحة على المراجعة الحالية فقط. تعليق مفتوح على مراجعة أقدم لا يمنع الاعتماد، بينما يظهر في عداد `unresolvedComments` في `listDesignDrawings`. هل هذا مقصود؟
5. **عدد إعادات التقديم.** `createDesignSubmittal` يسمح بأكثر من إعادة تقديم لأصل واحد بـC أو D، لأنه لا يتحقق من وجود إعادة سابقة. هل تُقصر على واحدة؟
6. **نص حر في `raisedBy`.** يُكتب فيه اسم الجهة أو الشخص. سياسة البيانات الشخصية (`docs/PILOT_DATA_POLICY.md`) تمنع أسماء حقيقية في الاختبارات والتقارير، فهل يُفرض قالب لهذا الحقل (جهة، لا اسم)؟
7. **الترقيم.** هل أرقام المخططات والتقديمات والتعليقات يكتبها المنسق دائمًا، أم يُقترح ترقيم تلقائي؟ الترقيم التلقائي يحتاج `server/domain/drawingRevisions.ts` و`server/domain/referralNumbering.ts` المخطط.

**عيوب في الكود (OPEN):**
- **سباق بين الإصدار والاعتماد.** `approveDesignDrawing` يقرأ المراجعة الحالية قبل المعاملة، ثم يكتب `status = approved` على المخطط دون شرط على الحالة أو على المراجعة. إن أصدر أحد مراجعة جديدة بين القراءة والكتابة، يصبح المخطط `approved` وفي `currentRevision` مراجعة لم يُنظر فيها. الإصلاح: شرط على `status = under_review` و`isCurrent` للمراجعة، وفحص `affectedRows`.
- **فحص `affectedRows` مفقود** في كل التحديثات المحمية: `addDesignRevision`، و`cancelDesignDrawing`، و`approveDesignDrawing`، و`transitionDesignTransmittal`، و`transitionDesignComment`، و`transitionDesignSubmittal`. الصفوف الصفرية تعني أن شخصًا آخر غيّر الحالة، والسجل يكتب صف تدقيق لتغيير لم يحدث.
- **عدم وجود قيد يضمن مراجعة حالية واحدة.** `isCurrent` علم في كل صف، ولا يوجد UNIQUE جزئي في MySQL. والمخطط يكرر الرمز الحالي في `currentRevision`، فحالة المراجعة في مكانين. الإصلاح المقترح: عمود مولّد (generated column) مع UNIQUE، بعد التحقق من دعم TiDB له.
- **`resubmissionOfId` بلا FK.** يمكن أن يشير إلى معرّف غير موجود إن أُدخل مباشرة في قاعدة البيانات.
- **سلطة التخصص لا تقارن تخصص التقديم بتخصص المخطط المرتبط به** (`drawingId`). تقديم تخصصه `structural` مرتبط بمخطط `architectural` يمر إن أعطى الحامل سلطة الفني.
**مخاطر تشغيلية:**
- قائمة التخصصات في `shared/designDisciplines.ts` ثابتة في الكود. إضافة تخصص تتطلب تغييرًا في المخطط (`mysqlEnum`) وفي الاختبارات.
- الإرساليات الواردة (`incoming`) لا تغيّر حالة المخططات. الكود يحصر التغيير في الصادرة، وهذا التفريق لا يظهر في الشاشة.
- `summariseDrawings` يستبعد المخطط الملغى من البسط والمقام معًا، فإلغاء مخطط معتمد يخرجه من الحسابين، وقد ترتفع النسبة أو تنخفض. هذا قرار عرض يحتاج تأكيدًا من المالك.
