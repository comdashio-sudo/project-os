import type { Concept } from "./dictionary";

// What the platform can be given, and the fields each kind has. `module` is the existing importer a kind is translated into (null = recognised, but there is no importer for it yet:
// the preview says so plainly instead of pretending). Field keys are the importer's own keys, so the translation needs no second vocabulary.
export type FieldType = "text" | "number" | "date" | "unit" | "percent" | "status";
export type TargetField = { key: string; concept: Concept; required: boolean; type: FieldType; label: { ar: string; en: string } };
export type KindCode = "xer" | "boq" | "schedule" | "materials" | "budget" | "contracts" | "valuation" | "dailyReport";
export type ImportModule = "wbs" | "budget" | "contracts" | "materials" | "schedule";
export type KindDefinition = { code: KindCode; module: ImportModule | null; label: { ar: string; en: string }; fields: TargetField[]; keywords: RegExp[] };

const f = (key: string, concept: Concept, required: boolean, type: FieldType, ar: string, en: string): TargetField => ({ key, concept, required, type, label: { ar, en } });

export const KINDS: Record<Exclude<KindCode, "xer">, KindDefinition> = {
  boq: {
    code: "boq", module: "wbs", label: { ar: "جدول كميات (BOQ)", en: "Bill of quantities (BOQ)" },
    fields: [f("code", "itemCode", true, "text", "رقم البند", "Item no."), f("name", "description", true, "text", "وصف البند", "Description"), f("unit", "unit", false, "unit", "الوحدة", "Unit"), f("quantity", "quantity", false, "number", "الكمية", "Quantity"), f("rate", "rate", false, "number", "سعر الوحدة", "Unit rate"), f("amount", "amount", false, "number", "الإجمالي", "Amount")],
    keywords: [/جدول الكميات|حصر الكميات|كميات|bill of quantit|\bboq\b|quantities/i],
  },
  schedule: {
    code: "schedule", module: "schedule", label: { ar: "برنامج زمني", en: "Programme / schedule" },
    fields: [f("activityCode", "activityId", true, "text", "رقم النشاط", "Activity ID"), f("activityName", "activityName", true, "text", "اسم النشاط", "Activity name"), f("plannedStartAt", "start", true, "date", "البداية", "Start"), f("plannedFinishAt", "finish", true, "date", "النهاية", "Finish"), f("wbsCode", "wbsCode", false, "text", "رمز WBS", "WBS"), f("plannedValue", "amount", false, "number", "القيمة المخططة", "Planned value"), f("status", "status", false, "status", "الحالة", "Status"), f("progress", "progress", false, "percent", "نسبة الإنجاز", "% complete"), f("duration", "duration", false, "number", "المدة", "Duration")],
    keywords: [/برنامج زمني|الجدول الزمني|جدول زمني|schedule|programme|program\b|gantt|primavera/i],
  },
  materials: {
    code: "materials", module: "materials", label: { ar: "سجل مواد / تسليمات", en: "Materials / deliveries register" },
    fields: [f("code", "itemCode", true, "text", "رمز المادة", "Material code"), f("description", "description", true, "text", "الوصف", "Description"), f("unitOfMeasure", "unit", true, "unit", "الوحدة", "Unit"), f("category", "category", false, "text", "الفئة", "Category"), f("referenceSpecification", "specification", false, "text", "المواصفة", "Specification"), f("quantity", "quantity", false, "number", "الكمية", "Quantity"), f("supplier", "supplier", false, "text", "المورد", "Supplier"), f("date", "date", false, "date", "التاريخ", "Date")],
    keywords: [/مواد|توريد|تسليم|استلام|مخزون|materials?|deliver|goods received|stock/i],
  },
  budget: {
    code: "budget", module: "budget", label: { ar: "ميزانية", en: "Budget" },
    fields: [f("costCode", "costCode", true, "text", "رمز التكلفة", "Cost code"), f("description", "description", false, "text", "الوصف", "Description"), f("originalAmount", "originalAmount", true, "number", "القيمة الأصلية", "Original amount"), f("currentAmount", "currentAmount", false, "number", "القيمة الحالية", "Current amount")],
    keywords: [/ميزاني|budget|cost plan/i],
  },
  contracts: {
    code: "contracts", module: "contracts", label: { ar: "عقود", en: "Contracts" },
    fields: [f("code", "contractCode", true, "text", "رقم العقد", "Contract no."), f("title", "contractTitle", true, "text", "موضوع العقد", "Contract title"), f("counterparty", "counterparty", true, "text", "الطرف المتعاقد", "Counterparty"), f("contractValue", "contractValue", true, "number", "قيمة العقد", "Contract value"), f("currency", "currency", false, "text", "العملة", "Currency")],
    keywords: [/عقود|عقد|اتفاقي|contracts?|agreements?|subcontract/i],
  },
  valuation: {
    code: "valuation", module: null, label: { ar: "مستخلص", en: "Payment certificate (IPC)" },
    fields: [f("code", "itemCode", false, "text", "رقم البند", "Item no."), f("name", "description", false, "text", "الوصف", "Description"), f("unit", "unit", false, "unit", "الوحدة", "Unit"), f("quantity", "quantity", false, "number", "كمية العقد", "Contract qty"), f("previousQuantity", "previousQuantity", false, "number", "الكمية السابقة", "Previous"), f("currentQuantity", "currentQuantity", false, "number", "الكمية الحالية", "This period"), f("cumulativeQuantity", "cumulativeQuantity", false, "number", "التراكمي", "Cumulative"), f("rate", "rate", false, "number", "سعر الوحدة", "Rate"), f("amount", "amount", false, "number", "المبلغ", "Amount"), f("retention", "retention", false, "number", "الاستقطاع", "Retention"), f("advance", "advance", false, "number", "الدفعة المقدمة", "Advance")],
    keywords: [/مستخلص|شهادة دفع|ipc|payment certificate|interim payment|progress payment|valuation/i],
  },
  dailyReport: {
    code: "dailyReport", module: null, label: { ar: "تقرير يومي", en: "Daily report" },
    fields: [f("date", "date", false, "date", "التاريخ", "Date"), f("labour", "labour", false, "number", "العمالة", "Manpower"), f("equipment", "equipment", false, "text", "المعدات", "Equipment"), f("weather", "weather", false, "text", "الطقس", "Weather"), f("work", "work", false, "text", "الأعمال", "Work done")],
    keywords: [/تقرير يومي|التقرير اليومي|daily report|site diary|daily progress/i],
  },
};
export const KIND_CODES = Object.keys(KINDS) as Array<Exclude<KindCode, "xer">>;
