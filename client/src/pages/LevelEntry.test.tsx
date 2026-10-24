/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_A, TENANT } from "@/test/levelFixtures";
import LevelEntry from "./LevelEntry";

// The entry is the server's answer (`levelReads.entry`, decided per assignment). The screen only follows it: it does not choose a level itself.
const state = vi.hoisted(() => ({ entry: {} as Record<string, unknown>, isArabic: true }));
const refetch = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { levelReads: { entry: { useQuery: () => state.entry } } } }));

const ok = (data: unknown) => ({ isLoading: false, isFetching: false, error: null, data, refetch });

function redirectTarget(container: HTMLElement): string | null {
  return container.querySelector("[data-redirect]")?.getAttribute("data-redirect") ?? null;
}

describe("LevelEntry: a person enters at the level the server gives them", () => {
  beforeEach(() => { state.isArabic = true; });
  afterEach(() => { cleanup(); refetch.mockReset(); });

  it("sends a company-wide person to the company level", () => {
    state.entry = ok({ level: "company" });
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/company`);
  });

  it("sends a PMO person to the portfolio level", () => {
    state.entry = ok({ level: "portfolio" });
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/portfolio`);
  });

  it("sends a project person to the project the server names", () => {
    state.entry = ok({ level: "project", projectId: PROJECT_A.projectId });
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/projects/${PROJECT_A.projectId}`);
  });

  it("sends a warehouse keeper with no project.read to the warehouse of their project (G-194)", () => {
    state.entry = ok({ level: "warehouse", projectId: PROJECT_A.projectId });
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBe(`/levels/${TENANT}/projects/${PROJECT_A.projectId}/warehouse`);
  });

  it("shows the no-permission sentence, not a redirect or a 403, to a person with no level", () => {
    state.entry = ok(null);
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBeNull();
    expect(container.querySelector("[data-screen-state='no-permission']")).toBeTruthy();
    expect(container.textContent).not.toMatch(/403|FORBIDDEN/);
  });

  it("shows the error with a retry when the entry cannot be read, and sends nothing", () => {
    state.entry = { isLoading: false, isFetching: false, error: { data: { code: "INTERNAL_SERVER_ERROR" }, message: "Synthetic failure" }, data: undefined, refetch };
    const { container } = render(<LevelEntry />);
    expect(redirectTarget(container)).toBeNull();
    expect(container.querySelector("[data-screen-state='error']")).toBeTruthy();
  });

  it("shows the loading line while it finds the level, and sends nothing yet", () => {
    state.entry = { isLoading: true, isFetching: true, error: null, data: undefined, refetch };
    const { container } = render(<LevelEntry />);
    expect(container.querySelector("[data-screen-state='loading']")).toBeTruthy();
    expect(redirectTarget(container)).toBeNull();
  });
});
