// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-36 (step 2 c): «التقارير» — three cards, each only for whoever may open its report. Synthetic ids only.
const h = vi.hoisted(() => ({ allowed: new Set<string>(), language: "en" as "ar" | "en" | "ur" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: (page: string) => h.allowed.has(page) }));
import ProjectReports from "./ProjectReports";

beforeEach(() => { h.allowed = new Set(); h.language = "en"; });
afterEach(() => cleanup());
const hrefs = () => Array.from(document.querySelectorAll("[data-report-card] a")).map(a => a.getAttribute("href"));

describe("ProjectReports (Q-36 2 c)", () => {
  it("POSITIVE: each card opens its report page", () => {
    h.allowed = new Set(["weeklyReport", "monthlyReport", "siteConsultant"]);
    render(<ProjectReports />);
    expect(document.querySelector("h1")!.textContent).toBe("Reports");
    expect(hrefs()).toEqual(["/projects/t/p/weekly-report", "/projects/t/p/monthly-report", "/projects/t/p/site-consultant"]);
  });
  it("NEGATIVE: a report the person may not open has no card; with none, one line says so", () => {
    h.allowed = new Set(["weeklyReport", "monthlyReport"]);
    render(<ProjectReports />);
    expect(hrefs()).toEqual(["/projects/t/p/weekly-report", "/projects/t/p/monthly-report"]);
    cleanup(); h.allowed = new Set();
    render(<ProjectReports />);
    expect(document.querySelector("[data-report-cards]")).toBeNull();
    expect(document.querySelector("[role=note]")!.textContent).toContain("You may not open any of this project's reports");
  });
  it("Arabic and Urdu: the page's own name", () => {
    h.allowed = new Set(["weeklyReport"]); h.language = "ar";
    render(<ProjectReports />);
    expect(document.querySelector("h1")!.textContent).toBe("التقارير");
    cleanup(); h.language = "ur";
    render(<ProjectReports />);
    expect(document.querySelector("h1")!.textContent).toBe("رپورٹس");
  });
});
