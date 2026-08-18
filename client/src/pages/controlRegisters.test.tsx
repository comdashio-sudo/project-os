import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ExecutiveDashboard from "./ExecutiveDashboard";
import PmoDashboard from "./PmoDashboard";

const state = vi.hoisted(() => ({
  isArabic: false,
  executiveMutationPending: false,
  pmoData: {
    portfolios: [],
    programs: [],
    projects: [{ id: "project-1", code: "PRJ-01", name: "North Link" }],
    risks: [],
    issues: [],
    actions: [
      { id: "action-open", projectId: "project-1", title: "Mitigate access constraint", priority: "high", status: "in_progress", dueAt: null },
      { id: "action-done", projectId: "project-1", title: "Closed action", priority: "low", status: "completed", dueAt: null },
    ],
  },
  executiveData: {
    totals: { budget: 0, actual: 0, forecast: 0 },
    projects: [] as Array<{ id: string; code: string; name: string; status: string; forecastCost: number; health: { status: string } | null }> ,
    decisions: [],
  },
}));

vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <span>Language toggle</span> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("wouter", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useParams: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboards: {
        pmo: { invalidate: vi.fn() },
        executive: { invalidate: vi.fn() },
      },
    }),
    dashboards: {
      pmo: { useQuery: () => ({ isLoading: false, error: null, data: state.pmoData }) },
      executive: { useQuery: () => ({ isLoading: false, error: null, data: state.executiveData }) },
    },
    pmo: {
      createRisk: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
      createIssue: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
      createAction: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
    },
    executive: {
      createDecision: { useMutation: () => ({ mutate: vi.fn(), isPending: state.executiveMutationPending, error: null, isSuccess: false }) },
    },
  },
}));

describe("control-register dashboards", () => {
  it("يعرض نموذج إجراء PMO وسجل الإجراءات المفتوحة باللغة الإنجليزية فقط", () => {
    state.isArabic = false;
    const markup = renderToStaticMarkup(<PmoDashboard />);

    expect(markup).toContain("Register action");
    expect(markup).toContain("Action title");
    expect(markup).toContain("Open actions");
    expect(markup).toContain("Mitigate access constraint · High");
    expect(markup).not.toContain("Closed action");
  });

  it("يعرض نصوص نموذج الإجراء والأولوية باللغة العربية", () => {
    state.isArabic = true;
    const markup = renderToStaticMarkup(<PmoDashboard />);

    expect(markup).toContain("تسجيل إجراء");
    expect(markup).toContain("عنوان الإجراء");
    expect(markup).toContain("الإجراءات المفتوحة");
    expect(markup).toContain("Mitigate access constraint · مرتفعة");
  });

  it("يعرض إرشاد غياب المشروع وحالة الحفظ المتخصصة للقرار التنفيذي", () => {
    state.isArabic = false;
    state.executiveData.projects = [];
    state.executiveMutationPending = true;
    const markup = renderToStaticMarkup(<ExecutiveDashboard />);

    expect(markup).toContain("Create a project in your scope first so the decision can be linked to a specific project record.");
    expect(markup).toContain("Saving decision draft…");
  });
});
