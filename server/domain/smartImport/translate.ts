// What the reader understood, written in the exact columns the existing importers already read (shared/importTemplateHeaders.ts, English headers).
// Nothing here decides what is imported: the importer still validates every row and the person still confirms. This only removes the need to reshape the file by hand.
import { createHash } from "node:crypto";
import { importTemplateHeaders, type ImportModuleCode } from "../../../shared/importTemplateHeaders";
import type { NormalizedRow } from "./understand";
import type { KindCode } from "./kinds";

export type TranslatedFile = {
  module: ImportModuleCode;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** source rows left out because a column the importer requires was empty (they stay flagged in the preview and in this count) */
  excluded: Array<{ rowNumber: number; reason: string }>;
  /** what the translation could not carry over: said in the preview, never silent */
  notes: string[];
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const SCHEDULE_STATUS: Array<[RegExp, string]> = [
  [/^(completed?|complete|done|100|مكتمل|منتهي|منجز|تم)/i, "Completed"],
  [/^(in ?progress|active|started|ongoing|قيد|جاري|جارٍ|يعمل)/i, "In Progress"],
  [/^(not ?started|not ?begun|planned|لم يبدأ|لم تبدأ|لم يبدا|غير مبدوء)/i, "Not Started"],
  [/^(blocked|suspended|on ?hold|متعثر|متوقف|معلق|محجوب)/i, "Blocked"],
];
export function scheduleStatus(status: unknown, progress: unknown): string {
  const raw = text(status);
  for (const [pattern, label] of SCHEDULE_STATUS) if (pattern.test(raw)) return label;
  const percent = num(progress);
  if (percent !== null) return percent >= 100 || (percent >= 0.999 && percent <= 1) ? "Completed" : percent > 0 ? "In Progress" : "Not Started";
  return "";
}

/** A code made up from the row's own words, so the same material in the next file gets the same code. */
export const generatedCode = (prefix: string, ...parts: unknown[]) => `${prefix}-${createHash("sha256").update(parts.map(text).join("|").toLowerCase()).digest("hex").slice(0, 6).toUpperCase()}`;

/** «ريال» / «ر.س» / «SR» are the Saudi riyal; the importer accepts the ISO code only. Any other currency passes through as written (upper-cased) and the importer says it is not accepted. */
export function currencyCode(value: unknown): string {
  const raw = text(value);
  if (/^(sar|sr|s\.r\.?|ر\.? ?س\.?|ريال|ريال سعودي|ريال سعودى|saudi riyals?|riyals?)$/i.test(raw)) return "SAR";
  return raw.toUpperCase();
}

type Translate = (rows: NormalizedRow[]) => TranslatedFile;

const exclude = (file: TranslatedFile, row: NormalizedRow, reason: string) => { file.excluded.push({ rowNumber: row.rowNumber, reason }); };
const blank = (module: ImportModuleCode): TranslatedFile => ({ module, headers: importTemplateHeaders[module].en, rows: [], excluded: [], notes: [] });

const boq: Translate = rows => {
  const file = blank("wbs");
  const seen = new Set<string>();
  for (const row of rows) {
    const code = text(row.values.code); const name = text(row.values.name);
    if (!code || !name) { exclude(file, row, !code ? "MISSING:code" : "MISSING:name"); continue; }
    if (seen.has(code)) { exclude(file, row, `DUPLICATE_CODE:${code}`); continue; }
    seen.add(code);
    const quantity = num(row.values.quantity); const rate = num(row.values.rate);
    const amount = num(row.values.amount) ?? (quantity !== null && rate !== null ? Math.round(quantity * rate * 100) / 100 : 0);
    file.rows.push([code, name, Math.max(0, amount)]);
  }
  file.notes.push("BOQ_QUANTITY_AND_RATE_NOT_CARRIED");
  return file;
};

const schedule: Translate = rows => {
  const file = blank("schedule");
  const wbsNames = new Map<string, string>();
  const activities: Array<Array<string | number>> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const code = text(row.values.activityCode); const name = text(row.values.activityName);
    const start = text(row.values.plannedStartAt); const finish = text(row.values.plannedFinishAt);
    if (!code || !name) { exclude(file, row, !code ? "MISSING:activityCode" : "MISSING:activityName"); continue; }
    if (!start || !finish) { exclude(file, row, "MISSING:dates"); continue; }
    if (finish < start) { exclude(file, row, "FINISH_BEFORE_START"); continue; }
    if (seen.has(code)) { exclude(file, row, `DUPLICATE_CODE:${code}`); continue; }
    seen.add(code);
    const wbs = text(row.values.wbsCode) || "GEN";
    if (!wbsNames.has(wbs)) wbsNames.set(wbs, wbs === "GEN" ? "أنشطة غير مصنفة" : wbs);
    activities.push(["Activity", wbs, "", code, name, start, finish, num(row.values.plannedValue) ?? 0, scheduleStatus(row.values.status, row.values.progress)]);
  }
  for (const [code, name] of Array.from(wbsNames)) file.rows.push(["WBS", code, name, "", "", "", "", 0, ""]);
  file.rows.push(...activities);
  if (wbsNames.has("GEN")) file.notes.push("SCHEDULE_WBS_SYNTHESISED");
  return file;
};

