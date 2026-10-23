# UI audit: التطبيق كله (أمر العمل 10، الجولة الأولى)

**الغرض:** أن يفتح أي مستخدم أي شاشة على الجوال أو الحاسب فلا يجد زرًا ميتًا، ولا صفحة بيضاء، ولا كلمة إنجليزية متروكة، ولا تصميمًا غير متسق.

**الحالة:** هذه الجولة الأولى. تكشف ما هو مكسور الآن وتضع أداة قياس تتكرر، ولا تدّعي إكمال الأمر. كل ما لم يُفحص مذكور أدناه.

## 1. الجرد
- **المسارات:** 24 مسارًا في `client/src/App.tsx`، وتقرأها أداة الفحص من الملف مباشرة فلا تنحرف القائمة عن الكود.
- **الدور المفحوص:** مدير العرض التجريبي المُختلَق (`demo.admin@example.test`)، أي مدير الشركة (TENANT_OWNER). لم تُفحص الأدوار الستة عشر بعد (الفحص الكامل بكل دور لاحقًا، انظر §6).
- **العرضان:** 1280px للحاسب، و390px للجوال، باللغة العربية، على بيانات مُختلَقة.
- **الأداة:** `tests/ui/audit.mjs` تفتح كل مسار بالعرضين، وتسجل: أخطاء الـconsole، والاستثناءات غير المعالجة، وأخطاء الخادم (5xx وـ404 للـAPI)، والصفحة الفارغة، والتمرير الأفقي على الجوال، وأهداف اللمس دون 44px، والإنجليزية المتروكة. تحفظ لقطة لكل شاشة في مجلد خارج المستودع.
- **الجلسة:** `tests/ui/mintSession.mjs` تصدر جلسة المدير المُختلَق إلى ملف بصلاحية 600، ولا تطبع الرمز.

## 2. النتائج (الجولة الأولى)

الأعداد من التشغيل الذي وُثّق هنا: 24 مسارًا × عرضين = 48 صفحة.

- **صارمة (تُفشل الفحص):** 4، كلها طلبات 403 من صفحتين لا يملك هذا الدور حقهما: `/licensing/:tenantId` (وحدة مدير المنصة)، و`/projects/:t/:p/my-performance` (أداء الفرد، والمدير ليس موظفًا مرتبطًا). الصفحتان تطلبان البيانات قبل أن تفحصا الصلاحية، فيُسجَّل خطأ في الـconsole. الإصلاح المطلوب: ألا يُطلب ما لا يحق للدور، وأن تظهر حالة «لا صلاحية» أو «لا سجل موظف مرتبط» بدل الخطأ.
- **تمرير أفقي على الجوال:** لا يوجد (لم تُسجَّل حالة واحدة).
- **صفحة بيضاء:** لا توجد.
- **أهداف لمس دون 44px على الجوال:** 21 صفحة من 24، بمعدل 2 إلى 45 عنصرًا لكل صفحة. السبب نظامي: أزرار وحقول نظام الأزرار والنماذج أقل من 44px على الشاشات اللمسية. الإصلاح المطلوب في الأساس المشترك، لا صفحة بصفحة.
- **إنجليزية متروكة:** 38 صفحة. أغلبها بيانات مُختلَقة مقصودة (أسماء مشاريع وشركة تجريبية)، وهذه لا تُعدّ عيبًا. الحقيقي منها: رموز الأدوار الخام (`EXECUTIVE`، `ACCOUNTANT`)، وعناوين مثل «Master Plan» و«PDF»، وكلمات تقنية مثل `tenant` و`manage` ظاهرة للمستخدم، و«English» داخل زر تبديل اللغة (مقبول كاسم اللغة نفسها).

## 3. جدول المسارات

