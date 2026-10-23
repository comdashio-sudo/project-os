/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuickIssue from "./QuickIssue";

const h = vi.hoisted(() => ({ arabic: false, issue: vi.fn(), search: vi.fn(), result: { totalCost: 250 } as { totalCost: number } | null, issueError: null as unknown }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic }) }));
const options = {
  warehouses: [{ id: "w1", code: "WH-1", name: "Main" }],
  units: [{ id: "u12", number: 12, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u13", number: 13, modelCode: "B", block: "B1", zone: "Z1" }],
  activities: [{ id: "a-walls", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "a-paint", modelCode: "A", code: "PAINT", name: "Paint" }, { id: "b-walls", modelCode: "B", code: "WALLS", name: "Walls" }],
  activitiesWithoutWbs: 0,
};
const cement = { id: "m1", code: "CEM-1", description: "Cement bag", unit: "bag", onHand: 40, exact: false };
vi.mock("@/lib/trpc", () => ({ trpc: { warehouses: {
  cellOptions: { useQuery: () => ({ data: options, isLoading: false, error: null, refetch: vi.fn() }) },
  findMaterial: { useQuery: (input: { query: string }, config: { enabled: boolean }) => { if (config.enabled) h.search(input.query); return { data: config.enabled && input.query.toLowerCase().includes("cem") ? [cement] : config.enabled ? [] : undefined }; } },
  issueToCell: { useMutation: (config: { onSuccess: (result: unknown) => void }) => ({ mutate: (input: unknown) => { h.issue(input); if (!h.issueError) config.onSuccess(h.result); }, isPending: false, error: h.issueError }) },
} } }));

beforeEach(() => { localStorage.clear(); h.issue.mockReset(); h.search.mockReset(); h.arabic = false; h.issueError = null; });
afterEach(cleanup);
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("QuickIssue", () => {
  it("find → quantity → unit → activity → save, in one pass", () => {
    render(<QuickIssue />);
    type("Search by code or name", "cem");
    fireEvent.click(screen.getByText("CEM-1"));
    type(/Quantity/, "5");
    type("Unit number", "12");
    const activity = screen.getByLabelText(/Activity/) as HTMLSelectElement;
    expect(Array.from(activity.options).map(option => option.value)).toEqual(["", "a-walls", "a-paint"]); // model A's activities only
    fireEvent.change(activity, { target: { value: "a-walls" } });
    fireEvent.click(screen.getByText("Save issue"));
    expect(h.issue).toHaveBeenCalledTimes(1);
    expect(h.issue.mock.calls[0][0]).toMatchObject({ tenantId: "t", projectId: "p", warehouseId: "w1", materialId: "m1", pmcUnitId: "u12", pmcActivityDefinitionId: "a-walls", issuedQuantity: 5 });
    expect(screen.getByRole("status").textContent).toContain("Cost charged: 250");
  });

  it("does not offer Save for an unknown unit, an unpicked activity, or more than is on the shelf", () => {
    render(<QuickIssue />);
    type("Search by code or name", "cem"); fireEvent.click(screen.getByText("CEM-1"));
    const save = screen.getByText("Save issue").closest("button") as HTMLButtonElement;
    type("Unit number", "99");
    expect(screen.getByRole("alert").textContent).toContain("No unit with that number");
    expect(save.disabled).toBe(true);
    type("Unit number", "12");
    expect(save.disabled).toBe(true); // no activity yet
    fireEvent.change(screen.getByLabelText(/Activity/), { target: { value: "a-walls" } });
    expect(save.disabled).toBe(false);
    type(/Quantity/, "41");
    expect(screen.getByText("More than is on the shelf")).toBeTruthy();
    expect(save.disabled).toBe(true);
  });

  it("the next issue is find → quantity → save: the unit and the activity of the last one are kept", () => {
    render(<QuickIssue />);
    type("Search by code or name", "cem"); fireEvent.click(screen.getByText("CEM-1"));
    type("Unit number", "12"); fireEvent.change(screen.getByLabelText(/Activity/), { target: { value: "a-paint" } });
    fireEvent.click(screen.getByText("Save issue"));
    fireEvent.click(screen.getByText("Issue another"));
    type("Search by code or name", "cem"); fireEvent.click(screen.getByText("CEM-1"));
    expect((screen.getByLabelText("Unit number") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText(/Activity/) as HTMLSelectElement).value).toBe("a-paint");
    fireEvent.click(screen.getByText("Save issue"));
    expect(h.issue).toHaveBeenCalledTimes(2);
    expect(h.issue.mock.calls[1][0]).toMatchObject({ pmcActivityDefinitionId: "a-paint", issuedQuantity: 1 });
  });

  it("says so when nothing matches, and speaks Arabic", () => {
    h.arabic = true;
    render(<QuickIssue />);
    type("ابحث بالرمز أو الاسم", "zzz");
    expect(screen.getByText("لا توجد مادة بهذا الاسم")).toBeTruthy();
    expect(screen.getByText("صرف سريع إلى وحدة")).toBeTruthy();
  });
});
