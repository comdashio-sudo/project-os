import { buildSpreadsheet, MAX_XER_ROWS, readSpreadsheetSafely, spreadsheetBoundsError, worksheetToRows } from "./excelWorkbook";

export type ImportModuleCode = "wbs" | "budget" | "contracts" | "materials" | "schedule" | "openingBalances";
export type ExportModuleCode = "wbs" | "budget" | "activities";
export type ImportError = { rowNumber: number; code: string; field?: string };
export type WbsImportRow = { rowNumber: number; values: { code: string; name: string; plannedValue: number } };
export type BudgetImportRow = { rowNumber: number; values: { costCode: string; originalAmount: number; currentAmount: number } };
export type ContractImportRow = { rowNumber: number; values: { code: string; title: string; counterparty: string; contractValue: number; currency: string } };
export type MaterialImportRow = { rowNumber: number; values: { code: string; description: string; unitOfMeasure: string; category: string; referenceSpecification?: string } };
export type OpeningBalanceImportRow = { rowNumber: number; values: { warehouseCode: string; materialCode: string; quantity: number; unitCost: number } };
export type ScheduleWbsImportRow = { rowNumber: number; kind: "wbs"; values: { code: string; name: string; plannedValue: number } };
export type ScheduleActivityImportRow = { rowNumber: number; kind: "activity"; values: { wbsCode: string; code: string; name: string; plannedStartAt: Date; plannedFinishAt: Date; plannedValue: number; status: "not_started" | "in_progress" | "completed" | "blocked" } };
export type ScheduleImportRow = ScheduleWbsImportRow | ScheduleActivityImportRow;
export type ValidatedImportRow = WbsImportRow | BudgetImportRow | ContractImportRow | MaterialImportRow | ScheduleImportRow | OpeningBalanceImportRow;
export type MasterPlanMappingRow = { rowNumber: number; values: { code: string; status?: "not_started" | "in_progress" | "completed" | "blocked"; progressPercent?: number; plannedValue?: number; actualValue?: number; forecastValue?: number } };
export type MasterPlanSpatialImportRow = { rowNumber: number; values: { code: string; name: string; entityType: "block" | "building" | "zone" | "unit" | "area"; geometry: { x: number; y: number; width: number; height: number }; status: "not_started" | "in_progress" | "completed" | "blocked"; progressPercent: number; plannedValue: number; actualValue: number; forecastValue: number; parentCode?: string; wbsCode?: string; activityCode?: string } };

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
  contracts: [
    { key: "code", required: true, aliases: ["contract code", "code", "رمز العقد", "الرمز"] },
    { key: "title", required: true, aliases: ["contract title", "title", "اسم العقد", "العقد"] },
    { key: "counterparty", required: true, aliases: ["counterparty", "contractor", "party", "الطرف المتعاقد", "المقاول"] },
    { key: "contractValue", required: true, aliases: ["contract value", "value", "قيمة العقد", "القيمة"] },
    { key: "currency", required: true, aliases: ["currency", "عملة", "العملة"] },
  ],
  materials: [
    { key: "code", required: true, aliases: ["material code", "code", "رمز المادة", "الرمز"] },
    { key: "description", required: true, aliases: ["description", "material description", "وصف المادة", "الوصف"] },
    { key: "unitOfMeasure", required: true, aliases: ["unit of measure", "uom", "unit", "وحدة القياس", "الوحدة"] },
    { key: "category", required: true, aliases: ["category", "classification", "تصنيف", "الفئة"] },
    { key: "referenceSpecification", required: false, aliases: ["reference specification", "specification", "المواصفة المرجعية", "المواصفة"] },
  ],
  // Opening stock (G-105): how much of each material is already in each warehouse the day the project starts using the system.
  openingBalances: [
    { key: "warehouseCode", required: true, aliases: ["warehouse code", "warehouse", "رمز المستودع", "المستودع"] },
    { key: "materialCode", required: true, aliases: ["material code", "material", "رمز المادة", "المادة"] },
    { key: "quantity", required: true, aliases: ["quantity", "opening quantity", "qty", "الكمية", "الرصيد الافتتاحي"] },
    // The price the opening stock is valued at (work order 3): stock without a price cannot enter the weighted average and would be reported as worth nothing.
    { key: "unitCost", required: true, aliases: ["unit cost", "cost", "unit price", "price", "تكلفة الوحدة", "سعر الوحدة", "التكلفة", "السعر"] },
  ],
  schedule: [
    { key: "recordType", required: true, aliases: ["record type", "type", "نوع السجل", "النوع"] },
    { key: "wbsCode", required: true, aliases: ["wbs code", "wbs", "رمز wbs", "رمز هيكل العمل"] },
    { key: "wbsName", required: false, aliases: ["wbs name", "اسم wbs", "اسم هيكل العمل"] },
    { key: "activityCode", required: false, aliases: ["activity code", "activity id", "رمز النشاط", "معرف النشاط"] },
    { key: "activityName", required: false, aliases: ["activity name", "activity", "اسم النشاط", "النشاط"] },
    { key: "plannedStartAt", required: false, aliases: ["planned start", "start", "target start", "البداية المخططة", "بداية النشاط"] },
    { key: "plannedFinishAt", required: false, aliases: ["planned finish", "finish", "target finish", "النهاية المخططة", "نهاية النشاط"] },
    { key: "plannedValue", required: false, aliases: ["planned value", "budgeted cost", "target cost", "القيمة المخططة", "التكلفة المخططة"] },
    { key: "status", required: false, aliases: ["status", "activity status", "حالة", "الحالة"] },
  ],
};

