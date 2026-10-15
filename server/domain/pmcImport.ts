// Import of the five PMC templates. Two pure stages, so nothing is written until
// a person has seen the report: (1) read the file into rows and file-level errors,
// (2) check the rows against what the project already holds and produce a plan
// (what would be created, updated, left alone) plus every rejected row with its
// reason. The service executes a plan only when it has no errors.
import { readSpreadsheetSafely, spreadsheetBoundsError, worksheetToRows } from "./excelWorkbook";

export const PMC_IMPORT_LIMITS = { maxRows: 60_000, maxColumns: 20 } as const;
export const PMC_IMPORT_KINDS = ["locations", "catalog", "status", "requests", "baseline"] as const;
export type PmcImportKind = (typeof PMC_IMPORT_KINDS)[number];
export type PmcImportError = { rowNumber: number; code: string; field?: string; detail?: string };
export type PmcStatus = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE";
export type PmcImportCounts = { create: number; update: number; unchanged: number };

type Field = { key: string; required: boolean; aliases: string[] };
const FIELDS: Record<PmcImportKind, Field[]> = {
  locations: [
    { key: "zoneCode", required: true, aliases: ["zone code", "zone", "رمز المنطقة", "المنطقة"] },
    { key: "zoneName", required: false, aliases: ["zone name", "اسم المنطقة"] },
    { key: "blockCode", required: true, aliases: ["block code", "block", "رمز البلوك", "البلوك", "رمز الكتلة"] },
    { key: "blockName", required: false, aliases: ["block name", "اسم البلوك", "اسم الكتلة"] },
    { key: "unitNumber", required: true, aliases: ["unit number", "unit no", "unit", "رقم الوحدة", "الوحدة"] },
    { key: "modelCode", required: true, aliases: ["model", "model code", "type", "النموذج", "رمز النموذج", "الطراز"] },
    { key: "saleStatus", required: false, aliases: ["sale status", "حالة البيع"] },
    { key: "unitWeight", required: false, aliases: ["unit weight", "وزن الوحدة"] },
  ],
  catalog: [
    { key: "modelCode", required: true, aliases: ["model", "model code", "النموذج", "رمز النموذج", "الطراز"] },
    { key: "groupCode", required: true, aliases: ["group code", "group", "رمز المجموعة", "المجموعة"] },
    { key: "groupName", required: false, aliases: ["group name", "اسم المجموعة"] },
    { key: "stageCode", required: true, aliases: ["stage code", "stage", "رمز المرحلة", "المرحلة"] },
    { key: "stageName", required: false, aliases: ["stage name", "اسم المرحلة"] },
    { key: "activityCode", required: true, aliases: ["activity code", "activity", "رمز النشاط", "النشاط"] },
    { key: "activityName", required: true, aliases: ["activity name", "اسم النشاط"] },
    { key: "weightPercent", required: true, aliases: ["weight", "weight percent", "الوزن", "نسبة الوزن"] },
    { key: "wbsCode", required: false, aliases: ["wbs code", "wbs", "رمز wbs", "رمز هيكل العمل"] },
  ],
  status: [
    { key: "unitNumber", required: true, aliases: ["unit number", "unit no", "unit", "رقم الوحدة", "الوحدة"] },
    { key: "activityCode", required: true, aliases: ["activity code", "activity", "رمز النشاط", "النشاط"] },
    { key: "status", required: true, aliases: ["status", "الحالة"] },
    { key: "verificationStatus", required: false, aliases: ["verification status", "verification", "حالة التحقق", "حالة الصرف"] },
    { key: "engineerEmail", required: false, aliases: ["engineer", "engineer email", "المهندس", "بريد المهندس"] },
    { key: "changedAt", required: false, aliases: ["changed at", "date", "تاريخ التغيير", "التاريخ"] },
  ],
  requests: [
    { key: "requestCode", required: true, aliases: ["request", "request code", "request number", "رقم الطلب", "رمز الطلب"] },
    { key: "activityCode", required: true, aliases: ["activity code", "activity", "رمز النشاط", "النشاط"] },
    { key: "unitNumbers", required: true, aliases: ["units", "unit numbers", "الوحدات", "أرقام الوحدات"] },
    { key: "requestedAt", required: true, aliases: ["requested at", "request date", "date", "تاريخ الطلب", "التاريخ"] },
    { key: "contractor", required: false, aliases: ["contractor", "المقاول"] },
    { key: "consultant", required: false, aliases: ["consultant", "الاستشاري"] },
    { key: "responseCode", required: false, aliases: ["response", "response code", "الرد", "رمز الرد"] },
    { key: "notes", required: false, aliases: ["notes", "ملاحظات"] },
  ],
  baseline: [
    { key: "modelCode", required: true, aliases: ["model", "model code", "النموذج", "رمز النموذج", "الطراز"] },
    { key: "activityCode", required: true, aliases: ["activity code", "activity", "رمز النشاط", "النشاط"] },
    { key: "period", required: true, aliases: ["period", "month", "الشهر", "الفترة"] },
    { key: "plannedPercent", required: true, aliases: ["planned percent", "planned", "النسبة المخططة", "المخطط"] },
  ],
};

