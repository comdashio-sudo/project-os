// Q-35 (P1-01): what each PMC import template is, written for a person who has never seen it: what it does, when to use it, its columns (required and
// optional, with the header the file may use), the format, a short example with made-up data, what happens after a successful import and where to see it.
// The columns and the example are not trusted to stay right by hand: server/domain/pmcImportGuide.test.ts builds each example as a workbook and reads it with
// the real importer (no missing or unknown column), and drops each required column to see it named as missing.
import type { Language } from "@/lib/language";

export const PMC_GUIDE_KINDS = ["weights", "locations", "catalog", "status", "requests", "baseline", "baselineDates"] as const;
export type PmcGuideKind = (typeof PMC_GUIDE_KINDS)[number];
export type GuideColumn = { header: string; required: boolean; note: string };
export type KindGuide = { purpose: string; when: string; format: string; after: string; where: string; columns: GuideColumn[]; example: Array<Array<string | number>> };

const c = (header: string, required: boolean, note: string): GuideColumn => ({ header, required, note });

const ar: Record<PmcGuideKind, KindGuide> = {
  weights: {
    purpose: "وزن كل نشاط من الوحدة (مثلًا الخرسانة 30% من الفيلا)، ومنه تُحسب نسبة إنجاز كل فيلا والمشروع.",
    when: "أول مرة قبل أي تحديث إنجاز، ثم كلما تغيّرت الأوزان.",
    format: "ورقة واحدة، صف العناوين ثم صف لكل نشاط. الوزن رقم أو نسبة (30 أو 30% أو 0.3)، ومجموع كل نموذج 100%. الصفوف بوزن صفر تُتجاهل.",
    after: "تُنشأ الأنشطة أو تُحدَّث أوزانها؛ إعادة رفع الملف نفسه لا تكرر شيئًا.",
    where: "«تحرير الوحدات والأوزان والحالة» و«الأنشطة» في هذه الصفحة.",
    columns: [c("القسم", true, "قسم CSI مثل 03"), c("البند الفرعي", false, "تجميع داخل القسم"), c("رمز النشاط", false, "يُولَّد إن غاب"), c("النشاط", true, "اسم النشاط"), c("الوزن", true, "نسبة من الوحدة"), c("النموذج", false, "إن اختلفت الأوزان بين النماذج")],
    example: [["القسم", "البند الفرعي", "النشاط", "الوزن"], ["03", "الهيكل", "صب الأسقف", 60], ["09", "التشطيب", "الدهان", 40]],
  },
  locations: {
    purpose: "قائمة الفلل: البلوك ورقم الفيلا ونموذجها، وهي أساس المخطط والتحديثات.",
    when: "بعد جدول الأوزان أو معه، وكلما أُضيفت فلل.",
    format: "صف لكل فيلا. رقم الفيلا رقم صحيح لا يتكرر. الزون اختياري (تذهب الفلل كلها لزون واحد إن غاب).",
    after: "تُنشأ البلوكات والفلل الجديدة، والموجودة تبقى ويُحدَّث نموذجها.",
    where: "«تحرير الوحدات والأوزان والحالة» و«المخطط».",
    columns: [c("الزون", false, "رمز المنطقة"), c("اسم المنطقة", false, ""), c("البلوك", true, "رمز البلوك"), c("اسم البلوك", false, ""), c("الفيلا", true, "رقم الفيلا"), c("النموذج", true, "رمز النموذج"), c("حالة البيع", false, ""), c("وزن الوحدة", false, "إن لم تتساوَ الفلل")],
    example: [["البلوك", "الفيلا", "النموذج"], ["B1", 1, "A"], ["B1", 2, "B"]],
  },
  catalog: {
    purpose: "الكتالوج الكامل: لكل نموذج مجموعاته ومراحله وأنشطته وأوزانها، لمن يحتاج أكثر من جدول الأوزان.",
    when: "بدل جدول الأوزان حين تريد المجموعات والمراحل ورمز WBS.",
    format: "صف لكل نشاط في كل نموذج. مجموع أوزان النموذج 100%.",
    after: "يُنشأ الكتالوج أو يُحدَّث؛ رمز النشاط يربط الصف بالموجود فلا تكرار.",
    where: "«المراحل» و«الأنشطة» و«تحرير الوحدات والأوزان والحالة».",
    columns: [c("النموذج", true, ""), c("المجموعة", true, "رمز المجموعة"), c("اسم المجموعة", false, ""), c("المرحلة", true, "رمز المرحلة"), c("اسم المرحلة", false, ""), c("رمز النشاط", true, ""), c("اسم النشاط", true, ""), c("الوزن", true, "نسبة من الوحدة"), c("رمز WBS", false, "للربط بالتكاليف")],
    example: [["النموذج", "المجموعة", "المرحلة", "رمز النشاط", "اسم النشاط", "الوزن"], ["A", "STR", "S1", "A-01", "صب الأسقف", 60], ["A", "FIN", "S2", "A-02", "الدهان", 40]],
  },
  status: {
    purpose: "حالة كل نشاط في كل فيلا (لم يبدأ، قيد التنفيذ، قيد المراجعة، مكتمل)، لنقل حالة الموقع من ملف دفعة واحدة.",
    when: "عند البدء بموقع قائم، أو لتحديث كبير؛ التحديث اليومي من شاشة «تحديث الإنجاز».",
    format: "صف لكل فيلا ونشاط. الحالة بالكلمات (مكتمل، قيد التنفيذ…). التاريخ اختياري بصيغة 2027-01-31.",
    after: "تتغيّر حالة الأنشطة وتُسجَّل في السجل، فتتغيّر النسب والألوان.",
    where: "«آخر التحديثات» و«الأنشطة» وألوان «المخطط».",
    columns: [c("رقم الوحدة", true, "رقم الفيلا"), c("رمز النشاط", true, ""), c("الحالة", true, "لم يبدأ / قيد التنفيذ / قيد المراجعة / مكتمل"), c("حالة التحقق", false, ""), c("بريد المهندس", false, ""), c("التاريخ", false, "")],
    example: [["رقم الوحدة", "رمز النشاط", "الحالة"], [1, "A-01", "مكتمل"], [1, "A-02", "قيد التنفيذ"]],
  },
  requests: {
    purpose: "طلبات الفحص والاستلام وردود الاستشاري عليها.",
    when: "لنقل سجل الطلبات من ملف المقاول أو الاستشاري.",
    format: "صف لكل طلب. الوحدات قائمة أو نطاق مثل 1-5, 8. التاريخ بصيغة 2027-01-31.",
    after: "تُنشأ الطلبات أو يُحدَّث ردها برقم الطلب.",
    where: "«الاعتمادات» و«المعلّق» و«الفحوصات».",
    columns: [c("رقم الطلب", true, ""), c("رمز النشاط", true, ""), c("الوحدات", true, "مثل 1-5, 8"), c("تاريخ الطلب", true, ""), c("المقاول", false, ""), c("الاستشاري", false, ""), c("رمز الرد", false, ""), c("ملاحظات", false, "")],
    example: [["رقم الطلب", "رمز النشاط", "الوحدات", "تاريخ الطلب"], ["WIR-001", "A-01", "1", "2027-01-10"]],
  },
  baseline: {
    purpose: "خط الأساس الشهري: النسبة المخططة لكل نشاط في كل شهر، ومنه منحنى S المخطط.",
    when: "حين يكون عندك المخطط شهرًا بشهر.",
    format: "صف لكل نموذج ونشاط وشهر. الشهر تاريخ أوله (2027-01-01). النسبة المخططة تراكمية من 0 إلى 100.",
    after: "تُحفظ نقاط الخط الأساس، والموجود لنفس الشهر يُحدَّث.",
    where: "«البرنامج الزمني» ومنحنى S.",
    columns: [c("النموذج", true, ""), c("رمز النشاط", true, ""), c("الشهر", true, "2027-01-01"), c("النسبة المخططة", true, "تراكمية 0–100")],
    example: [["النموذج", "رمز النشاط", "الشهر", "النسبة المخططة"], ["A", "A-01", "2027-01-01", 50], ["A", "A-01", "2027-02-01", 100]],
  },
  baselineDates: {
    purpose: "خط الأساس بتاريخي البداية والنهاية لكل نشاط؛ تحسب المنصة النسب الشهرية بينهما.",
    when: "حين يكون عندك برنامج بالتواريخ لا بالنسب الشهرية.",
    format: "صف لكل نموذج ونشاط. التاريخان بصيغة 2027-01-31، والنهاية بعد البداية.",
    after: "يُحوَّل لنقاط شهرية مثل خط الأساس الشهري ويُحفظ.",
    where: "«البرنامج الزمني» ومنحنى S.",
    columns: [c("النموذج", true, ""), c("رمز النشاط", true, ""), c("تاريخ البداية", true, ""), c("تاريخ النهاية", true, "")],
    example: [["النموذج", "رمز النشاط", "تاريخ البداية", "تاريخ النهاية"], ["A", "A-01", "2027-01-01", "2027-03-31"]],
  },
};

