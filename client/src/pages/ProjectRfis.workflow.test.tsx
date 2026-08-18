import { describe, expect, it } from "vitest";
import { nextRfiStatuses } from "./ProjectRfis";

describe("RFI workflow options", () => {
  it("يقصر انتقال RFI المرسل على حالات المراجعة والإجابة والإلغاء", () => {
    expect(nextRfiStatuses("submitted")).toEqual(["under_review", "answered", "cancelled"]);
    expect(nextRfiStatuses("submitted")).not.toContain("closed");
  });

  it("لا يعرض انتقالًا للحالات النهائية", () => {
    expect(nextRfiStatuses("closed")).toEqual([]);
    expect(nextRfiStatuses("cancelled")).toEqual([]);
  });
});
