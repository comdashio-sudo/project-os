// The synonym dictionary: what a column may be called, in Arabic and English, as project files really spell it. One list per CONCEPT (not per importer), so a new importer reuses it and
// a new spelling is added in one place. Extensible at run time (`extendDictionary`) and per company (the saved source profiles carry the corrections people made).
export type Concept =
  | "itemCode" | "description" | "unit" | "quantity" | "rate" | "amount"
  | "start" | "finish" | "activityId" | "activityName" | "wbsCode" | "status" | "progress" | "duration"
  | "costCode" | "originalAmount" | "currentAmount"
  | "contractCode" | "contractTitle" | "counterparty" | "contractValue" | "currency"
  | "category" | "specification" | "supplier" | "date"
  | "previousQuantity" | "currentQuantity" | "cumulativeQuantity" | "retention" | "advance"
  | "labour" | "equipment" | "weather" | "work";

export const DICTIONARY: Record<Concept, string[]> = {
  itemCode: ["البند", "رقم البند", "رقم", "م", "ر.م", "كود", "الكود", "رمز", "الرمز", "رمز البند", "كود البند", "بند", "تسلسل", "الرقم", "item", "item no", "item number", "item code", "no", "code", "ref", "reference", "s/n", "sn", "sl no", "serial", "#", "ref no", "boq no", "boq ref", "material code", "رمز المادة", "كود المادة", "رقم المادة"],
  description: ["وصف", "الوصف", "وصف البند", "بيان", "البيان", "بيان الاعمال", "وصف الاعمال", "الاعمال", "التفاصيل", "تفاصيل", "اسم المادة", "المادة", "الصنف", "اسم الصنف", "description", "desc", "item description", "work description", "scope", "details", "particulars", "material", "material description", "name"],
  unit: ["الوحدة", "وحدة", "وحدة القياس", "وحدة الصرف", "uom", "unit", "units", "u/m", "um", "unit of measure", "unit of measurement", "وحدة الكمية"],
  quantity: ["الكمية", "كمية", "الكميات", "كمية العقد", "كمية المقاولة", "qty", "quantity", "quantities", "qnty", "contract qty", "contract quantity", "boq qty", "الكمية الكلية", "العدد", "عدد", "no of units", "الكميه"],
  rate: ["سعر الوحدة", "السعر", "سعر", "سعر الفئة", "السعر الافرادي", "الافرادي", "سعر الافرادي", "فئة السعر", "سعر المتر", "rate", "unit rate", "unit price", "price", "unit cost", "u.rate", "u/rate", "unitrate", "تكلفة الوحدة"],
  amount: ["الاجمالي", "اجمالي", "اجمالي البند", "اجمالي السعر", "المبلغ", "مبلغ", "القيمة", "قيمة", "القيمة الاجمالية", "الاجمالي بالريال", "المبلغ الاجمالي", "amount", "total", "total amount", "total price", "value", "line total", "extended", "sum", "total cost", "المجموع", "قيمة البند"],
  start: ["البداية", "تاريخ البداية", "بداية", "تاريخ البدء", "البدء", "تاريخ بدء", "تاريخ المباشرة", "المباشرة", "من تاريخ", "من", "start", "start date", "begin", "planned start", "early start", "baseline start", "commencement", "target start", "تاريخ بداية النشاط", "بداية النشاط"],
  finish: ["النهاية", "تاريخ النهاية", "نهاية", "تاريخ الانتهاء", "الانتهاء", "تاريخ انتهاء", "الى تاريخ", "إلى تاريخ", "الى", "finish", "finish date", "end", "end date", "planned finish", "completion date", "early finish", "baseline finish", "target finish", "نهاية النشاط", "تاريخ نهاية النشاط", "تاريخ الاكتمال"],
  activityId: ["رقم النشاط", "كود النشاط", "رمز النشاط", "معرف النشاط", "نشاط رقم", "activity id", "activity code", "activity no", "task id", "task code", "id", "wbs", "رقم المهمة"],
  activityName: ["اسم النشاط", "النشاط", "وصف النشاط", "المهمة", "اسم المهمة", "activity name", "activity", "task name", "task", "activity description", "الاعمال", "بيان النشاط"],
  wbsCode: ["رمز wbs", "كود wbs", "wbs", "wbs code", "هيكل العمل", "رمز هيكل العمل", "رقم الحزمة", "حزمة العمل", "package", "work package", "المجموعة", "القسم", "رمز القسم"],
  status: ["الحالة", "حالة", "status", "state", "حالة النشاط", "activity status", "وضع النشاط"],
  progress: ["نسبة الانجاز", "الانجاز", "% الانجاز", "نسبة", "التقدم", "نسبة التقدم", "الانجاز %", "progress", "% complete", "percent complete", "complete", "pct", "completion %", "actual %", "% done", "نسبة الاكتمال", "نسبة الانجاز %"],
  duration: ["المدة", "مدة", "مدة النشاط", "المدة بالايام", "duration", "dur", "days", "original duration", "الايام", "عدد الايام", "مدة (يوم)"],
  costCode: ["رمز التكلفة", "كود التكلفة", "بند الميزانية", "رمز بند الميزانية", "كود بند الميزانية", "رقم الحساب", "الحساب", "كود الحساب", "cost code", "budget code", "account", "account code", "cost account", "cost item", "code", "الكود", "رمز", "البند", "رقم البند"],
  originalAmount: ["القيمة الاصلية", "الميزانية الاصلية", "المبلغ الاصلي", "الميزانية", "الميزانية المعتمدة", "القيمة المعتمدة", "original", "original budget", "original amount", "budget", "approved budget", "baseline budget", "initial budget", "الميزانية الاولية"],
  currentAmount: ["القيمة الحالية", "الميزانية الحالية", "الميزانية المعدلة", "المعدلة", "المبلغ الحالي", "بعد التعديل", "التقدير الحالي", "current", "current budget", "revised budget", "revised", "current amount", "forecast", "latest budget", "adjusted budget"],
  contractCode: ["رقم العقد", "رمز العقد", "كود العقد", "رقم الاتفاقية", "contract no", "contract number", "contract code", "contract id", "agreement no", "contract ref", "العقد رقم"],
  contractTitle: ["موضوع العقد", "اسم العقد", "عنوان العقد", "وصف العقد", "العقد", "الموضوع", "contract title", "contract name", "title", "subject", "scope of work", "contract description", "اسم المشروع"],
  counterparty: ["الطرف المتعاقد", "المقاول", "المورد", "الطرف الثاني", "الطرف", "الجهة", "المقاول من الباطن", "اسم المقاول", "اسم المورد", "contractor", "counterparty", "vendor", "supplier", "party", "subcontractor", "second party", "company"],
  contractValue: ["قيمة العقد", "مبلغ العقد", "اجمالي العقد", "قيمة", "القيمة", "القيمة الاجمالية للعقد", "contract value", "contract amount", "contract sum", "value", "amount", "total value", "original contract value", "قيمة الاتفاقية"],
  currency: ["العملة", "عملة", "currency", "cur", "ccy", "ر.س"],
  category: ["الفئة", "التصنيف", "النوع", "الصنف", "مجموعة المواد", "المجموعة", "category", "type", "class", "group", "classification", "material type", "نوع المادة"],
  specification: ["المواصفة", "المواصفات", "المواصفة المرجعية", "المواصفه", "الدرجة", "العلامة التجارية", "specification", "spec", "specs", "standard", "grade", "brand", "model", "الماركة"],
  supplier: ["المورد", "اسم المورد", "الشركة الموردة", "supplier", "vendor", "supplied by"],
  date: ["التاريخ", "تاريخ", "التاريخ الميلادي", "تاريخ التوريد", "تاريخ التسليم", "تاريخ الاستلام", "date", "delivery date", "received date", "report date", "تاريخ التقرير", "اليوم"],
  previousQuantity: ["الكمية السابقة", "السابق", "سابق", "الاعمال السابقة", "previous", "previous qty", "previous quantity", "prev qty", "up to previous"],
  currentQuantity: ["الكمية الحالية", "الحالي", "هذا المستخلص", "الفترة الحالية", "this period", "this month", "current qty", "current quantity", "present qty"],
  cumulativeQuantity: ["الكمية التراكمية", "التراكمي", "الاجمالي التراكمي", "حتى تاريخه", "cumulative", "to date", "cumulative qty", "total to date"],
  retention: ["الاستقطاع", "المحتجز", "ضمان حسن التنفيذ", "الضمان", "retention", "retained", "retention amount"],
  advance: ["الدفعة المقدمة", "الدفعه المقدمة", "السلفة", "advance", "advance payment", "advance recovery"],
  labour: ["العمالة", "عدد العمال", "العمال", "القوى العاملة", "manpower", "labour", "labor", "workers", "headcount", "crew"],
  equipment: ["المعدات", "الآليات", "الاليات", "equipment", "machinery", "plant"],
  weather: ["الطقس", "الحالة الجوية", "حالة الطقس", "weather", "weather conditions"],
  work: ["الاعمال المنفذة", "اعمال اليوم", "الاعمال المنجزة", "work done", "work executed", "activities today", "work performed", "ملخص الاعمال"],
};

