import type { Concept } from "./dictionary";
import { inferDateOrder, parseDate, type DateOrder } from "./dates";
import { KINDS, KIND_CODES, type FieldType, type KindCode, type KindDefinition } from "./kinds";
import { AUTO_THRESHOLD, isAuto, mapColumns, type ColumnMatch } from "./mapper";
import { parseNumber } from "./numbers";
import { readGrid, type Cell, type SheetGrid } from "./sheetReader";
import { tabulate, type Table } from "./table";
import { normalizeUnit } from "./units";

// "This is what I understood": the whole reading of one file, with nothing written anywhere. Free and deterministic (no model). The same function serves the preview, the saved profiles
// (their column map is applied as `forced`) and the tests that measure how many columns are matched without help.
export type FileFormat = "xlsx" | "csv" | "xer" | "pdf" | "image" | "unknown";

export function detectFormat(bytes: Uint8Array, fileName: string): FileFormat {
  const b = Buffer.from(bytes.subarray(0, 4096));
  const name = fileName.toLowerCase();
  if (b.subarray(0, 6).toString("latin1") === "ERMHDR" || /%T\s+(PROJWBS|TASK|PROJECT)\b/.test(b.toString("latin1")) || name.endsWith(".xer")) return "xer";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00)) return "image";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return name.endsWith(".docx") || name.endsWith(".pptx") ? "unknown" : "xlsx";
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) return "csv";
  return "unknown";
}

export type FlaggedRow = { rowNumber: number; reasons: string[] };
export type NormalizedRow = { rowNumber: number; values: Record<string, string | number | null>; display: Record<string, string> };
export type Understanding = {
  format: FileFormat; encoding: string | null; kind: KindCode | "needsSmartReading" | null; kindConfidence: number; ambiguous: boolean;
  candidates: Array<{ sheet: string; kind: KindCode; score: number; rows: number }>;
  sheetNames: string[]; sheet: string | null;
  table: { headerRow: number; rows: number; skipped: { blank: number; section: number; total: number; repeatedHeader: number }; mergedFilled: number; titleLines: string[] } | null;
  columns: ColumnMatch[]; fields: Array<{ key: string; required: boolean; type: FieldType; label: { ar: string; en: string } }>;
  autoMatchedShare: number; sample: NormalizedRow[]; flagged: FlaggedRow[]; hijriDates: number; warnings: string[];
};

const textOf = (cell: Cell) => (cell === null ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());

function keywordBonus(kind: KindDefinition, sheetName: string, title: string[]): number {
  const hay = `${sheetName} ${title.join(" ")}`;
  return kind.keywords.some(pattern => pattern.test(hay)) ? 0.25 : 0;
}

function scoreKind(table: Table, kind: KindDefinition): { score: number; matches: ColumnMatch[] } {
  const matches = mapColumns(table, kind);
  const mapped = new Map(matches.filter(isAuto).map(match => [match.fieldKey!, match.confidence]));
  const required = kind.fields.filter(field => field.required);
  const requiredScore = required.length ? required.reduce((sum, field) => sum + (mapped.get(field.key) ?? 0), 0) / required.length : 0.5;
  const optional = kind.fields.filter(field => !field.required);
  const optionalScore = optional.length ? optional.filter(field => mapped.has(field.key)).length / optional.length : 0;
  // fields only a payment certificate has are strong evidence of one
  const specific = kind.code === "valuation" ? ["previousQuantity", "currentQuantity", "cumulativeQuantity", "retention", "advance"].filter(key => mapped.has(key)).length : 0;
  let score = Math.min(specific, 3) * 0.1 + requiredScore * 0.6 + optionalScore * 0.2 + keywordBonus(kind, table.sheet, table.titleLines) + (table.dataRows.length >= 3 ? 0.05 : 0);
  const has = (key: string) => mapped.has(key);
  // a priced list with quantities is a bill of quantities, not a materials register; a BOQ needs a quantity or an amount
  const priced = (kind.code === "boq" || kind.code === "materials") && (() => { const boq = new Set(mapColumns(table, KINDS.boq).filter(isAuto).map(match => match.fieldKey)); return boq.has("quantity") && boq.has("rate") && boq.has("amount"); })();
  if (kind.code === "materials" && has("quantity") && (priced || table.headers.some(header => /سعر|rate|price|الاجمالي|amount|total/i.test(header)))) score *= 0.75;
  if (kind.code === "boq" && priced) score += 0.1; // quantity x rate = amount holds (by header or by the numbers themselves): a priced list
  if (kind.code === "boq" && !has("quantity") && !has("amount") && !has("rate")) score *= 0.6;
  else if (kind.code === "boq" && !has("rate") && !has("amount")) score *= 0.85; // quantities without any price are as likely a materials list
  // columns only a materials / deliveries register has
  if (kind.code === "materials") score += Math.min(0.2, 0.08 * ["supplier", "date", "category", "referenceSpecification"].filter(key => has(key)).length);
  if (kind.code === "valuation" && !(has("previousQuantity") || has("currentQuantity") || has("cumulativeQuantity") || has("retention") || has("advance"))) score *= 0.5;
  if (kind.code === "dailyReport" && !(has("labour") || has("weather") || has("work") || has("equipment"))) score *= 0.5;
  if (kind.code === "budget" && !(has("originalAmount"))) score *= 0.6;
  return { score: Math.round(Math.min(score, 1) * 100) / 100, matches };
}

