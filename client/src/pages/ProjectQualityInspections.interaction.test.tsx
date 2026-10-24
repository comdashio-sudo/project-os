/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectQualityInspections } from "./ProjectQualityInspections";

const state = vi.hoisted(() => ({ arabic: false, create: vi.fn(), transition: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized quality error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { qualityInspections: {
  list: { useQuery: () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000f5", inspectionNumber: "QI-001", inspectionType: "hold_point", inspectedAt: new Date("2026-08-19T00:00:00.000Z"), outcome: "pass", summary: "Existing hold-point inspection summary.", status: "draft" }], refetch: vi.fn(), error: null, isLoading: false }) },
  create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) },
  transitionStatus: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) },
} } }));

describe("ProjectQualityInspections", () => {
  it("submits an inspection and exposes the governed next transition", async () => {
    cleanup(); state.create.mockClear(); state.transition.mockClear(); state.arabic = false;
    const user = userEvent.setup();
    render(<ProjectQualityInspections tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Inspection number"), "QI-002");
    await user.selectOptions(screen.getByLabelText("Inspection type"), "testing");
    await user.selectOptions(screen.getByLabelText("Outcome"), "conditional");
    await user.type(screen.getByLabelText("Inspection summary"), "Testing requires a controlled follow-up inspection.");
    await user.click(screen.getByRole("button", { name: "Save quality inspection" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", inspectionNumber: "QI-002", inspectionType: "testing", outcome: "conditional" }));
    await user.click(screen.getByRole("button", { name: "Update status: Submitted" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", inspectionId: "00000000-0000-4000-8000-0000000000f5", nextStatus: "submitted" });
  });

  it("localizes the quality inspection register and transition control in Arabic", () => {
    cleanup(); state.arabic = true;
    render(<ProjectQualityInspections tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("سجل فحوصات الجودة")).toBeTruthy();
    expect(screen.getByLabelText("رقم الفحص")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تحديث الحالة: مرسل" })).toBeTruthy();
    state.arabic = false;
  });
});
