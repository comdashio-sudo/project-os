# دليل نشر وتشغيل PROJECT OS

صفحة الإطلاق الفعلية هي [`GO_LIVE.md`](./GO_LIVE.md) (Supabase + Vercel، كل متغير وأين يوضع). هذا الدليل يصف مسار الإصدار والبوابات.

> لا تعدّ عملية البناء وحدها دليل نشر: **البناء الأخضر يثبت التصريف فقط**. يلزم نجاح الاختبارات على PostgreSQL ومسارات الأدوار قبل أي حكم جاهزية.

## المكدس

React 19 + Vite (ملفات ثابتة على CDN) · Express 5 + tRPC 11 كدالة Vercel واحدة · Drizzle + `pg` · Supabase (PostgreSQL، Auth، Storage بواجهة S3) · Vercel Cron للمهام (انتهاء التراخيص، لقطات الربحية، إشعارات البريد، مسح مهام الاستيراد). تفاصيل القرار والحدود: [`ADR-0002`](./ADR-0002-POSTGRES-SUPABASE-VERCEL.md).

## مسار الإصدار

```bash
pnpm install --frozen-lockfile
pnpm check && pnpm build && pnpm test          # بلا قاعدة: الاختبارات غير المشروطة
node scripts/run-integration-database-test.mjs # بقاعدة محلية: يبني المخطط ثم يشغّل كل اختبارات القاعدة بحساب التطبيق المقيَّد
pnpm build:vercel                              # يكتب .vercel/output (دالة واحدة + ملفات ثابتة + الجدولة)
```

تغيير المخطط: عدّل `drizzle/schema.ts` (أو `drizzle/baseline-security.sql`) ثم `pnpm db:baseline`. الأساس يُعاد توليده مع كل تغيير مخطط (اختبار ثابت يفرض مساواته لـ`schema.ts`)، **وتُضاف معه ترحيلة مرقّمة قابلة لإعادة التشغيل** بالتغيير نفسه لقاعدة بنت أساسًا أقدم؛ و`scripts/migrate.mjs` لا يعدّ تغيّر بصمة `0000_baseline.sql` خطأً (أي ترحيلة أخرى تغيّرت بعد تطبيقها خطأ) ويطبّق الترحيلات وفق بصمة الملف ثم يشغّل `project_os_apply_conventions()` ويرفض الإنهاء إن بقي جدول بلا RLS.

## قاعدة التكامل المعزولة

قاعدة الاختبار الوحيدة `project_os_integration_test` على PostgreSQL محلي أو غير إنتاجي (يوقف الحارس العام التشغيل إن سمّت المتغيرات غيرها). `DATABASE_URL` للتشغيل بحساب `project_os_app` و`TEST_DATABASE_URL` لتجهيز البيانات بحساب المالك؛ الاختبارات التي تمرّ عبر إجراءات tRPC تمارس RLS فعلًا، وما يستدعي دوال الخدمة مباشرة يعمل بسياق النظام (`server/testing/databaseGuard.setup.ts`).

## بوابة الإصدار

| البوابة | الأمر | معيار القبول |
|---|---|---|
| الأنواع / البناء / الوحدات | `pnpm check` · `pnpm build` · `pnpm test` | ناجحة دون نقص في العدد. |
| قاعدة البيانات | `node scripts/run-integration-database-test.mjs` | كل اختبارات `*.database.test.ts` وسجل التدقيق وRLS. |
| الدخول الحي | `pnpm auth:local` ثم `GOTRUE_LIVE_URL=… vitest server/auth.gotrue.live.test.ts` | عشر حالات دخول على Supabase Auth حقيقي محلي. |
| أمان القاعدة | `pnpm verify:db-security` | لا UPDATE/DELETE/TRUNCATE على audit_logs، RLS على كل جدول، أدوار Data API فارغة. |
| بروفة الأدوار / الأداء / axe / لوحة المفاتيح | `scripts/e2e-roles.mjs` · `perf-measure.mjs` · `check-accessibility.mjs` · `check-keyboard.mjs` | انظر `docs/STATE.md`. |
| العزل | حالات رفض مستأجر/مشروع عابر | لا تنشأ سجلات ولا تُعاد بيانات عابرة. |

## المراقبة والاستجابة

سجلات الدالة في **Vercel ← Logs** (JSON بسطر لكل حدث؛ الرسائل لا تحمل قيمًا)، وسجلات القاعدة في **Supabase ← Logs**. عند إخفاق إصدار: أعد المسار أعلاه لتحديد قابلية إعادة الإنتاج قبل نسبة الخطأ إلى الشيفرة أو المنصة.

## النسخ الاحتياطي والاستعادة

الأساس: نسخ Supabase المُدارة (ومعها PITR اختياريًا). إضافة: `scripts/export-database.mjs` تفريغ بيانات منطقي مشفّر AES-256-GCM يُقرأ بعد كتابته ويُتحقَّق منه، بالمالك لا بحساب التطبيق؛ الاستعادة: ترحيلات على قاعدة فارغة ثم تشغيل الملف (`--decrypt`). الاستعادة مُثبتة في `server/backup.database.test.ts` (كل جدول مُعاد إلى نسخة ومقارَن بالمحتوى).
