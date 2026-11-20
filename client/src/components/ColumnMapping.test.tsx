/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnMapping, mappingOf } from "./ColumnMapping";

// Q-50 batch 3a: the one column picker behind PmcColumnMapping (stored file analysed again) and ColumnChoice (file checked inside the request). Synthetic headers.
vi.mock("@/components/ds/Select", () => ({ Select: ({ options, value, onValueChange, "aria-label": label }: { options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; "aria-label": string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
afterEach(() => cleanup());
const columns = { headers: ["Ref", "Amount", "Notes"], fields: [{ key: "code", required: true, header: null }, { key: "amount", required: true, header: "Amount" }], overridden: false };
const label = (key: string) => ({ code: "Code", amount: "Amount (SAR)" } as Record<string, string>)[key] ?? key;

describe("ColumnMapping (Q-50 batch 3a)", () => {
  it("POSITIVE: each flow says what it does, and both hand back every field with the other columns ignored", () => {
    const onApply = vi.fn();
    render(<ColumnMapping columns={columns} language="en" flow="check" fieldLabel={label} pending={false} testId="t" onApply={onApply} />);
    expect(screen.getByText(/Nothing is saved until you save/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "Ref" } });
    fireEvent.click(screen.getByRole("button", { name: "Check again with these columns" }));
    expect(onApply).toHaveBeenCalledWith({ code: "Ref", amount: "Amount", __others__: "ignore" });
    cleanup();
    render(<ColumnMapping columns={columns} language="ar" flow="reanalyze" fieldLabel={label} pending={false} testId="t" onApply={vi.fn()} />);
    expect(screen.getByRole("button", { name: "أعد التحليل بهذه الأعمدة" })).toBeTruthy();
    expect(mappingOf({ code: "__none", amount: "Amount" })).toEqual({ code: "", amount: "Amount", __others__: "ignore" });
  });

  it("NEGATIVE: one column for two fields cannot be sent; a pending apply cannot be sent twice; the last refusal is shown", () => {
    const onApply = vi.fn();
    const { rerender } = render(<ColumnMapping columns={columns} language="en" flow="reanalyze" fieldLabel={label} pending={false} testId="t" onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "Amount" } });
    expect(screen.getByRole("alert").textContent).toContain("One column for two fields");
    fireEvent.click(screen.getByRole("button", { name: "Analyse again with these columns" }));
    expect(onApply).not.toHaveBeenCalled();
    rerender(<ColumnMapping columns={columns} language="ur" flow="reanalyze" fieldLabel={label} pending error="refused in words" testId="t" onApply={onApply} />);
    expect((screen.getByRole("button", { name: "ان کالموں کے ساتھ دوبارہ تجزیہ کریں" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("alert").map(node => node.textContent)).toContain("refused in words");
  });

  it("Q-50 3b POSITIVE: the source of each column is said, and a suggestion fills the choice only — nothing is sent until the button", () => {
    const onApply = vi.fn();
    const hinted = { headers: ["Plot Block", "Amount"], fields: [{ key: "code", required: true, header: null, source: null, suggestion: { header: "Plot Block", confidence: 0.8 } }, { key: "amount", required: true, header: "Amount", source: "name" as const, suggestion: null }], overridden: false };
    render(<ColumnMapping columns={hinted} language="en" flow="check" fieldLabel={label} pending={false} testId="t" onApply={onApply} />);
    expect(screen.getByText("Recognised by its name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use «Plot Block» (80% match)" }));
    expect(onApply).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Code") as HTMLSelectElement).value).toBe("Plot Block");
    expect(screen.queryByRole("button", { name: /Use «Plot Block»/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check again with these columns" }));
    expect(onApply).toHaveBeenCalledWith({ code: "Plot Block", amount: "Amount", __others__: "ignore" });
  });

  it("Q-50 3b NEGATIVE: no suggestion is offered for a field already read, nor one naming a header the file does not list; a chosen column says so", () => {
    const odd = { headers: ["Amount"], fields: [{ key: "code", required: true, header: null, source: null, suggestion: { header: "Gone", confidence: 0.9 } }, { key: "amount", required: true, header: "Amount", source: "chosen" as const, suggestion: { header: "Amount", confidence: 1 } }], overridden: true };
    render(<ColumnMapping columns={odd} language="ar" flow="reanalyze" fieldLabel={label} pending={false} testId="t" onApply={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /استعمل/ })).toBeNull();
    expect(screen.getByText("اخترته")).toBeTruthy();
  });
});
