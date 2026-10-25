# النسخ الاحتياطي واستعادته

## ما الذي يُنسخ، وأين

- **كل يوم 01:17 بتوقيت UTC** وعند الطلب: `.github/workflows/daily-backup.yml`.
- **القاعدة:** `pg_dump` بإصدار 17 (إصدار خادم Supabase) لمخططات `public` و`drizzle` (سجل الترحيلات) و`auth` و`storage`، في **لقطة واحدة** (`pg_export_snapshot`) تُحصى فيها صفوف كل جدول بالضبط في اللحظة نفسها.
- **الملفات:** كل ملف في سلال التخزين (`project-os-files` و`project-os-backups`) مع `MANIFEST.json` فيه الحجم وSHA-256 لكل ملف.
- **التشفير:** `gpg` متماثل AES-256 بالسرّ `BACKUP_ENCRYPTION_PASSPHRASE`. لا يبقى ملف غير مشفّر في المجلد المرفوع.
- **الوجهة:** ملفات التشغيل (Artifacts) في GitHub، خارج Supabase، **90 يومًا**.
- **الإثبات في كل تشغيل:** يُفك التشفير من جديد، وتُستعاد النسخة في PostgreSQL 17 مؤقتة داخل التشغيل، ويُقارَن **العدد الدقيق لصفوف كل جدول** بما أُحصي في اللقطة. أي فرق (جدول ناقص أو عدد مختلف) يُحمرّ به التشغيل بعد رفع الملفات المشفّرة.
- **يفشل التشغيل** إن غاب سرّ (ويسمّي الناقص)، أو كان `pg_dump` أقدم من الخادم، أو جاء التفريغ أصغر من 150 ألف بايت، أو خلا من بيانات جدول، أو لم يطابق عدد ملفات التخزين جدول `storage.objects`.

## الاستعادة (عند الحاجة، لا قبلها)

الاستعادة على الإنتاج توقف العمل وتستبدل البيانات: **قرار المالك**. النسخة لا تعيد كتابة ما بعدها. الخطوات لمن يحتاجها:

1. نزّل ملفات التشغيل من **Actions ← Daily backup ← التشغيل المطلوب ← Artifacts**.
2. فك التشفير: `gpg --decrypt --output database.dump database.dump.gpg` (يسأل عن السرّ). وكذلك `storage.tar.gz.gpg`.
3. أنشئ قاعدة جديدة (مشروع Supabase جديد أو PostgreSQL 17). في Supabase الجديد الأدوار والامتدادات موجودة؛ في PostgreSQL عادي أنشئ الأدوار `anon` و`authenticated` و`service_role` و`supabase_auth_admin` و`supabase_storage_admin` بلا تسجيل دخول، ومخطط `extensions` بامتدادي `pgcrypto` و`uuid-ossp`.
4. `pg_restore --no-owner --no-privileges --dbname="<رابط القاعدة الجديدة>" database.dump`
5. حساب التطبيق وصلاحياته يعيدهما `pnpm db:migrate` ثم `scripts/provision-app-role.mjs` (الترحيلات تُتخطى لأن سجلها مستعاد، والكنسة تعيد المنح).
6. الملفات: `tar -xzf storage.tar.gz` ثم ارفع كل ملف إلى سلّته بالاسم نفسه (واجهة S3 أو لوحة Supabase). `MANIFEST.json` يتيح مطابقة الأحجام وSHA-256.
7. تحقق: `node --import tsx scripts/verify-db-security.mjs` ثم افتح المنصة بحساب حقيقي.

## ما لا يغطيه

- نسخة الأمس لا تعيد كتابة عمل اليوم. أقصى فقد محتمل ≈ 24 ساعة.
- الأسرار (مفاتيح Supabase وVercel) ليست في النسخة. تُعاد من مزوّديها.
- حتى أول تشغيل حقيقي على Supabase لم يُجرَّب تفريغ `auth` و`storage` بدور `postgres` هناك؛ جُرِّب خط الأنابيب كله على PostgreSQL محلي (انظر `server/dailyBackup.database.test.ts`).
