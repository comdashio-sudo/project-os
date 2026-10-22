# مواصفة التنسيق الفني والمعماري بمصطلحات PostgreSQL (DESIGN_COORDINATION)

**الحالة:** مواصفة بنائية مكتوبة بمصطلحات PostgreSQL. تحل محل النسخة السابقة من هذا الملف (المكتوبة بأنواع MySQL). لا تُعد دليل `PROVEN`، ولا تغيّر أي صف في `docs/STATE.md`.

**المصادر:**
- السلوك والصلاحيات وأكواد الرد: الكود في الفرع `claude/wonderful-thompson-c3wdtm` عند `0826abc`.
- أسماء الجداول والأعمدة والقيود: `drizzle/schema.ts` و`drizzle/0000_baseline.sql` على `origin/feat/postgres-migration`.
- المحرك والدخول والتخزين: `docs/ADR-0002-POSTGRES-SUPABASE-VERCEL.md` على الفرع نفسه (قرار المالك، أمر العمل المستمر 6، 22 أكتوبر 2026).

**تنبيه قبل الاعتماد:** `CLAUDE.md` و`docs/STATE.md` على هذا الفرع ما زالا يصفان المحرك بأنه MySQL/TiDB. هذه المواصفة مكتوبة بمصطلحات PostgreSQL بطلب من المالك، ولا يُعتمد محركها على `main` قبل حسم البند R1 في القسم 8.

**الوسوم:** كل ما هو جديد ولا وجود له في الكود أو في المخطط يحمل `[PROPOSED]`. قرارات المالك تُذكر بعبارة «قرار المالك، 22 أكتوبر 2026». البنود التي تنتظر المالك تحمل `BLOCKED_BY_OWNER`.

## 1. الهدف والنطاق

### 1.1 الهدف
تنظيم مرحلة التصميم في مشروع واحد عبر خمسة أجزاء:
1. سجل المخططات ومراجعاتها (`design_drawings`، `design_drawing_revisions`).
2. الإحالات، وهي إرساليات رسمية مرقّمة تُرسل مجموعة مخططات أو وثائق إلى طرف واحد، وتحتاج تأكيد استلام منه (`design_transmittals`، `design_transmittal_items`).
3. ملاحظات مراجعة التصميم، وردّها، وإغلاقها (`design_comments`).
4. التقديمات للاستشاري: مراجعة داخلية من منسق التخصص، ثم الإرسال، ثم رد الاستشاري بأحد الرموز A/B/C/D، ثم إعادة التقديم دون حد (`design_submittals`).
5. لوحة مرحلة التصميم: عدادات تحسبها قاعدة البيانات، ويختصرها `summariseDrawings`.

### 1.2 داخل النطاق
- الجداول الستة أعلاه، وقيودها وفهارسها، وانتقالات حالتها.
- فصل المهام بين الأشخاص، والتحقق من سلطة التخصص.
- شاشة التنسيق الفني والمعماري، بما فيها لوحة المرحلة.
- الرفض الصريح لكل فعل غير مسموح، برسالة مترجمة.

### 1.3 خارج النطاق
- ملفات المخططات. لا يحمل `design_drawings` ولا `design_drawing_revisions` أي حقل ملف؛ السجل بيانات وصفية فقط.
- طلبات المعلومات (RFI) والعيوب (NCR)، ولهما وحدتاهما (`project.rfi.manage`، `project.ncr.manage`).
- تكامل مع بيئة بيانات مشتركة (CDE) أو مع برامج النمذجة.
- بوابة للاستشاري الخارجي. يسجّل الرد موظف في المشروع.
- استيراد السجلات من Excel أو CSV.
- أي جدول جديد. قرارات المالك تُغطى بالجداول القائمة (القسم 2.0).

### 1.4 ما تغيّر عن النسخة السابقة
| القرار | الأثر على المواصفة |
|---|---|
| الإحالة هي الإرسالية (قرار المالك، 22 أكتوبر 2026) | لا مفهوم جديد. `design_transmittals` بـ`direction = 'outgoing'` هي الإحالة، وتُرقَّم وفق `server/domain/referralNumbering.ts`. الكيان الذي كان `PROPOSED` في النسخة السابقة أُلغي. |
| منسق التخصص يراجع داخليًا قبل الإرسال للاستشاري (قرار المالك) | تُضاف حالة `internal_review` بين `draft` و`submitted` (القسم 2.6). |
| الرد لكل تخصص بـA/B/C/D (قرار المالك) | الرد يُسجَّل على التقديم، والتقديم يحمل تخصصًا واحدًا. |
| إعادة التقديم دون حد (قرار المالك) | يُلغى الحد الواحد في `AFTER_MIGRATION` البند D-5. لا حد لعمق السلسلة، ولكل تقديم خلف واحد فقط (قيد فريد). |
| تسميات المخططات A ... Z ثم AA، AB (قرار المالك) | المعتمد هو `revisionLabel` و`checkNewRevision` في `server/domain/drawingRevisions.ts`. |

## 2. الجداول والأعمدة والقيود والفهارس

### 2.0 قواعد عامة لكل الجداول
- كل جدول عمل يحمل `tenant_id` و`project_id` بقيد `NOT NULL`، ويشير `tenant_id` إلى `companies(id)` و`project_id` إلى `projects(id)`. الخدمة تفلتر بالاثنين في كل استعلام (`mine()` في `server/designService.ts`).
- سياسة RLS لكل جدول من هذه الجداول من فئة **جدول بـ`tenant_id`**: السياسة `project_os_isolation`، لـ`project_os_app`، بالشرط `tenant_id = ANY(app_tenant_ids()) OR app_system()`. المصدر: `project_os_apply_conventions()` في `drizzle/0000_baseline.sql`، وADR-0002 فقرة «كيف تعمل الطبقة الثانية».
- `audit_logs` له السياستان `project_os_read` و`project_os_insert`، وtriggers ترفض UPDATE وDELETE وTRUNCATE. حساب التطبيق `project_os_app` يملك `SELECT, INSERT` عليه فقط.
- كل أمر محمٍ يكتب صف تدقيق في المعاملة نفسها (القسم 2.7).
- لا جدول جديد. الإحالة تستعمل `design_transmittals` و`design_transmittal_items`. التقديم وسلسلة إعادة التقديم يستعملان `design_submittals` بعمودي `resubmission_of_id` و`resubmission_depth`.
- ترحيل التغييرات المقترحة يكون بعد `drizzle/0000_baseline.sql` في ملف جديد (اسم `PROPOSED`، لم يُنشأ هنا)، ويُراجع SQL قبل أي تطبيق كما تقضي `CLAUDE.md` القسم 4.

