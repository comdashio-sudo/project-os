// Export → edit → re-import: the pure part. Given the rows a file asks to save and the rows already stored, say what each row would do
// (new / modified with old → new per field / unchanged / conflict) and which stored rows the file no longer mentions.
// Nothing here reads a database or a file, so every rule below is tested without either.
import { createHash } from "node:crypto";

export const EXPORT_ID_HEADER = "__id";
export const EXPORT_VERSION_HEADER = "__version";
export const RESERVED_EXPORT_HEADERS: readonly string[] = [EXPORT_ID_HEADER, EXPORT_VERSION_HEADER];

export type CycleModuleCode = "wbs" | "budget" | "contracts" | "materials";
export const CYCLE_MODULES: readonly CycleModuleCode[] = ["wbs", "budget", "contracts", "materials"];

type FieldKind = "text" | "money";
/** The business key plus the fields an import is allowed to change; the key itself is never "modified" (a new key is a new row). */
export const cycleFields: Record<CycleModuleCode, { key: string; fields: Array<{ name: string; kind: FieldKind }> }> = {
  wbs: { key: "code", fields: [{ name: "name", kind: "text" }, { name: "plannedValue", kind: "money" }] },
  budget: { key: "costCode", fields: [{ name: "originalAmount", kind: "money" }, { name: "currentAmount", kind: "money" }] },
  contracts: { key: "code", fields: [{ name: "title", kind: "text" }, { name: "counterparty", kind: "text" }, { name: "contractValue", kind: "money" }, { name: "currency", kind: "text" }] },
  materials: { key: "code", fields: [{ name: "description", kind: "text" }, { name: "unitOfMeasure", kind: "text" }, { name: "category", kind: "text" }, { name: "referenceSpecification", kind: "text" }] },
};

export type StoredRow = { id: string; version: string; values: Record<string, unknown> };
export type FileRow = { rowNumber: number; values: Record<string, unknown>; fileId?: string; fileVersion?: string };

export type FieldChange = { field: string; oldValue: string; newValue: string };
export type DiffKind = "new" | "modified" | "unchanged" | "conflict";
export type ConflictReason = "VERSION_CHANGED" | "ID_KEY_MISMATCH";
export type DiffEntry = { rowNumber: number; key: string; kind: DiffKind; changes: FieldChange[]; conflict?: ConflictReason };
export type MissingRow = { key: string };

const cleanText = (value: unknown) => String(value ?? "").trim();
// Money is stored with two decimals, so 1000, "1000.00" and 1000.004 are the same amount.
const cleanMoney = (value: unknown) => (Math.round(Number(value ?? 0) * 100) / 100).toFixed(2);
const normalise = (kind: FieldKind, value: unknown) => (kind === "money" ? cleanMoney(value) : cleanText(value));

export function diffImportRows(moduleCode: CycleModuleCode, fileRows: readonly FileRow[], stored: ReadonlyMap<string, StoredRow>): { entries: DiffEntry[]; missing: MissingRow[] } {
  const definition = cycleFields[moduleCode];
  const seen = new Set<string>();
  const entries = fileRows.map((row): DiffEntry => {
    const key = cleanText(row.values[definition.key]);
    seen.add(key);
    const current = stored.get(key);
    if (!current) {
      // A row that names an id but whose key matches nothing was re-keyed in the file; an import never renames, so it is refused rather than created as a duplicate of the original.
      if (row.fileId) return { rowNumber: row.rowNumber, key, kind: "conflict", changes: [], conflict: "ID_KEY_MISMATCH" };
      return { rowNumber: row.rowNumber, key, kind: "new", changes: definition.fields.map(field => ({ field: field.name, oldValue: "", newValue: normalise(field.kind, row.values[field.name]) })) };
    }
    if (row.fileId && row.fileId !== current.id) return { rowNumber: row.rowNumber, key, kind: "conflict", changes: [], conflict: "ID_KEY_MISMATCH" };
    // The file carries the version the row had when it was exported; if the platform moved on since, the file would silently overwrite newer work.
    if (row.fileVersion && row.fileVersion !== current.version) return { rowNumber: row.rowNumber, key, kind: "conflict", changes: [], conflict: "VERSION_CHANGED" };
    const changes = definition.fields.flatMap((field): FieldChange[] => {
      const before = normalise(field.kind, current.values[field.name]);
      const after = normalise(field.kind, row.values[field.name]);
      return before === after ? [] : [{ field: field.name, oldValue: before, newValue: after }];
    });
    return { rowNumber: row.rowNumber, key, kind: changes.length ? "modified" : "unchanged", changes };
  });
  const missing = Array.from(stored.keys()).filter(key => !seen.has(key)).map(key => ({ key }));
  return { entries, missing };
}

export function summariseDiff(diff: { entries: readonly DiffEntry[]; missing: readonly MissingRow[] }) {
  const count = (kind: DiffKind) => diff.entries.filter(entry => entry.kind === kind).length;
  return { new: count("new"), modified: count("modified"), unchanged: count("unchanged"), conflict: count("conflict"), missing: diff.missing.length, total: diff.entries.length };
}

/** What the user approves is exactly this: the same file against the same stored rows gives the same hash, and any change to either changes it. */
export function diffHash(diff: { entries: readonly DiffEntry[]; missing: readonly MissingRow[] }) {
  const hash = createHash("sha256");
  for (const entry of diff.entries) if (entry.kind !== "unchanged") hash.update(JSON.stringify([entry.key, entry.kind, entry.conflict ?? "", entry.changes.map(change => [change.field, change.oldValue, change.newValue])]));
  return hash.digest("hex");
}

export const DIFF_PAGE_SIZE = 200;
