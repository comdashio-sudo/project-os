# التكامل مع الأنظمة الأخرى — Integrations

**العربية أولًا، والإنجليزية بعدها (القسم الثاني). الحالات من المفردات المغلقة في `docs/STATE.md`: `PROVEN` تعني دليلًا آليًا قابلًا لإعادة التشغيل؛ `UNVERIFIED` تعني مكتوبًا ومُختبَرًا على نماذج وثائقية فقط ولم يردّ عليه نظام حقيقي.** هذا الملف صالح للمبيعات: لا يقول شيئًا عن موصل أكثر مما أُثبت.

## 1. ما الذي يدعمه كل موصل — وحالته الصادقة

| النظام | ما يقرأه من النظام الآخر | ما يكتبه فيه | الحالة | الدليل |
|---|---|---|---|---|
| **واجهة REST العامة** `/api/v1` (أي ERP) | يستقبل: موردين، أوامر شراء، تكاليف فعلية، فواتير، مدفوعات، تكلفة موظفين | يُصدِّر: ميزانيات، التزامات، تقدّم، مستخلصات | `PROVEN` | `integrations.api.database.test.ts` (17 اختبارًا، قاعدة حقيقية بدور تطبيق مقيَّد) |
| **ملف CSV القياسي** (أي نظام) | الأنواع الستة نفسها بقالب واحد لكل نوع | — (التصدير عبر REST) | `PROVEN` | الاختبار نفسه + `vendor.connectors.test.ts` (قراءة القالب وأخطاء الأسطر) |
| **Odoo Community 17** | موردون، أوامر شراء (مسودات)، تكاليف فعلية (سطور تحليلية → بند WBS)، فواتير، مدفوعات | مشاريع، موردو المنصة، نسبة التقدّم (`project.update`) | `PROVEN` في CI على Odoo حقيقي (انظر الملاحظة) | `odoo.connector.database.test.ts` (6 اختبارات) داخل `.github/workflows/odoo.yml` |
| **SAP Business One** (Service Layer) | موردون، أوامر شراء، فواتير مورّدين، مدفوعات | — (قراءة فقط) | `UNVERIFIED` | `vendor.connectors.test.ts` على نماذج وثائقية؛ لم يردّ حساب SAP قط |
| **Microsoft Dynamics 365 Finance** (OData) | موردون، أوامر شراء (المبلغ من السطور)، فواتير، مدفوعات | — (قراءة فقط) | `UNVERIFIED` | كما سبق |
| **Oracle NetSuite** (SuiteTalk REST) | موردون، أوامر شراء، فواتير مورّدين، مدفوعات | — (قراءة فقط) | `UNVERIFIED` | كما سبق |

> **ملاحظة Odoo:** `PROVEN` تعني أن العملية شُغِّلت على Odoo 17 حقيقي. وقد سُجِّل تشغيل CI الأخضر (رقم 40043553344، 2026-10-24) في `docs/STATE.md`. لا نقول إن أي إصدار آخر من Odoo (Enterprise، 16، 18) مُثبَت.

### ما لا يعمل — بوضوح
- **SAP وDynamics وNetSuite لم يُجرَّب أيٌّ منها على حساب حقيقي.** كُتب كلٌّ منها على الواجهة الرسمية الموثَّقة للمورّد، وأُختبر على *نماذج* من الاستجابات الموثَّقة (تسجيل الدخول، الترقيم، ربط الحقول، رفض الروابط الخارجية). أسماء بعض الحقول عند المورّد تختلف بين الإصدارات والتخصيصات؛ لذلك الحقل الذي يحمل «المشروع» **إعداد في الاتصال** (`projectMap`، `projectField`، `defaultProject`) لا افتراض. أول شركة تملك حساب اختبار تشغّل «اختبار الاتصال» ثم سحبًا، فنرفع الحالة أو نصحّح — لا قبل.
- الموصلات الثلاثة **قراءة فقط**. ما تريد المنصة إرساله للنظام (ميزانيات، التزامات، تقدّم) يخرج عبر واجهة التصدير `/api/v1/export/*` التي يسحبها النظام، أو الملف.
- **التكاليف الفعلية** من هذه الأنظمة الثلاثة تأتي بقالب CSV (لا موصل لها): دفتر الأستاذ يختلف جذريًا بين الشركات.
- **الفواتير والمدفوعات وتكلفة الموظفين تُحفظ كما وصلت** (`stored`) ولا تُطبَّق على جدول مالي: لا قاعدة مالية موصوفة لها بعد (`OPEN`).
- أمر الشراء من النظام الخارجي يصل **مسودة** دائمًا؛ اعتماد المنصة لا يُتخطّى. والتكلفة الفعلية المرحَّلة لا تتغيّر بإعادة الإرسال (يُرفض المتغيّر، لا يُطبَّق).
- webhooks تُفحص وجهتها وقت الإرسال (توجد نافذة تغيّر DNS بين الفحص والاتصال).

