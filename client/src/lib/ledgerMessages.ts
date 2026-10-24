import { resolveLanguage, type Language } from "./language";
import { getProjectError } from "@shared/projectErrors";
import { conflictReasons } from "@/components/ImportDiffPreview";

// The sentences for what an operational import (costs, purchase orders, employees, hours) can refuse, by the code the server gives. A code without a sentence is shown as it is.
const messages: Record<"ar" | "en" | "ur", Record<string, string>> = {
  ar: {
    IMPORT_INVALID_NUMBER: "الرقم غير صالح (أكبر من صفر وبدون حروف).", IMPORT_INVALID_DATE: "التاريخ غير صالح؛ اكتبه بصيغة 2026-09-15.", IMPORT_REQUIRED_VALUE_MISSING: "قيمة مطلوبة ناقصة.",
    IMPORT_REQUIRED_COLUMN_MISSING: "عمود مطلوب غير موجود في الملف.", IMPORT_UNSUPPORTED_COLUMN: "عمود غير معتمد لهذا النوع من البيانات.", IMPORT_DUPLICATE_FILE_KEY: "الصف مكرر داخل الملف.",
    COST_ROW_NOT_LINKED: "كل تكلفة تُربط ببند WBS أو ببند ميزانية موجود: اكتب أحدهما.", COST_WBS_NOT_FOUND: "رمز WBS غير موجود في هذا المشروع.", COST_BUDGET_LINE_NOT_FOUND: "رمز بند الميزانية غير موجود في هذا المشروع.",
    COST_BUDGET_LINE_WITHOUT_WBS: "بند الميزانية غير مربوط ببند WBS؛ اكتب رمز WBS.", COST_LINK_MISMATCH: "بند الميزانية مربوط ببند WBS مختلف عن المكتوب.", COST_CATEGORY_INVALID: "الفئة غير معتمدة (مواد · عمالة · مقاول من الباطن · أخرى).",
    PO_NOT_LINKED: "أمر الشراء يُربط بعقد موجود أو بمورد موجود.", PO_CONTRACT_NOT_FOUND: "رمز العقد غير موجود في هذا المشروع.", PO_SUPPLIER_NOT_FOUND: "رمز المورد غير موجود في سجل الموردين.",
    PO_SUPPLIER_INACTIVE: "المورد غير فعّال.", PO_SUPPLIER_NAME_REQUIRED: "اكتب اسم المورد (أو رمزًا من سجل الموردين).", PO_STATUS_READ_ONLY: "حالة أمر الشراء لا تُغيَّر من الملف؛ تُنشأ الأوامر مسودات.",
    EMPLOYEE_STATUS_INVALID: "حالة التوظيف غير معتمدة.", EMPLOYEE_TERMINATION_NOT_BY_IMPORT: "إنهاء الخدمة يتم من شاشة الموارد البشرية لا من الملف.",
    TIME_EMPLOYEE_NOT_FOUND: "الرقم الوظيفي غير موجود.", TIME_AMBIGUOUS_ASSIGNMENT: "للموظف أكثر من إسناد مفتوح في هذا اليوم؛ سجّل الساعات من شاشة الساعات.",
  },
  en: {
    IMPORT_INVALID_NUMBER: "Not a valid number (above zero, digits only).", IMPORT_INVALID_DATE: "Not a valid date; write it as 2026-09-15.", IMPORT_REQUIRED_VALUE_MISSING: "A required value is missing.",
    IMPORT_REQUIRED_COLUMN_MISSING: "A required column is not in the file.", IMPORT_UNSUPPORTED_COLUMN: "A column that is not approved for this kind of data.", IMPORT_DUPLICATE_FILE_KEY: "The row is repeated inside the file.",
    COST_ROW_NOT_LINKED: "Every cost is tied to a WBS item or an existing budget line: write one of them.", COST_WBS_NOT_FOUND: "That WBS code does not exist in this project.", COST_BUDGET_LINE_NOT_FOUND: "That budget cost code does not exist in this project.",
    COST_BUDGET_LINE_WITHOUT_WBS: "That budget line is not linked to a WBS item; write the WBS code.", COST_LINK_MISMATCH: "The budget line is linked to a different WBS item than the one written.", COST_CATEGORY_INVALID: "The category is not one of materials, labour, subcontract, other.",
    PO_NOT_LINKED: "An order is tied to an existing contract or an existing supplier.", PO_CONTRACT_NOT_FOUND: "That contract code does not exist in this project.", PO_SUPPLIER_NOT_FOUND: "That supplier code is not in the supplier register.",
    PO_SUPPLIER_INACTIVE: "That supplier is not active.", PO_SUPPLIER_NAME_REQUIRED: "Write the supplier's name (or a code from the supplier register).", PO_STATUS_READ_ONLY: "An order's status is not changed from a file; orders are created as drafts.",
    EMPLOYEE_STATUS_INVALID: "That employment status is not accepted.", EMPLOYEE_TERMINATION_NOT_BY_IMPORT: "Termination is done on the HR screen, not from a file.",
    TIME_EMPLOYEE_NOT_FOUND: "No employee has that number.", TIME_AMBIGUOUS_ASSIGNMENT: "The employee has more than one open assignment that day; book the hours on the hours screen.",
  }, ur: {
    IMPORT_INVALID_NUMBER: "درست عدد نہیں (صفر سے زیادہ، صرف ہندسے)۔", IMPORT_INVALID_DATE: "درست تاریخ نہیں؛ اسے 2026-09-15 کی شکل میں لکھیں۔", IMPORT_REQUIRED_VALUE_MISSING: "ایک ضروری قدر غائب ہے۔",
    IMPORT_REQUIRED_COLUMN_MISSING: "فائل میں ایک ضروری کالم موجود نہیں ہے۔", IMPORT_UNSUPPORTED_COLUMN: "ایسا کالم جو اس قسم کے ڈیٹا کے لیے منظور نہیں۔", IMPORT_DUPLICATE_FILE_KEY: "یہ قطار فائل کے اندر دہرائی گئی ہے۔",
    COST_ROW_NOT_LINKED: "ہر لاگت کسی WBS آئٹم یا موجودہ بجٹ کی سطر سے جڑی ہونی چاہیے: ان میں سے ایک لکھیں۔", COST_WBS_NOT_FOUND: "یہ WBS کوڈ اس پروجیکٹ میں موجود نہیں ہے۔", COST_BUDGET_LINE_NOT_FOUND: "یہ بجٹ لاگت کوڈ اس پروجیکٹ میں موجود نہیں ہے۔",
    COST_BUDGET_LINE_WITHOUT_WBS: "یہ بجٹ کی سطر کسی WBS آئٹم سے نہیں جڑی؛ WBS کوڈ لکھیں۔", COST_LINK_MISMATCH: "بجٹ کی سطر لکھے گئے WBS آئٹم کے بجائے کسی اور WBS آئٹم سے جڑی ہے۔", COST_CATEGORY_INVALID: "یہ زمرہ مواد، لیبر، ذیلی ٹھیکہ، دیگر میں سے نہیں ہے۔",
    PO_NOT_LINKED: "آرڈر کسی موجودہ معاہدے یا موجودہ سپلائر سے جڑا ہونا چاہیے۔", PO_CONTRACT_NOT_FOUND: "یہ معاہدے کا کوڈ اس پروجیکٹ میں موجود نہیں ہے۔", PO_SUPPLIER_NOT_FOUND: "یہ سپلائر کوڈ سپلائر رجسٹر میں نہیں ہے۔",
    PO_SUPPLIER_INACTIVE: "یہ سپلائر فعال نہیں ہے۔", PO_SUPPLIER_NAME_REQUIRED: "سپلائر کا نام لکھیں (یا سپلائر رجسٹر کا کوئی کوڈ)۔", PO_STATUS_READ_ONLY: "آرڈر کی حیثیت فائل سے تبدیل نہیں ہوتی؛ آرڈر مسودے کے طور پر بنتے ہیں۔",
    EMPLOYEE_STATUS_INVALID: "ملازمت کی یہ حیثیت قبول نہیں ہے۔", EMPLOYEE_TERMINATION_NOT_BY_IMPORT: "ملازمت ختم کرنا HR اسکرین پر ہوتا ہے، فائل سے نہیں۔",
    TIME_EMPLOYEE_NOT_FOUND: "اس نمبر کا کوئی ملازم نہیں۔", TIME_AMBIGUOUS_ASSIGNMENT: "ملازم کی اس دن ایک سے زیادہ کھلی تفویضات ہیں؛ گھنٹے گھنٹوں کی اسکرین پر درج کریں۔",
  },
};

export function ledgerErrorLabel(code: string, language: Language | boolean): string | undefined {
  const locale = resolveLanguage(language);
  if (messages[locale][code]) return messages[locale][code];
  if (conflictReasons[locale][code]) return conflictReasons[locale][code];
  if (/^PROJECT_OS_[A-Z0-9_]+$/.test(code)) { const known = getProjectError(code); return known.messages[locale]; }
  return undefined;
}
