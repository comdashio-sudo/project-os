// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const exported = vi.hoisted(() => ({ build: vi.fn(async (..._args: unknown[]) => new ArrayBuffer(8)) }));
vi.mock("@/lib/excelExport", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/excelExport")>()), buildTableWorkbook: exported.build, downloadWorkbook: vi.fn() }));
import { ProjectEmployees } from "./ProjectEmployees";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({ denied: new Set<string>(), identityQuery: vi.fn(), create: vi.fn(), archive: vi.fn(), createContract: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/permissions")>()), useCan: (code: string) => !state.denied.has(code) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized employee error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", identityReference: "POISON-ID-9999", linkedUserId: 4242, jobTitle: "Planner", department: "Planning", hireDate: new Date("2026-08-01"), employmentStatus: "active", nationality: "Saudi", retentionPolicy: "standard", archivedAt: null }], refetch: vi.fn() }) }, identity: { useQuery: (...args: unknown[]) => { state.identityQuery(...args); return { data: { id: "employee-1", identityDocumentType: "National ID", identityReference: "ID-REDACTED-001" }, error: null }; } }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) }, archive: { useMutation: () => ({ mutate: state.archive, isPending: false, error: null }) }, contracts: { list: { useQuery: () => ({ data: [], error: null, refetch: vi.fn() }) }, create: { useMutation: () => ({ mutate: state.createContract, isPending: false, error: null }) } } } } }));

describe("ProjectEmployees", () => {
  beforeEach(() => { cleanup(); state.denied.clear(); state.identityQuery.mockReset(); state.create.mockReset(); state.archive.mockReset(); state.createContract.mockReset(); });

  it("names a missing full name beside its field and creates no employee", () => {
    render(<ProjectEmployees tenantId="tenant-1" />);
    fireEvent.change(document.getElementById("employee-number") as HTMLInputElement, { target: { value: "EMP-09" } });
    fireEvent.change(document.getElementById("employee-title") as HTMLInputElement, { target: { value: "Engineer" } });
    fireEvent.change(document.getElementById("employee-department") as HTMLInputElement, { target: { value: "Design" } });
    fireEvent.change(document.getElementById("employee-hire-date") as HTMLInputElement, { target: { value: "2026-01-15" } });
    fireEvent.submit(document.getElementById("employee-create") as HTMLFormElement);
    expect(screen.getByText("This field is required.")).toBeTruthy();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("keeps protected identity out of the employee card until an explicit audited-view request", async () => {
    render(<ProjectEmployees tenantId="tenant-1" />);

    expect(screen.getByText("EMP-01 · Amina Planner")).toBeTruthy();
    expect(screen.queryByText("ID-REDACTED-001")).toBeNull();
    expect(state.identityQuery).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: "tenant-1" }), expect.objectContaining({ enabled: false }));

    fireEvent.click(screen.getByRole("button", { name: "View protected identity" }));

    expect(screen.getByRole("dialog", { name: "Protected identity data" })).toBeTruthy();
    expect(screen.getByText(/ID-REDACTED-001/)).toBeTruthy();
    expect(screen.getByText("This read is recorded in the audit log.")).toBeTruthy();
    expect(state.identityQuery.mock.calls.some(([, options]) => (options as { enabled?: boolean }).enabled)).toBe(true);
  });
});

describe("ProjectEmployees checks its forms in the page's language (D-65)", () => {
  it("an empty employment contract creates nothing and says so in English under its first field", () => {
    cleanup(); state.createContract.mockReset();
    render(<ProjectEmployees tenantId="tenant-1" />);
    fireEvent.click(screen.getByText("EMP-01 · Amina Planner").closest("button")!);
    const form = Array.from(document.querySelectorAll<HTMLFormElement>("form")).find(node => node.id !== "employee-create" && node.querySelector("[required]"))!;
    expectEmptySubmitRefused(form, "en", state.createContract);
  });

});

describe("Q-38 (P1-06): fields named, sensitive reads asked for only by whom the server allows", () => {
  beforeEach(() => { cleanup(); state.denied.clear(); state.identityQuery.mockReset(); });

  it("Q-38: every field shows its name above it, the hire date says it is the company's, the dates and the retention say what they mean", () => {
    render(<ProjectEmployees tenantId="tenant-1" />);
    expect(screen.getByLabelText("Company hire date")).toBe(document.getElementById("employee-hire-date"));
    expect(document.getElementById("employee-hire-date-hint")!.textContent).toContain("The date they start on a project is the assignment's «Assignment start»");
    for (const id of ["employee-number", "employee-name", "employee-title", "employee-department", "employee-nationality", "employee-identity-type", "employee-identity"]) expect(document.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    expect(document.getElementById("employee-identity-hint")!.textContent).toContain("every view is recorded");
    expect(document.getElementById("employee-retention-hint")!.textContent).toContain("The platform deletes no record by itself.");
    fireEvent.click(screen.getByText("EMP-01 · Amina Planner"));
    expect(screen.getByLabelText("Contract start")).toBe(document.getElementById("contract-start"));
    expect(document.getElementById("contract-end-hint")!.textContent).toBe("Leave empty for a permanent contract.");
  });

  it("Q-38 NEGATIVE: whoever may not view identity data is not offered the button (the server would refuse it); nothing is asked for", () => {
    state.denied.add("project.hr.sensitive.read");
    render(<ProjectEmployees tenantId="tenant-1" />);
    expect(screen.getByText("EMP-01 · Amina Planner")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View protected identity" })).toBeNull();
    expect(state.identityQuery.mock.calls.every(([, options]) => !(options as { enabled?: boolean }).enabled)).toBe(true);
  });

  // Q-57: the register exports what its cards show; the protected identity never enters a file
  it("Q-57: the employee register exports number, name, title, department and status — never identity data", async () => {
    exported.build.mockClear();
    render(<ProjectEmployees tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await vi.waitFor(() => expect(exported.build).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const call = exported.build.mock.calls[0][0] as { rows: unknown[]; columns: Array<{ header: string; value: (row: unknown) => unknown }> };
    expect(call.columns.map(column => column.header)).toEqual(["Employee number", "Name", "Job title", "Department", "Status"]);
    const values = call.columns.map(column => column.value(call.rows[0]));
    expect(values.slice(0, 4)).toEqual(["EMP-01", "Amina Planner", "Planner", "Planning"]);
    expect(typeof values[4]).toBe("string"); expect(values[4]).not.toBe("");
    // the row the screen holds carries fields the card does not show; none of them reaches any column
    expect(JSON.stringify(values)).not.toMatch(/POISON|4242/);
    expect(state.identityQuery.mock.calls.every(([, options]) => !(options as { enabled?: boolean }).enabled)).toBe(true); // exporting asks for no protected read
  });
});
