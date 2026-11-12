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

export function pmcImportReason(error: { code: string; field?: string; detail?: string }, language: Language): string {
  const messages = pickLanguage<Record<string, string>>(language, MESSAGES);
  return [messages[error.code] ?? error.code, error.field, error.detail].filter(Boolean).join(" · ");
}
