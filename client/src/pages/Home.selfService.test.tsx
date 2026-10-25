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
  signupOptions: null as { onSuccess?: (result: { tenantId: string }) => void } | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Pilot Owner", email: "owner@example.test" }, loading: false, isAuthenticated: true, logout: vi.fn() }),
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
      plans: { useQuery: () => ({ data: [{ code: "PROJECT_STANDARD", name: "Project Standard", packageCode: "PROJECT" }], isLoading: false }) },
      signup: { useMutation: (options: { onSuccess?: (result: { tenantId: string }) => void }) => { state.signupOptions = options; return { mutate: state.signup, isPending: false, error: state.signupError }; } },
    },
  },
}));

afterEach(() => { cleanup(); state.signup.mockClear(); state.refetch.mockClear(); state.tenantQuery = { data: [], isLoading: false, isSuccess: true, isError: false, refetch: state.refetch }; state.signupError = null; state.signupOptions = null; });

describe("Home self-service", () => {
  it("submits the server-catalog plan with company and seat boundaries", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("Legal name"), "Pilot Company");
    expect((screen.getByLabelText("Workspace slug") as HTMLInputElement).value).toBe("pilot-company");
    await user.selectOptions(screen.getByLabelText("Plan"), "PROJECT_STANDARD");
    await user.clear(screen.getByLabelText("Seats"));
    await user.type(screen.getByLabelText("Seats"), "5");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(state.signup).toHaveBeenCalledWith({ legalName: "Pilot Company", slug: "pilot-company", planCode: "PROJECT_STANDARD", seats: 5 });
  });

  it("suggests a short name from an Arabic legal name, and stops suggesting once the person edits it", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("Legal name"), "فناء");
    expect((screen.getByLabelText("Workspace slug") as HTMLInputElement).value).toBe("fanaa");
    await user.clear(screen.getByLabelText("Workspace slug"));
    await user.type(screen.getByLabelText("Workspace slug"), "my-firm");
    await user.type(screen.getByLabelText("Legal name"), " الجديدة");
    expect((screen.getByLabelText("Workspace slug") as HTMLInputElement).value).toBe("my-firm");
  });

  it("gives the short name its rule as helper text, with no browser pattern and no browser validation on the form", () => {
    render(<Home />);
    const slug = screen.getByLabelText("Workspace slug");
    expect(screen.getByText("Lowercase English letters, digits and dashes only, for example: fanaa")).toBeTruthy();
    expect(slug.hasAttribute("pattern")).toBe(false);
    expect(slug.closest("form")?.hasAttribute("novalidate")).toBe(true);
  });

  it("names the broken rule beside the short name in the form's language and does not submit", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.selectOptions(screen.getByLabelText("Plan"), "PROJECT_STANDARD");
    await user.type(screen.getByLabelText("Legal name"), "Pilot Company");
    await user.clear(screen.getByLabelText("Workspace slug"));
    await user.type(screen.getByLabelText("Workspace slug"), "ab");
    expect(screen.getByRole("alert").textContent).toBe("The short name must be at least 3 characters.");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(state.signup).not.toHaveBeenCalled();
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
