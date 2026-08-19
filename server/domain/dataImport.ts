import * as XLSX from "xlsx";

export type ImportModuleCode = "wbs" | "budget";
export type ExportModuleCode = "wbs" | "budget" | "activities";
export type ImportError = { rowNumber: number; code: string; field?: string };
export type WbsImportRow = { rowNumber: number; values: { code: string; name: string; plannedValue: number } };
export type BudgetImportRow = { rowNumber: number; values: { costCode: string; originalAmount: number; currentAmount: number } };
export type ValidatedImportRow = WbsImportRow | BudgetImportRow;
export type MasterPlanMappingRow = { rowNumber: number; values: { code: string; status?: "not_started" | "in_progress" | "completed" | "blocked"; progressPercent?: number; plannedValue?: number; actualValue?: number; forecastValue?: number } };
export type MasterPlanSpatialImportRow = { rowNumber: number; values: { code: string; name: string; entityType: "block" | "building" | "zone" | "unit" | "area"; geometry: { x: number; y: number; width: number; height: number }; status: "not_started" | "in_progress" | "completed" | "blocked"; progressPercent: number; plannedValue: number; actualValue: number; forecastValue: number } };

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

const normalize = (value: unknown) => String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
const requiredText = (value: unknown) => String(value ?? "").trim();
const nonnegativeNumber = (value: unknown) => {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const percentage = (value: unknown) => {
  const source = String(value ?? "").trim(); const normalized = source.replace(/[%٬،,]/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  const normalizedPercent = typeof value === "number" && parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Number.isFinite(normalizedPercent) && normalizedPercent >= 0 && normalizedPercent <= 100 ? normalizedPercent : undefined;
};

const masterPlanFields: Field[] = [
  { key: "code", required: true, aliases: ["unit id", "unit", "entity id", "spatial entity", "code", "معرف الوحدة", "رقم الوحدة", "رمز الكيان", "الرمز"] },
  { key: "status", required: false, aliases: ["status", "حالة", "الحالة"] },
  { key: "progressPercent", required: false, aliases: ["progress", "progress percent", "completion", "التقدم", "نسبة التقدم", "الإنجاز"] },
  { key: "plannedValue", required: false, aliases: ["planned", "planned value", "القيمة المخططة", "المخطط"] },
  { key: "actualValue", required: false, aliases: ["actual", "actual value", "القيمة الفعلية", "الفعلي"] },
  { key: "forecastValue", required: false, aliases: ["forecast", "forecast value", "القيمة المتوقعة", "التوقع"] },
];

const masterPlanSpatialFields: Field[] = [
  { key: "code", required: true, aliases: ["unit id", "unit", "entity id", "spatial entity", "code", "معرف الوحدة", "رقم الوحدة", "رمز الكيان", "الرمز"] },
  { key: "name", required: true, aliases: ["name", "unit name", "entity name", "اسم الوحدة", "اسم الكيان", "الاسم"] },
  { key: "entityType", required: true, aliases: ["entity type", "type", "unit type", "نوع الكيان", "نوع الوحدة", "النوع"] },
  { key: "x", required: true, aliases: ["x", "horizontal", "المحور س", "س"] },
  { key: "y", required: true, aliases: ["y", "vertical", "المحور ص", "ص"] },
  { key: "width", required: true, aliases: ["width", "العرض"] },
  { key: "height", required: true, aliases: ["height", "الارتفاع"] },
  { key: "status", required: false, aliases: ["status", "حالة", "الحالة"] },
  { key: "progressPercent", required: false, aliases: ["progress", "progress percent", "completion", "التقدم", "نسبة التقدم", "الإنجاز"] },
  { key: "plannedValue", required: false, aliases: ["planned", "planned value", "القيمة المخططة", "المخطط"] },
  { key: "actualValue", required: false, aliases: ["actual", "actual value", "القيمة الفعلية", "الفعلي"] },
  { key: "forecastValue", required: false, aliases: ["forecast", "forecast value", "القيمة المتوقعة", "التوقع"] },
];

function normalizeMasterPlanStatus(value: unknown): MasterPlanMappingRow["values"]["status"] | "invalid" | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  const statuses: Record<string, NonNullable<MasterPlanMappingRow["values"]["status"]>> = { "not started": "not_started", "not_started": "not_started", "لم يبدأ": "not_started", "in progress": "in_progress", "in_progress": "in_progress", "قيد التنفيذ": "in_progress", completed: "completed", مكتمل: "completed", blocked: "blocked", متعثر: "blocked", محجوب: "blocked" };
  return statuses[normalized] ?? "invalid";
}

function normalizeMasterPlanEntityType(value: unknown): MasterPlanSpatialImportRow["values"]["entityType"] | "invalid" {
  const types: Record<string, MasterPlanSpatialImportRow["values"]["entityType"]> = { block: "block", building: "building", zone: "zone", unit: "unit", area: "area", كتلة: "block", مبنى: "building", منطقة: "zone", وحدة: "unit", مساحة: "area" };
  return types[normalize(value)] ?? "invalid";
}

export function analyzeMasterPlanMappingFile(input: { format: "xlsx" | "csv"; bytes: Uint8Array }) {
  const workbook = XLSX.read(input.bytes, { type: "array" }); const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { sheetNames: [], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanMappingRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" }); const headers = Object.keys(rows[0] ?? {});
  const mapping = Object.fromEntries(masterPlanFields.flatMap(field => { const header = headers.find(candidate => field.aliases.includes(normalize(candidate))); return header ? [[field.key, header]] : []; }));
  const errors: ImportError[] = masterPlanFields.filter(field => field.required && !mapping[field.key]).map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key })); const validRows: MasterPlanMappingRow[] = [];
  if (!errors.length) rows.forEach((row, index) => {
    const rowNumber = index + 2; const code = requiredText(row[mapping.code]); const status = mapping.status ? normalizeMasterPlanStatus(row[mapping.status]) : undefined; const progressPercent = mapping.progressPercent ? percentage(row[mapping.progressPercent]) : undefined; const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : undefined; const actualValue = mapping.actualValue ? nonnegativeNumber(row[mapping.actualValue]) : undefined; const forecastValue = mapping.forecastValue ? nonnegativeNumber(row[mapping.forecastValue]) : undefined;
    if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" }); if (status === "invalid") errors.push({ rowNumber, code: "MASTER_PLAN_MAPPING_STATUS_INVALID", field: "status" }); if (mapping.progressPercent && progressPercent === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "progressPercent" }); if (mapping.plannedValue && plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" }); if (mapping.actualValue && actualValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "actualValue" }); if (mapping.forecastValue && forecastValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "forecastValue" });
    if (code && status !== "invalid" && (!mapping.progressPercent || progressPercent !== undefined) && (!mapping.plannedValue || plannedValue !== undefined) && (!mapping.actualValue || actualValue !== undefined) && (!mapping.forecastValue || forecastValue !== undefined)) validRows.push({ rowNumber, values: { code, ...(status ? { status } : {}), ...(progressPercent !== undefined ? { progressPercent } : {}), ...(plannedValue !== undefined ? { plannedValue } : {}), ...(actualValue !== undefined ? { actualValue } : {}), ...(forecastValue !== undefined ? { forecastValue } : {}) } });
  });
  return { sheetNames: workbook.SheetNames, mapping, rows, validRows, errors };
}

