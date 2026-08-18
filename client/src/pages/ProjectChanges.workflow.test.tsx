import { describe, expect, it } from "vitest";
import { nextChangeRequestStatuses } from "./ProjectChanges";

describe("change-request workflow presentation", () => {
  it("يعرض الانتقالات المسموحة فقط ويغلق الحالات النهائية", () => {
    expect(nextChangeRequestStatuses("draft")).toEqual(["submitted", "cancelled"]);
    expect(nextChangeRequestStatuses("under_review")).toEqual(["approved", "rejected", "cancelled"]);
    expect(nextChangeRequestStatuses("approved")).toEqual([]);
    expect(nextChangeRequestStatuses("rejected")).toEqual([]);
    expect(nextChangeRequestStatuses("cancelled")).toEqual([]);
  });
});
