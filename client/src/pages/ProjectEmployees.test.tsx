// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectEmployees } from "./ProjectEmployees";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({ identityQuery: vi.fn(), create: vi.fn(), archive: vi.fn(), createContract: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized employee error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", jobTitle: "Planner", department: "Planning", hireDate: new Date("2026-08-01"), employmentStatus: "active", nationality: "Saudi", retentionPolicy: "standard", archivedAt: null }], refetch: vi.fn() }) }, identity: { useQuery: (...args: unknown[]) => { state.identityQuery(...args); return { data: { id: "employee-1", identityDocumentType: "National ID", identityReference: "ID-REDACTED-001" }, error: null }; } }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) }, archive: { useMutation: () => ({ mutate: state.archive, isPending: false, error: null }) }, contracts: { list: { useQuery: () => ({ data: [], error: null, refetch: vi.fn() }) }, create: { useMutation: () => ({ mutate: state.createContract, isPending: false, error: null }) } } } } }));

describe("ProjectEmployees", () => {
  beforeEach(() => { cleanup(); state.identityQuery.mockReset(); state.create.mockReset(); state.archive.mockReset(); state.createContract.mockReset(); });

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
