/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectImports } from "./ProjectImports";

const state = vi.hoisted(() => ({ mutate: vi.fn(), reanalyze: vi.fn(), arabic: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { dataImports: { list: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, detail: { useQuery: () => ({ data: null, refetch: vi.fn(), error: null }) }, analyze: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null, data: { id: "00000000-0000-4000-8000-0000000000f1", status: "uploaded", totalRows: 2, headers: ["Work ID", "Work Name"], mapping: { code: "Work ID" }, errors: [{ code: "IMPORT_SINGLE_SHEET_REQUIRED" }] } }) }, reanalyze: { useMutation: () => ({ mutate: state.reanalyze, isPending: false, error: null, data: null }) }, confirm: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) } } } }));

describe("ProjectImports", () => {
  beforeEach(() => { cleanup(); state.mutate.mockReset(); state.reanalyze.mockReset(); state.arabic = false; });

  it("submits an XLSX file for bounded analysis and displays its summary", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("Controlled import in three steps")).toBeTruthy(); expect(screen.getByRole("button", { name: "Download Excel template" })).toBeTruthy();
    await user.upload(screen.getByLabelText("Choose a file"), new File(["workbook"], "wbs.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); await user.selectOptions(screen.getByLabelText("Duplicate-row policy"), "upsert"); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "wbs", sourceFormat: "xlsx", duplicateMode: "upsert" })); expect(screen.getByText("Rows: 2")).toBeTruthy(); expect(screen.getByText("Validation errors: 1")).toBeTruthy(); expect(screen.getByText("The file must contain exactly one worksheet.")).toBeTruthy();
  });

  it("uses the restricted schedule template and sends an XER only as schedule input", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByText("Schedule import accepts only named WBS and activity records. XER requires PROJWBS and TASK; unresolved WBS links and invalid dates are never ignored.")).toBeTruthy(); expect(screen.getAllByText("Record Type").length).toBeGreaterThan(0);
    await user.upload(screen.getByLabelText("Choose a file"), new File(["%T\tPROJWBS"], "programme.xer", { type: "text/plain" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "schedule", sourceFormat: "xer" }));
  });

  it("blocks analysis until an accepted file is selected", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.upload(screen.getByLabelText("Choose a file"), new File(["unsafe"], "notes.pdf", { type: "application/pdf" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a file before analysis."); expect(state.mutate).not.toHaveBeenCalledWith(expect.objectContaining({ fileName: "notes.pdf" }));
  });

  it("shows the approved contracts template in English and Arabic", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.click(screen.getByRole("button", { name: "Contracts" })); expect(screen.getAllByText("Contract Title").length).toBeGreaterThan(0); expect(screen.getAllByText("Counterparty").length).toBeGreaterThan(0); expect(screen.getAllByText("Currency").length).toBeGreaterThan(0);
    cleanup(); state.arabic = true; const arabicUser = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await arabicUser.click(screen.getByRole("button", { name: "العقود" })); expect(screen.getAllByText("اسم العقد").length).toBeGreaterThan(0); expect(screen.getAllByText("الطرف المتعاقد").length).toBeGreaterThan(0); expect(screen.getAllByText("العملة").length).toBeGreaterThan(0);
  });
});