const extra: Partial<Record<Concept, string[]>> = {};
/** Adds spellings to the dictionary at run time (a deployment's own jargon, or a correction people keep making). */
export function extendDictionary(concept: Concept, words: string[]) { extra[concept] = [...(extra[concept] ?? []), ...words]; }
export const synonymsOf = (concept: Concept): string[] => [...DICTIONARY[concept], ...(extra[concept] ?? [])];

/** One spelling for comparison: Arabic diacritics and tatweel out, alef/yaa/taa-marbuta unified, Eastern digits to Western, punctuation to spaces, lowercase. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "").normalize("NFKC")
    .replace(/[٠-٩]/g, ch => String("٠١٢٣٤٥٦٧٨٩".indexOf(ch)))
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .toLowerCase().replace(/[_\-./\\()[\]{}:;,،؛*#]+/g, " ").replace(/\s+/g, " ").trim();
}

const levenshtein = (a: string, b: string) => {
  const rows = a.length + 1; const columns = b.length + 1; const matrix = Array.from({ length: rows }, (_unused, i) => [i, ...Array(columns - 1).fill(0)] as number[]);
  for (let j = 1; j < columns; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) for (let j = 1; j < columns; j++) matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return matrix[a.length][b.length];
};
const similarity = (a: string, b: string) => (a === b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1));

/**
 * How well a header names a concept, 0..1: the same words (1), the dictionary phrase inside the header or the header inside the phrase (0.7-0.92, by how much of the phrase it covers),
 * or a near spelling (a typo, a missing letter: up to 0.8). Short single letters ("م", "ر") only count when they are the whole header.
 */
export function scoreHeader(header: string, concept: Concept, extraWords: string[] = []): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const raw of [...synonymsOf(concept), ...extraWords]) {
    const s = normalizeHeader(raw);
    if (!s) continue;
    if (h === s) return 1;
    if (s.length <= 2) continue;
    const hTokens = h.split(" "); const sTokens = s.split(" ");
    const contained = (` ${h} `).includes(` ${s} `) || (` ${s} `).includes(` ${h} `);
    if (contained) { const shorter = Math.min(h.length, s.length); const longer = Math.max(h.length, s.length); best = Math.max(best, 0.7 + 0.22 * (shorter / longer)); continue; }
    const overlap = hTokens.filter(token => sTokens.includes(token) && token.length > 2).length;
    if (overlap) best = Math.max(best, 0.5 + 0.3 * (overlap / Math.max(hTokens.length, sTokens.length)));
    const sim = similarity(h, s);
    if (sim >= 0.78 && h.length >= 4) best = Math.max(best, sim * 0.8);
  }
  return Math.min(best, 0.99);
}
