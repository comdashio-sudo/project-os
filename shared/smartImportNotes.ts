// Q-66 (4) (I3 28-11): the smart reader's notes in words — what a reading did not carry over, a value it defaulted, a difference it found — in Arabic,
// English and Urdu, never the raw code. A note is a code and its values separated by «:» (BOQ_SECTION_DIFFERS:1:1500:1800). A note this list does not know is
// shown as written, so nothing is ever hidden.
export type NoteLanguage = "ar" | "en" | "ur";
type Say = (values: string[]) => string;
const n = (value: string | undefined) => { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value ?? ""; }; // design-rules: shared, not a screen

const NOTES: Record<string, Record<NoteLanguage, Say>> = {
  BOQ_QUANTITY_AND_RATE_NOT_CARRIED: { ar: () => "الكمية وسعر الوحدة لا يُنقلان؛ يُنقل المبلغ فقط.", en: () => "Quantity and unit rate are not carried over; only the amount is.", ur: () => "مقدار اور فی اکائی شرح منتقل نہیں ہوتے؛ صرف رقم منتقل ہوتی ہے۔" },
  BOQ_SECTIONS_AS_SUBTOTALS: { ar: ([count]) => `${n(count)} قسمًا تحته بنود مسعّرة كُتب بصفر، فلا يُحسب مجموعه مرتين.`, en: ([count]) => `${n(count)} sections with priced items below were written as 0, so their subtotal is not counted twice.`, ur: ([count]) => `${n(count)} سیکشن جن کے نیچے قیمت والی اشیاء ہیں صفر لکھے گئے، تاکہ ان کا ذیلی میزان دو بار نہ گنا جائے۔` },
  BOQ_SECTION_DIFFERS: { ar: ([code, written, sum]) => `القسم ${code} كتب ${n(written)} ومجموع بنوده ${n(sum)}؛ لم يُغيَّر أيٌّ منهما.`, en: ([code, written, sum]) => `Section ${code} says ${n(written)} and its items add up to ${n(sum)}; neither was changed.`, ur: ([code, written, sum]) => `سیکشن ${code} میں ${n(written)} لکھا ہے اور اس کی اشیاء کا مجموعہ ${n(sum)} ہے؛ کسی کو نہیں بدلا گیا۔` },
  BOQ_TREE_TOTAL: { ar: ([total]) => `مجموع الجدول: ${n(total)}.`, en: ([total]) => `Bill total: ${n(total)}.`, ur: ([total]) => `جدول کا مجموعہ: ${n(total)}۔` },
  BOQ_NEGATIVE_NOT_WRITTEN: { ar: ([code, amount]) => `السطر ${code} بمبلغ سالب (${n(amount)}) كُتب صفرًا.`, en: ([code, amount]) => `Line ${code} has a negative amount (${n(amount)}) and was written as 0.`, ur: ([code, amount]) => `سطر ${code} کی منفی رقم (${n(amount)}) صفر لکھی گئی۔` },
  BUDGET_CURRENT_DEFAULTED_TO_ORIGINAL: { ar: () => "لا عمود للقيمة الحالية: أُخذت القيمة الأصلية.", en: () => "No current amount column: the original amount was used.", ur: () => "موجودہ رقم کا کالم نہیں: اصل رقم استعمال ہوئی۔" },
  BUDGET_TREE_TOTAL: { ar: ([total]) => `مجموع شجرة الميزانية: ${n(total)}.`, en: ([total]) => `Budget tree total: ${n(total)}.`, ur: ([total]) => `بجٹ کے درخت کا مجموعہ: ${n(total)}۔` },
  BUDGET_WRITTEN_TOTAL: { ar: ([total]) => `مجموع ما يُكتب: ${n(total)} (يختلف عن مجموع الشجرة).`, en: ([total]) => `Total written: ${n(total)} (differs from the tree's total).`, ur: ([total]) => `لکھی گئی رقم کا مجموعہ: ${n(total)} (درخت کے مجموعے سے مختلف)۔` },
  BUDGET_PARENT_DIFFERS: { ar: ([code, written, sum]) => `البند ${code} كتب ${n(written)} ومجموع أبنائه ${n(sum)}؛ لم يُغيَّر أيٌّ منهما.`, en: ([code, written, sum]) => `Item ${code} says ${n(written)} and its children add up to ${n(sum)}; neither was changed.`, ur: ([code, written, sum]) => `آئٹم ${code} میں ${n(written)} لکھا ہے اور اس کے ذیلی آئٹمز کا مجموعہ ${n(sum)} ہے؛ کسی کو نہیں بدلا گیا۔` },
  BUDGET_PARENT_WRITTEN_AS_LEAF: { ar: ([code, amount]) => `البند ${code} لا مبالغ تحته: كُتب بمبلغه ${n(amount)}.`, en: ([code, amount]) => `Item ${code} has no amounts below it: written with its own ${n(amount)}.`, ur: ([code, amount]) => `آئٹم ${code} کے نیچے کوئی رقم نہیں: اپنی رقم ${n(amount)} کے ساتھ لکھا گیا۔` },
  BUDGET_PERCENT_NOT_100: { ar: ([code, sum]) => `نسب أبناء ${code} مجموعها ${n(sum)}% لا 100%.`, en: ([code, sum]) => `The shares under ${code} add up to ${n(sum)}%, not 100%.`, ur: ([code, sum]) => `${code} کے تحت حصوں کا مجموعہ ${n(sum)}% ہے، 100% نہیں۔` },
  BUDGET_ALLOCATED_BY_PERCENT: { ar: () => "بعض البنود أخذت حصتها من مبلغ أبيها بالنسبة.", en: () => "Some items took their share of their parent's amount by percentage.", ur: () => "کچھ آئٹمز نے فیصد کے مطابق اپنے بالائی آئٹم کی رقم سے حصہ لیا۔" },
  BUDGET_NEGATIVE_NOT_WRITTEN: { ar: ([code, amount]) => `البند ${code} بمبلغ سالب (${n(amount)}) كُتب صفرًا.`, en: ([code, amount]) => `Item ${code} has a negative amount (${n(amount)}) and was written as 0.`, ur: ([code, amount]) => `آئٹم ${code} کی منفی رقم (${n(amount)}) صفر لکھی گئی۔` },
  SCHEDULE_WBS_SYNTHESISED: { ar: () => "أنشطة بلا هيكل عمل وُضعت تحت «أنشطة غير مصنفة».", en: () => "Activities without a WBS were put under «Unclassified activities».", ur: () => "بغیر WBS کی سرگرمیاں «غیر درجہ بند سرگرمیاں» کے تحت رکھی گئیں۔" },
  MATERIAL_CATEGORY_DEFAULTED: { ar: () => "مواد بلا فئة أخذت الفئة العامة.", en: () => "Materials without a category took the general one.", ur: () => "بغیر زمرے کے مواد کو عمومی زمرہ دیا گیا۔" },
  MATERIAL_CODES_GENERATED: { ar: () => "مواد بلا رمز أخذت رمزًا من وصفها (الرمز نفسه في الملف التالي).", en: () => "Materials without a code got one made from their description (the same code next time).", ur: () => "بغیر کوڈ کے مواد کو ان کی وضاحت سے کوڈ دیا گیا (اگلی بار وہی کوڈ)۔" },
  CONTRACT_CURRENCY_DEFAULTED: { ar: () => "عقود بلا عملة أخذت عملة المشروع.", en: () => "Contracts without a currency took the project's.", ur: () => "بغیر کرنسی کے معاہدوں کو منصوبے کی کرنسی دی گئی۔" },
  XER_CURRENCY_DIFFERS: { ar: ([pair]) => `عملة الجدول تختلف عن عملة المشروع (${pair ?? ""}).`, en: ([pair]) => `The schedule's currency differs from the project's (${pair ?? ""}).`, ur: ([pair]) => `شیڈول کی کرنسی منصوبے کی کرنسی سے مختلف ہے (${pair ?? ""})۔` },
  XER_TABLES_NOT_KEPT: { ar: ([tables]) => `جداول في ملف P6 لا تُحفظ: ${tables ?? ""}.`, en: ([tables]) => `Tables in the P6 file that are not kept: ${tables ?? ""}.`, ur: ([tables]) => `P6 فائل کے جدول جو محفوظ نہیں ہوتے: ${tables ?? ""}۔` },
  XER_RELATIONSHIPS_OUTSIDE_PROJECT: { ar: ([count]) => `${n(count)} علاقة تشير إلى أنشطة خارج المشروع فلم تُحفظ.`, en: ([count]) => `${n(count)} relationships point to activities outside the project and were not kept.`, ur: ([count]) => `${n(count)} تعلقات منصوبے سے باہر کی سرگرمیوں کی طرف ہیں اور محفوظ نہیں ہوئے۔` },
  UNEXPECTED_ACTIVITY_CELLS: { ar: () => "في خلايا الأنشطة قيم غير متوقعة؛ قُرئت كما هي ورُوجعت.", en: () => "Some activity cells hold unexpected values; they were read as written and flagged.", ur: () => "کچھ سرگرمی خانوں میں غیر متوقع اقدار ہیں؛ جیسی لکھی تھیں پڑھی گئیں اور نشان زد ہوئیں۔" },
  REPORT_DATE_MISSING: { ar: () => "لا تاريخ للتقرير في الملف.", en: () => "The file has no report date.", ur: () => "فائل میں رپورٹ کی تاریخ نہیں۔" },
  SERIAL_MISSING: { ar: () => "بعض الوحدات بلا رقم تسلسلي.", en: () => "Some units have no serial number.", ur: () => "کچھ یونٹس کا سیریل نمبر نہیں۔" },
  CONSULTANT_NO_UNITS_IN_PROJECT: { ar: () => "لا فلل في المشروع بعد: استورد التقرير الشهري أولًا.", en: () => "The project has no villas yet: import the monthly report first.", ur: () => "منصوبے میں ابھی ولاز نہیں: پہلے ماہانہ رپورٹ درآمد کریں۔" },
  CONSULTANT_UNKNOWN_VILLAS: { ar: () => "في الملف فلل ليست في المشروع.", en: () => "The file names villas that are not in the project.", ur: () => "فائل میں ایسے ولاز ہیں جو منصوبے میں نہیں۔" },
  CONSULTANT_COLUMNS_TO_MATCH: { ar: () => "أعمدة للاستشاري تحتاج ربطًا بأنشطة المشروع.", en: () => "Some consultant columns still need matching to the project's activities.", ur: () => "مشیر کے کچھ کالم منصوبے کی سرگرمیوں سے ملانے باقی ہیں۔" },
  CONSULTANT_EXPORT_DATE_MISSING: { ar: () => "لا تاريخ تصدير في ملف الاستشاري.", en: () => "The consultant's file has no export date.", ur: () => "مشیر کی فائل میں برآمد کی تاریخ نہیں۔" },
};

/** One note in words, in the language asked; an unknown note as written. */
export function smartNoteText(note: string, language: NoteLanguage): string {
  const [code, ...values] = note.split(":");
  const say = NOTES[code]?.[language];
  return say ? say(values) : note;
}