const normalize = (value: unknown) => String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
const requiredText = (value: unknown) => String(value ?? "").trim();
const safeSpreadsheetValue = (value: unknown) => typeof value === "string" && /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
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

const scheduleStatus = (value: unknown): ScheduleActivityImportRow["values"]["status"] | "invalid" => {
  const status = normalize(value);
  const statuses: Record<string, ScheduleActivityImportRow["values"]["status"]> = { "not started": "not_started", not_started: "not_started", "tk notstart": "not_started", "لم يبدأ": "not_started", "in progress": "in_progress", in_progress: "in_progress", "tk active": "in_progress", "قيد التنفيذ": "in_progress", completed: "completed", "tk complete": "completed", مكتمل: "completed", blocked: "blocked", "tk suspended": "blocked", متعثر: "blocked" };
  return statuses[status] ?? "invalid";
};

const importDate = (value: unknown) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const source = requiredText(value); const parsed = Date.parse(source.includes("T") ? source : source.replace(" ", "T"));
  return source && Number.isFinite(parsed) ? new Date(parsed) : undefined;
};

function analyzeScheduleRows(rows: Record<string, unknown>[], headers: string[], mapping: Record<string, string>, sheetNames: string[]) {
  const errors: ImportError[] = []; const validRows: ScheduleImportRow[] = []; const wbsCodes = new Set<string>(); const activityCodes = new Set<string>(); const activitiesToResolve: ScheduleActivityImportRow[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2; const recordType = normalize(row[mapping.recordType]); const wbsCode = requiredText(row[mapping.wbsCode]);
    if (recordType !== "wbs" && recordType !== "activity") { errors.push({ rowNumber, code: "SCHEDULE_RECORD_TYPE_INVALID", field: "recordType" }); return; }
    if (!wbsCode) { errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "wbsCode" }); return; }
    if (recordType === "wbs") {
      const name = requiredText(row[mapping.wbsName]); const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : 0;
      if (!name) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "wbsName" }); if (plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" }); if (wbsCodes.has(wbsCode)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "wbsCode" });
      if (name && plannedValue !== undefined && !wbsCodes.has(wbsCode)) { wbsCodes.add(wbsCode); validRows.push({ rowNumber, kind: "wbs", values: { code: wbsCode, name, plannedValue } }); }
      return;
    }
    const code = requiredText(row[mapping.activityCode]); const name = requiredText(row[mapping.activityName]); const plannedStartAt = importDate(row[mapping.plannedStartAt]); const plannedFinishAt = importDate(row[mapping.plannedFinishAt]); const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : 0; const status = mapping.status ? scheduleStatus(row[mapping.status]) : "not_started";
    if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "activityCode" }); if (!name) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "activityName" }); if (!plannedStartAt || !plannedFinishAt || plannedFinishAt < plannedStartAt) errors.push({ rowNumber, code: "SCHEDULE_DATE_INVALID", field: "plannedFinishAt" }); if (plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" }); if (status === "invalid") errors.push({ rowNumber, code: "SCHEDULE_STATUS_INVALID", field: "status" }); if (activityCodes.has(code)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "activityCode" });
    if (code && name && plannedStartAt && plannedFinishAt && plannedFinishAt >= plannedStartAt && plannedValue !== undefined && status !== "invalid" && !activityCodes.has(code)) { activityCodes.add(code); activitiesToResolve.push({ rowNumber, kind: "activity", values: { wbsCode, code, name, plannedStartAt, plannedFinishAt, plannedValue, status } }); }
  });
  activitiesToResolve.forEach(activity => { if (!wbsCodes.has(activity.values.wbsCode)) errors.push({ rowNumber: activity.rowNumber, code: "SCHEDULE_WBS_REFERENCE_UNRESOLVED", field: "wbsCode" }); else validRows.push(activity); });
  return { sheetNames, headers, mapping, rows, validRows, errors };
}

