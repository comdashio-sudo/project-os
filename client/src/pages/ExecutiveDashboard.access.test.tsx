/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExecutiveDashboard from "./ExecutiveDashboard";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("./PortfolioCashFlowChart", () => ({ default: () => <div>Cash chart</div> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Access denied safely" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ dashboards: { executive: { invalidate: vi.fn() } } }),
    dashboards: { executive: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) } },
    executive: { createDecision: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
  },
}));

describe("ExecutiveDashboard access", () => {
  it("shows a localized denial and omits executive controls when executive data is forbidden", () => {
    render(<ExecutiveDashboard />);
    expect(screen.getByText("Access denied safely")).toBeTruthy();
    expect(screen.queryByText("Leadership view")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save decision draft" })).toBeNull();
  });
});
