/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { correctionsOf, MAX_CORRECTABLE_ROWS, PmcRowCorrections } from "./PmcRowCorrections";

// Q-50 batch 4b: a rejected row of a PMC file corrected in the preview. Synthetic rows and values only.
const state = vi.hoisted(() => ({ mutate: vi.fn(), invalidate: vi.fn(), error: null as null | unknown }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ dataImports: { progress: { invalidate: state.invalidate } } }),
  dataImports: { correct: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: state.error }) } },
} }));

vi.mock("@/components/ds/Select", () => ({ Select: ({ options, value, onValueChange, "aria-label": label }: { options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; "aria-label": string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const scope = { tenantId: "t-1", projectId: "p-1", importId: "i-1" };
const errors = [{ rowNumber: 3, code: "IMPORT_INVALID_NUMBER", field: "unitNumber" }, { rowNumber: 4, code: "IMPORT_INVALID_NUMBER", field: "unitNumber" }];
const fields = ["blockCode", "unitNumber", "modelCode"];
beforeEach(() => { state.mutate.mockReset(); state.error = null; });
afterEach(() => cleanup());

describe("PmcRowCorrections (Q-50 4b)", () => {
  it("POSITIVE: a value typed for the row's own field and a row left out are sent as the full set; nothing is sent before the button", () => {
    render(<PmcRowCorrections {...scope} errors={errors} fields={fields} applied={[]} ignoredRows={[]} language="en" />);
    expect(screen.getByRole("button", { name: "Analyse again with these corrections" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Field · Row 3"), { target: { value: "modelCode" } });
    fireEvent.change(screen.getByLabelText("Correct value · Row 3"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Field · Row 3"), { target: { value: "unitNumber" } });
    fireEvent.change(screen.getByLabelText("Correct value · Row 3"), { target: { value: " 72002 " } });
    const leaveOut = screen.getAllByRole("button", { name: "Leave this row out" });
    fireEvent.click(leaveOut[1]);
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Analyse again with these corrections" }));
    expect(state.mutate).toHaveBeenCalledWith({ ...scope, edits: { cells: [{ row: 3, field: "modelCode", value: "B" }, { row: 3, field: "unitNumber", value: "72002" }], ignoreRows: [4] } });
  });

  it("POSITIVE: the corrections already applied are listed with the file's value, and one undone is left out of the next set", () => {
    render(<PmcRowCorrections {...scope} errors={[]} fields={fields} applied={[{ row: 3, field: "unitNumber", header: "Unit Number", from: "72x02", to: "72002" }]} ignoredRows={[4]} language="en" />);
    expect(screen.getByTestId("applied-corrections").textContent).toContain("72x02");
    expect(screen.getByTestId("applied-corrections").textContent).toContain("Rows left out: Row 4");
    expect(screen.getByText("Choosing other columns below is a new reading of the file: these corrections are dropped.")).toBeTruthy();
    const undo = screen.getAllByRole("button", { name: "Undo" });
    fireEvent.click(undo[0]);
    fireEvent.click(screen.getByRole("button", { name: "Analyse again with these corrections" }));
    expect(state.mutate).toHaveBeenCalledWith({ ...scope, edits: { cells: [], ignoreRows: [4] } });
  });

  it("NEGATIVE: a blank value is not a correction, a cell of a row left out is not sent, and the server's refusal is shown in the person's language", () => {
    state.error = { data: { projectError: { messages: { ar: "غير مسموح", en: "Not allowed for this file", ur: "اجازت نہیں" } } } };
    render(<PmcRowCorrections {...scope} errors={errors} fields={fields} applied={[]} ignoredRows={[]} language="ar" />);
    expect(screen.getByRole("alert").textContent).toBe("غير مسموح");
    expect(correctionsOf([], new Set(), { "3:unitNumber": "   " }, new Set())).toEqual({ cells: [], ignoreRows: [] });
    expect(correctionsOf([], new Set(), { "3:unitNumber": "72002" }, new Set([3]))).toEqual({ cells: [], ignoreRows: [3] });
  });

  it("NEGATIVE: more rejected rows than the panel holds say to fix the file at its source; no row means no panel", () => {
    const many = Array.from({ length: MAX_CORRECTABLE_ROWS + 5 }, (_unused, index) => ({ rowNumber: index + 2, code: "IMPORT_INVALID_NUMBER", field: "unitNumber" }));
    render(<PmcRowCorrections {...scope} errors={many} fields={fields} applied={[]} ignoredRows={[]} language="en" />);
    expect(screen.getAllByRole("button", { name: "Leave this row out" })).toHaveLength(MAX_CORRECTABLE_ROWS);
    expect(screen.getByText("and 5 more rows: correct them in the file")).toBeTruthy();
    cleanup();
    const { container } = render(<PmcRowCorrections {...scope} errors={[{ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING" }]} fields={fields} applied={[]} ignoredRows={[]} language="ur" />);
    expect(container.innerHTML).toBe("");
  });
});
