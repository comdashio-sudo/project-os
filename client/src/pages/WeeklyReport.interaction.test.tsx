/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeeklyReport, { currentWeekStart } from "./WeeklyReport";
import { suggestWeeklyTexts, type WeekFigures } from "@/lib/weeklySuggest";

// D-49 (b): the weekly report editor on reportPeriods.get (D-48, the figures) and reportPeriods.weekly / saveWeekly (D-49 a, the words and photos).
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", canWrite: true, profileError: null as unknown, profile: { reportPrefix: "DEMO", logos: { client: null, consultant: null, contractor: null }, clientName: null, consultantName: null, contractorName: null } as unknown, save: vi.fn(), asked: [] as Array<{ anchor?: string; weekStart?: string }>, saveError: null as unknown,
  saved: { week: { start: "2026-11-07", end: "2026-11-13" }, report: null as null | Record<string, unknown>, photos: [] as Array<Record<string, unknown>>, candidates: [] as Array<Record<string, unknown>> },
}));
const figures: WeekFigures & Record<string, unknown> = {
  period: { start: "2026-11-07", end: "2026-11-13", workingDayCount: 6 }, reports: [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }, { id: "r5" }], missingWorkingDays: ["2026-11-12"],
  activities: [
    { activityId: "a1", code: "BLK", name: "Blockwork", period: { planned: 100, actual: 80, variance: -20, percentOfPlan: 80, completedUnits: 4 } },
    { activityId: "a2", code: "PLS", name: "Plaster", period: { planned: 50, actual: 60, variance: 10, percentOfPlan: 120, completedUnits: 2 } },
    { activityId: "a3", code: "PNT", name: "Paint", period: { planned: null, actual: 12, variance: null, percentOfPlan: null, completedUnits: 0 } },
  ] as unknown as WeekFigures["activities"],
  labour: { period: { direct: 300, indirect: 60 } }, safety: { incident: 0, near_miss: 1, violation: 0 }, quality: { ncr: { open: 2 } },
};
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/permissions", () => ({ useCan: () => h.canWrite }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  projects: { profile: { get: { useQuery: () => ({ data: h.profile, error: h.profileError }) } } },
  useUtils: () => ({ reportPeriods: { weekly: { invalidate: vi.fn() } } }),
  reportPeriods: {
    get: { useQuery: (input: { anchor: string }) => { h.asked.push({ anchor: input.anchor }); return { data: figures, error: null, refetch: vi.fn() }; } },
    weekly: { useQuery: (input: { weekStart: string }) => { h.asked.push({ weekStart: input.weekStart }); return { data: h.saved, error: null, refetch: vi.fn() }; } },
    saveWeekly: { useMutation: (config: { onSuccess: () => void }) => ({ mutate: (input: unknown) => { h.save(input); if (!h.saveError) config.onSuccess(); }, reset: vi.fn(), isPending: false, error: h.saveError }) },
  },
} }));

beforeEach(() => { h.language = "en"; h.canWrite = true; h.profileError = null; h.profile = { reportPrefix: "DEMO", logos: { client: null, consultant: null, contractor: null }, clientName: null, consultantName: null, contractorName: null }; h.save.mockReset(); h.asked = []; h.saveError = null; h.saved = { week: { start: "2026-11-07", end: "2026-11-13" }, report: null, photos: [], candidates: [{ id: "f1", reportDate: "2026-11-08", fileName: "f1.jpg", caption: "Block B1", url: "https://storage.example.test/f1" }, { id: "f2", reportDate: "2026-11-09", fileName: "f2.jpg", caption: null, url: null }] }; });
afterEach(cleanup);