### 2.1 `design_drawings` (سجل المخططات)
- الأعمدة القائمة: `id`، `tenant_id`، `project_id`، `drawing_number varchar(120)`، `title varchar(255)`، `discipline` (enum `design_drawings_discipline`: architectural، interior، landscape، structural، civil، mechanical، electrical، plumbing، fire_fighting، other)، `status` (enum `design_drawings_status`: registered، under_review، approved، cancelled؛ الافتراضي registered)، `current_revision varchar(20)`، `created_by_user_id`، `created_at`، `updated_at` (trigger `set_updated_at`).
- الفريد: `design_drawings_project_number_unique (project_id, drawing_number)`. الرقم لا يُعاد استعماله داخل المشروع، والمخطط الملغى يحجزه (انظر R5 في القسم 8).
- الفهرس: `design_drawings_tenant_project_status_idx (tenant_id, project_id, status, discipline)`.
- `[PROPOSED]` `CHECK (current_revision ~ '^[A-Z]{1,10}$')`، بحد `MAX_LABEL_LETTERS = 10` في `drawingRevisions.ts`.
- `[PROPOSED]` `UNIQUE (id, project_id)` ليصلح هدفًا لمفتاح أجنبي مركب من الجداول الأبناء.

### 2.2 `design_drawing_revisions` (الإصدارات)
- الأعمدة القائمة: `id`، `tenant_id`، `project_id`، `drawing_id` (FK إلى `design_drawings`)، `revision varchar(20)`، `description varchar(500)`، `is_current boolean` (الافتراضي true)، `issued_at`، `issued_by_user_id`، `approved_at`، `approved_by_user_id`.
- الفريد: `design_revisions_drawing_revision_unique (drawing_id, revision)`. الفهرس: `design_revisions_tenant_project_idx (tenant_id, project_id, drawing_id)`.
- `[PROPOSED]` فهرس فريد جزئي على `(drawing_id) WHERE is_current`: مراجعة حالية واحدة لكل مخطط. يعالج السباق في S-3 من `AFTER_MIGRATION`.
- `[PROPOSED]` `CHECK (revision ~ '^[A-Z]{1,10}$')`. لا بيانات قديمة تحتاج تحويلًا، لأن القاعدة الجديدة نظيفة بلا نقل بيانات (ADR-0002، ومقرر في `CLAUDE.md` القسم 5).
- `[PROPOSED]` `CHECK ((approved_at IS NULL) = (approved_by_user_id IS NULL))`.
- الترقيم: المراجعة الجديدة هي الحرف التالي للأعلى المُصدَر، لا تُتخطى ولا تُعاد. تُحسب بـ`checkNewRevision(issued, candidate)` و`nextRevision` في `server/domain/drawingRevisions.ts`. الخدمة لا تستدعيهما اليوم (انظر القسم 5، البند 6).

### 2.3 `design_transmittals` (الإحالات)
- الأعمدة القائمة: `transmittal_number varchar(120)`، `direction` (enum `design_transmittals_direction`: outgoing، incoming؛ الافتراضي outgoing)، `counterparty varchar(255)`، `subject varchar(255)`، `status` (enum `design_transmittals_status`: draft، sent، acknowledged؛ الافتراضي draft)، `sent_at`، `acknowledged_at`، `created_by_user_id`، `created_at`.
- الفريد: `design_transmittals_project_number_unique (project_id, transmittal_number)`. الفهرس: `design_transmittals_tenant_project_status_idx (tenant_id, project_id, status)`.
- التسلسل: `draft` ثم `sent` ثم `acknowledged`. الإرسال يحفظ `sent_at` ويضع المخططات الحالية المرفقة `under_review` (في `transitionDesignTransmittal`، للإحالة الصادرة فقط). تأكيد الاستلام هو الانتقال إلى `acknowledged` مع `acknowledged_at`، وهذا هو ما يطلبه المالك من الإحالة. الجدول الانتقالي `transmittalTransitions` في `server/domain/designCoordination.ts`.
- `[PROPOSED]` `CHECK ((status = 'draft' AND sent_at IS NULL) OR (status IN ('sent', 'acknowledged') AND sent_at IS NOT NULL))`، و`CHECK ((status = 'acknowledged') = (acknowledged_at IS NOT NULL))`.
- `[PROPOSED]` عمود `discipline design_drawings_discipline NOT NULL`: الإحالة الصادرة تحمل تخصصًا واحدًا لأن رقمها يحمل حرف التخصص (انظر R9).
- `[PROPOSED]` الإحالة الصادرة يُولَّد رقمها بـ`nextReferralNumber` (ويُعرض بـ`formatReferralNumber`) على الصيغة `<رمز المشروع>-<حرف التخصص>-<أربعة أرقام>`، مثال تجريبي: `EXAMPLE-01-A-0001`. قيد: `CHECK (direction = 'incoming' OR transmittal_number ~ '^[A-Z0-9]+(-[A-Z0-9]+)*-[AILSCMEPFX]-[0-9]{4}$')`. حروف التخصص من `DISCIPLINE_CODES` في `referralNumbering.ts`.
- `[PROPOSED]` يستبدل الفريد القائم فريد على `(project_id, upper(btrim(transmittal_number)))`. PostgreSQL يقارن النص بحساسية الحالة، و`checkReferralNumberUnique` يقارن بلا حالة ولا مسافات، فيجب أن يطابقه الفهرس.

### 2.4 `design_transmittal_items` (بنود الإحالة)
- الأعمدة القائمة: `tenant_id`، `project_id`، `transmittal_id` (FK باسم `design_trm_items_transmittal_fk`)، `revision_id` (FK باسم `design_trm_items_revision_fk` إلى `design_drawing_revisions`).
- الفريد: `design_transmittal_items_unique (transmittal_id, revision_id)`. الفهرس: `design_transmittal_items_revision_idx (revision_id)`.
- البنود تُضاف قبل الإرسال. لا يوجد في الخدمة مسار يعدّل البنود بعد `sent`، والشاشة تقول ذلك (`client/src/lib/userGuide.ts`، خطوة «أرسل إحالة بالمخططات»).
- `[PROPOSED]` تتحقق الخدمة عند الإنشاء أن كل مراجعة في البنود هي الحالية (`is_current = true`). الواجهة تفعل ذلك بالتصفية (`live.filter(item => item.currentRevisionId)` في `ProjectDesign.tsx`)، والخدمة لا تتحقق منه.

