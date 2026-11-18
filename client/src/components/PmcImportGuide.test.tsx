// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PmcImportKindList, PmcImportTemplateGuide, type PmcKindStatus } from "./PmcImportGuide";

// Q-35: the import kinds with their saved state, and the template guide. Made-up data only.
afterEach(() => cleanup());
const labels = { weights: "Weights table", locations: "Villa list", catalog: "Catalogue", status: "Unit-activity status", requests: "Requests", baseline: "Baseline", baselineDates: "Baseline by dates" };
const row = (kind: string, state: PmcKindStatus["state"], extra: Partial<PmcKindStatus> = {}): PmcKindStatus => ({ kind, state, lastAttemptAt: null, lastImportedAt: null, createdRows: 0, updatedRows: 0, ...extra });

describe("PMC import kinds and template guide (Q-35)", () => {
  it("each state has its own words and icon, not colour alone; a completed import names its date and counts", () => {
    const statuses = [row("weights", "completed", { lastImportedAt: "2027-01-05T10:00:00.000Z", createdRows: 7, updatedRows: 2 }), row("locations", "pending"), row("catalog", "none"), row("status", "failed", { lastImportedAt: "2027-01-04T10:00:00.000Z", createdRows: 3 }), row("requests", "analyzing")];
    render(<PmcImportKindList kind="weights" onChange={vi.fn()} labels={labels} statuses={statuses} language="en" />);
    const card = (kind: string) => screen.getByRole("radio", { name: new RegExp(labels[kind as keyof typeof labels]) });
    expect(within(card("weights")).getByText("Import complete")).toBeTruthy();
    expect(card("weights").textContent).toContain("7 created · 2 updated");
    expect(card("weights").textContent).toMatch(/Last successful import: .*2027/);
    expect(within(card("locations")).getByText("Waiting for confirmation")).toBeTruthy();
    expect(within(card("catalog")).getByText("Not imported")).toBeTruthy();
    expect(within(card("status")).getByText("Failed")).toBeTruthy();
    expect(card("status").textContent).toContain("The last attempt failed; last successful import");
    expect(within(card("requests")).getByText("Analysing")).toBeTruthy();
    for (const state of ["completed", "pending", "none", "failed", "analyzing"]) expect(document.querySelector(`[data-import-state=${state}] svg`)).not.toBeNull();
  });

  it("NEGATIVE: a kind uploaded but not confirmed is never shown as complete, and has no «last successful import»", () => {
    render(<PmcImportKindList kind="weights" onChange={vi.fn()} labels={labels} statuses={[row("locations", "pending")]} language="en" />);
    const card = screen.getByRole("radio", { name: /Villa list/ });
    expect(card.textContent).not.toContain("Import complete");
    expect(card.textContent).not.toContain("Last successful import");
  });

  it("choosing a kind tells the screen, and the chosen one is marked; without a status (a failed lookup) the list still works and says so", () => {
    const onChange = vi.fn();
    render(<PmcImportKindList kind="weights" onChange={onChange} labels={labels} statusFailed language="ar" />);
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getAllByRole("radio").find(node => node.getAttribute("aria-checked") === "true")?.getAttribute("data-kind")).toBe("weights");
    fireEvent.click(screen.getAllByRole("radio").find(node => node.getAttribute("data-kind") === "baselineDates")!);
    expect(onChange).toHaveBeenCalledWith("baselineDates");
    expect(screen.getByRole("note").textContent).toContain("تعذّر قراءة حالة الاستيراد");
  });

  it("the guide says what the template does, when, its required and optional columns, the format, an example, what happens after and where to see it — in each language", () => {
    for (const language of ["ar", "en", "ur"] as const) {
      render(<PmcImportTemplateGuide kind="locations" language={language} />);
      const guide = screen.getByTestId("pmc-import-guide");
      expect(guide.querySelectorAll("dt")).toHaveLength(5); // what, when, format, after, where (the columns and the example are their own blocks)
      expect(guide.querySelectorAll("[data-required=true]").length).toBe(3);
      expect(guide.querySelectorAll("[data-required=false]").length).toBe(5);
      expect(screen.getByTestId("pmc-import-guide-example").querySelectorAll("tbody tr").length).toBe(2);
      cleanup();
    }
    render(<PmcImportTemplateGuide kind="status" language="en" />);
    expect(screen.getByTestId("pmc-import-guide").textContent).toContain("Where to see the data");
    expect(screen.getByTestId("pmc-import-guide-columns").textContent).toContain("not started / in progress / under review / complete");
  });
});
