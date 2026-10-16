// The Arabic names for the codes the database stores in English (statuses, stages, movement types, roles, permissions, products). A screen
// that prints a code straight from a row shows an Arabic reader "posted" or "TENANT_OWNER"; it prints `enumLabel(...)` instead. A code that has
// no entry falls back to its own words (never a blank), and labels.test.ts checks that every value of every enum in the schema has one.

const STATUS_AR: Record<string, string> = {
  // generic states
  active: "نشط", inactive: "غير نشط", suspended: "موقوف", archived: "مؤرشف", invited: "مدعو", revoked: "مسحوب", ended: "منتهٍ", terminated: "مُنهى",
  draft: "مسودة", submitted: "مُرسل", under_review: "قيد المراجعة", for_review: "للمراجعة", reviewed: "تمت مراجعته", review: "مراجعة", approved: "معتمد", rejected: "مرفوض",
  accepted: "مقبول", answered: "تمت الإجابة", resolved: "تمت المعالجة", closed: "مغلق", cancelled: "ملغى", canceled: "ملغى", completed: "مكتمل", complete: "مكتمل", done: "منجز",
  started: "بدأ", blocked: "معطّل", in_progress: "قيد التنفيذ", not_started: "لم يبدأ", open: "مفتوح", assigned: "مُسنَد", remediation: "قيد المعالجة", verification: "قيد التحقق",
  corrective_action: "إجراء تصحيحي", under_investigation: "قيد التحقيق", waiting_customer: "بانتظار العميل", pending: "قيد الانتظار", sent: "مُرسل", failed: "فشل", skipped: "تم التخطي",
  confirmed: "مؤكد", refunded: "مسترد", refund: "استرداد", void: "ملغى", issued: "صادر", paid: "مدفوع", partially_issued: "مصروف جزئيًا", received: "مستلم", requested: "مطلوب",
  released: "مُفرَج عنه", committed: "ملتزم به", superseded: "حلّت محله نسخة أحدث", published: "منشور", trialing: "تجريبي", past_due: "متأخر السداد", grace_period: "فترة سماح",
  expired: "منتهي الصلاحية", posted: "مُرحَّل", planned: "مخطط", on_hold: "معلّق", hold: "معلّق", withdrawn: "مسحوب", implemented: "منفَّذ", mitigating: "قيد التخفيف",
  importing: "قيد الاستيراد", validated: "تم التحقق", uploaded: "مرفوع", created: "أُنشئ", updated: "حُدّث", escalated: "مُصعَّد", pass: "مطابق", fail: "غير مطابق", conditional: "مطابق بشروط",
  absent: "غائب", present: "حاضر", leave: "إجازة", error: "خطأ", warning: "تحذير", none: "لا شيء",
  // project lifecycle stages
  opportunity: "فرصة", pre_award: "ما قبل الترسية", tender: "المناقصة", award: "الترسية", mobilization: "التعبئة وتجهيز الموقع", planning: "التخطيط", design: "التصميم",
  procurement: "المشتريات", execution: "التنفيذ", commissioning: "الاختبار والتشغيل التجريبي", handover: "التسليم", closeout: "الإغلاق", post_project_review: "مراجعة ما بعد المشروع",
  // stock movements and receipt modes
  receipt: "استلام", issue: "صرف", adjustment: "تسوية", transfer: "نقل", warehouse_stock: "إلى المستودع", direct_to_site: "توريد مباشر للموقع",
  // health and severity
  green: "سليم", amber: "يحتاج انتباهًا", red: "حرج", critical: "حرج", high: "مرتفع", medium: "متوسط", low: "منخفض", urgent: "عاجل", normal: "عادي",
  not_assessed: "غير مقيَّم", secondment: "إعارة",
  // where a performance indicator comes from
  action: "إجراء", activity: "نشاط", decision: "قرار", field_report: "تقرير ميداني", material_request: "طلب مواد", ncr: "عدم مطابقة", quality_inspection: "فحص جودة", rfi: "طلب معلومات", risk: "مخاطرة",
};

const humanize = (code: string) => code.replace(/[_-]+/g, " ").trim();

/** The label of a status, stage or type code, in the page's language. A code with no entry shows its own words, never nothing. */
export function enumLabel(code: string | null | undefined, isArabic: boolean): string {
  if (code === null || code === undefined || code === "") return "—";
  const key = String(code).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isArabic && key in STATUS_AR) return STATUS_AR[key];
  return humanize(String(code));
}

/** True when a code has an Arabic label (used by the test that every schema enum value is covered). */
export const hasArabicLabel = (code: string) => code.trim().toLowerCase().replace(/[\s-]+/g, "_") in STATUS_AR;

const PERMISSION_AR: Record<string, string> = {
  "executive.read": "عرض المستوى التنفيذي (1)", "pmo.read": "عرض مكتب إدارة المشاريع (2)", "pmo.write": "تحرير مكتب إدارة المشاريع", "project.read": "عرض المشروع (3)",
  "project.write": "تحرير بيانات المشروع", "project.manage": "إدارة المشروع", "tenant.manage": "إدارة الشركة", "project.attendance.manage": "إدارة الحضور",
  "project.budget.manage": "إدارة الميزانيات", "project.cashflow.read": "عرض التدفق النقدي", "project.commitment.manage": "إدارة الالتزامات", "project.cost.enter": "إدخال التكلفة الفعلية",
  "project.evm.manage": "إدارة القيمة المكتسبة (EVM)", "project.field.manage": "إدارة الإدخال الميداني", "project.hr.manage": "إدارة الموظفين", "project.hr.sensitive.read": "قراءة بيانات الموظفين الحساسة",
  "project.hse.manage": "إدارة الصحة والسلامة والبيئة", "project.inventory.manage": "إدارة المخزون", "project.invoice.match": "مطابقة الفواتير", "project.material.request": "طلب المواد",
  "project.ncr.manage": "إدارة حالات عدم المطابقة", "project.payroll.approve": "اعتماد الرواتب", "project.payroll.run": "تشغيل دورة الرواتب", "project.payroll.sensitive.read": "قراءة الرواتب الحساسة",
  "project.payroll.structure": "ضبط هياكل الرواتب", "project.performance.manage": "إدارة مؤشرات الأداء", "project.performance.read_own": "قراءة مؤشرات أدائي", "project.pmc.manage": "إدارة متابعة التنفيذ (PMC)",
  "project.pmc.read": "عرض متابعة التنفيذ (PMC)", "project.pmc.update": "تحديث متابعة التنفيذ (PMC)", "project.procurement.manage": "إدارة المشتريات", "project.progress.manage": "إدارة تقدم الأعمال",
  "project.quality.manage": "إدارة الجودة", "project.rfi.manage": "إدارة طلبات المعلومات", "project.schedule.manage": "إدارة الجدول الزمني", "project.settings.labour": "ضبط إعدادات تكلفة العمالة",
  "project.wbs.manage": "إدارة هيكل تجزئة العمل (WBS)",
};
/** A permission's Arabic name; the code itself is shown beside it, small, because it is what an administrator searches for. */
export const permissionLabel = (code: string, fallbackName: string, isArabic: boolean) => (isArabic && PERMISSION_AR[code]) || fallbackName || code;
export const hasArabicPermission = (code: string) => code in PERMISSION_AR;

const PRODUCT_AR: Record<string, string> = { EXECUTIVE: "المستوى التنفيذي", PMO: "مكتب إدارة المشاريع", PROJECT: "إدارة المشروع" };
export const productLabel = (code: string, isArabic: boolean) => (isArabic && PRODUCT_AR[code]) || code;