### 2.5 `design_comments` (ملاحظات المراجعة)
- الأعمدة القائمة: `drawing_id`، `revision_id`، `comment_number varchar(120)`، `raised_by varchar(255)` (نص حر، انظر R4)، `severity` (enum `design_comments_severity`: minor، major، critical؛ الافتراضي minor)، `comment_text text`، `status` (enum `design_comments_status`: open، responded، closed؛ الافتراضي open)، `response_text text`، `responded_at`، `responded_by_user_id`، `closed_at`، `closed_by_user_id`، `due_at`، `created_by_user_id`، `created_at`.
- الفريد: `design_comments_project_number_unique (project_id, comment_number)`. الفهرسان: `design_comments_tenant_project_status_idx (tenant_id, project_id, status, due_at)` و`design_comments_drawing_idx (drawing_id, status)`.
- التسلسل: open ثم responded ثم closed، والعودة من responded إلى open (إعادة فتح). الجدول `commentTransitions` في `designCoordination.ts`.
- `[PROPOSED]` عمودان للبند D-1 في `AFTER_MIGRATION`: `reopen_reason text` و`reopened_at timestamptz`، يُملآن عند إعادة الفتح.
- `[PROPOSED]` `CHECK (status = 'open' OR responded_at IS NOT NULL)`، و`CHECK ((status = 'closed') = (closed_at IS NOT NULL))`.

### 2.6 `design_submittals` (التقديمات للاستشاري)
- الأعمدة القائمة: `submittal_number varchar(120)`، `title varchar(255)`، `discipline` (enum `design_submittals_discipline`، القيم نفسها)، `drawing_id` (FK اختياري)، `resubmission_of_id varchar(36)`، `status` (enum `design_submittals_status`: draft، submitted، replied، closed؛ الافتراضي draft)، `submitted_at`، `submitted_by_user_id`، `due_at`، `reply_code` (enum `design_submittals_reply_code`: A، B، C، D)، `reply_note text`، `replied_at`، `replied_by_user_id`، `created_by_user_id`، `created_at`.
- **في المخطط القائم لا يوجد مفتاح أجنبي ولا فريد على `resubmission_of_id`.** هذا ما يعالجه البند الآتي.
- الفريد: `design_submittals_project_number_unique (project_id, submittal_number)`. الفهرس: `design_submittals_tenant_project_status_idx (tenant_id, project_id, status, due_at)`.
- `[PROPOSED]` قيمة جديدة `internal_review` في enum `design_submittals_status` قبل `submitted`. في PostgreSQL تُضاف بـ`ALTER TYPE ... ADD VALUE ... BEFORE 'submitted'` في ترحيلة مستقلة، والقيمة لا تُستعمل في المعاملة التي تضيفها.
- التسلسل المقترح: `draft` ثم `internal_review` ثم `submitted` ثم `replied` ثم `closed`.
  - `draft` إلى `internal_review`: يطلبها من يملك `project.design.manage` وسلطة التخصص.
  - `internal_review` إلى `submitted`: يرسلها المراجع الداخلي للاستشاري، ويُسجَّل `internal_review_by_user_id` و`internal_review_at`. `[PROPOSED]` المراجع غير من أنشأ التقديم (`created_by_user_id`)، قياسًا على قاعدة «من ردّ لا يغلق» في `designReviewComments.ts` (انظر R11).
  - `[PROPOSED]` `internal_review` إلى `draft`: إعادة للتصحيح بسبب مكتوب.
  - `submitted` إلى `replied`: رد الاستشاري بالرمز A أو B أو C أو D.
  - `replied` إلى `closed`: A وB تُغلقان فورًا، وC وD تُغلقان بعد وجود الخلف (`closeSubmittal` في `submittalReplies.ts`).
- الحالة القائمة `draft` إلى `submitted` تُجاز اليوم بسلطة التخصص دون مراجعة داخلية (`transitionDesignSubmittal` في `server/designService.ts`). هذا هو التغيير.
- `[PROPOSED]` أعمدة: `internal_review_by_user_id integer` (FK إلى `users`)، `internal_review_at timestamptz`، `resubmission_depth integer NOT NULL DEFAULT 0`.
- **سلسلة إعادة التقديم (قرار المالك، 22 أكتوبر 2026، بند 4):**
  - لا حد لعمق السلسلة. كل خلف يحمل `resubmission_depth = عمق الأصل + 1` محسوبًا في المعاملة نفسها التي تنشئه. الخلف الأول عمقه 1، والثالث عمقه 3.
  - `[PROPOSED]` `UNIQUE (resubmission_of_id)`: لكل تقديم خلف واحد. PostgreSQL يسمح بعدة NULL في الفريد، فالقيد البسيط يكفي. هذا هو القيد الذي نصّ عليه المالك.
  - `[PROPOSED]` `UNIQUE (id, project_id)`، ثم `FOREIGN KEY (resubmission_of_id, project_id) REFERENCES design_submittals (id, project_id)`: الخلف والأصل في المشروع نفسه.
  - `[PROPOSED]` `CHECK (resubmission_depth >= 0)`، و`CHECK (resubmission_of_id IS NULL OR resubmission_of_id <> id)`، و`CHECK (resubmission_of_id IS NOT NULL OR resubmission_depth = 0)`.
  - تحذير الشاشة: `[PROPOSED]` `RESUBMISSION_WARNING_DEPTH = 3`. عند `resubmission_depth >= 3` تظهر علامة تحذير غير مانعة. الدالة المقترحة `resubmissionWarning(depth)` في `server/domain/submittalReplies.ts`.
- ترقيم الخلف: `-R<n>` كما في `submittalChain` و`nextResubmissionNumber` في `submittalReplies.ts`. `[PROPOSED]` تحسب الخدمة الرقم، لا الواجهة. الواجهة تحسبه اليوم بعدّ الخلف (زر إعادة التقديم في `ProjectDesign.tsx`)، وهذا قابل للتكرار.
- `[PROPOSED]` `CHECK ((reply_code IS NULL) = (replied_at IS NULL))`.
- الفعل الحالي `draft` إلى `submitted` يُسجَّل بفعل التدقيق `design.submittal_status_transitioned`.
- **ملاحظة ترحيل:** `ALTER TYPE` و`ALTER TABLE` في ترحيلة مستقلة بعد الأساس، وتُراجع قبل التطبيق بحثًا عن أي عملية هدّامة (`CLAUDE.md` القسم 4).