export async function analyzeScheduleImportFile(input: { format: "xlsx" | "xer"; bytes: Uint8Array }) {
  if (input.format === "xlsx") {
    const parsed = await readSpreadsheetSafely(input.bytes, "xlsx");
    if (!parsed.ok) return { sheetNames: [] as string[], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: parsed.code }] };
    const workbook = parsed.workbook;
    const sheetNames = workbook.worksheets.map(sheet => sheet.name);
    if (sheetNames.length !== 1) return { sheetNames, headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_SINGLE_SHEET_REQUIRED" }] as ImportError[] };
    const sheet = workbook.worksheets[0]; if (!sheet) return { sheetNames: [], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };
    const { rows, headers } = worksheetToRows(sheet); const mapping = Object.fromEntries(templates.schedule.flatMap(field => { const header = headers.find(candidate => field.aliases.includes(normalize(candidate))); return header ? [[field.key, header]] : []; })); const requiredErrors = templates.schedule.filter(field => field.required && !mapping[field.key]).map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key })); const knownHeaders = new Set(templates.schedule.flatMap(field => field.aliases)); const unsupported = headers.filter(header => !knownHeaders.has(normalize(header))).map(header => ({ rowNumber: 0, code: "IMPORT_UNSUPPORTED_COLUMN", field: header }));
    const boundsError = spreadsheetBoundsError(sheet, rows); if (boundsError) return { sheetNames, headers, mapping, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: boundsError }] };
    return requiredErrors.length || unsupported.length ? { sheetNames, headers, mapping, rows, validRows: [] as ScheduleImportRow[], errors: [...requiredErrors, ...unsupported] } : analyzeScheduleRows(rows, headers, mapping, sheetNames);
  }
  const tables = new Map<string, { fields: string[]; rows: { values: Record<string, string> }[] }>(); let active: { name: string; fields: string[]; rows: { values: Record<string, string> }[] } | undefined;
  Buffer.from(input.bytes).toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).forEach(line => { const [tag, ...values] = line.split("\t"); if (tag === "%T") { active = { name: values[0] ?? "", fields: [], rows: [] }; tables.set(active.name, active); } else if (tag === "%F" && active) active.fields = values; else if (tag === "%R" && active && active.fields.length) active.rows.push({ values: Object.fromEntries(active.fields.map((field, index) => [field, values[index] ?? ""])) }); });
  const unsupportedTables = Array.from(tables.keys()).filter(table => table !== "PROJWBS" && table !== "TASK"); if (unsupportedTables.length) return { sheetNames: [] as string[], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: unsupportedTables.map(table => ({ rowNumber: 0, code: "XER_UNSUPPORTED_TABLE", field: table })) as ImportError[] };
  const wbs = tables.get("PROJWBS"); const tasks = tables.get("TASK"); if (wbs && tasks && wbs.rows.length + tasks.rows.length > MAX_XER_ROWS) return { sheetNames: [] as string[], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_TOO_MANY_ROWS" }] as ImportError[] }; if (!wbs || !tasks) return { sheetNames: [] as string[], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: "XER_REQUIRED_TABLE_MISSING" }] as ImportError[] };
  const codeByWbsId = new Map(wbs.rows.map(row => [row.values.wbs_id, row.values.wbs_short_name])); const rows = [...wbs.rows.map(row => ({ "Record Type": "wbs", "WBS Code": row.values.wbs_short_name, "WBS Name": row.values.wbs_name, "Planned Value": row.values.wbs_cost ?? "0" })), ...tasks.rows.map(row => ({ "Record Type": "activity", "WBS Code": codeByWbsId.get(row.values.wbs_id) ?? "", "Activity Code": row.values.task_code, "Activity Name": row.values.task_name, "Planned Start": row.values.target_start_date, "Planned Finish": row.values.target_end_date, "Planned Value": row.values.target_cost ?? "0", Status: row.values.status_code }))]; const mapping = { recordType: "Record Type", wbsCode: "WBS Code", wbsName: "WBS Name", activityCode: "Activity Code", activityName: "Activity Name", plannedStartAt: "Planned Start", plannedFinishAt: "Planned Finish", plannedValue: "Planned Value", status: "Status" };
  return analyzeScheduleRows(rows, Object.values(mapping), mapping, ["PROJWBS", "TASK"]);
}

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
  { key: "parentCode", required: false, aliases: ["parent code", "parent", "parent entity", "رمز الأب", "رمز الكيان الأب", "الكيان الأب"] },
  { key: "wbsCode", required: false, aliases: ["wbs code", "wbs", "رمز wbs", "رمز هيكل العمل"] },
  { key: "activityCode", required: false, aliases: ["activity code", "activity", "رمز النشاط", "النشاط"] },
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

