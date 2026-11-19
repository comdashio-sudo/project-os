import { describe, expect, it } from "vitest";
import { importStateOf, type ImportAttempt } from "./pmcImportStatus";

// Q-35: what «imported» means comes from the saved import, not from the upload.
const at = (day: number) => new Date(Date.UTC(2027, 0, day));
const attempt = (status: string, day: number, rows: Partial<ImportAttempt> = {}): ImportAttempt => ({ status, createdAt: at(day), completedAt: status === "completed" ? at(day) : null, createdRows: 0, updatedRows: 0, failureReason: null, ...rows });

describe("PMC import state (Q-35)", () => {
  it("never imported, or only cancelled → none", () => {
    expect(importStateOf("weights", []).state).toBe("none");
    expect(importStateOf("weights", [attempt("cancelled", 2)]).state).toBe("none");
  });
  it("NEGATIVE: an upload that was analysed but never confirmed is not imported — it waits for confirmation", () => {
    const status = importStateOf("weights", [attempt("validated", 3)]);
    expect(status).toMatchObject({ state: "pending", lastImportedAt: null });
  });
  it("uploaded, analysing, confirmed or writing → analysing", () => {
    for (const status of ["uploaded", "analyzing", "confirmed", "importing"]) expect(importStateOf("status", [attempt(status, 4)]).state).toBe("analyzing");
  });
  it("a finished import → completed, with its date and counts", () => {
    expect(importStateOf("locations", [attempt("completed", 5, { createdRows: 12, updatedRows: 3 })])).toMatchObject({ state: "completed", lastImportedAt: at(5), createdRows: 12, updatedRows: 3 });
  });
  it("a failed attempt after a good import → failed, still naming the last good import and the reason", () => {
    expect(importStateOf("locations", [attempt("failed", 6, { failureReason: "PROJECT_OS_IMPORT_FILE_INVALID" }), attempt("completed", 5, { createdRows: 12 })])).toMatchObject({ state: "failed", lastImportedAt: at(5), createdRows: 12, failureReason: "PROJECT_OS_IMPORT_FILE_INVALID" });
  });
  it("a new upload after a good import → its own state (pending), and the good import is still named", () => {
    expect(importStateOf("catalog", [attempt("validated", 8), attempt("completed", 5)])).toMatchObject({ state: "pending", lastImportedAt: at(5) });
  });
  it("a cancelled attempt does not hide the import before it", () => {
    expect(importStateOf("catalog", [attempt("cancelled", 9), attempt("completed", 5)]).state).toBe("completed");
  });
});
