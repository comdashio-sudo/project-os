/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProjectControls from "./ProjectControls";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Project controls access denied safely" }));
vi.mock("./ProjectContracts", () => ({ ProjectContracts: () => null }));
vi.mock("./ProjectDocuments", () => ({ ProjectDocuments: () => null }));
vi.mock("./ProjectRfis", () => ({ ProjectRfis: () => null }));
vi.mock("./ProjectNcrs", () => ({ ProjectNcrs: () => null }));
vi.mock("./ProjectHse", () => ({ ProjectHse: () => null }));
vi.mock("./ProjectFieldReports", () => ({ ProjectFieldReports: () => null }));
vi.mock("./ProjectQualityInspections", () => ({ ProjectQualityInspections: () => null }));
vi.mock("./ProjectPurchaseOrders", () => ({ ProjectPurchaseOrders: () => null }));
vi.mock("./ProjectChanges", () => ({ ProjectChanges: () => null }));
vi.mock("./ProjectNotifications", () => ({ ProjectNotifications: () => null }));
vi.mock("./ProjectResources", () => ({ ProjectResources: () => null }));
vi.mock("./ProjectMaterials", () => ({ ProjectMaterials: () => null }));
vi.mock("./ProjectClaims", () => ({ ProjectClaims: () => null }));
vi.mock("./ProjectAdvisor", () => ({ ProjectAdvisor: () => null }));
vi.mock("./ProjectImports", () => ({ ProjectImports: () => null }));
vi.mock("./ProjectDataExport", () => ({ ProjectDataExport: () => null }));
vi.mock("./ProjectMasterPlan", () => ({ ProjectMasterPlan: () => null }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, data: null });
  return { trpc: {
    projects: {
      getControls: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined, refetch: vi.fn() }) },
      getControlsSchedule: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined, refetch: vi.fn() }) },
      getControlsFinancials: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined, refetch: vi.fn() }) },
      getControlsPerformance: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined, refetch: vi.fn() }) },
    },
    wbs: { create: { useMutation: mutation } },
    activities: { create: { useMutation: mutation } },
    budgets: { create: { useMutation: mutation } },
    costs: { createActual: { useMutation: mutation } },
    progress: { create: { useMutation: mutation } },
    controls: { saveEvmSnapshot: { useMutation: mutation }, captureOperationalEvmSnapshot: { useMutation: mutation }, captureProjectHealthSnapshot: { useMutation: mutation } },
  } };
});

describe("ProjectControls access", () => {
  it("shows a localized denial and omits WBS and EVM controls when project scope is forbidden", () => {
    render(<ProjectControls />);
    expect(screen.getAllByText("Project controls access denied safely").length).toBeGreaterThan(0);
    expect(screen.queryByText("Project delivery board")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add WBS item" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save EVM snapshot" })).toBeNull();
  });
});
