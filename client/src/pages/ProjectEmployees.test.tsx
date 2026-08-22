// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectEmployees } from "./ProjectEmployees";

const state = vi.hoisted(() => ({ identityQuery: vi.fn(), create: vi.fn(), archive: vi.fn(), createContract: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized employee error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", jobTitle: "Planner", department: "Planning", hireDate: new Date("2026-08-01"), employmentStatus: "active", nationality: "Saudi", retentionPolicy: "standard", archivedAt: null }], refetch: vi.fn() }) }, identity: { useQuery: (...args: unknown[]) => { state.identityQuery(...args); return { data: { id: "employee-1", identityDocumentType: "National ID", identityReference: "ID-REDACTED-001" }, error: null }; } }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) }, archive: { useMutation: () => ({ mutate: state.archive, isPending: false, error: null }) }, contracts: { list: { useQuery: () => ({ data: [], error: null, refetch: vi.fn() }) }, create: { useMutation: () => ({ mutate: state.createContract, isPending: false, error: null }) } } } } }));

describe("ProjectEmployees", () => {
  beforeEach(() => { cleanup(); state.identityQuery.mockReset(); state.create.mockReset(); state.archive.mockReset(); state.createContract.mockReset(); });

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
