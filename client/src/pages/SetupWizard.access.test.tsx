/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import SetupWizard from "./SetupWizard";

// Creating the first project is projects.create on the server, which asks for project.write (server/db.ts createProjectForTenant).
const state = vi.hoisted(() => ({ permission: { data: undefined as unknown, error: null as unknown, isLoading: false } }));
const TENANT = "11111111-1111-4111-8111-111111111111";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  useLocation: () => ["/setup", vi.fn()],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Setup error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null, isSuccess: false, data: undefined });
  const query = (data: unknown) => ({ data, error: null, isLoading: false, isFetching: false, refetch: vi.fn() });
  return { trpc: {
    accessSummary: { mine: { useQuery: () => state.permission } },
    useUtils: () => ({ tenant: { mine: { invalidate: vi.fn() }, administration: { invalidate: vi.fn() } } }),
    tenant: {
      mine: { useQuery: () => query([]) },
      administration: { useQuery: () => query(undefined) },
      createInvitation: { useMutation: mutation },
    },
    projects: {
      list: { useQuery: () => query([]) },
      create: { useMutation: mutation },
    },
    selfService: {
      plans: { useQuery: () => query([]) },
      signup: { useMutation: mutation },
    },
  } };
});

const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["PROJECT"], permissions: ["project.write"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const page = () => <PermissionProvider tenantId={TENANT}><SetupWizard /></PermissionProvider>;

describe("SetupWizard first-project form follows project.write", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#project");
    state.permission = { data: undefined, error: null, isLoading: false };
  });
  afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

  it("a person who may write projects sees the project form", () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    render(page());
    expect(screen.getByLabelText("Project code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create the project" })).toBeTruthy();
  });

  it("a person with only project.manage (not project.write) does not see the project form", () => {
    state.permission = { data: summary({ permissions: ["project.manage"] }), error: null, isLoading: false };
    render(page());
    expect(screen.queryByLabelText("Project code")).toBeNull();
    expect(screen.getByRole("note").textContent).toBe("You do not have permission to create projects.");
  });

  it("while the permission answer is loading the form is not drawn and no refusal line flashes", () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(page());
    expect(screen.queryByLabelText("Project code")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("when the permission lookup fails the form stays, and the server refuses what it must", () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    render(page());
    expect(screen.getByLabelText("Project code")).toBeTruthy();
  });
});