const normalize = (value: unknown) => String(value ?? "").replace(/^﻿/, "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
const text = (value: unknown) => String(value ?? "").trim();

const STATUS_ALIASES: Record<string, PmcStatus> = {
  "not started": "NOT_STARTED", "لم يبدأ": "NOT_STARTED", "غير مبدوء": "NOT_STARTED",
  "in progress": "IN_PROGRESS", "قيد التنفيذ": "IN_PROGRESS", "جاري": "IN_PROGRESS",
  "under review": "UNDER_REVIEW", "قيد المراجعة": "UNDER_REVIEW",
  complete: "COMPLETE", completed: "COMPLETE", "مكتمل": "COMPLETE", "منجز": "COMPLETE",
};
export const parsePmcStatus = (value: unknown): PmcStatus | undefined => STATUS_ALIASES[normalize(value)];

function nonNegativeNumber(value: unknown): number | undefined {
  const raw = text(value).replace(/[%,٬،]/g, "");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function wholeNumber(value: unknown): number | undefined {
  const parsed = nonNegativeNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function importDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
  const source = text(value);
  if (!source) return undefined;
  const parsed = Date.parse(source.includes("T") ? source : source.replace(" ", "T"));
  return Number.isFinite(parsed) ? new Date(parsed) : undefined;
}

/** "1-10, 15, 20-22" -> [1..10, 15, 20..22]; a reversed range is an error, not a silent swap (rule 6). */
export function parseUnitList(value: unknown): { units: number[]; error?: "PMC_UNIT_LIST_INVALID" | "PMC_UNIT_RANGE_INVALID" } {
  const tokens = text(value).split(/[,;،\s]+/).filter(Boolean);
  if (tokens.length === 0) return { units: [], error: "PMC_UNIT_LIST_INVALID" };
  const units: number[] = [];
  for (const token of tokens) {
    const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to || to - from > 5000) return { units: [], error: "PMC_UNIT_RANGE_INVALID" };
      for (let unit = from; unit <= to; unit += 1) units.push(unit);
    } else if (/^\d+$/.test(token)) units.push(Number(token));
    else return { units: [], error: "PMC_UNIT_LIST_INVALID" };
  }
  return { units: Array.from(new Set(units)).sort((a, b) => a - b) };
}

// ------------------------------------------------------------------ stage 1

export type ParsedRow = { rowNumber: number; cells: Record<string, unknown> };
export type ParsedFile = { headers: string[]; rows: ParsedRow[]; errors: PmcImportError[] };

