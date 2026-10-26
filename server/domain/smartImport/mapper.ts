import { scoreHeader, type Concept } from "./dictionary";
import { parseNumber } from "./numbers";
import { profileColumn, type ColumnProfile, type Table } from "./table";
import type { FieldType, KindDefinition } from "./kinds";

// Which column is which field: the header against the synonym dictionary (exact, phrase, near spelling), checked against what the column CONTAINS (a "quantity" column full of text is not
// a quantity), plus content-only clues for columns with no usable header (units, descriptions, and the quantity x rate = amount triple). Every column gets a confidence 0..1.
export const AUTO_THRESHOLD = 0.55;
export type ColumnMatch = { index: number; header: string; fieldKey: string | null; confidence: number; basis: "header" | "content" | "profile" | "none"; alternatives: Array<{ fieldKey: string; confidence: number }> };

export function typeFit(type: FieldType, p: ColumnProfile): number {
  switch (type) {
    case "number": return p.numeric >= 0.7 ? 1 : p.numeric >= 0.4 ? 0.8 : 0.4;
    case "percent": return p.numeric >= 0.7 ? 1 : 0.5;
    case "date": return p.date >= 0.6 || p.serialLike >= 0.6 ? 1 : 0.5;
    case "unit": return p.unit >= 0.5 ? 1 : 0.7;
    case "status": return p.distinct <= 0.4 ? 1 : 0.8;
    case "text": return p.numeric > 0.85 && p.avgLength < 8 ? 0.55 : 1;
  }
}

type Pair = { column: number; fieldKey: string; confidence: number; basis: ColumnMatch["basis"] };