const en: Record<PmcGuideKind, KindGuide> = {
  weights: {
    purpose: "The weight of each activity in a unit (e.g. concrete is 30% of a villa); each villa's and the project's progress is computed from it.",
    when: "First, before any progress update, then whenever the weights change.",
    format: "One sheet: a header row, then one row per activity. The weight is a number or a percent (30, 30% or 0.3); each model totals 100%. Rows weighing zero are skipped.",
    after: "Activities are created or their weights updated; uploading the same file again repeats nothing.",
    where: "«Units, weights and status» and «Activities» on this page.",
    columns: [c("section", true, "CSI section, e.g. 03"), c("sub item", false, "a grouping inside the section"), c("activity code", false, "generated when missing"), c("activity", true, "the activity's name"), c("weight", true, "share of the unit"), c("model", false, "when weights differ by model")],
    example: [["section", "sub item", "activity", "weight"], ["03", "Structure", "Slab casting", 60], ["09", "Finishes", "Painting", 40]],
  },
  locations: {
    purpose: "The villa list: block, villa number and model, the base of the plan and every update.",
    when: "After or with the weights table, and whenever villas are added.",
    format: "One row per villa. The villa number is a whole number that does not repeat. The zone is optional (all villas go to one zone without it).",
    after: "New blocks and villas are created; existing ones stay and their model is updated.",
    where: "«Units, weights and status» and «Site plan».",
    columns: [c("zone", false, "zone code"), c("zone name", false, ""), c("block", true, "block code"), c("block name", false, ""), c("villa", true, "villa number"), c("model", true, "model code"), c("sale status", false, ""), c("unit weight", false, "when villas are not equal")],
    example: [["block", "villa", "model"], ["B1", 1, "A"], ["B1", 2, "B"]],
  },
  catalog: {
    purpose: "The full catalogue: per model its groups, stages, activities and weights, for those who need more than the weights table.",
    when: "Instead of the weights table, when you want groups, stages and a WBS code.",
    format: "One row per activity per model. A model's weights total 100%.",
    after: "The catalogue is created or updated; the activity code ties a row to the existing one, so nothing repeats.",
    where: "«Stages», «Activities» and «Units, weights and status».",
    columns: [c("model", true, ""), c("group", true, "group code"), c("group name", false, ""), c("stage", true, "stage code"), c("stage name", false, ""), c("activity code", true, ""), c("activity name", true, ""), c("weight", true, "share of the unit"), c("wbs code", false, "to link to costs")],
    example: [["model", "group", "stage", "activity code", "activity name", "weight"], ["A", "STR", "S1", "A-01", "Slab casting", 60], ["A", "FIN", "S2", "A-02", "Painting", 40]],
  },
  status: {
    purpose: "The status of each activity in each villa (not started, in progress, under review, complete), to bring a site's state in from one file.",
    when: "When starting on a running site, or for a large update; daily updates go through «Progress update».",
    format: "One row per villa and activity. The status in words (complete, in progress…). The date is optional, as 2027-01-31.",
    after: "Activity statuses change and are logged, so percentages and colours change.",
    where: "«Latest updates», «Activities» and the «Site plan» colours.",
    columns: [c("unit number", true, "villa number"), c("activity code", true, ""), c("status", true, "not started / in progress / under review / complete"), c("verification status", false, ""), c("engineer email", false, ""), c("date", false, "")],
    example: [["unit number", "activity code", "status"], [1, "A-01", "complete"], [1, "A-02", "in progress"]],
  },
  requests: {
    purpose: "Inspection and handover requests and the consultant's replies.",
    when: "To bring the request log in from the contractor's or consultant's file.",
    format: "One row per request. Units as a list or range such as 1-5, 8. The date as 2027-01-31.",
    after: "Requests are created, or their reply updated by request number.",
    where: "«Approvals», «Pending» and «Inspections».",
    columns: [c("request number", true, ""), c("activity code", true, ""), c("units", true, "e.g. 1-5, 8"), c("request date", true, ""), c("contractor", false, ""), c("consultant", false, ""), c("response code", false, ""), c("notes", false, "")],
    example: [["request number", "activity code", "units", "request date"], ["WIR-001", "A-01", "1", "2027-01-10"]],
  },
  baseline: {
    purpose: "The monthly baseline: each activity's planned percent per month, from which the planned S-curve is drawn.",
    when: "When you have the plan month by month.",
    format: "One row per model, activity and month. The month as its first day (2027-01-01). The planned percent is cumulative, 0 to 100.",
    after: "The baseline points are saved; an existing point for the same month is updated.",
    where: "«Programme» and the S-curve.",
    columns: [c("model", true, ""), c("activity code", true, ""), c("month", true, "2027-01-01"), c("planned percent", true, "cumulative 0–100")],
    example: [["model", "activity code", "month", "planned percent"], ["A", "A-01", "2027-01-01", 50], ["A", "A-01", "2027-02-01", 100]],
  },
  baselineDates: {
    purpose: "The baseline by each activity's start and end dates; the platform works out the monthly percents between them.",
    when: "When your programme has dates rather than monthly percents.",
    format: "One row per model and activity. Both dates as 2027-01-31, the end after the start.",
    after: "Turned into monthly points like the monthly baseline and saved.",
    where: "«Programme» and the S-curve.",
    columns: [c("model", true, ""), c("activity code", true, ""), c("start date", true, ""), c("end date", true, "")],
    example: [["model", "activity code", "start date", "end date"], ["A", "A-01", "2027-01-01", "2027-03-31"]],
  },
};

