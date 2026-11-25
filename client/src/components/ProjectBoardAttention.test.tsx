// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-59 (2): what needs attention today on the project board. Synthetic figures only.
const h = vi.hoisted(() => ({ can: true, reports: [] as unknown[], stalled: undefined as unknown, ncrs: [] as unknown[], risks: undefined as unknown, riskError: null as unknown,
  q: (value: () => unknown, error: () => unknown = () => null) => ({ useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled && !error() ? value() : undefined, error: options.enabled ? error() : null }) }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: () => h.can }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  siteReports: { list: h.q(() => h.reports) }, pmc: { stalledUnits: h.q(() => h.stalled) }, ncrs: { list: h.q(() => h.ncrs) }, pmo: { projectRisks: h.q(() => h.risks, () => h.riskError) },
} }));

import { ProjectBoardAttention } from "./ProjectBoardAttention";

afterEach(() => { cleanup(); h.can = true; h.reports = []; h.stalled = undefined; h.ncrs = []; h.risks = undefined; h.riskError = null; });
const value = (key: string) => document.querySelector(`[data-attention="${key}"] [data-attention-value]`)?.textContent;
const link = (key: string) => document.querySelector(`[data-attention="${key}"] a`)?.getAttribute("href") ?? null;

describe("ProjectBoardAttention (Q-59 2)", () => {
  it("POSITIVE: each figure from its own read, opening its page — submitted reports, stalled + long-stalled, NCRs still open, high + critical risks", () => {
    h.reports = [{ id: "r1" }, { id: "r2" }];
    h.stalled = { counts: { stalled: 6, long: 2, active: 40 } };
    h.ncrs = [{ status: "open" }, { status: "verification" }, { status: "closed" }, { status: "cancelled" }];
    h.risks = { matrix: { byLevel: { low: 4, medium: 3, high: 2, critical: 1 } } };
    render(<ProjectBoardAttention tenantId="t" projectId="p" />);
    expect([value("reports"), value("stalled"), value("ncrs"), value("risks")]).toEqual(["2", "8", "2", "3"]);
    expect([link("reports"), link("stalled"), link("ncrs"), link("risks")]).toEqual(["/projects/t/p/site", "/projects/t/p/stalled", "/projects/t/p/quality", "/projects/t/p/risks"]);
  });
  it("NEGATIVE: without the page's permission nothing is read and no link is drawn; a failed read says so; neither is ever 0", () => {
    h.riskError = { message: "down" };
    render(<ProjectBoardAttention tenantId="t" projectId="p" />);
    expect(value("risks")).toBe("—");
    expect(document.querySelector('[data-attention="risks"]')!.textContent).toContain("The source could not be loaded");
    cleanup(); h.can = false; h.reports = [{ id: "r1" }];
    render(<ProjectBoardAttention tenantId="t" projectId="p" />);
    expect([value("reports"), value("stalled"), value("ncrs"), value("risks")]).toEqual(["—", "—", "—", "—"]);
    expect(link("reports")).toBeNull();
    expect(screen.getAllByText("Not visible to you")).toHaveLength(4);
  });
});
