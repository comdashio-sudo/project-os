// Import of the five PMC templates. Two pure stages, so nothing is written until
// a person has seen the report: (1) read the file into rows and file-level errors,
// (2) check the rows against what the project already holds and produce a plan
// (what would be created, updated, left alone) plus every rejected row with its
// reason. The service executes a plan only when it has no errors.
import { columnHints, type ColumnSuggestion, type FieldSource } from "./importEngine/hints";
import type ExcelJS from "exceljs";
import { cellText, emptyVerticalMergeCover, readSpreadsheetSafely, worksheetToRows } from "./excelWorkbook";
import { chooseSheet, type HeaderEvaluation, type TableRows } from "./importEngine/read";
import { normalizeHeader } from "./smartImport/dictionary";
import { parseNumber } from "./smartImport/numbers";
import { decodeCsv } from "./smartImport/sheetReader";

export const PMC_IMPORT_LIMITS = { maxRows: 60_000, maxColumns: 20 } as const;
export const PMC_IMPORT_KINDS = ["locations", "catalog", "status", "requests", "baseline", "baselineDates", "weights"] as const;
export type PmcImportKind = (typeof PMC_IMPORT_KINDS)[number];
export type PmcImportError = { rowNumber: number; code: string; field?: string; detail?: string };
export type PmcStatus = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE";
export type PmcImportCounts = { create: number; update: number; unchanged: number };

type Field = { key: string; required: boolean; aliases: string[] };
const ENGLISH_NAME_ALIASES = ["activity title", "english name", "name en", "name (en)", "activity name en", "activity name (en)", "activity english name", "الاسم بالإنجليزية", "الاسم بالانجليزية", "الاسم الإنجليزي", "اسم النشاط بالإنجليزية"];

/**
 * Q-49: a name cell that holds both languages («أعمال التشطيبات Finishes», «Finishes - أعمال التشطيبات») is split into its Arabic and English parts — only
 * when the cell is exactly one Arabic run and one English run, side by side. Anything else (a code with Arabic, «03 30 00 خرسانة», or the two languages
 * interleaved) stays whole with no English part. Used for group and stage names that come without an English column.
 */