export function analyzeMasterPlanSpatialEntityFile(input: { format: "xlsx" | "csv"; bytes: Uint8Array }) {
  const workbook = XLSX.read(input.format === "csv" ? Buffer.from(input.bytes).toString("utf8") : input.bytes, { type: input.format === "csv" ? "string" : "array" }); const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { sheetNames: [], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanSpatialImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" }); const headers = Object.keys(rows[0] ?? {});
  const mapping = Object.fromEntries(masterPlanSpatialFields.flatMap(field => { const header = headers.find(candidate => field.aliases.includes(normalize(candidate))); return header ? [[field.key, header]] : []; }));
  const errors: ImportError[] = masterPlanSpatialFields.filter(field => field.required && !mapping[field.key]).map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key })); const validRows: MasterPlanSpatialImportRow[] = [];
  if (!errors.length) rows.forEach((row, index) => {
    const rowNumber = index + 2; const code = requiredText(row[mapping.code]); const name = requiredText(row[mapping.name]); const entityType = normalizeMasterPlanEntityType(row[mapping.entityType]); const x = nonnegativeNumber(row[mapping.x]); const y = nonnegativeNumber(row[mapping.y]); const width = nonnegativeNumber(row[mapping.width]); const height = nonnegativeNumber(row[mapping.height]); const status = mapping.status ? normalizeMasterPlanStatus(row[mapping.status]) : undefined; const progressPercent = mapping.progressPercent ? percentage(row[mapping.progressPercent]) : 0; const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : 0; const actualValue = mapping.actualValue ? nonnegativeNumber(row[mapping.actualValue]) : 0; const forecastValue = mapping.forecastValue ? nonnegativeNumber(row[mapping.forecastValue]) : 0;
    if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" }); if (!name) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "name" }); if (entityType === "invalid") errors.push({ rowNumber, code: "MASTER_PLAN_SPATIAL_TYPE_INVALID", field: "entityType" }); if (x === undefined || y === undefined || width === undefined || height === undefined || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) errors.push({ rowNumber, code: "MASTER_PLAN_SPATIAL_GEOMETRY_INVALID", field: "geometry" }); if (status === "invalid") errors.push({ rowNumber, code: "MASTER_PLAN_MAPPING_STATUS_INVALID", field: "status" }); if (progressPercent === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "progressPercent" }); if (plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" }); if (actualValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "actualValue" }); if (forecastValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "forecastValue" });
    if (code && name && entityType !== "invalid" && x !== undefined && y !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0 && x + width <= 100 && y + height <= 100 && status !== "invalid" && progressPercent !== undefined && plannedValue !== undefined && actualValue !== undefined && forecastValue !== undefined) validRows.push({ rowNumber, values: { code, name, entityType, geometry: { x, y, width, height }, status: status ?? "not_started", progressPercent, plannedValue, actualValue, forecastValue } });
  });
  return { sheetNames: workbook.SheetNames, mapping, rows, validRows, errors };
}

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
