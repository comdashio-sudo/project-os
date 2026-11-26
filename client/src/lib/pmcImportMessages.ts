import { pickLanguage, type Language } from "@/lib/language";

// Q-3: the PMC import report said its reasons as codes (PMC_MODEL_WEIGHTS_NOT_100 · A · …). These are the codes a weights table or a villa list can raise, said in the
// page's language; any other code is shown as it was.
const MESSAGES = {
  ar: {
    // Q-31: the file-level reasons that showed as codes, and the two new ones (a sheet or a column the server will not guess)
    IMPORT_SHEET_AMBIGUOUS: "أكثر من ورقة في الملف فيها الأعمدة المطلوبة: احذف الورقة الزائدة أو انقل الجدول إلى ورقة واحدة. الأوراق", IMPORT_COLUMN_AMBIGUOUS: "عمودان في الملف يحملان المعنى نفسه: أبقِ واحدًا أو غيّر اسم الآخر. الأعمدة",
    IMPORT_EMPTY_WORKBOOK: "الملف بلا ورقة ظاهرة فيها بيانات", IMPORT_TOO_MANY_COLUMNS: "أعمدة الجدول أكثر من 20 عمودًا مملوءًا", IMPORT_TOO_MANY_ROWS: "صفوف الجدول أكثر من الحد المسموح",
    IMPORT_WORKBOOK_INVALID: "تعذّرت قراءة الملف: احفظه من جديد بصيغة xlsx أو csv", IMPORT_FILE_TOO_LARGE: "الملف أكبر من الحد المسموح", IMPORT_MACRO_WORKBOOK_REJECTED: "الملف يحوي وحدات ماكرو: احفظه بصيغة xlsx عادية",
    PMC_ACTIVITY_NOT_FOUND: "رمز النشاط غير موجود في كتالوج المشروع",
    IMPORT_DUPLICATE_FILE_KEY: "الرقم مكرر داخل الملف", PMC_UNIT_MODEL_CHANGE_BLOCKED: "لا يُغيَّر نموذج فيلا مسجلة من الاستيراد", PMC_UNIT_BLOCK_CHANGE_BLOCKED: "لا يُغيَّر بلوك فيلا مسجلة من الاستيراد", PMC_UNIT_NOT_FOUND: "الفيلا غير موجودة في المشروع",
    FOUND_COLUMNS: "الأعمدة الموجودة في الملف",
    IMPORT_REQUIRED_COLUMN_MISSING: "عمود مطلوب غير موجود في الملف", IMPORT_REQUIRED_VALUE_MISSING: "قيمة مطلوبة فارغة", IMPORT_INVALID_NUMBER: "الرقم غير صالح", IMPORT_EDIT_INVALID: "التصحيح لصف غير موجود في الجدول أو لحقل لا يُقرأ من أي عمود", IMPORT_FORMULA_ERROR: "خلية الوزن فيها خطأ صيغة من Excel: صحّح الصيغة أو اكتب الوزن رقمًا",
    IMPORT_UNSUPPORTED_COLUMN: "عمود غير معروف", PMC_CLASSIFICATION_BLANK: "القسم أو النموذج أو النشاط فارغ", PMC_DUPLICATE_ACTIVITY: "النشاط مكرر في الملف",
    PMC_MODEL_WEIGHTS_NOT_100: "مجموع أوزان النموذج ليس 100%", PMC_MODEL_ACTIVITY_OMITTED: "نشاط محفوظ في المشروع غائب عن الملف (الملف يجب أن يكون الجدول كاملًا)",
    PMC_WEIGHTS_NEED_VILLAS: "لا عمود للنموذج والمشروع بلا فلل بعد: استورد قائمة الفلل أولًا، أو أضف عمود النموذج", PMC_WEIGHTS_MODEL_UNKNOWN: "نموذج في جدول الأوزان لا توجد له فلل في المشروع: صحّح اسم العمود أو استورد فلله أولًا", PMC_STAGE_GROUP_CONFLICT: "البند الفرعي مسجل تحت قسم آخر",
    PMC_BLOCK_ZONE_CONFLICT: "البلوك مسجل تحت زون آخر",
  },
  en: {
    IMPORT_SHEET_AMBIGUOUS: "More than one sheet in the file holds the required columns: remove the extra sheet or keep the table on one sheet. Sheets", IMPORT_COLUMN_AMBIGUOUS: "Two columns in the file mean the same thing: keep one or rename the other. Columns",
    IMPORT_EMPTY_WORKBOOK: "The file has no visible sheet with data", IMPORT_TOO_MANY_COLUMNS: "The table has more than 20 filled columns", IMPORT_TOO_MANY_ROWS: "The table has more rows than allowed",
    IMPORT_WORKBOOK_INVALID: "The file could not be read: save it again as xlsx or csv", IMPORT_FILE_TOO_LARGE: "The file is larger than allowed", IMPORT_MACRO_WORKBOOK_REJECTED: "The file holds macros: save it as a plain xlsx",
    PMC_ACTIVITY_NOT_FOUND: "The activity code is not in the project's catalogue",
    IMPORT_DUPLICATE_FILE_KEY: "The number appears twice in the file", PMC_UNIT_MODEL_CHANGE_BLOCKED: "An import does not change the model of a recorded villa", PMC_UNIT_BLOCK_CHANGE_BLOCKED: "An import does not change the block of a recorded villa", PMC_UNIT_NOT_FOUND: "The villa is not in the project",
    FOUND_COLUMNS: "Columns found in the file",
    IMPORT_REQUIRED_COLUMN_MISSING: "A required column is missing from the file", IMPORT_REQUIRED_VALUE_MISSING: "A required value is empty", IMPORT_INVALID_NUMBER: "Not a valid number", IMPORT_EDIT_INVALID: "The correction is for a row the table does not have, or a field no column is read for", IMPORT_FORMULA_ERROR: "The weight cell holds an Excel formula error: fix the formula or type the weight as a number",
    IMPORT_UNSUPPORTED_COLUMN: "Unknown column", PMC_CLASSIFICATION_BLANK: "The section, model or activity is empty", PMC_DUPLICATE_ACTIVITY: "The activity appears twice in the file",
    PMC_MODEL_WEIGHTS_NOT_100: "The model's weights do not total 100%", PMC_MODEL_ACTIVITY_OMITTED: "An activity saved in the project is missing from the file (the file must be the whole table)",
    PMC_WEIGHTS_NEED_VILLAS: "No model column and the project has no villas yet: import the villa list first, or add a model column", PMC_WEIGHTS_MODEL_UNKNOWN: "A model in the weights table has no villas in the project: correct the column's name or import its villas first", PMC_STAGE_GROUP_CONFLICT: "The sub-item is recorded under another section",
    PMC_BLOCK_ZONE_CONFLICT: "The block is recorded under another zone",
  },
  ur: {
    IMPORT_SHEET_AMBIGUOUS: "فائل میں ایک سے زیادہ شیٹس میں لازمی کالم ہیں: اضافی شیٹ ہٹائیں یا جدول ایک شیٹ پر رکھیں۔ شیٹس", IMPORT_COLUMN_AMBIGUOUS: "فائل کے دو کالم ایک ہی معنی رکھتے ہیں: ایک رکھیں یا دوسرے کا نام بدلیں۔ کالم",
    IMPORT_EMPTY_WORKBOOK: "فائل میں ڈیٹا والی کوئی نظر آنے والی شیٹ نہیں", IMPORT_TOO_MANY_COLUMNS: "جدول میں 20 سے زیادہ بھرے ہوئے کالم ہیں", IMPORT_TOO_MANY_ROWS: "جدول کی قطاریں حد سے زیادہ ہیں",
    IMPORT_WORKBOOK_INVALID: "فائل پڑھی نہیں جا سکی: اسے xlsx یا csv میں دوبارہ محفوظ کریں", IMPORT_FILE_TOO_LARGE: "فائل حد سے بڑی ہے", IMPORT_MACRO_WORKBOOK_REJECTED: "فائل میں میکرو ہیں: اسے سادہ xlsx میں محفوظ کریں",
    PMC_ACTIVITY_NOT_FOUND: "سرگرمی کا کوڈ پروجیکٹ کی فہرست میں نہیں ہے",
    IMPORT_DUPLICATE_FILE_KEY: "نمبر فائل میں دو بار ہے", PMC_UNIT_MODEL_CHANGE_BLOCKED: "درآمد سے درج ولا کا ماڈل نہیں بدلتا", PMC_UNIT_BLOCK_CHANGE_BLOCKED: "درآمد سے درج ولا کا بلاک نہیں بدلتا", PMC_UNIT_NOT_FOUND: "ولا منصوبے میں موجود نہیں",
    FOUND_COLUMNS: "فائل میں موجود کالم",
    IMPORT_REQUIRED_COLUMN_MISSING: "فائل میں لازمی کالم موجود نہیں", IMPORT_REQUIRED_VALUE_MISSING: "لازمی قدر خالی ہے", IMPORT_INVALID_NUMBER: "درست عدد نہیں", IMPORT_EDIT_INVALID: "درستی ایسی قطار کے لیے ہے جو جدول میں نہیں، یا ایسی فیلڈ کے لیے جو کسی کالم سے نہیں پڑھی جاتی", IMPORT_FORMULA_ERROR: "وزن کے خانے میں Excel فارمولے کی خرابی ہے: فارمولا درست کریں یا وزن عدد کے طور پر لکھیں",
    IMPORT_UNSUPPORTED_COLUMN: "نامعلوم کالم", PMC_CLASSIFICATION_BLANK: "سیکشن، ماڈل یا سرگرمی خالی ہے", PMC_DUPLICATE_ACTIVITY: "سرگرمی فائل میں دو بار ہے",
    PMC_MODEL_WEIGHTS_NOT_100: "ماڈل کے وزن کا مجموعہ 100% نہیں", PMC_MODEL_ACTIVITY_OMITTED: "منصوبے میں محفوظ ایک سرگرمی فائل میں نہیں (فائل پوری جدول ہونی چاہیے)",
    PMC_WEIGHTS_NEED_VILLAS: "ماڈل کا کالم نہیں اور منصوبے میں ابھی ولاز نہیں: پہلے ولاز کی فہرست درآمد کریں، یا ماڈل کا کالم شامل کریں", PMC_WEIGHTS_MODEL_UNKNOWN: "وزن جدول میں ایسا ماڈل ہے جس کے ولاز منصوبے میں نہیں: کالم کا نام درست کریں یا پہلے اس کے ولاز درآمد کریں", PMC_STAGE_GROUP_CONFLICT: "ذیلی آئٹم کسی اور سیکشن کے تحت درج ہے",
    PMC_BLOCK_ZONE_CONFLICT: "بلاک کسی اور زون کے تحت درج ہے",
  },
} as const;

