// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-70 (2): the completion report screen. Synthetic data only.
const row = (villa: string, activityCode: string, status: string) => ({ villa, blockCode: "BLK 33", phase: "PH1", modelCode: "C", activityCode, activityName: activityCode === "ACT01" ? "Excavation" : "Footings", weightPercent: 50, status, startedOn: status === "NOT_STARTED" ? null : "2026-11-20", completedOn: status === "COMPLETE" ? "2026-11-21" : null, qcReceived: null, qcOn: null, lastBy: null, lastAt: null });
const all = [row("700", "ACT01", "COMPLETE"), row("700", "ACT02", "IN_PROGRESS"), row("701", "ACT01", "NOT_STARTED"), row("701", "ACT02", "NOT_STARTED"), row("702", "ACT01", "COMPLETE")];
const h = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, fetches: [] as Array<Record<string, unknown>>, built: [] as unknown[], downloaded: [] as string[] }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/excelExport", () => ({ buildTableWorkbook: async (input: { rows: unknown[] }) => { h.built = input.rows; return new ArrayBuffer(1); }, downloadWorkbook: (name: string) => { h.downloaded.push(name); }, exportFileName: (name: string) => `${name}.xlsx` }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const page = (input: { offset?: number; limit?: number; status?: string }) => {
  const rows = all.filter(item => !input.status || item.status === input.status); const offset = input.offset ?? 0; const limit = input.limit ?? 200;
  return { total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit), nextOffset: offset + limit < rows.length ? offset + limit : null, filters: offset === 0 ? { blocks: ["BLK 33"], phases: ["PH1"], activities: [{ code: "ACT01", name: "Excavation" }, { code: "ACT02", name: "Footings" }] } : null };
};
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ pmc: { completionReport: { fetch: async (input: Record<string, unknown>) => { h.fetches.push(input); return page({ ...input, limit: 2 }); } } } }),
  pmc: { completionReport: { useQuery: (input: Record<string, unknown>) => { h.calls.push(input); return { data: page(input), isError: false, error: null, refetch: vi.fn() }; } } },
} }));

import CompletionReport from "./CompletionReport";

beforeEach(() => { h.calls = []; h.fetches = []; h.built = []; h.downloaded = []; });
afterEach(() => cleanup());

describe("CompletionReport (Q-70 2)", () => {
  it("POSITIVE: a row per villa × activity with its status and days; the export reads EVERY page of the filters and writes them all, not only the page on screen", async () => {
    render(<CompletionReport />);
    expect(document.querySelector("[data-completion-report] [data-tone]")!.textContent).toBe("5 rows");
    expect(document.querySelectorAll("[data-completion-report] tbody tr")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Export 5 rows to Excel" }));
    await waitFor(() => expect(h.downloaded).toEqual(["completion-report.xlsx"]));
    expect(h.fetches.map(input => input.offset)).toEqual([0, 2, 4]); // three pages of two
    expect(h.built).toEqual(all);
  });

  it("NEGATIVE: a filter goes to the server and back to the first page; the export then carries the same filter", async () => {
    render(<CompletionReport />);
    fireEvent.change(document.getElementById(screen.getByText("Status", { selector: "label" }).getAttribute("for")!)!, { target: { value: "NOT_STARTED" } });
    expect(h.calls.at(-2)).toMatchObject({ status: "NOT_STARTED", offset: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Export 2 rows to Excel" }));
    await waitFor(() => expect(h.downloaded).toHaveLength(1));
    expect(h.fetches.every(input => input.status === "NOT_STARTED")).toBe(true);
    expect(h.built).toEqual(all.filter(item => item.status === "NOT_STARTED"));
  });
});
