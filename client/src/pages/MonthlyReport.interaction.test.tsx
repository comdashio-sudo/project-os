/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonthlyReport, { currentMonth, shiftMonth } from "./MonthlyReport";

// D-53 (b): the monthly report page on reportPeriods.monthly (D-53 a) and its export bar (the D-50 slides). Synthetic figures only.
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", asked: [] as string[], error: null as unknown, profileError: null as unknown,
  profile: { reportPrefix: "DEMO", logos: { client: null, consultant: null, contractor: null }, clientName: null, consultantName: null, contractorName: null } as unknown,
  data: null as null | Record<string, unknown>,
}));
const monthly = (plannedSource: "p6" | null) => ({
  period: { start: "2026-11-01", end: "2026-11-30", workingDayCount: 25 }, reports: [{ id: "r1" }, { id: "r2" }], missingWorkingDays: ["2026-11-03"],
  activities: [], labour: { period: { direct: 900, indirect: 120 }, daily: [] }, equipment: [], quality: { wir: { A: 0, B: 0, C: 0, pending: 0 }, rfi: { submitted: 0, answered: 0, pending: 0 }, ncr: { opened: 0, closed: 0, open: 3 } }, safety: { manHours: 0 },
  sCurve: { plannedSource, points: [{ month: "2026-10", date: "2026-10-31", planned: plannedSource ? 40 : null, actual: 35, deviation: plannedSource ? -5 : null }, { month: "2026-11", date: "2026-11-30", planned: plannedSource ? 62.5 : null, actual: 50, deviation: plannedSource ? -12.5 : null }] },
  milestones: [{ code: "M1", name: "Synthetic", plannedDate: "2026-11-10", actualDate: null, state: "late", varianceDays: 20 }], earnedValue: null, financialHidden: true,
});
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  projects: { profile: { get: { useQuery: () => ({ data: h.profileError ? undefined : h.profile, error: h.profileError }) } } },
  reportPeriods: { monthly: { useQuery: (input: { month: string }) => { h.asked.push(input.month); return { data: h.error ? undefined : h.data, error: h.error, refetch: vi.fn() }; } } },
} }));

beforeEach(() => { h.language = "en"; h.asked = []; h.error = null; h.profileError = null; h.data = monthly("p6"); });
afterEach(cleanup);
const exportButtons = () => Array.from(document.querySelector("[data-weekly-exports]")!.querySelectorAll("button")).filter(button => /PowerPoint|PDF/.test(button.textContent ?? "")) as HTMLButtonElement[];

describe("the monthly report page (D-53 b)", () => {
  it("shows the month's figures and its S-curve as the server sends them, and offers both exports", () => {
    render(<MonthlyReport />);
    expect(h.asked[0]).toBe(currentMonth());
    const card = document.querySelector("[data-month-figures]")!;
    expect(card.textContent).toContain("900");
    expect(Array.from(document.querySelectorAll("[data-s-curve] tbody tr")).map(row => row.textContent)).toEqual(["2026-1040.035.0-5.0", "2026-1162.550.0-12.5"]);
    expect(screen.getByText("Milestones: 1")).toBeTruthy();
    expect(exportButtons().map(button => button.disabled)).toEqual([false, false]);
    expect(screen.getByRole("heading", { name: "Export the monthly report" })).toBeTruthy();
  });

  it("moves a month back and forward, across the year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    render(<MonthlyReport />);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(h.asked.at(-1)).toBe(shiftMonth(currentMonth(), -1));
  });

  it("NEGATIVE: with no P6 schedule it says there is no planned line and shows «—»; a failed read is said and nothing is exported", () => {
    h.data = monthly(null);
    const { unmount } = render(<MonthlyReport />);
    expect(screen.getByRole("note").textContent).toContain("No P6 schedule");
    expect(document.querySelector("[data-s-curve] tbody tr td")!.textContent).toBe("—");
    unmount();
    h.error = new Error("down");
    render(<MonthlyReport />);
    expect(document.querySelector("[data-month-figures]")).toBeNull();
    expect(exportButtons().every(button => button.disabled)).toBe(true);
  });

  it("a profile that failed to load is said, and the export still works", () => {
    h.profileError = new Error("down");
    render(<MonthlyReport />);
    expect(screen.getByText(/without logos/)).toBeTruthy();
    expect(exportButtons().every(button => !button.disabled)).toBe(true);
  });

  it("speaks Arabic and Urdu", () => {
    h.language = "ar";
    const { unmount } = render(<MonthlyReport />);
    expect(screen.getByRole("heading", { name: "التقرير الشهري" })).toBeTruthy();
    unmount();
    h.language = "ur";
    render(<MonthlyReport />);
    expect(screen.getByRole("heading", { name: "ماہانہ رپورٹ" })).toBeTruthy();
  });
});