### 2.7 `audit_logs` (سجل التدقيق)
- الأعمدة: `id`، `tenant_id`، `actor_user_id`، `action varchar(120)`، `entity_type varchar(120)`، `entity_id varchar(36)`، `request_id`، `metadata text`، `created_at`. ليس فيه `project_id`، فيُكتب `projectId` داخل `metadata` كما تفعل `audit()` في `server/designService.ts` (السطر 36).
- الأفعال القائمة: `design.drawing_registered`، `design.revision_added`، `design.drawing_cancelled`، `design.drawing_approved`، `design.transmittal_created`، `design.transmittal_status_transitioned`، `design.comment_raised`، `design.comment_status_transitioned`، `design.submittal_created`، `design.submittal_status_transitioned`.
- الانتقال الداخلي للتقديم يُسجَّل بالفعل `design.submittal_status_transitioned` مع `nextStatus = 'internal_review'`، ولا يُخترع فعل جديد.
- القاعدة: الكتابة وصف التدقيق في معاملة واحدة. إن فشل التدقيق تُرفض الكتابة، ولا تبقى حالة بلا أثر.

## 3. الشاشات

**المسار:** `/projects/:tenantId/:projectId/controls` (`client/src/App.tsx`)، والقسم داخله بالمعرّف `manager-design` (`client/src/pages/ProjectControls.tsx`، السطر 255)، ويُحمَّل كسولًا (`lazy`). المكوّن `ProjectDesign` في `client/src/pages/ProjectDesign.tsx`.

### 3.1 من يرى ماذا
- من يملك `project.read` على المشروع يرى كل القوائم واللوحة. الخادم يتحقق بـ`assertDesignAccess(input, "project.read")` في كل دالة قراءة.
- الأزرار تظهر بـ`WriteGate` (`client/src/lib/permissions.tsx`) وفق الصلاحية. الخادم يحكم في كل استدعاء، والواجهة لا تقرر وحدها.
- من لا يملك الصلاحية يرى نص «لا تملك صلاحية … فالقسم للعرض فقط» (`noWrite` في `ProjectDesign.tsx`).

### 3.2 لوحة مرحلة التصميم (`design.dashboard`)
- العدادات: نسبة الاكتمال (المعتمد من المخططات غير الملغاة)، المعتمد من الإجمالي، الملاحظات المفتوحة والمردودة، الملاحظات المتأخرة، التقديمات بانتظار الرد، المتأخرة منها، متوسط أيام الرد، وعدد A وB وC وD.
- التفصيل حسب التخصص (`byDiscipline`).
- الحساب في قاعدة البيانات: `count(*)` مجمّعة، ثم `summariseDrawings` في `designCoordination.ts`. متوسط الأيام يستعمل `timestampdiff(hour, …)` في `getDesignDashboard` وهذه دالة MySQL؛ في PostgreSQL يكون `extract(epoch from (replied_at - submitted_at)) / 86400` `[PROPOSED]`.
- الحالة الفارغة: لا مخطط مسجل، فتظهر «لم يُسجَّل أي مخطط بعد»، لا 0% ولا 100% (`completionPercent: null`).
- التحميل: `SourceNotice` لكل استعلام، والعدادات تظهر «—» حتى تصل البيانات.

### 3.3 سجل المخططات
- النموذج للمدير (`WriteGate` بـ`project.design.manage`): رقم، عنوان، تخصص، إصدار (الافتراضي A).
- القائمة: الرقم، العنوان، التخصص، الإصدار الحالي، الحالة، عدد الملاحظات غير المحلولة.
- لكل مخطط: إضافة إصدار (`design.addRevision`)، إلغاء (`design.cancelDrawing`)، واعتماد للتنفيذ (`design.approveDrawing`) يظهر فقط عندما تكون الحالة `under_review` ولمن يملك `project.design.approve`.
- `[PROPOSED]` حقل الإصدار الجديد يقترح الحرف التالي (`nextRevision`) بدل حقل حر.
- الفارغة: «لا سجلات بعد.»، والتحميل: «جارٍ التحميل…».

### 3.4 الإحالات (`design.transmittals`)
- العنوان في الواجهة «الإحالات» (`transmittalsTitle`).
- الإنشاء: رقم (يُولَّد `[PROPOSED]`)، اتجاه، جهة، موضوع، ثم اختيار المراجعات الحالية. الزر معطّل حتى يُختار مخطط واحد على الأقل.
- «إرسال» للمسودة، و«تأكيد الاستلام» للمرسلة. تظهر لمن يملك `project.design.manage`.
- الفارغة: «لا سجلات بعد.».

### 3.5 ملاحظات المراجعة
- التسجيل: مخطط غير معتمد، رقم، صاحب الملاحظة، أهمية، نص، تاريخ استحقاق (اختياري).
- الرد: `project.design.manage` على الملاحظة المفتوحة.
- الإغلاق وإعادة الفتح: `project.design.approve` على الملاحظة المردودة. إعادة الفتح تطلب سببًا `[PROPOSED]` (D-1).

### 3.6 التقديمات للاستشاري
- التسجيل: رقم، عنوان، تخصص، مخطط مرتبط (اختياري)، استحقاق.
- المسودة: زر «إرسال للمراجعة الداخلية» `[PROPOSED]` لمن يملك `project.design.manage` وسلطة التخصص.
- قيد المراجعة الداخلية: زر «إرسال للاستشاري» لمن يملك سلطة التخصص، وتسجيل المراجعة نفسها `[PROPOSED]`.
- المرسلة: اختيار الرمز A/B/C/D ثم «تسجيل الرد» بـ`project.design.approve`. الأسماء المعروضة: A معتمد، B معتمد مع ملاحظات، C عدّل وأعد التقديم، D مرفوض (`replyNames`).
- المردودة بـC أو D: «إغلاق التقديم» و«إعادة التقديم» بـ`project.design.manage`. زر إعادة التقديم يختفي عندما يوجد خلف `[PROPOSED]`، بقيد الفريد.
- علامة التحذير: عند `resubmission_depth >= 3` يظهر بجانب الرقم نص يُعلم بعدد إعادات التقديم، وهو غير مانع.

