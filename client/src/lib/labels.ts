import type { Language } from "./language";

// The Arabic names for the codes the database stores in English (statuses, stages, movement types, roles, permissions, products). A screen
// that prints a code straight from a row shows an Arabic reader "posted" or "TENANT_OWNER"; it prints `enumLabel(...)` instead. A code that has
// no entry falls back to its own words (never a blank), and labels.test.ts checks that every value of every enum in the schema has one.

const STATUS_AR: Record<string, string> = {
  counting: "قيد العدّ", // D-32: a stocktake being counted
  // generic states
  active: "نشط", inactive: "غير نشط", suspended: "موقوف", archived: "مؤرشف", invited: "مدعو", revoked: "مسحوب", ended: "منتهٍ", terminated: "مُنهى",
  draft: "مسودة", submitted: "مُرسل", under_review: "قيد المراجعة", for_review: "للمراجعة", reviewed: "تمت مراجعته", review: "مراجعة", approved: "معتمد", rejected: "مرفوض",
  accepted: "مقبول", answered: "تمت الإجابة", resolved: "تمت المعالجة", closed: "مغلق", cancelled: "ملغى", canceled: "ملغى", completed: "مكتمل", complete: "مكتمل", done: "منجز",
  started: "بدأ", blocked: "متعثر", in_progress: "قيد التنفيذ", not_started: "لم يبدأ", open: "مفتوح", assigned: "مُسنَد", remediation: "قيد المعالجة", verification: "قيد التحقق",
  corrective_action: "إجراء تصحيحي", under_investigation: "قيد التحقيق", waiting_customer: "بانتظار العميل", pending: "قيد الانتظار", sent: "مُرسل", failed: "فشل", skipped: "تم التخطي",
  confirmed: "مؤكد", refunded: "مسترد", refund: "استرداد", void: "ملغى", issued: "صادر", paid: "مدفوع", partially_issued: "مصروف جزئيًا", received: "مستلم", requested: "مطلوب",
  released: "مُفرَج عنه", committed: "ملتزم به", superseded: "حلّت محله نسخة أحدث", published: "منشور", trialing: "تجريبي", past_due: "متأخر السداد", grace_period: "فترة سماح",
  expired: "منتهي الصلاحية", posted: "مُرحَّل", planned: "مخطط", on_hold: "معلّق", hold: "معلّق", withdrawn: "مسحوب", implemented: "منفَّذ", mitigating: "قيد التخفيف",
  importing: "قيد الاستيراد", analyzing: "قيد المعالجة", validated: "تم التحقق", uploaded: "مرفوع", created: "أُنشئ", updated: "حُدّث", escalated: "مُصعَّد", pass: "مطابق", fail: "غير مطابق", conditional: "مطابق بشروط",
  // integrations (work order 12)
  delivered: "تم التسليم", running: "قيد التشغيل", ok: "ناجح", partial: "جزئي",
  // tenders
  awarded: "تمت الترسية", declined: "اعتذر", disqualified: "مستبعد", scope_gap: "ثغرة نطاق", exclusion: "استثناء", correction: "تصحيح", discount: "خصم",
  // design coordination
  registered: "مُسجَّل", responded: "تم الرد", acknowledged: "تم الاستلام", replied: "تم الرد عليه", minor: "بسيط", major: "جوهري", architectural: "معماري", interior: "تصميم داخلي", landscape: "تنسيق مواقع", structural: "إنشائي", civil: "مدني", mechanical: "ميكانيكا", electrical: "كهرباء", plumbing: "سباكة", fire_fighting: "مكافحة حريق", other: "أخرى", outgoing: "صادرة", incoming: "واردة",
  absent: "غائب", present: "حاضر", leave: "إجازة", error: "خطأ", warning: "تحذير", none: "لا شيء",
  // work order 22: the site's and the consultant's states of a cell
  inspection_requested: "طُلب الفحص", qc_approved: "اعتمد QC", not_received: "غير مستلَم", code_a: "رمز A", code_b: "رمز B", code_c: "رمز C", code_d: "رمز D",
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

// Urdu labels. Every key of the Arabic map has an Urdu label too (labels.test.tsx checks it), so Urdu never falls back to an English code.
const STATUS_UR: Record<string, string> = {
  counting: "گنتی جاری ہے", // D-32: a stocktake being counted
  "delivered": "فراہم کیا گیا", "running": "جاری", "ok": "ٹھیک", "partial": "جزوی",
  "active": "فعال", "inactive": "غیر فعال", "suspended": "معطل", "archived": "محفوظ شدہ",
  "invited": "مدعو", "revoked": "منسوخ", "ended": "ختم شدہ", "terminated": "ختم کیا گیا",
  "draft": "مسودہ", "submitted": "جمع کرایا گیا", "under_review": "زیرِ جائزہ", "for_review": "جائزے کے لیے",
  "reviewed": "جائزہ لیا گیا", "review": "جائزہ", "approved": "منظور شدہ", "rejected": "مسترد",
  "accepted": "قبول شدہ", "answered": "جواب دیا گیا", "resolved": "حل شدہ", "closed": "بند",
  "cancelled": "منسوخ", "canceled": "منسوخ", "completed": "مکمل", "complete": "مکمل",
  "done": "ہو گیا", "started": "شروع ہوا", "blocked": "رکا ہوا", "in_progress": "جاری",
  "not_started": "شروع نہیں ہوا", "open": "کھلا", "assigned": "تفویض کیا گیا", "remediation": "اصلاح جاری",
  "verification": "تصدیق جاری", "corrective_action": "اصلاحی اقدام", "under_investigation": "تحقیقات جاری", "waiting_customer": "گاہک کے جواب کا منتظر",
  "pending": "زیرِ التوا", "sent": "بھیجا گیا", "failed": "ناکام", "skipped": "چھوڑ دیا گیا",
  "confirmed": "تصدیق شدہ", "refunded": "واپس کیا گیا", "refund": "واپسی", "void": "کالعدم",
  "issued": "جاری شدہ", "paid": "ادا شدہ", "partially_issued": "جزوی طور پر جاری", "received": "موصول",
  "requested": "درخواست کردہ", "released": "جاری کیا گیا", "committed": "وعدہ شدہ", "superseded": "نئے ورژن نے بدل دیا",
  "published": "شائع شدہ", "trialing": "آزمائشی", "past_due": "ادائیگی میں تاخیر", "grace_period": "مہلت کی مدت",
  "expired": "مدت ختم", "posted": "درج شدہ", "planned": "منصوبہ بند", "on_hold": "روکا ہوا",
  "hold": "روکا ہوا", "withdrawn": "واپس لیا گیا", "implemented": "نافذ شدہ", "mitigating": "کم کیا جا رہا ہے",
  "importing": "درآمد جاری", "analyzing": "تجزیہ جاری", "validated": "تصدیق ہو گئی", "uploaded": "اپ لوڈ شدہ",
  "created": "بنایا گیا", "updated": "اپ ڈیٹ ہوا", "escalated": "اوپر بھیجا گیا", "pass": "مطابق",
  "fail": "غیر مطابق", "conditional": "شرائط کے ساتھ مطابق", "awarded": "ٹھیکہ دیا گیا", "declined": "معذرت",
  "disqualified": "نااہل", "scope_gap": "دائرۂ کار میں خلا", "exclusion": "استثنا", "correction": "درستگی",
  "discount": "رعایت", "registered": "رجسٹر شدہ", "responded": "جواب دیا گیا", "acknowledged": "وصولی کی تصدیق",
  "replied": "جواب دیا گیا", "minor": "معمولی", "major": "بڑا", "architectural": "تعمیراتی",
  "interior": "اندرونی ڈیزائن", "landscape": "لینڈ سکیپ", "structural": "ساختی", "civil": "سول",
  "mechanical": "میکانیکل", "electrical": "برقی", "plumbing": "پلمبنگ", "fire_fighting": "فائر فائٹنگ",
  "other": "دیگر", "outgoing": "روانہ", "incoming": "موصول", "absent": "غیر حاضر",
  "present": "حاضر", "leave": "رخصت", "error": "خرابی", "warning": "انتباہ",
  "none": "کوئی نہیں", "opportunity": "موقع", "pre_award": "ٹھیکہ دینے سے پہلے", "tender": "ٹینڈر",
  "award": "ٹھیکہ", "mobilization": "متحرک کرنا اور سائٹ کی تیاری", "planning": "منصوبہ بندی", "design": "ڈیزائن",
  "procurement": "خریداری", "execution": "عمل درآمد", "commissioning": "کمیشننگ اور آزمائشی آپریشن", "handover": "حوالگی",
  "closeout": "اختتام", "post_project_review": "پروجیکٹ کے بعد کا جائزہ", "receipt": "وصولی", "issue": "اجرا",
  "adjustment": "ایڈجسٹمنٹ", "transfer": "منتقلی", "warehouse_stock": "گودام کو", "direct_to_site": "براہِ راست سائٹ پر سپلائی",
  "green": "درست", "amber": "توجہ درکار", "red": "خطرناک", "critical": "خطرناک",
  "high": "بلند", "medium": "درمیانہ", "low": "کم", "urgent": "فوری",
  "normal": "معمول", "not_assessed": "جانچا نہیں گیا", "secondment": "عارضی تبادلہ", "action": "اقدام",
  "activity": "سرگرمی", "decision": "فیصلہ", "field_report": "فیلڈ رپورٹ", "material_request": "مواد کی درخواست",
  "ncr": "عدم مطابقت (NCR)", "quality_inspection": "معیار کا معائنہ", "rfi": "معلومات کی درخواست (RFI)", "risk": "خطرہ",
  // work order 22: the site's and the consultant's states of a cell
  inspection_requested: "معائنے کی درخواست", qc_approved: "QC منظور", not_received: "موصول نہیں", code_a: "کوڈ A", code_b: "کوڈ B", code_c: "کوڈ C", code_d: "کوڈ D",
};
const PERMISSION_UR: Record<string, string> = {
  "executive.read": "سینئر انتظامیہ کا ڈیش بورڈ", "pmo.read": "پی ایم او ڈیش بورڈ دیکھیں (2)", "pmo.write": "پی ایم او ڈیش بورڈ میں ترمیم", "project.read": "پروجیکٹ دیکھیں (3)",
  "project.design.manage": "ڈیزائن رجسٹر، حوالہ جات، ڈیزائن نوٹس اور جمع کرائی گئی دستاویزات کا انتظام", "project.design.architectural": "تعمیراتی شعبوں کا اختیار (فن تعمیر، اندرونی ڈیزائن، لینڈ سکیپ)", "project.design.technical": "تکنیکی شعبوں کا اختیار (ساختی، سول، میکانیکل، برقی، پلمبنگ، فائر فائٹنگ)", "project.design.approve": "عمل درآمد کے لیے ڈیزائن کی منظوری اور مشیر کے جوابات درج کرنا",
  "project.tender.manage": "ٹینڈر پیکیج اور دعوت نامے منظم کریں", "project.tender.bids": "بولیاں درج کرنا اور ان میں ترمیم", "project.tender.level": "بولیوں کا موازنہ اور ہم وار کرنا", "project.tender.award": "ٹینڈر کا ٹھیکہ دینا",
  "project.create": "پروجیکٹ بنانا", "payment.prepare": "ادائیگیاں تیار کرنا", "payment.approve": "ادائیگیوں کی منظوری", "schedule.write": "شیڈول اور ماسٹر پلان لکھنا",
  "project.write": "پروجیکٹ کا ڈیٹا تبدیل کرنا", "project.manage": "پروجیکٹ کا انتظام", "tenant.manage": "کمپنی کا انتظام", "project.attendance.manage": "حاضری کا انتظام",
  "project.budget.manage": "بجٹ کا انتظام", "project.cashflow.read": "کیش فلو دیکھنا", "project.commitment.manage": "وعدوں کا انتظام", "project.cost.enter": "اصل لاگت درج کرنا",
  "project.evm.manage": "اکتسابی قدر (EVM) کا انتظام", "project.field.manage": "فیلڈ ڈیٹا انٹری کا انتظام", "project.hr.manage": "ملازمین کا انتظام", "project.hr.sensitive.read": "ملازمین کا حساس ڈیٹا پڑھنا",
  "project.hse.manage": "صحت، حفاظت اور ماحول کا انتظام", "project.inventory.manage": "اسٹاک کا انتظام", "project.invoice.match": "انوائسز کا ملان", "project.material.request": "مواد کی درخواست",
  "project.ncr.manage": "عدم مطابقت کے معاملات کا انتظام", "project.payroll.approve": "تنخواہوں کی منظوری", "project.payroll.run": "تنخواہوں کا عمل چلانا", "project.payroll.sensitive.read": "حساس تنخواہیں پڑھنا",
  "project.payroll.structure": "تنخواہوں کے ڈھانچے طے کرنا", "project.performance.manage": "کارکردگی کے اشاریوں کا انتظام", "project.performance.read_own": "اپنے کارکردگی کے اشاریے پڑھنا", "project.pmc.manage": "پروجیکٹ کنٹرول (PMC) کا انتظام",
  "project.pmc.read": "پروجیکٹ کنٹرول (PMC) دیکھنا", "project.pmc.update": "پروجیکٹ کنٹرول (PMC) کی تازہ کاری", "project.procurement.manage": "خریداری کا انتظام", "project.progress.manage": "کام کی پیش رفت کا انتظام",
  "project.quality.manage": "معیار کا انتظام", "project.qc.receive": "کیو سی وصولی", "project.rfi.manage": "معلومات کی درخواستوں کا انتظام", "project.team.invite": "پروجیکٹ میں مدعو کرنا", "project.schedule.manage": "شیڈول کا انتظام", "project.settings.labour": "مزدوری کی لاگت کی ترتیبات",
  "project.wbs.manage": "ورک بریک ڈاؤن اسٹرکچر (WBS) کا انتظام",
};
const PRODUCT_UR: Record<string, string> = {
  "EXECUTIVE": "انتظامی سطح", "PMO": "پروجیکٹ مینجمنٹ آفس", "PROJECT": "پروجیکٹ مینجمنٹ",
};
const humanize = (code: string) => code.replace(/[_-]+/g, " ").trim();

/** The label of a status, stage or type code, in the page's language. A code with no entry shows its own words, never nothing. */
export function enumLabel(code: string | null | undefined, language: Language): string {
  if (code === null || code === undefined || code === "") return "—";
  const key = String(code).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (language === "ar" && key in STATUS_AR) return STATUS_AR[key];
  if (language === "ur" && key in STATUS_UR) return STATUS_UR[key];
  return humanize(String(code));
}

/** True when a code has an Arabic label (used by the test that every schema enum value is covered). */
export const hasArabicLabel = (code: string) => code.trim().toLowerCase().replace(/[\s-]+/g, "_") in STATUS_AR;
/** True when a code has an Urdu label (the test that every schema enum value is covered, in Urdu too). */
export const hasUrduLabel = (code: string) => code.trim().toLowerCase().replace(/[\s-]+/g, "_") in STATUS_UR;

const PERMISSION_AR: Record<string, string> = {
  "executive.read": "لوحة الإدارة العليا", "pmo.read": "عرض مكتب إدارة المشاريع (2)", "pmo.write": "تحرير مكتب إدارة المشاريع", "project.read": "عرض المشروع (3)",
  "project.design.manage": "إدارة سجل المخططات والإحالات وملاحظات التصميم والتقديمات", "project.design.architectural": "سلطة التخصصات المعمارية (عمارة وتصميم داخلي وتنسيق مواقع)", "project.design.technical": "سلطة التخصصات الفنية (إنشائي ومدني وميكانيكا وكهرباء وسباكة وإطفاء)", "project.design.approve": "اعتماد المخططات للتنفيذ وتسجيل ردود الاستشاري", 
  "project.tender.manage": "إدارة حزم المناقصات والدعوات", "project.tender.bids": "إدخال العروض وتعديلها", "project.tender.level": "تسوية العروض ومقارنتها", "project.tender.award": "ترسية المناقصة", "project.create": "إنشاء المشاريع", "payment.prepare": "إعداد الدفعات", "payment.approve": "اعتماد الدفعات", "schedule.write": "كتابة الجدول الزمني والخطة الرئيسية", 
  "project.write": "تحرير بيانات المشروع", "project.manage": "إدارة المشروع", "tenant.manage": "إدارة الشركة", "project.attendance.manage": "إدارة الحضور",
  "project.budget.manage": "إدارة الميزانيات", "project.cashflow.read": "عرض التدفق النقدي", "project.commitment.manage": "إدارة الالتزامات", "project.cost.enter": "إدخال التكلفة الفعلية",
  "project.evm.manage": "إدارة القيمة المكتسبة (EVM)", "project.field.manage": "إدارة الإدخال الميداني", "project.hr.manage": "إدارة الموظفين", "project.hr.sensitive.read": "قراءة بيانات الموظفين الحساسة",
  "project.hse.manage": "إدارة الصحة والسلامة والبيئة", "project.inventory.manage": "إدارة المخزون", "project.invoice.match": "مطابقة الفواتير", "project.material.request": "طلب المواد",
  "project.ncr.manage": "إدارة حالات عدم المطابقة", "project.payroll.approve": "اعتماد الرواتب", "project.payroll.run": "تشغيل دورة الرواتب", "project.payroll.sensitive.read": "قراءة الرواتب الحساسة",
  "project.payroll.structure": "ضبط هياكل الرواتب", "project.performance.manage": "إدارة مؤشرات الأداء", "project.performance.read_own": "قراءة مؤشرات أدائي", "project.pmc.manage": "إدارة ضبط المشروع (PMC)",
  "project.pmc.read": "عرض ضبط المشروع (PMC)", "project.pmc.update": "تحديث ضبط المشروع (PMC)", "project.procurement.manage": "إدارة المشتريات", "project.progress.manage": "إدارة تقدم الأعمال",
  "project.quality.manage": "إدارة الجودة", "project.qc.receive": "استلام QC", "project.rfi.manage": "إدارة طلبات المعلومات", "project.team.invite": "الدعوة إلى المشروع", "project.schedule.manage": "إدارة الجدول الزمني", "project.settings.labour": "ضبط إعدادات تكلفة العمالة",
  "project.wbs.manage": "إدارة هيكل تجزئة العمل (WBS)",
};
/** A permission's name in the page's language. The raw code is never its text: a screen keeps it in a title attribute (the administrator can still search it). */
export const permissionLabel = (code: string, fallbackName: string, language: Language) => (language === "ar" && PERMISSION_AR[code]) || (language === "ur" && PERMISSION_UR[code]) || fallbackName || code;
export const hasArabicPermission = (code: string) => code in PERMISSION_AR;
export const hasUrduPermission = (code: string) => code in PERMISSION_UR;

/** One line of meaning under a permission's name, for the two permissions whose scope the owner has defined. Arabic and English, as the owner worded them. */
const PERMISSION_NOTE: Record<string, { ar: string; en: string; ur: string }> = {
  "tenant.manage": { ar: "المستخدمون والإعدادات والاشتراك في الشركة. لمدير النظام في الشركة فقط.", ur: "کمپنی کے صارفین، ترتیبات اور سبسکرپشن۔ صرف کمپنی کے ایڈمن کے لیے۔", en: "The company's users, settings and subscription. For the company's system administrator only." },
  "executive.read": { ar: "للاطلاع فقط. للمدير العام ولرئيس إدارة المشاريع.", ur: "صرف دیکھنے کے لیے۔ جنرل مینیجر اور پروجیکٹ مینجمنٹ کے سربراہ کے لیے۔", en: "View only. For the general manager and the head of project management." },
};
/** The meaning of a permission whose scope is defined here, or undefined for every other permission. */
export const permissionNote = (code: string, language: Language) => PERMISSION_NOTE[code]?.[language];

const PRODUCT_AR: Record<string, string> = { EXECUTIVE: "المستوى التنفيذي", PMO: "مكتب إدارة المشاريع", PROJECT: "إدارة المشروع" };
export const productLabel = (code: string, language: Language) => (language === "ar" && PRODUCT_AR[code]) || (language === "ur" && PRODUCT_UR[code]) || code;