const ARABIC_LETTER = /[\u0600-\u06FF]/;
const LATIN_LETTER = /[A-Za-z]/;
export function splitMixedName(value: string): { ar: string; en: string | null } {
  const whole = value.trim();
  if (!ARABIC_LETTER.test(whole) || !LATIN_LETTER.test(whole)) return { ar: whole, en: null };
  const cut = (ar: string, en: string) => {
    const arabic = ar.replace(/[\s\-–—/|(]+$/, "").replace(/^[\s\-–—/|)]+/, "").trim();
    const english = en.replace(/^[\s\-–—/|(]+/, "").replace(/[\s\-–—/|)]+$/, "").trim();
    return arabic && english && !LATIN_LETTER.test(arabic) && !ARABIC_LETTER.test(english) ? { ar: arabic, en: english } : null;
  };
  const englishLast = /^([^A-Za-z]*[\u0600-\u06FF][^A-Za-z]*?)([A-Za-z][^\u0600-\u06FF]*)$/.exec(whole);
  const englishFirst = /^([A-Za-z][^\u0600-\u06FF]*?)([^A-Za-z]*[\u0600-\u06FF][^A-Za-z]*)$/.exec(whole);
  return (englishLast && cut(englishLast[1], englishLast[2])) || (englishFirst && cut(englishFirst[2], englishFirst[1])) || { ar: whole, en: null };
}
const FIELDS: Record<PmcImportKind, Field[]> = {
  locations: [
    // Q-3: a villa list often has no zone column (البلوك | الفيلا | النموذج); the units then go to one zone, DEFAULT_ZONE_CODE
    { key: "zoneCode", required: false, aliases: ["zone code", "zone", "رمز المنطقة", "المنطقة", "الزون"] },
    { key: "zoneName", required: false, aliases: ["zone name", "اسم المنطقة"] },
    { key: "blockCode", required: true, aliases: ["block code", "block", "رمز البلوك", "البلوك", "رمز الكتلة"] },
    { key: "blockName", required: false, aliases: ["block name", "اسم البلوك", "اسم الكتلة"] },
    { key: "unitNumber", required: true, aliases: ["unit number", "unit no", "unit", "رقم الوحدة", "الوحدة", "villa", "villa no", "villa number", "الفيلا", "رقم الفيلا"] },
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
    // Q-49: the optional English names (the Arabic one stays required); an empty cell keeps what is stored
    { key: "activityNameEn", required: false, aliases: ENGLISH_NAME_ALIASES },
    { key: "groupNameEn", required: false, aliases: ["group name en", "group name (en)", "group english name", "اسم المجموعة بالإنجليزية"] },
    { key: "stageNameEn", required: false, aliases: ["stage name en", "stage name (en)", "stage english name", "اسم المرحلة بالإنجليزية"] },
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
  // The other way to give a baseline: when each activity starts and ends (G-042). It is expanded into the same monthly points.
  // Q-3: the project's weights table as the owner keeps it (Excel, CSV, or an export from Google Sheets / AppSheet): section (CSI) | sub-item | activity | weight.
  // It is translated into catalogue rows (weightsToCatalogRows) and checked and saved by the catalogue's own rules; columns it does not know are ignored.
  weights: [
    { key: "csi", required: true, aliases: ["csi", "csi section", "section csi", "csi code", "section", "division", "بند csi", "رمز csi", "القسم", "قسم csi"] },
    { key: "sub", required: false, aliases: ["sub", "sub item", "subitem", "sub-item", "البند الفرعي", "بند فرعي", "تصنيف داخلي", "التصنيف الداخلي", "internal classification"] },
    { key: "activityCode", required: false, aliases: ["activity code", "code", "wir", "wir code", "رمز النشاط"] },
    { key: "activityName", required: true, aliases: ["activity", "activity name", "description", "النشاط", "اسم النشاط", "البند"] },
    { key: "weight", required: true, aliases: ["weight", "weight percent", "percentage", "new percentage", "الوزن", "نسبة الوزن", "النسبة"] },
    { key: "modelCode", required: false, aliases: ["model", "model code", "النموذج", "رمز النموذج"] },
    // Q-49: the owner's «Activity Title» is the activity's English name
    { key: "activityNameEn", required: false, aliases: ENGLISH_NAME_ALIASES },
  ],
  baselineDates: [
    { key: "modelCode", required: true, aliases: ["model", "model code", "النموذج", "رمز النموذج", "الطراز"] },
    { key: "activityCode", required: true, aliases: ["activity code", "activity", "رمز النشاط", "النشاط"] },
    { key: "startDate", required: true, aliases: ["start", "start date", "planned start", "البداية", "تاريخ البداية", "بداية"] },
    { key: "endDate", required: true, aliases: ["end", "end date", "finish", "finish date", "planned finish", "planned end", "النهاية", "تاريخ النهاية", "نهاية"] },
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
/** Q-31 (P0-02): which column each field was read from, so the report can show it and a person can change it. */
/** Q-50 batch 3b: `source` (found by name, chosen by the person, or not found) and, for a field not found, a `suggestion` shown and never applied. */
export type PmcImportColumns = { headers: string[]; fields: Array<{ key: string; required: boolean; header: string | null; source?: FieldSource; suggestion?: ColumnSuggestion | null }>; overridden: boolean };
/** Q-48: a column the file has and no field reads, shown in the preview with a few of its values so a person sees it was seen and left aside. */
export type PmcIgnoredColumn = { header: string; samples: string[] };
/** Q-50 batch 4: what a person corrected in the preview — a cell of a row (by the field it is read for) or a row left out — never written to the stored file. */
export type PmcImportEdits = { cells: Array<{ row: number; field: string; value: string }>; ignoreRows: number[]; /** Q-50 4c: rows the reader took for a totals line, read as data by the person's choice */ readRows?: number[] };
/** Q-50 4c: how the reader classed a row of the table — read as data, skipped as a totals line, or left out by the person — with the cells of its mapped fields. */
export type PmcRowClass = "data" | "total" | "leftOut";
export type PmcPreviewRow = { row: number; class: PmcRowClass; cells: Record<string, string> };
/** The rows the report shows with their class; a person classifies the rest in the file. */
export const PMC_PREVIEW_ROWS = 30;
/** An applied cell correction, with the value the file holds, for the report and the audit trail. */
export type PmcAppliedEdit = { row: number; field: string; header: string; from: string; to: string };
export type ParsedFile = { headers: string[]; rows: ParsedRow[]; errors: PmcImportError[]; columns?: PmcImportColumns; notes?: { skippedTotals: number; filledDown: number; ignoredColumns?: PmcIgnoredColumn[]; edits?: PmcAppliedEdit[]; ignoredRows?: number[]; fileTotals?: PmcFileTotal[]; readRows?: number[]; preview?: PmcPreviewRow[] } };
/** Q-50 batch 5a: a totals line the reader skipped, with the weight it carries in the file (compared with the sum read, never used as data). */
export type PmcFileTotal = { row: number; value: string };
/** The comparison of the file's own totals line with what was read, in the file's units (fractions or percent). */
export type PmcTotalCheck = { row: number; fileValue: number | null; readSum: number; status: "matches" | "differs" | "not_comparable" };

/**
 * Q-31 (P0-01): how a header is compared with a field's spellings. Arabic letter variants, diacritics and tatweel, Eastern digits, punctuation and
 * brackets do not count, nor a percent sign ("Weight (%)" is "weight"). The spellings go through the same function, so «القسم» matches «القسـم».
 */
export const pmcHeaderKey = (value: unknown) => normalizeHeader(String(value ?? "").replace(/^\uFEFF/, "").replace(/[%٪]/g, " "));
// a totals line at the foot of the table («الإجمالي … 100»): skipped, never read as an activity (narrow on purpose: «خصم» or «صافي» can be real activity names)
// The WHOLE label must be total words («الإجمالي», «المجموع الكلي», «Grand total»): a label that only starts with one («Total station survey») is an activity
// (review of #370). Matched on pmcHeaderKey, which strips punctuation, so «Total:» counts.
const TOTAL_LINE = /^(?:ال)?(?:مجموع|اجمالي)(?: (?:ال)?(?:كلي|عام))?$|^(?:sub ?total|grand total|total|totals)$/;

type HeaderMatch = { mapping: Map<string, string>; missing: string[]; ambiguous: Array<{ field: string; headers: string[] }>; unsupported: string[] };

/**
 * Q-48: the owner's own words for a weights table. Decided per file from its own header row and data, so other tables read exactly as they did:
 *   - «البند الفرعي» beside «تصنيف داخلي»: «البند الفرعي» is the activity itself and «تصنيف داخلي» its stage.
 *   - «البند الفرعي» beside «النشاط»: the platform's own template (pmcImportGuide) writes the stage under «البند الفرعي» and the activity under «النشاط»; the
 *     owner's edited file writes them the other way. The data tells them apart: a stage repeats down its activities, an activity does not — the column with
 *     FEWER different values is the stage. On a tie (one row, say) the template's reading stands. The report shows which column was read as what.
 *   - «بند CSI» beside «القسم»: the group comes from «بند CSI» (the full name of the item); «القسم» (the division, often merged and left blank) is not read.
 */
const WEIGHTS_SECTION_LAST = "csi";
function fieldsForFile(kind: PmcImportKind, headerKeys: Set<string>, distinctValues: (word: string) => number = () => 0): Field[] {
  const fields = FIELDS[kind];
  if (kind !== "weights") return fields;
  const out = fields.map(field => ({ ...field, aliases: [...field.aliases] }));
  const field = (key: string) => out.find(item => item.key === key)!;
  const has = (word: string) => headerKeys.has(pmcHeaderKey(word));
  const drop = (key: string, word: string) => { field(key).aliases = field(key).aliases.filter(alias => pmcHeaderKey(alias) !== pmcHeaderKey(word)); };
  const move = (word: string, from: string, to: string) => { drop(from, word); field(to).aliases.push(word); };
  const classification = has("تصنيف داخلي") || has("التصنيف الداخلي");
  if (has("البند الفرعي") && classification) {
    move("البند الفرعي", "sub", "activityName");
    drop("activityName", "النشاط");
  } else if (has("البند الفرعي") && has("النشاط") && distinctValues("النشاط") < distinctValues("البند الفرعي")) {
    move("البند الفرعي", "sub", "activityName");
    move("النشاط", "activityName", "sub");
  }
  if (has("بند csi") && has("القسم")) drop("csi", "القسم");
  return out;
}

// Generic words that name a field only when nothing clearer does: «البند» is the activity when there is no «النشاط», «code» the activity code when
// there is no «activity code». Every other spelling is a clear name.
const GENERIC_SPELLINGS = new Set(["البند", "code", "description", "type", "النسبة", "percentage"].map(pmcHeaderKey));

/**
 * Which column is which field. A header serves one field only. A field takes the one column that names it clearly; a generic word counts only when no
 * column names it clearly. Two columns that both name a field clearly («الوزن» and «Weight») are AMBIGUOUS: refused with both names, never a guess.
 */
function matchHeaders(fields: Field[], headers: string[], baseHeaders: string[] = headers, lastWins = new Set<string>()): HeaderMatch {
  const keys = baseHeaders.map(pmcHeaderKey);
  const taken = new Set<number>();
  const mapping = new Map<string, string>();
  const ambiguous: HeaderMatch["ambiguous"] = [];
  const ordered = [...fields].sort((a, b) => Number(b.required) - Number(a.required));
  const candidates = (field: Field, generic: boolean) => {
    const aliasKeys = new Set(field.aliases.map(pmcHeaderKey).filter(key => GENERIC_SPELLINGS.has(key) === generic));
    return keys.flatMap((key, column) => (key && !taken.has(column) && aliasKeys.has(key) ? [column] : []));
  };
  // clear names first for every field, so a generic word never takes a column another field names clearly
  const clear = new Map(ordered.map(field => [field.key, candidates(field, false)]));
  for (const field of ordered) {
    let columns = clear.get(field.key)!.filter(column => !taken.has(column));
    // Q-48: the same name written twice («القسم» in B and in E): for the field that allows it, the column nearer the activity (the later one) is read and the
    // earlier one (the merged division) is left aside — shown in the preview, and a person can still choose the other by its letter.
    if (columns.length > 1 && lastWins.has(field.key) && new Set(columns.map(column => keys[column])).size === 1) columns = [columns[columns.length - 1]];
    if (columns.length > 1) { ambiguous.push({ field: field.key, headers: columns.map(column => headers[column]) }); columns.forEach(column => taken.add(column)); }
    else if (columns.length === 1) { mapping.set(field.key, headers[columns[0]]); taken.add(columns[0]); }
  }
  for (const field of ordered) {
    if (mapping.has(field.key) || ambiguous.some(item => item.field === field.key)) continue;
    const columns = candidates(field, true);
    if (columns.length > 1) { ambiguous.push({ field: field.key, headers: columns.map(column => headers[column]) }); columns.forEach(column => taken.add(column)); }
    else if (columns.length === 1) { mapping.set(field.key, headers[columns[0]]); taken.add(columns[0]); }
  }
  const known = new Set(fields.flatMap(field => field.aliases.map(pmcHeaderKey)));
  return {
    mapping, ambiguous,
    missing: fields.filter(field => field.required && !mapping.has(field.key) && !ambiguous.some(item => item.field === field.key)).map(field => field.key),
    unsupported: headers.filter((header, column) => baseHeaders[column] && !taken.has(column) && !known.has(keys[column])),
  };
}

/**
 * The header row: the first of the top rows that names every required field (a title or a logo above the table is common). Q-48: when no row names them all,
 * the row that names the MOST known fields (the earliest on a tie) — not row 1 — so a table under two title rows still shows its own columns for a person to
 * map, instead of an empty title row.
 */
type PmcEvaluation = HeaderEvaluation & { match: HeaderMatch; fields: Field[] };
const pmcEvaluate = (kind: PmcImportKind) => ({ headers, baseHeaders, rows }: TableRows): PmcEvaluation => {
  const distinctValues = (word: string) => {
    const column = baseHeaders.findIndex(header => pmcHeaderKey(header) === pmcHeaderKey(word));
    return column < 0 ? 0 : new Set(rows.map(item => String(item[headers[column]] ?? "").trim()).filter(Boolean)).size;
  };
  const fields = fieldsForFile(kind, new Set(baseHeaders.map(pmcHeaderKey)), distinctValues);
  const match = matchHeaders(fields, headers, baseHeaders, kind === "weights" ? new Set([WEIGHTS_SECTION_LAST]) : undefined);
  // every field found (an ambiguity, if any, is reported on this row); sheets are ranked by the fewest missing required fields
  return { found: match.mapping.size, complete: match.missing.length === 0, closeness: -match.missing.length, match, fields };
};
const headerSearchLimits = (kind: PmcImportKind) => ({ maxRows: kind === "weights" ? 2_000 : 0, maxColumns: PMC_IMPORT_LIMITS.maxColumns });

/** Columns that hold something in the header row; formatted but empty columns at the right (common in exports) do not count against the limit. */
function filledColumns(sheet: ExcelJS.Worksheet, headerRow: number) {
  const row = sheet.getRow(headerRow);
  let last = 0;
  for (let column = 1; column <= Math.min(sheet.columnCount, 500); column += 1) if (cellText(row.getCell(column)).trim()) last = column;
  return last;
}

/** The fields of a kind (key and whether it is required): what a column-mapping screen offers. */
export const pmcImportFields = (kind: PmcImportKind) => FIELDS[kind].map(field => ({ key: field.key, required: field.required }));

/**
 * A person's choice of columns (field key → the header as the file writes it) replaces what was found for those fields. An EMPTY header clears a field the
 * reader had found (the person chose «no column»; a required field then reads as missing — review of #371). The key `__others__` set to "ignore" says the
 * person saw the whole column list and the columns no field uses are to be ignored, not refused (an extra «Notes» column in a villa list). A field the kind
 * does not have, a header the file does not have, or one header for two fields is refused (IMPORT_MAPPING_INVALID): a mapping is never half applied.
 */
export const IGNORE_OTHER_COLUMNS = "__others__";
function applyOverride(fields: Field[], headers: string[], match: HeaderMatch, override: Record<string, string>): HeaderMatch | { invalid: string } {
  const keys = new Set(fields.map(field => field.key));
  const used = new Map<string, string>();
  const ignoreOthers = override[IGNORE_OTHER_COLUMNS] === "ignore";
  const chosen = Object.entries(override).filter(([key]) => key !== IGNORE_OTHER_COLUMNS);
  if (IGNORE_OTHER_COLUMNS in override && !ignoreOthers) return { invalid: IGNORE_OTHER_COLUMNS };
  for (const [key, header] of chosen) {
    if (!keys.has(key)) return { invalid: key };
    if (header === "") continue;
    if (!headers.includes(header)) return { invalid: header };
    if (used.has(header)) return { invalid: header };
    used.set(header, key);
  }
  const named = new Set(chosen.map(([key]) => key));
  const mapping = new Map<string, string>(Array.from(match.mapping.entries()).filter(([key, header]) => !named.has(key) && !used.has(header)));
  for (const [key, header] of chosen) if (header !== "") mapping.set(key, header);
  const mapped = new Set(mapping.values());
  return {
    mapping,
    ambiguous: match.ambiguous.filter(item => !named.has(item.field) && !mapping.has(item.field)),
    missing: fields.filter(field => field.required && !mapping.has(field.key)).map(field => field.key).filter(key => !match.ambiguous.some(item => item.field === key && !named.has(key))),
    unsupported: ignoreOthers ? [] : match.unsupported.filter(header => !mapped.has(header)),
  };
}

export async function parsePmcImportFile(input: { kind: PmcImportKind; format: "xlsx" | "csv"; bytes: Uint8Array; mappingOverride?: Record<string, string>; edits?: PmcImportEdits }): Promise<ParsedFile> {
  const fail = (code: string, detail?: string): ParsedFile => ({ headers: [], rows: [], errors: [{ rowNumber: 0, code, ...(detail ? { detail } : {}) }] });
  // CSV: UTF-8, or the Windows Arabic code page that older Excel writes (Q-31)
  const parsed = await readSpreadsheetSafely(input.format === "csv" ? decodeCsv(input.bytes).text : input.bytes, input.format);
  if (!parsed.ok) return fail(parsed.code);
  // Q-31: a workbook may carry other sheets (notes, a cover, the villa list beside the weights): the sheet whose header names every required field is read
  // (Q-50: the shared reader in importEngine/read.ts).
  const choice = chooseSheet(parsed.workbook, pmcEvaluate(input.kind), headerSearchLimits(input.kind));
  if (!choice.ok) return fail(choice.code, choice.detail);
  const { sheet, candidate } = choice;
  const chosen = { headers: candidate.headers, match: candidate.evaluation.match };
  const { row: headerRow } = candidate;
  const { fields } = candidate.evaluation;
  let match = chosen.match;
  const override = input.mappingOverride && Object.keys(input.mappingOverride).length ? input.mappingOverride : undefined;
  if (override) {
    const applied = applyOverride(fields, chosen.headers, match, override);
    if ("invalid" in applied) return fail("IMPORT_MAPPING_INVALID", applied.invalid);
    match = applied;
  }
  if (filledColumns(sheet, headerRow) > PMC_IMPORT_LIMITS.maxColumns) return fail("IMPORT_TOO_MANY_COLUMNS");
  const { headers, rows, rowNumbers } = worksheetToRows(sheet, PMC_IMPORT_LIMITS, headerRow, { uniqueHeaders: true });
  // a column with no name and nothing in it (a formatted margin) is not a column of the table
  const holdsData = (header: string) => !/^\([A-Z]+\)$/.test(header) || rows.some(row => String(row[header] ?? "").trim() !== "");
  if (sheet.rowCount - headerRow > PMC_IMPORT_LIMITS.maxRows) return { headers, rows: [], errors: [{ rowNumber: 0, code: "IMPORT_TOO_MANY_ROWS" }] };
  const errors: PmcImportError[] = [];
  // a weights table exported from a spreadsheet tool carries its own extra columns (ids, totals, notes): they are ignored, not refused
  if (input.kind !== "weights") for (const header of match.unsupported) errors.push({ rowNumber: headerRow, code: "IMPORT_UNSUPPORTED_COLUMN", field: header });
  for (const item of match.ambiguous) errors.push({ rowNumber: headerRow, code: "IMPORT_COLUMN_AMBIGUOUS", field: item.field, detail: item.headers.join(" | ") });
  for (const key of match.missing) errors.push({ rowNumber: headerRow, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: key, detail: headers.filter(Boolean).join(" | ") });
  const offered = headers.filter(header => header && holdsData(header));
  const resolved = Object.fromEntries(fields.map(field => [field.key, match.mapping.get(field.key) ?? null]));
  // a field the person mapped (a non-empty header in the override) is «chosen»; the rest the reader found by name
  const chosenKeys = new Set(Object.entries(override ?? {}).filter(([key, header]) => key !== "__others__" && header && header !== "ignore").map(([key]) => key));
  const hints = columnHints(fields, offered, resolved, chosenKeys);
  const columns: PmcImportColumns = { headers: offered, fields: fields.map(field => ({ key: field.key, required: field.required, header: resolved[field.key], ...hints[field.key] })), overridden: Boolean(override) };
  if (errors.length) return { headers, rows: [], errors, columns };
  const mapping = match.mapping;
  const out: ParsedRow[] = [];
  const used = new Set(mapping.values());
  const ignoredColumns: PmcIgnoredColumn[] = headers.filter(header => header && !used.has(header) && holdsData(header))
    .map(header => ({ header, samples: Array.from(new Set(rows.map(row => String(row[header] ?? "").trim()).filter(Boolean))).slice(0, 3) }));
  const notes: NonNullable<ParsedFile["notes"]> = { skippedTotals: 0, filledDown: 0, ...(ignoredColumns.length ? { ignoredColumns } : {}) };
  // Q-50 batch 4: the person's corrections, applied to the rows as read (the stored file is untouched). A correction of a row the table does not have, or of a
  // field no column is read for, is refused with the row — never dropped silently
  const ignored = new Set<number>();
  const forced = new Set<number>();
  if (input.edits) {
    const indexOf = new Map(rowNumbers.map((rowNumber, index) => [rowNumber, index] as const));
    const refused: PmcImportError[] = [];
    for (const row of input.edits.ignoreRows) { if (indexOf.has(row)) ignored.add(row); else refused.push({ rowNumber: row, code: "IMPORT_EDIT_INVALID" }); }
    for (const row of input.edits.readRows ?? []) { if (indexOf.has(row) && !ignored.has(row)) forced.add(row); else refused.push({ rowNumber: row, code: "IMPORT_EDIT_INVALID" }); }
    const applied: PmcAppliedEdit[] = [];
    for (const edit of input.edits.cells) {
      const index = indexOf.get(edit.row);
      const header = mapping.get(edit.field);
      if (index === undefined || !header) { refused.push({ rowNumber: edit.row, code: "IMPORT_EDIT_INVALID", field: edit.field }); continue; }
      const from = String(rows[index][header] ?? "").trim();
      rows[index][header] = edit.value;
      applied.push({ row: edit.row, field: edit.field, header, from, to: edit.value });
    }
    if (refused.length) return { headers, rows: [], errors: refused, columns };
    if (applied.length) notes.edits = applied;
    if (ignored.size) notes.ignoredRows = Array.from(ignored).sort((a, b) => a - b);
    if (forced.size) notes.readRows = Array.from(forced).sort((a, b) => a - b);
  }
  // Q-50 4c: the class of each row as read, for the first rows of the table (the preview the person classifies)
  const preview: PmcPreviewRow[] = [];
  const classify = (index: number, rowClass: PmcRowClass) => {
    if (preview.length >= PMC_PREVIEW_ROWS) return;
    preview.push({ row: rowNumbers[index], class: rowClass, cells: Object.fromEntries(fields.filter(field => mapping.has(field.key)).map(field => [field.key, String(rows[index][mapping.get(field.key)!] ?? "").trim()])) });
  };
  // Q-48: a section merged over its rows and left with no name is empty on purpose — those rows do not take the section above them
  const csiColumn = mapping.has("csi") ? headers.indexOf(mapping.get("csi")!) + 1 : 0;
  const blankByMerge = emptyVerticalMergeCover(sheet);
  let lastCsi = "";
  rows.forEach((row, index) => {
    if (ignored.has(rowNumbers[index])) { classify(index, "leftOut"); return; }
    const cells = Object.fromEntries(fields.map(field => [field.key, mapping.has(field.key) ? row[mapping.get(field.key)!] : undefined]));
    if (input.kind === "weights") {
      // a totals line: every filled label of the row (section, sub-item, activity) is total words — skipped, and COUNTED in the report (never silent)
      const labels = [cells.csi, cells.sub, cells.activityName].map(value => pmcHeaderKey(value)).filter(Boolean);
      const keepTotal = () => { notes.skippedTotals += 1; (notes.fileTotals ??= []).push({ row: rowNumbers[index], value: String(cells.weight ?? "").trim() }); };
      const readAsData = forced.has(rowNumbers[index]);
      if (!readAsData && labels.length > 0 && labels.every(label => TOTAL_LINE.test(label))) { keepTotal(); classify(index, "total"); return; }
      // I50 (the owner's real file): the totals word may sit in a column no field reads («م», merged with the division cell) while every mapped label is
      // empty and the weight column holds the rounded sum (0.99999). No label and no activity name, and a cell of the row that is total words: a totals line
      if (!readAsData && labels.length === 0 && Object.values(row).some(value => TOTAL_LINE.test(pmcHeaderKey(value)))) { keepTotal(); classify(index, "total"); return; }
      // Q-47 (owner decision 18-11): a section written once above its activities — the empty section cells below it take it, counted and shown in the preview
      const csi = String(cells.csi ?? "").trim();
      if (csi) lastCsi = csi;
      else if (csiColumn && blankByMerge(rowNumbers[index], csiColumn)) lastCsi = "";
      else if (lastCsi && String(cells.activityName ?? "").trim()) { cells.csi = lastCsi; notes.filledDown += 1; }
    }
    classify(index, "data");
    out.push({ rowNumber: rowNumbers[index], cells });
  });
  if (preview.length) notes.preview = preview;
  return { headers, errors, rows: out, columns, notes };
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
    const blockCode = text(cells.blockCode);
    // no zone written: the block's own zone if the block exists (in the project or earlier in the file), else the one default zone
    const zoneCode = text(cells.zoneCode) || context.blocks.get(blockCode)?.zoneCode || blockInfo.get(blockCode)?.zoneCode || DEFAULT_ZONE_CODE;
    const modelCode = text(cells.modelCode);
    const before = errors.length;
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
  /** How far from 100 a model's total may be. The catalogue: 0.0001. The weights table (Q-47, owner decision 18-11): 0.01, accepted with a note. */
  totalTolerance?: number;
  groups: Map<string, { id: string; nameEn?: string | null }>;
  stages: Map<string, { id: string; groupCode: string; nameEn?: string | null }>;
  definitions: Map<string, { id: string; weightPercent: number; groupCode: string; stageCode: string; name: string; wbsItemId: string | null; nameEn?: string | null }>;
  activityCodesByModel: Map<string, Set<string>>;
  wbsItems: Map<string, string>;
};
export type CatalogPlan = {
  errors: PmcImportError[];
  newGroups: Array<{ code: string; name: string; nameEn: string | null }>;
  newStages: Array<{ code: string; name: string; groupCode: string; nameEn: string | null }>;
  newDefinitions: Array<{ modelCode: string; code: string; name: string; weightPercent: number; groupCode: string; stageCode: string; wbsItemId: string | null; nameEn: string | null }>;
  /** `nameEn` null: the file gave no English name, the stored one is kept (an empty cell never erases it; the catalogue screen does). */
  updatedDefinitions: Array<{ id: string; name: string; weightPercent: number; groupCode: string; stageCode: string; wbsItemId: string | null; nameEn: string | null }>;
  /** Q-49: an existing group or stage the file gives a new English name. */
  updatedGroupNames: Array<{ id: string; nameEn: string }>;
  updatedStageNames: Array<{ id: string; nameEn: string }>;
  /** Q-49: names the reader split into Arabic and English (shown in the preview), at most 20. */
  splitNames: Array<{ original: string; ar: string; en: string }>;
  models: Array<{ modelCode: string; activities: number; totalWeight: number }>;
  counts: PmcImportCounts;
};
const defKey = (modelCode: string, code: string) => `${modelCode}\u0000${code}`;
const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function planCatalog(rows: ParsedRow[], context: CatalogContext): CatalogPlan {
  const errors: PmcImportError[] = [];
  const valid: Array<{ modelCode: string; groupCode: string; groupName: string; groupNameEn: string | null; stageCode: string; stageName: string; stageNameEn: string | null; code: string; name: string; nameEn: string | null; weightPercent: number; wbsItemId: string | null }> = [];
  const splitNames = new Map<string, { original: string; ar: string; en: string }>();
  // a name and its English: the English column when the file has one, otherwise a mixed cell split in two
  const named = (raw: string, english: unknown) => {
    const explicit = text(english);
    if (explicit) return { name: raw, nameEn: explicit };
    const split = splitMixedName(raw);
    if (split.en && splitNames.size < 20) splitNames.set(raw, { original: raw, ar: split.ar, en: split.en });
    return { name: split.ar, nameEn: split.en };
  };
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
    const group = named(text(cells.groupName) || groupCode, cells.groupNameEn);
    const stage = named(text(cells.stageName) || stageCode, cells.stageNameEn);
    valid.push({ modelCode, groupCode, groupName: group.name, groupNameEn: group.nameEn, stageCode, stageName: stage.name, stageNameEn: stage.nameEn, code, name, nameEn: text(cells.activityNameEn) || null, weightPercent, wbsItemId });
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
    if (Math.abs(totalWeight - 100) > (context.totalTolerance ?? 0.0001) + 1e-9) { brokenModels.add(modelCode); errors.push({ rowNumber: 0, code: "PMC_MODEL_WEIGHTS_NOT_100", field: modelCode, detail: `${modelCode} totals ${totalWeight} (${totalWeight < 100 ? "missing" : "over by"} ${round4(Math.abs(100 - totalWeight))})` }); }
    const fileCodes = new Set(modelRows.map(row => row.code));
    context.activityCodesByModel.get(modelCode)?.forEach(existingCode => { if (!fileCodes.has(existingCode)) { brokenModels.add(modelCode); errors.push({ rowNumber: 0, code: "PMC_MODEL_ACTIVITY_OMITTED", field: modelCode, detail: `${modelCode}/${existingCode}` }); } });
  });

  const newGroups = new Map<string, { name: string; nameEn: string | null }>();
  const newStages = new Map<string, { name: string; groupCode: string; nameEn: string | null }>();
  const updatedGroupNames = new Map<string, { id: string; nameEn: string }>();
  const updatedStageNames = new Map<string, { id: string; nameEn: string }>();
  const newDefinitions: CatalogPlan["newDefinitions"] = [];
  const updatedDefinitions: CatalogPlan["updatedDefinitions"] = [];
  let unchanged = 0;
  for (const row of valid) {
    if (brokenModels.has(row.modelCode)) continue;
    const storedGroup = context.groups.get(row.groupCode);
    if (!storedGroup && !newGroups.has(row.groupCode)) newGroups.set(row.groupCode, { name: row.groupName, nameEn: row.groupNameEn });
    if (storedGroup && row.groupNameEn && row.groupNameEn !== (storedGroup.nameEn ?? null)) updatedGroupNames.set(row.groupCode, { id: storedGroup.id, nameEn: row.groupNameEn });
    const storedStage = context.stages.get(row.stageCode);
    if (!storedStage && !newStages.has(row.stageCode)) newStages.set(row.stageCode, { name: row.stageName, groupCode: row.groupCode, nameEn: row.stageNameEn });
    if (storedStage && row.stageNameEn && row.stageNameEn !== (storedStage.nameEn ?? null)) updatedStageNames.set(row.stageCode, { id: storedStage.id, nameEn: row.stageNameEn });
    const existing = context.definitions.get(defKey(row.modelCode, row.code));
    if (!existing) { newDefinitions.push({ modelCode: row.modelCode, code: row.code, name: row.name, weightPercent: row.weightPercent, groupCode: row.groupCode, stageCode: row.stageCode, wbsItemId: row.wbsItemId, nameEn: row.nameEn }); continue; }
    const sameEnglish = row.nameEn === null || row.nameEn === (existing.nameEn ?? null);
    const same = existing.name === row.name && existing.weightPercent === row.weightPercent && existing.groupCode === row.groupCode && existing.stageCode === row.stageCode && existing.wbsItemId === row.wbsItemId && sameEnglish;
    if (same) unchanged += 1;
    else updatedDefinitions.push({ id: existing.id, name: row.name, weightPercent: row.weightPercent, groupCode: row.groupCode, stageCode: row.stageCode, wbsItemId: row.wbsItemId, nameEn: row.nameEn });
  }
  // a group or stage that only gains an English name is a change to save, counted with the updates (so the same file twice is still «nothing to do»)
  const renamed = updatedGroupNames.size + updatedStageNames.size;
  return {
    errors, newGroups: Array.from(newGroups, ([code, value]) => ({ code, ...value })), newStages: Array.from(newStages, ([code, value]) => ({ code, ...value })), newDefinitions, updatedDefinitions,
    updatedGroupNames: Array.from(updatedGroupNames.values()), updatedStageNames: Array.from(updatedStageNames.values()), splitNames: Array.from(splitNames.values()),
    models, counts: { create: newDefinitions.length, update: updatedDefinitions.length + renamed, unchanged },
  };
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

/**
 * A baseline given as start and end dates per activity, expanded into the monthly cumulative points the screens read:
 * the planned completion by the end of each month is the share of the activity's calendar days (both ends included)
 * that has passed by then, 0 before the start (no point) and 100 from the month of the end. The expanded points go
 * through exactly the checks a monthly file does, so the two formats can never disagree about what a baseline is.
 */
export function planBaselineDates(rows: ParsedRow[], context: BaselineContext): BaselinePlan {
  const errors: PmcImportError[] = [];
  const expanded: ParsedRow[] = [];
  const seen = new Set<string>();
  const DAY = 86_400_000;
  const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  for (const { rowNumber, cells } of rows) {
    const before = errors.length;
    const modelCode = text(cells.modelCode);
    const activityCode = text(cells.activityCode);
    required(errors, rowNumber, "modelCode", modelCode);
    required(errors, rowNumber, "activityCode", activityCode);
    const start = importDate(cells.startDate);
    const end = importDate(cells.endDate);
    if (!start) errors.push({ rowNumber, code: "PMC_DATE_INVALID", field: "startDate" });
    if (!end) errors.push({ rowNumber, code: "PMC_DATE_INVALID", field: "endDate" });
    if (start && end && utcDay(end) < utcDay(start)) errors.push({ rowNumber, code: "PMC_BASELINE_END_BEFORE_START", field: "endDate", detail: `${modelCode}/${activityCode}` });
    const key = defKey(modelCode, activityCode);
    if (modelCode && activityCode) {
      if (seen.has(key)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "activityCode", detail: `${modelCode}/${activityCode}` });
      else seen.add(key);
    }
    if (errors.length > before || !start || !end) continue;
    const first = utcDay(start);
    const last = utcDay(end);
    const total = (last - first) / DAY + 1;
    for (let month = monthStart(start); month.getTime() <= last; month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))) {
      const monthEnd = Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0);
      const elapsed = (Math.min(monthEnd, last) - first) / DAY + 1;
      expanded.push({ rowNumber, cells: { modelCode, activityCode, period: month, plannedPercent: Math.round((elapsed / total) * 1_000_000) / 10_000 } });
    }
  }
  if (errors.length) {
    // The file's own problems come first; the expanded points are only checked against what is stored when the file itself is sound.
    return { errors, creates: [], updates: [], counts: { create: 0, update: 0, unchanged: 0 } };
  }
  return planBaseline(expanded, context);
}