### 3.7 الحالات الفارغة والتحميل والخطأ
- كل قائمة لها حالة تحميل («جارٍ التحميل…») وحالة فارغة («لا سجلات بعد.»).
- الخطأ: عنصر `role="alert"` يعرض الرسالة المترجمة من `getLocalizedProjectError` (`client/src/lib/projectErrors.ts`). الرسائل من `shared/projectErrors.ts`، وفي `_core/trpc.ts` يُرفق الخطأ بها.

## 4. الصلاحيات

| الرمز | ما يسمح به | المصدر |
|---|---|---|
| `project.read` | قراءة كل القوائم واللوحة | `assertDesignAccess(…, "project.read")` في كل دالة قراءة بـ`server/designService.ts` |
| `project.design.manage` | تسجيل مخطط، إضافة إصدار، إلغاء مخطط، إنشاء إحالة وإرسالها وتأكيد استلامها، تسجيل ملاحظة وردّها، تسجيل تقديم، إرساله، إغلاقه، إعادة تقديمه | `registerDesignDrawing`، `addDesignRevision`، `cancelDesignDrawing`، `createDesignTransmittal`، `transitionDesignTransmittal`، `raiseDesignComment`، `createDesignSubmittal`، `transitionDesignSubmittal` (غير الرد) |
| `project.design.approve` | اعتماد المخطط للتنفيذ، إغلاق الملاحظة وإعادة فتحها، تسجيل رد الاستشاري | `approveDesignDrawing`، `transitionDesignComment` (الإغلاق والفتح)، `transitionDesignSubmittal` (الرد `replied`) |
| `project.design.architectural` | سلطة التخصصات المعمارية: architectural وinterior وlandscape. وفي `other` تُقبل مع الفنية | `disciplineAuthority` في `server/domain/designCoordination.ts` |
| `project.design.technical` | سلطة التخصصات الفنية: structural وcivil وmechanical وelectrical وplumbing وfire_fighting. وفي `other` تُقبل مع المعمارية | `disciplineAuthority` نفسه |

**قواعد تطبيق الصلاحيات:**
- سلطة التخصص تُضاف فوق `project.design.manage` ولا تحل محلها. يكفي أي رمز من رمزي السلطة (`assertDesignAccess` يمرّر المصفوفة إلى `assertTenantAccess` في `server/domain/authorization.ts`).
- الشرط العام لكل كتابة: عضوية `active`، ومنتج `PROJECT` مرخّص، والنطاق يغطي المشروع (`hasScopeAccess`)، والمشروع يتبع الشركة (`assertProjectWithinTenant` في `server/db.ts`).
- `[PROPOSED]` الإحالة الصادرة تُنشأ بتخصص واحد، وتحتاج سلطة ذلك التخصص.
- `[PROPOSED]` إرسال التقديم للمراجعة الداخلية، والمراجعة نفسها: `project.design.manage` وسلطة التخصص.
- `[PROPOSED]` تسجيل رد الاستشاري: `project.design.approve` وسلطة التخصص. اليوم لا يفحص `transitionDesignSubmittal` التخصص عند الرد (انظر R2).
- `[PROPOSED]` اعتماد المخطط: `project.design.approve` وسلطة التخصص. اليوم لا يفحص `approveDesignDrawing` التخصص (انظر R2).
- الفصل بين الأشخاص: الزوج `project.design.manage` و`project.design.approve` في `conflictingPermissionPairs` (`server/domain/operationalPermissions.ts`)، ويمنع `findPermissionConflict` الدور الذي يحملهما معًا. مالك الشركة مستثنى من هذا الفحص على مستوى الدور لأنه يملك كل شيء، لكن قاعدة الأشخاص تبقى عليه: من أصدر لا يعتمد، ومن ردّ لا يغلق، ومن أرسل لا يسجّل الرد (تعليق `server/designService.ts` السطران 6-7).
- أمثلة الأدوار: `DESIGN_COORDINATOR_ARCHITECTURAL` و`DESIGN_COORDINATOR_TECHNICAL` (`server/domain/operationalRoles.ts`، السطران 99-100)، و`PROJECT_COORDINATOR` يحمل `project.design.approve` (السطر 97).

## 5. حالات الرفض

القاعدة: كل فعل مرفوض يعيد خطأ صريحًا برمز، وكل صفّ متأثر بالكتابة يُفحص. `rows = 0` لا يُعامل نجاحًا ولا يمر صامتًا. الرمز الواصل إلى الواجهة يُترجم من `shared/projectErrors.ts`. الرموز `[PROPOSED]` تحتاج رسالتين بالعربية والإنجليزية قبل الربط.

