# مواصفة المناقصات قبل الترسية بمصطلحات PostgreSQL

**الحالة:** `WRITTEN` (مواصفة مكتوبة، ولم يُنفَّذ منها شيء على PostgreSQL بعد)
**التاريخ:** 22 أكتوبر 2026
**المرجع الحاكم:** `docs/STATE.md` (صف «المناقصات قبل الترسية»، السطر 385) و`docs/ADR-0002-POSTGRES-SUPABASE-VERCEL.md` على الفرع `origin/feat/postgres-migration`.
**خط الأساس:** الكود الحالي على MySQL/TiDB (`server/tenderService.ts`، `server/domain/tenders.ts`). أسماء الجداول والأعمدة بصيغة PostgreSQL من `drizzle/schema.ts` على الفرع `origin/feat/postgres-migration` (`pgTable`).
**ملاحظة على المسارات:** المسارات التي تبدأ بـ`drizzle/schema.ts` و`drizzle/0000_baseline.sql` و`server/_core/database.ts` و`docs/ADR-0002` موجودة على `origin/feat/postgres-migration` فقط، والبقية على هذا الفرع.

**دليل الوسوم:**
- `DECIDED`: قرار للمالك، «قرار المالك، 22 أكتوبر 2026». لا يُعاد فتحه.
- `PROPOSED`: تصميم جديد لم يرد في الكود ولا في قرار المالك، ويحتاج موافقة قبل التنفيذ.
- `BLOCKED_BY_OWNER`: قرار يحجزه المالك، ولا يُفترض (القسم 8).
- `AFTER_MIGRATION`: بند على الخادم أو القاعدة يعتمد عليه التصميم ولم يُحسم بعد الترحيل (القسم 2.12).

## 1. الهدف والنطاق

**الهدف.** إدارة المناقصة من الحزمة إلى الترسية على PostgreSQL، بقواعد تُفرض في الخادم وفي القاعدة معًا: من أدخل العروض لا يرسّي، ولا يعدّل أحد عرض غيره، ولا تتجاوز الترسية بند الميزانية إلا باستثناء مكتوب ومعتمد، وكل المبالغ بالريال السعودي (SAR) في الإصدار الأول.

**في النطاق (V1):**
- حزم المناقصة والدعوات وحالات الباب: `draft`، `open`، `closed`، `awarded`، `cancelled`.
- إدخال العروض وسحبها واستبعادها، والتسوية (تعديلات النطاق)، والمقارنة.
- الترسية: تنشئ العقد والالتزام معًا، وتربط الالتزام ببند ميزانية.
- حد للترسية يستلزم اعتماد EXECUTIVE فوقه. المبدأ `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 1)، والآلية `PROPOSED`.
- استثناء تجاوز الميزانية. المبدأ `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 2)، والشكل `PROPOSED`.
- تصحيح العرض بعد الإغلاق كتعديل مسجَّل لا كتابة فوق القيمة. المبدأ `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 4)، والجدول `PROPOSED`.

**خارج النطاق:**
- أي عملة غير SAR. `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 3): قيد CHECK، وما عداها خارج V1.
- مرفقات العروض، وإشعارات البريد، والحد الأدنى لعدد المدعوين (لم تُطلب).
- استيراد العروض من Excel أو CSV أو XER، ومزامنة Google Sheets، وشاشة 3D.
- ما يحجزه المالك (القسم 8): التجربة، والأسعار، والمقاعد، ومزود البريد، وتعدد الشركات لكل حساب، وهل يجوز الترسية دون `project.tender.award`.
- البيانات الحقيقية. كل الأمثلة في هذه الوثيقة مُختلَقة (`*.example.test`).

**الوضع الحالي، وما يخالف القرارات:**
- الترسية تتحقق من `project.tender.award` وحدها (`server/tenderService.ts:244`). لا تتحقق من `project.commitment.manage`. يُسمّي المالك هذا «defect S-1»، وهذا الاسم غير موجود في وثائق المستودع، والتحقق هنا بالكود.
- الالتزام الناتج لا يرتبط ببند ميزانية، ولا يوجد فحص للمتبقي (`server/tenderService.ts:262`). في PostgreSQL لا يملك `commitments` عمود بند ميزانية (`drizzle/schema.ts:923-940`)، ولا يملك `budget_lines` عمودًا للملتزَم به (`drizzle/schema.ts:1483-1497`).
- العملة تُنسخ من العرض الفائز (`server/tenderService.ts:261-262`) دون فرض SAR، والمسار يقبل أي رمز من ثلاثة أحرف (`server/routers.ts:389` و`:392`).
- تعديل العرض والسحب لا يتحققان من أن الفاعل هو مُدخل العرض (`server/tenderService.ts:160-172` و`:175-187`). التعديل يكتب فوق القيمة، ويحفظ `previousAmount` في سجل التدقيق فقط.
- `tenderTransitions.closed` يسمح بالعودة إلى `open` لمتأخر (`server/domain/tenders.ts`)، وهذا يتعارض مع قفل العروض عند الإغلاق (القسم 8).
- الدور `CONTRACTS_MANAGER` يحمل `project.tender.bids` (`server/domain/operationalRoles.ts:102`)، وقاعدة الفصل تمنع جمعه مع `project.tender.award` (`server/domain/operationalPermissions.ts:92`).
- `isDuplicate` يعرف رموز MySQL فقط (`server/tenderService.ts:15`).

## 2. الجداول والأعمدة والقيود والفهارس

**فئة العزل (ADR-0002، و`drizzle/0000_baseline.sql:2568` دالة `project_os_apply_conventions`):** كل جدول هنا يحمل `tenant_id`، فيقع في فئة «جدول بـ`tenant_id`»: سياسة `project_os_isolation` لكل العمليات، بالشرط `app_system() OR tenant_id = ANY(app_tenant_ids())`. RLS طبقة ثانية على مستوى **الشركة فقط**. عزل المشروع يبقى في الخادم بفلتر `mine()` (`server/tenderService.ts:17`)، ولا تحميه القاعدة. هذا حد معلن يُكتب في كل تقرير.