describe("the weekly report editor (D-49 b)", () => {
  it("shows the engine's figures as text, with no field for a number; a plan nobody entered reads «—»", () => {
    render(<WeeklyReport />);
    const card = document.querySelector("[data-week-figures]")!;
    expect(card.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(card.textContent).toContain("80.0%");
    const paint = Array.from(card.querySelectorAll("tbody tr")).find(row => row.textContent?.includes("Paint"))!;
    expect(Array.from(paint.querySelectorAll("td")).map(cell => cell.textContent)).toEqual(["—", "12.00", "—", "—", "0"]);
    // every field on the page is a text or the week's date: none holds a figure
    expect(Array.from(document.querySelectorAll("input:not([type=checkbox]):not([type=file])")).map(input => (input as HTMLInputElement).type)).toEqual(["date"]); // the file input is the map picture (D-50), not a number
  });

  it("suggests the summary, the analysis and the issues from the figures, only into empty texts; then saves the words and the chosen photos", async () => {
    render(<WeeklyReport />);
    fireEvent.change(screen.getByLabelText("Analysis"), { target: { value: "Written by hand." } });
    fireEvent.click(screen.getByRole("button", { name: "Suggest from the figures" }));
    expect((screen.getByLabelText("Summary") as HTMLTextAreaElement).value).toContain("5 approved daily reports were counted out of 6 working days");
    expect((screen.getByLabelText("Analysis") as HTMLTextAreaElement).value).toBe("Written by hand."); // never overwritten
    expect((screen.getByLabelText("Issues") as HTMLTextAreaElement).value).toContain("2026-11-12");
    fireEvent.click(screen.getByLabelText(/Block B1/));
    fireEvent.click(screen.getByRole("button", { name: "Save the report" }));
    const sent = h.save.mock.calls[0]![0];
    expect(sent).toMatchObject({ tenantId: "t", projectId: "p", weekStart: currentWeekStart(), photoIds: ["f1"] });
    expect(Object.keys(sent.texts).sort()).toEqual(["analysis", "commercial", "correctiveActions", "decisions", "engineering", "interfaces", "issues", "milestones", "outlook", "procurement", "summary"]);
    expect(Object.values(sent).some(value => typeof value === "number")).toBe(false); // no figure travels to the save
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("The weekly report was saved."));
  });

  it("opens what was saved for the week, and moving a week asks the engine and the store for that week", () => {
    h.saved = { ...h.saved, report: { id: "w1", summary: "Saved summary.", outlook: "Paving next." }, photos: [{ id: "f2", reportDate: "2026-11-09", fileName: "f2.jpg", caption: null, url: null }] };
    render(<WeeklyReport />);
    expect((screen.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe("Saved summary.");
    expect(screen.getByText("1 of 24 chosen")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Week starting"), { target: { value: "2026-10-31" } });
    expect(h.asked).toContainEqual({ anchor: "2026-10-31" });
    expect(h.asked).toContainEqual({ weekStart: "2026-10-31" });
  });

  it("someone without the write permission reads the texts and cannot change, choose or save", () => {
    h.canWrite = false;
    render(<WeeklyReport />);
    expect(screen.getByRole("note").textContent).toBe("View only: you cannot write the report.");
    expect((screen.getByLabelText("Summary") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Save the report" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggest from the figures" })).toBeNull();
    expect(Array.from(document.querySelectorAll("input[type=checkbox]")).every(box => (box as HTMLInputElement).disabled)).toBe(true);
  });

  it("a refused save is said in the page's language", () => {
    h.saveError = { message: "x", data: { projectError: { code: "PROJECT_OS_WEEKLY_REPORT_PHOTO_NOT_FOUND", messages: { ar: "ar", en: "A chosen photo is not one of this project's daily-report photos, so nothing was saved.", ur: "ur" } } } };
    render(<WeeklyReport />);
    expect(screen.getByRole("alert").textContent).toBe("A chosen photo is not one of this project's daily-report photos, so nothing was saved.");
  });

  it.each([["ar", "التقرير الأسبوعي"], ["ur", "ہفتہ وار رپورٹ"]] as const)("%s: the title", (language, title) => {
    h.language = language;
    render(<WeeklyReport />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
  });
});

describe("the proposed texts (D-49 b)", () => {
  it("compares only activities with a plan, behind first; with no plan anywhere it says so instead of reading it as zero", () => {
    const proposal = suggestWeeklyTexts(figures, "en");
    expect(proposal.analysis.split("\n")).toEqual(["BLK · Blockwork: 80.0% (behind plan)", "PLS · Plaster: 120.0% (ahead of plan)"]);
    expect(proposal.issues.split("\n")).toEqual(["Working days without an approved daily report: 2026-11-12.", "Safety: 0 incidents, 1 near misses, 0 violations.", "2 non-conformance reports are open."]);
    const noPlan = suggestWeeklyTexts({ ...figures, activities: figures.activities.map(activity => ({ ...activity, period: { ...activity.period, planned: null, percentOfPlan: null } })) }, "ar");
    expect(noPlan.analysis).toBe("لا مخطط مُدخل لأي نشاط هذا الأسبوع، فلا يُقارن الفعلي بشيء.");
  });

  it("the week holding a day starts on its Saturday", () => {
    expect(currentWeekStart(new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-07"); // a Thursday
    expect(currentWeekStart(new Date("2026-11-07T10:00:00Z"))).toBe("2026-11-07"); // the Saturday itself
  });

  it("D-50: the export bar offers PowerPoint and PDF once the figures and the profile are in; while the profile loads both wait", () => {
    const { unmount } = render(<WeeklyReport />);
    const bar = document.querySelector("[data-weekly-exports]")!;
    const buttons = Array.from(bar.querySelectorAll("button")).filter(button => /PowerPoint|PDF/.test(button.textContent ?? ""));
    expect(buttons.map(button => [button.textContent, (button as HTMLButtonElement).disabled])).toEqual([["PowerPoint", false], ["PDF", false]]);
    unmount();
    h.profile = undefined;
    render(<WeeklyReport />);
    const again = Array.from(document.querySelector("[data-weekly-exports]")!.querySelectorAll("button")).filter(button => /PowerPoint|PDF/.test(button.textContent ?? ""));
    expect(again.every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("D-50: a profile that failed to load is said, and the export still works without logos or prefix", () => {
    h.profile = undefined; h.profileError = new Error("down");
    render(<WeeklyReport />);
    expect(screen.getByRole("note").textContent).toContain("without logos");
    const buttons = Array.from(document.querySelector("[data-weekly-exports]")!.querySelectorAll("button")).filter(button => /PowerPoint|PDF/.test(button.textContent ?? ""));
    expect(buttons.every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
  });
});
