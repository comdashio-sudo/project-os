# إعادة التشغيل الحية على MySQL محلي — 15 أكتوبر 2026

**ما هذا:** رد على بند «لكل صف UNVERIFIED أثبته أو اربطه باختبار حي». كل الاختبارات الحية القائمة أُعيد تشغيلها على قاعدة **بُنيت من الترحيلات وحدها**، والصفوف التي تعتمد عليها مربوطة أدناه باسم الاختبار.

**ما ليس هذا:** ليس دليلًا على TiDB. الصفوف تبقى `UNVERIFIED` لأن المحرك المعتمد (TiDB Serverless) لم يُجرَّب، وسلوك MySQL 8 ليس إثباتًا لسلوك TiDB (مثال حقيقي في هذه الدفعة: صياغة `ADD COLUMN IF NOT EXISTS` كانت تعمل على TiDB ولا يقبلها MySQL). يُعاد بالأمر نفسه حين يُوضع `DATABASE_URL` لقاعدة TiDB جديدة، فترتفع الصفوف بلا كتابة اختبار جديد.

## البيئة والأوامر

| البند | القيمة |
|---|---|
| المحرك | MySQL 8.0.46 محلي مؤقت، قاعدة `project_os_integration_test` فقط (أُعيد إنشاؤها فارغة قبل التشغيل) |
| الالتزام | `0b382b5` على `main` |
| بناء القاعدة | `node scripts/migrate.mjs` ← 55 ترحيلًا، 102 جدولًا |
| الاختبارات الحية | `node scripts/run-integration-database-test.mjs`: **84/84** للملفات الأربعة الأقدم (أدناه)، و6/6 لـ`profitability.database.test.ts` |
| منح التدقيق | `pnpm verify:audit-grants` ← `approved: true`؛ UPDATE وDELETE على `audit_logs` رُفضا بـ`ER_TABLEACCESS_DENIED_ERROR` عبر حساب التطبيق المقيد |
| مخطط PMC | `pnpm verify:pmc-schema` ← `approved: true`، 12/12 جدولًا |
| اتساق Drizzle | `pnpm drizzle-kit generate` ← «No schema changes, nothing to migrate» |
| استيراد Excel (وحدة) | `pnpm vitest run server/domain/dataImport.test.ts` ← 21/21 |
| بوابة بلا قاعدة | `pnpm check` ناجح، `pnpm build` ناجح، `pnpm test` ← 97 ملفًا ناجحًا و9 متخطاة، 615 ناجحًا و97 متخطى |

## ربط الصفوف باختباراتها الحية

أرقام الأسطر التي ذكرتها الصفوف القديمة (`integration.database.test.ts:NNNN`) **لم تعد صحيحة**: حُذفت 55 جملة DDL من رأس الملف فانزاحت الأسطر. المرجع الاسمي هنا.

