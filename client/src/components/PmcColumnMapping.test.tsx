/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PmcColumnMapping } from "./PmcColumnMapping";

// Q-31 (P0-02): the column picker under a PMC import report. Synthetic headers only.
const state = vi.hoisted(() => ({ mutate: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ dataImports: { progress: { invalidate: state.invalidate } } }),
  dataImports: { reanalyze: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) } },
} }));
vi.mock("@/components/ds/Select", () => ({ Select: ({ options, value, onValueChange, "aria-label": label }: { options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; "aria-label": string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));

const columns = { headers: ["Plot Block", "House", "Kind"], fields: [{ key: "blockCode", required: true, header: null }, { key: "unitNumber", required: true, header: null }, { key: "modelCode", required: true, header: "Kind" }, { key: "zoneCode", required: false, header: null }], overridden: false };
const view = () => render(<PmcColumnMapping tenantId="t-1" projectId="p-1" importId="i-1" columns={columns} language="en" isArabic={false} />);
beforeEach(() => state.mutate.mockReset());
afterEach(() => cleanup());

describe("PmcColumnMapping (Q-31)", () => {
  it("shows each field with its column, required or optional, and marks a required field with no column as missing", () => {
    view();
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("Kind");
    expect(screen.getAllByText("Missing")).toHaveLength(2);
    expect(screen.getAllByText("Optional")).toHaveLength(1);
  });

  it("POSITIVE: picking the columns and asking again sends every field — «no column» as an empty header — and asks to ignore the columns no field takes", () => {
    view();
    fireEvent.change(screen.getByLabelText("Block code"), { target: { value: "Plot Block" } });
    fireEvent.change(screen.getByLabelText("Villa number"), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse again with these columns" }));
    expect(state.mutate).toHaveBeenCalledWith({ tenantId: "t-1", projectId: "p-1", importId: "i-1", mappingOverride: { blockCode: "Plot Block", unitNumber: "House", modelCode: "Kind", zoneCode: "", __others__: "ignore" } });
  });

  it("review of #371: «no column» for a field the reader had found is SENT (empty), so the column is no longer read", () => {
    view();
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "__none" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse again with these columns" }));
    expect(state.mutate.mock.calls[0][0].mappingOverride).toMatchObject({ modelCode: "" });
  });

  it("NEGATIVE: one column for two fields is said and cannot be sent; once the person's columns are applied, nothing changed cannot be sent again", () => {
    const overridden = render(<PmcColumnMapping tenantId="t-1" projectId="p-1" importId="i-1" columns={{ ...columns, overridden: true }} language="en" isArabic={false} />);
    expect((overridden.getByRole("button", { name: "Analyse again with these columns" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    view();
    const button = screen.getByRole("button", { name: "Analyse again with these columns" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Block code"), { target: { value: "Kind" } });
    expect(screen.getByRole("alert").textContent).toContain("One column for two fields");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
