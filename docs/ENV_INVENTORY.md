# جرد متغيرات البيئة (D-39)

ما يقرؤه الكود فعلًا على `main` في 2026-11-13، مقابل `docs/GO_LIVE.md`. **أسماء فقط، بلا أي قيمة.** طريقة الجرد: `grep` على `process.env.*` في `server/` و`shared/` و`client/src/` و`api/`، ثم على الاسم نفسه في `scripts/` و`.github/workflows/`؛ والمرجع «أين» أول ملف غير اختباري يقرؤه.

## 1. يقرؤها التطبيق في التشغيل (Vercel)

| المتغير | أين | ملاحظة |
|---|---|---|
| `DATABASE_URL` | `server/_core/database.ts`، `env.ts` | اتصال التطبيق (دور `project_os_app`) |
| `DATABASE_SSL`، `DATABASE_SSL_VERIFY`، `DATABASE_SSL_CA`، `DATABASE_POOL_MAX` | `server/_core/database.ts` | |
| `JWT_SECRET` | `env.ts`، `sdk.ts`، `dbStorage.ts` | توقيع الجلسة وروابط التخزين في القاعدة؛ **مستعمل** (ليس بقية من Manus) |
| `APP_ID` | `env.ts` ← `sdk.ts` | يُكتب في الجلسة الموقّعة؛ افتراضيه `project-os`، فلا حاجة لضبطه |
| `OWNER_EMAIL` | `env.ts` | مالك المنصة |
| `REGISTRATION` | `env.ts` | `open` يفتح إنشاء الشركات لغير المالك |
| `MFA_ENFORCEMENT` | `env.ts` | |
| `AUTH_CODE_TTL_SECONDS` | `env.ts` | |
| `SUPABASE_URL`، `SUPABASE_ANON_KEY`، `SUPABASE_AUTH_URL` | `env.ts`، `auth/supabaseAuth.ts` | الدخول برمز البريد؛ المفتاح العام وحده |
| `GOOGLE_CLIENT_ID`، `GOOGLE_CLIENT_SECRET` | `env.ts` | اختياري |
| `STORAGE_MODE`، `STORAGE_BUCKET`، `STORAGE_S3_ENDPOINT`، `STORAGE_S3_REGION`، `STORAGE_S3_ACCESS_KEY_ID`، `STORAGE_S3_SECRET_ACCESS_KEY` | `server/storage.ts`، `env.ts` | بغيابها يعمل التخزين داخل القاعدة (D-79) |
| `APP_BASE_URL` | `env.ts`، `emailNotifications.ts` | الروابط في البريد |
| `SMTP_HOST`، `SMTP_PORT`، `SMTP_USER`، `SMTP_PASSWORD`، `EMAIL_FROM`، `EMAIL_REPLY_TO` | `auth/mailer.ts`، `emailNotifications.ts` | البريد (Q-16: ينتظر المالك) |
| `EMAIL_NOTIFICATIONS_ENABLED`، `EMAIL_DAILY_LIMIT`، `EMAIL_BURST_PER_MINUTE`، `EMAIL_LOGIN_RESERVE`، `EMAIL_BLOCK_RESERVED_DOMAINS` | `emailNotifications.ts`، `emailGate.ts` | |
| `CRON_SECRET`، `PROJECT_OS_DAILY_JOBS_DONE` | `scheduledDaily.ts`، `scheduledEmailNotifications.ts` | |
| `INTEGRATION_SECRET_KEY`، `INTEGRATION_ALLOW_PRIVATE_WEBHOOKS` | `integrations/secretBox.ts`، `integrations/webhooks.ts` | |
| `API_RATE_LIMIT_PER_MINUTE` | `apiRateLimit.ts` | |
| `LLM_ENABLED`، `LLM_BASE_URL`، `LLM_API_KEY`، `SMART_READING_MONTHLY_CAP_USD` | `env.ts` | مطفأ افتراضيًا |
| `VERCEL_GIT_COMMIT_SHA` | `server/_core/app.ts` | يضبطه Vercel نفسه |
| `NODE_ENV`، `PORT` | `server/_core/index.ts` | |

