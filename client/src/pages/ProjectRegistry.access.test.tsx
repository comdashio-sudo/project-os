/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProjectRegistry from "./ProjectRegistry";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Project registry access denied safely" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    projects: {
      list: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined, refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      transitionLifecycle: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

describe("ProjectRegistry access", () => {
  it("shows a localized denial and omits project creation and lifecycle controls when project scope is forbidden", () => {
    render(<ProjectRegistry />);
    expect(screen.getByText("Project registry access denied safely")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Create project" })).toBeNull();
    expect(screen.queryByLabelText("Project code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create project" })).toBeNull();
    expect(screen.queryByText("Lifecycle")).toBeNull();
    expect(screen.queryByRole("button", { name: "Update stage" })).toBeNull();
  });
});
