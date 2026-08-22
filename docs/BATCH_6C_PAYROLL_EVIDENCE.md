# الدفعة 6.ج — دليل الرواتب وتكلفة العمالة

**الحالة:** `PROVEN` قبل الالتزام. اجتازت بوابة الجودة كاملةً في 22 أغسطس 2026 بعد أحدث أدلة DOM. يبقى نشر نقطة تحقق محظورًا بسبب قيد المنصة المسجل في `STATE.md`؛ لا تعني هذه الوثيقة قبول Pilot أو رفع حظر النشر.

| شرط أمر العمل | التنفيذ والدليل القابل لإعادة التشغيل |
|---|---|
| فصل الأدوار | `HR_MANAGER` يدير `project.payroll.structure`، و`ACCOUNTANT` يملك `project.payroll.run`، و`FINANCE_MANAGER` يملك `project.payroll.approve` و`project.payroll.sensitive.read`. يثبت `integration.database.test.ts` أن HR لا يستطيع تشغيل الدورة، وأن المحاسب لا يقرأ هيكل الراتب، وأن المالية تعتمد الدورة. |
| حماية PDPL | لا ترجع قائمة الموظفين حقول راتب. تعيد الملاحة الخادمية رابط Payroll مرة واحدة لأي من HR أو المحاسب أو المالية ضمن استحقاق PROJECT ونطاق الشركة. لا يبدأ `PayrollPanel` استعلام هيكل الراتب أو تفاصيل القسيمة قبل فعل مستخدم صريح؛ يثبت `PayrollPanel.test.tsx` بقاء الاستعلامين معطلين ثم تفعيل قراءة الهيكل والقسيمة المحميتين، واللتين تسجلان في التدقيق. |
| احتساب حتمي | `calculatePayrollBreakdown` يحسب الإجمالي وGOSI والصافي وتكلفة العمالة وEOS. `calculatePayrollEntryBreakdown` يحسب الصافي من خصم GOSI الملتقط، لا من معدل مستنتج من قيمة مقربة. لا يحتوي مخطط `payroll_entries` على حقل لصافي الراتب. |
| اعتماد منفصل | يرفض الخادم `PROJECT_OS_PAYROLL_APPROVER_SEPARATION` إذا كان المعتمد هو منشئ الدورة، حتى لو وصل الطلب إلى إجراء الاعتماد. تعرض الواجهة انتقال draft→review للمحاسب فقط، وreview→approved وapproved→paid للمالية فقط. |
| تكلفة العمالة وEVM | لا يسمح `allocateCost` إلا لدورة معتمدة أو مدفوعة، وضمن مشروع/WBS/نشاط مملوك. تعرض الواجهة اختيار مدخلة الدورة والمشروع وWBS والنشاط، ولا تقبل معرّفات خام. يكتب `cost_entries` بقيمتي `actual` و`posted` و`payroll_allocations` وسجل `payroll.cost_allocated` في معاملة واحدة. أثبت الدليل الحي `AC = 13,750` و`CPI = 3.6364`. |
| القسيمة | `PayslipRenderer` يعيد كائنًا منظّمًا بنسخة وصيغة معلومتين فقط؛ لا ينشئ PDF ولا يخزن صافي الراتب. |

## البوابة المنفذة

| الأمر | النتيجة |
|---|---|
| `pnpm vitest run server/domain/payroll.test.ts` | 3/3 ناجحة |
| `pnpm vitest run client/src/pages/PayrollPanel.test.tsx` | 1/1 ناجح |
| `pnpm test` | 315 ناجحة، و71 تكامليًا متخطى داخل الأمر لصالح المشغل الحي |
| `pnpm check` | ناجح |
| `pnpm build` | ناجح؛ مع تحذير حجم chunk قائم لا يوقف البناء |
| `pnpm coverage:trpc` | 159 إجراءً، 154 مرجعًا مباشرًا، 5 استثناءات إطار مسماة، وصفر غير مصنف أو استثناء متقادم |
| `node scripts/run-integration-database-test.mjs` | 71/71 ناجحة على MySQL/TiDB |

> هذا الدليل يثبت برمجيات الدفعة 6.ج والعزل والتدقيق داخل قاعدة الاختبار المخصصة. لا يبدل القبول البشري للأدوار ولا أي شرط Pilot مسجل كـ`BLOCKED_BY_OWNER` أو `BLOCKED_BY_PLATFORM`.
