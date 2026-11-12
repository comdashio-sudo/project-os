/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTableWorkbook } from "@/lib/excelExport";
import ProjectInvoicesPanel from "./ProjectInvoicesPanel";
import { EXPORT_TEST, EXPORT_WAIT } from "@/test/exportWait";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});
// Invented example invoices: the names and amounts are placeholders.
const h = vi.hoisted(() => ({ arabic: false, empty: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic, language: (h.arabic) ? "ar" : "en", isRtl: h.arabic }) }));
const invoices = [
  { id: "i1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-10-05T00:00:00Z"), clientName: "Example Client", totalAmount: "1150.00", status: "draft", paidAt: null },
  { id: "i2", invoiceNumber: "INV-2", invoiceDate: new Date("2026-10-06T00:00:00Z"), clientName: "Example Client", totalAmount: "575.00", status: "issued", paidAt: null },
  { id: "i3", invoiceNumber: "INV-3", invoiceDate: new Date("2026-10-07T00:00:00Z"), clientName: "Example Client", totalAmount: "100.00", status: "paid", paidAt: new Date("2026-10-12T00:00:00Z") },
];
vi.mock("@/lib/trpc", () => ({ trpc: { projectInvoices: {
  list: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: h.empty ? [] : invoices }) },
  transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
} } }));

let clickSpy: { mockRestore: () => void };
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(buildTableWorkbook).mockClear();
});
afterEach(() => { cleanup(); clickSpy.mockRestore(); h.arabic = false; h.empty = false; });

const show = () => render(<ProjectInvoicesPanel tenantId="t" projectId="p" currency="SAR" />);

describe("ProjectInvoicesPanel export", EXPORT_TEST, () => {
  it("renders the export button in the panel heading row, in the same section as the table", () => {
    show();
    const button = screen.getByRole("button", { name: "Export to Excel" }) as HTMLButtonElement;
    const heading = screen.getByRole("heading", { name: "Client invoices" });
    expect(heading.parentElement!.contains(button)).toBe(true);
    expect(screen.getByRole("table").closest("section")!.contains(button)).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it("exports the table's headers (without the empty action column) and one row per invoice", async () => {
    show();
    const table = screen.getByRole("table");
    const headerRow = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent ?? "");
    expect(headerRow).toEqual(["Number", "Date", "Client", "Total", "Status", ""]);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1), EXPORT_WAIT);
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    expect(input.columns.map(column => column.header)).toEqual(headerRow.slice(0, -1));
    expect(input.rows.length).toBe(table.querySelectorAll("tbody tr").length);
    expect(input.rows.length).toBe(3);
  });

  it("passes raw values: the date as a Date, the total as a number, the status as the text the cell shows", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1), EXPORT_WAIT);
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    const [first, , paid] = input.rows.map(row => input.columns.map(column => column.value(row)));
    expect(first[0]).toBe("INV-1");
    expect(first[1]).toBeInstanceOf(Date);
    expect((first[1] as Date).toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(first[2]).toBe("Example Client");
    expect(first[3]).toBe(1150);
    expect(first[4]).toBe("Draft");
    expect(paid[4]).toBe("Paid · Paid on 2026-10-12");
    expect(input.columns.map(column => column.kind)).toEqual(["text", "date", "text", "money", "text"]);
  });

  it("keeps the button visible but disabled when there are no invoices", () => {
    h.empty = true;
    show();
    const button = screen.getByRole("button", { name: "Export to Excel" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("No invoices yet.")).toBeTruthy();
    expect(screen.getByText("No rows to export")).toBeTruthy();
  });

  it("uses the Arabic headers and button label when the screen is in Arabic", async () => {
    h.arabic = true;
    show();
    fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1), EXPORT_WAIT);
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    expect(input.columns.map(column => column.header)).toEqual(["الرقم", "التاريخ", "العميل", "الإجمالي", "الحالة"]);
    const paid = input.rows[2];
    expect(input.columns[4].value(paid)).toBe("مسدَّدة · تاريخ السداد 2026-10-12");
  });
});
