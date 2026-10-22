// The in-platform user guide (item 12): one section per working role, each a short list of steps with the screen it happens on.
// Every step is either a daily step or a weekly step (`cadence`), names the permission it needs, taken from the role templates in
// server/domain/operationalRoles.ts (a test keeps the two in agreement), and an anchor on the project controls page that exists (a test keeps
// those honest too). Terms follow docs/GLOSSARY_AR.md. A picture is optional: where one fits, `image` names a file in client/public/guide,
// taken from the real screens with synthetic data by scripts/capture-screenshots.mjs and scripts/capture-guide.mjs. Steps without one are written as text.
export type GuideSectionId = "cost-control" | "planning" | "project-coordination" | "design-coordination" | "contracts";
export type GuideCadence = "daily" | "weekly";
export type GuideStep = {
  cadence: GuideCadence;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  /** Where the step happens, relative to /projects/:tenantId/:projectId. `controls#manager-design` opens that lane; `profitability` is its own page. */
  screen: string;
  /** The permission the screen's write controls need; without it the controls show but are disabled with the reason. */
  needs: string;
  /** A heading or label (Arabic text) on that screen that the step's picture starts at; absent = the top of the lane. */
  focus?: string;
  /** A picture of this step on the real screen, under /guide/. Absent = the step is written without a picture. */
  image?: string;
};
export type GuideSection = {
  id: GuideSectionId;
  roleCode: string;
  title: { ar: string; en: string };
  intro: { ar: string; en: string };
  cannot: { ar: string; en: string };
  steps: GuideStep[];
};

export const GUIDE_ANCHORS = ["manager-schedule", "manager-commercial", "manager-tenders", "manager-design", "manager-site", "manager-assurance", "manager-oversight", "pmc"] as const;

export const GUIDE_CADENCES: readonly GuideCadence[] = ["daily", "weekly"];

