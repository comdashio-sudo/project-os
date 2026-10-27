// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductShell } from "./ProductShell";

// One frame for every company screen (work order 21, step 1): one top bar, the modules the server allows, one breadcrumb trail.
const state = vi.hoisted(() => ({ location: "/pmo/t1", projects: [] as Array<{ id: string; code: string; name: string }>, nav: [{ id: "executive", labelKey: "navigation.executiveDashboard", href: "/executive/t1" }, { id: "pmo", labelKey: "navigation.pmoDashboard", href: "/pmo/t1" }] as Array<{ id: string; labelKey: string; href?: string }> }));

vi.mock("wouter", () => ({ useLocation: () => [state.location, vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Pilot Owner", email: "owner@example.test" }, logout: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    navigation: { get: { useQuery: () => ({ data: state.nav }) } },
    tenant: { mine: { useQuery: () => ({ data: [{ tenantId: "t1", legalName: "Pilot Company" }] }) } },
    projects: { list: { useQuery: () => ({ data: state.projects }) } },
  },
}));

afterEach(() => { cleanup(); state.location = "/pmo/t1"; state.projects = []; });

describe("ProductShell", () => {
  it("draws one top bar and the modules the server allows, and marks the current one", () => {
    render(<ProductShell tenantId="t1"><p>screen</p></ProductShell>);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(navigation).getByRole("link", { name: "Executive" }).getAttribute("href")).toBe("/executive/t1");
    expect(within(navigation).getByRole("link", { name: "PMO" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("screen")).toBeTruthy();
  });

  it("does not repeat the old per-page module bar", () => {
    render(<ProductShell tenantId="t1"><p>screen</p></ProductShell>);
    expect(screen.queryByRole("navigation", { name: "Enterprise navigation" })).toBeNull();
  });

  it("on a project's own page marks Project controls (not the registry, whose address is a prefix of every project's) and names the project in the trail", () => {
    const saved = state.nav;
    state.nav = [{ id: "registry", labelKey: "navigation.projectRegistry", href: "/projects/t1" }, { id: "controls", labelKey: "navigation.projectControls", href: "/projects/t1/p1/controls" }];
    state.location = "/projects/t1/p1/pmc";
    state.projects = [{ id: "p1", code: "PRJ-1", name: "Villas" }];
    try {
      render(<ProductShell tenantId="t1" projectId="p1"><p>screen</p></ProductShell>);
      const navigation = screen.getByRole("navigation", { name: "Main navigation" });
      expect(within(navigation).getByRole("link", { name: "Project controls" }).getAttribute("aria-current")).toBe("page");
      expect(within(navigation).getByRole("link", { name: "Project registry" }).getAttribute("aria-current")).toBeNull();
      expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("PRJ-1 · Villas")).toBeTruthy();
    } finally { state.nav = saved; }
  });
});
