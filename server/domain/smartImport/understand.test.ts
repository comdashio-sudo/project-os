import { beforeAll, describe, expect, it } from "vitest";
import { buildHoldoutSamples, buildSamples, type Sample } from "./fixtures";
import { understand } from "./understand";

// The target set by the owner: 90% of the columns of the synthetic samples are matched automatically (confidence >= the auto threshold) AND correctly. Printed per sample.
let samples: Sample[] = []; let holdout: Sample[] = [];
beforeAll(async () => { samples = await buildSamples(); holdout = await buildHoldoutSamples(); }, 60_000);

async function measure(group: Sample[], label: string) {
  const report: string[] = []; let matched = 0; let total = 0; const failures: string[] = [];
  for (const sample of group) {
    const result = await understand(sample.bytes, { fileName: sample.fileName });
    if (sample.expectedKind === null) { expect(result.kind, sample.id).toBe("xer"); report.push(`${sample.id}: kind xer (read natively)`); continue; }
    if (result.kind !== sample.expectedKind) failures.push(`${sample.id}: kind ${result.kind}, expected ${sample.expectedKind}`);
    if (result.sheet !== sample.expectedSheet) failures.push(`${sample.id}: sheet ${result.sheet}, expected ${sample.expectedSheet}`);
    if (result.table?.rows !== sample.expectedRows) failures.push(`${sample.id}: ${result.table?.rows} rows, expected ${sample.expectedRows}`);
    const expectedColumns = Object.entries(sample.expected);
    const right = expectedColumns.filter(([index, field]) => { const column = result.columns[Number(index)]; return column?.fieldKey === field && column.confidence >= 0.55; });
    for (const [index, field] of expectedColumns) { const column = result.columns[Number(index)]; if (!(column?.fieldKey === field && column.confidence >= 0.55)) failures.push(`${sample.id}: column ${index} is ${column?.fieldKey ?? "none"} (${column?.confidence ?? 0}), expected ${field}`); }
    matched += right.length; total += expectedColumns.length;
    report.push(`${sample.id}: ${right.length}/${expectedColumns.length} columns (${Math.round((right.length / expectedColumns.length) * 100)}%), kind ${result.kind} (${result.kindConfidence}), ${result.table?.rows} rows`);
  }
  console.log(`${label}\n${report.join("\n")}\nOVERALL ${matched}/${total} = ${Math.round((matched / total) * 1000) / 10}%`);
  return { matched, total, failures };
}

describe("the HOLD-OUT samples (wording the dictionary was not shaped by)", () => {
  it("reaches the 90% target on unseen spellings too", async () => {
    const { matched, total, failures } = await measure(holdout, "HOLD-OUT REPORT");
    expect(failures).toEqual([]);
    expect(matched / total).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});

describe("the reader understands files that are not our templates", () => {
  it("finds the kind, the sheet, the header row, the right rows, and matches the columns — per sample", async () => {
    const report: string[] = []; let matched = 0; let total = 0; const failures: string[] = [];
    for (const sample of samples) {
      const result = await understand(sample.bytes, { fileName: sample.fileName });
      if (sample.expectedKind === null) { expect(result.kind, sample.id).toBe("xer"); report.push(`${sample.id}: kind xer (read natively)`); continue; }
      if (result.kind !== sample.expectedKind) failures.push(`${sample.id}: kind ${result.kind}, expected ${sample.expectedKind}`);
      if (result.sheet !== sample.expectedSheet) failures.push(`${sample.id}: sheet ${result.sheet}, expected ${sample.expectedSheet}`);
      if (result.table?.rows !== sample.expectedRows) failures.push(`${sample.id}: ${result.table?.rows} rows, expected ${sample.expectedRows}`);
      if (sample.minMergedFilled !== undefined && (result.table?.mergedFilled ?? 0) < sample.minMergedFilled) failures.push(`${sample.id}: filled ${result.table?.mergedFilled} merged cells, expected at least ${sample.minMergedFilled}`);
      const expectedColumns = Object.entries(sample.expected);
      const right = expectedColumns.filter(([index, field]) => { const column = result.columns[Number(index)]; return column?.fieldKey === field && column.confidence >= 0.55; });
      for (const [index, field] of expectedColumns) { const column = result.columns[Number(index)]; if (!(column?.fieldKey === field && column.confidence >= 0.55)) failures.push(`${sample.id}: column ${index} is ${column?.fieldKey ?? "none"} (${column?.confidence ?? 0}), expected ${field}`); }
      matched += right.length; total += expectedColumns.length;
      report.push(`${sample.id}: ${right.length}/${expectedColumns.length} columns (${Math.round((right.length / expectedColumns.length) * 100)}%), kind ${result.kind} (${result.kindConfidence}), ${result.table?.rows} rows`);
    }
    console.log(`MATCH REPORT\n${report.join("\n")}\nOVERALL ${matched}/${total} = ${Math.round((matched / total) * 1000) / 10}%`);
    expect(failures).toEqual([]);
    expect(matched / total).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});