export const userGuide: GuideSection[] = [
  {
    id: "cost-control", roleCode: "COST_CONTROLLER",
    title: { ar: "الكوست كنترول", en: "Cost control" },
    intro: { ar: "تضبط الميزانية والتكلفة الفعلية والقيمة المكتسبة، وتقارن عروض المناقصات دون أن ترسّيها.", en: "You set the budget, record actual cost and earned value, and level tender bids without awarding them." },
    cannot: { ar: "لا ترسّي المناقصة ولا تعتمد صرفًا: الترسية للمالك أو لدور مخصّص، والاعتماد لغيرك.", en: "You do not award a tender or approve disbursement: the award is for the owner or a custom role, approval for someone else." },
    steps: [
      { cadence: "daily", title: { ar: "افتح ضوابط المشروع واقرأ الصحة", en: "Open project controls and read the health" }, body: { ar: "من سجل المشاريع افتح المشروع. بطاقات الأعلى تُظهر الصحة والمؤشرات؛ كل مؤشر يذكر أساس حسابه ومتى حُدّث.", en: "Open the project from the registry. The cards at the top show health and indicators; each states its basis and when it was updated." }, screen: "controls", needs: "project.read", image: "/guide/cost-control-1.jpg" },
      { cadence: "daily", title: { ar: "سجّل التكلفة الفعلية", en: "Record actual cost" }, body: { ar: "في «تحديث التخطيط والتكلفة» اختر البند والمبلغ والتاريخ. التكلفة المسجلة تدخل في التكلفة الفعلية (AC) للقيمة المكتسبة.", en: "In “Schedule & cost updates” choose the item, amount and date. Recorded cost feeds actual cost (AC) in earned value." }, screen: "controls#manager-schedule", needs: "project.cost.enter", focus: "التكلفة الفعلية", image: "/guide/cost-control-3.jpg" },
      { cadence: "weekly", title: { ar: "أدخل الميزانية حسب WBS", en: "Enter the budget by WBS" }, body: { ar: "في «تحديث التخطيط والتكلفة» اختر بند WBS ورمز التكلفة والمبلغ الأصلي والحالي ثم احفظ. الميزانية لا تُحذف: التعديل يُسجَّل بالمبلغ الحالي.", en: "In “Schedule & cost updates” choose the WBS item, cost code, original and current amount, then save. A budget line is never deleted: a change is recorded in the current amount." }, screen: "controls#manager-schedule", needs: "project.budget.manage", focus: "الميزانية", image: "/guide/cost-control-2.jpg" },
      { cadence: "weekly", title: { ar: "احفظ لقطة القيمة المكتسبة", en: "Save an earned-value snapshot" }, body: { ar: "اختر الفترة واضغط حفظ اللقطة. تُحسب من الميزانية والتقدم والتكلفة المسجلة، وتظهر في مؤشرات الأداء مع مصادرها.", en: "Choose the period and save the snapshot. It is computed from the budget, progress and recorded cost, and shows in the performance indicators with its sources." }, screen: "controls#manager-schedule", needs: "project.evm.manage", focus: "التقاط EVM محسوب", image: "/guide/cost-control-4.jpg" },
      { cadence: "weekly", title: { ar: "احفظ لقطة صحة المشروع", en: "Save a project-health snapshot" }, body: { ar: "بعد لقطة القيمة المكتسبة احسب لقطة الصحة واحفظها؛ تجمع أحدث EVM والمخاطر عالية التعرض والإجراءات وطلبات المعلومات وحالات عدم المطابقة المتأخرة. ما لا مصدر له بعد يدخل صفرًا معلنًا.", en: "After the earned-value snapshot, calculate and save the health snapshot: it combines the latest EVM, high-exposure risks, overdue actions, overdue RFIs and overdue NCRs. What has no source yet enters as an explicit zero." }, screen: "controls", needs: "project.evm.manage", focus: "صحة المشروع" },
      { cadence: "weekly", title: { ar: "راجع الربحية والتدفق النقدي", en: "Review profitability and cash flow" }, body: { ar: "من شاشة الربحية ترى الإيراد والتكلفة والالتزامات والتدفق النقدي الصافي الشهري، وكل رقم يفتح مصدره.", en: "The profitability screen shows revenue, cost, commitments and net monthly cash flow; each figure opens its source." }, screen: "profitability", needs: "project.cashflow.read", focus: "صافي التدفق النقدي شهريًا", image: "/guide/cost-control-5.jpg" },
      { cadence: "weekly", title: { ar: "أدخل تسويات العروض وقارنها", en: "Enter bid adjustments and compare" }, body: { ar: "في «المناقصات قبل الترسية» افتح الحزمة وأضف تسويات العروض حتى تصير قابلة للمقارنة، ثم اقرأ الأدنى بعد التسوية. هذه الخطوة تقارن ولا ترسّي.", en: "In “Tenders before award” open the package and add bid adjustments so the bids are comparable, then read the lowest after adjustment. This step compares; it does not award." }, screen: "controls#manager-tenders", needs: "project.tender.level", focus: "حزم المناقصة", image: "/guide/cost-control-6.jpg" },
    ],
  },
  {
    id: "planning", roleCode: "PLANNING_ENGINEER",
    title: { ar: "التخطيط", en: "Planning" },
    intro: { ar: "تبني هيكل تجزئة العمل والأنشطة وتستورد جدولك، وتلتقط القيمة المكتسبة وتتابع التنفيذ في ضبط المشروع PMC.", en: "You build the work breakdown structure and the activities, import your programme, capture earned value and follow execution in project control (PMC)." },
    cannot: { ar: "لا تثبّت تكلفة فعلية ولا تعتمد صرفًا.", en: "You do not post actual cost or approve disbursement." },
    steps: [
      { cadence: "weekly", title: { ar: "ابنِ هيكل تجزئة العمل (WBS)", en: "Build the work breakdown structure (WBS)" }, body: { ar: "في «تحديث التخطيط والتكلفة» أضف بنود WBS برمز واسم وقيمة مخططة. كل نشاط لاحقًا يُربط ببند منها.", en: "In “Schedule & cost updates” add WBS items with a code, name and planned value. Every activity is later tied to one of them." }, screen: "controls#manager-schedule", needs: "project.wbs.manage", focus: "هيكل تجزئة العمل", image: "/guide/planning-1.jpg" },
      { cadence: "weekly", title: { ar: "أضف الأنشطة بتواريخها", en: "Add the activities with their dates" }, body: { ar: "اختر بند WBS وأدخل رمز النشاط واسمه وقيمته وتاريخي البداية والنهاية المخططين.", en: "Choose the WBS item and enter the activity code, name, value and planned start and finish." }, screen: "controls#manager-schedule", needs: "project.schedule.manage", focus: "الأنشطة والجدولة", image: "/guide/planning-2.jpg" },
      { cadence: "weekly", title: { ar: "استورد جدولك من Primavera أو Excel", en: "Import your programme from Primavera or Excel" }, body: { ar: "في «التخطيط وملفات البيانات» ارفع ملف XER أو XLSX. يُفحص الملف وتُعرض لك النتيجة قبل أن يُكتب منه شيء، وتُسجَّل مراجع WBS غير المحلولة بدل تجاهلها.", en: "In “Planning & controlled data” upload an XER or XLSX file. The file is checked and the result shown before anything is written, and unresolved WBS references are reported, not ignored." }, screen: "controls#manager-assurance", needs: "project.schedule.manage", focus: "استيراد بيانات", image: "/guide/planning-3.jpg" },
      { cadence: "weekly", title: { ar: "التقط لقطة القيمة المكتسبة", en: "Capture an earned-value snapshot" }, body: { ar: "اختر الفترة واحفظ؛ تُحسب القيمة من الجدول والتقدم وتظهر في المؤشرات.", en: "Choose the period and save; the value is computed from the schedule and progress and shows in the indicators." }, screen: "controls#manager-schedule", needs: "project.evm.manage", focus: "التقاط EVM محسوب", image: "/guide/planning-5.jpg" },
      { cadence: "daily", title: { ar: "تابع التنفيذ في تبويب ضبط المشروع PMC", en: "Follow execution in the PMC tab" }, body: { ar: "تبويب «ضبط المشروع PMC» يجمع آخر التحديثات والاعتمادات والمخطط والبرنامج الزمني، ويصدّر Excel وPDF.", en: "The “PMC project control” tab gathers latest updates, approvals, the site plan and the programme, and exports Excel and PDF." }, screen: "controls#pmc", needs: "project.pmc.read", image: "/guide/planning-6.jpg" },
    ],
  },
  {
    id: "project-coordination", roleCode: "PROJECT_COORDINATOR",
    title: { ar: "منسقو المشاريع", en: "Project coordinators" },
    intro: { ar: "تُبقي العمل متحركًا بين الفرق والاستشاري: سجلات الموقع وطلبات المواد وطلبات المعلومات، وجانب الاعتماد من التصميم.", en: "You keep work moving between the teams and the consultant: site records, material requests, RFIs, and the approval side of design." },
    cannot: { ar: "لا تصدر المخططات ولا تدير العقود ولا الميزانية.", en: "You do not issue drawings, manage contracts or the budget." },
    steps: [
      { cadence: "daily", title: { ar: "سجّل تقرير الموقع من الجوال", en: "Record the site report from the phone" }, body: { ar: "شاشة الجوال مصممة للإدخال السريع، وتحفظ ما تدخله على الهاتف إذا انقطع الاتصال وتُرسله عند عودته دون تكرار.", en: "The phone screen is built for quick entry, keeps what you enter on the phone when the connection drops and sends it when it returns, without duplicates." }, screen: "field", needs: "project.field.manage", image: "/guide/project-coordination-1.jpg" },
      { cadence: "daily", title: { ar: "افتح طلب معلومات (RFI)", en: "Raise a request for information (RFI)" }, body: { ar: "في «سجل الموقع والجودة» أنشئ الطلب بعنوان ووصف وأرفق ما يلزم؛ يسير في مسار الاعتماد ولا يجيب عنه من أنشأه.", en: "In “Site, quality & delivery” create the request with a title and description and attach what is needed; it follows the approval flow and the person who raised it cannot answer it." }, screen: "controls#manager-site", needs: "project.rfi.manage", focus: "سجل طلبات المعلومات", image: "/guide/project-coordination-2.jpg" },
      { cadence: "weekly", title: { ar: "اطلب مواد", en: "Request materials" }, body: { ar: "في «الموردون وطلبات المواد» اطلب المادة والكمية وموعد الحاجة إليها؛ الطلب يصل المشتريات للمتابعة دون أن تملك صلاحية الشراء.", en: "In “Suppliers and material requests” request the material, quantity and the date it is needed; the request reaches procurement without you holding purchasing power." }, screen: "controls#manager-commercial", needs: "project.material.request", focus: "الموردون وطلبات المواد", image: "/guide/project-coordination-3.jpg" },
      { cadence: "daily", title: { ar: "أغلق ملاحظات المراجعة", en: "Close design review comments" }, body: { ar: "في «التنسيق الفني والمعماري» أغلق الملاحظة بعد الرد عليها، وسجّل رد الاستشاري (A/B/C/D) على التقديم. من ردّ على ملاحظة لا يغلقها.", en: "In “Technical & architectural coordination” close a comment once answered, and record the consultant's reply (A/B/C/D) on the submittal. Whoever answered a comment does not close it." }, screen: "controls#manager-design", needs: "project.design.approve", focus: "ملاحظات المراجعة", image: "/guide/project-coordination-4.jpg" },
      { cadence: "daily", title: { ar: "حدّث حالة الوحدات في ضبط المشروع PMC", en: "Update unit status in the PMC tab" }, body: { ar: "حدّث حالة الوحدات والأنشطة التي تتابعها وراجع آخر التحديثات من التبويب نفسه.", en: "Update the status of the units and activities you follow and review the latest updates from the same tab." }, screen: "controls#pmc", needs: "project.pmc.update", image: "/guide/project-coordination-5.jpg" },
      { cadence: "weekly", title: { ar: "راجع طلبات المعلومات المتأخرة", en: "Review overdue RFIs" }, body: { ar: "بطاقة «صحة المشروع» تعدّ طلبات المعلومات التي تجاوزت استحقاقها. افتح كل واحد منها في سجل طلبات المعلومات وحدّد حالته التالية.", en: "The “Project health” card counts the RFIs past their due date. Open each one in the RFI register and set its next status." }, screen: "controls", needs: "project.read", focus: "طلبات معلومات متأخرة" },
    ],
  },
  {
    id: "design-coordination", roleCode: "DESIGN_COORDINATOR_ARCHITECTURAL",
    title: { ar: "منسقو التصميم (الفني والمعماري)", en: "Design coordinators (technical and architectural)" },
    intro: { ar: "تصدر المخططات وتتابعها مع الاستشاري، كلٌّ في تخصصه: منسق التصميم المعماري للمعماري، والفني للإنشائي والميكانيكي والكهربائي والمدني.", en: "You issue drawings and chase them with the consultant, each in your own discipline: the architectural coordinator for architectural, the technical one for structural, mechanical, electrical and civil." },
    cannot: { ar: "لا تعتمد ما أصدرته، ولا تلمس مخطط تخصص غير تخصصك.", en: "You do not approve what you issued, and you cannot touch a drawing outside your discipline." },
    steps: [
      { cadence: "weekly", title: { ar: "سجّل مخططًا بإصداره الأول", en: "Register a drawing with its first issue" }, body: { ar: "في «التنسيق الفني والمعماري» أدخل رقم المخطط وعنوانه وتخصصه وإصداره الحالي. يرفض الخادم تخصصًا ليس لك.", en: "In “Technical & architectural coordination” enter the drawing number, title, discipline and current issue. The server refuses a discipline that is not yours." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "سجل المخططات", image: "/guide/design-coordination-1.jpg" },
      { cadence: "weekly", title: { ar: "أضف إصدارًا جديدًا", en: "Add a new issue" }, body: { ar: "الإصدار الجديد يحل محل الحالي ويُبقي السابقة في السجل. لا يُحذف إصدار.", en: "A new issue supersedes the current one and keeps earlier ones on record. An issue is never deleted." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "سجل المخططات", image: "/guide/design-coordination-2.jpg" },
      { cadence: "weekly", title: { ar: "أرسل إحالة بالمخططات", en: "Send a transmittal of drawings" }, body: { ar: "أنشئ الإحالة، أضف المخططات بإصداراتها، ثم أرسلها؛ بعد الإرسال لا تتغير بنودها.", en: "Create the transmittal, add the drawings with their issues, then send it; after sending, its items no longer change." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "الإحالات", image: "/guide/design-coordination-3.jpg" },
      { cadence: "daily", title: { ar: "ردّ على ملاحظات المراجعة", en: "Respond to the review comments" }, body: { ar: "اقرأ ملاحظات المراجعة على مخططاتك وأجب عن كل واحدة؛ يُغلقها منسق المشروع بعد ردّك.", en: "Read the review comments on your drawings and answer each one; the project coordinator closes it after your reply." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "ملاحظات المراجعة", image: "/guide/design-coordination-4.jpg" },
      { cadence: "weekly", title: { ar: "قدّم للاستشاري وتتبّع ردّه A/B/C/D", en: "Submit to the consultant and track the A/B/C/D reply" }, body: { ar: "قدّم التقديم، ثم يسجّل منسق المشروع رد الاستشاري: A معتمد، B معتمد مع ملاحظات، C عدّل وأعد التقديم، D مرفوض.", en: "Submit it; the project coordinator then records the consultant's reply: A approved, B approved with comments, C revise and resubmit, D rejected." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "التقديمات للاستشاري", image: "/guide/design-coordination-5.jpg" },
      { cadence: "daily", title: { ar: "تابع التقديمات بانتظار الرد والمتأخرة", en: "Follow submittals awaiting reply and overdue ones" }, body: { ar: "لوحة مرحلة التصميم تعرض التقديمات بانتظار الرد، والمتأخرة، والملاحظات المتأخرة، ومتوسط أيام الرد. تابع ما تأخر لدى الاستشاري قبل أن يتراكم.", en: "The design-stage board shows submittals awaiting reply, overdue submittals, overdue comments and the average reply time. Chase what is late with the consultant before it piles up." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "تقديمات متأخرة" },
    ],
  },
  {
    id: "contracts", roleCode: "CONTRACTS_MANAGER",
    title: { ar: "العقود", en: "Contracts" },
    intro: { ar: "تُعدّ المناقصات وتدخل العروض وتتابع الالتزامات والعقود الناتجة عنها.", en: "You prepare tenders, enter bids and follow the commitments and contracts that come from them." },
    cannot: { ar: "لا تسوّي العروض ولا ترسّي المناقصة: من أدخل العروض لا يرسّي، والترسية للمالك أو لدور مخصّص.", en: "You neither level the bids nor award the tender: whoever entered the bids does not award, and the award is for the owner or a custom role." },
    steps: [
      { cadence: "weekly", title: { ar: "أنشئ حزمة مناقصة", en: "Create a tender package" }, body: { ar: "في «المناقصات قبل الترسية» أدخل رمز الحزمة وعنوانها ونطاقها وتاريخ الإغلاق.", en: "In “Tenders before award” enter the package code, title, scope and closing date." }, screen: "controls#manager-tenders", needs: "project.tender.manage", focus: "حزم المناقصة", image: "/guide/contracts-1.jpg" },
      { cadence: "weekly", title: { ar: "ادعُ المقاولين والموردين", en: "Invite contractors and suppliers" }, body: { ar: "أضف المدعوين من قائمة الموردين؛ كل مدعو مرة واحدة في المناقصة.", en: "Add invitees from the supplier list; each invitee once per tender." }, screen: "controls#manager-tenders", needs: "project.tender.manage", focus: "حزم المناقصة", image: "/guide/contracts-2.jpg" },
      { cadence: "daily", title: { ar: "أدخل العروض الواردة", en: "Enter the bids received" }, body: { ar: "أدخل مبلغ كل عرض وعملته وصلاحيته. من يدخل العروض لا يرسّي المناقصة.", en: "Enter each bid's amount, currency and validity. Whoever enters the bids does not award the tender." }, screen: "controls#manager-tenders", needs: "project.tender.bids", focus: "حزم المناقصة", image: "/guide/contracts-3.jpg" },
      { cadence: "weekly", title: { ar: "سلّم المقارنة للكوست كنترول", en: "Hand the comparison to cost control" }, body: { ar: "تظهر المقارنة بعد تسوية العروض؛ التسوية عمل الكوست كنترول، والترسية بعدها لمن يملكها.", en: "The comparison appears once bids are adjusted; adjusting them is cost control's work, and the award afterwards belongs to whoever holds it." }, screen: "controls#manager-tenders", needs: "project.tender.manage", focus: "حزم المناقصة", image: "/guide/contracts-4.jpg" },
      { cadence: "daily", title: { ar: "تابع الالتزامات والعقود", en: "Follow commitments and contracts" }, body: { ar: "الترسية تنشئ عقدًا والتزامًا بالميزانية تلقائيًا؛ تتابعهما في «العقود والمستندات والمطالبات» وتدير الالتزامات الإضافية.", en: "An award creates a contract and a budget commitment automatically; follow them in “Contracts, documents & claims” and manage further commitments." }, screen: "controls#manager-commercial", needs: "project.commitment.manage", focus: "العقود والالتزامات", image: "/guide/contracts-5.jpg" },
      { cadence: "weekly", title: { ar: "أنشئ عقدًا أو التزامًا يدويًا عند الحاجة", en: "Create a contract or commitment by hand when needed" }, body: { ar: "في «العقود والالتزامات» تُسجَّل العقود والالتزامات التي لا تأتي من ترسية. الترسية تنشئ العقد والالتزام الأول تلقائيًا، فلا تكررهما.", en: "In “Contracts & commitments” record the contracts and commitments that do not come from an award. An award creates the first contract and commitment itself, so do not duplicate them." }, screen: "controls#manager-commercial", needs: "project.commitment.manage", focus: "العقود والالتزامات" },
    ],
  },
];

export const guideImage = (section: GuideSectionId, stepNumber: number) => `/guide/${section}-${stepNumber}.jpg`;

/** The address of a step's screen for a given project. */
export function guideStepHref(screen: string, tenantId: string, projectId: string): string {
  if (screen === "field") return `/m/${tenantId}/${projectId}`;
  return `/projects/${tenantId}/${projectId}/${screen}`;
}
