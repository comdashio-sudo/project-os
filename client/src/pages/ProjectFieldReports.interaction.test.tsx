/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectFieldReports } from "./ProjectFieldReports";

const state = vi.hoisted(() => ({ arabic: false, create: vi.fn(), transition: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized field report error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { fieldReports: {
  list: { useQuery: () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000f4", reportNumber: "FR-001", reportType: "daily", reportedAt: new Date("2026-08-19T00:00:00.000Z"), shift: "day", workforceCount: 12, weather: "Clear", summary: "Existing daily report summary.", status: "draft" }], refetch: vi.fn(), error: null, isLoading: false }) },
  create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) },
  transitionStatus: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) },
} } }));

describe("ProjectFieldReports", () => {
  it("submits a localized operational report and exposes the governed next transition", async () => {
    cleanup(); state.create.mockClear(); state.transition.mockClear(); state.arabic = false;
    const user = userEvent.setup();
    render(<ProjectFieldReports tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Report number"), "FR-002");
    await user.selectOptions(screen.getByLabelText("Report type"), "inspection");
    await user.type(screen.getByLabelText("Workforce count"), "36");
    await user.type(screen.getByLabelText("Weather"), "Warm");
    await user.type(screen.getByLabelText("Site summary"), "Inspection report confirms controlled access.");
    await user.click(screen.getByRole("button", { name: "Save field report" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", reportNumber: "FR-002", reportType: "inspection", shift: "day", workforceCount: 36, weather: "Warm" }));
    await user.click(screen.getByRole("button", { name: "Update status: Submitted" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", reportId: "00000000-0000-4000-8000-0000000000f4", nextStatus: "submitted" });
  });

  it("localizes the register and status controls in Arabic", () => {
    cleanup(); state.arabic = true;
    render(<ProjectFieldReports tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("سجل التقارير الميدانية")).toBeTruthy();
    expect(screen.getByLabelText("رقم التقرير")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تحديث الحالة: مرسل" })).toBeTruthy();
    state.arabic = false;
  });
});