**سجل التدقيق:** كل كتابة محمية تكتب صف `audit_logs` في المعاملة نفسها، واسم الإجراء مذكور في كل جدول. المشروع يُحفظ في `metadata` لأن `audit_logs` في PostgreSQL بلا عمود `project_id` (`drizzle/schema.ts:803-817`)، كما في `server/tenderService.ts:31`.

### 2.1 `tender_packages` (موجود: `drizzle/schema.ts:2354`)
- الأعمدة تبقى: `id`، `tenant_id`، `project_id`، `package_code`، `title`، `scope_summary`، `estimate_amount numeric(18,2)`، `currency`، `status`، `closing_at`، `awarded_*`، `award_justification`، `created_by_user_id`، `created_at`، `updated_at`.
- `CHECK (currency = 'SAR')`. `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 3).
- `CHECK (estimate_amount IS NULL OR estimate_amount >= 0)`. `PROPOSED`.
- `awarded_bid_id` و`awarded_contract_id` و`awarded_commitment_id` بلا `FOREIGN KEY` اليوم (`drizzle/schema.ts:2367-2369`). `PROPOSED`: `FOREIGN KEY (awarded_bid_id, id) REFERENCES tender_bids (id, package_id)`، و`awarded_contract_id` إلى `contracts(id)`، و`awarded_commitment_id` إلى `commitments(id)`.
- `CHECK tender_packages_award_consistency`: `(status = 'awarded') = (awarded_bid_id IS NOT NULL AND awarded_contract_id IS NOT NULL AND awarded_commitment_id IS NOT NULL AND awarded_at IS NOT NULL AND awarded_by_user_id IS NOT NULL)`. `PROPOSED`.
- الفهارس الموجودة: `tender_packages_project_code_unique (project_id, package_code)` و`tender_packages_tenant_project_status_idx`.
- الفئة: tenant_id. الإجراءات: `tender.package_created`، `tender.package_status_transitioned` (موجودة).

### 2.2 `tender_invitees` (موجود: `drizzle/schema.ts:2381`)
- بلا تغيير في الشكل. `UNIQUE (package_id, supplier_id)` موجود.
- الخادم يكتب `invited` و`submitted` فقط. القيمة `declined` في الـenum لا يكتبها الخادم اليوم (بحث في `server/tenderService.ts`).
- الفئة: tenant_id. الإجراء: `tender.supplier_invited` (موجود).

### 2.3 `tender_bids` (موجود: `drizzle/schema.ts:2397`)
- `CHECK (currency = 'SAR')`. `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 3).
- `CHECK (amount > 0)`. `PROPOSED`.
- `CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 5000)` و`CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 1000)`. `PROPOSED`، بالحدود نفسها في `server/routers.ts:392`.
- `UNIQUE (id, package_id)`. `PROPOSED`، لازم للمفاتيح المركبة في 2.1 و2.5 و2.6.
- `UNIQUE (package_id, supplier_id)` موجود. `entered_by_user_id` موجود، وهو أساس فصل المهام.
- `PROPOSED` مشغّل `tender_bids_lock_terms` (BEFORE UPDATE): يرفض تغيير `amount` و`duration_days` و`validity_days` و`supplier_id` و`package_id` و`entered_by_user_id` إذا لم تكن حالة الحزمة `open`. يرفع خطأً بـSQLSTATE مخصص يترجمه الخادم إلى `PROJECT_OS_TENDER_NOT_OPEN`. هذا تنفيذ على مستوى القاعدة لقرار المالك، 22 أكتوبر 2026، البند 4 (العروض تُقفل عند الإغلاق).
- `status` و`status_reason` تُعدَّل وفق قواعد الخادم: السحب أثناء `open`، والاستبعاد أثناء `closed`.
- الفئة: tenant_id. الإجراءات: `tender.bid_entered`، `tender.bid_revised`، `tender.bid_withdrawn`، `tender.bid_disqualified` (موجودة).

### 2.4 `tender_bid_adjustments` (موجود: `drizzle/schema.ts:2420`)
- `CHECK (amount <> 0)`. `PROPOSED`، ومنعه في الخادم في `server/routers.ts:396`.
- `CHECK ((kind = 'discount' AND amount < 0) OR (kind IN ('scope_gap', 'exclusion') AND amount > 0) OR kind = 'correction')`. `PROPOSED`، يكرر `server/tenderService.ts:214`.
- الفئة: tenant_id. الإجراءات: `tender.adjustment_added`، `tender.adjustment_removed` (موجودة).

