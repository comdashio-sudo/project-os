// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ProjectTenders } from "./ProjectTenders";
import { buildTableWorkbook } from "@/lib/excelExport";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

vi.mock("@/lib/excelExport", async importOriginal => { const actual = await importOriginal<typeof import("@/lib/excelExport")>(); return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) }; });

const hoisted = vi.hoisted(() => {
  const state = { arabic: true, calls: {} as Record<string, ReturnType<typeof vi.fn>>, packageStatus: "closed" as string, comparable: 3 };
  const mutation = (name: string) => ({ useMutation: () => ({ mutate: state.calls[name] ?? (state.calls[name] = vi.fn()), isPending: false, error: null }) });
  const bids = () => [
    { id: "b2", supplierId: "s2", supplierName: "Supplier C", status: "submitted", statusReason: null, amount: 950000, currency: "SAR", adjustments: 0, levelledTotal: 950000, durationDays: 160, validityDays: null, notes: null, rank: 1, aboveLowest: 0, aboveLowestPercent: 0, versusEstimatePercent: -5, flags: ["lowest"], adjustmentLines: [] },
    { id: "b1", supplierId: "s1", supplierName: "Supplier A", status: "submitted", statusReason: null, amount: 900000, currency: "SAR", adjustments: 250000, levelledTotal: 1150000, durationDays: 180, validityDays: 60, notes: null, rank: 2, aboveLowest: 200000, aboveLowestPercent: 21.1, versusEstimatePercent: 15, flags: [], adjustmentLines: [{ id: "a1", kind: "scope_gap", description: "Waterproofing omitted", amount: 250000 }] },
    { id: "b3", supplierId: "s3", supplierName: "Supplier E", status: "withdrawn", statusReason: "pulled out", amount: 400000, currency: "SAR", adjustments: 0, levelledTotal: 400000, durationDays: null, validityDays: null, notes: null, rank: null, aboveLowest: null, aboveLowestPercent: null, versusEstimatePercent: null, flags: [], adjustmentLines: [] },
  ];
  return { state, mutation, bids };
});
const { state } = hoisted;
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized" }));
vi.mock("@/lib/trpc", () => ({ trpc: { tenders: {
  packages: { useQuery: () => ({ data: { total: 1, packages: [{ id: "p1", packageCode: "P-1", title: "Structure works", status: state.packageStatus, estimateAmount: "1000000", currency: "SAR", invitees: 4, bids: 3, lowestLevelled: 950000 }] }, isLoading: false, error: null, refetch: vi.fn() }) },
  suppliers: { useQuery: () => ({ data: [{ id: "s9", code: "S9", legalName: "Supplier Z" }], isLoading: false, error: null, refetch: vi.fn() }) },
  invitees: { useQuery: () => ({ data: [{ id: "i1", supplierId: "s1", supplierName: "Supplier A", status: "submitted" }], isLoading: false, error: null, refetch: vi.fn() }) },
  comparison: { useQuery: (_: unknown, options?: { enabled?: boolean }) => ({ data: options?.enabled === false ? undefined : { package: { id: "p1", packageCode: "P-1", title: "Structure works", status: state.packageStatus, estimateAmount: 1000000, currency: "SAR", awardedBidId: null, awardedContractId: "c1234567890", awardedCommitmentId: "k1234567890", awardJustification: null }, lowest: 950000, median: 1100000, comparable: state.comparable, bids: hoisted.bids() }, isLoading: false, error: null, refetch: vi.fn() }) },
  createPackage: hoisted.mutation("createPackage"), invite: hoisted.mutation("invite"), transitionPackage: hoisted.mutation("transitionPackage"), enterBid: hoisted.mutation("enterBid"), withdrawBid: hoisted.mutation("withdrawBid"), disqualifyBid: hoisted.mutation("disqualifyBid"), addAdjustment: hoisted.mutation("addAdjustment"), removeAdjustment: hoisted.mutation("removeAdjustment"), award: hoisted.mutation("award"),
} } }));