export { defKey as pmcDefinitionKey };

// ---- weights (Q-3): the owner's table translated into catalogue rows

export const DEFAULT_ZONE_CODE = "Z1";
export type WeightsTranslation = { rows: ParsedRow[]; errors: PmcImportError[]; ignoredZeroWeight: number; scaledFromFractions: boolean; totalChecks: PmcTotalCheck[] };
// Q-31: Arabic-Indic digits, «٪» and «%», «٫», and a decimal comma («2,5» is two and a half, not 25) are read as people write them (parseNumber).
const weightNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!text(value)) return undefined;
  const parsed = parseNumber(text(value));
  return parsed ? parsed.value : undefined;
};
/** A stable code for an activity that came without one, so importing the same table again finds the same activity. */
export function weightActivityCode(name: string): string {
  let hash = 0x811c9dc5;
  for (const char of name.trim().toLowerCase()) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `ACT-${hash.toString(16).padStart(8, "0").toUpperCase()}`;
}

/**
 * The rules of the owner's own tool: a row with no weight or a weight of zero is skipped (counted, not refused); weights written as fractions (0.025, all at most 1 and
 * totalling 1) are read as percentages; the CSI section is the group and the sub-item the stage (a row without a sub-item sits in a stage named after its section);
 * a table without a model column applies to every model the project's villas use, so the villa list comes first.
 */
