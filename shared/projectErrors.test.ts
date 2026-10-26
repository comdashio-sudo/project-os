import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProjectError, projectErrorMessages } from "./projectErrors";

describe("project error map", () => {
  it("returns Arabic and English messages for a guarded WBS scope failure", () => {
    expect(getProjectError("PROJECT_OS_WBS_SCOPE_MISMATCH")).toEqual({
      code: "PROJECT_OS_WBS_SCOPE_MISMATCH",
      messages: {
        ar: "بند WBS المحدد لا يتبع للمشروع المطلوب.",
        en: "The selected WBS item does not belong to the requested project.",
        ur: "The selected WBS item does not belong to the requested project.",
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
        ur: "The active license seat limit has been reached.",
      },
    });
  });

  it("returns Arabic and English guidance for guarded membership-status transitions", () => {
    expect(getProjectError("PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID")).toEqual({
      code: "PROJECT_OS_MEMBERSHIP_STATUS_TRANSITION_INVALID",
      messages: {
        ar: "انتقال حالة العضوية المطلوب غير مسموح.",
        en: "The requested membership status transition is not allowed.",
        ur: "The requested membership status transition is not allowed.",
      },
    });
    expect(getProjectError("PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN")).toEqual({
      code: "PROJECT_OS_LAST_TENANT_OWNER_DEACTIVATION_FORBIDDEN",
      messages: {
        ar: "لا يمكن تعطيل آخر مالك نشط للمؤسسة.",
        en: "The last active tenant owner cannot be deactivated.",
        ur: "The last active tenant owner cannot be deactivated.",
      },
    });
  });

  it("returns a precise bilingual response for workspace-slug and provisioning failures", () => {
    expect(getProjectError("PROJECT_OS_WORKSPACE_SLUG_EXISTS")).toEqual({
      code: "PROJECT_OS_WORKSPACE_SLUG_EXISTS",
      messages: {
        ar: "الاسم المختصر لمساحة العمل مستخدم بالفعل. اختر اسمًا مختصرًا آخر.",
        en: "This workspace slug is already in use. Choose a different workspace slug.",
        ur: "یہ مختصر نام پہلے سے استعمال ہو رہا ہے۔ کوئی اور مختصر نام منتخب کریں۔",
      },
    });
    expect(getProjectError("PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE")).toEqual({
      code: "PROJECT_OS_SELF_SERVICE_SIGNUP_UNAVAILABLE",
      messages: {
        ar: "تعذر إنشاء مساحة العمل الآن. لم تُنشأ أي بيانات. أعد المحاولة لاحقًا أو تواصل مع الدعم إذا استمر الخطأ.",
        en: "The workspace could not be created now. No data was created. Try again later or contact support if the error persists.",
        ur: "The workspace could not be created now. No data was created. Try again later or contact support if the error persists.",
      },
    });
  });
});

// Gate 5 (G-109): a code the server can throw must have an Arabic and an English message, or the person sees the generic
// fallback. The scan reads every quoted PROJECT_OS_ code in the server sources (tests excluded), so a new code added
// without a message fails here rather than in front of a user.
const NOT_SHOWN_TO_USERS = new Set([
  "PROJECT_OS_LICENSE_LIFECYCLE_EVALUATED", "PROJECT_OS_PROFITABILITY_SNAPSHOTS_CAPTURED", "PROJECT_OS_EMAIL_NOTIFICATIONS_CYCLE", "PROJECT_OS_IMPORT_JOBS_SWEPT", "PROJECT_OS_DAILY_JOBS_DONE", // success markers returned by cron endpoints
  "PROJECT_OS_SCHEDULED_EXECUTION_FAILED", "PROJECT_OS_SCHEDULED_UNAUTHORIZED", // cron endpoints answer a scheduler, not a person
]);
function serverSources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "testing" ? [] : serverSources(path);
    return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
  });
}

describe("every server error code has a bilingual message (G-109)", () => {
  const thrown = new Set<string>();
  for (const file of serverSources(join(__dirname, "..", "server"))) for (const match of readFileSync(file, "utf8").matchAll(/["'`](PROJECT_OS_[A-Z0-9_]+)["'`]/g)) thrown.add(match[1]);

  it("finds the codes it is meant to guard (the scan is not vacuous)", () => {
    expect(thrown.size).toBeGreaterThan(150);
    expect(thrown.has("PROJECT_OS_PAYROLL_APPROVER_SEPARATION")).toBe(true);
  });
  it("has no thrown code without a message", () => {
    const missing = Array.from(thrown).filter(code => !(code in projectErrorMessages) && !NOT_SHOWN_TO_USERS.has(code)).sort();
    expect(missing).toEqual([]);
  });
  it("has a non-empty Arabic and English text for every message, and the Arabic is actually Arabic", () => {
    const bad = Object.entries(projectErrorMessages).filter(([, m]) => !m.en.trim() || !/[\u0600-\u06FF]/.test(m.ar)).map(([code]) => code);
    expect(bad).toEqual([]);
  });
  it("does not exempt a code that already has a message (the exemption list stays honest)", () => {
    expect(Array.from(NOT_SHOWN_TO_USERS).filter(code => code in projectErrorMessages)).toEqual([]);
  });
});
