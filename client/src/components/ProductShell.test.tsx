// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProductShell, isFramedPath, projectSwitchHref } from "./ProductShell";
import { PageHeader, PageMain } from "./pageFrame";
import { LanguageToggle } from "./LanguageToggle";
import { PermissionProvider } from "@/lib/permissions";

// One frame for every company screen (work order 21, step 1): one top bar, the modules the server allows, one breadcrumb trail.
const state = vi.hoisted(() => ({ listOptions: [] as Array<{ enabled?: boolean } | undefined>, summary: undefined as unknown, setLocation: vi.fn(), location: "/pmo/t1", projects: [] as Array<{ id: string; code: string; name: string }>, nav: [{ id: "executive", labelKey: "navigation.executiveDashboard", href: "/executive/t1" }, { id: "pmo", labelKey: "navigation.pmoDashboard", href: "/pmo/t1" }] as Array<{ id: string; labelKey: string; href?: string; group?: string }> }));

vi.mock("wouter", () => ({ useLocation: () => [state.location, state.setLocation] }));
vi.mock("@/contexts/accountLanguage", () => ({ useAccountLanguage: () => ({ signedIn: true, save: vi.fn() }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Pilot Owner", email: "owner@example.test" }, logout: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    navigation: { get: { useQuery: () => ({ data: state.nav }) } },
    tenant: { mine: { useQuery: () => ({ data: [{ tenantId: "t1", legalName: "Pilot Company" }] }) } },
    projects: { list: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => { state.listOptions.push(options); return options?.enabled === false ? { data: undefined, error: null } : { data: state.projects, error: null }; } } },
    accessSummary: { mine: { useQuery: () => ({ data: state.summary, error: null }) } },
  },
}));

beforeAll(() => {
  // Radix Select uses pointer and scroll APIs jsdom lacks (same as components/ds/ds.test.tsx)
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); state.listOptions = []; state.summary = undefined; state.location = "/pmo/t1"; state.projects = []; state.setLocation.mockReset(); });

