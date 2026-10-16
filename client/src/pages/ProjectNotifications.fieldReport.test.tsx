/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectNotifications } from "./ProjectNotifications";

const state = vi.hoisted(() => ({ arabic: false, setPref: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized notification error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { notifications: {
  list: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: [
    { id: "notify-approved", notificationCode: "FIELD_REPORT_REVIEWED", projectId: "project-1", entityType: "field_report", entityId: "report-1", payload: JSON.stringify({ reportNumber: "FR-001", status: "approved" }), acknowledgedAt: null, createdAt: new Date("2026-08-19T00:00:00.000Z") },
    { id: "notify-rejected", notificationCode: "FIELD_REPORT_REVIEWED", projectId: "project-1", entityType: "field_report", entityId: "report-2", payload: JSON.stringify({ reportNumber: "FR-002", status: "rejected" }), acknowledgedAt: null, createdAt: new Date("2026-08-19T00:00:00.000Z") },
  ] }) },
  acknowledge: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  emailPreferences: { useQuery: () => ({ data: { active: false, preferences: { support_escalation: true, approvals_waiting: true, daily_digest: false } }, refetch: vi.fn() }) },
  setEmailPreference: { useMutation: () => ({ mutate: state.setPref, isPending: false, error: null }) },
} } }));

describe("ProjectNotifications field-report reviews", () => {
  it("renders approved and rejected report outcomes in English", () => {
    cleanup(); state.arabic = false;
    render(<ProjectNotifications tenantId="tenant-1" />);
    expect(screen.getByText("Field report FR-001 approved")).toBeTruthy();
    expect(screen.getByText("Field report FR-002 rejected")).toBeTruthy();
  });

  it("renders approved and rejected report outcomes in Arabic", () => {
    cleanup(); state.arabic = true;
    render(<ProjectNotifications tenantId="tenant-1" />);
    expect(screen.getByText("تم اعتماد التقرير الميداني FR-001")).toBeTruthy();
    expect(screen.getByText("تم رفض التقرير الميداني FR-002")).toBeTruthy();
    state.arabic = false;
  });

  it("shows the e-mail choices, says plainly that e-mail is not switched on yet, and saves a change as that person's own choice", () => {
    cleanup(); state.arabic = false; state.setPref.mockReset();
    render(<ProjectNotifications tenantId="tenant-1" />);
    expect(screen.getByText(/E-mail notifications are not switched on yet/)).toBeTruthy();
    expect((screen.getByLabelText("Daily summary of my projects") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Daily summary of my projects"));
    expect(state.setPref).toHaveBeenCalledWith({ tenantId: "tenant-1", kind: "daily_digest", enabled: true });
    fireEvent.click(screen.getByLabelText("Support escalations"));
    expect(state.setPref).toHaveBeenLastCalledWith({ tenantId: "tenant-1", kind: "support_escalation", enabled: false });
  });
});
