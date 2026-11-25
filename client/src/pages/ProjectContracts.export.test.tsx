/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-57: the contracts and the commitments each export the rows the screen shows; a value the reader was not given (null) is an empty cell, never 0.
const h = vi.hoisted(() => ({ data: { contracts: [] as unknown[], commitments: [] as unknown[] }, build: vi.fn(async (..._args: unknown[]) => new ArrayBuffer(8)) }));
vi.mock("@/lib/excelExport", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/excelExport")>()), buildTableWorkbook: h.build, downloadWorkbook: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/permissions", () => ({ WriteGate: () => null, useCan: () => false }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  procurement: { register: { useQuery: () => ({ data: { suppliers: [] } }) } },
  contracts: {
    getProjectRegister: { useQuery: () => ({ isLoading: false, error: null, data: h.data, refetch: vi.fn() }) },
    create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    createCommitment: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  },
} }));
import { ProjectContracts } from "./ProjectContracts";
afterEach(cleanup);

type Call = { rows: unknown[]; columns: Array<{ header: string; kind?: string; value: (row: unknown) => unknown }> };
const lastCall = () => h.build.mock.calls[h.build.mock.calls.length - 1][0] as Call;

describe("ProjectContracts export (Q-57)", () => {
  it("exports contracts and commitments with the screen's columns; a hidden value is an empty cell", async () => {
    h.data = {
      contracts: [{ id: "c1", code: "CTR-1", title: "Access road (synthetic)", counterparty: "Works Co", contractValue: "1500.50", status: "active" }, { id: "c2", code: "CTR-2", title: "Fence", counterparty: null, contractValue: null, status: "draft" }],
      commitments: [{ id: "m1", code: "COM-1", description: "Steel (synthetic)", amount: "900", status: "open" }],
    };
    render(<ProjectContracts tenantId="t" projectId="p" />);
    const buttons = screen.getAllByRole("button", { name: "Export to Excel" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    await vi.waitFor(() => expect(h.build).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const contracts = lastCall();
    const value = contracts.columns.find(column => column.header === "Value")!;
    expect(value.kind).toBe("money");
    expect(contracts.rows.map(row => value.value(row))).toEqual([1500.5, null]); // null stays empty, never 0
    expect(contracts.rows.map(row => contracts.columns.find(column => column.header === "Code")!.value(row))).toEqual(["CTR-1", "CTR-2"]);
    h.build.mockClear();
    fireEvent.click(buttons[1]);
    await vi.waitFor(() => expect(h.build).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const commitments = lastCall();
    expect(commitments.rows).toHaveLength(1);
    expect(commitments.columns.find(column => column.header === "Amount")!.value(commitments.rows[0])).toBe(900);
  });
  it("with no contracts and no commitments there is nothing to export and no button", () => {
    h.data = { contracts: [], commitments: [] };
    render(<ProjectContracts tenantId="t" projectId="p" />);
    expect(screen.queryByRole("button", { name: "Export to Excel" })).toBeNull();
  });
});
