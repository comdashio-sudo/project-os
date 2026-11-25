// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageActions, PrintHeader, stampOf } from "./PageActions";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("PageActions and PrintHeader (Q-57)", () => {
  it("«Print» opens the browser's print for the page", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<PageActions pageTitle="Safety" />);
    fireEvent.click(screen.getByRole("button", { name: "Print / PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
  });
  it("«Export tables» says so when the page has none, and downloads nothing", async () => {
    render(<><div data-page-content><p>text only</p></div><PageActions pageTitle="Safety" /></>);
    fireEvent.click(screen.getByRole("button", { name: /Export tables/ }));
    await waitFor(() => expect(screen.getByText("This page has no tables to export.")).toBeTruthy());
  });
  it("the buttons are left off the paper", () => {
    const { container } = render(<PageActions pageTitle="Safety" />);
    expect(container.querySelector("[data-page-actions]")?.hasAttribute("data-no-print")).toBe(true);
  });
  it("the printed header names the company, the project, the day and who printed it, and is drawn on paper only", () => {
    const { container } = render(<PrintHeader pageTitle="Risk register" company="Demo Co" project="PRJ-1 · Demo" user="Site Engineer" />);
    const header = container.querySelector("[data-print-header]")!;
    expect(header.className).toContain("hidden");
    expect(header.className).toContain("print:block");
    for (const text of ["Risk register", "Demo Co", "PRJ-1 · Demo", "Site Engineer", stampOf(new Date()).slice(0, 10)]) expect(header.textContent).toContain(text);
  });
});
