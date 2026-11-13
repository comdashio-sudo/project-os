import { pickLanguage, type Language } from "@/lib/language";

// Q-3: the PMC import report said its reasons as codes (PMC_MODEL_WEIGHTS_NOT_100 · A · …). These are the codes a weights table or a villa list can raise, said in the
// page's language; any other code is shown as it was.
const MESSAGES = {
  ar: {
    IMPORT_REQUIRED_COLUMN_MISSING: "عمود مطلوب غير موجود في الملف", IMPORT_REQUIRED_VALUE_MISSING: "قيمة مطلوبة فارغة", IMPORT_INVALID_NUMBER: "الرقم غير صالح",
    IMPORT_UNSUPPORTED_COLUMN: "عمود غير معروف", PMC_CLASSIFICATION_BLANK: "القسم أو النموذج أو النشاط فارغ", PMC_DUPLICATE_ACTIVITY: "النشاط مكرر في الملف",
    PMC_MODEL_WEIGHTS_NOT_100: "مجموع أوزان النموذج ليس 100%", PMC_MODEL_ACTIVITY_OMITTED: "نشاط محفوظ في المشروع غائب عن الملف (الملف يجب أن يكون الجدول كاملًا)",
    PMC_WEIGHTS_NEED_VILLAS: "لا عمود للنموذج والمشروع بلا فلل بعد: استورد قائمة الفلل أولًا، أو أضف عمود النموذج", PMC_STAGE_GROUP_CONFLICT: "البند الفرعي مسجل تحت قسم آخر",
    PMC_BLOCK_ZONE_CONFLICT: "البلوك مسجل تحت زون آخر",
  },
  en: {
    IMPORT_REQUIRED_COLUMN_MISSING: "A required column is missing from the file", IMPORT_REQUIRED_VALUE_MISSING: "A required value is empty", IMPORT_INVALID_NUMBER: "Not a valid number",
    IMPORT_UNSUPPORTED_COLUMN: "Unknown column", PMC_CLASSIFICATION_BLANK: "The section, model or activity is empty", PMC_DUPLICATE_ACTIVITY: "The activity appears twice in the file",
    PMC_MODEL_WEIGHTS_NOT_100: "The model's weights do not total 100%", PMC_MODEL_ACTIVITY_OMITTED: "An activity saved in the project is missing from the file (the file must be the whole table)",
    PMC_WEIGHTS_NEED_VILLAS: "No model column and the project has no villas yet: import the villa list first, or add a model column", PMC_STAGE_GROUP_CONFLICT: "The sub-item is recorded under another section",
    PMC_BLOCK_ZONE_CONFLICT: "The block is recorded under another zone",
  },
  ur: {
    IMPORT_REQUIRED_COLUMN_MISSING: "فائل میں لازمی کالم موجود نہیں", IMPORT_REQUIRED_VALUE_MISSING: "لازمی قدر خالی ہے", IMPORT_INVALID_NUMBER: "درست عدد نہیں",
    IMPORT_UNSUPPORTED_COLUMN: "نامعلوم کالم", PMC_CLASSIFICATION_BLANK: "سیکشن، ماڈل یا سرگرمی خالی ہے", PMC_DUPLICATE_ACTIVITY: "سرگرمی فائل میں دو بار ہے",
    PMC_MODEL_WEIGHTS_NOT_100: "ماڈل کے وزن کا مجموعہ 100% نہیں", PMC_MODEL_ACTIVITY_OMITTED: "منصوبے میں محفوظ ایک سرگرمی فائل میں نہیں (فائل پوری جدول ہونی چاہیے)",
    PMC_WEIGHTS_NEED_VILLAS: "ماڈل کا کالم نہیں اور منصوبے میں ابھی ولاز نہیں: پہلے ولاز کی فہرست درآمد کریں، یا ماڈل کا کالم شامل کریں", PMC_STAGE_GROUP_CONFLICT: "ذیلی آئٹم کسی اور سیکشن کے تحت درج ہے",
    PMC_BLOCK_ZONE_CONFLICT: "بلاک کسی اور زون کے تحت درج ہے",
  },
} as const;

