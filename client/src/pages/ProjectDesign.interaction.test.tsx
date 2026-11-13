// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDesign } from "./ProjectDesign";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { TYPING_TEST } from "@/test/typing";

const hoisted = vi.hoisted(() => {
  const state = { arabic: true, calls: {} as Record<string, ReturnType<typeof vi.fn>>, empty: false };
  const mutation = (name: string) => ({ useMutation: () => ({ mutate: state.calls[name] ?? (state.calls[name] = vi.fn()), isPending: false, error: null }) });
  const query = (data: unknown) => ({ useQuery: () => ({ data: state.empty ? (Array.isArray(data) ? [] : data) : data, isLoading: false, error: null, refetch: vi.fn() }) });
  return { state, mutation, query };
});
const { state } = hoisted;
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized" }));
vi.mock("@/lib/trpc", () => ({ trpc: { design: {
  dashboard: hoisted.query({ drawings: { total: 4, approved: 1, completionPercent: 25, byStatus: {}, disciplines: [{ discipline: "architectural", total: 3, approved: 1 }, { discipline: "structural", total: 1, approved: 0 }] }, comments: { open: 1, responded: 1, closed: 3, overdue: 1 }, submittals: { draft: 0, awaitingReply: 2, replied: 1, closed: 0, overdue: 1, averageReplyDays: 4.5, replies: { A: 1, B: 0, C: 1, D: 0 } }, transmittals: { draft: 0, sent: 1, acknowledged: 0 } }),
  drawings: hoisted.query([{ id: "d1", drawingNumber: "A-101", title: "Ground floor", discipline: "architectural", status: "under_review", currentRevision: "B", currentRevisionId: "r1", unresolvedComments: 2 }]),
  transmittals: hoisted.query([{ id: "t1", transmittalNumber: "TR-1", direction: "outgoing", counterparty: "Consultant", subject: "Issue", status: "draft", items: ["A-101 / B"] }]),
  comments: hoisted.query([{ id: "c1", commentNumber: "RC-1", drawingNumber: "A-101", revision: "B", raisedBy: "Consultant", severity: "major", commentText: "Door clash", status: "responded", responseText: "Moved", dueAt: null }]),
  submittals: hoisted.query([{ id: "s1", submittalNumber: "SUB-1", title: "Facade", discipline: "architectural", status: "submitted", replyCode: null, replyNote: null, dueAt: null, resubmissionOfId: null }]),
  registerDrawing: hoisted.mutation("registerDrawing"), addRevision: hoisted.mutation("addRevision"), cancelDrawing: hoisted.mutation("cancelDrawing"), approveDrawing: hoisted.mutation("approveDrawing"), createTransmittal: hoisted.mutation("createTransmittal"), transitionTransmittal: hoisted.mutation("transitionTransmittal"), raiseComment: hoisted.mutation("raiseComment"), transitionComment: hoisted.mutation("transitionComment"), createSubmittal: hoisted.mutation("createSubmittal"), transitionSubmittal: hoisted.mutation("transitionSubmittal"),
} } }));

describe("ProjectDesign", TYPING_TEST, () => {
  beforeEach(() => { state.arabic = true; state.calls = {}; state.empty = false; }); afterEach(cleanup);

  it("shows the design-phase board in Arabic, with the share approved and the consultant replies", () => {
    render(<ProjectDesign tenantId="t1" projectId="p1" />);
    const board = screen.getByLabelText("لوحة مرحلة التصميم");
    expect(within(board).getByText("25%")).toBeTruthy();
    expect(within(board).getByText("1 / 4")).toBeTruthy();
    expect(within(board).getByText(/A 1 · B 0 · C 1 · D 0/)).toBeTruthy();
    expect(within(screen.getByLabelText("حسب التخصص")).getByText("معماري")).toBeTruthy();
  });

  it("registers a drawing with its number, discipline and first revision", async () => {
    const user = userEvent.setup(); render(<ProjectDesign tenantId="t1" projectId="p1" />);
    await user.type(screen.getByLabelText("الرقم", { selector: "#dg-number" }), "S-201");
    await user.type(screen.getByLabelText("العنوان", { selector: "#dg-title" }), "Slab plan");
    await user.selectOptions(screen.getByLabelText("التخصص", { selector: "#dg-discipline" }), "structural");
    await user.click(screen.getByRole("button", { name: "تسجيل مخطط" }));
    expect(state.calls.registerDrawing).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", projectId: "p1", drawingNumber: "S-201", title: "Slab plan", discipline: "structural", revision: "A" }), expect.anything());
  });

  it("offers approval only on a drawing under review, and the reply codes A–D on a sent submittal", async () => {
    const user = userEvent.setup(); render(<ProjectDesign tenantId="t1" projectId="p1" />);
    await user.click(screen.getByRole("button", { name: "اعتماد للتنفيذ" }));
    expect(state.calls.approveDrawing).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", drawingId: "d1" });
    await user.selectOptions(screen.getByLabelText("رمز الرد SUB-1"), "C");
    await user.click(screen.getByRole("button", { name: "تسجيل الرد" }));
    expect(state.calls.transitionSubmittal).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", submittalId: "s1", nextStatus: "replied", replyCode: "C" });
  });

  it("closes a responded comment and sends a draft transmittal", async () => {
    const user = userEvent.setup(); render(<ProjectDesign tenantId="t1" projectId="p1" />);
    await user.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(state.calls.transitionComment).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", commentId: "c1", nextStatus: "closed" });
    await user.click(screen.getByRole("button", { name: "إرسال" }));
    expect(state.calls.transitionTransmittal).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", transmittalId: "t1", nextStatus: "sent" });
  });

  it("renders in English too, and an empty register says so instead of showing nothing", () => {
    state.arabic = false; state.empty = true; render(<ProjectDesign tenantId="t1" projectId="p1" />);
    expect(screen.getByText("Drawing register")).toBeTruthy();
    expect(screen.getAllByText("No records yet.").length).toBe(4);
  });
});

describe("ProjectDesign checks its forms in the page's language (D-65)", () => {
  it("an empty drawing registers nothing and says so in Arabic under its first field", () => {
    state.arabic = true; state.calls.registerDrawing = vi.fn();
    render(<ProjectDesign tenantId="t1" projectId="p1" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ar", state.calls.registerDrawing);
  });
});