| صف STATE | الاختبار الحي (العنوان كما في الملف) |
|---|---|
| تكامل MySQL/TiDB وعزل المستأجر | ملف `integration.database.test.ts` كله (75) |
| الدفعة 6.ج: الرواتب وتكلفة العمالة | governs payroll by role, protects salary reads, separates approval, and posts allocated labor cost into numeric EVM evidence |
| الدفعة 6.د: الإسناد والحضور والطاقة | governs employee assignments, attendance, capacity warnings, and approved time into cost and progress |
| الدفعة 6.هـ: مؤشرات الأداء الفردية | الاختبار نفسه (6.د): يستدعي `performance.get` داخله |
| الاستيراد الزمني المحكوم | rejects unlicensed or foreign schedule imports and atomically confirms a restricted XER WBS and activity set |
| الدفعة 2.4: طلب المواد من الموقع | governs site material requests through WBS/activity scope, partial issue, closure, and audit evidence |
| الدفعة 2.5: استلام المواد (GRN) | governs goods receipt notes with issued purchase orders and rejection evidence |
| الدفعة 2.6: رصيد المخزون المشتق | rejects a foreign warehouse, governs inventory movements, and prevents negative stock |
| الدفعة 2.7: صرف المواد والتكلفة الفعلية | rejects a foreign warehouse… (الصرف إلى WBS)؛ governs site material requests… (الصرف الجزئي) |
| الدفعة 2.8: نقل المواد بين المستودعات | rejects a foreign warehouse, governs inventory movements… (يشمل النقل) |
| الدفعة 2.9: حد إعادة الطلب ونقص المواد | governs material reorder levels and derives PMO shortages from movements without creating read-side alerts |
| الدفعة 2.10: GRN والالتزام والتكلفة | governs goods receipt notes with issued purchase orders and rejection evidence؛ rejects cross-project procurement references and governs linked purchase-order receipt |
| Excel لـWBS والميزانية والعقود والمواد | analyzes and confirms an authorized WBS import…؛ rejects a foreign contracts import…؛ rejects a foreign materials import… + الوحدة `dataImport.test.ts` 21/21 |
| بدء المرحلة A / عزل PMC السلوكي عبر API | isolates PMC summary reads by tenant and project across all 12 tables |
| نموذج بيانات PMC | `pnpm verify:pmc-schema` ← `approved: true` |
| اتساق Drizzle | `pnpm drizzle-kit generate` ← لا تغييرات |
| حماية `audit_logs` قبل Pilot | `pnpm verify:audit-grants` ← `approved: true` (ضابط حساب لا triggers، كما يُعلن الصف) |
| سياسة بيانات Pilot والنسخ والاسترجاع | `pilot.backupRestore.database.test.ts` (1/1): writes a tenant-scoped backup artifact, restores it after simulated loss, and proves the owner, roles, records, and audit survive |
| الدفعة 1: تثبيت الجاهزية | `coverage:trpc` الآن: 189 إجراءً، 185 بإحالة مباشرة، صفر غير مصنف (كانت 117/112 وقت الصف)؛ `verify:audit-grants` approved |

## أسماء الاختبارات الحية كلها

### `server/auth.loginCodes.database.test.ts` — 4/4

- stores, counts and finds the newest open code
- counts attempts and consumes a code exactly once, even for simultaneous callers
- retires every open code and never returns an expired one
- runs the whole service against the real table

### `server/integration.database.test.ts` — 75/75