export async function parsePmcImportFile(input: { kind: PmcImportKind; format: "xlsx" | "csv"; bytes: Uint8Array }): Promise<ParsedFile> {
  const fail = (code: string): ParsedFile => ({ headers: [], rows: [], errors: [{ rowNumber: 0, code }] });
  const parsed = await readSpreadsheetSafely(input.format === "csv" ? Buffer.from(input.bytes).toString("utf8") : input.bytes, input.format);
  if (!parsed.ok) return fail(parsed.code);
  const sheets = parsed.workbook.worksheets;
  if (sheets.length !== 1) return fail(sheets.length === 0 ? "IMPORT_EMPTY_WORKBOOK" : "IMPORT_SINGLE_SHEET_REQUIRED");
  const sheet = sheets[0];
  const { headers, rows } = worksheetToRows(sheet, PMC_IMPORT_LIMITS);
  const bounds = spreadsheetBoundsError(sheet, rows, PMC_IMPORT_LIMITS);
  if (bounds) return { headers, rows: [], errors: [{ rowNumber: 0, code: bounds }] };
  const fields = FIELDS[input.kind];
  const known = new Set(fields.flatMap(field => field.aliases));
  const mapping = new Map<string, string>();
  for (const field of fields) {
    const header = headers.find(candidate => field.aliases.includes(normalize(candidate)));
    if (header) mapping.set(field.key, header);
  }
  const errors: PmcImportError[] = [];
  for (const header of headers) if (header && !known.has(normalize(header))) errors.push({ rowNumber: 0, code: "IMPORT_UNSUPPORTED_COLUMN", field: header });
  for (const field of fields) if (field.required && !mapping.has(field.key)) errors.push({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: field.key });
  if (errors.length) return { headers, rows: [], errors };
  return {
    headers,
    errors,
    rows: rows.map((row, index) => ({ rowNumber: index + 2, cells: Object.fromEntries(fields.map(field => [field.key, mapping.has(field.key) ? row[mapping.get(field.key)!] : undefined])) })),
  };
}

// ------------------------------------------------------------------ stage 2

const required = (errors: PmcImportError[], rowNumber: number, field: string, value: string) => {
  if (!value) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field });
  return Boolean(value);
};

// ---- locations

export type LocationsContext = {
  zones: Map<string, { id: string }>;
  blocks: Map<string, { id: string; zoneCode: string }>;
  units: Map<number, { id: string; blockCode: string; modelCode: string; saleStatus: string | null; unitWeight: number }>;
};
export type LocationsPlan = {
  errors: PmcImportError[];
  newZones: Array<{ code: string; name: string }>;
  newBlocks: Array<{ code: string; name: string; zoneCode: string }>;
  newUnits: Array<{ unitNumber: number; blockCode: string; modelCode: string; saleStatus: string | null; unitWeight: number }>;
  updatedUnits: Array<{ id: string; unitNumber: number; saleStatus: string | null; unitWeight: number }>;
  counts: PmcImportCounts;
};

export function planLocations(rows: ParsedRow[], context: LocationsContext): LocationsPlan {
  const errors: PmcImportError[] = [];
  const zoneNames = new Map<string, string>();
  const blockInfo = new Map<string, { name: string; zoneCode: string }>();
  const seenUnits = new Set<number>();
  const newUnits: LocationsPlan["newUnits"] = [];
  const updatedUnits: LocationsPlan["updatedUnits"] = [];
  let unchanged = 0;
  for (const { rowNumber, cells } of rows) {
    const zoneCode = text(cells.zoneCode);
    const blockCode = text(cells.blockCode);
    const modelCode = text(cells.modelCode);
    const before = errors.length;
    required(errors, rowNumber, "zoneCode", zoneCode);
    required(errors, rowNumber, "blockCode", blockCode);
    required(errors, rowNumber, "modelCode", modelCode);
    const unitNumber = wholeNumber(cells.unitNumber);
    if (unitNumber === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "unitNumber" });
    const weightRaw = text(cells.unitWeight);
    const unitWeight = weightRaw ? nonNegativeNumber(weightRaw) : 1;
    if (unitWeight === undefined || unitWeight <= 0) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "unitWeight" });
    if (unitNumber !== undefined && seenUnits.has(unitNumber)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "unitNumber" });
    if (blockCode && zoneCode) {
      const existing = context.blocks.get(blockCode);
      const inFile = blockInfo.get(blockCode);
      if ((existing && existing.zoneCode !== zoneCode) || (inFile && inFile.zoneCode !== zoneCode)) errors.push({ rowNumber, code: "PMC_BLOCK_ZONE_CONFLICT", field: "blockCode", detail: blockCode });
    }
    if (errors.length > before || unitNumber === undefined || unitWeight === undefined) continue;
    seenUnits.add(unitNumber);
    const saleStatus = text(cells.saleStatus) || null;
    if (zoneCode && !context.zones.has(zoneCode) && !zoneNames.has(zoneCode)) zoneNames.set(zoneCode, text(cells.zoneName) || zoneCode);
    if (!context.blocks.has(blockCode) && !blockInfo.has(blockCode)) blockInfo.set(blockCode, { name: text(cells.blockName) || blockCode, zoneCode });
    else if (!blockInfo.has(blockCode)) blockInfo.set(blockCode, { name: "", zoneCode });
    const existingUnit = context.units.get(unitNumber);
    if (!existingUnit) { newUnits.push({ unitNumber, blockCode, modelCode, saleStatus, unitWeight }); continue; }
    if (existingUnit.modelCode !== modelCode) { errors.push({ rowNumber, code: "PMC_UNIT_MODEL_CHANGE_BLOCKED", field: "modelCode", detail: `${existingUnit.modelCode} -> ${modelCode}` }); continue; }
    if (existingUnit.blockCode !== blockCode) { errors.push({ rowNumber, code: "PMC_UNIT_BLOCK_CHANGE_BLOCKED", field: "blockCode", detail: `${existingUnit.blockCode} -> ${blockCode}` }); continue; }
    if (existingUnit.saleStatus === saleStatus && existingUnit.unitWeight === unitWeight) unchanged += 1;
    else updatedUnits.push({ id: existingUnit.id, unitNumber, saleStatus, unitWeight });
  }
  const newBlocks = Array.from(blockInfo.entries()).filter(([code]) => !context.blocks.has(code)).map(([code, info]) => ({ code, name: info.name, zoneCode: info.zoneCode }));
  const newZones = Array.from(zoneNames.entries()).map(([code, name]) => ({ code, name }));
  return { errors, newZones, newBlocks, newUnits, updatedUnits, counts: { create: newUnits.length, update: updatedUnits.length, unchanged } };
}

