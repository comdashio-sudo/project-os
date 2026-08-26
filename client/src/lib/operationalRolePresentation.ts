const operationalRoleNames = {
  WAREHOUSE_CUSTODIAN: { ar: "أمين المستودع", en: "Warehouse Custodian" },
  PROCUREMENT_OFFICER: { ar: "مسؤول المشتريات والتوريد", en: "Procurement Officer" },
  FINANCE_MANAGER: { ar: "المدير المالي", en: "Finance Manager" },
  ACCOUNTANT: { ar: "المحاسب", en: "Accountant" },
  HR_MANAGER: { ar: "مدير الموارد البشرية", en: "HR Manager" },
  PLANNING_ENGINEER: { ar: "مهندس التخطيط", en: "Planning Engineer" },
  SITE_ENGINEER: { ar: "مهندس الموقع", en: "Site Engineer" },
  QA_QC_MANAGER: { ar: "مدير الجودة وضبط الجودة", en: "QA/QC Manager" },
  HSE_MANAGER: { ar: "مدير الصحة والسلامة والبيئة", en: "HSE Manager" },
  PROJECT_MANAGER: { ar: "مدير المشروع", en: "Project Manager" },
} as const;

export const operationalRoleProfiles = {
  PROJECT_MANAGER: {
    ar: { purpose: "قيادة المشروع والقرارات اليومية", focus: "الجدول والتكلفة والتقدم والجودة والمخاطر", boundary: "لا يصدر مشتريات أو يدير المستودع أو يعتمد الرواتب" },
    en: { purpose: "Lead the project and daily decisions", focus: "Schedule, cost, progress, quality, and risks", boundary: "Does not execute procurement, warehouse custody, or payroll approval" },
  },
  PLANNING_ENGINEER: {
    ar: { purpose: "ضبط الخطة والقياس", focus: "WBS والجدول وEVM", boundary: "لا يثبت تكلفة فعلية أو يعتمد صرفًا" },
    en: { purpose: "Control planning and measurement", focus: "WBS, schedule, and EVM", boundary: "Does not post actual cost or approve disbursement" },
  },
  SITE_ENGINEER: {
    ar: { purpose: "تشغيل الموقع والإبلاغ", focus: "التقدم والتقارير والجودة وHSE وRFI/NCR", boundary: "لا يغير الخط الأساس أو ميزانية المشروع" },
    en: { purpose: "Run site operations and reporting", focus: "Progress, field reports, quality, HSE, RFIs, and NCRs", boundary: "Does not change baselines or project budget" },
  },
  QA_QC_MANAGER: {
    ar: { purpose: "ضبط الجودة وعدم المطابقة", focus: "الفحوصات وNCR", boundary: "لا يدير الميزانية أو التكلفة أو المشتريات" },
    en: { purpose: "Control quality and nonconformance", focus: "Inspections and NCRs", boundary: "Does not manage budget, cost, or procurement" },
  },
  HSE_MANAGER: {
    ar: { purpose: "إدارة الصحة والسلامة والبيئة", focus: "ملاحظات HSE وتقارير الموقع", boundary: "لا يدير الجودة التعاقدية أو الميزانية أو المشتريات" },
    en: { purpose: "Manage health, safety, and environment", focus: "HSE observations and field reports", boundary: "Does not manage contractual quality, budget, or procurement" },
  },
  PROCUREMENT_OFFICER: {
    ar: { purpose: "تنفيذ التوريد المحكوم", focus: "طلبات وأوامر الشراء", boundary: "لا يكون أمين المستودع لنطاقه نفسه" },
    en: { purpose: "Execute governed procurement", focus: "Purchase requests and orders", boundary: "Cannot also be warehouse custodian in the same scope" },
  },
  WAREHOUSE_CUSTODIAN: {
    ar: { purpose: "حيازة وحركة المواد", focus: "الاستلام والصرف والرصيد المشتق", boundary: "لا ينفذ المشتريات للنطاق نفسه" },
    en: { purpose: "Hold and move materials", focus: "Receiving, issuing, and derived balance", boundary: "Cannot execute procurement in the same scope" },
  },
  FINANCE_MANAGER: {
    ar: { purpose: "الرقابة المالية والالتزامات", focus: "الميزانية والتكلفة والتدفق والالتزامات", boundary: "لا يشغل الرواتب أو يحمل دور المحاسب للنطاق نفسه" },
    en: { purpose: "Control finance and commitments", focus: "Budget, cost, cash flow, and commitments", boundary: "Does not run payroll or hold the accountant role in the same scope" },
  },
  ACCOUNTANT: {
    ar: { purpose: "إدخال وإسناد القيود", focus: "التكلفة الفعلية ومطابقة الفواتير والرواتب التشغيلية", boundary: "لا يعتمد الرواتب أو يتولى المالية للنطاق نفسه" },
    en: { purpose: "Post and match accounting records", focus: "Actual cost, invoice matching, and payroll runs", boundary: "Does not approve payroll or hold finance manager in the same scope" },
  },
  HR_MANAGER: {
    ar: { purpose: "إدارة الفريق والرواتب الحساسة", focus: "الموظفون والحضور وKPI وهيكل الرواتب", boundary: "لا يحمل دور المحاسب للنطاق نفسه" },
    en: { purpose: "Manage workforce and sensitive payroll", focus: "Employees, attendance, KPIs, and payroll structure", boundary: "Cannot also be accountant in the same scope" },
  },
} as const;

export function getOperationalRoleName(role: { code: string; name: string }, isArabic: boolean) {
  const localized = operationalRoleNames[role.code as keyof typeof operationalRoleNames];
  return localized ? (isArabic ? localized.ar : localized.en) : role.name;
}
