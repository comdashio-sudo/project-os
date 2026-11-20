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

/** How close a header is to one accepted name: 1 the same words, 0.8 one inside the other ("unit no." vs "unit no"), else the share of words in common. */
export function closeness(header: string, alias: string): number {
  const a = normalize(header); const b = normalize(alias);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const x = tokens(a); const y = tokens(b);
  const shared = Array.from(x).filter(word => y.has(word)).length;
  return shared / Math.max(x.size, y.size);
}

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
      const score = Math.max(0, ...field.aliases.map(alias => closeness(candidate, alias)));
      if (score >= SUGGEST_AT && (!best || score > best.confidence)) best = { header: candidate, confidence: Math.round(score * 100) / 100 };
    }
    out[field.key] = { source: null, suggestion: best };
  }
  return out;
}
