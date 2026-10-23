/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectRegistry from "./ProjectRegistry";

// The project registry (/projects/:tenantId): an empty registry names the next action (the creation form beside it), a refused read
// gives the server's sentence instead of loading forever (G-161), and a failed read offers a retry.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };

const state = vi.hoisted(() => ({ projects: { isLoading: false, isFetching: false, error: null as unknown, data: [] as unknown[] | undefined, refetch: vi.fn() } }));

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    projects: {
      list: { useQuery: () => state.projects },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      transitionLifecycle: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

beforeEach(() => {
  state.projects = { isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() };
});

describe("ProjectRegistry screen states", () => {
  afterEach(cleanup);

  it("an empty registry names the next action: a link to the creation form", () => {
    render(<ProjectRegistry />);
    expect(screen.getByText("No projects have been created for this tenant.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the new project form" }).getAttribute("href")).toBe("#project-create");
  });

  it("a refused read shows the server's sentence, no form and no loading line", () => {
    state.projects = { ...state.projects, error: forbidden, data: undefined };
    render(<ProjectRegistry />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByText("Loading projects…")).toBeNull();
    expect(screen.queryByLabelText("Project code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a failed read offers a retry that refetches the registry", () => {
    state.projects = { ...state.projects, error: { message: "network down" }, data: undefined };
    render(<ProjectRegistry />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.projects.refetch).toHaveBeenCalledTimes(1);
  });

  it("while the registry loads, it says so", () => {
    state.projects = { ...state.projects, isLoading: true, data: undefined };
    render(<ProjectRegistry />);
    expect(screen.getByText("Loading projects…")).toBeTruthy();
  });
});
