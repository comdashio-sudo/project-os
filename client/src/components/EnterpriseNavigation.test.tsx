/** @vitest-environment jsdom */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnterpriseNavigation } from "./EnterpriseNavigation";

const state = vi.hoisted(() => ({ isArabic: false, location: "/", items: [] as Array<{ id: string; labelKey: string; href: string }> }));
const authState = vi.hoisted(() => ({ user: { id: 1, name: "Ramez", email: "ramez@example.test" }, logout: vi.fn().mockResolvedValue(undefined), loading: false }));
const notificationState = vi.hoisted(() => ({ data: [] as Array<{ id: string; notificationCode: string; acknowledgedAt: Date | null }>, refetch: vi.fn(), acknowledge: vi.fn(), isPending: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { navigation: { get: { useQuery: () => ({ data: state.items, isLoading: false, error: null }) } }, notifications: { list: { useQuery: () => ({ data: notificationState.data, isLoading: false, error: null, refetch: notificationState.refetch }) }, acknowledge: { useMutation: () => ({ mutate: notificationState.acknowledge, isPending: notificationState.isPending }) } } } }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => authState }));

describe("EnterpriseNavigation", () => {
  it("renders only server-calculated items and localizes the project context", () => {
    state.isArabic = true; state.items = [{ id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t/p/controls" }];
    render(<EnterpriseNavigation tenantId="t" projectId="p" context="project" />);
    expect(screen.getByRole("navigation", { name: "الملاحة المؤسسية" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "مساحة العمل" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "ضوابط المشروع" }).getAttribute("href")).toBe("/projects/t/p/controls"); expect(screen.queryByRole("link", { name: "PMO" })).toBeNull();
  });

  it("keeps privileged navigation hidden when a low-permission account receives no server-authorized items", () => {
    state.isArabic = false; state.items = [];
    render(<EnterpriseNavigation tenantId="t" context="administration" />);
    expect(screen.getByRole("navigation", { name: "Enterprise navigation" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Executive" })).toBeNull();
    expect(screen.queryByRole("link", { name: "PMO" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Project registry" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tenant administration" })).toBeNull();
  });

  it("invokes browser forward navigation from the localized forward control", async () => {
    document.body.innerHTML = "";
    state.isArabic = false; state.items = [];
    const forward = vi.spyOn(window.history, "forward");
    render(<EnterpriseNavigation tenantId="t" context="administration" />);
    await userEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(forward).toHaveBeenCalledTimes(1);
    forward.mockRestore();
  });

  it("shows the authenticated user menu and delegates sign-out to the shared auth action", async () => {
    document.body.innerHTML = "";
    state.isArabic = false; state.items = []; authState.logout.mockClear();
    render(<EnterpriseNavigation tenantId="t" context="administration" />);
    await userEvent.click(screen.getByText("Ramez"));
    expect(screen.getByText("ramez@example.test")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it("shows only the recipient's unread notification in the menu and acknowledges it through tRPC", async () => {
    document.body.innerHTML = "";
    state.isArabic = false; state.items = []; notificationState.acknowledge.mockClear(); notificationState.data = [{ id: "notification-1", notificationCode: "PROJECT_HEALTH_EXCEPTION", acknowledgedAt: null }];
    render(<EnterpriseNavigation tenantId="t" context="project" />);
    await userEvent.click(screen.getByLabelText("Notifications (1)"));
    expect(screen.getByText("Project health needs attention")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(notificationState.acknowledge).toHaveBeenCalledWith({ tenantId: "t", notificationId: "notification-1" });
  });

  it("offers a labelled, keyboard-reachable sequence for server-authorized enterprise links", async () => {
    const user = userEvent.setup();
    document.body.innerHTML = "";
    state.isArabic = false; notificationState.data = [];
    state.items = [
      { id: "executive", labelKey: "navigation.executiveDashboard", href: "/executive/t" },
      { id: "pmo", labelKey: "navigation.pmoDashboard", href: "/pmo/t" },
      { id: "projects", labelKey: "navigation.projectRegistry", href: "/projects/t" },
    ];
    render(<EnterpriseNavigation tenantId="t" context="project" />);
    expect(screen.getByRole("navigation", { name: "Enterprise navigation" })).toBeTruthy();
    const back = screen.getByRole("button", { name: "Back" });
    const forward = screen.getByRole("button", { name: "Forward" });
    const workspace = screen.getByRole("link", { name: "Workspace" });
    const notificationMenu = screen.getByLabelText("Notifications");
    const userMenu = screen.getByLabelText("User menu");
    const navigationToggle = screen.getByRole("button", { name: "Open navigation" });
    const executive = screen.getByRole("link", { name: "Executive" });
    const pmo = screen.getByRole("link", { name: "PMO" });
    const projects = screen.getByRole("link", { name: "Project registry" });
    await user.tab();
    expect(document.activeElement).toBe(back);
    await user.tab();
    expect(document.activeElement).toBe(forward);
    await user.tab();
    expect(document.activeElement).toBe(workspace);
    await user.tab();
    expect(document.activeElement).toBe(notificationMenu);
    await user.tab();
    expect(document.activeElement).toBe(userMenu);
    await user.tab();
    expect(document.activeElement).toBe(navigationToggle);
    await user.tab();
    expect(document.activeElement).toBe(executive);
    await user.tab();
    expect(document.activeElement).toBe(pmo);
    await user.tab();
    expect(document.activeElement).toBe(projects);
  });

  it("opens a searchable sidebar that filters only server-authorized modules", async () => {
    const user = userEvent.setup();
    document.body.innerHTML = "";
    state.isArabic = false; notificationState.data = [];
    state.items = [
      { id: "executive", labelKey: "navigation.executiveDashboard", href: "/executive/t" },
      { id: "projects", labelKey: "navigation.projectRegistry", href: "/projects/t" },
    ];
    render(<EnterpriseNavigation tenantId="t" context="administration" />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const sidebar = screen.getByRole("complementary", { name: "Module navigation" });
    expect(within(sidebar).getByRole("link", { name: "Executive" })).toBeTruthy();
    expect(within(sidebar).getByRole("link", { name: "Project registry" })).toBeTruthy();
    await user.type(within(sidebar).getByRole("textbox", { name: "Search authorized modules" }), "project");
    expect(within(sidebar).queryByRole("link", { name: "Executive" })).toBeNull();
    expect(within(sidebar).getByRole("link", { name: "Project registry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "PMO" })).toBeNull();
  });
});
