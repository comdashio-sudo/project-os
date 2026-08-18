import * as XLSX from "xlsx";

export type ImportModuleCode = "wbs" | "budget";
export type ExportModuleCode = "wbs" | "budget" | "activities";
export type ImportError = { rowNumber: number; code: string; field?: string };
export type WbsImportRow = { rowNumber: number; values: { code: string; name: string; plannedValue: number } };
export type BudgetImportRow = { rowNumber: number; values: { costCode: string; originalAmount: number; currentAmount: number } };
export type ValidatedImportRow = WbsImportRow | BudgetImportRow;

type Field = { key: string; required: boolean; aliases: string[] };
const templates: Record<ImportModuleCode, Field[]> = {
  wbs: [
    { key: "code", required: true, aliases: ["code", "wbs code", "رمز wbs", "رمز هيكل العمل"] },
    { key: "name", required: true, aliases: ["name", "wbs name", "اسم wbs", "اسم هيكل العمل"] },
    { key: "plannedValue", required: false, aliases: ["planned value", "القيمة المخططة"] },
  ],
  budget: [
    { key: "costCode", required: true, aliases: ["cost code", "رمز التكلفة"] },
    { key: "originalAmount", required: true, aliases: ["original amount", "القيمة الأصلية"] },
    { key: "currentAmount", required: true, aliases: ["current amount", "القيمة الحالية"] },
  ],
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
const requiredText = (value: unknown) => String(value ?? "").trim();
const nonnegativeNumber = (value: unknown) => {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export function analyzeImportFile(input: { moduleCode: ImportModuleCode; format: "xlsx" | "csv"; bytes: Uint8Array }) {
  const workbook = XLSX.read(input.bytes, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { sheetNames: [], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ValidatedImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
  const headers = Object.keys(rows[0] ?? {});
  const mapping = Object.fromEntries(
    templates[input.moduleCode].flatMap(field => {
      const header = headers.find(candidate => field.aliases.includes(normalize(candidate)));
      return header ? [[field.key, header]] : [];
    }),
  );
  const errors: ImportError[] = templates[input.moduleCode]
    .filter(field => field.required && !mapping[field.key])
    .map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key }));
  const validRows: ValidatedImportRow[] = [];

  if (!errors.length) {
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      if (input.moduleCode === "wbs") {
        const code = requiredText(row[mapping.code]);
        const name = requiredText(row[mapping.name]);
        const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : 0;
        if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" });
        if (!name) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "name" });
        if (plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" });
        if (code && name && plannedValue !== undefined) validRows.push({ rowNumber, values: { code, name, plannedValue } });
        return;
      }

      const costCode = requiredText(row[mapping.costCode]);
      const originalAmount = nonnegativeNumber(row[mapping.originalAmount]);
      const currentAmount = nonnegativeNumber(row[mapping.currentAmount]);
      if (!costCode) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "costCode" });
      if (originalAmount === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "originalAmount" });
      if (currentAmount === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "currentAmount" });
      if (costCode && originalAmount !== undefined && currentAmount !== undefined) validRows.push({ rowNumber, values: { costCode, originalAmount, currentAmount } });
    });
  }

  return { sheetNames: workbook.SheetNames, mapping, rows, validRows, errors };
}

const exportHeaders: Record<ExportModuleCode, Record<"ar" | "en", Record<string, string>>> = {
  wbs: { ar: { code: "رمز WBS", name: "اسم WBS", plannedValue: "القيمة المخططة" }, en: { code: "WBS Code", name: "WBS Name", plannedValue: "Planned Value" } },
  budget: { ar: { costCode: "رمز التكلفة", originalAmount: "القيمة الأصلية", currentAmount: "القيمة الحالية" }, en: { costCode: "Cost Code", originalAmount: "Original Amount", currentAmount: "Current Amount" } },
  activities: { ar: { code: "رمز النشاط", name: "اسم النشاط", plannedValue: "القيمة المخططة", plannedStartAt: "البداية المخططة", plannedFinishAt: "النهاية المخططة", status: "الحالة" }, en: { code: "Activity Code", name: "Activity Name", plannedValue: "Planned Value", plannedStartAt: "Planned Start", plannedFinishAt: "Planned Finish", status: "Status" } },
};

export function buildDataExportFile(input: { moduleCode: ExportModuleCode; format: "xlsx" | "csv"; locale: "ar" | "en"; rows: Record<string, unknown>[] }) {
  const headers = exportHeaders[input.moduleCode][input.locale];
  const exportRows = input.rows.map(row => Object.fromEntries(Object.entries(headers).map(([key, label]) => [label, row[key] ?? ""])));
  const sheet = XLSX.utils.json_to_sheet(exportRows, { header: Object.values(headers) });
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, input.moduleCode.toUpperCase());
  const bytes = input.format === "csv" ? Buffer.from(XLSX.utils.sheet_to_csv(sheet), "utf8") : Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  const extension = input.format === "csv" ? "csv" : "xlsx";
  return { bytes, fileName: `${input.moduleCode}-export.${extension}`, contentType: input.format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
