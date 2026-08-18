import { describe, expect, it } from "vitest";
import { nextHseStatuses } from "./ProjectHse";

describe("HSE workflow presentation", () => {
  it("يعرض الانتقالات التالية فقط ويمنع الحالات النهائية", () => {
    expect(nextHseStatuses("open")).toEqual(["assigned", "cancelled"]);
    expect(nextHseStatuses("verification")).toEqual(["closed", "remediation"]);
    expect(nextHseStatuses("closed")).toEqual([]);
    expect(nextHseStatuses("cancelled")).toEqual([]);
  });
});
