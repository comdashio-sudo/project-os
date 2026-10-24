/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORTFOLIO, PROJECT_A, PROJECT_B, TENANT } from "@/test/levelFixtures";
import LevelPortfolio from "./LevelPortfolio";

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown>, isArabic: true }));
const refetch = vi.hoisted(() => vi.fn());
const ok = (data: unknown) => ({ isLoading: false, isFetching: false, error: null, data, refetch });
const failed = (error: unknown) => ({ isLoading: false, isFetching: false, error, data: undefined, refetch });

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/lib/trpc", () => ({ trpc: { scopes: { portfolio: { useQuery: () => state.query } } } }));

describe("LevelPortfolio (level 2, projects management)", () => {
  beforeEach(() => { state.isArabic = true; state.query = ok(PORTFOLIO); });
  afterEach(() => { cleanup(); refetch.mockReset(); });

  it("compares the projects of the portfolio in one table, one row per project", () => {
    const { container } = render(<LevelPortfolio />);
    expect(screen.getByRole("heading", { name: "لوحة إدارة المشاريع (المحفظة)" })).toBeTruthy();
    expect(screen.getByText("المستوى 2 من 4 · إدارة المشاريع (المحفظة)")).toBeTruthy();
    const comparison = container.querySelector("[data-section='portfolio-comparison']")!;
    expect(comparison.querySelectorAll("[data-project-row]")).toHaveLength(2);
    expect(within(comparison as HTMLElement).getByText("50.0%")).toBeTruthy();
  });

  it("lists what waits for the consultant, per project, and only where something waits", () => {
    const { container } = render(<LevelPortfolio />);
    const consultant = container.querySelector("[data-section='portfolio-consultant']")!;
    expect(consultant.textContent).toContain("LV-01 · Synthetic project A");
    expect(consultant.textContent).toContain("طلبات فحص بلا رد: 2");
    expect(consultant.textContent).not.toContain("LV-02");
  });

  it("lists what waits for quality: the open non-conformances and the inspections awaiting a result", () => {
    const { container } = render(<LevelPortfolio />);
    const quality = container.querySelector("[data-section='portfolio-quality']")!;
    expect(quality.textContent).toContain("LV-02 · Synthetic project B");
    expect(quality.textContent).toContain("عدم مطابقة مفتوحة: 2");
    expect(quality.textContent).toContain("LV-01 · Synthetic project A");
  });

  it("chooses the project to go down to: a link per project of the comparison, and no single link to the first one", () => {
    const { container } = render(<LevelPortfolio />);
    const choose = container.querySelector("[data-level-down]") as HTMLElement;
    expect(choose.tagName).toBe("NAV");
    const links = Array.from(choose.querySelectorAll("a"));
    expect(links.map(link => link.getAttribute("href"))).toEqual([`/levels/${TENANT}/projects/${PROJECT_A.projectId}`, `/levels/${TENANT}/projects/${PROJECT_B.projectId}`]);
    expect(container.querySelector(`[data-level-down-item='${PROJECT_B.projectId}']`)?.getAttribute("href")).toBe(`/levels/${TENANT}/projects/${PROJECT_B.projectId}`);
    const rowLink = container.querySelector(`[data-project-row='${PROJECT_B.projectId}'] a`) as HTMLAnchorElement;
    expect(rowLink.getAttribute("href")).toBe(`/levels/${TENANT}/projects/${PROJECT_B.projectId}`);
  });

  it("shows an unavailable profit as not available", () => {
    const { container } = render(<LevelPortfolio />);
    expect(container.querySelector(`[data-project-row='${PROJECT_B.projectId}']`)?.textContent).toContain("غير متاح");
  });

  it("shows the no-permission sentence, not a 403, to a person without the portfolio scope", () => {
    state.query = failed({ data: { code: "FORBIDDEN" }, message: "Required permission is not granted." });
    const { container } = render(<LevelPortfolio />);
    expect(container.querySelector("[data-screen-state='no-permission']")).toBeTruthy();
    expect(container.querySelector("[data-project-row]")).toBeNull();
    expect(container.textContent).not.toMatch(/403|FORBIDDEN/);
  });

  it("shows an empty state, and no level below, when the portfolio covers no project", () => {
    state.query = ok({ ...PORTFOLIO, projects: [], totals: { ...PORTFOLIO.totals, projectCount: 0 } });
    const { container } = render(<LevelPortfolio />);
    expect(container.querySelector("[data-screen-state='empty']")).toBeTruthy();
    expect(container.querySelector("[data-level-down]")).toBeNull();
  });

  it("reads in English when English is chosen", () => {
    state.isArabic = false;
    render(<LevelPortfolio />);
    expect(screen.getByText("Level 2 of 4 · Projects management (portfolio)")).toBeTruthy();
  });
});
