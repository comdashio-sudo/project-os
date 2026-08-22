// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkforce } from "./ProjectWorkforce";

const state = vi.hoisted(() => ({ isArabic: false, attendanceTransition: vi.fn(), timeTransition: vi.fn() }));
const query = (data: unknown) => ({ data, error: null, isLoading: false, refetch: vi.fn() });

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized workforce error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    assignments: {
      options: { useQuery: () => query({ employees: [{ id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", jobTitle: "Planner" }], resources: [{ id: "resource-1", resourceCode: "LAB-01", name: "Labor", unitCost: "150.00" }], wbs: [{ id: "wbs-1", code: "WBS-01", name: "Work package" }], activities: [{ id: "activity-1", wbsItemId: "wbs-1", code: "ACT-01", name: "Activity" }] }) },
      list: { useQuery: () => query([{ id: "assignment-1", employeeId: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", resourceCode: "LAB-01", plannedHours: "8.00" }]) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      timeEntries: { list: { useQuery: () => query([{ id: "time-1", assignmentId: "assignment-1", employeeId: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", workDate: new Date("2026-09-07T00:00:00Z"), actualHours: "8.00", reportedProgressPercent: "25.00", status: "submitted" }]) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, transition: { useMutation: () => ({ mutate: state.timeTransition, isPending: false, error: null }) } },
    },
    employees: { attendance: { list: { useQuery: () => query([{ id: "attendance-1", employeeId: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner", attendanceDate: new Date("2026-09-07T00:00:00Z"), attendanceStatus: "present", status: "draft" }]) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, transition: { useMutation: () => ({ mutate: state.attendanceTransition, isPending: false, error: null }) } } },
  },
}));

describe("ProjectWorkforce", () => {
  beforeEach(() => { cleanup(); state.isArabic = false; state.attendanceTransition.mockReset(); state.timeTransition.mockReset(); });

  it("renders governed workforce inputs and explicit workflow registers without exposing salary data", () => {
    render(<ProjectWorkforce tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("Workforce & assignments")).toBeTruthy();
    expect(screen.getByText("Attendance register")).toBeTruthy();
    expect(screen.getByText("Work-hours register")).toBeTruthy();
    expect(screen.getByText("No draft advances automatically; submit it, then explicitly approve or reject it.")).toBeTruthy();
    expect(screen.queryByText(/salary/i)).toBeNull();
  });

  it("submits attendance and approves time only through explicit localized actions", () => {
    render(<ProjectWorkforce tenantId="tenant-1" projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(state.attendanceTransition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", attendanceId: "attendance-1", status: "submitted" });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(state.timeTransition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", timeEntryId: "time-1", status: "approved" });
  });

  it("renders the Arabic operating labels", () => {
    state.isArabic = true;
    render(<ProjectWorkforce tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("القوى العاملة والإسناد")).toBeTruthy();
    expect(screen.getByText("سجل الحضور")).toBeTruthy();
    expect(screen.getByText("سجل ساعات العمل")).toBeTruthy();
  });
});
