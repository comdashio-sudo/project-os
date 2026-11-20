import { describe, expect, it } from "vitest";
import { isReviewOverdue, reviewQueue, riskLevel, riskMatrix, type MatrixRisk } from "./riskMatrix";

const risk = (id: string, probability: number, severity: number, status: MatrixRisk["status"] = "open", nextReviewAt: string | null = null): MatrixRisk => ({ id, probability, severity, status, nextReviewAt });

describe("Q-27: the risk matrix", () => {
  it("each cell holds exactly the live risks of its probability and impact, and the bands add up to the live count", () => {
    const risks = [risk("a", 4, 5), risk("b", 4, 5, "mitigating"), risk("c", 1, 1), risk("d", 3, 4, "accepted"), risk("e", 4, 5, "closed")];
    const { cells, live, byLevel } = riskMatrix(risks);
    expect(cells[3]![4]).toEqual(["a", "b"]); // the closed one (e) is not counted
    expect(cells[0]![0]).toEqual(["c"]);
    expect(cells[2]![3]).toEqual(["d"]);
    expect(cells.flat().reduce((sum, cell) => sum + cell.length, 0)).toBe(4);
    expect(live).toBe(4);
    expect(byLevel).toEqual({ low: 1, medium: 0, high: 1, critical: 2 });
  });

  it("NEGATIVE: a score outside 1–5 is left out, never clamped into a corner", () => {
    const { cells, live } = riskMatrix([risk("x", 0, 3), risk("y", 6, 2), risk("z", 3, 9)]);
    expect(live).toBe(0);
    expect(cells.flat().every(cell => cell.length === 0)).toBe(true);
  });

  it("bands: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical", () => {
    expect([1, 4, 5, 9, 10, 14, 15, 25].map(riskLevel)).toEqual(["low", "low", "medium", "medium", "high", "high", "critical", "critical"]);
  });

  it("review: a date before the site day is overdue; the site day itself, a later day, no date or a closed risk are not", () => {
    const today = "2026-11-20";
    expect(isReviewOverdue(risk("a", 3, 3, "open", "2026-11-19"), today)).toBe(true);
    expect(isReviewOverdue(risk("b", 3, 3, "open", today), today)).toBe(false);
    expect(isReviewOverdue(risk("c", 3, 3, "open", "2026-12-01"), today)).toBe(false);
    expect(isReviewOverdue(risk("d", 3, 3, "open", null), today)).toBe(false);
    expect(isReviewOverdue(risk("e", 3, 3, "closed", "2026-01-01"), today)).toBe(false);
  });

  it("the review queue: overdue oldest first, then live risks with no date by score", () => {
    const queue = reviewQueue([risk("late2", 2, 2, "open", "2026-11-10"), risk("late1", 1, 1, "open", "2026-11-01"), risk("none-low", 1, 2), risk("none-high", 5, 5), risk("closed", 5, 5, "closed")], "2026-11-20");
    expect(queue.overdue.map(item => item.id)).toEqual(["late1", "late2"]);
    expect(queue.unscheduled.map(item => item.id)).toEqual(["none-high", "none-low"]);
  });
});
