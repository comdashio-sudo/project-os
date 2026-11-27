/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportGrid } from "./ImportGrid";

// Q-66 batch 1: the review grid of a PMC import. Synthetic rows and values only.
type Row = { index: number; row: number; class: "data" | "total" | "leftOut"; status: "ready" | "corrected" | "error" | "ignored"; cells: Record<string, { value: string; from?: string; why?: string; errors?: Array<{ code: string }> }>; rowErrors: Array<{ code: string }> };
const state = vi.hoisted(() => ({ answer: null as unknown, inputs: [] as unknown[], rows: [] as unknown[], total: 0, counts: {} as Record<string, number>, fetch: vi.fn(), correct: vi.fn(), reanalyze: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ dataImports: { progress: { invalidate: vi.fn() }, grid: { invalidate: vi.fn(), fetch: state.fetch } } }),
  dataImports: {
    // one answer per state (as react-query keeps it): a new object only when the test changes what the server holds
    grid: { useQuery: (input: unknown) => {
      state.inputs.push(input);
      state.answer ??= { data: { fields: [{ key: "unitNumber", header: "Villa No", required: true }, { key: "modelCode", header: "Type", required: true }], ignoredColumns: ["Remarks"], counts: state.counts, tab: "all", shownTotal: state.total, offset: 0, pageSize: 200, rows: state.rows, fileErrors: [] }, dataUpdatedAt: 1, isLoading: false, error: null };
      return state.answer;
    } },
    correct: { useMutation: () => ({ mutate: state.correct, isPending: false, error: null }) },
    reanalyze: { useMutation: () => ({ mutate: state.reanalyze, isPending: false, error: null }) },
  },
} }));
vi.mock("@/components/ds/Select", () => ({ Select: ({ options, value, onValueChange, "aria-label": label }: { options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; "aria-label": string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));

const scope = { tenantId: "t-1", projectId: "p-1", importId: "i-1" };
const columns = { headers: ["Villa No", "Type", "Remarks"], fields: [{ key: "unitNumber", required: true, header: "Villa No" }, { key: "modelCode", required: true, header: "Type" }], overridden: false };
const sample: Row[] = [
  { index: 0, row: 2, class: "data", status: "ready", cells: { unitNumber: { value: "101" }, modelCode: { value: "A" } }, rowErrors: [] },
  { index: 1, row: 3, class: "data", status: "corrected", cells: { unitNumber: { value: "102", from: "102x", why: "edited" }, modelCode: { value: "A" } }, rowErrors: [] },
  { index: 2, row: 4, class: "data", status: "error", cells: { unitNumber: { value: "abc", errors: [{ code: "IMPORT_INVALID_NUMBER" }] }, modelCode: { value: "A" } }, rowErrors: [] },
  { index: 3, row: 5, class: "total", status: "ignored", cells: { unitNumber: { value: "Total" }, modelCode: { value: "" } }, rowErrors: [] },
];
const grid = (props: Partial<React.ComponentProps<typeof ImportGrid>> = {}) => render(<ImportGrid {...scope} columns={columns} applied={[{ row: 3, field: "unitNumber", header: "Villa No", from: "102x", to: "102" }]} ignoredRows={[9]} readRows={[]} language="en" {...props} />);
beforeEach(() => { state.answer = null; state.inputs = []; state.rows = sample; state.total = sample.length; state.counts = { all: 4, ready: 2, corrected: 1, errors: 1, ignored: 1 }; state.fetch.mockReset(); state.correct.mockReset(); state.reanalyze.mockReset(); });
afterEach(() => cleanup());
const cell = (row: number, field: string) => document.querySelector(`tr[data-row="${row}"] td[data-cell="${field}"]`) as HTMLElement;

describe("ImportGrid (Q-66 batch 1)", () => {
  it("POSITIVE: two-line headers (the platform's field and the file's column), row numbers, and each cell's state said in colour AND in words", () => {
    grid();
    expect(screen.getByRole("columnheader", { name: /Villa number/ })).toBeTruthy();
    expect((screen.getByLabelText("Column for «Villa number» in your file") as HTMLSelectElement).value).toBe("Villa No");
    expect(cell(3, "unitNumber").dataset.state).toBe("corrected");
    expect(cell(3, "unitNumber").textContent).toContain("You corrected it · In the file: «102x»");
    expect(cell(4, "unitNumber").dataset.state).toBe("error");
    expect(cell(4, "unitNumber").textContent).toContain("Not a valid number");
    expect(cell(2, "unitNumber").dataset.state).toBe("ok");
    const total = document.querySelector('tr[data-row="5"]')!;
    expect(total.getAttribute("data-status")).toBe("ignored");
    expect(total.textContent).toContain("Totals line: not read");
    expect(screen.getByText(/Columns of your file that will not be imported/).textContent).toContain("Remarks");
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["All 4", "Ready 2", "Corrected 1", "Errors 1", "Ignored 1"]);
  });

  it("a tapped row says in words what the reader did to it (a touch screen has no hover)", () => {
    grid();
    expect(document.querySelector("[data-grid-detail]")).toBeNull();
    fireEvent.click(cell(4, "unitNumber"));
    expect(document.querySelector("[data-grid-detail]")!.textContent).toContain("Row 4 · Errors");
    expect(document.querySelector("[data-grid-detail]")!.textContent).toContain("Villa number: ");
    expect(document.querySelector("[data-grid-detail]")!.textContent).toContain("Not a valid number");
    fireEvent.click(document.querySelector('tr[data-row="5"] th')!);
    expect(document.querySelector("[data-grid-detail]")!.textContent).toContain("Totals line: not read");
  });

  it("a tab and the search are asked of the server (the counts stay those of the whole file)", async () => {
    vi.useFakeTimers();
    grid();
    fireEvent.click(screen.getByRole("tab", { name: /Errors/ }));
    expect(state.inputs.at(-1)).toMatchObject({ ...scope, tab: "errors", offset: 0 });
    fireEvent.change(screen.getByPlaceholderText("Search the table"), { target: { value: " 102 " } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(state.inputs.at(-1)).toMatchObject({ tab: "errors", search: "102" });
    vi.useRealTimers();
  });

  it("POSITIVE: a cell corrected in place (double click, Enter) waits with the others, then goes as the full set with the corrections already applied", () => {
    grid();
    fireEvent.doubleClick(cell(4, "unitNumber"));
    const input = screen.getByLabelText("Villa number · row 4");
    fireEvent.change(input, { target: { value: "103" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cell(4, "unitNumber").dataset.state).toBe("corrected");
    expect(state.correct).not.toHaveBeenCalled();
    expect(screen.getByText("1 correction(s) not analysed yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Analyse again with these corrections" }));
    expect(state.correct).toHaveBeenCalledWith({ ...scope, edits: { cells: [{ row: 3, field: "unitNumber", value: "102" }, { row: 4, field: "unitNumber", value: "103" }], ignoreRows: [9] } });
  });

  it("NEGATIVE: a value typed back to what was read is no correction; Escape leaves the cell; a row not read cannot be edited", () => {
    grid();
    fireEvent.doubleClick(cell(2, "modelCode"));
    fireEvent.change(screen.getByLabelText("Model · row 2"), { target: { value: "A" } });
    fireEvent.keyDown(screen.getByLabelText("Model · row 2"), { key: "Enter" });
    fireEvent.doubleClick(cell(2, "unitNumber"));
    fireEvent.change(screen.getByLabelText("Villa number · row 2"), { target: { value: "999" } });
    fireEvent.keyDown(screen.getByLabelText("Villa number · row 2"), { key: "Escape" });
    expect(screen.queryByText(/not analysed yet/)).toBeNull();
    fireEvent.doubleClick(cell(5, "unitNumber"));
    expect(screen.queryByLabelText("Villa number · row 5")).toBeNull();
  });

  it("a column's source changed from its header is applied only by its button, as a new reading of the file", () => {
    grid();
    expect(screen.queryByRole("button", { name: "Read again with these columns" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Column for «Model» in your file"), { target: { value: "Remarks" } });
    expect(state.reanalyze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read again with these columns" }));
    expect(state.reanalyze).toHaveBeenCalledWith({ ...scope, mappingOverride: { unitNumber: "Villa No", modelCode: "Remarks", __others__: "ignore" } });
  });

  it("50,000 rows: only the rows in view are drawn, and the next page is asked for as the end of what is loaded comes near", () => {
    state.rows = Array.from({ length: 200 }, (_unused, index) => ({ index, row: index + 2, class: "data", status: "ready", cells: { unitNumber: { value: String(1000 + index) }, modelCode: { value: "A" } }, rowErrors: [] }));
    state.total = 50_000;
    state.counts = { all: 50_000, ready: 50_000, corrected: 0, errors: 0, ignored: 0 };
    state.fetch.mockResolvedValue({ rows: [] });
    grid();
    expect(document.querySelectorAll("tbody tr[data-row]").length).toBeLessThan(60);
    expect(screen.getByText("200 of 50000")).toBeTruthy();
    expect(state.fetch).not.toHaveBeenCalled();
    const scroller = document.querySelector("[data-grid-scroller]") as HTMLElement;
    fireEvent.scroll(scroller, { target: { scrollTop: 190 * 40 } });
    expect(state.fetch).toHaveBeenCalledWith(expect.objectContaining({ ...scope, tab: "all", offset: 200 }));
    expect(document.querySelector('tr[data-row="195"]')).toBeTruthy();
    expect(document.querySelector('tr[data-row="2"]')).toBeNull();
  });

  it("the summary bar: rows ready and rejected, and each totals check with ✅ or ❌", () => {
    grid({ checks: [{ label: "Weights of model A", ok: true, detail: "100%" }, { label: "Weights of model B", ok: false, detail: "98%" }], language: "ar" });
    const bar = document.querySelector("[data-grid-summary]")!;
    expect(bar.textContent).toContain("2 صف جاهز");
    expect(bar.textContent).toContain("1 صف مرفوض");
    expect(Array.from(bar.querySelectorAll("[data-check]")).map(node => [node.getAttribute("data-check"), node.textContent])).toEqual([["ok", "Weights of model A(100%)✅"], ["fails", "Weights of model B(98%)❌"]]);
  });
});
