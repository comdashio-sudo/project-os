// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExportLayout } from "@/lib/excelExport";
import { operationsColumns } from "./Operations";

// Q-57: the operations page exports one line per project — an unknown figure is an empty cell (never a 0), and a reader the server gave no money gets no cost cells.
const TEXT = new Proxy({}, { get: (_target, key) => String(key) }) as never;
const base = {
  projectId: "p1", code: "PRJ-1", name: "Villas (synthetic)", status: "active", currency: "SAR", overdueActivities: 2, stalledUnits: null, openNcrs: 3, highRisks: 1, materialsBelowReorder: 0,
  safety: { openIncidents: 1, lostTimeLast30Days: 0 }, waiting: { decisions: 2, escalations: 0 },
};
const rows = [
  { ...base, progress: { actual: 40, planned: 50, deviation: -10, reason: null }, cost: { costVariance: -1200.5, cpi: 0.91 } },
  { ...base, projectId: "p2", code: "PRJ-2", progress: { actual: null, planned: null, deviation: null, reason: "NO_UNITS" }, cost: { value: null, reason: "MONEY_HIDDEN" } },
] as never[];
const meta = { title: "Operations", exportedAt: new Date("2026-11-25T12:00:00Z"), locale: "en" as const };

describe("operationsColumns (Q-57)", () => {
  it("lays out the money reader's row with the figures as numbers and the percentages as fractions", () => {
    const layout = buildExportLayout(operationsColumns(TEXT, "en"), rows, meta);
    const first = Object.fromEntries(layout.headerRow.map((header, index) => [header, layout.rows[0][index].value]));
    expect(first["progress · actual"]).toBeCloseTo(0.4);
    expect(first["overdue"]).toBe(2);
    expect(first["cost (SAR)"]).toBe(-1200.5);
  });
  it("NEGATIVE: an unknown figure and a hidden cost are empty cells, never 0", () => {
    const layout = buildExportLayout(operationsColumns(TEXT, "en"), rows, meta);
    const second = Object.fromEntries(layout.headerRow.map((header, index) => [header, layout.rows[1][index].value]));
    for (const header of ["progress · actual", "progress · planned", "deviation", "stalled", "cost (SAR)", "cpi"]) expect(second[header], header).toBeNull();
    expect(second["overdue"]).toBe(2); // a known count stays
  });
});
