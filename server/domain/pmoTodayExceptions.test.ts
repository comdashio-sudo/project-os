import { describe, expect, it } from "vitest";
import { buildPmoTodayExceptions } from "./pmoTodayExceptions";

describe("buildPmoTodayExceptions", () => {
  it("collects and prioritizes governed health, schedule, risk, issue, overdue action, and open change exceptions", () => {
    const result = buildPmoTodayExceptions({
      today: new Date("2026-08-20T12:00:00.000Z"),
      projects: [{ id: "project-a", code: "P-001", name: "Infrastructure", plannedFinishAt: new Date("2026-09-01T00:00:00.000Z"), forecastFinishAt: new Date("2026-09-20T00:00:00.000Z"), health: { status: "red" } }],
      risks: [{ id: "risk-a", projectId: "project-a", code: "R-01", title: "Critical risk", probability: 5, severity: 4, status: "open" }],
      issues: [{ id: "issue-a", projectId: "project-a", code: "I-01", title: "Critical issue", priority: "critical", status: "open" }],
      actions: [{ id: "action-a", projectId: "project-a", title: "Recover schedule", priority: "high", status: "open", dueAt: new Date("2026-08-19T00:00:00.000Z") }],
      changes: [{ id: "change-a", projectId: "project-a", changeNumber: "CR-01", title: "Scope change", impactScheduleDays: 15, impactCost: 100000, currency: "SAR", status: "under_review" }],
    });
    expect(result.map(item => item.category)).toEqual(["health", "schedule", "issue", "risk", "change", "action"]);
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ category: "action", label: "overdue_action", severity: "warning" }), expect.objectContaining({ category: "change", label: "open_change", severity: "critical" })]));
  });

  it("excludes closed, completed, and non-impacting records and never invents exceptions for an unknown project", () => {
    const result = buildPmoTodayExceptions({ today: new Date("2026-08-20T12:00:00.000Z"), projects: [{ id: "project-a", code: "P-001", name: "Infrastructure", plannedFinishAt: null, forecastFinishAt: null, health: { status: "green" } }], risks: [{ id: "risk-a", projectId: "project-a", code: "R-01", title: "Closed", probability: 5, severity: 5, status: "closed" }], issues: [{ id: "issue-a", projectId: "project-a", code: "I-01", title: "Closed", priority: "critical", status: "closed" }], actions: [{ id: "action-a", projectId: "project-a", title: "Completed", priority: "critical", status: "completed", dueAt: new Date("2026-08-01T00:00:00.000Z") }], changes: [{ id: "change-a", projectId: "missing", changeNumber: "CR-01", title: "No project", impactScheduleDays: 20, impactCost: 1, currency: "SAR", status: "under_review" }] });
    expect(result).toEqual([]);
  });

  it("adds only below-threshold material shortages with a stable identity, governed project scope, and conservative severity", () => {
    const result = buildPmoTodayExceptions({
      today: new Date("2026-08-20T12:00:00.000Z"),
      projects: [{ id: "project-a", code: "P-001", name: "Infrastructure", plannedFinishAt: null, forecastFinishAt: null, health: null }],
      risks: [], issues: [], actions: [], changes: [],
      materialShortages: [
        { projectId: "project-a", materialId: "material-empty", materialCode: "CEM-01", materialDescription: "Cement", stockOnHand: 0, reorderLevel: 10 },
        { projectId: "project-a", materialId: "material-low", materialCode: "REB-01", materialDescription: "Rebar", stockOnHand: 2, reorderLevel: 8 },
        { projectId: "project-a", materialId: "material-safe", materialCode: "SAN-01", materialDescription: "Sand", stockOnHand: 10, reorderLevel: 10 },
        { projectId: "other-project", materialId: "material-foreign", materialCode: "STE-01", materialDescription: "Steel", stockOnHand: 1, reorderLevel: 5 },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ id: "inventory:project-a:material-empty", category: "inventory", severity: "critical", label: "material_reorder_required", detail: "CEM-01 · Cement · 0/10" }),
      expect.objectContaining({ id: "inventory:project-a:material-low", category: "inventory", severity: "warning", label: "material_reorder_required", detail: "REB-01 · Rebar · 2/8" }),
    ]);
  });
});