export async function analyzeMasterPlanMappingFile(input: { format: "xlsx" | "csv"; bytes: Uint8Array }) {
  const parsed = await readSpreadsheetSafely(input.format === "csv" ? Buffer.from(input.bytes).toString("utf8") : input.bytes, input.format);
  if (!parsed.ok) return { sheetNames: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanMappingRow[], errors: [{ rowNumber: 0, code: parsed.code }] };
  const workbook = parsed.workbook; const sheet = workbook.worksheets[0];
  const sheetNames = workbook.worksheets.map(item => item.name);
  if (!sheet) return { sheetNames: [], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanMappingRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };
  const { rows, headers } = worksheetToRows(sheet);
  const boundsError = spreadsheetBoundsError(sheet, rows); if (boundsError) return { sheetNames, mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanMappingRow[], errors: [{ rowNumber: 0, code: boundsError }] };
  const mapping = Object.fromEntries(masterPlanFields.flatMap(field => { const header = headers.find(candidate => field.aliases.includes(normalize(candidate))); return header ? [[field.key, header]] : []; }));
  const errors: ImportError[] = masterPlanFields.filter(field => field.required && !mapping[field.key]).map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key })); const validRows: MasterPlanMappingRow[] = [];
  if (!errors.length) rows.forEach((row, index) => {
    const rowNumber = index + 2; const code = requiredText(row[mapping.code]); const status = mapping.status ? normalizeMasterPlanStatus(row[mapping.status]) : undefined; const progressPercent = mapping.progressPercent ? percentage(row[mapping.progressPercent]) : undefined; const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : undefined; const actualValue = mapping.actualValue ? nonnegativeNumber(row[mapping.actualValue]) : undefined; const forecastValue = mapping.forecastValue ? nonnegativeNumber(row[mapping.forecastValue]) : undefined;
    if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" }); if (status === "invalid") errors.push({ rowNumber, code: "MASTER_PLAN_MAPPING_STATUS_INVALID", field: "status" }); if (mapping.progressPercent && progressPercent === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "progressPercent" }); if (mapping.plannedValue && plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" }); if (mapping.actualValue && actualValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "actualValue" }); if (mapping.forecastValue && forecastValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "forecastValue" });
    if (code && status !== "invalid" && (!mapping.progressPercent || progressPercent !== undefined) && (!mapping.plannedValue || plannedValue !== undefined) && (!mapping.actualValue || actualValue !== undefined) && (!mapping.forecastValue || forecastValue !== undefined)) validRows.push({ rowNumber, values: { code, ...(status ? { status } : {}), ...(progressPercent !== undefined ? { progressPercent } : {}), ...(plannedValue !== undefined ? { plannedValue } : {}), ...(actualValue !== undefined ? { actualValue } : {}), ...(forecastValue !== undefined ? { forecastValue } : {}) } });
  });
  return { sheetNames, mapping, rows, validRows, errors };
}