// G-150 (D-30): a missing required column was named by its internal key (zoneCode, blockCode…). The keys of server/domain/pmcImport.ts FIELDS, named
// in the page's language. An unknown column keeps the file's own header as written: that is the person's word, not a key.
export const PMC_FIELD_LABELS = {
  ar: { consultant: "الاستشاري", contractor: "المقاول", csi: "المجموعة (القسم أو بند CSI)", endDate: "تاريخ النهاية", notes: "ملاحظات", period: "الفترة", plannedPercent: "النسبة المخططة", requestCode: "رقم الطلب", requestedAt: "تاريخ الطلب", responseCode: "رمز الرد", startDate: "تاريخ البداية", sub: "المرحلة (تجميع داخل القسم)", activityNameEn: "اسم النشاط بالإنجليزية", outline: "الترقيم الهرمي (1 / 1.2 / 1.2.3)", groupNameEn: "اسم المجموعة بالإنجليزية", stageNameEn: "اسم المرحلة بالإنجليزية", unitNumbers: "أرقام الفلل", weight: "الوزن", zoneCode: "رمز المنطقة", zoneName: "اسم المنطقة", blockCode: "رمز البلوك", blockName: "اسم البلوك", unitNumber: "رقم الفيلا", modelCode: "النموذج", saleStatus: "حالة البيع", unitWeight: "وزن الفيلا", groupCode: "رمز المجموعة", groupName: "اسم المجموعة", stageCode: "رمز المرحلة", stageName: "اسم المرحلة", activityCode: "رمز النشاط", activityName: "اسم النشاط", weightPercent: "نسبة الوزن", wbsCode: "رمز WBS", status: "الحالة", verificationStatus: "حالة التحقق", changedAt: "تاريخ التغيير", engineerEmail: "بريد المهندس" },
  en: { consultant: "Consultant", contractor: "Contractor", csi: "Group (section or CSI item)", endDate: "End date", notes: "Notes", period: "Period", plannedPercent: "Planned percent", requestCode: "Request number", requestedAt: "Requested on", responseCode: "Response code", startDate: "Start date", sub: "Stage (grouping within the section)", activityNameEn: "Activity name in English", outline: "Hierarchy numbering (1 / 1.2 / 1.2.3)", groupNameEn: "Group name in English", stageNameEn: "Stage name in English", unitNumbers: "Villa numbers", weight: "Weight", zoneCode: "Zone code", zoneName: "Zone name", blockCode: "Block code", blockName: "Block name", unitNumber: "Villa number", modelCode: "Model", saleStatus: "Sale status", unitWeight: "Villa weight", groupCode: "Group code", groupName: "Group name", stageCode: "Stage code", stageName: "Stage name", activityCode: "Activity code", activityName: "Activity name", weightPercent: "Weight percent", wbsCode: "WBS code", status: "Status", verificationStatus: "Verification status", changedAt: "Changed on", engineerEmail: "Engineer e-mail" },
  ur: { consultant: "کنسلٹنٹ", contractor: "ٹھیکیدار", csi: "گروپ (سیکشن یا CSI آئٹم)", endDate: "اختتامی تاریخ", notes: "نوٹس", period: "مدت", plannedPercent: "منصوبہ بند فیصد", requestCode: "درخواست نمبر", requestedAt: "درخواست کی تاریخ", responseCode: "جواب کا کوڈ", startDate: "آغاز کی تاریخ", sub: "مرحلہ (سیکشن کے اندر گروپ)", activityNameEn: "سرگرمی کا انگریزی نام", outline: "درجہ بندی نمبرنگ (1 / 1.2 / 1.2.3)", groupNameEn: "گروپ کا انگریزی نام", stageNameEn: "مرحلے کا انگریزی نام", unitNumbers: "ولا نمبرز", weight: "وزن", zoneCode: "زون کوڈ", zoneName: "زون کا نام", blockCode: "بلاک کوڈ", blockName: "بلاک کا نام", unitNumber: "ولا نمبر", modelCode: "ماڈل", saleStatus: "فروخت کی حالت", unitWeight: "ولا کا وزن", groupCode: "گروپ کوڈ", groupName: "گروپ کا نام", stageCode: "مرحلے کا کوڈ", stageName: "مرحلے کا نام", activityCode: "سرگرمی کوڈ", activityName: "سرگرمی کا نام", weightPercent: "وزن فیصد", wbsCode: "WBS کوڈ", status: "حالت", verificationStatus: "تصدیق کی حالت", changedAt: "تبدیلی کی تاریخ", engineerEmail: "انجینئر کی ای میل" },
} as const;

export function pmcImportReason(error: { code: string; field?: string; detail?: string }, language: Language): string {
  const messages = pickLanguage<Record<string, string>>(language, MESSAGES);
  const labels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const field = error.field && error.code !== "IMPORT_UNSUPPORTED_COLUMN" ? labels[error.field] ?? error.field : error.field;
  // Q-31: a missing column names the columns the file does have, so the person sees what to rename
  const detail = error.code === "IMPORT_REQUIRED_COLUMN_MISSING" && error.detail ? `${messages.FOUND_COLUMNS}: ${error.detail}` : error.detail;
  return [messages[error.code] ?? error.code, field, detail].filter(Boolean).join(" · ");
}
