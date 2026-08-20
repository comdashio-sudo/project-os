/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnterpriseNavigation } from "./EnterpriseNavigation";

const state = vi.hoisted(() => ({ isArabic: false, items: [] as Array<{ id: string; labelKey: string; href: string }> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { navigation: { get: { useQuery: () => ({ data: state.items, isLoading: false, error: null }) } } } }));

describe("EnterpriseNavigation", () => {
  it("renders only server-calculated items and localizes the project context", () => {
    state.isArabic = true; state.items = [{ id: "project-controls", labelKey: "navigation.projectControls", href: "/projects/t/p/controls" }];
    render(<EnterpriseNavigation tenantId="t" projectId="p" context="project" />);
    expect(screen.getByRole("navigation", { name: "الملاحة المؤسسية" })).toBeTruthy();
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

  it("offers a labelled, keyboard-reachable sequence for server-authorized enterprise links", async () => {
    const user = userEvent.setup();
    document.body.innerHTML = "";
    state.isArabic = false;
    state.items = [
      { id: "executive", labelKey: "navigation.executive", href: "/executive/t" },
      { id: "pmo", labelKey: "navigation.pmo", href: "/pmo/t" },
      { id: "projects", labelKey: "navigation.projects", href: "/projects/t" },
    ];
    render(<EnterpriseNavigation tenantId="t" context="project" />);
    expect(screen.getByRole("navigation", { name: "Enterprise navigation" })).toBeTruthy();
    const back = screen.getByRole("button", { name: "Back" });
    const executive = screen.getByRole("link", { name: "executive" });
    const pmo = screen.getByRole("link", { name: "pmo" });
    const projects = screen.getByRole("link", { name: "projects" });
    await user.tab();
    expect(document.activeElement).toBe(back);
    await user.tab();
    expect(document.activeElement).toBe(executive);
    await user.tab();
    expect(document.activeElement).toBe(pmo);
    await user.tab();
    expect(document.activeElement).toBe(projects);
  });
});