export async function analyzeMasterPlanSpatialEntityFile(input: { format: "xlsx" | "csv"; bytes: Uint8Array }) {
  const parsed = await readSpreadsheetSafely(input.format === "csv" ? Buffer.from(input.bytes).toString("utf8") : input.bytes, input.format);
  if (!parsed.ok) return { sheetNames: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanSpatialImportRow[], errors: [{ rowNumber: 0, code: parsed.code }] };
  const workbook = parsed.workbook; const sheet = workbook.worksheets[0]; const sheetNames = workbook.worksheets.map(item => item.name);
  if (!sheet) return { sheetNames: [], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanSpatialImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };
  const { rows, headers } = worksheetToRows(sheet);
  const boundsError = spreadsheetBoundsError(sheet, rows); if (boundsError) return { sheetNames, mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as MasterPlanSpatialImportRow[], errors: [{ rowNumber: 0, code: boundsError }] };
  const mapping = Object.fromEntries(masterPlanSpatialFields.flatMap(field => { const header = headers.find(candidate => field.aliases.includes(normalize(candidate))); return header ? [[field.key, header]] : []; }));
  const errors: ImportError[] = masterPlanSpatialFields.filter(field => field.required && !mapping[field.key]).map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key })); const validRows: MasterPlanSpatialImportRow[] = [];
  if (!errors.length) rows.forEach((row, index) => {
    const rowNumber = index + 2; const code = requiredText(row[mapping.code]); const name = requiredText(row[mapping.name]); const entityType = normalizeMasterPlanEntityType(row[mapping.entityType]); const x = nonnegativeNumber(row[mapping.x]); const y = nonnegativeNumber(row[mapping.y]); const width = nonnegativeNumber(row[mapping.width]); const height = nonnegativeNumber(row[mapping.height]); const status = mapping.status ? normalizeMasterPlanStatus(row[mapping.status]) : undefined; const progressPercent = mapping.progressPercent ? percentage(row[mapping.progressPercent]) : 0; const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : 0; const actualValue = mapping.actualValue ? nonnegativeNumber(row[mapping.actualValue]) : 0; const forecastValue = mapping.forecastValue ? nonnegativeNumber(row[mapping.forecastValue]) : 0; const parentCode = mapping.parentCode ? requiredText(row[mapping.parentCode]) || undefined : undefined; const wbsCode = mapping.wbsCode ? requiredText(row[mapping.wbsCode]) || undefined : undefined; const activityCode = mapping.activityCode ? requiredText(row[mapping.activityCode]) || undefined : undefined;
    if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" }); if (!name) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "name" }); if (entityType === "invalid") errors.push({ rowNumber, code: "MASTER_PLAN_SPATIAL_TYPE_INVALID", field: "entityType" }); if (x === undefined || y === undefined || width === undefined || height === undefined || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) errors.push({ rowNumber, code: "MASTER_PLAN_SPATIAL_GEOMETRY_INVALID", field: "geometry" }); if (status === "invalid") errors.push({ rowNumber, code: "MASTER_PLAN_MAPPING_STATUS_INVALID", field: "status" }); if (progressPercent === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "progressPercent" }); if (plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" }); if (actualValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "actualValue" }); if (forecastValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "forecastValue" });
    if (code && name && entityType !== "invalid" && x !== undefined && y !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0 && x + width <= 100 && y + height <= 100 && status !== "invalid" && progressPercent !== undefined && plannedValue !== undefined && actualValue !== undefined && forecastValue !== undefined) validRows.push({ rowNumber, values: { code, name, entityType, geometry: { x, y, width, height }, status: status ?? "not_started", progressPercent, plannedValue, actualValue, forecastValue, ...(parentCode ? { parentCode } : {}), ...(wbsCode ? { wbsCode } : {}), ...(activityCode ? { activityCode } : {}) } });
  });
  return { sheetNames, mapping, rows, validRows, errors };
}