| المسار | صارم | عناصر الجوال | أقل من 44px | إنجليزية متروكة |
|---|---|---|---|---|
| `/` | ✓ | 4 | 3 | Demo, Admin, English, Construction, demo-construction |
| `/login` | ✓ | 2 | 0 | — |
| `/profile` | ✓ | 5 | 5 | English, PROJECT, Demo, Admin, demo, admin |
| `/evm` | ✓ | 9 | 9 | English |
| `/invite/accept` | ✓ | 3 | 3 | — |
| `/setup` | ✓ | 9 | 2 | English, Demo, Construction |
| `/setup/{tenant}` | ✓ | 9 | 2 | English, Demo, Construction |
| `/executive/{tenant}` | ✓ | 19 | 17 | English, Demo, Admin, PROJECT, DEMO-, Villas |
| `/pmo/{tenant}` | ✓ | 45 | 45 | English, Demo, Admin, PROJECT, DEMO-, Villas |
| `/licensing/{tenant}` | ✗ console-error | 1 | 1 | PROJECT |
| `/billing/{tenant}` | ✓ | 1 | 1 | DASHIO, PDF- |
| `/support/{tenant}` | ✓ | 10 | 8 | DASHIO |
| `/people/{tenant}` | ✓ | 21 | 21 | Demo, Admin |
| `/payroll/{tenant}` | ✓ | 14 | 14 | Demo, Admin |
| `/tenants/{tenant}/administration` | ✓ | 39 | 39 | English, Demo, Admin, DASHIO, EXECUTIVE, ACCOUNTANT |
| `/projects/{tenant}/{project}/my-performance` | ✗ console-error | 12 | 12 | Demo, Admin, PROJECT |
| `/projects/{tenant}/{project}/controls` | ✓ | 230 | 211 | English, Demo, Admin, DEMO-, Villas, Project |
| `/projects/{tenant}/{project}/commercial` | ✓ | 30 | 28 | — |
| `/projects/{tenant}/{project}/profitability` | ✓ | 6 | 5 | — |
| `/m/{tenant}/{project}` | ✓ | 9 | 0 | Foundations, Excavation, Structure |
| `/projects/{tenant}/{project}/pmc` | ✓ | 24 | 0 | — |
| `/projects/{tenant}/{project}/guide` | ✓ | 14 | 1 | English |
| `/projects/{tenant}` | ✓ | 21 | 21 | English, Demo, Admin, DEMO-, Villas, Project |
| `/404` | ✓ | 2 | 2 | English |

## 4. ما أُصلح في هذه الجولة
لا شيء بعد: هذه الجولة للقياس والتوثيق. الإصلاحات تأتي في طلبات صغيرة متتالية، وكل طلب يعيد تشغيل الأداة ويُظهر الأرقام قبل وبعد.

## 5. ما لم يُفحص بعد
- **الأدوار الستة عشر** (`scripts/e2e-roles.mjs` وقوالبها): كل دور يرى قائمته ويجرّب أزراره.
- **حالات كل شاشة:** التحميل، والفارغة مع الإجراء التالي، والخطأ مع إعادة المحاولة، وعدم الصلاحية. الأداة الحالية تلتقط الصفحة بعد استقرار الشبكة فقط.
- **إمكانية الوصول:** التسمية، وتباين AA، والتركيز بلوحة المفاتيح (`scripts/check-keyboard.mjs` موجود، ولم يُدمج في هذه الأداة).
- **الاتساق البصري والعرض الإنجليزي الكامل.**
- **الأقسام داخل `/controls` و`/pmc` و`/commercial`:** هذه الصفحات تحوي عشرات الأقسام والتبويبات (نحو 230 عنصر تحكم في `/controls` وحده). الجرد الحالي يسجلها كصفحة واحدة، والتجريد التفصيلي لكل قسم لاحق.
- **شاشات الاستيراد والتصدير Excel ومنطقها:** خارج نطاق هذا الأمر، عند الوكيل 1.

## 6. حدود معلنة
- **اللقطات لا تُرفع إلى CI** لأن رفعها يحتاج تعديل `.github/workflows`، وهذا خارج نطاق هذا الأمر. تُكتب اللقطات إلى مجلد خارج المستودع (`OUT_DIR`)، ولا تدخل المستودع.
- **Playwright لا يُضاف تبعية للمشروع** (تبعًا لما يفعله `scripts/e2e-roles.mjs`)، بل يُحمَّل من `PLAYWRIGHT_MODULE_DIR`.
- **الفحص يعمل على قاعدة PostgreSQL محلية ومُختلَقة البيانات.** لم تُشغَّل اختبارات قاعدة CI، ولم يُفحص أي شيء على بيانات حقيقية.

## 7. كيف تُعاد الأداة
```
. env                     # DATABASE_URL, JWT_SECRET, PORT
node scripts/migrate.mjs
SEED_CONFIRM=yes node --import tsx scripts/seed-demo-tenant.mjs   # قاعدة جديدة فقط
pnpm build && NODE_ENV=production node dist/index.js &
node --import tsx tests/ui/mintSession.mjs "$SESSION_FILE"
TENANT_ID=... PROJECT_ID=... SESSION_FILE=... OUT_DIR=... node tests/ui/audit.mjs
```
