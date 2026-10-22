# مكدس القاعدة — PostgreSQL / Supabase

مرجع تشغيلي لما بُني في أمر العمل 6. القرار والحدود: [`../ADR-0002-POSTGRES-SUPABASE-VERCEL.md`](../ADR-0002-POSTGRES-SUPABASE-VERCEL.md).

## الأدوار
| الدور | الاستخدام | الصلاحيات |
|---|---|---|
| مالك/مشرف (`postgres` في Supabase، `pos_owner` محليًا) | الترحيلات والتصدير وتجهيز الاختبارات | يملك الجداول؛ يتجاوز RLS؛ **لا** يعدّل `audit_logs` (triggers) |
| `project_os_app` | الخادم وحده | SELECT/INSERT/UPDATE/DELETE على الجداول عدا `audit_logs` (SELECT, INSERT)؛ بلا DDL، بلا TRUNCATE، بلا BYPASSRLS؛ تُنشأ كلمة مروره بـ`pnpm provision:app-role` |
| `anon` · `authenticated` · `service_role` (Supabase) | Data API | لا شيء على أي جدول أو دالة (`REVOKE` في الأساس) + لا سياسة تسميها |

## السياق لكل جملة
`server/_core/database.ts`: داخل `runWithDbContext({userId, tenantIds, system})` تُرسل كل جملة `BEGIN; set_config(…, true); الجملة; COMMIT`. بلا سياق: لا صف. `withSystemContext(reason, work)` لما يعمل عبر الشركات (تسجيل شركة، قبول دعوة، الدخول، المهام المجدولة). `withSystemContextJoining` ينشئ/ينضم ثم يُعلِم سياق المستدعي بالشركة الجديدة.

## تشغيل محلي كامل
```bash
export DATABASE_URL=postgres://<superuser>@127.0.0.1:5432/postgres      # مشرف على الخادم المحلي
node scripts/setup-integration-test-db.mjs                               # ينشئ project_os_integration_test ويطبّق الترحيلات ويعطي project_os_app كلمة مرور محلية
pnpm auth:local                                                          # GoTrue حقيقي (Docker) على :9999 داخل نفس القاعدة (مخطط auth)
node scripts/run-integration-database-test.mjs                           # كل اختبارات القاعدة
```
SMTP وهمي على 127.0.0.1:2525 (`server/testing/smtpSink.ts`) يلتقط رموز الدخول، وقالب البريد من `docs/auth-email-templates/otp.html`.

## الفروق التي يجب أن يعرفها من يقرأ الشيفرة
- النصوص الخام بصيغة PostgreSQL (`$n`، `ON CONFLICT`، `RETURNING`، `FILTER`، `pg_catalog`)؛ نتائج `db.execute` هي `{ rows, rowCount }`؛ `COUNT(*)` يعود رقمًا؛ `NUMERIC` يعود نصًا.
- `ANALYZE` بعد الاستيراد الجماعي عبر `project_os_analyze(text[])` (SECURITY DEFINER) لأن التطبيق لا يملك الجداول.
- أسماء القيود ≤ 63 حرفًا (خمسة أُعيدت تسميتها يدويًا).
- أدوات الاختبار فقط: `server/testing/pgCompat.ts` (يترجم SQL التجهيز بصيغة MySQL القديمة إلى PostgreSQL ويرفع حارس `audit_logs` في قاعدة الاختبار لتنظيف التجهيزات وحدها).
