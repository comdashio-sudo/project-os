/**
 * Q-50 batch 3b (docs/proposals/universal-import.md §3 layer 2: "below the confidence threshold it is shown for confirmation and never applied silently").
 * For each field of a column report: where its column came from — `name` (the header is one of the field's accepted names: sure), `chosen` (the person
 * picked it), or null (not found) — and, only when not found, the closest header no other field takes, with how close it is (0–1). A suggestion is never
 * applied by the reader: the person sees it next to the field and takes it or not, exactly as when they pick a column by hand.
 */
export type FieldSource = "name" | "chosen" | null;
export type ColumnSuggestion = { header: string; confidence: number };
export type FieldHint = { source: FieldSource; suggestion: ColumnSuggestion | null };

/** A suggestion below this closeness is not offered at all. */
export const SUGGEST_AT = 0.5;

const normalize = (value: string) => value.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_\-./()]+/g, " ").trim();
const tokens = (value: string) => new Set(normalize(value).split(" ").filter(Boolean));

/**
 * How close a header is to one accepted name: 1 the same words, 0.8 every word of the shorter is a word of the longer ("unit no" inside "villa unit no"),
 * else the share of words in common. Words, never letters (review of #458): «ID» is not inside «width», nor «A» inside «area». A header of one letter is
 * close to nothing.
 */
export function closeness(header: string, alias: string): number {
  const a = normalize(header); const b = normalize(alias);
  if (a.length < 2 || b.length < 2) return 0;
  if (a === b) return 1;
  const x = tokens(a); const y = tokens(b);
  const [shorter, longer] = x.size <= y.size ? [x, y] : [y, x];
  if (Array.from(shorter).every(word => longer.has(word))) return 0.8;
  const shared = Array.from(x).filter(word => y.has(word)).length;
  return shared / Math.max(x.size, y.size);
}

const scoreOf = (field: { aliases: readonly string[] }, header: string) => Math.max(0, ...field.aliases.map(alias => closeness(header, alias)));

export function columnHints(
  fields: ReadonlyArray<{ key: string; aliases: readonly string[] }>,
  headers: readonly string[],
  resolved: Readonly<Record<string, string | null | undefined>>,
  chosenKeys: ReadonlySet<string>,
): Record<string, FieldHint> {
  const taken = new Set(Object.values(resolved).filter((header): header is string => Boolean(header)));
  const out: Record<string, FieldHint> = {};
  for (const field of fields) {
    const header = resolved[field.key];
    if (header) { out[field.key] = { source: chosenKeys.has(field.key) ? "chosen" : "name", suggestion: null }; continue; }
    let best: ColumnSuggestion | null = null;
    for (const candidate of headers) {
      if (!candidate || taken.has(candidate)) continue;
      const score = scoreOf(field, candidate);
      // a header at least as close to ANOTHER field's names is that field's, not this one's: «UOM code» is the unit of measure, not the item code
      const elsewhere = Math.max(0, ...fields.filter(other => other.key !== field.key).map(other => scoreOf(other, candidate)));
      if (score >= SUGGEST_AT && score > elsewhere && (!best || score > best.confidence)) best = { header: candidate, confidence: Math.round(score * 100) / 100 };
    }
    out[field.key] = { source: null, suggestion: best };
  }
  return out;
}