describe("ProjectTenders", () => {
  beforeEach(() => { state.arabic = true; state.calls = {}; state.packageStatus = "closed"; state.comparable = 3; }); afterEach(cleanup);
  const openPackage = async () => { const user = userEvent.setup(); render(<ProjectTenders tenantId="t1" projectId="p1" />); await user.click(screen.getByRole("button", { name: "فتح الحزمة" })); return user; };

  it("lists the packages with their counts and the lowest levelled price, and opens one", async () => {
    await openPackage();
    expect(screen.getByText(/P-1 · Structure works/, { selector: "b" })).toBeTruthy();
    expect(screen.getByLabelText("P-1 Structure works")).toBeTruthy();
  });

  it("shows the levelled comparison best first: rank, levelled total, the adjustment line and the flags; the withdrawn bid has no rank", async () => {
    await openPackage();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Supplier C")).toBeTruthy();
    expect(within(rows[0]).getByText("الأدنى")).toBeTruthy();
    expect(within(rows[1]).getByText(/ثغرة نطاق: Waterproofing omitted/)).toBeTruthy();
    expect(within(rows[2]).getByText(/مسحوب/)).toBeTruthy();
    expect(within(rows[2]).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("levels: adds a scope gap to a live bid and removes an adjustment line", async () => {
    const user = await openPackage();
    await user.selectOptions(screen.getByLabelText("المورد", { selector: "#ta-bid" }), "b2");
    await user.type(screen.getByLabelText("الوصف", { selector: "#ta-description" }), "Missing doors");
    await user.type(screen.getByLabelText(/المبلغ \(موجب/, { selector: "#ta-amount" }), "5000");
    await user.click(screen.getByRole("button", { name: "إضافة تسوية" }));
    expect(state.calls.addAdjustment).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", bidId: "b2", kind: "scope_gap", description: "Missing doors", amount: 5000 }, expect.anything());
    await user.click(screen.getByRole("button", { name: "حذف" }));
    expect(state.calls.removeAdjustment).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", adjustmentId: "a1" });
  });

  it("awards the chosen bid with a contract code and the justification", async () => {
    const user = await openPackage();
    await user.selectOptions(screen.getByLabelText("المورد", { selector: "#aw-bid" }), "b2");
    await user.type(screen.getByLabelText("رمز العقد"), "CT-1");
    await user.type(screen.getByLabelText(/تسبيب الترسية/), "Only two answered");
    await user.click(screen.getByRole("button", { name: "ترسية وإنشاء العقد والالتزام" }));
    expect(state.calls.award).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", packageId: "p1", bidId: "b2", contractCode: "CT-1", justification: "Only two answered" });
  });

  it("an awarded tender shows its contract and commitment and offers no award or levelling", async () => {
    state.packageStatus = "awarded";
    await openPackage();
    expect(screen.getByRole("status").textContent).toMatch(/تمت الترسية/);
    expect(screen.queryByRole("button", { name: "ترسية وإنشاء العقد والالتزام" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إضافة تسوية" })).toBeNull();
  });

  it("while bidding is open it offers bid entry, not levelling or the award", async () => {
    state.packageStatus = "open";
    await openPackage();
    expect(screen.getByRole("button", { name: "تسجيل العرض" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إغلاق باب العروض" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "إضافة تسوية" })).toBeNull();
  });

  it("renders in English too", () => {
    state.arabic = false; render(<ProjectTenders tenantId="t1" projectId="p1" />);
    expect(screen.getByText("Tender packages")).toBeTruthy();
  });
});

describe("ProjectTenders Excel export", () => {
  let anchorClick: MockInstance;
  beforeEach(() => {
    state.arabic = true; state.calls = {}; state.packageStatus = "closed"; state.comparable = 3;
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:tenders"), revokeObjectURL: vi.fn() });
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.mocked(buildTableWorkbook).mockClear();
  });
  afterEach(() => { cleanup(); anchorClick.mockRestore(); });

  const openPackage = async () => { const user = userEvent.setup(); render(<ProjectTenders tenantId="t1" projectId="p1" />); await user.click(screen.getByRole("button", { name: "فتح الحزمة" })); return user; };
  const exportComparison = async () => {
    await openPackage();
    const table = screen.getByRole("table");
    fireEvent.click(within(table.closest("section") as HTMLElement).getByRole("button", { name: "تصدير إلى Excel" }));
    await waitFor(() => expect(buildTableWorkbook).toHaveBeenCalledTimes(1));
    // The writer (exceljs, then jszip) keeps working after it has been CALLED. A test that returns here lets jsdom be torn down under it, and the late
    // `Cannot read properties of undefined (reading 'nodebuffer')` is reported as an unhandled rejection that fails the whole run. Wait for the download.
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    return { table, input: vi.mocked(buildTableWorkbook).mock.calls[0]![0] };
  };

  it("puts the Excel button beside the comparison heading, in the same section as the table", async () => {
    await openPackage();
    expect(screen.getByRole("table")).toBeTruthy();
    const section = screen.getByRole("table").closest("section") as HTMLElement;
    expect(within(section).getByRole("button", { name: "تصدير إلى Excel" })).toBeTruthy();
    expect(within(section).getByRole("heading", { level: 3, name: "مقارنة العروض وتسويتها" })).toBeTruthy();
  });

  it("exports the same headers as the table and the same three bids, withdrawn one included", async () => {
    const { table, input } = await exportComparison();
    expect(input.columns.map(column => column.header)).toEqual(Array.from(table.querySelectorAll("thead th"), th => th.textContent));
    expect(input.rows).toHaveLength(table.querySelectorAll("tbody tr").length);
    expect(input.rows).toHaveLength(3);
    expect(input.sheetName).toBe("مقارنة العروض وتسويتها");
  });

  it("gives raw figures: money stays a number, a percentage is a fraction, a missing rank is empty", async () => {
    const { input: { columns, rows } } = await exportComparison();
    const value = (header: string, rowIndex: number) => columns.find(column => column.header === header)!.value(rows[rowIndex]!);
    // rows come in the order the screen shows them: Supplier C (rank 1), Supplier A (rank 2), Supplier E (withdrawn)
    expect(value("السعر", 1)).toBe(900000);
    expect(value("بعد التسوية", 1)).toBe(1150000);
    expect(value("فوق الأدنى", 1)).toBeCloseTo(0.211, 6);
    expect(value("مقابل التقدير", 1)).toBeCloseTo(0.15, 6);
    expect(value("مقابل التقدير", 0)).toBeCloseTo(-0.05, 6);
    expect(value("الترتيب", 2)).toBeNull();
    expect(value("المورد", 2)).toBe("Supplier E");
    expect(columns.find(column => column.header === "فوق الأدنى")!.kind).toBe("percent");
    expect(columns.find(column => column.header === "السعر")!.kind).toBe("money");
  });
});

describe("ProjectTenders package form checks itself in the page's language (D-64)", () => {
  it("an empty tender package creates nothing and says so in Arabic under its first field", () => {
    cleanup(); state.arabic = true; state.calls.createPackage = vi.fn();
    render(<ProjectTenders tenantId="t1" projectId="p1" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ar", state.calls.createPackage);
  });
});