// Urdu: the prose in Urdu, the column headers as the English file uses them (the importer reads both)
const urProse: Record<PmcGuideKind, Pick<KindGuide, "purpose" | "when" | "format" | "after" | "where">> = {
  weights: { purpose: "یونٹ میں ہر سرگرمی کا وزن (مثلاً کنکریٹ ولا کا 30%)؛ اسی سے ہر ولا اور منصوبے کی پیش رفت نکلتی ہے۔", when: "پہلے، کسی پیش رفت سے پہلے، پھر جب بھی وزن بدلیں۔", format: "ایک شیٹ: سرخیوں کی قطار، پھر ہر سرگرمی کی ایک قطار۔ وزن عدد یا فیصد (30، 30% یا 0.3)؛ ہر ماڈل کا مجموعہ 100%۔ صفر وزن والی قطاریں چھوڑ دی جاتی ہیں۔", after: "سرگرمیاں بنتی ہیں یا ان کا وزن بدلتا ہے؛ وہی فائل دوبارہ اپ لوڈ کرنے سے کچھ دہرایا نہیں جاتا۔", where: "اسی صفحے پر «یونٹ، وزن اور حیثیت» اور «سرگرمیاں»۔" },
  locations: { purpose: "ولاز کی فہرست: بلاک، ولا نمبر اور ماڈل، جو نقشے اور ہر اپ ڈیٹ کی بنیاد ہے۔", when: "وزن کی جدول کے بعد یا ساتھ، اور جب ولاز شامل ہوں۔", format: "ہر ولا کی ایک قطار۔ ولا نمبر مکمل عدد جو دہرایا نہ جائے۔ زون اختیاری۔", after: "نئے بلاک اور ولاز بنتے ہیں؛ موجودہ رہتے ہیں اور ان کا ماڈل اپ ڈیٹ ہوتا ہے۔", where: "«یونٹ، وزن اور حیثیت» اور «سائٹ پلان»۔" },
  catalog: { purpose: "مکمل کیٹلاگ: ہر ماڈل کے گروپ، مراحل، سرگرمیاں اور وزن۔", when: "وزن کی جدول کی جگہ، جب گروپ، مراحل اور WBS کوڈ چاہیے ہوں۔", format: "ہر ماڈل میں ہر سرگرمی کی ایک قطار۔ ماڈل کا مجموعہ 100%۔", after: "کیٹلاگ بنتا یا اپ ڈیٹ ہوتا ہے؛ سرگرمی کا کوڈ قطار کو موجودہ سے جوڑتا ہے۔", where: "«مراحل»، «سرگرمیاں» اور «یونٹ، وزن اور حیثیت»۔" },
  status: { purpose: "ہر ولا میں ہر سرگرمی کی حیثیت، ایک فائل سے سائٹ کی حالت لانے کے لیے۔", when: "چلتی سائٹ پر آغاز یا بڑی اپ ڈیٹ کے وقت؛ روزانہ اپ ڈیٹ «پیش رفت اپ ڈیٹ» سے۔", format: "ہر ولا اور سرگرمی کی ایک قطار۔ حیثیت الفاظ میں۔ تاریخ اختیاری، 2027-01-31۔", after: "حیثیتیں بدلتی اور ریکارڈ ہوتی ہیں، فیصد اور رنگ بدلتے ہیں۔", where: "«تازہ ترین اپ ڈیٹس»، «سرگرمیاں» اور «سائٹ پلان» کے رنگ۔" },
  requests: { purpose: "معائنے اور حوالگی کی درخواستیں اور کنسلٹنٹ کے جوابات۔", when: "ٹھیکیدار یا کنسلٹنٹ کی فائل سے درخواستوں کا ریکارڈ لانے کے لیے۔", format: "ہر درخواست کی ایک قطار۔ یونٹ فہرست یا رینج جیسے 1-5, 8۔ تاریخ 2027-01-31۔", after: "درخواستیں بنتی ہیں یا ان کا جواب درخواست نمبر سے اپ ڈیٹ ہوتا ہے۔", where: "«منظوریاں»، «زیر التوا» اور «معائنے»۔" },
  baseline: { purpose: "ماہانہ بیس لائن: ہر سرگرمی کی ہر مہینے منصوبہ بند فیصد، جس سے منصوبہ بند S-کرو بنتا ہے۔", when: "جب منصوبہ مہینہ بہ مہینہ ہو۔", format: "ہر ماڈل، سرگرمی اور مہینے کی ایک قطار۔ مہینہ پہلی تاریخ (2027-01-01)۔ فیصد مجموعی 0 سے 100۔", after: "بیس لائن کے نکات محفوظ ہوتے ہیں؛ اسی مہینے کا موجودہ نکتہ اپ ڈیٹ ہوتا ہے۔", where: "«پروگرام» اور S-کرو۔" },
  baselineDates: { purpose: "ہر سرگرمی کی آغاز اور اختتام کی تاریخوں سے بیس لائن؛ پلیٹ فارم درمیانی ماہانہ فیصد نکالتا ہے۔", when: "جب پروگرام میں تاریخیں ہوں، ماہانہ فیصد نہیں۔", format: "ہر ماڈل اور سرگرمی کی ایک قطار۔ دونوں تاریخیں 2027-01-31، اختتام آغاز کے بعد۔", after: "ماہانہ نکات میں بدل کر محفوظ ہوتا ہے۔", where: "«پروگرام» اور S-کرو۔" },
};
// the notes beside the column headers, in Urdu (a header with no note keeps none)
const urNotes: Record<string, string> = {
  "CSI section, e.g. 03": "CSI سیکشن، مثلاً 03", "a grouping inside the section": "سیکشن کے اندر گروہ", "generated when missing": "نہ ہو تو خود بنتا ہے", "the activity's name": "سرگرمی کا نام",
  "share of the unit": "یونٹ کا حصہ", "when weights differ by model": "جب ماڈل کے لحاظ سے وزن مختلف ہوں", "zone code": "زون کوڈ", "block code": "بلاک کوڈ", "villa number": "ولا نمبر",
  "model code": "ماڈل کوڈ", "when villas are not equal": "جب ولاز برابر نہ ہوں", "group code": "گروپ کوڈ", "stage code": "مرحلے کا کوڈ", "to link to costs": "لاگت سے جوڑنے کے لیے",
  "not started / in progress / under review / complete": "not started / in progress / under review / complete (انگریزی یا عربی میں)", "e.g. 1-5, 8": "مثلاً 1-5, 8", "cumulative 0–100": "مجموعی 0–100",
};
const ur = Object.fromEntries(PMC_GUIDE_KINDS.map(kind => [kind, { ...en[kind], ...urProse[kind], columns: en[kind].columns.map(column => ({ ...column, note: column.note ? urNotes[column.note] ?? column.note : "" })) }])) as Record<PmcGuideKind, KindGuide>;

export const PMC_IMPORT_GUIDE: Record<Language, Record<PmcGuideKind, KindGuide>> = { ar, en, ur };