| # | الحالة المرفوضة | الرمز | ما يراه المستخدم | المصدر |
|---|---|---|---|---|
| 1 | تسجيل مخطط بلا `project.design.manage` | FORBIDDEN، `PROJECT_OS_PERMISSION_DENIED` | رسالة الصلاحية، والزر مخفي | `assertTenantAccess` في `authorization.ts` |
| 2 | تسجيل مخطط في تخصص خارج سلطته | FORBIDDEN، `PROJECT_OS_PERMISSION_DENIED` | رسالة الصلاحية | `assertDesignAccess` مع التخصص |
| 3 | مشروع غير مرخّص لمنتج PROJECT | FORBIDDEN، `PROJECT_OS_PRODUCT_NOT_ENTITLED` | رسالة الترخيص | `assertTenantAccess` |
| 4 | رقم مخطط أو إحالة أو تقديم مكرر في المشروع (بما فيه الملغى) | CONFLICT، `PROJECT_OS_DESIGN_DUPLICATE` | «الرقم مستعمل من قبل في هذا المشروع» | `duplicateAs` و`isDuplicate` في `designService.ts` (السطران 16-17)؛ على PostgreSQL يُستعمل `isUniqueViolation` (`server/_core/database.ts` في الفرع) |
| 5 | إضافة إصدار إلى مخطط ملغى | CONFLICT، `PROJECT_OS_DESIGN_DRAWING_CANCELLED` | «المخطط ملغى» | `addDesignRevision` |
| 6 | إصدار بحرف مُتخطى، أو مُعاد، أو غير صالح | CONFLICT، `PROJECT_OS_DESIGN_REVISION_NOT_NEXT` / `..._ALREADY_ISSUED` / `..._LABEL_INVALID` `[PROPOSED]` | رسالة تذكر الحرف المطلوب | `checkNewRevision` في `drawingRevisions.ts` (غير مربوط بالخدمة اليوم) |
| 7 | اعتماد مخطط ليس قيد المراجعة | CONFLICT، `PROJECT_OS_DESIGN_APPROVAL_STATE_INVALID` | «لا يُعتمد إلا وهو قيد المراجعة» | `approveDesignDrawing` |
| 8 | اعتماد من أصدر المراجعة | CONFLICT، `PROJECT_OS_DESIGN_SELF_APPROVAL` | «من أصدر المراجعة لا يعتمدها» | `approveDesignDrawing` |
| 9 | اعتماد مع ملاحظة مفتوحة على المراجعة الحالية | CONFLICT، `PROJECT_OS_DESIGN_OPEN_COMMENTS` | «لا يُعتمد وفيه ملاحظات لم تُغلق» | `approveDesignDrawing` (R3) |
| 10 | إحالة بلا مراجعات | BAD_REQUEST، `PROJECT_OS_DESIGN_TRANSMITTAL_EMPTY` | «اختر مخططًا واحدًا على الأقل» | `createDesignTransmittal` |
| 11 | إحالة تحمل مراجعة ملغاة | CONFLICT، `PROJECT_OS_DESIGN_DRAWING_CANCELLED` | «المخطط ملغى» | `createDesignTransmittal` |
| 12 | رقم إحالة صادرة بصيغة خاطئة | BAD_REQUEST، `PROJECT_OS_DESIGN_REFERRAL_NUMBER_INVALID` `[PROPOSED]` | رسالة تذكر الصيغة | `parseReferralNumber` (`REFERRAL_NUMBER_MALFORMED`، `REFERRAL_DISCIPLINE_UNKNOWN`، `REFERRAL_PROJECT_CODE_INVALID`) |
| 13 | رقم إحالة مستعمل، بغض النظر عن الحالة أو حالة الحروف | CONFLICT، `PROJECT_OS_DESIGN_DUPLICATE` | «الرقم مستعمل من قبل» | `checkReferralNumberUnique` (`REFERRAL_NUMBER_TAKEN`) |
| 14 | تأكيد استلام إحالة لم تُرسل | BAD_REQUEST، `PROJECT_OS_DESIGN_TRANSMITTAL_TRANSITION_INVALID` | «انتقال غير مسموح من حالتها» | `transitionDesignTransmittal` |
| 15 | إغلاق ملاحظة غير ثانوية بلا رد | CONFLICT، `PROJECT_OS_DESIGN_COMMENT_RESPONSE_REQUIRED` `[PROPOSED]` بنص خاص بالإغلاق | «لا تُغلق الملاحظة قبل الرد عليها» | `checkCommentTransition` (`COMMENT_RESPONSE_REQUIRED`)؛ الخدمة تعيد اليوم `COMMENT_TRANSITION_INVALID` (R8) |
| 16 | إغلاق ملاحظة من من ردّ عليها | CONFLICT، `PROJECT_OS_DESIGN_SELF_CLOSE` | «من ردّ على الملاحظة لا يغلقها» | `transitionDesignComment` لكل الأهميات؛ `isSelfClosureRefused` للحرجة فقط (R6) |
| 17 | إعادة فتح ملاحظة بلا سبب | BAD_REQUEST، `PROJECT_OS_DESIGN_REOPEN_REASON_REQUIRED` `[PROPOSED]` | «اكتب سبب إعادة الفتح» | `checkCommentTransition` (`COMMENT_REOPEN_REASON_REQUIRED`)؛ الخدمة تقبل اليوم |
| 18 | رد بلا رمز، أو برمز غير A/B/C/D | BAD_REQUEST، `PROJECT_OS_DESIGN_REPLY_CODE_REQUIRED`؛ `PROJECT_OS_DESIGN_REPLY_CODE_INVALID` `[PROPOSED]` | «اختر رمز رد الاستشاري» | `transitionDesignSubmittal`؛ `recordSubmittalReply` (`SUBMITTAL_REPLY_CODE_INVALID`) |
| 19 | رد على تقديم مسودة أو قيد المراجعة الداخلية | BAD_REQUEST، `PROJECT_OS_DESIGN_SUBMITTAL_TRANSITION_INVALID` | «انتقال غير مسموح من حالته» | `checkSubmittalTransition` |
| 20 | رد ثانٍ على تقديم أُجيب | CONFLICT، `PROJECT_OS_DESIGN_REPLY_ALREADY_RECORDED` `[PROPOSED]` | «سُجّل الرد من قبل» | `checkSubmittalTransition` (`SUBMITTAL_REPLY_ALREADY_RECORDED`)؛ الخدمة تعيد اليوم `TRANSITION_INVALID` |
| 21 | من أرسل التقديم يسجّل ردّه | CONFLICT، `PROJECT_OS_DESIGN_SELF_REPLY` | «من أرسل التقديم لا يسجّل رده» | `transitionDesignSubmittal` (السطر 277)؛ `recordSubmittalReply` |
| 22 | من أنشأ التقديم يراجعه داخليًا | CONFLICT، `PROJECT_OS_DESIGN_SELF_INTERNAL_REVIEW` `[PROPOSED]` | «من أنشأ التقديم لا يراجعه داخليًا» | مقترح في القسم 2.6 (R11) |
| 23 | إرسال للاستشاري بلا مراجعة داخلية | CONFLICT، `PROJECT_OS_DESIGN_INTERNAL_REVIEW_REQUIRED` `[PROPOSED]` | «راجع التقديم داخليًا قبل إرساله» | `transitionDesignSubmittal` مع الحالة الجديدة |
| 24 | إعادة تقديم لتقديم أجابه الاستشاري بـA أو B | CONFLICT، `PROJECT_OS_DESIGN_RESUBMISSION_INVALID` | «لا يُعاد تقديم إلا ما ردّ عليه بـC أو D» | `createDesignSubmittal` |
| 25 | خلف ثانٍ لتقديم له خلف | CONFLICT، `PROJECT_OS_DESIGN_RESUBMISSION_EXISTS` `[PROPOSED]` | «أُعيد تقديمه من قبل» | القيد `UNIQUE (resubmission_of_id)`؛ الخدمة تقبله اليوم، و`checkResubmission` يرفضه (`SUBMITTAL_RESUBMISSION_EXISTS`) |
| 26 | إغلاق تقديم C أو D قبل وجود خلفه | CONFLICT، `PROJECT_OS_DESIGN_RESUBMISSION_REQUIRED` `[PROPOSED]` | «أعد التقديم قبل الإغلاق» | `closeSubmittal`؛ الخدمة تسمحه اليوم |
| 27 | تحديث صفّ تغيّر حالته بين القراءة والكتابة | CONFLICT، `PROJECT_OS_DESIGN_STATE_CHANGED` `[PROPOSED]` | «تغيّرت الحالة؛ أعد التحميل» | `rows = 0` في `UPDATE` مع شرط الحالة (S-2)؛ اليوم لا يُفحص |
| 28 | مستخدم من شركة أخرى أو مشروع آخر | FORBIDDEN، `PROJECT_OS_TENANT_ACCESS_DENIED`، أو NOT_FOUND، `PROJECT_OS_DESIGN_*_NOT_FOUND` | الرسالة المناسبة | `assertDesignAccess`؛ وطبقة RLS تُرجع صفوفًا فارغة |

