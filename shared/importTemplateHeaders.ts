// The column headers of each import template, in one table both sides read: the server writes them into the downloadable template (server/domain/dataImport.ts)
// and the import screen lists them as the required columns, so what the screen promises is what the file contains.
export type ImportModuleCode = "wbs" | "budget" | "contracts" | "materials" | "schedule" | "openingBalances";

export const importTemplateHeaders: Record<ImportModuleCode, Record<"ar" | "en", string[]>> = {
  wbs: { ar: ["رمز WBS", "اسم WBS", "القيمة المخططة"], en: ["WBS Code", "WBS Name", "Planned Value"] },
  budget: { ar: ["رمز التكلفة", "القيمة الأصلية", "القيمة الحالية"], en: ["Cost Code", "Original Amount", "Current Amount"] },
  contracts: { ar: ["رمز العقد", "اسم العقد", "الطرف المتعاقد", "قيمة العقد", "العملة"], en: ["Contract Code", "Contract Title", "Counterparty", "Contract Value", "Currency"] },
  materials: { ar: ["رمز المادة", "وصف المادة", "وحدة القياس", "الفئة", "المواصفة المرجعية"], en: ["Material Code", "Description", "Unit of Measure", "Category", "Reference Specification"] },
  openingBalances: { ar: ["رمز المستودع", "رمز المادة", "الكمية", "تكلفة الوحدة"], en: ["Warehouse Code", "Material Code", "Quantity", "Unit Cost"] },
  schedule: { ar: ["نوع السجل", "رمز WBS", "اسم WBS", "رمز النشاط", "اسم النشاط", "البداية المخططة", "النهاية المخططة", "القيمة المخططة", "الحالة"], en: ["Record Type", "WBS Code", "WBS Name", "Activity Code", "Activity Name", "Planned Start", "Planned Finish", "Planned Value", "Status"] },
};

/**
 * The header row an import template shows in a language. The importer matches these headers exactly (Arabic and English), so Urdu shows the
 * English row: an Urdu header would not import. Covered by server/exportLocale.test.ts.
 */
export const templateHeadersIn = (moduleCode: ImportModuleCode, locale: "ar" | "en" | "ur") => importTemplateHeaders[moduleCode][locale === "ar" ? "ar" : "en"];

/** D-44 (b): the equipment list's columns (an external import, server/equipmentImport.ts). The importer also accepts the aliases listed there. */
export const equipmentImportHeaders = { ar: ["النوع", "العدد", "الطراز", "اللوحة أو المقاس"], en: ["Type", "Count", "Model", "Plate or size"] } as const;
