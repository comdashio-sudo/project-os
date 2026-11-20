/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkConfirmationApprovals } from "./WorkConfirmationApprovals";

// Q-43 batch 4c: the approver's list. Synthetic subcontractors and villas only.
const h = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", can: true, mutate: vi.fn(), error: null as unknown, data: [] as unknown[] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/permissions")>()), useCan: () => h.can }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ workConfirmations: { list: { invalidate: vi.fn() } } }),
  workConfirmations: {
    list: { useQuery: () => ({ data: h.data, isLoading: false, error: null }) },
    transition: { useMutation: () => ({ mutate: h.mutate, reset: vi.fn(), isPending: false, error: h.error }) },
  },
} }));
const line = (over: Record<string, unknown> = {}) => ({ id: "l1", kind: "unit", percent: 40, quantity: null, unitNumber: 12, activityCode: "PLASTER", activityName: "Plaster", boqCode: null, unitOfMeasure: null, historical: false, correctsLineId: null, previousApproved: 60, warnings: ["SITE_NOT_COMPLETE", "QC_NOT_RECEIVED"], ...over });
const confirmation = (over: Record<string, unknown> = {}) => ({ id: "wc-1", number: "WC-7", subcontractorName: "Synthetic Finishers", subcontractCode: "SC-1", periodStart: "2026-11-01", periodEnd: "2026-11-15", status: "submitted", note: null, rejectionReason: null, lines: [line()], ...over });
beforeEach(() => { h.language = "en"; h.can = true; h.mutate.mockReset(); h.error = null; h.data = [confirmation(), confirmation({ id: "wc-0", number: "WC-6", status: "approved", lines: [line({ id: "l0", percent: 60, previousApproved: 0, warnings: [] })] })]; });
afterEach(cleanup);

describe("WorkConfirmationApprovals (Q-43 batch 4c)", () => {
  it("POSITIVE: a sent confirmation shows each line with what was approved before and the warnings; approving sends that confirmation", () => {
    render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    expect(screen.getAllByText("Villa 12 · PLASTER — Plaster")).toHaveLength(2); // the sent one and the approved one below
    expect(screen.getAllByText("Approved before:", { exact: false })[0].textContent).toContain("60%");
    expect(screen.getAllByText("Site not complete")).toHaveLength(1);
    expect(screen.getAllByText("Not received by QC")).toHaveLength(1);
    expect(screen.getByText("Earlier decisions")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1); // only the sent one, not the approved one
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(h.mutate).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", confirmationId: "wc-1", nextStatus: "approved" });
  });

  it("POSITIVE: rejecting takes a reason and sends it", () => {
    render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Reason for rejecting"), { target: { value: "  Villa 12 is not plastered  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm the rejection" }));
    expect(h.mutate).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", confirmationId: "wc-1", nextStatus: "rejected", reason: "Villa 12 is not plastered" });
  });

  it("NEGATIVE: a reason under three characters is not sent; without the approve permission there is no button; the server's refusal (self-approval) is shown", () => {
    const { unmount } = render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Reason for rejecting"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm the rejection" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Enter a reason of at least three characters.");
    unmount();
    h.can = false;
    const second = render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    second.unmount();
    h.can = true; h.error = { data: { projectError: { messages: { ar: "ذاتي", en: "You cannot approve a confirmation you prepared", ur: "خود" } } } };
    render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    expect(screen.getByRole("alert").textContent).toBe("You cannot approve a confirmation you prepared");
  });

  it("NEGATIVE: nothing waiting says so; speaks Arabic and Urdu", () => {
    h.data = []; h.language = "ar";
    render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    expect(screen.getByText("لا إثبات بانتظار الاعتماد.")).toBeTruthy();
    cleanup();
    h.data = [confirmation()]; h.language = "ur";
    render(<WorkConfirmationApprovals tenantId="t" projectId="p" />);
    expect(screen.getByRole("button", { name: "منظور کریں" })).toBeTruthy();
  });
});
