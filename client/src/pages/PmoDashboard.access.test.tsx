/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PmoDashboard from "./PmoDashboard";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("./PmoControlLinks", () => ({ PmoControlLinks: () => null }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "PMO access denied safely" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null });
  return {
    trpc: {
      useUtils: () => ({ dashboards: { pmo: { invalidate: vi.fn() } } }),
      dashboards: { pmo: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) } },
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
