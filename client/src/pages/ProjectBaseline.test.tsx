// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-10 (a): the project's base-file checklist. Fabricated numbers only.
const h = vi.hoisted(() => ({
  canManage: true, language: "en" as "en" | "ar" | "ur",
  status: undefined as unknown, statusError: null as unknown,
  saveContract: vi.fn(), saveError: null as unknown, template: vi.fn(),
  preview: vi.fn(), previewData: undefined as unknown, saveCashFlow: vi.fn(), previewBoq: vi.fn(), boqData: undefined as unknown, labourData: undefined as unknown,
}));
const item = (code: string, state: string, count: number, detail: Record<string, unknown> = {}) => ({ code, state, count, detail });
const STATUS = {
  ready: 2, required: 7,
  items: [
    item("contract", "uploaded", 1, { contractValue: "12500000.50", plannedStartAt: "2026-01-15", plannedFinishAt: "2027-06-30" }),
    item("schedule", "uploaded", 120), item("cashFlow", "missing", 0), item("weights", "missing", 0), item("units", "missing", 0), item("boq", "missing", 0), item("wbs", "missing", 0), item("labour", "optional", 0),
  ],
};

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children, permission }: { children: React.ReactNode; permission: string }) => (permission === "project.manage" && !h.canManage ? null : <>{children}</>) }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }), Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("./ProjectImports", () => ({ ProjectImports: ({ initialModule }: { initialModule?: string }) => <section aria-label="imports" data-module={initialModule} /> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ projects: { baseline: { status: { invalidate: vi.fn() } } } }),
    projects: { baseline: {
      status: { useQuery: () => ({ data: h.status, error: h.statusError, refetch: vi.fn() }) },
      saveContract: { useMutation: () => ({ mutate: h.saveContract, isPending: false, error: h.saveError, isSuccess: false }) },
      previewCashFlow: { useMutation: () => ({ mutate: h.preview, data: h.previewData, isPending: false, isError: false, error: null }) },
      previewLabour: { useMutation: () => ({ mutate: vi.fn(), data: h.labourData, isPending: false, isError: false, error: null }) },
      saveLabour: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, reset: vi.fn() }) },
      previewBoq: { useMutation: () => ({ mutate: h.previewBoq, data: h.boqData, isPending: false, isError: false, error: null }) },
      saveBoq: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, reset: vi.fn() }) },
      saveCashFlow: { useMutation: () => ({ mutate: h.saveCashFlow, isPending: false, error: null, isSuccess: false, reset: vi.fn() }) },
    } },
    dataImports: { template: { useMutation: () => ({ mutate: h.template, isPending: false }) } },
  },
}));

import ProjectBaseline from "./ProjectBaseline";

const refusal = (code: string) => Object.assign(new Error(`English sentence for ${code}`), { data: { code: "BAD_REQUEST", projectError: { code, messages: { ar: `sentence for ${code}`, en: `sentence for ${code}`, ur: `sentence for ${code}` } } } });
beforeEach(() => { h.canManage = true; h.language = "en"; h.status = STATUS; h.statusError = null; h.saveError = null; h.saveContract.mockReset(); h.template.mockReset(); h.preview.mockReset(); h.saveCashFlow.mockReset(); h.previewData = undefined; h.boqData = undefined; h.labourData = undefined; });
afterEach(() => cleanup());
const card = (code: string) => screen.getByTestId(`baseline-${code}`);