function convert(type: FieldType, cell: Cell, order: DateOrder): { value: string | number | null; display: string; hijri: boolean; bad: boolean } {
  const raw = textOf(cell);
  if (!raw) return { value: null, display: "", hijri: false, bad: false };
  if (type === "number" || type === "percent") {
    const parsed = parseNumber(cell instanceof Date ? null : cell);
    return parsed ? { value: parsed.value, display: String(parsed.value), hijri: false, bad: false } : { value: null, display: raw, hijri: false, bad: true };
  }
  if (type === "date") {
    const parsed = parseDate(cell, order);
    return parsed ? { value: parsed.iso, display: parsed.approximate ? `${parsed.iso} (≈ هجري)` : parsed.iso, hijri: parsed.approximate, bad: false } : { value: null, display: raw, hijri: false, bad: true };
  }
  if (type === "unit") { const unit = normalizeUnit(cell); return { value: unit.code ?? raw, display: unit.code ?? raw, hijri: false, bad: false }; }
  return { value: raw, display: raw, hijri: false, bad: false };
}

export type UnderstandOptions = {
  fileName: string;
  kind?: KindCode; sheet?: string;
  /** column index -> field key (null = ignore this column): a saved profile, or the person's corrections */
  forced?: Record<number, string | null>;
  extraSynonyms?: Partial<Record<Concept, string[]>>;
  sampleSize?: number;
};

