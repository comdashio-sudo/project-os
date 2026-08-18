import * as XLSX from "xlsx";

export type ImportModuleCode = "wbs" | "budget";
type Field = { key: string; required: boolean; aliases: string[] };
const templates: Record<ImportModuleCode, Field[]> = {
  wbs: [{ key: "code", required: true, aliases: ["code", "wbs code", "رمز wbs", "رمز هيكل العمل"] }, { key: "name", required: true, aliases: ["name", "wbs name", "اسم wbs", "اسم هيكل العمل"] }, { key: "plannedValue", required: false, aliases: ["planned value", "القيمة المخططة"] }],
  budget: [{ key: "costCode", required: true, aliases: ["cost code", "رمز التكلفة"] }, { key: "originalAmount", required: true, aliases: ["original amount", "القيمة الأصلية"] }, { key: "currentAmount", required: true, aliases: ["current amount", "القيمة الحالية"] }],
};
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_\s-]+/g, " ");

export function analyzeImportFile(input: { moduleCode: ImportModuleCode; format: "xlsx" | "csv"; bytes: Uint8Array }) {
  const workbook = XLSX.read(input.bytes, { type: "array" }); const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { sheetNames: [], mapping: {}, rows: [], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" }); const headers = Object.keys(rows[0] ?? {});
  const mapping = Object.fromEntries(templates[input.moduleCode].flatMap(field => { const header = headers.find(candidate => field.aliases.includes(normalize(candidate))); return header ? [[field.key, header]] : []; }));
  const errors = templates[input.moduleCode].filter(field => field.required && !mapping[field.key]).map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key }));
  return { sheetNames: workbook.SheetNames, mapping, rows, errors };
}