// ---- catalogue (activities, groups, stages, weights)

export type CatalogContext = {
  groups: Map<string, { id: string }>;
  stages: Map<string, { id: string; groupCode: string }>;
  definitions: Map<string, { id: string; weightPercent: number; groupCode: string; stageCode: string; name: string; wbsItemId: string | null }>;
  activityCodesByModel: Map<string, Set<string>>;
  wbsItems: Map<string, string>;
};
export type CatalogPlan = {
  errors: PmcImportError[];
  newGroups: Array<{ code: string; name: string }>;
  newStages: Array<{ code: string; name: string; groupCode: string }>;
  newDefinitions: Array<{ modelCode: string; code: string; name: string; weightPercent: number; groupCode: string; stageCode: string; wbsItemId: string | null }>;
  updatedDefinitions: Array<{ id: string; name: string; weightPercent: number; groupCode: string; stageCode: string; wbsItemId: string | null }>;
  models: Array<{ modelCode: string; activities: number; totalWeight: number }>;
  counts: PmcImportCounts;
};
const defKey = (modelCode: string, code: string) => `${modelCode}\u0000${code}`;
const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function planCatalog(rows: ParsedRow[], context: CatalogContext): CatalogPlan {
  const errors: PmcImportError[] = [];
  const valid: Array<{ modelCode: string; groupCode: string; groupName: string; stageCode: string; stageName: string; code: string; name: string; weightPercent: number; wbsItemId: string | null }> = [];
  const seen = new Set<string>();
  const stageGroup = new Map<string, string>();
  for (const { rowNumber, cells } of rows) {
    const before = errors.length;
    const modelCode = text(cells.modelCode);
    const groupCode = text(cells.groupCode);
    const stageCode = text(cells.stageCode);
    const code = text(cells.activityCode);
    const name = text(cells.activityName);
    // Rule 5: no row without a group, a stage and an activity.
    if (!modelCode || !groupCode || !stageCode || !code) errors.push({ rowNumber, code: "PMC_CLASSIFICATION_BLANK", field: !modelCode ? "modelCode" : !groupCode ? "groupCode" : !stageCode ? "stageCode" : "activityCode" });
    required(errors, rowNumber, "activityName", name);
    const weightPercent = nonNegativeNumber(cells.weightPercent);
    if (weightPercent === undefined || weightPercent > 100) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "weightPercent" });
    if (modelCode && code && seen.has(defKey(modelCode, code))) errors.push({ rowNumber, code: "PMC_DUPLICATE_ACTIVITY", field: "activityCode", detail: `${modelCode}/${code}` });
    if (stageCode && groupCode) {
      const known = context.stages.get(stageCode)?.groupCode ?? stageGroup.get(stageCode);
      if (known && known !== groupCode) errors.push({ rowNumber, code: "PMC_STAGE_GROUP_CONFLICT", field: "stageCode", detail: stageCode });
    }
    const wbsCode = text(cells.wbsCode);
    let wbsItemId: string | null = null;
    if (wbsCode) {
      wbsItemId = context.wbsItems.get(wbsCode) ?? null;
      if (!wbsItemId) errors.push({ rowNumber, code: "PMC_WBS_REFERENCE_UNRESOLVED", field: "wbsCode", detail: wbsCode });
    }
    if (errors.length > before || weightPercent === undefined) continue;
    seen.add(defKey(modelCode, code));
    if (!stageGroup.has(stageCode)) stageGroup.set(stageCode, groupCode);
    valid.push({ modelCode, groupCode, groupName: text(cells.groupName) || groupCode, stageCode, stageName: text(cells.stageName) || stageCode, code, name, weightPercent, wbsItemId });
  }

  // Rule 4, per model: weights total exactly 100; and the file is the whole model, so it cannot silently drop an existing activity.
  const byModel = new Map<string, typeof valid>();
  for (const row of valid) byModel.set(row.modelCode, [...(byModel.get(row.modelCode) ?? []), row]);
  const models: CatalogPlan["models"] = [];
  const brokenModels = new Set<string>();
  const modelsWithRowErrors = new Set(rows.filter(row => errors.some(error => error.rowNumber === row.rowNumber)).map(row => text(row.cells.modelCode)));
  byModel.forEach((modelRows, modelCode) => {
    const totalWeight = round4(modelRows.reduce((sum, row) => sum + row.weightPercent, 0));
    models.push({ modelCode, activities: modelRows.length, totalWeight });
    if (modelsWithRowErrors.has(modelCode)) return;
    if (Math.abs(totalWeight - 100) > 0.0001) { brokenModels.add(modelCode); errors.push({ rowNumber: 0, code: "PMC_MODEL_WEIGHTS_NOT_100", field: modelCode, detail: `${modelCode} totals ${totalWeight}` }); }
    const fileCodes = new Set(modelRows.map(row => row.code));
    context.activityCodesByModel.get(modelCode)?.forEach(existingCode => { if (!fileCodes.has(existingCode)) { brokenModels.add(modelCode); errors.push({ rowNumber: 0, code: "PMC_MODEL_ACTIVITY_OMITTED", field: modelCode, detail: `${modelCode}/${existingCode}` }); } });
  });

  const newGroups = new Map<string, string>();
  const newStages = new Map<string, { name: string; groupCode: string }>();
  const newDefinitions: CatalogPlan["newDefinitions"] = [];
  const updatedDefinitions: CatalogPlan["updatedDefinitions"] = [];
  let unchanged = 0;
  for (const row of valid) {
    if (brokenModels.has(row.modelCode)) continue;
    if (!context.groups.has(row.groupCode) && !newGroups.has(row.groupCode)) newGroups.set(row.groupCode, row.groupName);
    if (!context.stages.has(row.stageCode) && !newStages.has(row.stageCode)) newStages.set(row.stageCode, { name: row.stageName, groupCode: row.groupCode });
    const existing = context.definitions.get(defKey(row.modelCode, row.code));
    if (!existing) { newDefinitions.push({ modelCode: row.modelCode, code: row.code, name: row.name, weightPercent: row.weightPercent, groupCode: row.groupCode, stageCode: row.stageCode, wbsItemId: row.wbsItemId }); continue; }
    const same = existing.name === row.name && existing.weightPercent === row.weightPercent && existing.groupCode === row.groupCode && existing.stageCode === row.stageCode && existing.wbsItemId === row.wbsItemId;
    if (same) unchanged += 1;
    else updatedDefinitions.push({ id: existing.id, name: row.name, weightPercent: row.weightPercent, groupCode: row.groupCode, stageCode: row.stageCode, wbsItemId: row.wbsItemId });
  }
  return { errors, newGroups: Array.from(newGroups, ([code, name]) => ({ code, name })), newStages: Array.from(newStages, ([code, value]) => ({ code, ...value })), newDefinitions, updatedDefinitions, models, counts: { create: newDefinitions.length, update: updatedDefinitions.length, unchanged } };
}

