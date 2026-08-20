import { describe, expect, it } from "vitest";
import { getProjectError } from "./projectErrors";

describe("project error map", () => {
  it("returns Arabic and English messages for a guarded WBS scope failure", () => {
    expect(getProjectError("PROJECT_OS_WBS_SCOPE_MISMATCH")).toEqual({
      code: "PROJECT_OS_WBS_SCOPE_MISMATCH",
      messages: {
        ar: "بند WBS المحدد لا يتبع للمشروع المطلوب.",
        en: "The selected WBS item does not belong to the requested project.",
      },
    });
  });

  it("maps internal authorization text to a safe bilingual tenant-access response", () => {
    expect(getProjectError("Tenant membership is not available")).toMatchObject({
      code: "PROJECT_OS_TENANT_ACCESS_DENIED",
      messages: {
        ar: expect.any(String),
        en: expect.any(String),
      },
    });
  });

  it("returns localized guidance when a commercial seat limit blocks membership access", () => {
    expect(getProjectError("PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED")).toEqual({
      code: "PROJECT_OS_LICENSE_SEAT_LIMIT_EXCEEDED",
      messages: {
        ar: "تم بلوغ عدد المقاعد المسموح به في الرخصة النشطة.",
        en: "The active license seat limit has been reached.",
      },
    });
  });
});
