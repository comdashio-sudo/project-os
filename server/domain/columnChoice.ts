// Q-31 (P0-02): which column of a file each field is read from — found by the field's accepted header words, or chosen by a person.
// Shared by the baseline readers (BOQ, planned cash flow, planned labour), whose files travel inside the request: the preview and the save both carry the same
// choice, so the save reads the file exactly as the preview the person saw.
//   - `choice` maps a field key to the header as the file writes it; "" means «no column» (a required field then reads as missing).
//   - A field the file kind does not have, a header the file does not have, or one header for two fields is refused WHOLE (`invalid`): never half applied.
//   - The report lists the file's headers and, per field, the column it is read from, so a screen can offer the choice.
export type ColumnField = { key: string; required: boolean; aliases: readonly string[] };
export type ColumnReport = { headers: string[]; fields: Array<{ key: string; required: boolean; header: string | null }>; overridden: boolean };
export type ColumnResolution = { columns: Record<string, string | undefined>; report: ColumnReport; invalid?: string };

/** The key a person sends to say «I saw every column; the ones no field takes are ignored». Accepted for symmetry with the job importers; these readers ignore extra columns anyway. */
export const IGNORE_OTHER_COLUMNS = "__others__";
const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Q-50 (importEngine/read.ts): how well a candidate header row names these fields, scored exactly as resolveColumns matches them — how many fields it
 * names, and whether every required one is named. The shared reader uses it to find the header row under a title and the table's sheet among others.
 */
export function headerEvaluator(fields: readonly ColumnField[]) {
  return ({ baseHeaders }: { baseHeaders: string[] }) => {
    const names = new Set(baseHeaders.filter(Boolean).map(normalize));
    const named = fields.filter(field => field.aliases.some(alias => names.has(alias)));
    return { found: named.length, complete: fields.every(field => !field.required || named.includes(field)) };
  };
}

export function resolveColumns(fields: readonly ColumnField[], fileHeaders: string[], choice?: Record<string, string>): ColumnResolution {
  const headers = fileHeaders.filter(Boolean);
  const columns: Record<string, string | undefined> = {};
  for (const field of fields) columns[field.key] = headers.find(header => field.aliases.includes(normalize(header)));
  const chosen = choice ? Object.entries(choice).filter(([key]) => key !== IGNORE_OTHER_COLUMNS) : [];
  const report = (): ColumnReport => ({ headers, fields: fields.map(field => ({ key: field.key, required: field.required, header: columns[field.key] ?? null })), overridden: chosen.length > 0 });
  if (!chosen.length) return { columns, report: report() };
  const keys = new Set(fields.map(field => field.key));
  const used = new Set<string>();
  for (const [key, header] of chosen) {
    if (!keys.has(key)) return { columns, report: report(), invalid: key };
    if (header === "") continue;
    if (!headers.includes(header) || used.has(header)) return { columns, report: report(), invalid: header };
    used.add(header);
  }
  // a column the person gave to one field is no longer read for another the aliases had matched it to
  for (const field of fields) if (columns[field.key] && used.has(columns[field.key]!)) columns[field.key] = undefined;
  for (const [key, header] of chosen) columns[key] = header === "" ? undefined : header;
  return { columns, report: report() };
}