// ---- unit-activity status (one row per cell, natural key: unit + activity)

export type StatusContext = {
  units: Map<number, { id: string; modelCode: string }>;
  /** model -> activity code -> definition id */
  definitions: Map<string, Map<string, string>>;
  allActivityCodes: Set<string>;
  verificationStatuses: Map<string, string>;
  engineers: Map<string, number>;
  cells: Map<string, { id: string; status: PmcStatus; verificationStatusId: string | null }>;
};
export type StatusOperation = { unitId: string; unitNumber: number; activityDefinitionId: string; status: PmcStatus; verificationStatusId: string | null; engineerUserId: number | null; changedAt: Date | null; existing: { id: string; status: PmcStatus } | null };
export type StatusPlan = { errors: PmcImportError[]; operations: StatusOperation[]; counts: PmcImportCounts };

export function planStatus(rows: ParsedRow[], context: StatusContext): StatusPlan {
  const errors: PmcImportError[] = [];
  const operations: StatusOperation[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  for (const { rowNumber, cells } of rows) {
    const before = errors.length;
    const unitNumber = wholeNumber(cells.unitNumber);
    const activityCode = text(cells.activityCode);
    if (unitNumber === undefined) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "unitNumber" });
    required(errors, rowNumber, "activityCode", activityCode);
    const status = parsePmcStatus(cells.status);
    if (!status) errors.push({ rowNumber, code: "PMC_STATUS_INVALID", field: "status", detail: text(cells.status) });
    const unit = unitNumber === undefined ? undefined : context.units.get(unitNumber);
    if (unitNumber !== undefined && !unit) errors.push({ rowNumber, code: "PMC_UNIT_NOT_FOUND", field: "unitNumber", detail: String(unitNumber) });
    let definitionId: string | undefined;
    if (unit && activityCode) {
      definitionId = context.definitions.get(unit.modelCode)?.get(activityCode);
      if (!definitionId) errors.push({ rowNumber, code: context.allActivityCodes.has(activityCode) ? "PMC_ACTIVITY_NOT_IN_UNIT_MODEL" : "PMC_ACTIVITY_NOT_FOUND", field: "activityCode", detail: `${activityCode} (${unit.modelCode})` });
    }
    const verificationCode = text(cells.verificationStatus);
    let verificationStatusId: string | null = null;
    if (verificationCode) {
      verificationStatusId = context.verificationStatuses.get(verificationCode) ?? null;
      if (!verificationStatusId) errors.push({ rowNumber, code: "PMC_VERIFICATION_STATUS_UNKNOWN", field: "verificationStatus", detail: verificationCode });
    }
    const email = text(cells.engineerEmail).toLowerCase();
    let engineerUserId: number | null = null;
    if (email) {
      engineerUserId = context.engineers.get(email) ?? null;
      if (engineerUserId === null) errors.push({ rowNumber, code: "PMC_ENGINEER_NOT_A_MEMBER", field: "engineerEmail" });
    }
    const changedRaw = text(cells.changedAt);
    const changedAt = (changedRaw ? importDate(cells.changedAt) : null) ?? null;
    if (changedRaw && changedAt === null) errors.push({ rowNumber, code: "PMC_DATE_INVALID", field: "changedAt" });
    if (unit && definitionId) {
      const key = `${unit.id}:${definitionId}`;
      if (seen.has(key)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "unitNumber", detail: `${unitNumber}/${activityCode}` });
      else if (errors.length === before) seen.add(key);
    }
    if (errors.length > before || !unit || !definitionId || !status || unitNumber === undefined) continue;
    const existing = context.cells.get(`${unit.id}:${definitionId}`) ?? null;
    // A verification status left blank in the file leaves the stored one alone.
    const nextVerification = verificationCode ? verificationStatusId : (existing?.verificationStatusId ?? null);
    if (existing && existing.status === status && existing.verificationStatusId === nextVerification) { unchanged += 1; continue; }
    operations.push({ unitId: unit.id, unitNumber, activityDefinitionId: definitionId, status, verificationStatusId: nextVerification, engineerUserId, changedAt, existing: existing ? { id: existing.id, status: existing.status } : null });
  }
  return { errors, operations, counts: { create: operations.filter(op => !op.existing).length, update: operations.filter(op => op.existing).length, unchanged } };
}