## 2. كيف يعمل (للمدير التقني)

1. **المفاتيح:** مدير الشركة يُنشئ مفتاحًا (`pos_<8hex>_<secret>`)، يُعرض **مرة واحدة**، ويُحفظ SHA-256 فقط. لكل مفتاح صلاحيات محددة (`erp.write` · `erp.read` · `export.read` · `external.write` · `mappings.write` · `sync.read`) وحدّ طلبات في الدقيقة (الافتراضي 120؛ يُعاد `429` مع `Retry-After`) وتاريخ انتهاء اختياري. المفتاح يرى شركته فقط، وقاعدة البيانات تعيد التحقق (RLS).
2. **التوثيق:** `GET /api/v1/openapi.json` بلا مفتاح؛ يُولَّد من جدول المسارات نفسه الذي تُقدَّم منه الطلبات، فلا ينحرف (يقارنهما اختبار).
3. **الاستقبال:** `POST /api/v1/erp/{suppliers|purchase-orders|actual-costs|invoices|payments|employee-costs}` — الدفعة **متكررة الأمان** (idempotent): لكل سجل معرّف النظام الآخر، والإعادة تقول `unchanged`. سجل مرفوض لا يُسقط الدفعة.
4. **CSV:** `GET /api/v1/erp/csv-template/{entity}` ثم `POST /api/v1/erp/csv/{entity}?system=…` بـ`Content-Type: text/csv` (حتى 5 MB و5000 سطر). الأسطر المقروءة تُطبَّق كدفعة عادية، وغير المقروءة تعود برقم السطر وسببه.
5. **التعيين (Mapping):** `PUT /api/v1/mappings/{supplier|project|material|cost_code|cost_center}` يربط معرّف النظام الآخر بمعرّفنا (مثلًا رمز التكلفة ← بند WBS). تكلفة بلا تعيين ولا بند بالرمز نفسه تُرفض بسبب مكتوب.
6. **Webhooks موقَّعة:** الأحداث `daily_report.approved` · `submittal.replied` · `material.issued` · `sync.completed`. الترويسة `X-ProjectOS-Signature: t=<unix>,v1=<hex>` (HMAC-SHA256 على `t.body`). إعادة المحاولة بعد 1 ثم 5 ثم 30 ثم 120 ثم 720 دقيقة، ويُستسلم بعد 6 محاولات؛ كل محاولة في السجل. https فقط والعناوين الخاصة مرفوضة.
7. **المزامنة:** يدويًا من الشاشة/الواجهة (`integrations.runConnection`) أو يوميًا (خطوة `integrations` في المهمة اليومية). النتيجة في **سجل المزامنة**: ما وصل، وما رُفض، ولماذا، لكل سجل.
8. **النظامان الخارجيان للتسليمات والجودة:** `POST /api/v1/external/submittals` و`/external/inspections` — الرد بكود الشركة (A/B/C/D) هو القبول الذي تقرؤه بوابة الجودة.

### خطوات تشغيل Odoo
1. في Odoo أنشئ مستخدمًا للتكامل (صلاحيات المشتريات والمحاسبة والمشاريع) وكلمة مرور تطبيق.
2. في المنصة: التكامل ← اتصال جديد ← النظام `odoo`، العنوان، اسم القاعدة، المستخدم، كلمة المرور (تُحفظ مغلقة ولا تُقرأ).
3. إعدادات الاتصال: `analyticProjectMap` (معرّف الحساب التحليلي ← رمز مشروعنا) أو `defaultProject`.
4. ابدأ بـ«اختبار الاتصال» ثم «سحب» ثم راجع سجل المزامنة قبل تفعيل اليومي.

---

# Integrations (English)

Statuses use the closed vocabulary of `docs/STATE.md`. **`PROVEN` = a repeatable automated proof; `UNVERIFIED` = written and tested against documented sample shapes only — no real system has ever answered it.** This page is meant to be handed to prospects: it claims nothing beyond what was proven.

## 1. What each connector supports, and its honest status

