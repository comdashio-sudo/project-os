/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELIVERIES, FIELD_REPORTS, INSPECTIONS, PROJECT_A, PROJECT_B, PROJECT_LEVEL, TENANT } from "@/test/levelFixtures";
import LevelProject from "./LevelProject";

const state = vi.hoisted(() => ({ project: {} as Record<string, unknown>, reports: {} as Record<string, unknown>, inspections: {} as Record<string, unknown>, deliveries: {} as Record<string, unknown>, isArabic: true }));
const refetch = vi.hoisted(() => vi.fn());
const ok = (data: unknown) => ({ isLoading: false, isFetching: false, error: null, data, refetch });
const failed = (error: unknown) => ({ isLoading: false, isFetching: false, error, data: undefined, refetch });

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111", projectId: "22222222-2222-4222-8222-222222222222" }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: state.isArabic ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/pmc/SourcePercentages", () => ({ SourcePercentages: (props: { projectId: string }) => <div data-three-percentages={props.projectId}>Three percentages</div> }));
vi.mock("@/pages/ProjectFpac", () => ({ ProjectFpac: (props: { tenantId: string; projectId: string }) => <section data-fpac={props.projectId}>Profitability panel for {props.tenantId}</section> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    scopes: { project: { useQuery: () => state.project } },
    fieldReports: { list: { useQuery: () => state.reports } },
    qualityInspections: { list: { useQuery: () => state.inspections } },
    levelReads: { projectDeliveries: { useQuery: () => state.deliveries } },
  },
}));

describe("LevelProject (level 3, one project)", () => {
  beforeEach(() => {
    state.isArabic = true;
    state.project = ok(PROJECT_LEVEL);
    state.reports = ok(FIELD_REPORTS);
    state.inspections = ok(INSPECTIONS);
    state.deliveries = ok(DELIVERIES);
  });
  afterEach(() => { cleanup(); refetch.mockReset(); });

  it("D-6: shows the three percentages (site, consultant, monthly report) of this project", () => {
    const { container } = render(<LevelProject />);
    expect(container.querySelector("[data-three-percentages]")?.getAttribute("data-three-percentages")).toBeTruthy();
    expect(container.querySelector("[data-section='project-percentages']")).not.toBeNull();
  });

  it("shows the project's progress, EVM and the existing profitability panel for this project", () => {
    const { container } = render(<LevelProject />);
    expect(screen.getByRole("heading", { name: "LV-01 · Synthetic project A" })).toBeTruthy();
    expect(screen.getByText("المستوى 3 من 4 · المشروع")).toBeTruthy();
    expect(container.querySelector("[data-section='project-progress']")?.textContent).toContain("50.0%");
    expect(container.querySelector("[data-section='project-evm']")?.textContent).toContain("PV");
    expect(container.querySelector(`[data-fpac='${PROJECT_A.projectId}']`)?.textContent).toContain("Profitability panel for");
  });

  it("lists only the daily reports, newest first", () => {
    const { container } = render(<LevelProject />);
    const daily = container.querySelector("[data-section='project-daily']")!;
    const rows = Array.from(daily.querySelectorAll("tbody tr")).map(row => row.querySelector("th")?.textContent);
    expect(rows).toEqual(["DR-0002", "DR-0001"]);
    expect(daily.textContent).not.toContain("IR-0001");
  });

  it("counts the handovers of the project from the server's read: total, awaiting the consultant, replied", () => {
    const { container } = render(<LevelProject />);
    const section = container.querySelector("[data-section='project-handovers']")!;
    expect(section.querySelector("[data-state='awaiting-server']")).toBeNull();
    expect(Array.from(section.querySelectorAll("dd")).map(item => item.textContent)).toEqual(["6", "2", "2"]);
  });

  it("says the handovers could not be read, and shows no figure in their place", () => {
    state.deliveries = failed({ data: { code: "INTERNAL_SERVER_ERROR" }, message: "Synthetic failure" });
    const { container } = render(<LevelProject />);
    const section = container.querySelector("[data-section='project-handovers']")!;
    expect(section.querySelector("[role='alert']")?.textContent).toContain("التسليمات");
    expect(section.querySelectorAll("dd")).toHaveLength(0);
  });

  it("lists the inspections and the quality figures the server gives for the project", () => {
    const { container } = render(<LevelProject />);
    const inspections = container.querySelector("[data-section='project-inspections']")!;
    expect(inspections.textContent).toContain("QI-0001");
    // The figure card holds its label and its value; the server's count of inspections awaiting a result is 1.
    expect(screen.getByText("بانتظار النتيجة").parentElement!.textContent).toContain("1");
    expect(inspections).toBeTruthy();
  });

  it("gives the one-click link to the level below: the warehouse of this project", () => {
    const { container } = render(<LevelProject />);
    const down = container.querySelector("[data-level-down]") as HTMLAnchorElement;
    expect(down.getAttribute("href")).toBe(`/levels/${TENANT}/projects/${PROJECT_A.projectId}/warehouse`);
  });

  it("says earned value and progress are not computed yet, instead of showing zero", () => {
    state.project = ok({ ...PROJECT_LEVEL, project: PROJECT_B });
    const { container } = render(<LevelProject />);
    expect(container.querySelector("[data-section='project-evm']")?.textContent).toContain("لا يمكن حساب القيمة المكتسبة");
    expect(container.querySelector("[data-section='project-progress']")?.textContent).toContain("لا يوجد تقدم محسوب");
    expect(container.querySelector("[data-section='project-progress']")?.textContent).toContain("غير متاح");
  });

  it("shows the no-permission sentence, not a 403, and no profitability panel, to a person without project scope", () => {
    state.project = failed({ data: { code: "FORBIDDEN" }, message: "Role scope does not cover the requested resource." });
    const { container } = render(<LevelProject />);
    expect(container.querySelector("[data-screen-state='no-permission']")).toBeTruthy();
    expect(container.querySelector("[data-fpac]")).toBeNull();
    expect(container.textContent).not.toMatch(/403|FORBIDDEN/);
  });

  it("keeps the rest of the page when only the daily reports fail, and says which part failed", () => {
    state.reports = failed({ message: "fetch failed" });
    const { container } = render(<LevelProject />);
    expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل: التقرير اليومي");
    expect(container.querySelector("[data-section='project-inspections']")?.textContent).toContain("QI-0001");
  });
});
