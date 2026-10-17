// The in-platform user guide (item 12): one section per working role, each a short ordered list of steps with the screen it happens on.
// Every step names the permission it needs, taken from the role templates in server/domain/operationalRoles.ts (a test keeps the two in agreement),
// and an anchor on the project controls page that exists (a test keeps those honest too). Screenshots are taken from the real screens with
// synthetic data by scripts/capture-screenshots.mjs into client/public/guide/<section>-<n>.jpg.
export type GuideSectionId = "cost-control" | "planning" | "project-coordination" | "design-coordination" | "contracts";
export type GuideStep = {
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  /** Where the step happens, relative to /projects/:tenantId/:projectId. `controls#manager-design` opens that lane; `profitability` is its own page. */
  screen: string;
  /** The permission the screen's write controls need; without it the controls show but are disabled with the reason. */
  needs: string;
  /** A heading or label (Arabic text) on that screen that the step's picture starts at; absent = the top of the lane. */
  focus?: string;
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

export const userGuide: GuideSection[] = [
  {
    id: "cost-control", roleCode: "COST_CONTROLLER",
    title: { ar: "الكوست كنترول", en: "Cost control" },
    intro: { ar: "تضبط الميزانية والتكلفة الفعلية والقيمة المكتسبة، وتقارن عروض المناقصات دون أن ترسّيها.", en: "You set the budget, record actual cost and earned value, and level tender bids without awarding them." },
    cannot: { ar: "لا ترسّي المناقصة ولا تعتمد صرفًا: الترسية للمالك أو لدور مخصّص، والاعتماد لغيرك.", en: "You do not award a tender or approve disbursement: the award is for the owner or a custom role, approval for someone else." },
    steps: [
      { title: { ar: "افتح ضوابط المشروع واقرأ الصحة", en: "Open project controls and read the health" }, body: { ar: "من سجل المشاريع افتح المشروع. بطاقات الأعلى تُظهر الصحة والمؤشرات؛ كل مؤشر يذكر أساس حسابه ومتى حُدّث.", en: "Open the project from the registry. The cards at the top show health and indicators; each states its basis and when it was updated." }, screen: "controls", needs: "project.read" },
      { title: { ar: "أدخل الميزانية حسب WBS", en: "Enter the budget by WBS" }, body: { ar: "في «تحديث التخطيط والتكلفة» اختر بند WBS ورمز التكلفة والمبلغ الأصلي والحالي ثم احفظ. الميزانية لا تُحذف: التعديل يُسجَّل بالمبلغ الحالي.", en: "In “Schedule & cost updates” choose the WBS item, cost code, original and current amount, then save. A budget line is never deleted: a change is recorded in the current amount." }, screen: "controls#manager-schedule", needs: "project.budget.manage", focus: "الميزانية" },
      { title: { ar: "سجّل التكلفة الفعلية", en: "Record actual cost" }, body: { ar: "في القسم نفسه اختر البند والمبلغ وتاريخ الاستحقاق. التكلفة المسجلة تدخل في قيمة التكلفة الفعلية للقيمة المكتسبة.", en: "In the same section choose the item, amount and incurred date. Recorded cost feeds actual cost in earned value." }, screen: "controls#manager-schedule", needs: "project.cost.enter", focus: "التكلفة الفعلية" },
      { title: { ar: "احفظ لقطة القيمة المكتسبة", en: "Save an earned-value snapshot" }, body: { ar: "اختر الفترة واضغط حفظ اللقطة. تُحسب من الميزانية والتقدم والتكلفة المسجلة، وتظهر في مؤشرات الأداء مع مصادرها.", en: "Choose the period and save the snapshot. It is computed from the budget, progress and recorded cost, and shows in the performance indicators with its sources." }, screen: "controls#manager-schedule", needs: "project.evm.manage", focus: "التقاط EVM محسوب" },
      { title: { ar: "راجع الربحية والتدفق النقدي", en: "Review profitability and cash flow" }, body: { ar: "من شاشة الربحية ترى الإيراد والتكلفة والالتزامات والتدفق النقدي الصافي الشهري، وكل رقم يفتح مصدره.", en: "The profitability screen shows revenue, cost, commitments and net monthly cash flow; each figure opens its source." }, screen: "profitability", needs: "project.cashflow.read", focus: "صافي التدفق النقدي شهريًا" },
      { title: { ar: "قارن عروض المناقصة", en: "Level the tender bids" }, body: { ar: "في «المناقصات قبل الترسية» افتح المناقصة وأضف تعديلات الاستيعاب لتصير العروض قابلة للمقارنة، ثم اقرأ الأدنى بعد المعايرة. هذه الخطوة تقارن ولا ترسّي.", en: "In “Tenders before award” open the tender and add normalisation adjustments so the bids are comparable, then read the lowest after levelling. This step compares; it does not award." }, screen: "controls#manager-tenders", needs: "project.tender.level", focus: "حزم المناقصة" },
    ],
  },
  {
    id: "planning", roleCode: "PLANNING_ENGINEER",
    title: { ar: "التخطيط", en: "Planning" },
    intro: { ar: "تبني الهيكل والجدول وتستورد جدولك وتضبط الخطة الرئيسية وتلتقط القيمة المكتسبة.", en: "You build the structure and schedule, import your programme, tune the master plan and capture earned value." },
    cannot: { ar: "لا تثبّت تكلفة فعلية ولا تعتمد صرفًا.", en: "You do not post actual cost or approve disbursement." },
    steps: [
      { title: { ar: "ابنِ هيكل تقسيم العمل (WBS)", en: "Build the work breakdown structure (WBS)" }, body: { ar: "في «تحديث التخطيط والتكلفة» أضف بنود WBS برمز واسم وقيمة مخططة. كل نشاط لاحقًا يُربط ببند منها.", en: "In “Schedule & cost updates” add WBS items with a code, name and planned value. Every activity is later tied to one of them." }, screen: "controls#manager-schedule", needs: "project.wbs.manage", focus: "هيكل تجزئة العمل" },
      { title: { ar: "أضف الأنشطة بتواريخها", en: "Add the activities with their dates" }, body: { ar: "اختر بند WBS وأدخل رمز النشاط واسمه وقيمته وتاريخي البداية والنهاية المخططين.", en: "Choose the WBS item and enter the activity code, name, value and planned start and finish." }, screen: "controls#manager-schedule", needs: "project.schedule.manage", focus: "الأنشطة والجدولة" },
      { title: { ar: "استورد جدولك من Primavera أو Excel", en: "Import your programme from Primavera or Excel" }, body: { ar: "في «التخطيط والبيانات» ارفع ملف XER أو XLSX. يُفحص الملف وتُعرض لك النتيجة قبل أن يُكتب منها شيء، وتُسجَّل مراجع WBS غير المحلولة بدل تجاهلها.", en: "In “Planning and data” upload an XER or XLSX file. The file is checked and the result shown before anything is written, and unresolved WBS references are reported, not ignored." }, screen: "controls#manager-assurance", needs: "project.pmc.manage", focus: "استيراد بيانات" },
      { title: { ar: "اضبط الخطة الرئيسية", en: "Tune the master plan" }, body: { ar: "في الخطة الرئيسية دوّر المخطط وعايره وانقل بين الأنشطة وأبويها، واحفظ منظورًا مشتركًا لفريقك، وفعّل التنبيهات.", en: "In the master plan rotate and calibrate the plan, move between activities and their parents, save a shared view for your team and switch alerts on." }, screen: "controls#manager-assurance", needs: "project.pmc.manage", focus: "تدوير الخطة ومعايرتها" },
      { title: { ar: "التقط لقطة القيمة المكتسبة", en: "Capture an earned-value snapshot" }, body: { ar: "اختر الفترة واحفظ؛ تُحسب القيمة من الجدول والتقدم وتظهر في المؤشرات.", en: "Choose the period and save; the value is computed from the schedule and progress and shows in the indicators." }, screen: "controls#manager-schedule", needs: "project.evm.manage", focus: "التقاط EVM محسوب" },
      { title: { ar: "تابع الموقع في تبويب PMC", en: "Follow the site in the PMC tab" }, body: { ar: "تبويب «ضبط المشروع PMC» يجمع آخر التحديثات والاعتمادات والمخطط والبرنامج الزمني، ويصدّر Excel وPDF.", en: "The “PMC project control” tab gathers latest updates, approvals, the site plan and the programme, and exports Excel and PDF." }, screen: "controls#pmc", needs: "project.pmc.read" },
    ],
  },
  {
    id: "project-coordination", roleCode: "PROJECT_COORDINATOR",
    title: { ar: "منسقو المشاريع", en: "Project coordinators" },
    intro: { ar: "تُبقي العمل متحركًا بين الفرق والاستشاري: سجلات الموقع وطلبات المواد وطلبات الاستيضاح، وجانب الاعتماد من التصميم.", en: "You keep work moving between the teams and the consultant: site records, material requests, RFIs, and the approval side of design." },
    cannot: { ar: "لا تصدر المخططات ولا تدير العقود ولا الميزانية.", en: "You do not issue drawings, manage contracts or the budget." },
    steps: [
      { title: { ar: "سجّل تقرير الموقع من الجوال", en: "Record the site report from the phone" }, body: { ar: "شاشة الجوال مصممة للإدخال السريع، وتحفظ ما تدخله على الهاتف إذا انقطع الاتصال وتُرسله عند عودته دون تكرار.", en: "The phone screen is built for quick entry, keeps what you enter on the phone when the connection drops and sends it when it returns, without duplicates." }, screen: "field", needs: "project.field.manage" },
      { title: { ar: "افتح طلب استيضاح (RFI)", en: "Raise a request for information (RFI)" }, body: { ar: "في «التسليم الميداني» أنشئ الطلب بعنوان ووصف وأرفق ما يلزم؛ يسير في مسار الاعتماد ولا يجيب عنه من أنشأه.", en: "In “Site delivery” create the request with a title and description and attach what is needed; it follows the approval flow and the person who raised it cannot answer it." }, screen: "controls#manager-site", needs: "project.rfi.manage", focus: "سجل طلبات المعلومات" },
      { title: { ar: "اطلب مواد", en: "Request materials" }, body: { ar: "في «الموردون وطلبات المواد» اطلب المادة والكمية؛ الطلب يصل المشتريات للمتابعة دون أن تملك صلاحية الشراء.", en: "In “Suppliers and material requests” request the material and quantity; the request reaches procurement without you holding purchasing power." }, screen: "controls#manager-commercial", needs: "project.material.request", focus: "الموردون وطلبات المواد" },
      { title: { ar: "أغلق تعليقات التصميم", en: "Close design comments" }, body: { ar: "في «التنسيق الفني والمعماري» أغلق التعليق بعد الرد عليه، وسجّل رد الاستشاري (A/B/C/D) على التقديم. من ردّ على تعليق لا يغلقه.", en: "In “Technical & architectural coordination” close a comment once answered, and record the consultant's reply (A/B/C/D) on the submittal. Whoever answered a comment does not close it." }, screen: "controls#manager-design", needs: "project.design.approve", focus: "ملاحظات المراجعة" },
      { title: { ar: "حدّث الموقع في تبويب PMC", en: "Update the site in the PMC tab" }, body: { ar: "حدّث حالة الوحدات والأنشطة التي تتابعها وراجع آخر التحديثات من التبويب نفسه.", en: "Update the status of the units and activities you follow and review the latest updates from the same tab." }, screen: "controls#pmc", needs: "project.pmc.update" },
    ],
  },
  {
    id: "design-coordination", roleCode: "DESIGN_COORDINATOR_ARCHITECTURAL",
    title: { ar: "منسقو التصميم (الفني والمعماري)", en: "Design coordinators (technical and architectural)" },
    intro: { ar: "تصدر المخططات وتتابعها مع الاستشاري، كلٌّ في تخصصه: منسق التصميم المعماري للمعماري، والفني للإنشائي والميكانيكي والكهربائي والمدني.", en: "You issue drawings and chase them with the consultant, each in your own discipline: the architectural coordinator for architectural, the technical one for structural, mechanical, electrical and civil." },
    cannot: { ar: "لا تعتمد ما أصدرته، ولا تلمس مخطط تخصص غير تخصصك.", en: "You do not approve what you issued, and you cannot touch a drawing outside your discipline." },
    steps: [
      { title: { ar: "سجّل مخططًا بمراجعته الأولى", en: "Register a drawing with its first revision" }, body: { ar: "في «التنسيق الفني والمعماري» أدخل رقم المخطط وعنوانه وتخصصه ومراجعته. يرفض الخادم تخصصًا ليس لك.", en: "In “Technical & architectural coordination” enter the drawing number, title, discipline and revision. The server refuses a discipline that is not yours." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "سجل المخططات" },
      { title: { ar: "أضف مراجعة جديدة", en: "Add a new revision" }, body: { ar: "المراجعة الجديدة تحل محل الحالية وتُبقي السابقة في السجل. لا تُحذف مراجعة.", en: "A new revision supersedes the current one and keeps earlier ones on record. A revision is never deleted." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "سجل المخططات" },
      { title: { ar: "أرسل إحالة بالمخططات", en: "Send a transmittal of drawings" }, body: { ar: "أنشئ الإحالة، أضف المخططات بمراجعاتها، ثم أرسلها؛ بعد الإرسال لا تتغير بنودها.", en: "Create the transmittal, add the drawings with their revisions, then send it; after sending, its items no longer change." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "الإحالات" },
      { title: { ar: "ردّ على تعليقات الاستشاري", en: "Respond to the consultant's comments" }, body: { ar: "اقرأ تعليقات المخطط وأجب عن كل منها؛ يُغلق التعليق شخص آخر هو منسق المشروع.", en: "Read the drawing's comments and answer each; someone else, the project coordinator, closes the comment." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "ملاحظات المراجعة" },
      { title: { ar: "قدّم للاستشاري وتتبّع ردّه A/B/C/D", en: "Submit to the consultant and track the A/B/C/D reply" }, body: { ar: "قدّم التقديم، ثم يسجّل منسق المشروع رد الاستشاري. A معتمد، B بملاحظات، C يُعاد تقديمه، D مرفوض.", en: "Submit it; the project coordinator then records the consultant's reply. A approved, B approved with comments, C resubmit, D rejected." }, screen: "controls#manager-design", needs: "project.design.manage", focus: "التقديمات للاستشاري" },
    ],
  },
  {
    id: "contracts", roleCode: "CONTRACTS_MANAGER",
    title: { ar: "العقود", en: "Contracts" },
    intro: { ar: "تُعدّ المناقصات وتدخل العروض وتدير الالتزامات والعقود الناتجة.", en: "You prepare tenders, enter bids and manage the commitments and contracts that follow." },
    cannot: { ar: "لا تعاير العروض ولا ترسّي المناقصة: من أدخل العروض لا يرسّي، والترسية للمالك أو لدور مخصّص.", en: "You neither level the bids nor award the tender: whoever entered the bids does not award, and the award is for the owner or a custom role." },
    steps: [
      { title: { ar: "أنشئ حزمة مناقصة", en: "Create a tender package" }, body: { ar: "في «المناقصات قبل الترسية» أدخل رمز الحزمة وعنوانها ونطاقها وتاريخ الإغلاق.", en: "In “Tenders before award” enter the package code, title, scope and closing date." }, screen: "controls#manager-tenders", needs: "project.tender.manage", focus: "حزم المناقصة" },
      { title: { ar: "ادعُ المقاولين والموردين", en: "Invite contractors and suppliers" }, body: { ar: "أضف المدعوين من قائمة الموردين؛ كل مدعو مرة واحدة في المناقصة.", en: "Add invitees from the supplier list; each invitee once per tender." }, screen: "controls#manager-tenders", needs: "project.tender.manage", focus: "حزم المناقصة" },
      { title: { ar: "أدخل العروض الواردة", en: "Enter the bids received" }, body: { ar: "أدخل مبلغ كل عرض وعملته وصلاحيته. من يدخل العروض لا يرسّي المناقصة.", en: "Enter each bid's amount, currency and validity. Whoever enters the bids does not award the tender." }, screen: "controls#manager-tenders", needs: "project.tender.bids", focus: "حزم المناقصة" },
      { title: { ar: "سلّم المقارنة للكوست كنترول", en: "Hand the comparison to cost control" }, body: { ar: "تظهر المقارنة بعد معايرة العروض؛ المعايرة عمل الكوست كنترول، والترسية بعدها لمن يملكها.", en: "The comparison appears once bids are levelled; levelling is cost control's work, and the award afterwards belongs to whoever holds it." }, screen: "controls#manager-tenders", needs: "project.tender.manage", focus: "حزم المناقصة" },
      { title: { ar: "تابع الالتزامات والعقود", en: "Follow commitments and contracts" }, body: { ar: "الترسية تنشئ عقدًا والتزامًا بالميزانية تلقائيًا؛ تتابعهما في «العقود والمستندات» وتدير الالتزامات الإضافية.", en: "An award creates a contract and a budget commitment automatically; follow them in “Contracts and documents” and manage further commitments." }, screen: "controls#manager-commercial", needs: "project.commitment.manage", focus: "العقود والالتزامات" },
    ],
  },
];

export const guideImage = (section: GuideSectionId, stepNumber: number) => `/guide/${section}-${stepNumber}.jpg`;

/** The address of a step's screen for a given project. */
export function guideStepHref(screen: string, tenantId: string, projectId: string): string {
  if (screen === "field") return `/m/${tenantId}/${projectId}`;
  return `/projects/${tenantId}/${projectId}/${screen}`;
}