const materials: Translate = rows => {
  const file = blank("materials");
  const seen = new Set<string>(); let generated = 0; let uncategorised = 0;
  for (const row of rows) {
    const description = text(row.values.description);
    if (!description) { exclude(file, row, "MISSING:description"); continue; }
    const unit = text(row.values.unitOfMeasure);
    if (!unit) { exclude(file, row, "MISSING:unitOfMeasure"); continue; }
    let code = text(row.values.code);
    if (!code) { code = generatedCode("MAT", description, unit); generated += 1; }
    if (seen.has(code)) { exclude(file, row, `DUPLICATE_CODE:${code}`); continue; }
    seen.add(code);
    const category = text(row.values.category) || (uncategorised += 1, "غير مصنف");
    file.rows.push([code, description, unit, category, text(row.values.referenceSpecification)]);
  }
  if (generated) file.notes.push("MATERIAL_CODES_GENERATED");
  if (uncategorised) file.notes.push("MATERIAL_CATEGORY_DEFAULTED");
  return file;
};

const budget: Translate = rows => {
  const file = blank("budget");
  const seen = new Set<string>(); let defaulted = 0;
  for (const row of rows) {
    const code = text(row.values.costCode); const original = num(row.values.originalAmount);
    if (!code || original === null) { exclude(file, row, !code ? "MISSING:costCode" : "MISSING:originalAmount"); continue; }
    if (seen.has(code)) { exclude(file, row, `DUPLICATE_CODE:${code}`); continue; }
    seen.add(code);
    const current = num(row.values.currentAmount) ?? (defaulted += 1, original);
    file.rows.push([code, Math.max(0, original), Math.max(0, current)]);
  }
  if (defaulted) file.notes.push("BUDGET_CURRENT_DEFAULTED_TO_ORIGINAL");
  return file;
};

const contracts: Translate = rows => {
  const file = blank("contracts");
  const seen = new Set<string>(); let defaulted = 0;
  for (const row of rows) {
    const code = text(row.values.code); const title = text(row.values.title); const party = text(row.values.counterparty); const value = num(row.values.contractValue);
    if (!code || !title || !party || value === null) { exclude(file, row, !code ? "MISSING:code" : !title ? "MISSING:title" : !party ? "MISSING:counterparty" : "MISSING:contractValue"); continue; }
    if (seen.has(code)) { exclude(file, row, `DUPLICATE_CODE:${code}`); continue; }
    seen.add(code);
    const currency = text(row.values.currency) || (defaulted += 1, "SAR");
    file.rows.push([code, title, party, Math.max(0, value), currencyCode(currency)]);
  }
  if (defaulted) file.notes.push("CONTRACT_CURRENCY_DEFAULTED");
  return file;
};

const TRANSLATORS: Partial<Record<KindCode, Translate>> = { boq, schedule, materials, budget, contracts };
/** The kinds that have an importer to hand the rows to (a payment certificate and a daily report are recognised, but nothing imports them yet). */
export const hasTranslator = (kind: KindCode) => kind in TRANSLATORS;
export function translate(kind: KindCode, rows: NormalizedRow[]): TranslatedFile | null {
  const run = TRANSLATORS[kind];
  return run ? run(rows) : null;
}
