import { resolveLanguage, type Language } from "./language";
const operationalRoleNames = {
  TENANT_OWNER: { ar: "مالك الشركة", en: "Tenant Owner", ur: "کمپنی کا مالک" },
  WAREHOUSE_CUSTODIAN: { ar: "أمين المستودع", en: "Warehouse Custodian", ur: "گودام کا نگران" },
  PROCUREMENT_OFFICER: { ar: "مسؤول المشتريات والتوريد", en: "Procurement Officer", ur: "خریداری افسر" },
  FINANCE_MANAGER: { ar: "المدير المالي", en: "Finance Manager", ur: "فنانس مینیجر" },
  ACCOUNTANT: { ar: "المحاسب", en: "Accountant", ur: "اکاؤنٹنٹ" },
  HR_MANAGER: { ar: "مدير الموارد البشرية", en: "HR Manager", ur: "HR مینیجر" },
  PLANNING_ENGINEER: { ar: "مهندس التخطيط", en: "Planning Engineer", ur: "منصوبہ بندی انجینئر" },
  SITE_ENGINEER: { ar: "مهندس الموقع", en: "Site Engineer", ur: "سائٹ انجینئر" },
  QA_QC_MANAGER: { ar: "مدير الجودة وضبط الجودة", en: "QA/QC Manager", ur: "QA/QC مینیجر" },
  HSE_MANAGER: { ar: "مدير الصحة والسلامة والبيئة", en: "HSE Manager", ur: "HSE مینیجر" },
  PROJECT_MANAGER: { ar: "مدير المشروع", en: "Project Manager", ur: "پروجیکٹ مینیجر" },
  EXECUTIVE: { ar: "المستوى التنفيذي", en: "Executive", ur: "ایگزیکٹو" },
  PMO_LEAD: { ar: "مسؤول مكتب إدارة المشاريع (PMO)", en: "PMO Lead", ur: "PMO لیڈ" },
  COST_CONTROLLER: { ar: "مراقب التكلفة (كوست كنترول)", en: "Cost Controller", ur: "لاگت کنٹرولر" },
  PROJECT_COORDINATOR: { ar: "منسق المشروع", en: "Project Coordinator", ur: "پروجیکٹ کوآرڈینیٹر" },
  DESIGN_COORDINATOR_ARCHITECTURAL: { ar: "منسق التصميم المعماري", en: "Design Coordinator (Architectural)", ur: "ڈیزائن کوآرڈینیٹر (تعمیراتی)" },
  DESIGN_COORDINATOR_TECHNICAL: { ar: "منسق التصميم الفني", en: "Design Coordinator (Technical)", ur: "ڈیزائن کوآرڈینیٹر (تکنیکی)" },
  CONTRACTS_MANAGER: { ar: "مدير العقود", en: "Contracts Manager", ur: "معاہدوں کا مینیجر" },
} as const;