### 2.5 `tender_bid_amendments` (جديد: `PROPOSED`، تنفيذ البند 4 من قرار المالك، 22 أكتوبر 2026)
- الأعمدة: `id varchar(36) PRIMARY KEY`؛ `tenant_id varchar(36) NOT NULL` → `companies(id)`؛ `project_id varchar(36) NOT NULL` → `projects(id)`؛ `package_id varchar(36) NOT NULL` → `tender_packages(id)`؛ `bid_id varchar(36) NOT NULL`.
- `sequence_no integer NOT NULL CHECK (sequence_no >= 1)`.
- `changed_by_user_id integer NOT NULL` → `users(id)`؛ `changed_at timestamptz NOT NULL DEFAULT now()`.
- `reason varchar(500) NOT NULL CHECK (char_length(btrim(reason)) >= 10)`.
- `currency varchar(3) NOT NULL DEFAULT 'SAR' CHECK (currency = 'SAR')`.
- `old_amount numeric(18,2) NOT NULL CHECK (old_amount > 0)`، و`new_amount numeric(18,2) NOT NULL CHECK (new_amount > 0)`.
- `old_duration_days` و`new_duration_days` و`old_validity_days` و`new_validity_days`: `integer NULL`.
- القيود: `UNIQUE (bid_id, sequence_no)`؛ `FOREIGN KEY (bid_id, package_id) REFERENCES tender_bids (id, package_id)`؛ `CHECK (new_amount <> old_amount OR new_duration_days IS DISTINCT FROM old_duration_days OR new_validity_days IS DISTINCT FROM old_validity_days)` (لا تعديل بلا تغيير).
- الفهارس: `(tenant_id, project_id)` و`(package_id)`.
- **الحفظ بلا كتابة فوقه:** مشغّلات ترفض `UPDATE` و`DELETE` و`TRUNCATE` لكل الأدوار مع `ENABLE ALWAYS`، بنمط `audit_logs` (`drizzle/0000_baseline.sql:2531-2547`). ويُسحب من `project_os_app` الـUPDATE والـDELETE والـTRUNCATE، بخلاف الجداول العامة التي تمنحها الدالة الأربعة. حد معلن: مالك الجدول يستطيع حذف المشغّل (ADR-0002، الحدود 2).
- **القيمة الفعلية للعرض:** آخر صف بأكبر `sequence_no`، وإلا القيم الأصلية في `tender_bids`. `PROPOSED` عرض `tender_bid_effective_terms` بـ`DISTINCT ON (bid_id) ... ORDER BY bid_id, sequence_no DESC`. المقارنة (`levelBids`) تقرأ القيمة الفعلية فقط.
- **من يكتب:** الفاعل يساوي `tender_bids.entered_by_user_id` (تحقق في الخادم، مع اختبار)، والحزمة `closed`، والعرض `submitted`. لا كتابة بعد `awarded` أو `cancelled`.
- الفئة: tenant_id. الإجراء: `tender.bid_amended` (جديد).

### 2.6 `tender_award_approvals` (جديد: `PROPOSED`، تنفيذ البند 1 من قرار المالك، 22 أكتوبر 2026)
- `id`؛ `tenant_id`؛ `project_id`؛ `package_id` → `tender_packages(id)`؛ `bid_id` مع `package_id` في `FOREIGN KEY (bid_id, package_id) REFERENCES tender_bids (id, package_id)`.
- `approved_amount numeric(18,2) NOT NULL CHECK (approved_amount > 0)`: الإجمالي المسوّى بالريال وقت الاعتماد.
- `threshold_at_approval numeric(18,2) NOT NULL CHECK (threshold_at_approval >= 0)`: لقطة للعتبة وقت الاعتماد.
- `currency varchar(3) NOT NULL DEFAULT 'SAR' CHECK (currency = 'SAR')`.
- `approved_by_user_id integer NOT NULL` → `users(id)`؛ `approved_at timestamptz NOT NULL DEFAULT now()`.
- `used_at timestamptz NULL`؛ `used_by_user_id integer NULL` → `users(id)`؛ `CHECK ((used_at IS NULL) = (used_by_user_id IS NULL))`.
- `UNIQUE INDEX (package_id) WHERE used_at IS NULL`: اعتماد حيّ واحد لكل حزمة.
- الاستهلاك داخل معاملة الترسية: `UPDATE ... SET used_at, used_by_user_id WHERE id = $1 AND used_at IS NULL`. صفر صفوف يعني `PROJECT_OS_TENDER_APPROVAL_STALE`.
- الفئة: tenant_id. الإجراءات: `tender.award_approval_recorded`، `tender.award_approval_consumed`.

### 2.7 `tender_budget_exceptions` (جديد: `PROPOSED`، تنفيذ البند 2 من قرار المالك، 22 أكتوبر 2026)
- `id`؛ `tenant_id`؛ `project_id`؛ `package_id` → `tender_packages(id)`؛ `budget_line_id varchar(36) NOT NULL` → `budget_lines(id)`.
- `requested_amount numeric(18,2) NOT NULL CHECK (requested_amount > 0)`؛ `remaining_at_request numeric(18,2) NOT NULL CHECK (remaining_at_request >= 0)` (لقطة للمتبقي)؛ `CHECK (requested_amount > remaining_at_request)`: الاستثناء لا يُسجَّل إلا حين يلزم.
- `justification varchar(1000) NOT NULL CHECK (char_length(btrim(justification)) >= 10)`.
- `requested_by_user_id` (من يرسّي) و`approved_by_user_id` (المعتمِد)، كلاهما `integer NOT NULL` → `users(id)`؛ `CHECK (approved_by_user_id <> requested_by_user_id)`: لا يعتمد الطالب استثناءه، وهذا فصل المهام على مستوى القاعدة.
- `approved_at timestamptz NOT NULL DEFAULT now()`؛ `used_at timestamptz NULL`؛ `UNIQUE INDEX (package_id) WHERE used_at IS NULL`.
- `currency` كما في 2.6.
- من يعتمد: `BLOCKED_BY_OWNER` (القسم 8). الخادم يضيف `PROPOSED`: المعتمِد لا يُدخل عروض الحزمة.
- الفئة: tenant_id. الإجراءات: `tender.budget_exception_recorded`، `tender.budget_exception_consumed`.

### 2.8 `tenant_settings`: عتبة الترسية (موجود: `drizzle/schema.ts:154`)
- عمود جديد: `tender_award_threshold numeric(18,2) NULL CHECK (tender_award_threshold IS NULL OR tender_award_threshold >= 0)`. `PROPOSED`، بالريال.
- **لماذا عمود لا جدول:** الجدول فيه صف واحد لكل شركة (`tenant_settings_tenant_unique`، `drizzle/schema.ts:176`)، وفيه إعدادات الشركة كلها مع `updated_by_user_id`، وتاريخ التغيير يُحفظ في `audit_logs`. جدول منفصل `tenant_award_thresholds` يكرر ما يفعله التدقيق.
- **القيمة الافتراضية: `BLOCKED_BY_OWNER`.** التصميم يعمل بقيمة `NULL` ومعناها «غير مضبوطة»، والقاعدة: **كل ترسية تحتاج اعتماد EXECUTIVE إذا كانت العتبة `NULL`** (الاتجاه الآمن). لا يُكتب رقم افتراضي قبل أن يحدده المالك.
- الفئة: tenant_id (بلا `project_id`). الإجراء: `tenant.tender_threshold_changed`.

