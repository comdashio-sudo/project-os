/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMITMENTS, COMPANY, PROJECT_A, TENANT } from "@/test/levelFixtures";
import LevelCompany from "./LevelCompany";

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown>, commitments: {} as Record<string, unknown>, isArabic: true }));
const refetch = vi.hoisted(() => vi.fn());
const ok = (data: unknown) => ({ isLoading: false, isFetching: false, error: null, data, refetch });
const failed = (error: unknown) => ({ isLoading: false, isFetching: false, error, data: undefined, refetch });

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: state.isArabic ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/lib/trpc", () => ({ trpc: { scopes: { company: { useQuery: () => state.query } }, levelReads: { companyCommitments: { useQuery: () => state.commitments } } } }));

const money = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR`;

describe("LevelCompany (level 1, company and board)", () => {
  beforeEach(() => { state.isArabic = true; state.query = ok(COMPANY); state.commitments = ok(COMMITMENTS); });
  afterEach(() => { cleanup(); refetch.mockReset(); });

  it("shows every project on one page with the server's figures, in Arabic first", () => {
    const { container } = render(<LevelCompany />);
    expect(screen.getByRole("heading", { name: "لوحة الشركة ومجلس الإدارة" })).toBeTruthy();
    expect(screen.getByText("المستوى 1 من 4 · الشركة ومجلس الإدارة")).toBeTruthy();
    expect(container.querySelectorAll("[data-project-row]")).toHaveLength(2);
    // The total card and LV-01's own row both show the one project's profit.
    expect(screen.getAllByText(money(120000))).toHaveLength(2);
    expect(screen.getByText("LV-01 · Synthetic project A")).toBeTruthy();
  });

  it("counts late projects and projects with a negative variance from the same figures", () => {
    render(<LevelCompany />);
    // LV-01 has late activities and a negative VAC; LV-02 has neither. The totals card shows one each.
    const late = screen.getByText("مشاريع متأخرة").parentElement!;
    const deviating = screen.getByText("مشاريع بانحراف سلبي").parentElement!;
    expect(late.textContent).toContain("1");
    expect(deviating.textContent).toContain("1");
  });

  it("shows an unavailable profit or variance as not available, never as a zero", () => {
    const { container } = render(<LevelCompany />);
    const lv2 = container.querySelector("[data-project-row='33333333-3333-4333-8333-333333333333']")!;
    expect(lv2.textContent).toContain("غير متاح");
    expect(lv2.textContent).not.toContain("0 SAR");
  });

  it("gives the one-click link to the level below: the portfolio", () => {
    const { container } = render(<LevelCompany />);
    const down = container.querySelector("[data-level-down]") as HTMLAnchorElement;
    expect(down.getAttribute("href")).toBe(`/levels/${TENANT}/portfolio`);
    expect(down.textContent).toContain("إدارة المشاريع (المحفظة)");
  });

  it("links each project row to that project's own level", () => {
    const { container } = render(<LevelCompany />);
    const link = container.querySelector(`[data-project-row='${PROJECT_A.projectId}'] a`) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`/levels/${TENANT}/projects/${PROJECT_A.projectId}`);
  });

  it("shows the company's commitments per kind, each currency side by side and never added together", () => {
    const { container } = render(<LevelCompany />);
    const section = container.querySelector("[data-section='company-commitments']")!;
    expect(section.querySelector("[data-state='awaiting-server']")).toBeNull();
    const values = Array.from(section.querySelectorAll("dd")).map(item => item.textContent ?? "");
    expect(values[0]).toContain("2 — ");
    expect(values[0]).toContain(money(1250));
    expect(values[0]).toContain("40 USD");
    expect(values[1]).toBe(`1 — ${money(500)}`);
    expect(values[2]).toBe("0");
  });

  it("says the commitments could not be read, and shows no figure in their place", () => {
    state.commitments = failed({ data: { code: "INTERNAL_SERVER_ERROR" }, message: "Synthetic failure" });
    const { container } = render(<LevelCompany />);
    const section = container.querySelector("[data-section='company-commitments']")!;
    expect(section.querySelector("[role='alert']")?.textContent).toContain("الالتزامات");
    expect(section.querySelectorAll("dd")).toHaveLength(0);
  });

  it("shows the no-permission sentence, not a 403, to a person without company scope", () => {
    state.query = failed({ data: { code: "FORBIDDEN" }, message: "Role scope does not cover the requested resource." });
    const { container } = render(<LevelCompany />);
    expect(container.querySelector("[data-screen-state='no-permission']")).toBeTruthy();
    expect(screen.getByText("لا تملك الصلاحية اللازمة لعرض هذه الشاشة.")).toBeTruthy();
    expect(container.querySelector("[data-project-row]")).toBeNull();
    expect(container.textContent).not.toMatch(/403|FORBIDDEN/);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("shows a failed read as an error with a retry that asks again", () => {
    state.query = failed({ message: "fetch failed" });
    render(<LevelCompany />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state with the next action when the company has no project yet", () => {
    state.query = ok({ ...COMPANY, projects: [], totals: { ...COMPANY.totals, projectCount: 0 } });
    const { container } = render(<LevelCompany />);
    expect(container.querySelector("[data-screen-state='empty']")).toBeTruthy();
    expect(screen.getByRole("link", { name: "إلى سجل المشاريع" }).getAttribute("href")).toBe(`/projects/${TENANT}`);
  });

  it("reads the same screen in English when English is chosen", () => {
    state.isArabic = false;
    render(<LevelCompany />);
    expect(screen.getByRole("heading", { name: "Company and board dashboard" })).toBeTruthy();
    expect(screen.getByText("Level 1 of 4 · Company and board")).toBeTruthy();
  });
});
