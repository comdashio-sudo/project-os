/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnChoice, offersColumnChoice } from "./ColumnChoice";

// Q-31 (P0-02): the column picker of the baseline files checked inside the request. Synthetic headers only.
vi.mock("@/components/ds/Select", () => ({ Select: ({ options, value, onValueChange, "aria-label": label }: { options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; "aria-label": string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
afterEach(() => cleanup());
const columns = { headers: ["Period", "Share", "Notes"], fields: [{ key: "month", required: true, header: null }, { key: "percent", required: true, header: null }], overridden: false };
const labels: Record<string, string> = { month: "Month", percent: "Percent" };

describe("ColumnChoice (Q-31)", () => {
  it("POSITIVE: each required field without a column reads «Missing»; the chosen columns are handed back, «no column» as empty, extra columns ignored", () => {
    const onApply = vi.fn();
    render(<ColumnChoice columns={columns} language="en" fieldLabel={key => labels[key]} pending={false} onApply={onApply} />);
    expect(screen.getAllByText("Missing")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "Period" } });
    fireEvent.change(screen.getByLabelText("Percent"), { target: { value: "Share" } });
    fireEvent.click(screen.getByRole("button", { name: "Check again with these columns" }));
    expect(onApply).toHaveBeenCalledWith({ month: "Period", percent: "Share", __others__: "ignore" });
  });

  it("NEGATIVE: one column for two fields is said and cannot be sent; an applied choice with nothing changed cannot be sent again", () => {
    const onApply = vi.fn();
    const first = render(<ColumnChoice columns={{ ...columns, overridden: true }} language="en" fieldLabel={key => labels[key]} pending={false} onApply={onApply} />);
    expect((first.getByRole("button", { name: "Check again with these columns" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<ColumnChoice columns={columns} language="en" fieldLabel={key => labels[key]} pending={false} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "Share" } });
    fireEvent.change(screen.getByLabelText("Percent"), { target: { value: "Share" } });
    expect(screen.getByRole("alert").textContent).toContain("One column for two fields");
    fireEvent.click(screen.getByRole("button", { name: "Check again with these columns" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("is offered only when the columns are the problem, or once a choice was made", () => {
    expect(offersColumnChoice({ refusal: "PROJECT_OS_CASHFLOW_COLUMNS_MISSING", columns })).toBe(true);
    expect(offersColumnChoice({ refusal: "PROJECT_OS_IMPORT_MAPPING_INVALID", columns })).toBe(true);
    expect(offersColumnChoice({ refusal: "PROJECT_OS_CASHFLOW_TOTAL_NOT_100", columns })).toBe(false);
    expect(offersColumnChoice({ refusal: null, columns: { ...columns, overridden: true } })).toBe(true);
    expect(offersColumnChoice({ refusal: "PROJECT_OS_BOQ_COLUMNS_MISSING" })).toBe(false);
  });
});