export function mapColumns(table: Table, kind: KindDefinition, options: { extraSynonyms?: Partial<Record<Concept, string[]>>; forced?: Record<number, string | null> } = {}): ColumnMatch[] {
  const profiles = table.headers.map((_header, column) => profileColumn(table.dataRows.map(row => row.cells[column] ?? null)));
  const pairs: Pair[] = [];
  table.headers.forEach((header, column) => {
    for (const field of kind.fields) {
      const base = scoreHeader(header, field.concept, options.extraSynonyms?.[field.concept] ?? []);
      if (base <= 0) continue;
      const confidence = Math.min(0.99, base * typeFit(field.type, profiles[column]));
      if (confidence >= 0.3) pairs.push({ column, fieldKey: field.key, confidence, basis: "header" });
    }
  });

  // content-only clues for what the headers did not settle
  const headerFields = new Set(pairs.filter(pair => pair.confidence >= AUTO_THRESHOLD).map(pair => pair.fieldKey));
  const headerColumns = new Set(pairs.filter(pair => pair.confidence >= AUTO_THRESHOLD).map(pair => pair.column));
  const hasField = (key: string) => kind.fields.some(field => field.key === key);
  const free = (column: number) => !headerColumns.has(column);
  // units: a column made of unit words
  if (hasField(kind.fields.find(field => field.type === "unit")?.key ?? "") ) {
    const unitField = kind.fields.find(field => field.type === "unit")!;
    if (!headerFields.has(unitField.key)) profiles.forEach((p, column) => { if (free(column) && p.unit >= 0.6) pairs.push({ column, fieldKey: unitField.key, confidence: 0.7, basis: "content" }); });
  }
  // the pricing triple: three numeric columns where a x b = c on most rows are quantity, rate and amount
  if (hasField("quantity") && hasField("rate") && hasField("amount") && !(headerFields.has("quantity") && headerFields.has("rate") && headerFields.has("amount"))) {
    const numeric = profiles.map((p, column) => ({ p, column })).filter(item => item.p.numeric >= 0.8 && item.p.date < 0.2);
    for (const a of numeric) for (const b of numeric) for (const c of numeric) {
      if (a.column >= b.column || c.column === a.column || c.column === b.column) continue;
      const rows = table.dataRows.map(row => [parseNumber(row.cells[a.column]), parseNumber(row.cells[b.column]), parseNumber(row.cells[c.column])]).filter(([x, y, z]) => x && y && z);
      if (rows.length < 3) continue;
      const hits = rows.filter(([x, y, z]) => Math.abs(x!.value * y!.value - z!.value) <= Math.max(0.01, Math.abs(z!.value) * 0.01)).length;
      if (hits / rows.length >= 0.7) {
        const [quantity, rate] = a.column < b.column ? [a, b] : [b, a];
        for (const [item, key] of [[quantity, "quantity"], [rate, "rate"], [c, "amount"]] as const) if (free(item.column) || !headerFields.has(key)) pairs.push({ column: item.column, fieldKey: key, confidence: 0.8, basis: "content" });
      }
    }
  }
  // the longest text column is the description when no header said so
  const descriptionField = kind.fields.find(field => field.concept === "description");
  if (descriptionField && !headerFields.has(descriptionField.key)) {
    const textual = profiles.map((p, column) => ({ p, column })).filter(item => free(item.column) && item.p.numeric < 0.3 && item.p.avgLength >= 12).sort((x, y) => y.p.avgLength - x.p.avgLength)[0];
    if (textual) pairs.push({ column: textual.column, fieldKey: descriptionField.key, confidence: 0.6, basis: "content" });
  }
  // a column of short, mostly distinct codes, first from the left, is the code when no header said so
  const codeField = kind.fields.find(field => field.concept === "itemCode" || field.concept === "activityId" || field.concept === "costCode" || field.concept === "contractCode");
  if (codeField && !headerFields.has(codeField.key)) {
    const codes = profiles.map((p, column) => ({ p, column })).filter(item => free(item.column) && item.p.short >= 0.9 && item.p.distinct >= 0.9 && item.p.avgLength <= 14 && item.p.avgLength >= 1).sort((x, y) => x.column - y.column)[0];
    if (codes) pairs.push({ column: codes.column, fieldKey: codeField.key, confidence: 0.55, basis: "content" });
  }
  // two date columns with no header help: the left one starts, the right one finishes
  const dateFields = kind.fields.filter(field => field.type === "date");
  if (dateFields.length === 2 && !headerFields.has(dateFields[0].key) && !headerFields.has(dateFields[1].key)) {
    const dated = profiles.map((p, column) => ({ p, column })).filter(item => free(item.column) && (item.p.date >= 0.7 || item.p.serialLike >= 0.7)).sort((x, y) => x.column - y.column);
    if (dated.length >= 2) { pairs.push({ column: dated[0].column, fieldKey: dateFields[0].key, confidence: 0.6, basis: "content" }, { column: dated[1].column, fieldKey: dateFields[1].key, confidence: 0.6, basis: "content" }); }
  }

  // forced assignments (a saved profile or the person's own correction) win outright
  const result: ColumnMatch[] = table.headers.map((header, index) => ({ index, header, fieldKey: null, confidence: 0, basis: "none", alternatives: [] }));
  const usedColumns = new Set<number>(); const usedFields = new Set<string>();
  for (const [column, fieldKey] of Object.entries(options.forced ?? {})) {
    const index = Number(column);
    if (!result[index]) continue;
    usedColumns.add(index);
    if (fieldKey) { usedFields.add(fieldKey); result[index] = { ...result[index], fieldKey, confidence: 1, basis: "profile" }; }
  }
  for (const pair of pairs.sort((x, y) => y.confidence - x.confidence)) {
    if (usedColumns.has(pair.column) || usedFields.has(pair.fieldKey)) continue;
    usedColumns.add(pair.column); usedFields.add(pair.fieldKey);
    result[pair.column] = { ...result[pair.column], fieldKey: pair.fieldKey, confidence: Math.round(pair.confidence * 100) / 100, basis: pair.basis };
  }
  for (const column of result) {
    column.alternatives = pairs.filter(pair => pair.column === column.index && pair.fieldKey !== column.fieldKey).sort((x, y) => y.confidence - x.confidence).slice(0, 3).map(pair => ({ fieldKey: pair.fieldKey, confidence: Math.round(pair.confidence * 100) / 100 }));
  }
  return result;
}

export const isAuto = (match: ColumnMatch) => match.fieldKey !== null && match.confidence >= AUTO_THRESHOLD;
