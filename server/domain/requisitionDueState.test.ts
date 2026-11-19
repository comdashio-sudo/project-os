import { describe, expect, it } from "vitest";
import { DUE_SOON_DAYS, requisitionDueState } from "../db";

// Q-42 (adviser 18-11): «due soon» is the next 7 days, by the site's calendar; only an open request with something left to issue has a due state.
describe("requisitionDueState", () => {
  const today = "2026-11-18"; const soon = "2026-11-25";
  it("is seven days", () => expect(DUE_SOON_DAYS).toBe(7));
  it("names overdue, due soon (today through the seventh day) and later", () => {
    expect(requisitionDueState("approved", 10, "2026-11-17", today, soon)).toBe("overdue");
    expect(requisitionDueState("draft", 10, today, today, soon)).toBe("due_soon");
    expect(requisitionDueState("submitted", 10, soon, today, soon)).toBe("due_soon");
    expect(requisitionDueState("approved", 10, "2026-11-26", today, soon)).toBe("later");
  });
  it("NEGATIVE: closed, rejected, cancelled or fully issued requests have none", () => {
    for (const status of ["closed", "rejected", "cancelled"]) expect(requisitionDueState(status, 10, "2026-11-17", today, soon)).toBeNull();
    expect(requisitionDueState("partially_issued", 0, "2026-11-17", today, soon)).toBeNull();
  });
});
