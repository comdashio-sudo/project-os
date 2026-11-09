// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionFailed } from "./ScreenStates";

vi.mock("@/contexts/optionalLanguage", () => ({ useOptionalLanguage: () => "ar" }));
afterEach(() => cleanup());

describe("SectionFailed: a register that could not load, in its own card", () => {
  it("an ordinary failure names the section, says it could not load, and its retry asks again", () => {
    const retry = vi.fn();
    render(<SectionFailed title="سجل عدم المطابقة" error={{ message: "boom" }} isArabic onRetry={retry} />);
    const card = screen.getByRole("region", { name: "سجل عدم المطابقة" });
    expect(card.querySelector("h2")?.textContent).toBe("سجل عدم المطابقة");
    expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل: سجل عدم المطابقة");
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a refusal (FORBIDDEN) says which permission is missing for this section, with no retry", () => {
    render(<SectionFailed title="سجل طلبات المعلومات" error={{ message: "forbidden", data: { code: "FORBIDDEN" } }} isArabic onRetry={vi.fn()} />);
    expect(screen.getByRole("region", { name: "سجل طلبات المعلومات" })).toBeTruthy();
    expect(document.body.textContent).toContain("لا صلاحية لعرض هذا القسم");
    expect(document.body.textContent).toContain("لا تملك الصلاحية اللازمة لعرض هذا القسم.");
    expect(document.body.textContent).not.toContain("تعذّر تحميل");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
