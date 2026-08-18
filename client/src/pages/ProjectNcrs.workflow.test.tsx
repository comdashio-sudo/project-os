import { describe, expect, it } from "vitest";
import { nextNcrStatuses } from "./ProjectNcrs";

describe("NCR workflow presentation", () => {
  it("يعرض الانتقالات المسموحة فقط من الحالة المفتوحة", () => {
    expect(nextNcrStatuses("open")).toEqual(["under_investigation", "cancelled"]);
  });

  it("لا يعرض انتقالًا بعد الإغلاق أو الإلغاء", () => {
    expect(nextNcrStatuses("closed")).toEqual([]);
    expect(nextNcrStatuses("cancelled")).toEqual([]);
  });
});
