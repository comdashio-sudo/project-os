// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { riskMatrix } from "@shared/riskMatrix";

// Q-27 (P-116): the risk page shows the server's matrix cell by cell (never a count of its own), a cell filters the register to its live risks, the
// overdue list names the overdue risks, the forms send exactly what was entered and appear only for a writer. Synthetic data only.
const h = vi.hoisted(() => ({ canWrite: true, update: vi.fn(), close: vi.fn(), convert: vi.fn(), data: undefined as unknown }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => (h.canWrite ? <>{children}</> : null), useCan: () => h.canWrite }));
vi.mock("@/components/OwnerSelect", () => ({ OwnerSelect: () => <span>owner</span> }));
vi.mock("@/lib/trpc", () => ({ trpc: { pmo: {
  projectRisks: { useQuery: () => ({ data: h.data, isLoading: false, error: null, refetch: vi.fn() }) },
  riskHistory: { useQuery: () => ({ data: [{ id: "h1", action: "pmo.risk_updated", actorName: "PMO (synthetic)", createdAt: "2026-11-18T08:00:00Z", changes: { probability: { from: 3, to: 2 } }, reason: null, issueCode: null }], error: null }) },
  updateRisk: { useMutation: () => ({ mutate: h.update, isPending: false, error: null }) },
  closeRisk: { useMutation: () => ({ mutate: h.close, isPending: false, error: null }) },
  convertRiskToIssue: { useMutation: () => ({ mutate: h.convert, isPending: false, error: null }) },
} } }));

import ProjectRisks from "./ProjectRisks";

const risk = (id: string, code: string, probability: number, severity: number, status = "open", nextReviewAt: string | null = null, reviewOverdue = false) => ({
  id, code, title: `Risk ${code} (synthetic)`, probability, severity, score: probability * severity, level: probability * severity >= 15 ? "critical" : probability * severity >= 10 ? "high" : probability * severity >= 5 ? "medium" : "low",
  status, ownerMembershipId: null, ownerName: null, nextReviewAt, reviewOverdue, response: null, mitigation: null, closureReason: status === "closed" ? "Done" : null, issueId: null,
});
function serverAnswer(risks: ReturnType<typeof risk>[]) {
  const matrix = riskMatrix(risks as never);
  return { asOf: "2026-11-20", risks, matrix: { cells: matrix.cells.map(row => row.map(cell => cell.length)), live: matrix.live, byLevel: matrix.byLevel }, overdueIds: risks.filter(item => item.reviewOverdue).map(item => item.id), unscheduledIds: [] };
}
beforeEach(() => { h.canWrite = true; h.update.mockReset(); h.close.mockReset(); h.convert.mockReset(); h.data = serverAnswer([risk("a", "R-01", 4, 5, "open", "2026-11-01", true), risk("b", "R-02", 4, 5, "mitigating"), risk("c", "R-03", 1, 2), risk("d", "R-04", 4, 5, "closed")]); });
afterEach(() => cleanup());

describe("ProjectRisks (Q-27, P-116)", () => {
  it("each of the 25 cells shows the server's count, and the counts add up to the live risks (the closed one is not counted)", () => {
    render(<ProjectRisks />);
    const cells = (h.data as ReturnType<typeof serverAnswer>).matrix.cells;
    for (let p = 1; p <= 5; p += 1) for (let s = 1; s <= 5; s += 1) expect(document.querySelector(`[data-cell="${p}-${s}"]`)!.textContent).toBe(String(cells[p - 1]![s - 1]));
    expect(document.querySelector('[data-cell="4-5"]')!.textContent).toBe("2");
    expect(document.querySelector("[data-live-count]")!.textContent).toBe("Live risks: 3");
  });

  it("a cell filters the register to its live risks; pressing it again (or «Show all») shows every risk", () => {
    render(<ProjectRisks />);
    fireEvent.click(screen.getByRole("button", { name: "Probability 4, impact 5: 2 risks" }));
    expect(Array.from(document.querySelectorAll("[data-risk]")).map(node => node.getAttribute("data-risk"))).toEqual(["R-01", "R-02"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(document.querySelectorAll("[data-risk]")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Probability 1, impact 1: 0 risks" }));
    expect(screen.getByText("No risks in this cell.")).toBeTruthy();
  });

  it("the overdue list names the overdue risk, and its card says «Overdue»", () => {
    render(<ProjectRisks />);
    expect(document.querySelector("[data-overdue-list]")!.textContent).toContain("R-01");
    expect(document.querySelector("[data-overdue-list]")!.textContent).not.toContain("R-02");
    expect(within(document.querySelector('[data-risk="R-01"]') as HTMLElement).getByText("Overdue")).toBeTruthy();
  });

  it("close sends the reason; turn into an issue sends the code and the priority the band suggests", () => {
    render(<ProjectRisks />);
    const card = document.querySelector('[data-risk="R-01"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Close" }));
    fireEvent.change(within(card).getByLabelText("Reason for closing"), { target: { value: "Supplier delivered" } });
    fireEvent.click(within(card.querySelector("[data-risk-close]") as HTMLElement).getByRole("button", { name: "Close" }));
    expect(h.close).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", riskId: "a", reason: "Supplier delivered" });
    const other = document.querySelector('[data-risk="R-02"]') as HTMLElement;
    fireEvent.click(within(other).getByRole("button", { name: "Turn into an issue" }));
    fireEvent.change(within(other).getByLabelText("Issue code"), { target: { value: "I-02" } });
    fireEvent.click(within(other.querySelector("[data-risk-issue]") as HTMLElement).getByRole("button", { name: "Turn into an issue" }));
    expect(h.convert).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", riskId: "b", issueCode: "I-02", priority: "critical" });
  });

  it("edit sends the risk's values as the form holds them; the history shows each change before → after", () => {
    render(<ProjectRisks />);
    const card = document.querySelector('[data-risk="R-03"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(card).getByLabelText("Response plan"), { target: { value: "Weekly check with the supplier" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(h.update).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", riskId: "c", patch: { status: "open", ownerMembershipId: null, nextReviewAt: null, probability: 1, severity: 2, response: "Weekly check with the supplier", mitigation: "" } });
    fireEvent.click(within(card).getByRole("button", { name: "History" }));
    expect(card.querySelector("[data-risk-history]")!.textContent).toContain("Probability: 3 → 2");
  });

  it("NEGATIVE: without pmo.write there is no edit, close or issue button — and a closed risk never has them", () => {
    h.canWrite = false;
    render(<ProjectRisks />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    cleanup(); h.canWrite = true;
    render(<ProjectRisks />);
    const closed = document.querySelector('[data-risk="R-04"]') as HTMLElement;
    expect(within(closed).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(closed).getByText("Closed: Done")).toBeTruthy();
  });
});
