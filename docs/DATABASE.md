# قاعدة بيانات PROJECT OS

PostgreSQL 16 (Supabase في الإنتاج، PostgreSQL محلي في الاختبار). التفاصيل والتشغيل في [`docs/database-stack/README.md`](./database-stack/README.md)، والقرار في [`ADR-0002`](./ADR-0002-POSTGRES-SUPABASE-VERCEL.md).

## قواعد النمذجة

- المخطط في `drizzle/schema.ts` (`pgTable`/`pgEnum`)؛ أسماء الأعمدة snake_case في القاعدة وcamelCase في TypeScript؛ الطوابع `timestamptz` (UTC)؛ المعرّفات `varchar(36)` (UUID) إلا `users.id` (هوية).
- ترحيلة أساس واحدة `drizzle/0000_baseline.sql` تبني كل شيء من الصفر: DDL المولَّد من المخطط + `drizzle/baseline-security.sql` (الأدوار، trigger التحديث، حماية `audit_logs`، RLS، دالة الكنس `project_os_apply_conventions()`). `pnpm db:baseline` يعيد توليدها و`pnpm db:baseline:check` يفشل إن تباعدت.
- كل سجل أعمال يحمل `tenant_id` ولا استعلام أعمال بلا مرشح `tenant_id` في الخادم (الطبقة الأولى)، وRLS تعيد الفرض في القاعدة (الطبقة الثانية).
- WENI والمبالغ تُحسب كما كانت؛ الأعداد العشرية `numeric` وتُقرأ نصوصًا كما كانت `DECIMAL`.

## نطاقات البيانات

| النطاق | كيانات |
|---|---|
| الهوية والمؤسسة | companies، users، memberships، roles، permissions، audit_logs، auth_sessions، auth_code_attempts |
| التجارة والاستحقاق | subscriptions، entitlements، commercial_plans، tenant_licenses |
| الهيكل والحوكمة | portfolios، programs، projects، lifecycle_gates |
| ضوابط المشروع | wbs_items، activities، budgets، costs، commitments، progress_entries، evm_snapshots |
| التحكم والتنفيذ | risks، issues، actions، decisions، workflows، documents، notifications |
| PMC والمشتريات والموارد البشرية والمستودعات | pmc_*، purchase_orders، employees، payroll_*، warehouses |

## الترحيلات

| الترحيل | المحتوى |
|---|---|
| `0000_baseline.sql` | المخطط كاملًا (118 جدولًا) + الأدوار + حماية التدقيق + RLS + الكنس. يستبدل ترحيلات MySQL السابقة كلها (0000–0052) التي حُذفت مع المحرك. |

سجل التطبيق: `drizzle.__project_os_migrations` (الاسم + بصمة الملف؛ ترحيلة مطبَّقة لا تُعدَّل، تُضاف أخرى).

## سياسة العزل

الطبقة الأولى: الخادم. الطبقة الثانية: RLS (`app.user_id` / `app.tenant_ids` / `app.system` تُضبط لكل جملة). جدول بلا تصنيف يُسقط الترحيلة. الجداول العامة (بلا شركة): users، auth_sessions، permissions، commercial_*، plan_feature_entitlements، scheduled_jobs، self_service_signup_attempts، invoice_counters، auth_code_attempts — RLS مفعّلة عليها وسياستها لحساب التطبيق وحده، فأدوار Data API في Supabase لا ترى شيئًا.