export async function understand(bytes: Uint8Array, options: UnderstandOptions): Promise<Understanding> {
  const format = detectFormat(bytes, options.fileName);
  const empty: Understanding = { format, encoding: null, kind: null, kindConfidence: 0, ambiguous: false, candidates: [], sheetNames: [], sheet: null, table: null, columns: [], fields: [], autoMatchedShare: 0, sample: [], flagged: [], hijriDates: 0, warnings: [] };
  if (format === "pdf" || format === "image") return { ...empty, kind: "needsSmartReading", kindConfidence: 1 };
  if (format === "xer") return { ...empty, kind: "xer", kindConfidence: 0.99 };
  if (format === "unknown") return { ...empty, warnings: ["UNREADABLE_FORMAT"] };

  const grid = await readGrid(bytes, format);
  if (!grid.ok) return { ...empty, warnings: [grid.code] };
  const tables = grid.sheets.map(sheet => ({ sheet, table: tabulate(sheet) })).filter((item): item is { sheet: SheetGrid; table: Table } => item.table !== null && item.table.dataRows.length > 0);
  const result: Understanding = { ...empty, encoding: grid.encoding, sheetNames: grid.sheets.map(sheet => sheet.name) };
  if (!tables.length) return { ...result, warnings: ["NO_TABLE_FOUND"] };

  const candidates = tables.flatMap(({ table }) => KIND_CODES.map(code => ({ sheet: table.sheet, kind: code, score: scoreKind(table, KINDS[code]).score, rows: table.dataRows.length }))).sort((a, b) => b.score - a.score);
  const chosenSheet = options.sheet ?? (options.kind ? candidates.filter(candidate => candidate.kind === options.kind)[0]?.sheet : candidates[0]?.sheet) ?? tables[0].table.sheet;
  const pick = tables.find(item => item.table.sheet === chosenSheet) ?? tables[0];
  const kind = options.kind ?? candidates.find(candidate => candidate.sheet === pick.table.sheet)?.kind ?? candidates[0].kind;
  const definition = KINDS[kind as Exclude<KindCode, "xer">];
  const top = candidates.filter(candidate => candidate.sheet === pick.table.sheet);
  const kindScore = top.find(candidate => candidate.kind === kind)?.score ?? 0;
  const runnerUp = top.filter(candidate => candidate.kind !== kind)[0]?.score ?? 0;

  const columns = mapColumns(pick.table, definition, { forced: options.forced, extraSynonyms: options.extraSynonyms });
  const table = pick.table;
  // the order of numeric dates is decided per column from all its values
  const orders = new Map<number, DateOrder>();
  columns.forEach(column => { const field = definition.fields.find(item => item.key === column.fieldKey); if (field?.type === "date") orders.set(column.index, inferDateOrder(table.dataRows.map(row => row.cells[column.index]))); });

  const flagged: FlaggedRow[] = []; const normalizedRows: NormalizedRow[] = []; let hijriDates = 0;
  const seenCodes = new Map<string, number>();
  const codeField = definition.fields.find(field => field.key === "code" || field.key === "activityCode" || field.key === "costCode");
  for (const row of table.dataRows) {
    const values: NormalizedRow["values"] = {}; const display: NormalizedRow["display"] = {}; const reasons: string[] = [];
    for (const column of columns) {
      if (!column.fieldKey) continue;
      const field = definition.fields.find(item => item.key === column.fieldKey);
      if (!field) continue;
      const out = convert(field.type, row.cells[column.index], orders.get(column.index) ?? "dmy");
      values[field.key] = out.value; display[field.key] = out.display;
      if (out.hijri) hijriDates += 1;
      if (out.bad) reasons.push(`NOT_${field.type === "date" ? "A_DATE" : "A_NUMBER"}:${field.key}`);
    }
    for (const field of definition.fields) if (field.required && (values[field.key] === null || values[field.key] === undefined)) reasons.push(`MISSING:${field.key}`);
    if (codeField && typeof values[codeField.key] === "string") {
      const code = values[codeField.key] as string; const seen = seenCodes.get(code);
      if (seen !== undefined) reasons.push(`DUPLICATE_CODE:${code}`); else seenCodes.set(code, row.rowNumber);
    }
    const q = values.quantity; const r = values.rate; const a = values.amount;
    if (typeof q === "number" && typeof r === "number" && typeof a === "number" && Math.abs(q * r - a) > Math.max(1, Math.abs(a) * 0.02)) reasons.push("AMOUNT_MISMATCH");
    if (typeof values.plannedStartAt === "string" && typeof values.plannedFinishAt === "string" && values.plannedFinishAt < values.plannedStartAt) reasons.push("FINISH_BEFORE_START");
    if (reasons.length) flagged.push({ rowNumber: row.rowNumber, reasons });
    normalizedRows.push({ rowNumber: row.rowNumber, values, display });
  }
  const mappedColumns = columns.filter(column => column.fieldKey !== null);
  const skipped = { blank: 0, section: 0, total: 0, repeatedHeader: 0 };
  for (const item of table.skipped) skipped[item.reason] += 1;
  const warnings: string[] = [];
  if (kindScore - runnerUp < 0.08 && !options.kind) warnings.push("KIND_AMBIGUOUS");
  if (!definition.module) warnings.push("NO_IMPORTER_FOR_KIND");
  return {
    ...result, kind, kindConfidence: kindScore, ambiguous: kindScore - runnerUp < 0.08 && !options.kind,
    candidates: candidates.slice(0, 8), sheet: table.sheet,
    table: { headerRow: table.headerRow, rows: table.dataRows.length, skipped, mergedFilled: table.mergedFilled, titleLines: table.titleLines },
    columns, fields: definition.fields.map(({ key, required, type, label }) => ({ key, required, type, label })),
    autoMatchedShare: mappedColumns.length ? columns.filter(isAuto).length / mappedColumns.length : 0,
    sample: normalizedRows.slice(0, options.sampleSize ?? 8), flagged, hijriDates, warnings,
  };
}

export { AUTO_THRESHOLD };
