/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardedPanels, SectionErrorBoundary, SectionMessage } from "./SectionResilience";

afterEach(cleanup);

describe("SectionMessage", () => {
  it("distinguishes the four localized section states", () => {
    const { rerender } = render(<SectionMessage title="Section" isArabic={false} kind="loading" />);
    expect(screen.getByText("Loading this section…")).toBeTruthy();
    rerender(<SectionMessage title="Section" isArabic={false} kind="empty" />);
    expect(screen.getByText("No data is available for this section in the current access scope.")).toBeTruthy();
    rerender(<SectionMessage title="Section" isArabic={false} kind="error" />);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
    rerender(<SectionMessage title="القسم" isArabic kind="partial" />);
    expect(screen.getByText("تتوفر بيانات جزئية فقط؛ يُشار إلى المصادر الناقصة أدناه.")).toBeTruthy();
  });

  it("contains a deliberate section render failure without unmounting its sibling", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const FailingSection = () => { throw new Error("deliberate section failure"); };
    render(<div>
      <SectionErrorBoundary title="Failed section" isArabic={false}><FailingSection /></SectionErrorBoundary>
      <section aria-label="Available section">Sibling content remains available</section>
    </div>);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
    expect(screen.getByText("Sibling content remains available")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("gives every panel of a composed page its own boundary: the failed one is named, can be retried, and the others stay", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let broken = true;
    function FirstPanel() { if (broken) throw new Error("deliberate panel failure"); return <p>First panel recovered</p>; }
    function SecondPanel() { return <p>Second panel works</p>; }
    render(<GuardedPanels isArabic={false} titles={{ FirstPanel: { ar: "اللوحة الأولى", en: "The first panel", ur: "The first panel" } }}><FirstPanel /><SecondPanel /></GuardedPanels>);
    const failed = screen.getByRole("region", { name: "The first panel" });
    expect(failed.textContent).toContain("This section could not be loaded");
    expect(screen.getByText("Second panel works")).toBeTruthy();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("First panel recovered")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("names a failed panel in Arabic, and falls back to a generic name for a panel it has no title for", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Known(): React.ReactElement { throw new Error("x"); }
    function Unknown(): React.ReactElement { throw new Error("y"); }
    render(<GuardedPanels isArabic titles={{ Known: { ar: "لوحة معروفة", en: "Known", ur: "Known" } }}><Known /><Unknown /></GuardedPanels>);
    expect(screen.getByRole("region", { name: "لوحة معروفة" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "هذا القسم" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "أعد المحاولة" }).length).toBe(2);
    consoleError.mockRestore();
  });
});