### 2.9 `commitments`: الربط ببند الميزانية (موجود: `drizzle/schema.ts:923`)
- عمود `budget_line_id varchar(36) NULL` → `budget_lines(id)`، وعمود `tender_package_id varchar(36) NULL` → `tender_packages(id)`. `PROPOSED`.
- `CHECK (tender_package_id IS NULL OR budget_line_id IS NOT NULL)`: الالتزام المنشأ من ترسية لا يُكتب دون بند ميزانية. `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 2: الربط إلزامي).
- `CHECK (tender_package_id IS NULL OR currency = 'SAR')`. `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 3).
- `UNIQUE INDEX (tender_package_id) WHERE tender_package_id IS NOT NULL`: التزام واحد لكل ترسية.
- الالتزامات القائمة غير المرتبطة تبقى كما هي، ولا تدخل في متبقي أي بند (انظر AM-9).

### 2.10 `budget_lines`: المتبقي (موجود: `drizzle/schema.ts:1483`)
- لا تغيير في الجدول. الصيغة `PROPOSED`:
  `remaining = current_amount − SUM(commitments.amount WHERE budget_line_id = X AND status IN ('draft', 'committed'))`.
  الالتزامات `released` و`cancelled` لا تُحسب. `draft` تُحسب حجزًا احتياطيًا، وهذا قابل للنقاش.
- القفل: صف `budget_lines` يُقفل بـ`SELECT ... FOR UPDATE` داخل معاملة الترسية، فلا تستهلك ترسيتان المتبقي نفسه. `PROPOSED`.
- العملة: الجدول بلا عمود عملة (`drizzle/schema.ts:1483-1497`)، والمبالغ تُفترض بالريال (انظر AM-8).

### 2.11 `audit_logs` (موجود: `drizzle/schema.ts:803`)
- لا تغيير في الشكل. الإجراءات الموجودة والجديدة (`PROPOSED`) تُكتب في الصف نفسه.
- الحماية: `UPDATE` و`DELETE` مرفوضان بالمشغّلات، وحساب التطبيق `SELECT, INSERT` فقط (`drizzle/0000_baseline.sql:2531-2547`). **لا توصف بأنها غير قابلة للعبث** (ADR-0002، الحدود 2).

### 2.12 متطلبات بعد الترحيل (`AFTER_MIGRATION`)
كل بند سطر، ويذكر القاعدة التي يخدمها:
- AM-1: ترحيلة جديدة بعد `drizzle/0000_baseline.sql`، دون تعديل للأساس. تُراجع SQL قبل التطبيق، ولا يُشغَّل `pnpm db:push` (القاعدة: الترحيل الآمن، `CLAUDE.md` §4).
- AM-2: `project_os_apply_conventions` يجب أن يصنّف الجداول الجديدة، وإلا تسقط الترحيلة (القاعدة: عزل المستأجر، ADR-0002).
- AM-3: مشغّلات `tender_bid_amendments` (الحفظ) و`tender_bids_lock_terms` (القفل) تُضاف في الترحيلة نفسها (القاعدة: البند 4).
- AM-4: `server/tenderService.ts:15` يعرف رموز MySQL فقط. يلزم ترجمة `23505` إلى `PROJECT_OS_TENDER_DUPLICATE` (القاعدة: الخطأ الصريح).
- AM-5: `server/tenderService.ts:265` يقرأ `affectedRows`. في PostgreSQL يُقرأ عدد الصفوف من `.returning()`، وصفر صفوف يُرجع `CONFLICT` صريحًا (القاعدة: `rows=0` خطأ صريح).
- AM-6: `server/tenderService.ts:244` يضيف `project.commitment.manage` (القاعدة: البند 2، إغلاق S-1).
- AM-7: `server/_core/database.ts` (فرع PostgreSQL): يلزم إثبات أن سياق RLS (`app.tenant_ids`) يبقى داخل `db.transaction` وتحت مجمّع المعاملات (المنفذ 6543). وإلا تُقرأ صفوف الشركة فارغة (القاعدة: العزل).
- AM-8: `projects.currency` و`contracts.currency` و`commitments.currency` افتراضيها `USD` (`drizzle/schema.ts:881` و`:912` و`:933`). يلزم التحقق أن كل مشروع مُفعَّل بالريال قبل تفعيل الترسية (القاعدة: البند 3).
- AM-9: الالتزامات القائمة بلا `budget_line_id` لا تدخل في المتبقي. يلزم ترحيل ربطها، أو قبول أن المتبقي يساوي `current_amount` إلى ذلك الحين (القاعدة: البند 2).
- AM-10: `tender_packages.awarded_*` بلا `FOREIGN KEY` اليوم (`drizzle/schema.ts:2367-2369`) (القاعدة: سلامة الترسية).
- AM-11: `audit_logs` بلا `project_id`، ويبقى في `metadata` (القاعدة: التدقيق في كل كتابة).
- AM-12: `server/tender.award.database.test.ts:10` يقبل بروتوكول MySQL فقط. يلزم اختبار PostgreSQL على `project_os_integration_test` (القاعدة: `CLAUDE.md` §4 و§7).
- AM-13: `server/tenderService.ts:61-67` يحوّل عدّ الصفوف بـ`Number(...)`، ويبقى ذلك في PostgreSQL (القاعدة: قراءة الأرقام صحيحة).

## 3. الشاشات

