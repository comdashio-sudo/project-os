/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_A, PROJECT_B, TENANT } from "@/test/levelFixtures";
import LevelEntry from "./LevelEntry";

const state = vi.hoisted(() => ({ navigation: {} as Record<string, unknown>, projects: {} as Record<string, unknown>, isArabic: true }));
const refetch = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    navigation: { get: { useQuery: () => state.navigation } },
    projects: { list: { useQuery: () => state.projects } },
  },
}));

const ok = (data: unknown) => ({ isLoading: false, isFetching: false, error: null, data, refetch });
const navItem = (id: string) => ({ id, level: "EXECUTIVE", labelKey: id, href: "/x", product: "EXECUTIVE", permission: "x", scope: { type: "company" } });
const projectList = [{ id: PROJECT_B.projectId, code: "LV-02" }, { id: PROJECT_A.projectId, code: "LV-01" }];

function redirectTarget(container: HTMLElement): string | null {
  return container.querySelector("[data-redirect]")?.getAttribute("data-redirect") ?? null;
}

describe("LevelEntry: a person enters at the dashboard of their own level", () => {
  beforeEach(() => {
    state.isArabic = true;
    state.navigation = ok([]);
    state.projects = ok(projectList);
  });
  afterEach(() => { cleanup(); refetch.mockReset(); });

  it("sends a person who holds two scopes (company executive, and one project) to the company level", () => {
    state.navigation = ok([navItem("executive-dashboard"), navItem("project-controls")]);
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/company`);
  });

  it("sends a PMO person who also holds a project to the portfolio level", () => {
    state.navigation = ok([navItem("pmo-dashboard"), navItem("project-controls")]);
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/portfolio`);
  });

  it("sends a project-only person to their first project, by code", () => {
    state.navigation = ok([navItem("project-controls")]);
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/projects/${PROJECT_A.projectId}`);
  });

  it("shows the no-permission sentence, not a redirect or a 403, to a person with no level", () => {
    state.navigation = ok([navItem("employee-registry")]);
    state.projects = ok([]);
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBeNull();
    expect(container.querySelector("[data-screen-state='no-permission']")).toBeTruthy();
    expect(container.textContent).not.toMatch(/403|FORBIDDEN/);
  });

  it("treats a refused project list as no project level, and still enters at the company level", () => {
    state.navigation = ok([navItem("executive-dashboard")]);
    state.projects = { isLoading: false, isFetching: false, error: { data: { code: "FORBIDDEN" } }, data: undefined, refetch };
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/company`);
  });

  it("shows the loading line while it finds the level, and sends nothing yet", () => {
    state.navigation = { isLoading: true, isFetching: true, error: null, data: undefined, refetch };
    const { container } = render(<LevelEntry />);
    expect(container.querySelector("[data-screen-state='loading']")).toBeTruthy();
    expect(redirectTarget(container)).toBeNull();
  });
});
