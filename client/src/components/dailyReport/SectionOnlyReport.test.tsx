/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionOnlyReport } from "./SectionOnlyReport";

// Q-12: the HSE engineer, the QA/QC engineer and the planning engineer on the daily report — each sees their own section and saves it alone.
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", saveSection: vi.fn(), status: "draft",
  reports: [{ id: "r1", reportDate: "2026-01-05", status: "draft", weather: "clear" }, { id: "r0", reportDate: "2026-01-04", status: "approved", weather: null }],
}));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/permissions", () => ({ useCan: () => false }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/trpc", () => {
  // react-query hands back the same object until the data changes; so does this stand-in (a new object each render would loop the effect that reads it)
  const cache = new Map<string, unknown>();
  const detail = () => { if (!cache.has(h.status)) cache.set(h.status, build()); return cache.get(h.status); };
  const build = () => ({
    report: { reportNumber: "DR-001", reportDate: "2026-01-05", status: h.status, weather: null, summary: null },
    hse: [{ id: "h1", kind: "meeting", description: "Toolbox talk", peopleCount: 12, actionTaken: null }], materials: [], lines: [], labour: [], equipment: [], obstacleItems: [], tomorrow: [], photos: [],
    inspections: { wir: { submitted: 1, approved: 1, rejected: 0, pending: 0, items: [{ id: "w1", code: "WIR-001", state: "approved" }] }, rfi: { submitted: 0, approved: 0, rejected: 0, pending: 0, items: [] } },
    approval: { prepare: { at: null }, review: { at: null }, approve: { at: null } }, totals: { labour: { total: 0, day: 0, night: 0 }, equipment: { count: 0, hours: 0 }, cumulativeManDays: 0 },
  });
  return { trpc: {
    useUtils: () => ({ siteReports: { get: { invalidate: vi.fn() } } }),
    submittals: { list: { useQuery: () => ({ data: [], isLoading: false, error: null, isSuccess: true, status: "success", refetch: vi.fn() }) } },
    siteReports: {
      list: { useQuery: () => ({ data: h.reports, isLoading: false, error: null, isSuccess: true, status: "success", refetch: vi.fn() }) },
      get: { useQuery: (_input: unknown, config: { enabled: boolean }) => ({ data: config.enabled ? detail() : undefined, isLoading: false, error: null, isSuccess: config.enabled, status: "success", refetch: vi.fn() }) },
      saveSection: { useMutation: (config: { onSuccess?: () => void }) => ({ mutate: (input: unknown) => { h.saveSection(input); config.onSuccess?.(); }, isPending: false, error: null }) },
      export: { useMutation: () => ({ mutateAsync: vi.fn(async () => ({ url: "https://files.example.test/x.xlsx", fileName: "x.xlsx" })), isPending: false, error: null }) },
    },
  } };
});

beforeEach(() => { h.saveSection.mockReset(); h.status = "draft"; h.language = "en"; });
afterEach(cleanup);
const at = { tenantId: "t", projectId: "p" };

describe("SectionOnlyReport (Q-12)", () => {
  it("the HSE engineer sees the safety section of the open report, and saves it alone", () => {
    render(<SectionOnlyReport {...at} access={{ see: ["hse"], edit: ["hse"], whole: false }} />);
    // only open reports are offered to a writer
    expect(within(screen.getByLabelText("The day's report")).getAllByRole("option").map(option => option.textContent)).toEqual([expect.stringContaining("Draft")]);
    expect(screen.getByText("Safety (HSE)")).toBeTruthy();
    expect(screen.queryByText("Materials received and inspections")).toBeNull();
    expect(screen.queryByText("The whole report")).toBeNull();
    fireEvent.click(screen.getByText("Save my section"));
    expect(h.saveSection).toHaveBeenCalledWith(expect.objectContaining({ reportId: "r1", section: "hse", hse: [expect.objectContaining({ kind: "meeting", description: "Toolbox talk", peopleCount: 12 })] }));
    expect(h.saveSection.mock.calls[0][0]).not.toHaveProperty("materials");
    expect(screen.getByRole("status").textContent).toContain("saved");
  });

  it("the QA/QC engineer sees the inspections and the materials, not the safety section", () => {
    render(<SectionOnlyReport {...at} access={{ see: ["qc"], edit: ["qc"], whole: false }} />);
    expect(screen.getByText("Materials received and inspections")).toBeTruthy();
    expect(screen.queryByText("Safety (HSE)")).toBeNull();
    fireEvent.click(screen.getByText("Add material"));
    const save = screen.getByText("Save my section").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true); // an empty material row is not saved
  });

  it("NEGATIVE: a sent report is locked — no save button", () => {
    h.status = "submitted";
    render(<SectionOnlyReport {...at} access={{ see: ["hse"], edit: ["hse"], whole: false }} />);
    expect(screen.queryByText("Save my section")).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("was sent");
  });

  it("the planning engineer reads the whole report (any state) and gets the exports; edits nothing", () => {
    render(<SectionOnlyReport {...at} access={{ see: ["site", "hse", "qc"], edit: [], whole: true }} />);
    expect(within(screen.getByLabelText("The day's report")).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByLabelText("The whole report")).toBeTruthy();
    expect(screen.queryByText("Save my section")).toBeNull();
  });

  it.each(["ar", "ur"] as const)("%s: the screen speaks the language", language => {
    h.language = language;
    render(<SectionOnlyReport {...at} access={{ see: ["hse"], edit: ["hse"], whole: false }} />);
    expect(screen.getByText(language === "ar" ? "حفظ قسمي" : "میرا حصہ محفوظ کریں")).toBeTruthy();
  });
});
