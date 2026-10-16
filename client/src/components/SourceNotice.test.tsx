/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { SourceNotice } from "./SectionResilience";

afterEach(() => cleanup());
const serverRefusal = { data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة.", en: "You do not have the required permission." } } } };

describe("SourceNotice (G-100: a failed source says so instead of looking empty)", () => {
  it("renders nothing while the source is healthy", () => {
    const view = render(<SourceNotice query={{ error: null }} isArabic title="الموردون" />);
    expect(view.container.textContent).toBe("");
  });

  it("names the source, gives the server's reason in the page's language, and says what still works", () => {
    render(<SourceNotice query={{ error: serverRefusal }} isArabic title="قائمة الموردين" fallback="يمكنك كتابة الاسم يدويًا." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("تعذّر تحميل: قائمة الموردين");
    expect(alert.textContent).toContain("لا تملك الصلاحية المطلوبة.");
    expect(alert.textContent).toContain("يمكنك كتابة الاسم يدويًا.");
  });

  it("speaks English when the page is English", () => {
    render(<SourceNotice query={{ error: serverRefusal }} isArabic={false} title="The supplier list" fallback="You can still type the name." />);
    expect(screen.getByRole("alert").textContent).toContain("Could not load: The supplier list");
    expect(screen.getByRole("alert").textContent).toContain("You do not have the required permission.");
  });

  it("offers a retry that asks the source again, and disables it while the retry runs", () => {
    const refetch = vi.fn();
    const view = render(<SourceNotice query={{ error: serverRefusal, refetch }} isArabic title="قائمة الموردين" />);
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    view.rerender(<SourceNotice query={{ error: serverRefusal, refetch, isFetching: true }} isArabic title="قائمة الموردين" />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no retry button when the source cannot be retried, and a touch-sized one when it can", () => {
    const view = render(<SourceNotice query={{ error: serverRefusal }} isArabic title="x" />);
    expect(screen.queryByRole("button")).toBeNull();
    view.rerender(<SourceNotice query={{ error: serverRefusal, refetch: vi.fn() }} isArabic title="x" />);
    expect(screen.getByRole("button").className).toContain("min-h-[44px]");
  });
});

describe("the message for a failure with no answer from the server", () => {
  it("says the connection failed, not that the person's data is wrong", () => {
    for (const error of [new TypeError("Failed to fetch"), Object.assign(new Error("Network request failed"), {}), { message: "Load failed" }]) {
      expect(getLocalizedProjectError(error, true)).toContain("تعذّر الاتصال بالخادم");
      expect(getLocalizedProjectError(error, false)).toContain("Could not reach the server");
      expect(getLocalizedProjectError(error, true)).not.toContain("تحقق من البيانات");
    }
  });
  it("still gives the server's own message when the server answered, and the generic one for an unknown refusal", () => {
    expect(getLocalizedProjectError(serverRefusal, true)).toBe("لا تملك الصلاحية المطلوبة.");
    expect(getLocalizedProjectError({ data: { code: "BAD_REQUEST" } }, true)).toContain("تحقق من البيانات");
  });
  it("reports a server error (500) as the server's, in Arabic", () => {
    const error = { data: { code: "INTERNAL_SERVER_ERROR", projectError: { code: "PROJECT_OS_SERVER_ERROR", messages: { ar: "حدث خطأ في الخادم وسُجّل لدى فريق التشغيل. أعد المحاولة بعد قليل.", en: "A server error occurred and was recorded for the operations team. Try again shortly." } } } };
    expect(getLocalizedProjectError(error, true)).toContain("حدث خطأ في الخادم");
  });
});
