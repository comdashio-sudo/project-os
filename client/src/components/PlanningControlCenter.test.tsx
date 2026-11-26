// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningControlCenter } from "./PlanningControlCenter";
import { calculatePlanningControl, planningHeadline } from "@/lib/planningControl";

// Q-64: the planning page's top block reads at a glance — one sentence, sections only when there is something to say, what is missing as one step with its button.
let language: "ar" | "en" | "ur" = "ar";
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: language === "ar", language, isRtl: language !== "en", setLanguage: vi.fn() }) }));
afterEach(() => { cleanup(); language = "ar"; });

const ASOF = new Date("2026-06-01");
const activities = (count: number, started: number) => Array.from({ length: count }, (_unused, index) => ({ id: `a${index}`, code: `A${index}`, name: `Activity ${index}`, status: index < started ? "in_progress" : "not_started", plannedStartAt: "2026-05-01", plannedFinishAt: index < 2 ? "2026-05-20" : "2026-09-01" }));
const input = (over: Partial<Parameters<typeof calculatePlanningControl>[0]> = {}) => ({ activities: [], boq: [], requisitions: [], budgets: [], costs: [], commitments: [], warehouseBalances: [], asOf: ASOF, ...over });
// what the owner saw on a project imported from P6 with no budget: 31 activities, nothing else
const ownerProject = () => calculatePlanningControl(input({ activities: activities(31, 3) }));
// words that are the platform's own, which the owner called «stupid»: none may reach the page in any language
const INTERNAL = ["فجوات البيانات", "الناقص", "لقطة EVM", "قراءة مشتقة", "مركز التخطيط وضبط التكلفة", "قرار واحد مبني", "حركة الكميات", "Data gaps", "derived", "EVM", "Quantity movement", "PLANNING · COST", "غير مربوطة بـWBS", "BOQ"];

describe("PlanningControlCenter (Q-64)", () => {
  it("the owner's project (31 activities, no budget): one sentence in a planner's words, and the missing budget is a step with its button — no zero card", () => {
    const upload = vi.fn();
    render(<PlanningControlCenter result={ownerProject()} currency="SAR" onUpload={upload} />);
    expect(document.querySelector("[data-planning-headline]")!.textContent).toBe("31 نشاطًا، بدأ منها 3 (9.7%)، 2 متأخرة عن موعدها.");
    expect(screen.getByText("لا ميزانية بعد")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ارفع الميزانية" }));
    expect(upload).toHaveBeenCalledTimes(1);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/0\.000/); // before: «0.000 / 0.000» and «0.000»
    expect(text).not.toMatch(/(^|\s)0\.00(\s|$)/);
    for (const word of INTERNAL) expect(text, word).not.toContain(word);
    expect(screen.queryByText("المواد والمستودع")).toBeNull(); // no requests and no stock: no section
    expect(screen.queryByText("التكلفة")).toBeNull();
  });

  it("with a budget: the cost section appears, with the amounts grouped and without padding zeros, and the sentence says what is spent", () => {
    const result = calculatePlanningControl(input({ activities: activities(31, 3), budgets: [{ currentAmount: 12500000 }], costs: [{ amount: 3125000, status: "posted", wbsItemId: "w" }] }));
    render(<PlanningControlCenter result={result} currency="SAR" />);
    expect(screen.getByText("التكلفة")).toBeTruthy();
    expect(screen.getAllByText(/12,500,000/).length).toBeGreaterThan(0);
    expect(document.querySelector("[data-planning-headline]")!.textContent).toContain("(25%)");
    expect(document.body.textContent).not.toMatch(/12,500,000\.00/);
    expect(screen.queryByText("لا ميزانية بعد")).toBeNull();
  });

  it("an over-spent budget says so", () => {
    const result = calculatePlanningControl(input({ activities: activities(4, 4), budgets: [{ currentAmount: 1000 }], costs: [{ amount: 1500, status: "posted", wbsItemId: "w" }] }));
    render(<PlanningControlCenter result={result} currency="SAR" />);
    expect(screen.getByText("تجاوز الميزانية")).toBeTruthy();
  });

  it("no schedule at all: the sentence and the one step say so; there is no status badge and no card", () => {
    const upload = vi.fn();
    render(<PlanningControlCenter result={calculatePlanningControl(input())} currency="SAR" onUpload={upload} />);
    expect(document.querySelector("[data-planning-headline]")!.textContent).toContain("لا جدول زمني بعد");
    fireEvent.click(screen.getByRole("button", { name: "ارفع الجدول" }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("يحتاج انتباهًا")).toBeNull();
  });

  it("NEGATIVE: a reader who may not import sees the step's sentence and no button", () => {
    render(<PlanningControlCenter result={ownerProject()} currency="SAR" />);
    expect(screen.getByText("لا ميزانية بعد")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("NEGATIVE: a reader who may not see the money gets one sentence about it — no budget step, no amounts", () => {
    const result = calculatePlanningControl(input({ activities: activities(5, 1), moneyVisible: false }));
    render(<PlanningControlCenter result={result} currency="SAR" onUpload={vi.fn()} />);
    expect(screen.getByText(/تحتاج صلاحية قراءة التدفق النقدي/)).toBeTruthy();
    expect(screen.queryByText("لا ميزانية بعد")).toBeNull();
    expect(document.querySelector("[data-planning-headline]")!.textContent).not.toMatch(/ر\.س|SAR/);
  });

  it("materials: shown only when there are requests or stock, and a quantity is written as it is (12 not 12.000)", () => {
    const result = calculatePlanningControl(input({ activities: activities(3, 1), requisitions: [{ id: "r", requisitionNumber: "R1", requestedQuantity: 20, issuedQuantity: 12, remainingQuantity: 8, status: "open" }], warehouseBalances: [{ quantityOnHand: 7.5 }] }));
    render(<PlanningControlCenter result={result} currency="SAR" />);
    expect(screen.getByText("12 من 20")).toBeTruthy();
    expect(screen.getByText("7.5")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d\.000/);
  });

  it("the three languages carry the same sentence and no platform wording (Latin digits only)", () => {
    for (const lang of ["ar", "en", "ur"] as const) {
      language = lang;
      render(<PlanningControlCenter result={ownerProject()} currency="SAR" onUpload={vi.fn()} />);
      const text = document.body.textContent ?? "";
      expect(text, lang).toMatch(/31/);
      expect(text, lang).not.toMatch(/[٠-٩۰-۹]/);
      for (const word of INTERNAL) expect(text, `${lang} ${word}`).not.toContain(word);
      cleanup();
    }
    expect(planningHeadline(ownerProject(), "SAR", "en")).toBe("31 activities, 3 started (9.7%), 2 past their planned finish.");
  });
});