| System | Reads from it | Writes to it | Status | Evidence |
|---|---|---|---|---|
| **Public REST API** `/api/v1` (any ERP) | Receives suppliers, purchase orders, actual costs, invoices, payments, employee cost | Exports budgets, commitments, progress, valuations | `PROVEN` | `integrations.api.database.test.ts` (17 tests, real database, restricted application role) |
| **Standard CSV** (any system) | The same six record types, one template each | — (export is via REST) | `PROVEN` | same suite + `vendor.connectors.test.ts` |
| **Odoo Community 17** | Suppliers, purchase orders (as drafts), actual costs (analytic lines → WBS item), invoices, payments | Projects, the platform's own suppliers, progress (`project.update`) | `PROVEN` in CI on a real Odoo (see note) | `odoo.connector.database.test.ts` (6 tests) in `.github/workflows/odoo.yml` |
| **SAP Business One** (Service Layer) | Suppliers, purchase orders, vendor invoices, payments | — (read only) | `UNVERIFIED` | `vendor.connectors.test.ts` on documented sample shapes; no SAP account has answered it |
| **Microsoft Dynamics 365 Finance** (OData) | Vendors, purchase orders (amount from lines), vendor invoices, payments | — (read only) | `UNVERIFIED` | same |
| **Oracle NetSuite** (SuiteTalk REST) | Vendors, purchase orders, vendor bills, payments | — (read only) | `UNVERIFIED` | same |

> **Odoo note:** `PROVEN` means the exchange ran against a real Odoo 17. The green CI run (number 40043553344, 2026-10-24) is recorded in `docs/STATE.md`. We do not claim any other Odoo version or edition (Enterprise, 16, 18).

### What does not work — plainly
- **SAP, Dynamics and NetSuite have never been run against a real account.** Each is written to the vendor's documented official API and tested against *samples* of the documented responses (sign-in, paging, field mapping, refusing off-host links). Field names differ across versions and customisations at the vendor, so the field that carries "project" is a **setting of the connection** (`projectMap`, `projectField`, `defaultProject`), not an assumption. The first company with a test account runs "Test connection", then a pull; only then do we raise the status or fix what differs.
- The three are **read-only**. What the platform sends out (budgets, commitments, progress) leaves through the export API (`/api/v1/export/*`, pulled by the system) or a file.
- **Actual costs** for those three arrive by the CSV template (no connector): ledgers differ radically between companies.
- **Invoices, payments and employee cost are stored as received** (`stored`) and not applied to a financial table: no financial rule has been described for them yet (`OPEN`).
- A purchase order from another system always arrives as a **draft**; the platform's own approval is never skipped. A posted actual cost is not changed by a re-send (a changed re-send is refused).
- A webhook's destination is checked at delivery time (a DNS-change window exists between check and connect).

## 2. How it works (for the technical owner)

1. **Keys:** the company manager creates a key (`pos_<8hex>_<secret>`), shown **once**; only its SHA-256 is kept. Each key has specific scopes (`erp.write` · `erp.read` · `export.read` · `external.write` · `mappings.write` · `sync.read`), a per-minute limit (default 120; `429` with `Retry-After`) and an optional expiry. A key sees its own company only, and the database re-checks it (RLS).
2. **Documentation:** `GET /api/v1/openapi.json`, no key needed; generated from the same route table that serves requests, so it cannot drift (a test compares them).
3. **Inbound:** `POST /api/v1/erp/{suppliers|purchase-orders|actual-costs|invoices|payments|employee-costs}` — batches are **idempotent**: every record carries the other system's id and a re-send says `unchanged`. One refused record never takes the batch down.
4. **CSV:** `GET /api/v1/erp/csv-template/{entity}` then `POST /api/v1/erp/csv/{entity}?system=…` with `Content-Type: text/csv` (up to 5 MB / 5000 rows). Readable rows are applied exactly like an API batch; unreadable rows come back with their line number and reason.
5. **Mapping:** `PUT /api/v1/mappings/{supplier|project|material|cost_code|cost_center}` ties the other system's identifiers to ours (e.g. cost code → WBS item). A cost with no mapping and no WBS item of that code is refused with a written reason.
6. **Signed webhooks:** events `daily_report.approved`, `submittal.replied`, `material.issued`, `sync.completed`. Header `X-ProjectOS-Signature: t=<unix>,v1=<hex>` (HMAC-SHA256 over `t.body`). Retries after 1, 5, 30, 120, 720 minutes, given up after 6 tries; every try is logged. https only; private addresses refused.
7. **Sync:** manual (`integrations.runConnection`) or daily (the `integrations` step of the daily job). The result is in the **sync log**: what arrived, what was refused and why, per record.
8. **External submittal and quality systems:** `POST /api/v1/external/submittals` and `/external/inspections` — an answer in the company's accepted codes (A/B/C/D) is the acceptance the quality gate reads.

### Running Odoo
1. In Odoo create an integration user (purchase, accounting and project access) and an application password.
2. In the platform: Integrations → new connection → system `odoo`, URL, database name, user, password (stored sealed, never read back).
3. Connection settings: `analyticProjectMap` (analytic account id → our project code) or `defaultProject`.
4. Start with "Test connection", then a pull, then read the sync log before switching on the daily run.