const FORMULA_ERROR = /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)/i;
export function weightsToCatalogRows(rows: ParsedRow[], projectModels: string[], fileTotals: PmcFileTotal[] = []): WeightsTranslation {
  const errors: PmcImportError[] = [];
  const kept: Array<{ rowNumber: number; csi: string; sub: string; code: string; name: string; nameEn: string; weight: number; modelCode: string }> = [];
  let ignoredZeroWeight = 0;
  for (const { rowNumber, cells } of rows) {
    const weightCell = text(cells.weight);
    const weight = weightNumber(cells.weight);
    const name = text(cells.activityName);
    const csi = text(cells.csi);
    if (!weightCell || weight === 0) { if (name || csi) ignoredZeroWeight += 1; continue; }
    // Q-48: a weight the file could not compute («#REF!», «#VALUE!»…) is refused on its row with the code Excel wrote, never read as zero
    if (FORMULA_ERROR.test(weightCell)) { errors.push({ rowNumber, code: "IMPORT_FORMULA_ERROR", field: "weightPercent", detail: weightCell }); continue; }
    if (weight === undefined || weight < 0) { errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "weightPercent" }); continue; }
    if (!csi) { errors.push({ rowNumber, code: "PMC_CLASSIFICATION_BLANK", field: "groupCode" }); continue; }
    if (!name) { errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "activityName" }); continue; }
    kept.push({ rowNumber, csi, sub: text(cells.sub), code: text(cells.activityCode) || weightActivityCode(name), name, nameEn: text(cells.activityNameEn), weight, modelCode: text(cells.modelCode) });
  }
  const total = kept.reduce((sum, row) => sum + row.weight, 0);
  const scaledFromFractions = kept.length > 0 && kept.every(row => row.weight <= 1) && Math.abs(total - 1) <= 0.0001 * kept.length + 0.0001;
  const models = projectModels.length ? projectModels : [];
  const withoutModel = kept.some(row => !row.modelCode);
  if (withoutModel && !models.length) errors.push({ rowNumber: 0, code: "PMC_WEIGHTS_NEED_VILLAS" });
  const out: ParsedRow[] = [];
  for (const row of kept) {
    const weightPercent = scaledFromFractions ? Math.round(row.weight * 100 * 10000) / 10000 : row.weight;
    const stage = row.sub || row.csi;
    for (const modelCode of row.modelCode ? [row.modelCode] : models) {
      out.push({ rowNumber: row.rowNumber, cells: { modelCode, groupCode: row.csi.slice(0, 80), groupName: row.csi, stageCode: `${row.csi} / ${stage}`.slice(0, 80), stageName: stage, activityCode: row.code.slice(0, 80), activityName: row.name, activityNameEn: row.nameEn, weightPercent } });
    }
  }
  // Q-50 batch 5a: the file's own totals line against the sum of what was read, in the file's units. A difference is said (a row the reader did not take,
  // or a total typed by hand), never fixed here; with more than one model in the file one total cannot be compared with them all
  const modelsInFile = new Set(kept.map(row => row.modelCode).filter(Boolean));
  const tolerance = scaledFromFractions || (kept.length > 0 && kept.every(row => row.weight <= 1)) ? 0.0001 * Math.max(1, kept.length) : 0.01;
  const totalChecks: PmcTotalCheck[] = fileTotals.map(line => {
    const fileValue = weightNumber(line.value);
    if (fileValue === undefined || fileValue === null || Number.isNaN(fileValue)) return { row: line.row, fileValue: null, readSum: round4(total), status: "not_comparable" as const };
    if (modelsInFile.size > 1) return { row: line.row, fileValue, readSum: round4(total), status: "not_comparable" as const };
    return { row: line.row, fileValue, readSum: round4(total), status: Math.abs(fileValue - total) <= tolerance ? "matches" as const : "differs" as const };
  });
  return { rows: out, errors, ignoredZeroWeight, scaledFromFractions, totalChecks };
}
