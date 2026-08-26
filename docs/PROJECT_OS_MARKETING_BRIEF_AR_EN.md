# PROJECT OS — الملف التسويقي | Marketing Brief

## الرسالة الأساسية | Core message

**العربية:** PROJECT OS يحوّل تشغيل المشاريع من جداول متفرقة وردود فعل متأخرة إلى مساحة عمل محكومة ترى الاستثناءات قبل أن تتحول إلى خسائر.

**English:** PROJECT OS turns project operations from disconnected spreadsheets and late reactions into a governed workspace that surfaces exceptions before they become losses.

## المشكلة التي يعالجها | The problem

تعمل شركات المشاريع عادةً عبر بيانات موزعة بين الجدول والتكلفة والموقع والمشتريات والموارد والمستندات. عندما لا تكون هذه المجالات مربوطة بنطاق الشركة والمشروع والدور، يصبح اكتشاف الانحراف متأخرًا ويصبح القرار معتمدًا على إعادة إدخال البيانات يدويًا.

Project companies often operate with schedule, cost, site, procurement, workforce, and document data spread across separate tools. When those domains are not tied to company, project, and role scope, variance detection comes late and decisions depend on manual re-entry.

## نقاط القوة الحالية المثبتة | Current proven strengths

| النقطة | القيمة العملية | حالة الإثبات |
|---|---|---|
| حوكمة الوصول | الشركة والمشروع والدور والاستحقاق تُفحص قبل المسارات المحمية. | مثبتة في اختبارات الوحدة والواجهة وتغطية الوصول. |
| مستويات تشغيلية | EXECUTIVE وPMO وPROJECT تعطي كل مستوى نقطة بداية مناسبة. | مثبتة في الملاحة والاختبارات المركزة. |
| EVM مركزي | مؤشرات PV/EV/AC/CPI/SPI/EAC/VAC حيث يملك النظام مصدرًا رقميًا. | مثبتة في طبقة EVM والاختبارات المتاحة. |
| مركز الاستثناءات | يعرض المخاطر والقضايا والتأخر وصحة المشروع بدل فتح كل سجل يدويًا. | مثبت جزئيًا؛ تكامل TiDB الحالي غير متحقق في هذه الجولة. |
| مواد ومخازن ومشتريات | مسارات للطلبات وأوامر الشراء والاستلام والصرف والرصيد المشتق. | مثبتة محليًا واختبارات واجهة مركزة؛ التكامل الحي الكامل غير متحقق حاليًا. |
| تدقيق | الكتابات الحساسة تنتج أثر تدقيق، وحساب التطبيق محمي من UPDATE/DELETE على `audit_logs`. | مثبت عبر فحص المنح؛ هذه حماية صلاحيات وليست trigger. |
| Excel محكوم | القوالب والتحقق والمعاينة والرفض عند الغموض بدل ملف عام بلا قواعد. | مثبت جزئيًا وفق القوالب الحالية. |
| ثنائية اللغة | العربية والإنجليزية مع تبديل اللغة وRTL/LTR. | الفحص البصري العام نجح؛ القبول اليدوي الكامل لم ينفذ. |

## التميّز المقترح | Positioning

لا ينبغي تقديم PROJECT OS كبديل شامل لكل ERP أو برنامج جدولة أو نظام محاسبي في المرحلة الحالية. التموضع الأدق هو **طبقة تشغيل وحوكمة وربط project controls** للشركات التي تريد رؤية الشركة والمحفظة والمشروع في مسار واحد، مع إبقاء الأنظمة المتخصصة عند الحاجة.

PROJECT OS should not currently be marketed as a replacement for every ERP, scheduling, or accounting system. The accurate positioning is a **governed operating and project-controls layer** for companies that need company, portfolio, and project visibility in one path while retaining specialist systems where needed.

## لماذا الآن؟ | Why now?

تشير المصادر العامة إلى توسع سوق برمجيات إدارة التشييد وتفضيل نماذج السحابة والاشتراك، مع استمرار مشكلة البيانات المعزولة وتكاليف التنفيذ. هذه إشارات سوقية وليست ضمانًا للمبيعات. الفرصة العملية لـPROJECT OS هي البدء بشريحة شركات المقاولات المتوسطة التي تحتاج ضبط المشاريع المتعددة والاستثناءات، لا محاولة بيع كل الوظائف لكل شركة من اليوم الأول.

Public market sources indicate growth in construction-management software and continued movement toward cloud/subscription models, while fragmented data and implementation cost remain buyer concerns. These are market signals, not sales guarantees. PROJECT OS should initially target mid-sized contractors that need multi-project control and exception visibility, rather than selling every possible function to every company on day one.

## إثبات القيمة في العرض | Proof of value

| سؤال العميل | إجابة منضبطة |
|---|---|
| هل أرى ما يحتاج قرارًا اليوم؟ | توجد لوحات واستثناءات محكومة؛ يجب إثبات بيانات العميل في Pilot. |
| هل يمكن منع الوصول الخاطئ؟ | توجد حراسة خادمية وعزل tenant/project؛ القبول النهائي يحتاج أدوارًا بشرية. |
| هل أستطيع ربط التكلفة بالمشروع؟ | توجد ركائز EVM ومواد وموارد؛ سلسلة BOQ–المشتريات–المستخلص–FPAC لم تكتمل بعد. |
| هل أستورد Excel بلا أخطاء؟ | لا يوجد قبول لملف عام؛ القوالب المعتمدة تتحقق وترفض الغموض. |
| هل المنصة جاهزة للإطلاق العام؟ | الحالة الحالية ليست GO؛ التكامل الحي وقبول الأدوار والقيود التشغيلية ما زالت مفتوحة. |

## دعوة الإجراء | Call to action

**العربية:** ابدأ باكتشاف محكوم لمشروع أو محفظة واحدة، حدّد أصحاب الأدوار ومصادر البيانات، ثم نفّذ Pilot محدودًا بمؤشرات قبول مكتوبة.

**English:** Start with a governed discovery for one project or portfolio, identify role owners and data sources, then run a limited Pilot with written acceptance criteria.

## ملاحظات الامتثال التسويقي | Claims discipline

لا تستخدم عبارات مثل «بدون أخطاء»، «يضمن الربحية»، «متوافق ضريبيًا»، «يحل محل P6/ERP»، أو «جاهز للإنتاج» قبل وجود دليل مستقل وقرار مالك مناسب. لا تُعرض شهادات أو تقييمات أو آراء عملاء غير حقيقية.

## مصادر السوق

راجع `docs/MARKET_PRICING_RESEARCH_2026-08-26.md` للمصادر والحدود، ولا تنقل أرقام السوق أو المنافسين إلى عرض سعر دون تاريخ ومصدر.
