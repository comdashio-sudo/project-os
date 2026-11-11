// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupWizard from "./SetupWizard";
import { TYPING_TEST } from "@/test/typing";

const hoisted = vi.hoisted(() => {
  const state = { arabic: true, tenantId: "" as string, tenants: [] as Array<Record<string, unknown>>, projects: [] as Array<Record<string, unknown>>, calls: {} as Record<string, ReturnType<typeof vi.fn>>, navigated: [] as string[] };
  const mutation = (name: string, result: unknown = {}) => ({ useMutation: (options?: { onSuccess?: (r: unknown) => void }) => ({ mutate: (input: unknown) => { (state.calls[name] ??= vi.fn())(input); void options?.onSuccess?.(result); }, isPending: false, error: null }) });
  return { state, mutation };
});
const { state } = hoisted;
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => (state.tenantId ? { tenantId: state.tenantId } : {}), useLocation: () => ["/", (to: string) => { state.navigated.push(to); }] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized" }));
vi.mock("./ProjectImports", () => ({ ProjectImports: ({ projectId }: { projectId: string }) => <div data-testid="imports">imports {projectId}</div> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ tenant: { mine: { invalidate: vi.fn() } } }),
    tenant: {
      mine: { useQuery: () => ({ data: state.tenants, isLoading: false, error: null }) },
      administration: { useQuery: () => ({ data: { roles: [{ id: "r-owner", code: "TENANT_OWNER", name: "Owner", systemManaged: true }, { id: "r-cc", code: "COST_CONTROLLER", name: "Cost control", systemManaged: true }, { id: "r-pm", code: "PROJECT_MANAGER", name: "PM", systemManaged: true }] }, isLoading: false, error: null }) },
      createInvitation: hoisted.mutation("createInvitation", { inviteToken: "tok-123" }),
    },
    selfService: { plans: { useQuery: () => ({ data: [{ code: "starter", name: "Starter", packageCode: "PKG" }], isLoading: false, error: null }) }, signup: hoisted.mutation("signup", { tenantId: "11111111-1111-4111-8111-111111111111" }) },
    projects: { list: { useQuery: () => ({ data: state.projects, isLoading: false, error: null, refetch: vi.fn() }) }, create: hoisted.mutation("createProject", { id: "p-new" }) },
  },
}));

