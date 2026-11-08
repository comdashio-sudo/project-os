// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStart, projectStartStep } from "./ProjectStart";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
afterEach(() => cleanup());

describe("ProjectStart (work order 21: the empty project's start card and steps bar)", () => {
  it("an empty project shows the start card with its three ways in, and the steps bar at the first step", () => {
    const onUpload = vi.fn(); const onManual = vi.fn();
    render(<ProjectStart counts={{ activities: 0, budgets: 0, progress: 0 }} onUpload={onUpload} onManual={onManual} />);
    expect(screen.getByRole("heading", { name: "Start your project" })).toBeTruthy();
    expect(screen.getByText("Upload the P6 programme, or the progress report, or add by hand.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload the P6 programme" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload the progress report" }));
    fireEvent.click(screen.getByRole("button", { name: "Add by hand" }));
    expect(onUpload).toHaveBeenCalledTimes(2); expect(onManual).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation", { name: "Project start steps" }).querySelector('[aria-current="step"]')?.textContent).toContain("Schedule");
  });

  it("once something is recorded the card goes and only the bar of what is left stays", () => {
    render(<ProjectStart counts={{ activities: 4, budgets: 0, progress: 0 }} onUpload={vi.fn()} onManual={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Start your project" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Project start steps" }).querySelector('[aria-current="step"]')?.textContent).toContain("Budget");
  });

  it("disappears when every step has data", () => {
    const { container } = render(<ProjectStart counts={{ activities: 4, budgets: 2, progress: 1 }} onUpload={vi.fn()} onManual={vi.fn()} />);
    expect(container.textContent).toBe("");
    expect(projectStartStep({ activities: 1, budgets: 1, progress: 1 })).toBe(3);
    expect(projectStartStep({ activities: 0, budgets: 1, progress: 1 })).toBe(0);
  });

  it("names the step for each of the four states, and leaves out the buttons a person may not use", () => {
    expect(projectStartStep({ activities: 0, budgets: 0, progress: 0 })).toBe(0);
    expect(projectStartStep({ activities: 2, budgets: 0, progress: 0 })).toBe(1);
    expect(projectStartStep({ activities: 2, budgets: 1, progress: 0 })).toBe(2);
    expect(projectStartStep({ activities: 2, budgets: 1, progress: 5 })).toBe(3);
    render(<ProjectStart counts={{ activities: 0, budgets: 0, progress: 0 }} />);
    expect(screen.getByRole("heading", { name: "Start your project" })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