**الشاشة الأساسية (موجودة):** `/projects/:tenantId/:projectId/controls` (`client/src/App.tsx`)، والقسم `manager-tenders` داخل `ProjectControls` (`client/src/pages/ProjectControls.tsx:254`)، والمكوّن `ProjectTenders` (`client/src/pages/ProjectTenders.tsx`).
- **من يرى:** من يحمل `project.read` يرى القسم والقراءات (`server/tenderService.ts:48` و`:54` و`:75` و`:83`). الكتابات تظهر بـ`WriteGate` (`client/src/lib/permissions.tsx`) لمن يحمل صلاحيتها فقط، والخادم يحكم على كل استدعاء أيضًا.
- **الإجراءات:** إنشاء حزمة ودعوات وتغيير الباب (`project.tender.manage`)؛ إدخال عرض وسحبه أثناء `open` (`project.tender.bids`)؛ استبعاد عرض، وإضافة تسوية وحذفها أثناء `closed` (`project.tender.level`)؛ الترسية أثناء `closed` (`project.tender.award`).
- **الحالات:** تحميل: «جارٍ التحميل…». فارغ: «لا حزم بعد.» (`ProjectTenders.tsx:88`). خطأ: عنصر `role="alert"` يعرض الرسالة المترجمة من `shared/projectErrors.ts` (`ProjectTenders.tsx:44` و`:72`). بلا صلاحية كتابة: نص «لا تملك صلاحية … فالقسم للعرض فقط.» (`ProjectTenders.tsx:18`).

**نموذج الترسية (موجود، مع إضافات `PROPOSED`):** يظهر لمن يحمل `project.tender.award` داخل حزمة `closed` بعروض صالحة، ويضيف:
- اختيار بند الميزانية (إلزامي)، مع عرض المتبقي والمطلوب بجانبه.
- حالة العتبة: «تحتاج اعتماد التنفيذي» أو «لا تحتاج». عند `NULL`: «العتبة غير مضبوطة: الترسية تحتاج اعتمادًا».
- حقل تسبيب الاستثناء (10 أحرف على الأقل) يظهر فقط حين يتجاوز المطلوب المتبقي.
- زر الترسية معطّل حتى تكتمل الشروط، والخادم يرفض أي إرسال ناقص برسالة مترجمة.
- حالة فارغة: «لا عروض صالحة للترسية.»
- من يحمل `project.read` فقط يرى حالة الاعتماد للقراءة.

**تعديل العرض بعد الإغلاق (`PROPOSED`):** داخل بطاقة العرض في حزمة `closed`، ولمُدخله فقط (`project.tender.bids`): حقول السعر والمدة والصلاحية، وسبب إلزامي (10 أحرف). تحت البطاقة سجل التعديلات: القيمة القديمة والجديدة، ومن غيّر ومتى، والسبب. يظهر لكل من يحمل `project.read`. الحالة الفارغة: «لم يُعدَّل هذا العرض.»

**اعتمادات الترسية (`PROPOSED`):** قسم جديد في `/executive/:tenantId` (المسار موجود في `client/src/App.tsx`)، يعرض الحزم التي تنتظر اعتمادًا. الاعتماد يتطلب `executive.award.approve`، والعرض للقراءة يتطلب `executive.read`. الحالة الفارغة: «لا اعتمادات معلقة.»

**عتبة الترسية (`PROPOSED`):** حقل «عتبة الترسية (ريال)» في `/tenants/:tenantId/administration`، يظهر لمن يحمل `tenant.manage`. تحته نص صريح: «اتركه فارغًا يعني أن كل ترسية تحتاج اعتماد التنفيذي.» والحفظ يكتب سطر التدقيق.

**التجاوب:** 390px دون تمرير أفقي للصفحة. الجداول داخل `overflow-x-auto` كما في الصف (`docs/STATE.md:385`)، والهامش الجانبي 16px.

## 4. الصلاحيات

| الرمز | المكان في الكود | ما يحرسه |
|---|---|---|
| `project.read` | `assertTenderAccess` (`server/tenderService.ts:48`، `:54`، `:75`، `:83`) | قراءة الحزم والدعوات والمقارنة |
| `project.tender.manage` | `server/domain/operationalRoles.ts:39` | الحزم، والدعوات، وتغيير الباب |
| `project.tender.bids` | `server/domain/operationalRoles.ts:40` | إدخال العرض، وتعديله أثناء `open`، وسحبه. وتعديله بعد الإغلاق (`PROPOSED`، لمُدخله فقط) |
| `project.tender.level` | `server/domain/operationalRoles.ts:41` | التسوية، والاستبعاد |
| `project.tender.award` | `server/domain/operationalRoles.ts:42` | الترسية. `DECIDED` (قرار المالك، 22 أكتوبر 2026، البند 1): الدور المتعاقد أو مدير المشروع |
| `project.commitment.manage` | `server/domain/operationalRoles.ts:7`؛ `server/domain/operationalPermissions.ts:30` | **تُضاف إلى الترسية.** `PROPOSED` (إغلاق S-1، البند 2) |
| `project.manage` | `server/domain/operationalRoles.ts:32` | معتمِد استثناء الميزانية. `PROPOSED`، وينتظر القسم 8 |
| `executive.award.approve` | جديد، يُضاف إلى كتالوج EXECUTIVE بجوار `executive.read` (`server/db.ts:836`) | اعتماد الترسية فوق العتبة. `PROPOSED` |
| `executive.read` | `server/db.ts:836` | قراءة الاعتمادات. `PROPOSED` |
| `tenant.manage` | `server/db.ts:835` | ضبط عتبة الترسية. `PROPOSED` |

**قواعد الدمج** (تحرسها `server/domain/operationalPermissions.ts`):
- `conflictingPermissionPairs` (`:84-94`): `project.tender.bids` ↔ `project.tender.award` (السطر 92)، و`project.tender.bids` ↔ `project.tender.level` (السطر 93). هذا تنفيذ البند 5 من قرار المالك، 22 أكتوبر 2026 (من يُدخل العروض لا يرسّي).
- `assertNoPermissionConflict` (`:101-103`) يرفض أي دور أو تركيبة تجمع الزوجين.
- المالك يحمل كل شيء بالتعريف (`:79-83`)، لكن قاعدة الأشخاص (`PROJECT_OS_TENDER_SELF_AWARD`، `server/tenderService.ts:252`) تسري عليه أيضًا.
- لا يُقبل `project.write` العام لأي فعل من هذه الأفعال (`server/domain/operationalPermissions.ts:5-7`).

