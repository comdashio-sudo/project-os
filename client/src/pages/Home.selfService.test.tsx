// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const state = vi.hoisted(() => ({
  signup: vi.fn(),
  refetch: vi.fn(),
  tenantQuery: { data: [] as Array<unknown>, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() },
  signupError: null as unknown,
  role: "admin" as string,
  plansQuery: { data: [{ code: "PROJECT_STANDARD", name: "Project Standard", packageCode: "PROJECT" }] as Array<unknown> | undefined, isLoading: false, error: null as unknown, refetch: vi.fn(), isFetching: false },
  signupOptions: null as { onSuccess?: (result: { tenantId: string }) => void } | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Pilot Owner", email: "owner@example.test", role: state.role }, loading: false, isAuthenticated: true, logout: vi.fn() }),
}));
vi.mock("@/components/BrandMark", () => ({ BrandIcon: () => <span>Dashio icon</span>, BrandMark: () => <span>Dashio</span> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Safe error" }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => <select aria-label="Plan" value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: { mine: { useQuery: () => ({ ...state.tenantQuery, refetch: state.refetch }) } },
    selfService: {
      plans: { useQuery: () => state.plansQuery },
      signup: { useMutation: (options: { onSuccess?: (result: { tenantId: string }) => void }) => { state.signupOptions = options; return { mutate: state.signup, isPending: false, error: state.signupError }; } },
    },
  },
}));

afterEach(() => { cleanup(); state.signup.mockClear(); state.refetch.mockClear(); state.tenantQuery = { data: [], isLoading: false, isSuccess: true, isError: false, refetch: state.refetch }; state.signupError = null; state.role = "admin"; state.plansQuery = { data: [{ code: "PROJECT_STANDARD", name: "Project Standard", packageCode: "PROJECT" }], isLoading: false, error: null, refetch: vi.fn(), isFetching: false }; state.signupOptions = null; });

describe("Home self-service", () => {
  it("submits the server-catalog plan with company and seat boundaries", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("Legal name"), "Pilot Company");
    await user.type(screen.getByLabelText("Workspace slug"), "pilot-company");
    await user.selectOptions(screen.getByLabelText("Plan"), "PROJECT_STANDARD");
    await user.clear(screen.getByLabelText("Seats"));
    await user.type(screen.getByLabelText("Seats"), "5");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(state.signup).toHaveBeenCalledWith({ legalName: "Pilot Company", slug: "pilot-company", planCode: "PROJECT_STANDARD", seats: 5 });
  });

  // The sign-up screen once said "Loading plans…" for ever whatever had happened. Loading, failing and being empty are three different sentences now.
  it("says 'Loading plans…' only while the plans are really loading", () => {
    state.plansQuery = { ...state.plansQuery, data: undefined, isLoading: true };
    render(<Home />);
    expect(screen.getByText("Loading plans…")).toBeTruthy();
    expect(screen.queryByText("Plans could not be loaded")).toBeNull();
  });
  it("a failed plan request is a visible error with a retry, never the loading sentence", () => {
    state.plansQuery = { ...state.plansQuery, data: undefined, isLoading: false, error: new Error("boom") };
    render(<Home />);
    expect(screen.queryByText("Loading plans…")).toBeNull();
    expect(screen.getByText("Plans could not be loaded")).toBeTruthy();
    expect(screen.getByRole("alert", { name: "The plan list" })).toBeTruthy();
  });
  it("an empty catalogue says so, and tells whom to ask, instead of loading for ever", () => {
    state.plansQuery = { ...state.plansQuery, data: [], isLoading: false, error: null };
    render(<Home />);
    expect(screen.queryByText("Loading plans…")).toBeNull();
    expect(screen.getAllByText(/No plan is available yet/).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert").textContent).toMatch(/plant the plan catalogue/);
  });

  it("the platform owner sees a visible entry to the platform administration; nobody else does", () => {
    state.role = "admin";
    const { unmount } = render(<Home />);
    expect(screen.getByRole("link", { name: /Platform administration/ }).getAttribute("href")).toBe("/platform");
    unmount();
    state.role = "user";
    render(<Home />);
    expect(screen.queryByRole("link", { name: /Platform administration/ })).toBeNull();
  });

  it("registration is by invitation: a person without a company who is not the platform owner is told how to get in, and is offered no creation form", () => {
    state.role = "user";
    render(<Home />);
    expect(screen.getByText("Access is by invitation")).toBeTruthy();
    expect(screen.queryByLabelText("Legal name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
  });
  it("hides self-service creation when the current workspace query failed", () => {
    state.tenantQuery = { data: [], isLoading: false, isSuccess: false, isError: true, refetch: state.refetch };
    render(<Home />);
    expect(screen.getByText("Your current workspaces could not be loaded. The creation form is hidden to avoid creating a duplicate workspace.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
  });

  it("surfaces the localized safe signup error", () => {
    state.signupError = { data: { projectError: { code: "PROJECT_OS_WORKSPACE_SLUG_EXISTS" } } };
    render(<Home />);
    expect(screen.getByText("Safe error")).toBeTruthy();
  });

  it("confirms creation immediately with a governed project-registry route", () => {
    render(<Home />);
    act(() => state.signupOptions?.onSuccess?.({ tenantId: "00000000-0000-4000-8000-000000000123" }));
    expect(screen.getByText("The trial workspace was created. You can now open its project registry.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open project registry" }).getAttribute("href")).toBe("/projects/00000000-0000-4000-8000-000000000123");
  });
});

void React;