describe("SetupWizard", TYPING_TEST, () => {
  beforeEach(() => { state.arabic = true; state.tenantId = ""; state.tenants = []; state.projects = []; state.calls = {}; state.navigated = []; window.history.replaceState(null, "", "/"); });
  afterEach(cleanup);

  it("step 1 creates the company with the plan and seats, then moves to the project step", async () => {
    const user = userEvent.setup(); render(<SetupWizard />);
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true); // nothing to go on to before there is a company
    await user.type(screen.getByLabelText("الاسم القانوني"), "شركة الاختبار");
    await user.type(screen.getByLabelText(/المعرّف/), "test-co");
    await user.selectOptions(screen.getByLabelText("الخطة"), "starter");
    await user.click(screen.getByRole("button", { name: "إنشاء الشركة" }));
    expect(state.calls.signup).toHaveBeenCalledWith({ legalName: "شركة الاختبار", slug: "test-co", planCode: "starter", seats: 5 });
    expect(state.navigated).toEqual(["/setup/11111111-1111-4111-8111-111111111111#project"]);
  });

  it("step 2 creates the first project inside the chosen company and offers existing ones", async () => {
    state.tenantId = "t1"; state.tenants = [{ tenantId: "t1", legalName: "شركة" }]; state.projects = [{ id: "p1", code: "P-1", name: "مشروع قائم" }];
    window.history.replaceState(null, "", "/#project");
    const user = userEvent.setup(); render(<SetupWizard />);
    expect(screen.getByText("مشروع قائم")).toBeTruthy();
    await user.type(screen.getByLabelText("رمز المشروع"), "P-2");
    await user.type(screen.getByLabelText("اسم المشروع"), "مشروع جديد");
    await user.click(screen.getByRole("button", { name: "إنشاء المشروع" }));
    expect(state.calls.createProject).toHaveBeenCalledWith({ tenantId: "t1", code: "P-2", name: "مشروع جديد", projectType: "إنشاءات", currency: "SAR" });
  });

  it("step 2 names a missing project code beside its field in the screen's language, and creates nothing", async () => {
    state.tenantId = "t1"; state.tenants = [{ tenantId: "t1", legalName: "شركة" }]; state.projects = [];
    window.history.replaceState(null, "", "/#project");
    const user = userEvent.setup(); render(<SetupWizard />);
    await user.type(screen.getByLabelText("اسم المشروع"), "مشروع جديد");
    await user.click(screen.getByRole("button", { name: "إنشاء المشروع" }));
    expect(screen.getByText("هذا الحقل مطلوب.")).toBeTruthy();
    expect(state.calls.createProject).toBeUndefined();
  });

  it("step 3 asks for a project first, then shows the importer for it (Excel and XER live inside it)", async () => {
    state.tenantId = "t1"; state.tenants = [{ tenantId: "t1", legalName: "شركة" }];
    window.history.replaceState(null, "", "/#import");
    const first = render(<SetupWizard />);
    expect(screen.getByRole("status").textContent).toContain("اختر المشروع");
    expect(screen.queryByTestId("imports")).toBeNull();
    first.unmount(); cleanup();
    state.projects = [{ id: "p1", code: "P-1", name: "مشروع" }];
    render(<SetupWizard />);
    expect(screen.getByTestId("imports").textContent).toBe("imports p1");
    expect(screen.getByRole("button", { name: "تخطَّ هذه الخطوة الآن" })).toBeTruthy();
  });

  it("step 4 lists the ready roles without the owner role, explains the boundary, and invites at project scope by default", async () => {
    state.tenantId = "t1"; state.tenants = [{ tenantId: "t1", legalName: "شركة" }]; state.projects = [{ id: "p1", code: "P-1", name: "مشروع" }];
    window.history.replaceState(null, "", "/#invite");
    const user = userEvent.setup(); render(<SetupWizard />);
    const role = screen.getByLabelText("الدور") as HTMLSelectElement;
    expect(Array.from(role.options).map(option => option.value)).toEqual(["", "r-cc", "r-pm"]); // the owner role is never offered here
    await user.selectOptions(role, "r-cc");
    expect(screen.getByText("الحدود")).toBeTruthy();
    await user.type(screen.getByLabelText("بريد المدعو"), "new.user@example.test");
    await user.click(screen.getByRole("button", { name: "إنشاء الدعوة" }));
    expect(state.calls.createInvitation).toHaveBeenCalledWith({ tenantId: "t1", email: "new.user@example.test", roleId: "r-cc", scopeType: "project", scopeId: "p1" });
    expect(screen.getByText(/\/invite\/accept\?token=tok-123/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "إنهاء الإعداد والانتقال إلى المشروع" }).getAttribute("href")).toBe("/projects/t1/p1/controls");
  });

  it("company-wide scope is a deliberate choice, and English renders the same flow", async () => {
    state.arabic = false; state.tenantId = "t1"; state.tenants = [{ tenantId: "t1", legalName: "Co" }]; state.projects = [{ id: "p1", code: "P-1", name: "Proj" }];
    window.history.replaceState(null, "", "/#invite");
    const user = userEvent.setup(); render(<SetupWizard />);
    await user.selectOptions(screen.getByLabelText("Role"), "r-pm");
    await user.selectOptions(screen.getByLabelText("Invitation scope"), "company");
    await user.type(screen.getByLabelText("Invitee e-mail"), "a.b@example.test");
    await user.click(screen.getByRole("button", { name: "Create the invitation" }));
    expect(state.calls.createInvitation).toHaveBeenCalledWith({ tenantId: "t1", email: "a.b@example.test", roleId: "r-pm", scopeType: "company", scopeId: undefined });
  });
});