export async function analyzeImportFile(input: { moduleCode: ImportModuleCode; format: "xlsx" | "csv" | "xer"; bytes: Uint8Array; mappingOverride?: Record<string, string> }) {
  if (input.moduleCode === "schedule") return input.format === "xlsx" || input.format === "xer" ? await analyzeScheduleImportFile({ format: input.format, bytes: input.bytes }) : { sheetNames: [], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ScheduleImportRow[], errors: [{ rowNumber: 0, code: "SCHEDULE_FORMAT_INVALID" }] as ImportError[] };
  if (input.format === "xer") return { sheetNames: [], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ValidatedImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_FORMAT_INVALID" }] as ImportError[] };
  const parsed = await readSpreadsheetSafely(input.format === "csv" ? Buffer.from(input.bytes).toString("utf8") : input.bytes, input.format);
  if (!parsed.ok) return { sheetNames: [] as string[], headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ValidatedImportRow[], errors: [{ rowNumber: 0, code: parsed.code }] };
  const workbook = parsed.workbook;
  const sheetNames = workbook.worksheets.map(sheet => sheet.name);
  if (sheetNames.length !== 1) return { sheetNames, headers: [] as string[], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ValidatedImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_SINGLE_SHEET_REQUIRED" }] as ImportError[] };
  const sheet = workbook.worksheets[0];
  if (!sheet) return { sheetNames: [], mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ValidatedImportRow[], errors: [{ rowNumber: 0, code: "IMPORT_EMPTY_WORKBOOK" }] as ImportError[] };

  const { rows, headers } = worksheetToRows(sheet);
  const boundsError = spreadsheetBoundsError(sheet, rows); if (boundsError) return { sheetNames, headers, mapping: {} as Record<string, string>, rows: [] as Record<string, unknown>[], validRows: [] as ValidatedImportRow[], errors: [{ rowNumber: 0, code: boundsError }] };
  const inferredMapping = Object.fromEntries(
    templates[input.moduleCode].flatMap(field => {
      const header = headers.find(candidate => field.aliases.includes(normalize(candidate)));
      return header ? [[field.key, header]] : [];
    }),
  );
  const permittedFields = new Set(templates[input.moduleCode].map(field => field.key));
  const requestedMapping = Object.entries(input.mappingOverride ?? {}).filter(([field, header]) => permittedFields.has(field) && headers.includes(header));
  const mapping = { ...inferredMapping, ...Object.fromEntries(requestedMapping) };
  const knownHeaders = new Set(templates[input.moduleCode].flatMap(field => field.aliases));
  const explicitlyMappedHeaders = new Set(requestedMapping.map(([, header]) => header));
  const errors: ImportError[] = Object.values(Object.fromEntries(requestedMapping)).length !== new Set(requestedMapping.map(([, header]) => header)).size
    ? [{ rowNumber: 0, code: "IMPORT_MAPPING_INVALID" }]
    : [];
  errors.push(...headers.filter(header => !knownHeaders.has(normalize(header)) && !explicitlyMappedHeaders.has(header)).map(header => ({ rowNumber: 0, code: "IMPORT_UNSUPPORTED_COLUMN", field: header })));
  errors.push(...templates[input.moduleCode]
    .filter(field => field.required && !mapping[field.key])
    .map(field => ({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key })));
  const validRows: ValidatedImportRow[] = [];

  if (!errors.length) {
    const fileKeys = new Set<string>();
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      if (input.moduleCode === "wbs") {
        const code = requiredText(row[mapping.code]);
        const name = requiredText(row[mapping.name]);
        const plannedValue = mapping.plannedValue ? nonnegativeNumber(row[mapping.plannedValue]) : 0;
        if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" });
        if (!name) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "name" });
        if (plannedValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedValue" });
        if (code && fileKeys.has(code)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "code" });
        if (code && name && plannedValue !== undefined && !fileKeys.has(code)) { fileKeys.add(code); validRows.push({ rowNumber, values: { code, name, plannedValue } }); }
        return;
      }

      if (input.moduleCode === "budget") {
        const costCode = requiredText(row[mapping.costCode]);
        const originalAmount = nonnegativeNumber(row[mapping.originalAmount]);
        const currentAmount = nonnegativeNumber(row[mapping.currentAmount]);
        if (!costCode) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "costCode" });
        if (originalAmount === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "originalAmount" });
        if (currentAmount === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "currentAmount" });
        if (costCode && fileKeys.has(costCode)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "costCode" });
        if (costCode && originalAmount !== undefined && currentAmount !== undefined && !fileKeys.has(costCode)) { fileKeys.add(costCode); validRows.push({ rowNumber, values: { costCode, originalAmount, currentAmount } }); }
        return;
      }
      if (input.moduleCode === "openingBalances") {
        const warehouseCode = requiredText(row[mapping.warehouseCode]); const materialCode = requiredText(row[mapping.materialCode]); const quantity = nonnegativeNumber(row[mapping.quantity]); const unitCost = nonnegativeNumber(row[mapping.unitCost]);
        const key = `${warehouseCode}|${materialCode}`;
        if (!warehouseCode) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "warehouseCode" });
        if (!materialCode) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "materialCode" });
        if (quantity === undefined || quantity <= 0) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "quantity" }); // an opening balance of zero or less is not a balance
        if (unitCost === undefined || unitCost <= 0) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "unitCost" }); // opening stock is valued at this price; zero would value it at nothing
        if (warehouseCode && materialCode && fileKeys.has(key)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "materialCode" });
        if (warehouseCode && materialCode && quantity !== undefined && quantity > 0 && unitCost !== undefined && unitCost > 0 && !fileKeys.has(key)) { fileKeys.add(key); validRows.push({ rowNumber, values: { warehouseCode, materialCode, quantity, unitCost } }); }
        return;
      }
      if (input.moduleCode === "materials") {
        const code = requiredText(row[mapping.code]); const description = requiredText(row[mapping.description]); const unitOfMeasure = requiredText(row[mapping.unitOfMeasure]); const category = requiredText(row[mapping.category]); const referenceSpecification = mapping.referenceSpecification ? requiredText(row[mapping.referenceSpecification]) || undefined : undefined;
        if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" }); if (!description) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "description" }); if (!unitOfMeasure) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "unitOfMeasure" }); if (!category) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "category" }); if (code && fileKeys.has(code)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "code" });
        if (code && description && unitOfMeasure && category && !fileKeys.has(code)) { fileKeys.add(code); validRows.push({ rowNumber, values: { code, description, unitOfMeasure, category, ...(referenceSpecification ? { referenceSpecification } : {}) } }); }
        return;
      }
      const code = requiredText(row[mapping.code]);
      const title = requiredText(row[mapping.title]);
      const counterparty = requiredText(row[mapping.counterparty]);
      const contractValue = nonnegativeNumber(row[mapping.contractValue]);
      const currency = requiredText(row[mapping.currency]).toUpperCase();
      if (!code) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "code" });
      if (!title) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "title" });
      if (!counterparty) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "counterparty" });
      if (contractValue === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "contractValue" });
      // V1 money is in the riyal only (see domain/currency.ts): any other code is refused here, before a row can reach the database.
      if (currency !== "SAR") errors.push({ rowNumber, code: "IMPORT_INVALID_CURRENCY", field: "currency" });
      const duplicateCode = Boolean(code && fileKeys.has(code));
      if (duplicateCode) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "code" });
      if (code && !duplicateCode) fileKeys.add(code);
      if (code && title && counterparty && contractValue !== undefined && currency === "SAR" && !duplicateCode) validRows.push({ rowNumber, values: { code, title, counterparty, contractValue, currency } });
    });
  }

  return { sheetNames, headers, mapping, rows, validRows, errors };
}

