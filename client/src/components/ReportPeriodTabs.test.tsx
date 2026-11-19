// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-36 (step 3 b): the weekly and monthly reports as one page with two tabs. Synthetic ids only.
const h = vi.hoisted(() => ({ allowed: new Set<string>(), language: "en" as "ar" | "en" | "ur" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: h.language, isArabic: h.language === "ar", isRtl: h.language !== "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: (page: string) => h.allowed.has(page) }));
import { ReportPeriodTabs } from "./ReportPeriodTabs";

beforeEach(() => { h.allowed = new Set(["weeklyReport", "monthlyReport"]); h.language = "en"; });
afterEach(() => cleanup());
const tabs = () => Array.from(document.querySelectorAll("[data-report-tab]")).map(a => [a.getAttribute("data-report-tab"), a.getAttribute("href"), a.getAttribute("aria-current")]);

describe("ReportPeriodTabs (Q-36 3 b)", () => {
  it("POSITIVE: both tabs, the open one marked, each at its own address; «back» goes to «Reports»", () => {
    render(<ReportPeriodTabs tenantId="t" projectId="p" current="monthly" />);
    expect(tabs()).toEqual([["weekly", "/projects/t/p/weekly-report", null], ["monthly", "/projects/t/p/monthly-report", "page"]]);
    expect(document.querySelector("[data-report-period-tabs] > a")!.getAttribute("href")).toBe("/projects/t/p/reports");
  });
  it("NEGATIVE: a tab the person may not open is not drawn (the open one always is)", () => {
    h.allowed = new Set(["weeklyReport"]);
    render(<ReportPeriodTabs tenantId="t" projectId="p" current="weekly" />);
    expect(tabs().map(([key]) => key)).toEqual(["weekly"]);
  });
  it("names the tabs in the page's language", () => {
    h.language = "ar";
    render(<ReportPeriodTabs tenantId="t" projectId="p" current="weekly" />);
    expect(Array.from(document.querySelectorAll("[data-report-tab]")).map(a => a.textContent)).toEqual(["التقرير الأسبوعي", "التقرير الشهري"]);
    cleanup(); h.language = "ur";
    render(<ReportPeriodTabs tenantId="t" projectId="p" current="weekly" />);
    expect(Array.from(document.querySelectorAll("[data-report-tab]")).map(a => a.textContent)).toEqual(["ہفتہ وار رپورٹ", "ماہانہ رپورٹ"]);
  });
});