**أثر على الأدوار الجاهزة** (`PROPOSED`، وينتظر القسم 8):
- `PROJECT_MANAGER` (`server/domain/operationalRoles.ts:64-89`) لا يحمل `project.tender.award` اليوم. البند 1 يجعله حاملًا لها، لكن إضافتها تمنحها لكل مدير مشروع في الشركات القائمة صامتًا، وهذا ما تجنّبه أمر العمل 5 (البند 3) عمدًا (`docs/STATE.md:386`). التغيير يحتاج خطوة ترحيل صريحة ومعلنة.
- `CONTRACTS_MANAGER` (`server/domain/operationalRoles.ts:102`) يحمل `project.tender.bids`، فلا يقبل `project.tender.award` بقاعدة الفصل. البند 1 يذكر «الدور المتعاقد»، وهذا تعارض مع الدور القائم.

## 5. حالات الرفض

كل حالة تُرجع خطأ tRPC بالرمز المذكور، وتعرض رسالتها المترجمة من `shared/projectErrors.ts`. لا فشل صامت. «موجود» يعني أن الرمز في الكود اليوم، و«جديد» يعني `PROPOSED`.

| # | الحالة | الرمز (نوع tRPC) | ما يراه المستخدم | الحالة |
|---|---|---|---|---|
| 1 | الترسية والباب ليس `closed` | `PROJECT_OS_TENDER_NOT_CLOSED` (CONFLICT) | لا ترسية قبل إغلاق الباب | موجود (`tenderService.ts:246`) |
| 2 | العرض الفائز ليس في الحزمة | `PROJECT_OS_TENDER_BID_NOT_FOUND` (NOT_FOUND) | «غير متاحة ضمن المشروع» | موجود (`:250`) |
| 3 | العرض مسحوب أو مستبعد | `PROJECT_OS_TENDER_BID_NOT_ELIGIBLE` (CONFLICT) | لا ترسية على عرض مسحوب | موجود (`:251`) |
| 4 | مُدخل أي عرض في الحزمة يرسّيها | `PROJECT_OS_TENDER_SELF_AWARD` (CONFLICT) | يلزم شخص آخر | موجود (`:252`) |
| 5 | أقل من عرضين صالحين دون تسبيب (10 أحرف) | `PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED` (BAD_REQUEST) | حقل التسبيب مطلوب | موجود (`:255`) |
| 6 | ترسية دون `project.commitment.manage` | `FORBIDDEN` | رسالة بالعربية. الرسالة الحالية إنجليزية (`server/domain/authorization.ts:44`)، وهذه فجوة | `PROPOSED` |
| 7 | بند الميزانية غير مختار | `PROJECT_OS_TENDER_BUDGET_LINE_REQUIRED` (BAD_REQUEST) | يُطلب البند | جديد |
| 8 | البند ليس ضمن المشروع والشركة | `PROJECT_OS_TENDER_BUDGET_LINE_NOT_FOUND` (NOT_FOUND) | «غير متاح ضمن المشروع» | جديد |
| 9 | المبلغ أكبر من المتبقي دون استثناء | `PROJECT_OS_TENDER_BUDGET_EXCEEDED` (CONFLICT) | يظهر المبلغ والمتبقي، ولا يُكتب شيء | جديد |
| 10 | استثناء بلا تسبيب (10 أحرف) أو بلا معتمِد | `PROJECT_OS_TENDER_EXCEPTION_INCOMPLETE` (BAD_REQUEST) | الحقل مطلوب | جديد |
| 11 | المعتمِد هو الطالب، أو مُدخل عرض في الحزمة | `PROJECT_OS_TENDER_EXCEPTION_SELF_APPROVAL` (CONFLICT) | يلزم معتمِد آخر | جديد |
| 12 | الإجمالي فوق العتبة (أو العتبة `NULL`) دون اعتماد صالح | `PROJECT_OS_TENDER_EXECUTIVE_APPROVAL_REQUIRED` (CONFLICT) | تظهر الحالة، ولا يُكتب شيء | جديد |
| 13 | المعتمِد هو المرسّي، أو مُدخل عرض | `PROJECT_OS_TENDER_APPROVAL_SELF` (CONFLICT) | يلزم شخص آخر | جديد |
| 14 | الاعتماد لا يطابق الإجمالي المسوّى الآن | `PROJECT_OS_TENDER_APPROVAL_STALE` (CONFLICT) | يلزم اعتماد جديد | جديد (يحتاج AM-5) |
| 15 | عملة غير SAR في عرض أو حزمة أو اعتماد | `PROJECT_OS_TENDER_CURRENCY_NOT_SAR` (BAD_REQUEST) | الريال هو العملة المقبولة | جديد (فجوة: `routers.ts:389`، `:392`) |
| 16 | تعديل أو سحب عرض ليس لمُدخله، حتى للمالك | `PROJECT_OS_TENDER_BID_NOT_OWN` (FORBIDDEN) | لا يعدّل أحد عرض غيره | جديد (فجوة: `tenderService.ts:160-187`) |
| 17 | تعديل بعد الإغلاق دون سبب (10 أحرف)، أو دون تغيير | `PROJECT_OS_TENDER_AMENDMENT_INCOMPLETE` / `PROJECT_OS_TENDER_AMENDMENT_NO_CHANGE` (BAD_REQUEST) | رسالة محددة لكل منهما | جديد |
| 18 | تعديل بعد الترسية أو الإلغاء، أو لعرض غير مُقدَّم | `PROJECT_OS_TENDER_AMENDMENT_CLOSED` (CONFLICT) | لا تعديل بعد الترسية | جديد |
| 19 | تعديل أو سحب أثناء `closed` بالمسار القديم | `PROJECT_OS_TENDER_NOT_OPEN` (CONFLICT) | يُوجَّه المستخدم إلى «تعديل بعد الإغلاق» | موجود (`:165`، `:180`) |
| 20 | إعادة فتح مناقصة فيها عروض بعد الإغلاق | `PROJECT_OS_TENDER_TRANSITION_INVALID` (BAD_REQUEST) | مرفوض (القسم 8) | الرمز موجود، والقاعدة `PROPOSED` |
| 21 | ترسية متزامنة، أو صفر صفوف عند التحديث | `PROJECT_OS_TENDER_NOT_CLOSED` (CONFLICT) | يُلغى العقد والالتزام معًا | موجود (`:265`، يحتاج AM-5) |
| 22 | رمز عقد أو التزام مكرر في المشروع | `PROJECT_OS_TENDER_DUPLICATE` (CONFLICT) | لا يبقى شيء نصف مكتوب | موجود (`:16`، يحتاج AM-4) |
| 23 | مبلغ عرض `≤ 0`، أو علامة تسوية خاطئة | خطأ القيد (SQLSTATE 23514) يُترجم إلى `PROJECT_OS_TENDER_ADJUSTMENT_SIGN` عند التسوية | يظهر الخطأ | الخادم موجود (`:214`)، والقيد جديد |
| 24 | عرض أو حزمة أو عقد لمستأجر آخر أو مشروع آخر | `NOT_FOUND` أو `FORBIDDEN` | لا وجود للسجل | موجود (`mine()`، `assertProjectWithinTenant`) |
| 25 | كتابة لا يمكن تدقيقها | تُرجع المعاملة كلها، ويظهر خطأ عام مترجم | لا عقد بلا سجل | موجود (المبدأ) |