## 6. معايير القبول

1. تبقى جداول التصميم ستة بالضبط بلا جدول إضافي، وكل منها يحمل `tenant_id` و`project_id` بقيد `NOT NULL`، والترحيل الجديد يعدّل الجداول القائمة فقط.
2. لكل جدول من الستة سياسة RLS من فئة `project_os_isolation`، ويُختبر أن جلسة شركة أخرى ترى صفرًا من صفوفها.
3. تحمل `design_transmittals` الفريد `(project_id, upper(btrim(transmittal_number)))`؛ إدراج رقم موجود بحالة حروف مختلفة يُرفض بـ`PROJECT_OS_DESIGN_DUPLICATE`.
4. رقم الإحالة الصادرة يطابق `^[A-Z0-9]+(-[A-Z0-9]+)*-[AILSCMEPFX]-[0-9]{4}$`، والرقم الخاطئ يُرفض بـ`PROJECT_OS_DESIGN_REFERRAL_NUMBER_INVALID`.
5. لا تُقبل حالة `acknowledged` إلا بعد `sent` (يفرضه CHECK وانتقال الخدمة معًا)، ويُسجَّل `acknowledged_at`.
6. إصدار المخطط يمر بـ`checkNewRevision`: A ثم B ... Z ثم AA، ولا يُقبل تخطٍّ أو تكرار. تُختبر الخدمة نفسها لا الدالة وحدها.
7. `approveDesignDrawing` يرفض مخططًا غير قيد المراجعة، ومن أصدر المراجعة، والمخطط الذي فيه ملاحظة مفتوحة على المراجعة الحالية، ويرفض كل ذلك بالرمز المحدد في القسم 5.
8. التقديم يمر بـ`draft` ثم `internal_review` ثم `submitted` ثم `replied` ثم `closed`، ولا يتخطى خطوة. كل انتقال يكتب صف تدقيق واحدًا في المعاملة نفسها.
9. لا يُرسل تقديم إلى الاستشاري دون مراجعة داخلية مسجلة، ولا يراجعه من أنشأه `[PROPOSED]`.
10. رد الاستشاري يقبل A أو B أو C أو D فقط، ولا يسجّله من أرسل التقديم، ويُرفض رد ثانٍ.
11. A وB يُغلقان بلا خلف. C وD لا يُغلقان قبل وجود الخلف، وإغلاقهما بلا خلف يُرفض.
12. `resubmission_of_id` فريد: تقديمان لا يشيران إلى الأصل نفسه، وخلف ثانٍ يُرفض بـ`PROJECT_OS_DESIGN_RESUBMISSION_EXISTS`.
13. سلسلة من خمسة خلف تُنشأ: العمق 1 إلى 5 بالترتيب، ولا رفض بسبب العدد.
14. عند العمق 3 فأكثر تظهر علامة التحذير، وعند العمق 2 أو أقل لا تظهر، والتحذير لا يمنع أي فعل.
15. الملاحظة لا تُغلق من من ردّ عليها، ولا تُعاد فتحها بلا سبب `[PROPOSED]`، ولا تُغلق الحرجة بلا رد.
16. الإحالة لا تُرسل إن كانت فارغة، ولا تتضمن مراجعة ملغاة، ولا تُعدَّل بنودها بعد الإرسال.
17. كل كتابة محمية لها صف تدقيق في `audit_logs` في المعاملة نفسها، ويُختبر أن فشل التدقيق يلغي الكتابة.
18. `rows = 0` في أي `UPDATE` بشرط حالة يُرجع خطأً صريحًا، ولا يُعاد ضبط صامت.
19. كل رمز `PROJECT_OS_DESIGN_*` يُرسَل للواجهة يملك رسالة عربية وإنجليزية في `shared/projectErrors.ts`، ولا يسقط إلى `PROJECT_OS_REQUEST_FAILED`.
20. لوحة المرحلة تحسب في قاعدة البيانات، وتعرض «لم يُسجَّل أي مخطط بعد» بلا مخطط، لا 0% ولا 100%.
21. الواجهة بالعربية والإنجليزية، وكل قائمة فارغة تقول ذلك صراحةً.
22. تبقى كل الأزرار المحمية مخفية لمن لا يملك صلاحيتها (`WriteGate`)، والخادم يرفض الاستدعاء نفسه إن وصل.
23. لا يُكسر أي اختبار قائم، وعدد الاختبارات الناجحة لا ينقص عن آخر رقم مُثبت (`CLAUDE.md` القسم 7).

## 7. الاختبارات المطلوبة

### 7.1 اختبارات الوحدة للقواعد النقية
- القائمة الحالية: `server/domain/drawingRevisions.test.ts`، و`server/domain/referralNumbering.test.ts`، و`server/domain/designReviewComments.test.ts`، و`server/domain/submittalReplies.test.ts`. تغطي الترقيم والانتقالات والرد والخلف، ولا تكفي وحدها لإثبات الربط بالخدمة.
- `[PROPOSED]` اختبار أن `resubmissionWarning(2) = false` و`resubmissionWarning(3) = true`.
- `[PROPOSED]` اختبار أن كل رمز في القسم 5 `[PROPOSED]` له رسالة عربية وإنجليزية (يُضاف إلى `shared/projectErrors.test.ts`).
- `[PROPOSED]` اختبار أن `internal_review` موجودة في جدول الانتقالات `submittalTransitions` في `submittalReplies.ts`، وأنها لا تُتخطى.