const exportHeaders: Record<ExportModuleCode, Record<"ar" | "en", Record<string, string>>> = {
  wbs: { ar: { code: "رمز WBS", name: "اسم WBS", plannedValue: "القيمة المخططة" }, en: { code: "WBS Code", name: "WBS Name", plannedValue: "Planned Value" } },
  budget: { ar: { costCode: "رمز التكلفة", originalAmount: "القيمة الأصلية", currentAmount: "القيمة الحالية" }, en: { costCode: "Cost Code", originalAmount: "Original Amount", currentAmount: "Current Amount" } },
  activities: { ar: { code: "رمز النشاط", name: "اسم النشاط", plannedValue: "القيمة المخططة", plannedStartAt: "البداية المخططة", plannedFinishAt: "النهاية المخططة", status: "الحالة" }, en: { code: "Activity Code", name: "Activity Name", plannedValue: "Planned Value", plannedStartAt: "Planned Start", plannedFinishAt: "Planned Finish", status: "Status" } },
};

export async function buildDataExportFile(input: { moduleCode: ExportModuleCode; format: "xlsx" | "csv"; locale: "ar" | "en"; rows: Record<string, unknown>[] }) {
  const headers = exportHeaders[input.moduleCode][input.locale];
  const exportRows = input.rows.map(row => Object.keys(headers).map(key => safeSpreadsheetValue(row[key] ?? "")));
  const bytes = await buildSpreadsheet({ sheetName: input.moduleCode.toUpperCase(), headers: Object.values(headers), rows: exportRows, format: input.format });
  const extension = input.format === "csv" ? "csv" : "xlsx";
  return { bytes, fileName: `${input.moduleCode}-export.${extension}`, contentType: input.format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
