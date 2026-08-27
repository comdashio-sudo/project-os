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

  it("returns Arabic and English guidance for guarded membership-status transitions", () => {
    expect(getProjectError("PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID")).toEqual({
      code: "PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID",
      messages: {
        ar: "انتقال حالة العضوية المطلوب غير مسموح.",
        en: "The requested membership status transition is not allowed.",
      },
    });
    expect(getProjectError("PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN")).toEqual({
      code: "PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN",
      messages: {
        ar: "لا يمكن تعطيل آخر مالك نشط للمؤسسة.",
        en: "The last active tenant owner cannot be deactivated.",
      },
    });
  });

  it("returns a precise bilingual response for workspace-slug and provisioning failures", () => {
    expect(getProjectError("PROJECT_OS_WORKSPACE_SLUG_EXISTS")).toEqual({
      code: "PROJECT_OS_WORKSPACE_SLUG_EXISTS",
      messages: {
        ar: "الاسم المختصر لمساحة العمل مستخدم بالفعل. اختر اسمًا مختصرًا آخر.",
        en: "This workspace slug is already in use. Choose a different workspace slug.",
      },
    });
    expect(getProjectError("PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE")).toEqual({
      code: "PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE",
      messages: {
        ar: "تعذر إنشاء مساحة العمل الآن. لم تُنشأ أي بيانات. أعد المحاولة لاحقًا أو تواصل مع الدعم إذا استمر الخطأ.",
        en: "The workspace could not be created now. No data was created. Try again later or contact support if the error persists.",
      },
    });
  });
});
