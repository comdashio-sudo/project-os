// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-70 (1): the progress log screen. Synthetic data only.
const h = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, exported: { rows: [] as unknown[], columns: [] as Array<{ header: string; value: (row: unknown) => unknown }> } }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/ExportExcelButton", () => ({ ExportExcelButton: (props: { rows: unknown[]; columns: Array<{ header: string; value: (row: unknown) => unknown }> }) => { h.exported.rows = props.rows; h.exported.columns = props.columns; return <button type="button">Export</button>; } }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const entries = [
  { key: "a", at: "2026-11-20T09:00:00.000Z", day: "2026-11-20", source: "manual", activityCode: "ACT01", activityName: "Excavation", from: null, to: "COMPLETE", byUserId: 1, byName: "Site engineer (synthetic)", villas: ["700", "701", "702", "703", "705"], blocks: ["BLK 33", "BLK 34"], villaCount: 5 },
  { key: "b", at: "2026-11-19T09:00:00.000Z", day: "2026-11-19", source: "qc", activityCode: "ACT02", activityName: "Backfill", from: null, to: "RECEIVED", byUserId: 2, byName: "QC engineer (synthetic)", villas: ["700"], blocks: ["BLK 33"], villaCount: 1 },
];
// the mock answers like the server does: a block filter keeps the entries that touched it, with only that block's villas (pmcProgressLog.ts)
const villaBlock: Record<string, string> = { "700": "BLK 33", "701": "BLK 33", "702": "BLK 34", "703": "BLK 34", "705": "BLK 34" };
const answer = (input: Record<string, unknown>) => entries
  .filter(entry => !input.source || entry.source === input.source)
  .filter(entry => !input.blockCode || entry.blocks.includes(String(input.blockCode)))
  .map(entry => (input.blockCode ? { ...entry, villas: entry.villas.filter(villa => villaBlock[villa] === input.blockCode), blocks: [String(input.blockCode)] } : entry))
  .map(entry => ({ ...entry, villaCount: entry.villas.length }));
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: { progressLog: { useQuery: (input: Record<string, unknown>) => { h.calls.push(input); return { data: { entries: answer(input), truncated: false, maxRows: 20000, filters: { people: [{ id: 1, name: "Site engineer (synthetic)" }, { id: 2, name: "QC engineer (synthetic)" }], blocks: ["BLK 33", "BLK 34"], activities: [{ code: "ACT01", name: "Excavation" }, { code: "ACT02", name: "Backfill" }] } }, isError: false, error: null, refetch: vi.fn() }; } } } } }));

import ProgressLog, { villaRanges } from "./ProgressLog";

afterEach(() => cleanup());
const select = (label: string, value: string) => fireEvent.change(document.getElementById(screen.getAllByText(label).find(node => node.closest("label"))!.closest("label")!.getAttribute("for")!)!, { target: { value } });

describe("ProgressLog (Q-70 1)", () => {
  it("POSITIVE: one row per entry, its villas as ranges, before → after and the source; the Excel export is exactly the rows shown", () => {
    render(<ProgressLog />);
    const rows = Array.from(document.querySelectorAll("[data-log-entry]"));
    expect(rows.map(row => row.getAttribute("data-log-entry"))).toEqual(["manual", "qc"]);
    expect(rows[0].textContent).toContain("700–703, 705");
    expect(rows[0].textContent).toContain("— → Complete");
    expect(rows[1].textContent).toContain("QC receipt");
    expect(h.exported.rows).toHaveLength(2);
    const villas = h.exported.columns.find(column => column.header === "Villas")!;
    expect(villas.value(h.exported.rows[0])).toBe("700–703, 705");
  });

  it("review of #569 (C, change 1): a block goes to the server, and an entry that touched two blocks shows — and exports — only the chosen block's villas", () => {
    render(<ProgressLog />);
    select("Block", "BLK 33");
    expect(h.calls.at(-1)).toMatchObject({ blockCode: "BLK 33" });
    const rows = Array.from(document.querySelectorAll("[data-log-entry]"));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("700–701");
    expect(rows[0].textContent).not.toContain("702");
    expect((h.exported.rows as Array<{ villas: string[] }>)[0].villas).toEqual(["700", "701"]);
  });

  it("NEGATIVE: a source the server leaves out is gone from the screen AND the export; a filter nothing matches says so", () => {
    render(<ProgressLog />);
    select("Source", "qc");
    expect(h.calls.at(-1)).toMatchObject({ source: "qc" });
    expect(Array.from(document.querySelectorAll("[data-log-entry]")).map(row => row.getAttribute("data-log-entry"))).toEqual(["qc"]);
    expect(h.exported.rows).toHaveLength(1);
    select("Block", "BLK 34");
    expect(document.querySelectorAll("[data-log-entry]")).toHaveLength(0);
    expect(h.exported.rows).toEqual([]);
    expect(screen.getByText("No entries with this filter.")).toBeTruthy();
  });

  it("review of #574 (C, change 1, sibling): a change through review reads «Under review» in its language, never the raw status word", () => {
    entries.push({ ...entries[0], key: "c", from: "UNDER_REVIEW", to: "COMPLETE" } as unknown as (typeof entries)[number]);
    try {
      render(<ProgressLog />);
      const row = Array.from(document.querySelectorAll("[data-log-entry]")).find(item => item.textContent?.includes("Under review"))!;
      expect(row.textContent).toContain("Under review → Complete");
      expect(document.body.textContent).not.toContain("UNDER_REVIEW");
    } finally { entries.pop(); }
  });

  it("villa ranges fold only consecutive numbers", () => {
    expect(villaRanges(["1", "2", "3", "5", "7", "8"])).toBe("1–3, 5, 7–8");
    expect(villaRanges(["A1", "A2"])).toBe("A1, A2");
    expect(villaRanges([])).toBe("");
  });
});
