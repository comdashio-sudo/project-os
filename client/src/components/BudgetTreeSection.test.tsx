/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetTreeSection } from "./BudgetTreeSection";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
afterEach(() => cleanup());

// Q-65: the budget as a tree by cost code on the planning page. Synthetic codes only.
const lines = [
  { costCode: "GC.100-000.01", originalAmount: "1000.00", currentAmount: "1100.00" },
  { costCode: "GC.100-000.02", originalAmount: "2500.50", currentAmount: "2500.50" },
  { costCode: "GC.100-001.01", originalAmount: "400.00", currentAmount: "400.00" },
];

describe("BudgetTreeSection", () => {
  it("shows each parent with the sum of its leaves, and the project total once", () => {
    const view = render(<BudgetTreeSection budgets={lines} currency="SAR" />);
    expect(view.container.querySelector("[data-budget-tree-total]")!.textContent).toContain("4,000.5 SAR");
    const rowOf = (code: string) => Array.from(view.container.querySelectorAll("tbody tr")).find(row => row.textContent!.startsWith(code))!.textContent!;
    expect(rowOf("GC.100-000")).toContain("3,500.5"); // the first parent: 1,000 + 2,500.50
    expect(rowOf("GC.100-000")).toContain("3,600.5"); // its current amount: 1,100 + 2,500.50
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(7); // GC, GC.100, two parents, three leaves
  });
  it("draws nothing for a budget with no lines (someone who may not see the money gets none)", () => {
    const view = render(<BudgetTreeSection budgets={[]} currency="SAR" />);
    expect(view.container.querySelector("[data-budget-tree]")).toBeNull();
  });
});