## 6. معايير القبول (قابلة للاختبار)

1. الترسية بلا `project.tender.award` تُرفض بـ`FORBIDDEN`، وبلا `project.commitment.manage` تُرفض بـ`FORBIDDEN` أيضًا (إغلاق S-1).
2. كل ترسية تنتج صف `commitments` واحدًا بـ`budget_line_id` و`tender_package_id` غير فارغين، وصف `contracts` بالعملة `SAR`، وتصير الحزمة `awarded` بالروابط الثلاثة.
3. ترسية بمبلغ أكبر من المتبقي دون استثناء تُرفض بـ`PROJECT_OS_TENDER_BUDGET_EXCEEDED`، ولا يبقى صف في `contracts` أو `commitments`.
4. ترسية بالاستثناء (تسبيب 10 أحرف، ومعتمِد غير الطالب وغير المُدخل) تنجح، وتكتب صفًا في `tender_budget_exceptions` بـ`used_at`، وسطر تدقيق في المعاملة نفسها.
5. الاستثناء الواحد لا يُستهلك مرتين (الفهرس الجزئي): المحاولة الثانية تُرفض.
6. ترسية فوق العتبة بلا اعتماد صالح تُرفض بـ`PROJECT_OS_TENDER_EXECUTIVE_APPROVAL_REQUIRED`. ومع اعتماد مطابق للإجمالي تنجح، وتستهلك الاعتماد.
7. العتبة `NULL` تعني أن كل ترسية تحتاج اعتمادًا.
8. مُدخل عرض في الحزمة لا يرسّيها ولا يعتمد ترسيتها ولا استثناءها، وإن كان مالك الشركة.
9. أي عملة غير `SAR` في عرض أو حزمة أو اعتماد تُرفض بـ`PROJECT_OS_TENDER_CURRENCY_NOT_SAR`، والقيد نفسه يرفض `INSERT` مباشرًا بعملة أخرى.
10. مبلغ عرض `≤ 0` يرفضه القيد، ومبلغ تسوية `0` يرفضه القيد أيضًا.
11. من لم يُدخل العرض لا يعدّله ولا يسحبه، وإن حمل `project.tender.bids`، وحتى المالك.
12. بعد الإغلاق لا يتغير `tender_bids.amount` ولا المدة ولا الصلاحية. المحاولة المباشرة يرفضها المشغّل، والتعديل المقبول يصنع صفًا جديدًا في `tender_bid_amendments`، والقيم القديمة كلها باقية.
13. `UPDATE` و`DELETE` على `tender_bid_amendments` يُرفضان لكل الأدوار، ولحساب `project_os_app` لا صلاحية لهما.
14. المقارنة تستعمل القيم الفعلية (آخر تعديل)، فيتغير الترتيب وأدنى سعر والوسيط بالتعديل.
15. اعتماد مسوّى قديم (تغيّر الإجمالي بعد الاعتماد) يُرفض بـ`PROJECT_OS_TENDER_APPROVAL_STALE`.
16. كل كتابة محمية تكتب سطر تدقيق في المعاملة نفسها، وإذا فشل التدقيق تفشل الكتابة كلها.
17. مستأجر آخر لا يرى حزمة ولا عرضًا ولا عقدًا ولا استثناءً ولا تعديلًا، وهذا يُختبر بـRLS وحدها (دون فلتر الخادم). ومشروع آخر لنفس المستأجر لا يُرى من الخادم.
18. ترسيتان متزامنتان: واحدة تنجح، والثانية تُرجع `PROJECT_OS_TENDER_NOT_CLOSED` صراحةً، دون عقد ثانٍ.
19. الشاشة تُظهر الترسية لمن يحمل `project.tender.award` فقط، وتُظهر حالة العتبة والمتبقي قبل الإرسال.
20. عند 390px لا تمرير أفقي للصفحة، وتظهر الحالات الثلاث: تحميل، وفارغ، وخطأ.
21. الترحيلة تفشل إن وُجد جدول جديد غير مصنّف في `project_os_apply_conventions` (ADR-0002).
22. عدد الاختبارات الناجحة لا ينقص عن آخر رقم مُثبت. ولا يُعلن `PASS` شاملًا، بل يُكتب نطاق ما فُحص وما لم يُفحص (`CLAUDE.md` §1 و§7).

## 7. الاختبارات المطلوبة