### 7.2 اختبارات التكامل على قاعدة البيانات
- القاعدة الوحيدة: `project_os_integration_test`. تُشغَّل عبر `scripts/run-integration-database-test.mjs` التي تستبدل اسم القاعدة، ويحرس `server/testing/databaseGuard.setup.ts` ضد أي اسم آخر. لا mock.
- `server/design.coordination.database.test.ts` مكتوب اليوم بـ`mysql2`، ويجب نقله إلى PostgreSQL مع الحفاظ على حالاته الثمانية.
- `[PROPOSED]` حالات جديدة:
  - قيد الخلف الفريد: خلفان لأصل واحد، الثاني يُرفض بقيد لا بالفحص البرمجي وحده.
  - سلسلة من خمسة خلف بالعمق 1 إلى 5، وعلامة التحذير من العمق 3.
  - إغلاق C أو D قبل الخلف يُرفض، وبعده يُقبل.
  - `rows = 0`: تغيير متزامن لحالة التقديم يُرجع `PROJECT_OS_DESIGN_STATE_CHANGED`.
  - فشل صف التدقيق يلغي الكتابة (معاملة واحدة).
  - جلسة شركة أخرى ترى صفوف هذه الجداول صفرًا (طبقة RLS الثانية).
  - رقم إحالة مكرر بحالة حروف مختلفة يُرفض.
  - تأكيد استلام إحالة من `draft` يُرفض.
- `[PROPOSED]` الترحيلة الجديدة تُختبر على قاعدة الاختبار فقط قبل أي تطبيق آخر.

### 7.3 اختبارات مكوّنات الواجهة
- القائمة الحالية: `client/src/pages/ProjectDesign.interaction.test.tsx` (خمس حالات: اللوحة، التسجيل، الاعتماد وأزرار A–D، الإغلاق والإحالة، الإنجليزية والفارغة).
- `[PROPOSED]` حالات جديدة: زر المراجعة الداخلية يظهر لمن يملك سلطة التخصص فقط؛ اختيار الرد يظهر لمن يملك `project.design.approve` فقط؛ زر إعادة التقديم يختفي بعد وجود خلف؛ علامة التحذير عند العمق 3 لا عند 2؛ نصوص الحالات الفارغة بالعربية والإنجليزية.

### 7.4 البوابات
- `pnpm check`، و`pnpm build`، و`pnpm test` ناجحة، و`pnpm coverage:trpc` (`CLAUDE.md` القسم 7).

## 8. المخاطر والأسئلة المفتوحة

كل بند هنا `BLOCKED_BY_OWNER`. لم يُحسم أي منها في هذه المواصفة.

| # | السؤال | الحالة الحالية في الكود | المصدر |
|---|---|---|---|
| R1 | المحرك المعتمد: PostgreSQL وفق ADR-0002 على الفرع، أم MySQL/TiDB وفق `CLAUDE.md` و`STATE.md` على `main`؟ إن بقي MySQL تُعاد كتابة هذه المواصفة (G-2). | `CLAUDE.md` و`STATE.md` تصفان MySQL؛ ADR-0002 يصف PostgreSQL | `AFTER_MIGRATION` G-1 |
| R2 | هل سلطة التخصص نهائية لكل تخصص؟ تشمل الاعتماد والرد أم الإنشاء والإرسال فقط؟ | `approveDesignDrawing` و`transitionDesignSubmittal` (الرد) و`transitionDesignComment` تفحص الصلاحية العامة دون التخصص | قرار المالك المفتوح |
| R3 | هل تُمنع الملاحظات المفتوحة على المراجعات الأقدم من الاعتماد؟ | الاعتماد يفحص ملاحظات المراجعة الحالية فقط (`revisionId = revision.id`) | قرار المالك المفتوح |
| R4 | هل يبقى `raised_by` نصًا حرًا، أم يُربط بمستخدم مسجل؟ | `design_comments.raised_by varchar(255)` | قرار المالك المفتوح |
| R5 | هل يُعاد تسجيل مخطط ملغى برقمه نفسه؟ | الفريد يشمل الملغى، فيُرفض بـ`PROJECT_OS_DESIGN_DUPLICATE` | قرار المالك لم يُجَب |
| R6 | نطاق قاعدة «من ردّ لا يغلق»: كل الأهميات (الخدمة) أم الحرجة فقط (القاعدة النقية)؟ | الخدمة تطبقها على الكل، و`isSelfClosureRefused` على الحرجة | `AFTER_MIGRATION` D-2 |
| R7 | هل يجوز إلغاء مخطط معتمد؟ | الخدمة تسمحه، و`drawingTransitions` تمنعه | `AFTER_MIGRATION` D-6 |
| R8 | هل تُغلق الملاحظة الثانوية من `open` مباشرة؟ وهل تحتاج الكبرى ردًا قبل الإغلاق؟ | القاعدة النقية تسمح بالأول وتشترط الرد للكبرى، والخدمة تمنع الأول | `AFTER_MIGRATION` D-8 |
| R9 | `[جديد]` هل تحمل الإحالة الصادرة تخصصًا واحدًا؟ وهل يتبع ترقيم الإحالات الواردة الصيغة نفسها؟ وتشترط الصيغة أن يطابق `projects.code` النمط `^[A-Z0-9]+(-[A-Z0-9]+)*$` وألا يتجاوز 32 حرفًا (`isValidProjectCode`)، بينما `projects.code` اليوم `varchar(80)` فريد لكل شركة، وقد تخالف مشاريع قائمة النمط. | `referralNumbering.ts`، `projects` في `drizzle/schema.ts` | `[PROPOSED]` في هذه المواصفة |
| R10 | `[جديد]` قرار المالك (بند 4) يذكر «Rev A، B، C» للإصدارات. هذه المواصفة تعتمد `-R<n>` لأرقام التقديمات كما في `submittalReplies.ts`، وتعتمد A–Z للمخططات (بند 5). هل تُعرض التقديمات الخلفية بحرف إصدار بدل `-R<n>`؟ | `submittalChain`، `nextResubmissionNumber` | `[PROPOSED]` في هذه المواصفة |
| R11 | `[جديد]` هل يجب أن يكون المراجع الداخلي غير من أنشأ التقديم؟ | لا قاعدة قائمة؛ مقترحة في القسم 2.6 | `[PROPOSED]` في هذه المواصفة |

**ملاحظة تفسير:** فُهم قرار المالك بند 4 على أنه يلغي حد الخلف الواحد لكل سلسلة، ويُبقي قيد «خلف واحد لكل تقديم» (القيد الفريد الذي نصّ عليه المالك). إن أراد المالك تعدد الخلف للتقديم الواحد يلزم قرار جديد.
