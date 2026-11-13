// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupWizard from "./SetupWizard";

// D-28 (G-169): every failure in the setup wizard has a translated «Try again», and its two empty states name the next step.
const state = vi.hoisted(() => ({
  errors: {} as Record<string, unknown>, variables: {} as Record<string, unknown>, calls: {} as Record<string, unknown[]>,
  projects: [] as Array<Record<string, unknown>>, projectsError: null as unknown, roles: [] as Array<Record<string, unknown>>, adminError: null as unknown, refetched: [] as string[],
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t1" }), useLocation: () => ["/", () => undefined] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true, language: "ar", isRtl: true }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "تعذّر الاتصال بالخادم" }));
vi.mock("./ProjectImports", () => ({ ProjectImports: () => null }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string) => ({ useMutation: () => ({ mutate: (input: unknown) => { (state.calls[name] ??= []).push(input); }, isPending: false, error: state.errors[name] ?? null, variables: state.variables[name] }) });
  return {
  trpc: {
    useUtils: () => ({ tenant: { mine: { invalidate: vi.fn() } } }),
    tenant: {
      mine: { useQuery: () => ({ data: [{ tenantId: "t1", legalName: "شركة" }], isLoading: false, error: null }) },
      administration: { useQuery: () => ({ data: state.adminError ? undefined : { roles: state.roles }, isLoading: false, isFetching: false, error: state.adminError, refetch: () => { state.refetched.push("admin"); } }) },
      createInvitation: mutation("invite"),
    },
    selfService: { plans: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, signup: mutation("signup") },
    projects: { list: { useQuery: () => ({ data: state.projectsError ? undefined : state.projects, isLoading: false, error: state.projectsError, refetch: () => { state.refetched.push("projects"); } }) }, create: mutation("create") },
  },
  };
});

const at = (step: string) => { window.history.replaceState(null, "", `/#${step}`); return render(<SetupWizard />); };
beforeEach(() => { state.errors = {}; state.variables = {}; state.calls = {}; state.projects = []; state.projectsError = null; state.roles = [{ id: "r-cc", code: "COST_CONTROLLER", name: "Cost control", systemManaged: true }]; state.adminError = null; state.refetched = []; });
afterEach(cleanup);

describe("setup wizard: failures can be retried, empty steps say what to do (D-28, G-169)", () => {
  it("a failed project creation shows the reason and «أعد المحاولة» sends the same project again", async () => {
    const sent = { tenantId: "t1", code: "P-9", name: "مشروع", projectType: "إنشاءات", currency: "SAR" };
    state.errors.create = new Error("PROJECT_OS_NETWORK"); state.variables.create = sent; state.projects = [{ id: "p1", code: "P-1", name: "قائم" }];
    at("project");
    expect(screen.getByRole("alert").textContent).toContain("تعذّر الاتصال بالخادم");
    await userEvent.setup().click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(state.calls.create).toEqual([sent]);
  });

  it("a failed invitation is re-sent with the same e-mail, role and scope", async () => {
    const sent = { tenantId: "t1", email: "x@example.test", roleId: "r-cc", scopeType: "project", scopeId: "p1" };
    state.errors.invite = new Error("PROJECT_OS_NETWORK"); state.variables.invite = sent; state.projects = [{ id: "p1", code: "P-1", name: "قائم" }];
    at("invite");
    await userEvent.setup().click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(state.calls.invite).toEqual([sent]);
  });

  it("a failed role list is fetched again from its «أعد المحاولة»; an empty one offers to reload the ready-made roles", async () => {
    state.projects = [{ id: "p1", code: "P-1", name: "قائم" }]; state.adminError = new Error("PROJECT_OS_NETWORK");
    const first = at("invite");
    await userEvent.setup().click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(state.refetched).toEqual(["admin"]);
    first.unmount();
    state.adminError = null; state.roles = []; state.refetched = [];
    at("invite");
    await userEvent.setup().click(screen.getByRole("button", { name: "إعادة تحميل الأدوار الجاهزة" }));
    expect(state.refetched).toEqual(["admin"]);
  });

  it("no project yet: the line has a button that takes the person to the project form", async () => {
    at("project");
    const empty = document.querySelector('[data-empty="projects"]')!;
    expect(empty.textContent).toContain("ابدأ بإنشاء المشروع الأول");
    await userEvent.setup().click(screen.getByRole("button", { name: "ابدأ بإنشاء المشروع الأول" }));
    expect(document.activeElement?.id).toBe("setup-code");
  });

  it("NEGATIVE: a project list that failed to load does not also claim «no project yet»; no error, no retry button", () => {
    state.projectsError = new Error("PROJECT_OS_NETWORK");
    at("project");
    expect(document.querySelector('[data-empty="projects"]')).toBeNull();
    cleanup();
    state.projectsError = null; state.projects = [{ id: "p1", code: "P-1", name: "قائم" }];
    at("project");
    expect(screen.queryByRole("button", { name: "أعد المحاولة" })).toBeNull();
    expect(document.querySelector('[data-empty="projects"]')).toBeNull();
  });
});