**وحدة (دوال نقية):**
- `server/domain/tenders.ts` فيه `levelBids` و`tenderTransitions`. لا توجد وحدة اسمها `bidComparison` في الفرع، والمقارنة هي `levelBids`.
- الموجود: `server/domain/tenders.test.ts` (7 اختبارات).
- الجديد (`PROPOSED`، دوال نقية في `server/domain/tenders.ts`): `budgetRemaining(line, commitments)`، و`requiresExecutiveApproval(total, threshold)` (العتبة `NULL` تعيد `true`، ومساوي العتبة لا يحتاج اعتمادًا)، و`effectiveBidTerms(bid, amendments)` (آخر تعديل يغلب، وإلا الأصل)، و`isSarCurrency(value)`، و`amendmentChanges(old, next)` (لا تعديل بلا تغيير)، و`isNotOwnBid(userId, enteredBy)`.
- الاختبارات الجديدة تغطي الحدود: المتبقي مع `draft` و`released`، والمساواة مع العتبة، والتعديل المتسلسل، وأن `levelBids` تستعمل القيم الفعلية.

**تكامل قاعدة البيانات (PostgreSQL، على `project_os_integration_test` فقط):**
- ملف جديد (`PROPOSED`) يحل محل `server/tender.award.database.test.ts`، الذي يقبل MySQL فقط (سطر 10).
- الحارس: `server/testing/databaseGuard.setup.ts` يوقف التشغيل إن سمّى `DATABASE_URL` قاعدة غير `project_os_integration_test`. التشغيل عبر `scripts/run-integration-database-test.mjs`. لا تشغيل على الإنتاج.
- الحالات: الترسية بالصلاحيات الناقصة؛ تجاوز الميزانية والاستثناء؛ الاعتماد واستهلاكه مرة واحدة؛ العتبة `NULL`؛ الاعتماد المتقادم؛ الترسيتان المتزامنتان؛ `CHECK` للعملة والمبلغ (`INSERT` مباشر يفشل بـ23514)؛ `UPDATE` على `tender_bid_amendments` يُرفض لحساب التطبيق؛ `tender_bids_lock_terms` يرفض التعديل بعد الإغلاق؛ RLS: استعلام بلا سياق لا يرى صفًا واحدًا؛ سطر التدقيق في المعاملة نفسها، وفشل التدقيق يُرجع الكتابة.
- **ضوابط سلبية** (كل فحص يجب أن يفشل عند إزالة حمايته): حذف فحص `project.commitment.manage` يُفشل اختبار S-1؛ حذف مشغّل `tender_bid_amendments` يُفشل اختبار الحفظ؛ حذف شرط `status = 'closed'` في تحديث الترسية يُفشل اختبار التزامن.

**واجهة (React):**
- الملف الحالي: `client/src/pages/ProjectTenders.interaction.test.tsx` (7 اختبارات).
- الإضافات (`PROPOSED`): نموذج الترسية يظهر بـ`project.tender.award` فقط؛ حقل الميزانية وعرض المتبقي؛ حقل التسبيب يظهر عند التجاوز فقط؛ زر التعديل بعد الإغلاق لمُدخل العرض فقط؛ حالة العتبة؛ رسائل الخطأ المترجمة.

**متصفح ورحلات الأدوار:**
- `scripts/e2e-roles.mjs` و`scripts/lib/roleFixture.mjs` يُمدّان بسيناريو مدير العقود (يُدخل ولا يرسّي) ومنسق الاعتماد التنفيذي، مع القياس عند 390px.

**أداء:** `scripts/perf-tenders.mjs` يُعاد تشغيله على PostgreSQL. الأرقام الحالية (`docs/STATE.md:385`) قيست على MySQL وTiDB، ولا تُنقل إلى PostgreSQL.

## 8. المخاطر والأسئلة المفتوحة

تُنقل البنود المحجوزة إلى `docs/OWNER_ACTIONS.md` بخطوات نقر بالعربية عند التنفيذ (`CLAUDE.md` §5).

**بنود يحجزها المالك (`BLOCKED_BY_OWNER`، لا تُفترض):**
1. التجربة (trial).
2. الأسعار.
3. المقاعد (seats).
4. مزود البريد.
5. تعدد الشركات لكل حساب.
6. هل يجوز لأحد أن يرسّي دون `project.tender.award`.

**قرارات مشتقة من تعارض القرارات مع الكود** (`BLOCKED_BY_OWNER`، لم ترد في البنود الخمسة):
7. **من يرسّي؟** البند 1 يذكر «الدور المتعاقد»، ودور `CONTRACTS_MANAGER` يحمل `project.tender.bids`، فلا يقدر على حمل `project.tender.award` (`server/domain/operationalPermissions.ts:92`). الخيارات: (أ) ترسية `PROJECT_MANAGER` وحده، بعد إضافة `project.tender.award` إليه بخطوة ترحيل معلنة، مع إزالة `project.tender.bids` من `CONTRACTS_MANAGER`؛ (ب) دور مالي جديد. التوصية المعروضة (أ)، ولا تُنفَّذ قبل الموافقة.
8. **إعادة فتح الباب بعد الإغلاق.** `tenderTransitions.closed` يسمح بـ`open`، والبند 4 يقول إن العروض تُقفل عند الإغلاق. التوصية (`PROPOSED`): العودة مرفوضة بعد دخول أي عرض، والتعديل بعد الإغلاق لمُدخل العرض فقط.
9. **من يعتمد استثناء الميزانية؟** البند 2 يوجب «معتمِدًا» دون تسميته. التوصية (`PROPOSED`): `project.manage`، على ألا يكون الطالب ولا مُدخلًا.
10. **قيمة عتبة الترسية الافتراضية.** رقم مالي يحدده المالك، والافتراضي `NULL` (انظر 2.8).
11. **الاعتماد التنفيذي يحتاج باقة تتضمن EXECUTIVE** (`server/domain/authorization.ts:4-12`). شركة بباقة `PROJECT` وحدها لا تستطيع الترسية فوق العتبة. هل هذا مقصود؟

**مخاطر (غير محجوزة):**
- الالتزامات القائمة بلا بند ميزانية (AM-9) تُخفي المتبقي الحقيقي حتى تُربط.
- المشاريع بعملة غير SAR (AM-8) لا تُرسى في V1 قبل التحقق منها.
- الأرقام المُثبتة في `docs/STATE.md:385` قيست على MySQL، ولا تُعتمد لـPostgreSQL قبل إعادة القياس.