describe("ProjectBaseline", () => {
  it("lists the eight items in order, each with its state, and says how many required ones are ready", () => {
    render(<ProjectBaseline />);
    expect(screen.getByTestId("baseline-progress").textContent).toBe("2 of 7 required items ready");
    expect(screen.getAllByRole("listitem").filter(node => node.getAttribute("data-testid")?.startsWith("baseline-")).map(node => node.getAttribute("data-testid"))).toEqual(["baseline-contract", "baseline-schedule", "baseline-cashFlow", "baseline-weights", "baseline-units", "baseline-boq", "baseline-wbs", "baseline-labour"]);
    expect(card("schedule").textContent).toContain("Uploaded · 120 records");
    expect(card("cashFlow").textContent).toContain("Missing");
    expect(card("labour").textContent).toContain("Optional");
    expect(card("contract").textContent).toContain("Uploaded"); // the contract shows no record count
    expect(card("contract").textContent).not.toContain("records");
    // every item says in a line what it is and what it feeds
    expect(card("weights").textContent).toContain("Each activity's weight in the unit");
    expect(card("weights").textContent).toContain("Feeds: Unit and project progress");
  });

  it("the contract form carries the stored value and dates, and saves them as numbers and ISO days", () => {
    render(<ProjectBaseline />);
    const form = card("contract");
    const value = within(form).getByLabelText(/^Contract value/) as HTMLInputElement;
    expect(value.value).toBe("12500000.5");
    expect((within(form).getByLabelText(/^Start date/) as HTMLInputElement).value).toBe("2026-01-15");
    fireEvent.change(value, { target: { value: "9000000" } });
    fireEvent.change(within(form).getByLabelText(/^End date/), { target: { value: "2027-12-31" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save the contract" }));
    expect(h.saveContract).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", contractValue: 9000000, plannedStartAt: "2026-01-15", plannedFinishAt: "2027-12-31" });
  });

  it("NEGATIVE: a person without project.manage sees the checklist but no contract form", () => {
    h.canManage = false;
    render(<ProjectBaseline />);
    expect(within(card("contract")).queryByRole("button", { name: "Save the contract" })).toBeNull();
    expect(screen.getByTestId("baseline-progress")).toBeTruthy();
  });

  it.each([
    ["PROJECT_OS_CONTRACT_VALUE_INVALID", /^Contract value/],
    ["PROJECT_OS_CONTRACT_DATES_INVALID", /^Start date/],
  ])("NEGATIVE: the server's %s refusal is shown beside its own field", (code, label) => {
    h.saveError = refusal(code);
    render(<ProjectBaseline />);
    const field = within(card("contract")).getByLabelText(label);
    const described = document.getElementById((field.getAttribute("aria-describedby") ?? "").split(" ").pop() ?? "")?.textContent;
    expect(described).toBe(`sentence for ${code}`);
  });

  it("the schedule and WBS items open the upload panel on their own kind; the PMC items link to the PMC import; the rest say upload from here is coming", () => {
    render(<ProjectBaseline />);
    expect(screen.getByLabelText("imports").getAttribute("data-module")).toBe("schedule");
    fireEvent.click(within(card("wbs")).getByRole("button", { name: "Upload" }));
    expect(screen.getByLabelText("imports").getAttribute("data-module")).toBe("wbs");
    fireEvent.click(within(card("schedule")).getByRole("button", { name: "Excel template" }));
    expect(h.template).toHaveBeenCalledWith({ moduleCode: "schedule", locale: "en" });
    for (const code of ["weights", "units"]) expect(within(card(code)).getByRole("link").getAttribute("href")).toBe("/projects/tenant-1/project-1/pmc?tab=import");
    expect(card("cashFlow").textContent).toContain("Excel template"); // Q-10 (b): the cash flow is uploaded on its own card
  });

  it("reads right-to-left in Arabic, with the titles and states in Arabic", () => {
    h.language = "ar";
    render(<ProjectBaseline />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ملف المشروع الأساسي");
    expect(card("cashFlow").textContent).toContain("ناقص");
    expect(card("labour").textContent).toContain("اختياري");
    expect(screen.getByTestId("baseline-progress").textContent).toContain("2 من 7");
  });

  it("shows a source notice, not a blank page, when the status cannot be read", () => {
    h.status = undefined; h.statusError = refusal("PROJECT_OS_PERMISSION_DENIED");
    render(<ProjectBaseline />);
    expect(screen.queryByTestId("baseline-contract")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  // Q-10 (b): the planned cash flow item
  it("cash flow: the check report shows the months, the total and each refused row; a refused file offers no save", () => {
    h.previewData = { months: [{ month: "2027-01-01", fraction: 0.4, cumulative: 0.4 }, { month: "2027-02-01", fraction: 0.5, cumulative: 0.9 }], issues: [{ rowNumber: 4, code: "CASHFLOW_MONTH_INVALID", value: "soon" }], totalPercent: 90, fileError: null, refusal: "PROJECT_OS_CASHFLOW_ROWS_INVALID" };
    render(<ProjectBaseline />);
    const report = within(card("cashFlow")).getByTestId("cashflow-report");
    expect(report.textContent).toContain("2 months · Total: 90.00%");
    expect(report.textContent).toContain("Difference from 100%: -10.00%");
    expect(report.textContent).toContain("Row 4: Month not understood — soon");
    expect(report.textContent).toContain("Some rows of the file were refused");
    expect(within(report).queryByRole("button", { name: "Save the cash flow" })).toBeNull();
  });

  it("cash flow: a stored plan is drawn as an S-curve, and a site engineer (no project.manage) gets no upload", () => {
    h.canManage = false;
    h.status = { ...STATUS, items: STATUS.items.map(entry => entry.code === "cashFlow" ? item("cashFlow", "uploaded", 2, { curve: [{ month: "2027-01-01", cumulative: 0.3 }, { month: "2027-02-01", cumulative: 1 }] }) : entry) };
    render(<ProjectBaseline />);
    expect(within(card("cashFlow")).getByTestId("cashflow-curve").textContent).toContain("2027-01");
    expect(within(card("cashFlow")).queryByTestId("cashflow-report")).toBeNull();
    expect(card("cashFlow").querySelector("[data-dropzone]")).toBeNull();
  });

  // Q-10 (c): the BOQ item
  it("BOQ: the check report shows the items, total, new and updated counts and each refused row; a refused file offers no save", () => {
    h.boqData = { count: 2, items: [], issues: [{ rowNumber: 5, code: "BOQ_QUANTITY_INVALID", value: "abc" }], totalAmount: 49400, newCount: 1, updateCount: 1, fileError: null, refusal: "PROJECT_OS_BOQ_ROWS_INVALID" };
    render(<ProjectBaseline />);
    const report = within(card("boq")).getByTestId("boq-report");
    expect(report.textContent).toContain("2 items · Total: 49,400");
    expect(report.textContent).toContain("New: 1 · Updated: 1");
    expect(report.textContent).toContain("Row 5: Quantity is not valid — abc");
    expect(report.textContent).toContain("Some items of the file were refused");
    expect(within(report).queryByRole("button", { name: "Save the BOQ" })).toBeNull();
    expect(card("boq").textContent).toContain("Excel template");
  });

  // Q-10 (d): planned labour
  it("labour: a stored plan is drawn as a histogram with its peak; the check report names refused rows and offers no save", () => {
    h.status = { ...STATUS, items: STATUS.items.map(entry => entry.code === "labour" ? item("labour", "uploaded", 3, { histogram: [{ month: "2027-01-01", workers: 32 }, { month: "2027-02-01", workers: 35 }] }) : entry) };
    h.labourData = { count: 1, issues: [{ rowNumber: 2, code: "LABOUR_WORKERS_INVALID", value: "2.5" }], histogram: [], peak: 0, fileError: null, refusal: "PROJECT_OS_LABOUR_ROWS_INVALID" };
    render(<ProjectBaseline />);
    expect(within(card("labour")).getByTestId("labour-histogram").textContent).toContain("Peak: 35");
    const report = within(card("labour")).getByTestId("labour-report");
    expect(report.textContent).toContain("Row 2: Workers must be a whole number from zero — 2.5");
    expect(within(report).queryByRole("button", { name: "Save the planned labour" })).toBeNull();
    expect(card("labour").textContent).toContain("Uploaded · 3 records");
  });
});

