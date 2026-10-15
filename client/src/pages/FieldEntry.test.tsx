/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FieldEntry from "./FieldEntry";

const state = vi.hoisted(() => ({ arabic: false, query: {} as Record<string, unknown>, progress: vi.fn(), issue: vi.fn(), refetch: vi.fn(), issueError: null as unknown }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  fieldEntry: { context: { useQuery: () => ({ ...state.query, refetch: state.refetch }) } },
  progress: { create: { useMutation: (options: { onSuccess: () => void }) => ({ mutate: (input: unknown) => { state.progress(input); options.onSuccess(); }, isPending: false, error: null }) } },
  warehouses: { issueToWork: { useMutation: (options: { onSuccess: () => void }) => ({ mutate: (input: unknown) => { state.issue(input); if (!state.issueError) options.onSuccess(); }, isPending: false, error: state.issueError }) } },
} }));

const context = {
  warehouses: [{ id: "w1", code: "WH-1", name: "Main" }],
  materials: [
    { id: "m1", code: "CEM", description: "Cement", unitOfMeasure: "bag", lastUnitCost: 18.5, timesIssued: 4, onHand: [{ warehouseId: "w1", quantity: 120 }] },
    { id: "m2", code: "NEW", description: "Never issued", unitOfMeasure: "m", lastUnitCost: null, timesIssued: 0, onHand: [{ warehouseId: "w1", quantity: 0 }] },
  ],
  wbs: [{ id: "x1", code: "1", name: "Foundations", lastPercent: 40, lastMeasuredAt: new Date() }, { id: "x2", code: "2", name: "Structure", lastPercent: null, lastMeasuredAt: null }],
  lastIssuedWbsItemId: "x2",
  can: { logProgress: true, issueMaterial: true },
};
const load = (data: unknown = context) => { state.query = { data, isLoading: false, error: null }; render(<FieldEntry />); };
afterEach(() => { cleanup(); state.arabic = false; state.query = {}; state.issueError = null; vi.clearAllMocks(); try { localStorage.clear(); } catch { /* jsdom storage */ } });

describe("FieldEntry (phone entry)", () => {
  it("logs progress in three taps: pick the item, choose the percentage, save", () => {
    load();
    fireEvent.click(screen.getByText("1 · Foundations")); // tap 1
    fireEvent.click(screen.getByText("75%")); // tap 2
    fireEvent.click(screen.getByText("Save")); // tap 3
    expect(state.progress).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", wbsItemId: "x1", percentComplete: 75 }));
    expect(screen.getByRole("status").textContent).toContain("Saved: 1 · Foundations → 75%");
    expect(screen.getByText("Record another")).toBeTruthy();
  });

  it("cannot save progress before a percentage is chosen, and steps by five from the last value", () => {
    load();
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("1 · Foundations"));
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("+5"));
    expect(screen.getByText("45%")).toBeTruthy();
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("issues material with the last unit cost, the last work item and the first warehouse already filled in", () => {
    load();
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("CEM · Cement")); // tap 1
    expect((screen.getByLabelText("Unit cost") as HTMLInputElement).value).toBe("18.5");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "10" } }); // typing
    expect(screen.getByText("185.00")).toBeTruthy();
    fireEvent.click(screen.getByText("Save")); // tap 2
    expect(state.issue).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "w1", materialId: "m1", wbsItemId: "x2", issuedQuantity: 10, unitCost: 18.5 }));
    expect(screen.getByRole("status").textContent).toContain("Issued: 10 bag CEM to 2");
  });

  it("asks for a unit cost the first time a material is issued and never saves a zero or empty quantity", () => {
    load();
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("NEW · Never issued"));
    expect((screen.getByLabelText("Unit cost") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "5" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Unit cost"), { target: { value: "7" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "0" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the form and shows the error when the issue is refused", () => {
    state.issueError = new Error("refused");
    load();
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("CEM · Cement"));
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getByRole("alert").textContent).toContain("could not complete");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("500");
  });

  it("makes every button and field at least 44px high", () => {
    load();
    const tooSmall = Array.from(document.querySelectorAll("button, input, select")).filter(node => !/min-h-\[44px\]/.test(node.getAttribute("class") ?? ""));
    expect(tooSmall.map(node => node.outerHTML.slice(0, 80))).toEqual([]);
    fireEvent.click(screen.getByText("Issue material"));
    fireEvent.click(screen.getByText("CEM · Cement"));
    const tooSmallIssue = Array.from(document.querySelectorAll("button, input, select")).filter(node => !/min-h-\[44px\]/.test(node.getAttribute("class") ?? ""));
    expect(tooSmallIssue.map(node => node.outerHTML.slice(0, 80))).toEqual([]);
  });

  it("shows loading, error with retry, and the empty cases", () => {
    state.query = { data: undefined, isLoading: true, error: null };
    const loading = render(<FieldEntry />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    loading.unmount();
    state.query = { data: undefined, isLoading: false, error: new Error("x") };
    const failed = render(<FieldEntry />);
    fireEvent.click(screen.getByText("Retry"));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    failed.unmount();
    load({ ...context, wbs: [] });
    expect(screen.getByText("This project has no work items yet.")).toBeTruthy();
  });

  it("renders in Arabic, right to left", () => {
    state.arabic = true;
    load();
    expect(screen.getByText("إدخال سريع من الموقع")).toBeTruthy();
    expect(screen.getByText("تسجيل تقدم")).toBeTruthy();
    expect(document.querySelector("main")?.getAttribute("dir")).toBe("rtl");
  });

  it("offers only what the role may do: a storekeeper lands on issue with progress disabled, and a role with neither sees why", () => {
    load({ ...context, can: { logProgress: false, issueMaterial: true } });
    expect((screen.getByRole("tab", { name: "Log progress" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("tab", { name: "Issue material" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    load({ ...context, can: { logProgress: false, issueMaterial: false } });
    expect(screen.getByRole("alert").textContent).toContain("Your role does not allow");
    expect(screen.queryByText("Save")).toBeNull();
  });
});
