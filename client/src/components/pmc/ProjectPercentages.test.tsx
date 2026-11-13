// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// D-6: the three percentages per project on the company and portfolio levels. Fabricated names only.
const h = vi.hoisted(() => ({ query: { isSuccess: true, data: [] as unknown[] } as Record<string, unknown> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/trpc", () => ({ trpc: { pmcSite: { percentagesByProject: { useQuery: () => h.query } } } }));

import { ProjectPercentages } from "./ProjectPercentages";
afterEach(() => cleanup());
const row = { projectId: "p1", code: "PX-1", name: "Demo villas", portfolioId: null, units: 10, site: 0.42, consultant: 0.38, monthly: 0.4, siteMinusConsultant: 0.04, siteMinusMonthly: 0.02, consultantMinusMonthly: -0.02 };

describe("ProjectPercentages", () => {
  it("one row per project: its three percentages, the differences, and a link to the project's level", () => {
    h.query = { isSuccess: true, data: [row] };
    render(<ProjectPercentages tenantId="t1" id="company-percentages" />);
    const table = screen.getByTestId("project-percentages");
    expect(table.textContent).toContain("42");
    expect(table.textContent).toContain("38");
    expect(table.textContent).toContain("+4");
    expect(screen.getByRole("link", { name: "PX-1 · Demo villas" }).getAttribute("href")).toBe("/levels/t1/projects/p1");
  });
  it("nothing to show (no project with villas the person may read): the section is left out", () => {
    h.query = { isSuccess: true, data: [] };
    const { container } = render(<ProjectPercentages tenantId="t1" id="company-percentages" />);
    expect(container.innerHTML).toBe("");
  });
});
