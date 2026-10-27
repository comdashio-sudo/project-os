// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductShell } from "./ProductShell";

// One frame for every company screen (work order 21, step 1): one top bar, the modules the server allows, one breadcrumb trail.
const state = vi.hoisted(() => ({ nav: [{ id: "executive", labelKey: "navigation.executiveDashboard", href: "/executive/t1" }, { id: "pmo", labelKey: "navigation.pmoDashboard", href: "/pmo/t1" }] as Array<{ id: string; labelKey: string; href?: string }> }));

vi.mock("wouter", () => ({ useLocation: () => ["/pmo/t1", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Pilot Owner", email: "owner@example.test" }, logout: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    navigation: { get: { useQuery: () => ({ data: state.nav }) } },
    tenant: { mine: { useQuery: () => ({ data: [{ tenantId: "t1", legalName: "Pilot Company" }] }) } },
    projects: { list: { useQuery: () => ({ data: [] }) } },
  },
}));

afterEach(() => cleanup());

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
});