## 2. للبناء والسكربتات وسير GitHub فقط (لا يحتاجها التطبيق)

| المتغير | أين |
|---|---|
| `CRON_PLAN`، `VERCEL_FUNCTION_MAX_DURATION`، `VITE_MAX_UPLOAD_BYTES` | `scripts/build-vercel.mjs` (والأخير في الواجهة أيضًا) |
| `BACKUP_BUCKET`، `BACKUP_DATABASE_URL`، `BACKUP_ENCRYPTION_KEY` | `server/backup/*`، `scripts/export-database.mjs` |
| `BACKUP_ENCRYPTION_PASSPHRASE` | `scripts/backup/backup.mjs`، `daily-backup.yml` (سرّ GitHub — O-2) |
| `PROJECT_OS_APP_DB_PASSWORD` | `scripts/provision-app-role.mjs`، `predeploy.mjs`، `verify-db-security.mjs` |
| `SUPABASE_DB_PASSWORD`، `SUPABASE_POOLER_HOST` | `scripts/bootstrap/*`، `migrate-production.yml` |
| `SUPABASE_ADMIN_DATABASE_URL`، `SUPABASE_DB_CA` | `supabase-setup.yml` |
| `SUPABASE_ACCESS_TOKEN` | `bootstrap.yml`، `scripts/bootstrap/*` |
| `VERCEL_TOKEN` | `scripts/ci/vercel-*`، `scripts/bootstrap/run.ts` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | `post-deploy.yml`، `promote-production.yml`، `migrate-production.yml` |
| `TEST_DATABASE_URL`، `TEST_APP_DATABASE_URL`، `TEST_DB_NO_FALLBACK`، `GOTRUE_LIVE_URL`، `ODOO_*`، `LOAD_API_V1*`، `PROJECT_OS_P6_PERF`، `CI`، `VITEST` | الاختبارات وحدها |

## 3. مذكور في الوثائق وغير مستعمل في الكود

| المتغير | أين يُذكر | الحكم |
|---|---|---|
| `PROJECT_OS_USE_ADMIN_DATABASE_URL` | `CLAUDE.md` §2، `docs/HANDOFF_FROM_MANUS.md` | **لا يقرؤه أي ملف** في `server/` أو `scripts/` أو `.github/`. القاعدة «لا يُفعَّل» صحيحة بلا أثر؛ يُحذف سطره من الوثائق متى عدّلها المالك |
| `VITE_APP_ID`، `OAUTH_SERVER_URL`، `VITE_OAUTH_PORTAL_URL`، `OWNER_OPEN_ID`، `BUILT_IN_FORGE_API_URL`، `BUILT_IN_FORGE_API_KEY` | `docs/HANDOFF_FROM_MANUS.md` (وصف تاريخي) | بقايا Manus، لا يقرؤها شيء |
| `RESEND_API_KEY`، `R2_*` | الوثائق التاريخية وSTATE | أُزيل استعمالها (أمر العمل 6) |
| TiDB وRender | — | لا اسم لهما في الكود ولا السكربتات |

## 4. قائمة حذف للمالك (حسابات وخدمات وإعدادات)

احذف من إعدادات Vercel (مشروع `dashio` ← Settings ← Environment Variables) **إن وُجد** أيٌّ من: `VITE_APP_ID`، `OAUTH_SERVER_URL`، `VITE_OAUTH_PORTAL_URL`، `OWNER_OPEN_ID`، `BUILT_IN_FORGE_API_URL`، `BUILT_IN_FORGE_API_KEY`، `RESEND_API_KEY`، `R2_*`، `PROJECT_OS_USE_ADMIN_DATABASE_URL`، وأي متغير يبدأ بـ`TIDB` أو `RENDER`. لا تحذف `JWT_SECRET` ولا `APP_ID` إن وُجدا (القسم 1).

الحسابات القديمة (Manus وTiDB وRender وR2): تُغلق من لوحاتها بعد التأكد أن لا شيء في القسمين 1 و2 يشير إليها. **ولا تحذف حساب Resend الحالي** (تنبيه الأمر D-39 نفسه): الكود لا يستعمله، لكن قرار حذفه لك.
