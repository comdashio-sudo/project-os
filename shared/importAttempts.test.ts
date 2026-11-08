import { describe, expect, it } from "vitest";
import { attemptState, canDiscardAttempt, canRollbackAttempt, canRollbackModule } from "./importAttempts";

describe("what an import attempt means", () => {
  it.each([
    [{ status: "uploaded", errorCount: 14 }, "rejected"],
    [{ status: "uploaded", errorCount: 0 }, "awaiting"],
    [{ status: "failed", errorCount: 0 }, "rejected"],
    [{ status: "validated", errorCount: 0 }, "awaiting"],
    [{ status: "analyzing", errorCount: 0 }, "processing"],
    [{ status: "importing", errorCount: 0 }, "processing"],
    [{ status: "completed", errorCount: 0 }, "imported"],
    [{ status: "cancelled", errorCount: 0 }, "undone"],
  ] as const)("%j is %s", (row, expected) => expect(attemptState(row)).toBe(expected));

  it("only an attempt that wrote nothing can be deleted, and only an imported one rolled back", () => {
    for (const state of ["rejected", "awaiting"] as const) { expect(canDiscardAttempt(state)).toBe(true); expect(canRollbackAttempt(state)).toBe(false); }
    expect(canDiscardAttempt("imported")).toBe(false); expect(canRollbackAttempt("imported")).toBe(true);
    for (const state of ["processing", "undone"] as const) { expect(canDiscardAttempt(state)).toBe(false); expect(canRollbackAttempt(state)).toBe(false); }
  });

  it("rolls back the modules whose created rows are listed, never the opening-stock ledger or an unknown one", () => {
    for (const code of ["wbs", "budget", "contracts", "materials", "schedule"]) expect(canRollbackModule(code)).toBe(true);
    for (const code of ["openingBalances", "p6", "p6update", ""]) expect(canRollbackModule(code)).toBe(false);
  });
});