export const operationalRoleProfiles = {
  PROJECT_MANAGER: {
    ar: { purpose: "قيادة المشروع والقرارات اليومية", focus: "الجدول والتكلفة والتقدم والجودة والمخاطر", boundary: "لا يصدر مشتريات أو يدير المستودع أو يعتمد الرواتب" },
    en: { purpose: "Lead the project and daily decisions", focus: "Schedule, cost, progress, quality, and risks", boundary: "Does not execute procurement, warehouse custody, or payroll approval" }, ur: { purpose: "پروجیکٹ اور روزمرہ فیصلوں کی قیادت کریں", focus: "شیڈول، لاگت، پیش رفت، معیار اور خطرات", boundary: "خریداری، گودام کی تحویل یا تنخواہ کی منظوری پر عمل نہیں کرتا" },
  },
  PLANNING_ENGINEER: {
    ar: { purpose: "ضبط الخطة والقياس", focus: "WBS والجدول وEVM", boundary: "لا يثبت تكلفة فعلية أو يعتمد صرفًا" },
    en: { purpose: "Control planning and measurement", focus: "WBS, schedule, and EVM", boundary: "Does not post actual cost or approve disbursement" }, ur: { purpose: "منصوبہ بندی اور پیمائش کا کنٹرول", focus: "WBS، شیڈول اور EVM", boundary: "اصل لاگت درج نہیں کرتا اور ادائیگی کی منظوری نہیں دیتا" },
  },
  SITE_ENGINEER: {
    ar: { purpose: "تشغيل الموقع والإبلاغ", focus: "التقدم والتقارير والجودة وHSE وRFI/NCR", boundary: "لا يغير الخط الأساس أو ميزانية المشروع" },
    en: { purpose: "Run site operations and reporting", focus: "Progress, field reports, quality, HSE, RFIs, and NCRs", boundary: "Does not change baselines or project budget" }, ur: { purpose: "سائٹ آپریشنز اور رپورٹنگ چلائیں", focus: "پیش رفت، فیلڈ رپورٹس، معیار، HSE، RFIs اور NCRs", boundary: "بنیادی منصوبے یا پروجیکٹ بجٹ میں تبدیلی نہیں کرتا" },
  },
  QA_QC_MANAGER: {
    ar: { purpose: "ضبط الجودة وعدم المطابقة", focus: "الفحوصات وNCR", boundary: "لا يدير الميزانية أو التكلفة أو المشتريات" },
    en: { purpose: "Control quality and nonconformance", focus: "Inspections and NCRs", boundary: "Does not manage budget, cost, or procurement" }, ur: { purpose: "معیار اور عدم مطابقت کا کنٹرول", focus: "معائنے اور NCRs", boundary: "بجٹ، لاگت یا خریداری کا انتظام نہیں کرتا" },
  },
  HSE_MANAGER: {
    ar: { purpose: "إدارة الصحة والسلامة والبيئة", focus: "ملاحظات HSE وتقارير الموقع", boundary: "لا يدير الجودة التعاقدية أو الميزانية أو المشتريات" },
    en: { purpose: "Manage health, safety, and environment", focus: "HSE observations and field reports", boundary: "Does not manage contractual quality, budget, or procurement" }, ur: { purpose: "صحت، حفاظت اور ماحول کا انتظام کریں", focus: "HSE مشاہدات اور فیلڈ رپورٹس", boundary: "معاہدے کے معیار، بجٹ یا خریداری کا انتظام نہیں کرتا" },
  },
  PROCUREMENT_OFFICER: {
    ar: { purpose: "تنفيذ التوريد المحكوم", focus: "طلبات وأوامر الشراء", boundary: "لا يكون أمين المستودع لنطاقه نفسه" },
    en: { purpose: "Execute governed procurement", focus: "Purchase requests and orders", boundary: "Cannot also be warehouse custodian in the same scope" }, ur: { purpose: "طے شدہ خریداری پر عمل کریں", focus: "خریداری کی درخواستیں اور آرڈرز", boundary: "اسی دائرے میں گودام کا نگران نہیں ہو سکتا" },
  },
  WAREHOUSE_CUSTODIAN: {
    ar: { purpose: "حيازة وحركة المواد", focus: "الاستلام والصرف والرصيد المشتق", boundary: "لا ينفذ المشتريات للنطاق نفسه" },
    en: { purpose: "Hold and move materials", focus: "Receiving, issuing, and derived balance", boundary: "Cannot execute procurement in the same scope" }, ur: { purpose: "مادّے رکھیں اور منتقل کریں", focus: "وصولی، اجرا اور اخذ شدہ بقایا", boundary: "اسی دائرے میں خریداری پر عمل نہیں کر سکتا" },
  },
  FINANCE_MANAGER: {
    ar: { purpose: "الرقابة المالية والالتزامات", focus: "الميزانية والتكلفة والتدفق والالتزامات", boundary: "لا يشغل الرواتب أو يحمل دور المحاسب للنطاق نفسه" },
    en: { purpose: "Control finance and commitments", focus: "Budget, cost, cash flow, and commitments", boundary: "Does not run payroll or hold the accountant role in the same scope" }, ur: { purpose: "مالیات اور وعدوں کا کنٹرول", focus: "بجٹ، لاگت، نقد بہاؤ اور وعدے", boundary: "اسی دائرے میں تنخواہ نہیں چلاتا اور اکاؤنٹنٹ کا کردار نہیں رکھتا" },
  },
  ACCOUNTANT: {
    ar: { purpose: "إدخال وإسناد القيود", focus: "التكلفة الفعلية ومطابقة الفواتير والرواتب التشغيلية", boundary: "لا يعتمد الرواتب أو يتولى المالية للنطاق نفسه" },
    en: { purpose: "Post and match accounting records", focus: "Actual cost, invoice matching, and payroll runs", boundary: "Does not approve payroll or hold finance manager in the same scope" }, ur: { purpose: "اکاؤنٹنگ کے ریکارڈ درج اور ملائیں", focus: "اصل لاگت، انوائس کا ملان اور تنخواہ کے رن", boundary: "اسی دائرے میں تنخواہ کی منظوری نہیں دیتا اور فنانس مینیجر کا کردار نہیں رکھتا" },
  },
  HR_MANAGER: {
    ar: { purpose: "إدارة الفريق والرواتب الحساسة", focus: "الموظفون والحضور وKPI وهيكل الرواتب", boundary: "لا يحمل دور المحاسب للنطاق نفسه" },
    en: { purpose: "Manage workforce and sensitive payroll", focus: "Employees, attendance, KPIs, and payroll structure", boundary: "Cannot also be accountant in the same scope" }, ur: { purpose: "افرادی قوت اور حساس تنخواہ کا انتظام کریں", focus: "ملازمین، حاضری، KPIs اور تنخواہ کا ڈھانچہ", boundary: "اسی دائرے میں اکاؤنٹنٹ نہیں ہو سکتا" },
  },
  EXECUTIVE: {
    ar: { purpose: "رؤية المحفظة واتخاذ القرار", focus: "لوحة القيادة التنفيذية", boundary: "للاطلاع فقط؛ لا يكتب في أي مشروع" },
    en: { purpose: "See the portfolio and decide", focus: "The executive dashboard", boundary: "Read-only; writes to no project" }, ur: { purpose: "پورٹ فولیو دیکھیں اور فیصلہ کریں", focus: "ایگزیکٹو ڈیش بورڈ", boundary: "صرف پڑھنے کے لیے؛ کسی پروجیکٹ میں نہیں لکھتا" },
  },
  PMO_LEAD: {
    ar: { purpose: "ضبط المحفظة والاستثناءات", focus: "المحافظ والبرامج والمخاطر والقضايا والإجراءات والتصعيد", boundary: "لا يعدّل بيانات تشغيل المشروع (التكلفة والتخطيط والمشتريات)" },
    en: { purpose: "Govern the portfolio and its exceptions", focus: "Portfolios, programs, risks, issues, actions and escalation", boundary: "Does not edit a project's operating data (cost, planning, procurement)" }, ur: { purpose: "پورٹ فولیو اور اس کے استثنیات کا انتظام کریں", focus: "پورٹ فولیوز، پروگرامز، خطرات، مسائل، اقدامات اور اضافہ", boundary: "پروجیکٹ کا آپریٹنگ ڈیٹا (لاگت، منصوبہ بندی، خریداری) تبدیل نہیں کرتا" },
  },
  COST_CONTROLLER: {
    ar: { purpose: "ضبط التكلفة دون تحريك المال", focus: "الميزانية والتكلفة الفعلية والتدفق النقدي وEVM وتسوية عروض المناقصات", boundary: "لا يحمل الالتزامات ولا مطابقة الفواتير ولا إدخال العروض" },
    en: { purpose: "Control cost without moving money", focus: "Budget, actual cost, cash flow, EVM, and levelling of tender bids", boundary: "Holds neither commitments nor invoice matching nor bid entry" }, ur: { purpose: "رقم منتقل کیے بغیر لاگت کا کنٹرول", focus: "بجٹ، اصل لاگت، نقد بہاؤ، EVM اور ٹینڈر بولیوں کا موازنہ", boundary: "نہ وعدے رکھتا ہے، نہ انوائس کا ملان، نہ بولی کا اندراج" },
  },
  PROJECT_COORDINATOR: {
    ar: { purpose: "التنسيق بين الفرق والاستشاري", focus: "سجلات الموقع وطلبات المواد وطلبات المعلومات واعتماد التصميم (إغلاق الملاحظات وتسجيل ردود الاستشاري)", boundary: "لا يصدر المخططات ولا يسجّل ملاحظاتها؛ من يصدر لا يعتمد" },
    en: { purpose: "Coordinate between teams and the consultant", focus: "Site records, material requests, RFIs, and design approval (closing comments, recording consultant replies)", boundary: "Does not issue drawings or raise their comments; whoever issues does not approve" }, ur: { purpose: "ٹیموں اور مشیر کے درمیان رابطہ کاری کریں", focus: "سائٹ کے ریکارڈ، مواد کی درخواستیں، RFIs، اور ڈیزائن کی منظوری (تبصرے بند کرنا، مشیر کے جوابات درج کرنا)", boundary: "ڈرائنگ جاری نہیں کرتا اور ان پر تبصرے نہیں اٹھاتا؛ جو جاری کرے وہ منظوری نہیں دیتا" },
  },
  DESIGN_COORDINATOR_ARCHITECTURAL: {
    ar: { purpose: "إصدار المخططات المعمارية ومتابعتها", focus: "المخططات والمراجعات والإحالات والتقديمات في التخصصات المعمارية (عمارة وتصميم داخلي وتنسيق مواقع)", boundary: "لا يمسّ المخططات الإنشائية والكهروميكانيكية، ولا يعتمد ما يصدره" },
    en: { purpose: "Issue and chase architectural drawings", focus: "Drawings, revisions, transmittals and submittals in the architectural disciplines (architecture, interior, landscape)", boundary: "Does not touch structural or MEP drawings, and does not approve what they issue" }, ur: { purpose: "تعمیراتی ڈرائنگ جاری کریں اور ان کا پیچھا کریں", focus: "تعمیراتی شعبوں (آرکیٹیکچر، انٹیریئر، لینڈ سکیپ) میں ڈرائنگز، ریویژنز، ترسیلات اور جمع شدہ دستاویزات", boundary: "ساختی یا MEP ڈرائنگز کو نہیں چھوتا، اور جو وہ جاری کریں اس کی منظوری نہیں دیتا" },
  },
  DESIGN_COORDINATOR_TECHNICAL: {
    ar: { purpose: "إصدار المخططات الفنية ومتابعتها", focus: "المخططات والمراجعات والإحالات والتقديمات في التخصصات الفنية (إنشائي ومدني وميكانيكا وكهرباء وسباكة وإطفاء)", boundary: "لا يمسّ المخططات المعمارية، ولا يعتمد ما يصدره" },
    en: { purpose: "Issue and chase technical drawings", focus: "Drawings, revisions, transmittals and submittals in the technical disciplines (structural, civil, mechanical, electrical, plumbing, fire)", boundary: "Does not touch architectural drawings, and does not approve what they issue" }, ur: { purpose: "تکنیکی ڈرائنگ جاری کریں اور ان کا پیچھا کریں", focus: "تکنیکی شعبوں (ساختی، سول، میکینیکل، الیکٹریکل، پلمبنگ، فائر) میں ڈرائنگز، ریویژنز، ترسیلات اور جمع شدہ دستاویزات", boundary: "تعمیراتی ڈرائنگز کو نہیں چھوتا، اور جو وہ جاری کریں اس کی منظوری نہیں دیتا" },
  },
  CONTRACTS_MANAGER: {
    ar: { purpose: "إعداد المناقصات وإدارة الالتزامات", focus: "حزم المناقصة والدعوات وإدخال العروض والعقود والالتزامات", boundary: "لا يسوّي العروض ولا يرسّي المناقصة؛ من يُدخل العروض لا يرسّي" },
    en: { purpose: "Prepare tenders and manage commitments", focus: "Tender packages, invitations, bid entry, contracts, and commitments", boundary: "Neither levels bids nor awards the tender; whoever enters bids does not award" }, ur: { purpose: "ٹینڈر تیار کریں اور وعدوں کا انتظام کریں", focus: "ٹینڈر پیکیجز، دعوت نامے، بولیوں کا اندراج، معاہدے اور وعدے", boundary: "نہ بولیوں کا موازنہ کرتا ہے نہ ٹینڈر کا ٹھیکہ دیتا ہے؛ جو بولیاں درج کرے وہ ٹھیکہ نہیں دیتا" },
  },
} as const;

export function getOperationalRoleName(role: { code: string; name: string }, language: Language | boolean) {
  const localized = operationalRoleNames[role.code as keyof typeof operationalRoleNames];
  return localized ? localized[resolveLanguage(language)] : role.name;
}
