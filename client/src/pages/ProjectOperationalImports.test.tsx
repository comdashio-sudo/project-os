/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectOperationalImports } from "./ProjectOperationalImports";

const IMPORT = "00000000-0000-4000-8000-0000000000e1";
const h = vi.hoisted(() => ({
  arabic: false, can: true, put: vi.fn(), template: vi.fn(), exporter: vi.fn(),
  imports: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, diff: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn(), template: vi.fn() },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic }) }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: h.put }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children, reason }: { children: React.ReactNode; reason?: { en: string } }) => (h.can ? <>{children}</> : <p role="note">{reason?.en}</p>) }));
vi.mock("@/lib/trpc", async () => {
  const base = (await import("../test/importsTrpcMock")).importsTrpc(h.imports);
  return { trpc: { dataImports: { ...base.dataImports, template: { useMutation: () => ({ mutate: h.template, isPending: false, error: null }) }, export: { useMutation: () => ({ mutate: h.exporter, isPending: false, error: null }) } } } };
});

const view = (over: Record<string, unknown> = {}) => ({ id: IMPORT, status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 2, validRows: 2, invalidRows: 0, createdRows: 0, updatedRows: 0, skippedRows: 0, analysis: { headers: [], mapping: {}, errors: [], errorsListed: 0, errorsTotal: 0 }, external: { canConfirm: true, report: { ledger: {} } }, ...over });
const preview = (summary: Record<string, number>, entries: unknown[]) => ({ supported: true, moduleCode: "costs", summary: { new: 0, modified: 0, unchanged: 0, conflict: 0, missing: 0, total: 0, ...summary }, diffHash: "c".repeat(64), entries, shownTotal: entries.length, offset: 0, pageSize: 200, missing: [], missingTotal: 0 });

beforeEach(() => {
  h.arabic = false; h.can = true;
  h.put.mockReset().mockResolvedValue(undefined); h.template.mockReset(); h.exporter.mockReset();
  h.imports.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "imports/t/p/pending/k/f", headers: {}, maxBytes: 1 });
  h.imports.registerUpload.mockReset().mockResolvedValue({ id: IMPORT, status: "analyzing" });
  h.imports.confirm.mockReset().mockResolvedValue({ id: IMPORT, status: "importing" });
  h.imports.progress = undefined; h.imports.diff = undefined;
});
afterEach(cleanup);

const analyse = async (name = "costs.csv") => {
  fireEvent.change(screen.getByLabelText("Excel or CSV file"), { target: { files: [new File(["a\n1\n"], name, { type: "text/csv" })] } });
  await waitFor(() => expect((screen.getByText("Upload and analyse").closest("button") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Upload and analyse"));
};

describe("ProjectOperationalImports", () => {
  it("offers the four modules, each with its rule in words and its columns", () => {
    render(<ProjectOperationalImports tenantId="t" projectId="p" />);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Actual costs", "Purchase orders", "Employees", "Hours"]);
    expect(screen.getByText(/Every row is tied to an existing WBS item/)).toBeTruthy();
    expect(screen.getByText(/Amount \(SAR\) · required/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Employees" }));
    expect(screen.getByText(/No nationality or identity documents in the file/)).toBeTruthy();
    expect(screen.queryByText(/Nationality/)).toBeNull(); // not a column of the file
    fireEvent.click(screen.getByRole("tab", { name: "Purchase orders" }));
    expect(screen.getByText(/Status column is for display/)).toBeTruthy();
    expect(screen.queryByText(/^Status/)).toBeNull(); // the read-only column is in the export, not in the blank template
  });

  it("downloads the template and the export of the chosen module in the current language", () => {
    render(<ProjectOperationalImports tenantId="t" projectId="p" />);
    fireEvent.click(screen.getByRole("tab", { name: "Hours" }));
    fireEvent.click(screen.getByText("Download the template"));
    expect(h.template).toHaveBeenCalledWith({ moduleCode: "timeEntries", locale: "en" });
    fireEvent.click(screen.getByText("Export the current data"));
    expect(h.exporter).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", moduleCode: "timeEntries", format: "xlsx", locale: "en" });
  });

  it("uploads straight to storage, shows the preview with old → new, and confirms with the hash of what was shown", async () => {
    h.imports.progress = view();
    h.imports.diff = preview({ new: 1, modified: 1, unchanged: 3 }, [
      { rowNumber: 2, key: "row 2", kind: "new", changes: [{ field: "amount", oldValue: "", newValue: "12500.00" }] },
      { rowNumber: 3, key: "PO-100", kind: "modified", changes: [{ field: "amount", oldValue: "48000.00", newValue: "52000.00" }] },
    ]);
    render(<ProjectOperationalImports tenantId="t" projectId="p" />);
    await analyse();
    await waitFor(() => expect(h.imports.createUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "costs", sourceFormat: "csv" })));
    expect(h.put).toHaveBeenCalledTimes(1);
    const shown = await screen.findByTestId("import-diff");
    expect(shown.textContent).toContain("48000.00"); expect(shown.textContent).toContain("52000.00"); expect(shown.textContent).toContain("Amount (SAR)");
    expect(h.imports.confirm).not.toHaveBeenCalled(); // looking writes nothing
    fireEvent.click(screen.getByText("Save what the preview showed"));
    await waitFor(() => expect(h.imports.confirm).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", importId: IMPORT, approvedDiffHash: "c".repeat(64) }));
  });

  it("a conflict blocks the file: its reason is in words, and there is no Save", async () => {
    h.imports.progress = view({ status: "uploaded", external: { canConfirm: false, report: { ledger: {} } }, analysis: { headers: [], mapping: {}, errors: [{ rowNumber: 2, code: "COST_ENTRY_READ_ONLY" }, { rowNumber: 4, code: "COST_WBS_NOT_FOUND", field: "wbsCode" }], errorsListed: 2, errorsTotal: 2 } });
    h.imports.diff = preview({ conflict: 1, unchanged: 1 }, [{ rowNumber: 2, key: "abc", kind: "conflict", conflict: "COST_ENTRY_READ_ONLY", changes: [{ field: "amount", oldValue: "2000.00", newValue: "99999.00" }] }]);
    render(<ProjectOperationalImports tenantId="t" projectId="p" />);
    await analyse();
    const alerts = (await screen.findAllByRole("alert")).map(node => node.textContent).join(" | ");
    expect(alerts).toContain("A posted cost is not edited from a file.");
    expect(alerts).toContain("That WBS code does not exist in this project.");
    expect(screen.queryByText("Save what the preview showed")).toBeNull();
  });

  it("without the module's permission only the template and the export are offered", () => {
    h.can = false;
    render(<ProjectOperationalImports tenantId="t" projectId="p" />);
    expect(screen.getByText("Download the template")).toBeTruthy(); expect(screen.getByText("Export the current data")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("You may not import this kind of data");
    expect(screen.queryByLabelText("Excel or CSV file")).toBeNull();
  });

  it("speaks Arabic with the Arabic column headers", () => {
    h.arabic = true;
    render(<ProjectOperationalImports tenantId="t" projectId="p" />);
    expect(screen.getByText("Excel للبيانات التشغيلية")).toBeTruthy();
    expect(screen.getByText("المبلغ (ريال) · مطلوب")).toBeTruthy();
    expect(screen.getByText("تنزيل القالب")).toBeTruthy();
  });
});