// ---- inspection requests and replies

export type RequestsContext = {
  units: Map<number, { id: string; modelCode: string }>;
  definitions: Map<string, Map<string, string>>;
  allActivityCodes: Set<string>;
  requests: Map<string, { id: string; responseCode: string | null }>;
};
export type RequestOperation = { requestCode: string; activityDefinitionId: string; unitIds: string[]; contractorLabel: string | null; consultantLabel: string | null; requestedAt: Date; responseCode: "A" | "B" | "C" | "UR" | null; notes: string | null };
export type RequestsPlan = { errors: PmcImportError[]; creates: RequestOperation[]; replies: Array<{ id: string; requestCode: string; responseCode: "A" | "B" | "C" | "UR" }>; counts: PmcImportCounts };

export function planRequests(rows: ParsedRow[], context: RequestsContext): RequestsPlan {
  const errors: PmcImportError[] = [];
  const creates: RequestOperation[] = [];
  const replies: RequestsPlan["replies"] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  for (const { rowNumber, cells } of rows) {
    const before = errors.length;
    const requestCode = text(cells.requestCode);
    const activityCode = text(cells.activityCode);
    required(errors, rowNumber, "requestCode", requestCode);
    required(errors, rowNumber, "activityCode", activityCode);
    if (requestCode && seen.has(requestCode)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "requestCode" });
    const requestedAt = importDate(cells.requestedAt);
    if (!requestedAt) errors.push({ rowNumber, code: "PMC_DATE_INVALID", field: "requestedAt" });
    const list = parseUnitList(cells.unitNumbers);
    if (list.error) errors.push({ rowNumber, code: list.error, field: "unitNumbers" });
    const responseRaw = text(cells.responseCode).toUpperCase();
    const responseCode = (["A", "B", "C", "UR"] as const).find(code => code === responseRaw) ?? null;
    if (responseRaw && !responseCode) errors.push({ rowNumber, code: "PMC_RESPONSE_CODE_INVALID", field: "responseCode", detail: responseRaw });
    const units = list.units.map(unitNumber => ({ unitNumber, unit: context.units.get(unitNumber) }));
    for (const entry of units) if (!entry.unit) errors.push({ rowNumber, code: "PMC_UNIT_NOT_FOUND", field: "unitNumbers", detail: String(entry.unitNumber) });
    const models = new Set(units.flatMap(entry => (entry.unit ? [entry.unit.modelCode] : [])));
    let definitionId: string | undefined;
    if (models.size > 1) errors.push({ rowNumber, code: "PMC_REQUEST_MIXED_MODELS", field: "unitNumbers" });
    else if (models.size === 1 && activityCode) {
      const [model] = Array.from(models);
      definitionId = context.definitions.get(model)?.get(activityCode);
      if (!definitionId) errors.push({ rowNumber, code: context.allActivityCodes.has(activityCode) ? "PMC_ACTIVITY_NOT_IN_UNIT_MODEL" : "PMC_ACTIVITY_NOT_FOUND", field: "activityCode", detail: `${activityCode} (${model})` });
    }
    if (errors.length > before || !requestedAt || !definitionId) continue;
    seen.add(requestCode);
    const existing = context.requests.get(requestCode);
    if (existing) {
      // Re-importing a request never rewrites it; it can only supply the reply that was still missing.
      if (responseCode && !existing.responseCode) replies.push({ id: existing.id, requestCode, responseCode });
      else unchanged += 1;
      continue;
    }
    creates.push({ requestCode, activityDefinitionId: definitionId, unitIds: units.map(entry => entry.unit!.id), contractorLabel: text(cells.contractor) || null, consultantLabel: text(cells.consultant) || null, requestedAt, responseCode, notes: text(cells.notes) || null });
  }
  return { errors, creates, replies, counts: { create: creates.length, update: replies.length, unchanged } };
}

