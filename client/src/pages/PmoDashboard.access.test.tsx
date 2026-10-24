/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PmoDashboard from "./PmoDashboard";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("./PmoControlLinks", () => ({ PmoControlLinks: () => null }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "PMO access denied safely" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null });
  return {
    trpc: {
      useUtils: () => ({ dashboards: { invalidate: vi.fn() } }),
      dashboards: {
        pmoPortfolioSetup: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) },
        pmoRisks: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) },
        pmoIssues: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) },
        pmoActions: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) },
        pmoPlanning: { useQuery: () => ({ isLoading: false, error: null, data: { planningOverview: { projects: [], summary: { totalProjects: 0, criticalProjects: 0, warningProjects: 0, dataRequiredProjects: 0, delayedProjects: 0 } } } }) },
        pmoTodayExceptions: { useQuery: () => ({ isLoading: false, error: null, data: { todayExceptions: [] } }) },
      },
      pmo: {
        createRisk: { useMutation: mutation },
        createIssue: { useMutation: mutation },
        createAction: { useMutation: mutation },
        createPortfolio: { useMutation: mutation },
        createProgram: { useMutation: mutation },
        linkProject: { useMutation: mutation },
        transitionIssueEscalation: { useMutation: mutation },
        transitionActionEscalation: { useMutation: mutation },
      },
    },
  };
});

describe("PmoDashboard access", () => {
  it("shows a localized denial and omits PMO management forms when pmo.read is forbidden", () => {
    render(<PmoDashboard />);
    expect(screen.getByText("PMO access denied safely")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Create portfolio" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Register risk" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save register" })).toBeNull();
  });
});
