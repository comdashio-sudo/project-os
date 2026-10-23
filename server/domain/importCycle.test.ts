import { describe, expect, it } from "vitest";
import { diffHash, diffImportRows, summariseDiff, type FileRow, type StoredRow } from "./importCycle";

const stored = (rows: Array<[string, string, Record<string, unknown>]>): Map<string, StoredRow> => new Map(rows.map(([key, version, values], index) => [key, { id: `id-${index}`, version, values }]));
const V = "2026-10-01T08:00:00.000Z";

describe("export → re-import diff (pure)", () => {
  const wbs = stored([["1.1", V, { code: "1.1", name: "Site setup", plannedValue: "1000.00" }], ["1.2", V, { code: "1.2", name: "Excavation", plannedValue: "2500.50" }]]);
  const sameFile = (): FileRow[] => [
    { rowNumber: 2, values: { code: "1.1", name: "Site setup", plannedValue: 1000 }, fileId: "id-0", fileVersion: V },
    { rowNumber: 3, values: { code: "1.2", name: "Excavation", plannedValue: 2500.5 }, fileId: "id-1", fileVersion: V },
  ];

  it("an untouched export re-imports with zero changes", () => {
    const diff = diffImportRows("wbs", sameFile(), wbs);
    expect(summariseDiff(diff)).toEqual({ new: 0, modified: 0, unchanged: 2, conflict: 0, missing: 0, total: 2 });
  });

  it("editing one cell gives exactly one change, with the old and the new value", () => {
    const rows = sameFile(); rows[1]!.values.plannedValue = 2600;
    const diff = diffImportRows("wbs", rows, wbs);
    expect(summariseDiff(diff)).toMatchObject({ new: 0, modified: 1, unchanged: 1, conflict: 0 });
    expect(diff.entries.find(entry => entry.kind === "modified")).toMatchObject({ key: "1.2", changes: [{ field: "plannedValue", oldValue: "2500.50", newValue: "2600.00" }] });
  });

  it("a new key is new, and a stored key the file no longer lists is reported missing (never deleted)", () => {
    const rows = sameFile().slice(0, 1); rows.push({ rowNumber: 3, values: { code: "2.1", name: "Piling", plannedValue: 10 } });
    const diff = diffImportRows("wbs", rows, wbs);
    expect(summariseDiff(diff)).toMatchObject({ new: 1, unchanged: 1, missing: 1 });
    expect(diff.missing).toEqual([{ key: "1.2" }]);
  });

  it("money compares at the stored two decimals and text is trimmed, so formatting noise is not a change", () => {
    const rows = sameFile(); rows[0]!.values.plannedValue = "1000.004"; rows[0]!.values.name = "  Site setup ";
    expect(summariseDiff(diffImportRows("wbs", rows, wbs)).unchanged).toBe(2);
  });

  it("a row exported at an older version conflicts instead of overwriting newer work", () => {
    const rows = sameFile(); rows[0]!.fileVersion = "2026-09-01T00:00:00.000Z"; rows[0]!.values.name = "Edited in Excel";
    const diff = diffImportRows("wbs", rows, wbs);
    expect(diff.entries[0]).toMatchObject({ kind: "conflict", conflict: "VERSION_CHANGED", changes: [] });
    expect(summariseDiff(diff).conflict).toBe(1);
  });

  it("a row whose key was edited keeps its id and is refused as a re-key, not created as a duplicate", () => {
    const rows = sameFile(); rows[0]!.values.code = "1.1-renamed";
    expect(diffImportRows("wbs", rows, wbs).entries[0]).toMatchObject({ kind: "conflict", conflict: "ID_KEY_MISMATCH" });
  });

  it("a file without the reserved columns (a hand-written one) still diffs by key", () => {
    const rows: FileRow[] = [{ rowNumber: 2, values: { code: "1.1", name: "Renamed", plannedValue: 1000 } }];
    expect(diffImportRows("wbs", rows, wbs).entries[0]).toMatchObject({ kind: "modified", changes: [{ field: "name", oldValue: "Site setup", newValue: "Renamed" }] });
  });

  it("the hash is stable for the same diff and changes when any approved value changes", () => {
    const a = diffImportRows("wbs", sameFile(), wbs);
    const edited = sameFile(); edited[0]!.values.name = "X";
    expect(diffHash(a)).toBe(diffHash(diffImportRows("wbs", sameFile(), wbs)));
    expect(diffHash(diffImportRows("wbs", edited, wbs))).not.toBe(diffHash(a));
  });

  it("covers the other cycle modules' fields", () => {
    const contracts = stored([["C-1", V, { code: "C-1", title: "T", counterparty: "P", contractValue: "500.00", currency: "SAR" }]]);
    const diff = diffImportRows("contracts", [{ rowNumber: 2, values: { code: "C-1", title: "T", counterparty: "P", contractValue: 500, currency: "USD" } }], contracts);
    expect(diff.entries[0]!.changes).toEqual([{ field: "currency", oldValue: "SAR", newValue: "USD" }]);
    const materials = stored([["M-1", V, { code: "M-1", description: "d", unitOfMeasure: "m3", category: "c", referenceSpecification: null }]]);
    expect(summariseDiff(diffImportRows("materials", [{ rowNumber: 2, values: { code: "M-1", description: "d", unitOfMeasure: "m3", category: "c" } }], materials)).unchanged).toBe(1);
  });
});