describe("ProductShell", () => {
  it("draws one top bar and the modules the server allows, and marks the current one", () => {
    render(<ProductShell tenantId="t1"><p>screen</p></ProductShell>);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(navigation).getByRole("link", { name: "Executive management" }).getAttribute("href")).toBe("/executive/t1");
    expect(within(navigation).getByRole("link", { name: "PMO" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("screen")).toBeTruthy();
  });

  it("does not repeat the old per-page module bar", () => {
    render(<ProductShell tenantId="t1"><p>screen</p></ProductShell>);
    expect(screen.queryByRole("navigation", { name: "Enterprise navigation" })).toBeNull();
  });

  it("a page inside the frame keeps one banner, one main and one language switch (review of #156, item 2)", () => {
    render(<ProductShell tenantId="t1"><PageMain><PageHeader><LanguageToggle /><span>page actions</span></PageHeader><p>screen</p></PageMain></ProductShell>);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Interface language" })).toBeNull();
    expect(screen.getByText("page actions")).toBeTruthy();
  });

  it("the same page alone keeps its own landmarks and language switch", () => {
    render(<PageMain><PageHeader><LanguageToggle /></PageHeader></PageMain>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Interface language" })).toBeTruthy();
  });

  it("gives each module its own icon", () => {
    state.nav = [{ id: "executive-dashboard", labelKey: "navigation.executiveDashboard", href: "/executive/t1" }, { id: "pmo-dashboard", labelKey: "navigation.pmoDashboard", href: "/pmo/t1" }, { id: "project-registry", labelKey: "navigation.projectRegistry", href: "/projects/t1" }];
    render(<ProductShell tenantId="t1"><p>screen</p></ProductShell>);
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    const icons = within(navigation).getAllByRole("link").map(link => link.querySelector("svg")?.getAttribute("class") ?? "");
    expect(new Set(icons).size).toBe(3);
  });
});

describe("project page in the frame", () => {
  it("names the project in the breadcrumb and marks Project controls, not the registry, as the current module", () => {
    state.location = "/projects/t1/p1/controls";
    state.projects = [{ id: "p1", code: "P-1", name: "One" }];
    state.nav = [{ id: "project-registry", labelKey: "navigation.projectRegistry", href: "/projects/t1" }, { id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls" }];
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    const projectCrumb = within(crumbs).getByRole("link", { name: "P-1 · One" });
    expect(projectCrumb.getAttribute("href")).toBe("/projects/t1/p1/controls");
    expect(projectCrumb.className).toContain("min-h-11");
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(navigation).getByRole("link", { name: "Project board" }).getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getByRole("link", { name: "Project registry" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("current module on a project page", () => {
  const projectNav = [{ id: "project-registry", labelKey: "navigation.projectRegistry", href: "/projects/t1" }, { id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls" }, { id: "my-performance", labelKey: "navigation.myPerformance", href: "/projects/t1/p1/my-performance" }];
  const current = () => within(screen.getByRole("navigation", { name: "Main navigation" })).getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page").map(link => link.textContent);

  it("my-performance keeps its own module: My indicators is current and ends the breadcrumb, not Project controls", () => {
    state.location = "/projects/t1/p1/my-performance";
    state.projects = [{ id: "p1", code: "P-1", name: "One" }];
    state.nav = projectNav;
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    expect(current()).toEqual(["My indicators"]);
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("listitem");
    expect(crumbs[crumbs.length - 1].textContent).toBe("My indicators");
  });

  it("a project page with no module of its own (quality) falls back to Project controls, not the registry", () => {
    state.location = "/projects/t1/p1/quality";
    state.nav = projectNav;
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    expect(current()).toEqual(["Project board"]);
  });

  it("project p1 is not on the page of project p10 (the prefix ends in a slash)", () => {
    state.location = "/projects/t1/p10/quality";
    state.nav = projectNav;
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    expect(current()).toEqual(["Project registry"]);
  });
});

describe("project switcher", () => {
  it("opens a page that exists: from a company page it goes to the chosen project's controls", () => {
    expect(projectSwitchHref("/pmo/t1", "t1", undefined, "p2")).toBe("/projects/t1/p2/controls");
  });

  it("keeps the same screen of the other project when the address names the current one", () => {
    expect(projectSwitchHref("/projects/t1/p1/quality", "t1", "p1", "p2")).toBe("/projects/t1/p2/quality");
    expect(projectSwitchHref("/projects/t1/p1/controls?view=pmc", "t1", "p1", "p2")).toBe("/projects/t1/p2/controls");
    expect(projectSwitchHref("/levels/t1/projects/p1/warehouse", "t1", "p1", "p2")).toBe("/levels/t1/projects/p2/warehouse");
  });

  it("never stops at /projects/:tenantId/:projectId (no such route)", () => {
    for (const [location, current] of [["/projects/t1", undefined], ["/executive/t1", undefined], ["/projects/t1/p1/guide", "p1"]] as const) {
      expect(projectSwitchHref(location, "t1", current, "p2")).not.toMatch(/^\/projects\/t1\/p2$/);
    }
  });

  it("choosing a project in the frame navigates to the computed address", async () => {
    state.location = "/projects/t1/p1/quality";
    state.projects = [{ id: "p1", code: "P-1", name: "One" }, { id: "p2", code: "P-2", name: "Two" }];
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const trigger = screen.getAllByRole("combobox", { name: "Project" })[0];
    await act(async () => { fireEvent.keyDown(trigger, { key: "ArrowDown" }); });
    const option = await screen.findByRole("option", { name: "P-2 · Two" });
    await act(async () => { fireEvent.click(option); });
    expect(state.setLocation).toHaveBeenCalledWith("/projects/t1/p2/quality");
  });
});

describe("which routes are framed", () => {
  it("frames the company screens", () => {
    for (const path of ["/pmo/t1", "/projects/t1", "/projects/t1/p1/controls", "/levels/t1/projects/p1", "/tenants/t1/administration"]) expect(isFramedPath(path)).toBe(true);
  });
  it("leaves the phone screens and the setup wizard unframed", () => {
    for (const path of ["/m/t1/p1", "/m/t1/p1/issue", "/m/t1/p1/unit/12", "/setup/t1", "/setup"]) expect(isFramedPath(path)).toBe(false);
  });

  it("Q-34: the project register is asked for only by who holds project.read — a planning engineer scoped to a project gets no «could not load: project list» above every page", () => {
    state.summary = { member: true, products: ["PROJECT"], permissions: ["project.schedule.manage", "project.pmc.manage"], scopes: [{ scopeType: "project", scopeId: "p1" }] };
    state.location = "/planner/t1";
    render(<PermissionProvider tenantId="t1"><ProductShell tenantId="t1"><p>screen</p></ProductShell></PermissionProvider>);
    expect(state.listOptions.every(options => options?.enabled === false)).toBe(true);
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });

  it("Q-34: with project.read (or no permission answer at all) the register is still asked for", () => {
    state.summary = { member: true, products: ["PROJECT"], permissions: ["project.read"], scopes: [{ scopeType: "company", scopeId: null }] };
    render(<PermissionProvider tenantId="t1"><ProductShell tenantId="t1"><p>screen</p></ProductShell></PermissionProvider>);
    expect(state.listOptions.at(-1)?.enabled).toBe(true);
    cleanup(); state.listOptions = [];
    render(<ProductShell tenantId="t1"><p>screen</p></ProductShell>);
    expect(state.listOptions.at(-1)?.enabled).toBe(true);
  });

  it("Q-36: a project sub-page names itself in the breadcrumb — workspace › project › Project board › Project team", () => {
    state.projects = [{ id: "p1", code: "VIL-1", name: "Villas" }];
    state.location = "/projects/t1/p1/team";
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getByText("Project team")).toBeTruthy();
    expect(within(trail).getByRole("link", { name: "Project board" }).getAttribute("href")).toBe("/projects/t1/p1/controls");
  });

  it("Q-36: the board itself ends the trail as «Project board», once", () => {
    state.projects = [{ id: "p1", code: "VIL-1", name: "Villas" }];
    state.location = "/projects/t1/p1/controls";
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getAllByText("Project board")).toHaveLength(1);
  });

  it("Q-36 (step 2): the menu draws the project's group first, titled with the project, then the company's", () => {
    state.projects = [{ id: "p1", code: "VIL-1", name: "Villas" }];
    state.location = "/projects/t1/p1/controls";
    state.nav = [{ id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls", group: "project" }, { id: "project-team", labelKey: "navigation.projectTeam", href: "/projects/t1/p1/team", group: "project" }, { id: "project-registry", labelKey: "navigation.projectRegistry", href: "/projects/t1", group: "company" }];
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    const headings = Array.from(navigation.querySelectorAll("[data-nav-group]")).map(node => node.textContent);
    expect(headings).toEqual(["Project: VIL-1 · Villas", "Company"]);
    expect(within(navigation).getByRole("link", { name: "Project team" }).getAttribute("href")).toBe("/projects/t1/p1/team");
  });
});


describe("Q-59 (1): the project's items in sections that fold", () => {
  const navItems = [
    { id: "project-controls", level: "PROJECT", group: "project", section: "overview", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls" },
    { id: "project-daily-report", level: "PROJECT", group: "project", section: "site", labelKey: "page.dailyReport", href: "/m/t1/p1/report" },
    { id: "project-stalled", level: "PROJECT", group: "project", section: "site", labelKey: "page.stalled", href: "/projects/t1/p1/stalled" },
    { id: "project-pmc", level: "PROJECT", group: "project", section: "planning", labelKey: "page.pmc", href: "/projects/t1/p1/pmc" },
  ];
  afterEach(() => { try { window.localStorage.clear(); } catch { /* none */ } });

  it("POSITIVE: each section has a title button; folding hides its items, is remembered, and the section of the open page never folds", () => {
    state.nav = navItems as never; state.location = "/projects/t1/p1/pmc";
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(navigation).getByRole("link", { name: "Daily report" }).getAttribute("href")).toBe("/m/t1/p1/report");
    const site = navigation.querySelector('[data-nav-section="site"]') as HTMLButtonElement;
    expect(site.textContent).toContain("Daily site");
    fireEvent.click(site);
    expect(site.getAttribute("aria-expanded")).toBe("false");
    expect(within(navigation).queryByRole("link", { name: "Daily report" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "Stalled units" })).toBeNull();
    // remembered: drawn again, still folded
    cleanup(); render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "Stalled units" })).toBeNull();
    // NEGATIVE: the section holding the open page does not fold, even when the person folds it
    const planning = screen.getByRole("navigation", { name: "Main navigation" }).querySelector('[data-nav-section="planning"]') as HTMLButtonElement;
    fireEvent.click(planning);
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Project controls (PMC)" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("Q-59 (5): the phone's bottom bar", () => {
  it("POSITIVE: the site's daily pages the menu holds, in order, and «More» opens the menu", () => {
    state.nav = [
      { id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls" },
      { id: "project-qc", labelKey: "page.qcReceipt", href: "/m/t1/p1/qc" },
      { id: "project-daily-report", labelKey: "page.dailyReport", href: "/m/t1/p1/report" },
    ] as never;
    state.location = "/projects/t1/p1/controls";
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    const bar = document.querySelector("[data-bottom-bar]") as HTMLElement;
    expect(Array.from(bar.querySelectorAll("[data-bottom-item]")).map(node => [node.getAttribute("data-bottom-item"), node.getAttribute("href")])).toEqual([["project-daily-report", "/m/t1/p1/report"], ["project-qc", "/m/t1/p1/qc"]]);
    expect(document.querySelector("[data-mobile-menu]")).toBeNull();
    fireEvent.click(bar.querySelector("[data-bottom-more]") as HTMLElement);
    expect(document.querySelector("[data-mobile-menu]")).not.toBeNull();
  });
  it("NEGATIVE: no bar for a person whose menu holds none of the site's daily pages (an office role)", () => {
    state.nav = [{ id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls" }] as never;
    render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
    expect(document.querySelector("[data-bottom-bar]")).toBeNull();
  });
});
