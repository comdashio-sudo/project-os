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

/** Q-66 (4): the nearest parent of each code among the file's codes — the longest other code that is a prefix ending at a separator (1.2.3 → 1.2, GC-1.01 →
 * GC-1); none for a root. Codes that do not nest (1.1 and 1.2 with no «1») have no parents. */
export function parentsOfCodes(codes: string[]): Map<string, string> {
  const all = new Set(codes); const parents = new Map<string, string>();
  for (const code of codes) for (let index = code.length - 1; index > 0; index--) if (/[.\-/]/.test(code[index]) && all.has(code.slice(0, index))) { parents.set(code, code.slice(0, index)); break; }
  return parents;
}
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const boq: Translate = rows => {
  const file = blank("wbs");
  const seen = new Set<string>();
  const items: Array<{ row: NormalizedRow; code: string; name: string; amount: number | null }> = [];
  for (const row of rows) {
    const code = text(row.values.code); const name = text(row.values.name);
    if (!code || !name) { exclude(file, row, !code ? "MISSING:code" : "MISSING:name"); continue; }
    if (seen.has(code)) { exclude(file, row, `DUPLICATE_CODE:${code}`); continue; }
    seen.add(code);
    const quantity = num(row.values.quantity); const rate = num(row.values.rate);
    items.push({ row, code, name, amount: num(row.values.amount) ?? (quantity !== null && rate !== null ? round2(quantity * rate) : null) });
  }
  // Q-66 (4): a bill whose codes nest (1 → 1.1 → 1.1.1) keeps every row — the WBS is a tree — but a section's own amount is its items' subtotal: written as well,
  // the plan would count it twice. A section with an amount below it is written with 0 (the leaves carry the value); a section whose written amount differs from
  // the sum below it is SAID with both numbers and neither is changed; a section with nothing below keeps its own amount.
  const parents = parentsOfCodes(items.map(item => item.code));
  const children = new Map<string, string[]>();
  for (const [child, parent] of Array.from(parents)) children.set(parent, [...(children.get(parent) ?? []), child]);
  const byCode = new Map(items.map(item => [item.code, item]));
  const totals = new Map<string, number | null>();
  const totalOf = (code: string): number | null => {
    if (totals.has(code)) return totals.get(code)!;
    const below = children.get(code) ?? [];
    let total: number | null;
    if (!below.length) total = byCode.get(code)!.amount;
    else { const sums = below.map(totalOf).filter((value): value is number => value !== null); total = sums.length ? round2(sums.reduce((a, b) => a + b, 0)) : byCode.get(code)!.amount; }
    totals.set(code, total); return total;
  };
  let sections = 0;
  for (const item of items) {
    const below = children.get(item.code) ?? [];
    const belowTotal = below.length ? (() => { const sums = below.map(totalOf).filter((value): value is number => value !== null); return sums.length ? round2(sums.reduce((a, b) => a + b, 0)) : null; })() : null;
    if (belowTotal !== null) {
      sections += 1;
      if (item.amount !== null && Math.abs(item.amount - belowTotal) > 0.005) file.notes.push(`BOQ_SECTION_DIFFERS:${item.code}:${item.amount}:${belowTotal}`);
      file.rows.push([item.code, item.name, 0]);
    } else file.rows.push([item.code, item.name, Math.max(0, item.amount ?? 0)]);
  }
  if (sections) {
    file.notes.push(`BOQ_SECTIONS_AS_SUBTOTALS:${sections}`);
    const roots = items.filter(item => !parents.has(item.code)).map(item => totalOf(item.code) ?? 0);
    file.notes.push(`BOQ_TREE_TOTAL:${round2(roots.reduce((a, b) => a + b, 0))}`);
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
  for (const activity of activities) file.rows.push(activity); // a loop, not push(...activities): above about 120,000 activities the spread overflows the call stack (Q-61 1, D's review)
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