// G-150 (D-30): a missing required column was named by its internal key (zoneCode, blockCode…). The keys of server/domain/pmcImport.ts FIELDS, named
// in the page's language. An unknown column keeps the file's own header as written: that is the person's word, not a key.
export const PMC_FIELD_LABELS = {
  ar: { consultant: "الاستشاري", contractor: "المقاول", csi: "رمز CSI", endDate: "تاريخ النهاية", notes: "ملاحظات", period: "الفترة", plannedPercent: "النسبة المخططة", requestCode: "رقم الطلب", requestedAt: "تاريخ الطلب", responseCode: "رمز الرد", startDate: "تاريخ البداية", sub: "البند الفرعي", unitNumbers: "أرقام الفلل", weight: "الوزن", zoneCode: "رمز المنطقة", zoneName: "اسم المنطقة", blockCode: "رمز البلوك", blockName: "اسم البلوك", unitNumber: "رقم الفيلا", modelCode: "النموذج", saleStatus: "حالة البيع", unitWeight: "وزن الفيلا", groupCode: "رمز المجموعة", groupName: "اسم المجموعة", stageCode: "رمز المرحلة", stageName: "اسم المرحلة", activityCode: "رمز النشاط", activityName: "اسم النشاط", weightPercent: "نسبة الوزن", wbsCode: "رمز WBS", status: "الحالة", verificationStatus: "حالة التحقق", changedAt: "تاريخ التغيير", engineerEmail: "بريد المهندس" },
  en: { consultant: "Consultant", contractor: "Contractor", csi: "CSI code", endDate: "End date", notes: "Notes", period: "Period", plannedPercent: "Planned percent", requestCode: "Request number", requestedAt: "Requested on", responseCode: "Response code", startDate: "Start date", sub: "Sub-item", unitNumbers: "Villa numbers", weight: "Weight", zoneCode: "Zone code", zoneName: "Zone name", blockCode: "Block code", blockName: "Block name", unitNumber: "Villa number", modelCode: "Model", saleStatus: "Sale status", unitWeight: "Villa weight", groupCode: "Group code", groupName: "Group name", stageCode: "Stage code", stageName: "Stage name", activityCode: "Activity code", activityName: "Activity name", weightPercent: "Weight percent", wbsCode: "WBS code", status: "Status", verificationStatus: "Verification status", changedAt: "Changed on", engineerEmail: "Engineer e-mail" },
  ur: { consultant: "کنسلٹنٹ", contractor: "ٹھیکیدار", csi: "CSI کوڈ", endDate: "اختتامی تاریخ", notes: "نوٹس", period: "مدت", plannedPercent: "منصوبہ بند فیصد", requestCode: "درخواست نمبر", requestedAt: "درخواست کی تاریخ", responseCode: "جواب کا کوڈ", startDate: "آغاز کی تاریخ", sub: "ذیلی آئٹم", unitNumbers: "ولا نمبرز", weight: "وزن", zoneCode: "زون کوڈ", zoneName: "زون کا نام", blockCode: "بلاک کوڈ", blockName: "بلاک کا نام", unitNumber: "ولا نمبر", modelCode: "ماڈل", saleStatus: "فروخت کی حالت", unitWeight: "ولا کا وزن", groupCode: "گروپ کوڈ", groupName: "گروپ کا نام", stageCode: "مرحلے کا کوڈ", stageName: "مرحلے کا نام", activityCode: "سرگرمی کوڈ", activityName: "سرگرمی کا نام", weightPercent: "وزن فیصد", wbsCode: "WBS کوڈ", status: "حالت", verificationStatus: "تصدیق کی حالت", changedAt: "تبدیلی کی تاریخ", engineerEmail: "انجینئر کی ای میل" },
} as const;

export function pmcImportReason(error: { code: string; field?: string; detail?: string }, language: Language): string {
  const messages = pickLanguage<Record<string, string>>(language, MESSAGES);
  const labels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const field = error.field && error.code !== "IMPORT_UNSUPPORTED_COLUMN" ? labels[error.field] ?? error.field : error.field;
  return [messages[error.code] ?? error.code, field, error.detail].filter(Boolean).join(" · ");
}