- applies migration 0042 once to an isolated requisition-table copy
- connects exclusively to the dedicated PROJECT OS integration database
- isolates PMC summary reads by tenant and project across all 12 tables
- rejects a cross-tenant advisory request before any model invocation
- returns only licensed and authorized navigation items and rejects a foreign project context
- seeds operational roles, rejects conflicting procurement and warehouse assignments, and audits an allowed assignment
- isolates the tenant material master, rejects missing entitlement, and records governed project overrides
- isolates Master Plan snapshots by tenant, project, version, and creator while preserving a recoverable view
- isolates and persists Master Plan visualization rules with a project audit trail
- governs tenant role and membership administration with scope and self-privilege guards
- governs tenant invitations with scope, email, one-time acceptance, and audit evidence
- governs tenant membership suspension and reactivation with scope, self-protection, and audit evidence
- creates an isolated tenant with subscription, owner access, audit evidence, and cleanup
- governs document creation and versioning with isolation, storage evidence, and audit cleanup
- governs remaining operational wrapper reads with authorized scope and foreign rejection
- returns a tenant-scoped planning control center with latest EVM, health, schedule, and exception signals
- governs project creation and lifecycle transitions with isolation and audit evidence
- governs manual EVM calculation and snapshot persistence with isolation and audit evidence
- governs change-request and HSE transitions with isolation, reads, and audit evidence
- rejects a foreign master plan and creates versioned spatial records with audit evidence
- provisions a manual license, enforces its feature limit, governs status changes, and rejects a foreign tenant license view
- reserves commercial seats for invitations and blocks direct assignment or acceptance above the active limit
- enforces the licensed project limit before project creation and allows a governed project after capacity is restored
- enforces the licensed document-storage limit before uploading a document or version and allows them after capacity is restored
- blocks an AI advisory request at the monthly commercial limit before any model call or usage audit
- expires an ended tenant license, deactivates its entitlement, and records an auditable lifecycle transition
- rejects disabled and exhausted data-import and data-export features before storage, business writes, or export audit writes
- rejects cross-tenant import analysis before file storage or import audit writes
- rejects a cross-tenant export and generates an authorized CSV export with audit evidence
- generates an authorized Arabic XLSX export with localized content and audit evidence
- rejects a foreign budget export and generates authorized budget CSV and activity XLSX exports with audit evidence
- analyzes and confirms an authorized WBS import with atomic business and audit writes
- rejects unlicensed or foreign schedule imports and atomically confirms a restricted XER WBS and activity set
- rejects a foreign contracts import and confirms an approved contracts template with independent audit evidence
- rejects a foreign materials import and confirms the named materials template with audit evidence
- rejects a foreign warehouse, governs inventory movements, and prevents negative stock
- governs material reorder levels and derives PMO shortages from movements without creating read-side alerts
- governs goods receipt notes with issued purchase orders and rejection evidence
- governs site material requests through WBS/activity scope, partial issue, closure, and audit evidence
- applies the upsert policy, persists per-row results, and rejects foreign import-result reads
- rejects a cross-tenant field report and governs an authorized report lifecycle with audit evidence
- rejects a cross-tenant quality inspection and governs its authorized acceptance lifecycle
- rejects cross-project procurement references and governs linked purchase-order receipt
- rejects foreign, self, and duplicate control links while recording authorized PMO relationships
- links a governed risk to authorized RFI and NCR targets with audit evidence
- rejects cross-tenant EVM and health snapshot captures before writing snapshots
- captures authorized EVM and health snapshots with audit evidence
- rejects cross-tenant WBS creation and creates governed WBS activity and progress records with audit evidence
- rejects cross-tenant budget and cost writes and creates authorized financial records with audit evidence
- rejects a WBS from a sibling project before budget cost or progress writes and allows the owned WBS
- does not return an HSE observation outside the requested tenant and project
- rejects a real tRPC HSE write before any business record when the actor has no tenant membership
- creates an HSE observation through real tRPC with one audit record
- rejects an NCR write for a project outside the tenant before creating a record
- creates and transitions an NCR through real tRPC with audit evidence
- rejects an RFI write outside the tenant and allows a governed RFI transition with audit evidence
- rejects a cross-tenant PMO issue and creates an authorized issue with audit evidence
- rejects cross-tenant PMO risk and action writes and creates authorized records with audit evidence
- rejects cross-tenant PMO escalations and governs eligible issue and action transitions with audit evidence
- rejects a cross-tenant contract and creates an authorized contract with audit evidence
- rejects a cross-tenant commitment and creates an authorized commitment with audit evidence
- rejects a cross-tenant executive decision and creates an authorized decision with audit evidence
- rejects a cross-tenant portfolio link and creates governed portfolio-program-project links with audit evidence
- returns executive cash flow only from the authorized tenant and excludes void or cancelled sources
- rejects a cross-tenant resource update and updates an authorized allocation with audit evidence
- governs employee records, contracts, protected identity reads, and archival with entitlement and tenant isolation
- governs employee assignments, attendance, capacity warnings, and approved time into cost and progress
- governs payroll by role, protects salary reads, separates approval, and posts allocated labor cost into numeric EVM evidence
- rejects a cross-tenant claim and approves an authorized claim with audit evidence
- rejects a cross-project document transition and records an authorized review transition
- rejects a cross-tenant change request and creates an authorized request with audit evidence
- lists and acknowledges an internal notification for its recipient with audit evidence
- rejects foreign or unentitled dashboard-section reporting and notifies the tenant owner with audit evidence
- creates a self-service trial, rejects foreign billing access, and records a VAT invoice with governed manual payment evidence
- rejects foreign support access and governs knowledge-backed ticket conversation with escalation evidence

### `server/pilot.backupRestore.database.test.ts` — 1/1

- writes a tenant-scoped backup artifact, restores it after simulated loss, and proves the owner, roles, records, and audit survive

### `server/pilot.roleAcceptance.database.test.ts` — 4/4

- allows EXECUTIVE decisions only in the owned project and records the effect
- allows PMO risk management only in the owned project and records the effect
- allows PROJECT delivery writes only in the owned project and records all effects
- rejects EXECUTIVE and PROJECT reads for the low-privilege account

### `server/profitability.database.test.ts` — 6/6

- derives FPAC from posted cost, progress and approved change orders only
- explains movement since the last snapshot in three causes that add up
- refuses another tenant's project, a project outside the caller's scope, and callers without the permission
- blocks the screen when the tenant has no PROJECT entitlement, and allows it again once restored
- lists the portfolio with losing projects first and only the projects the caller may see
- captures one scheduled snapshot per active project per month and skips the repeat
