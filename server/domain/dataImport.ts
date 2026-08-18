import * as XLSX from "xlsx";

export type ImportModuleCode = "wbs" | "budget";
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