// ---- baseline (planned cumulative percent per activity per month)

export type BaselineContext = {
  definitions: Map<string, string>;
  /** definition id -> month (ISO date) -> stored percent */
  stored: Map<string, Map<string, { id: string; plannedPercent: number }>>;
};
export type BaselinePlan = { errors: PmcImportError[]; creates: Array<{ activityDefinitionId: string; periodAt: Date; plannedPercent: number }>; updates: Array<{ id: string; plannedPercent: number }>; counts: PmcImportCounts };
export const monthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export function planBaseline(rows: ParsedRow[], context: BaselineContext): BaselinePlan {
  const errors: PmcImportError[] = [];
  const valid: Array<{ rowNumber: number; definitionId: string; period: Date; percent: number; label: string }> = [];
  const seen = new Set<string>();
  for (const { rowNumber, cells } of rows) {
    const before = errors.length;
    const modelCode = text(cells.modelCode);
    const activityCode = text(cells.activityCode);
    required(errors, rowNumber, "modelCode", modelCode);
    required(errors, rowNumber, "activityCode", activityCode);
    const period = importDate(cells.period);
    if (!period) errors.push({ rowNumber, code: "PMC_DATE_INVALID", field: "period" });
    const percent = nonNegativeNumber(cells.plannedPercent);
    if (percent === undefined || percent > 100) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "plannedPercent" });
    const definitionId = modelCode && activityCode ? context.definitions.get(defKey(modelCode, activityCode)) : undefined;
    if (modelCode && activityCode && !definitionId) errors.push({ rowNumber, code: "PMC_ACTIVITY_NOT_FOUND", field: "activityCode", detail: `${modelCode}/${activityCode}` });
    if (definitionId && period) {
      const key = `${definitionId}:${monthStart(period).toISOString()}`;
      if (seen.has(key)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "period", detail: `${modelCode}/${activityCode}` });
      else if (errors.length === before) seen.add(key);
    }
    if (errors.length > before || !definitionId || !period || percent === undefined) continue;
    valid.push({ rowNumber, definitionId, period: monthStart(period), percent, label: `${modelCode}/${activityCode}` });
  }
  // The baseline is cumulative: later months never plan less than earlier ones (file rows merged over stored ones).
  const series = new Map<string, Map<string, { percent: number; rowNumber: number; label: string }>>();
  context.stored.forEach((months, definitionId) => months.forEach((entry, iso) => { series.set(definitionId, (series.get(definitionId) ?? new Map()).set(iso, { percent: entry.plannedPercent, rowNumber: 0, label: "" })); }));
  for (const row of valid) series.set(row.definitionId, (series.get(row.definitionId) ?? new Map()).set(row.period.toISOString(), { percent: row.percent, rowNumber: row.rowNumber, label: row.label }));
  const decreasing = new Set<string>();
  series.forEach((months, definitionId) => {
    const ordered = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index][1].percent < ordered[index - 1][1].percent) { decreasing.add(definitionId); errors.push({ rowNumber: ordered[index][1].rowNumber || ordered[index - 1][1].rowNumber, code: "PMC_BASELINE_NOT_CUMULATIVE", field: "plannedPercent", detail: `${ordered[index][1].label || ordered[index - 1][1].label} ${ordered[index][0].slice(0, 7)}` }); break; }
    }
  });
  const creates: BaselinePlan["creates"] = [];
  const updates: BaselinePlan["updates"] = [];
  let unchanged = 0;
  for (const row of valid) {
    if (decreasing.has(row.definitionId)) continue;
    const stored = context.stored.get(row.definitionId)?.get(row.period.toISOString());
    if (!stored) creates.push({ activityDefinitionId: row.definitionId, periodAt: row.period, plannedPercent: row.percent });
    else if (stored.plannedPercent === row.percent) unchanged += 1;
    else updates.push({ id: stored.id, plannedPercent: row.percent });
  }
  return { errors, creates, updates, counts: { create: creates.length, update: updates.length, unchanged } };
}

export { defKey as pmcDefinitionKey };
