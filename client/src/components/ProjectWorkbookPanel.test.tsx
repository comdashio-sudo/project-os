// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-51 batch 2b: the project workbook on the import page. Preview first, then save the very file previewed; each sheet's state is said; the
// screen says that uploading again is safe. Synthetic data only.
const h = vi.hoisted(() => ({
  language: "ar" as "ar" | "en",
  preview: { data: undefined as unknown, mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null },
  apply: { data: undefined as unknown, mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null },
  filled: { mutate: vi.fn(), isPending: false, error: null as unknown },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: h.language, isArabic: h.language === "ar", isRtl: h.language === "ar", setLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { dataImports: {
  projectWorkbook: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  projectWorkbookPreview: { useMutation: () => h.preview },
  projectWorkbookApply: { useMutation: () => h.apply },
  projectWorkbookFilled: { useMutation: () => h.filled },
} } }));

import { ProjectWorkbookPanel } from "./ProjectWorkbookPanel";

const title = (ar: string, en: string) => ({ ar, en, ur: en });
const PREVIEW = { fileHash: "a".repeat(64), sheets: [
  { key: "units", status: "will_apply", rows: 2, counts: { create: 2, update: 0, unchanged: 0 }, title: title("3 الوحدات", "3 Units"), errors: [] },
  { key: "requests", status: "refused", rows: 1, title: title("12 طلبات الاستلام السابقة", "12 Past inspection requests"), errors: [{ sheet: "requests", rowNumber: 6, code: "PMC_UNIT_NOT_FOUND", field: "unitNumbers", detail: "999" }] },
  { key: "team", status: "awaiting_confirmation", rows: 1, title: title("10 الفريق", "10 Team"), errors: [] },
] };
async function pick() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "workbook.xlsx")] } }); await new Promise(resolve => setTimeout(resolve, 20)); });
}
beforeEach(() => { h.language = "ar"; h.preview.data = undefined; h.apply.data = undefined; h.preview.mutate.mockReset(); h.apply.mutate.mockReset(); h.filled.mutate.mockReset(); h.filled.error = null; });
afterEach(() => cleanup());

describe("Q-51 batch 2b: the project workbook panel", () => {
  it("POSITIVE: the preview lists each sheet in the reader's language with what it will do; Save sends the very file previewed (its fingerprint); the screen says uploading again is safe", async () => {
    const { rerender } = render(<ProjectWorkbookPanel tenantId="t1" projectId="p1" />);
    await pick();
    fireEvent.click(screen.getByRole("button", { name: /معاينة الكراسة/ }));
    expect(h.preview.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", projectId: "p1", fileBase64: expect.any(String) }));
    h.preview.data = PREVIEW; rerender(<ProjectWorkbookPanel tenantId="t1" projectId="p1" />);
    const units = document.querySelector('[data-workbook-sheet="units"]')!;
    expect(units.textContent).toContain("3 الوحدات"); expect(units.textContent).toContain("ستُحفظ"); expect(units.textContent).toContain("جديد 2");
    expect(document.querySelector('[data-workbook-sheet="team"]')!.textContent).toContain("لا تُرسل دعوة");
    expect(document.querySelector("[data-workbook-safe]")!.textContent).toContain("إعادة رفع الكراسة آمنة");
    fireEvent.click(screen.getByRole("button", { name: "حفظ ما ظهر في المعاينة" }));
    expect(h.apply.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", projectId: "p1", approvedHash: "a".repeat(64) }));
  });

  it("NEGATIVE: nothing can be saved before a preview, nor when no sheet would be saved; a refused sheet says its row, field and reason", async () => {
    render(<ProjectWorkbookPanel tenantId="t1" projectId="p1" />);
    expect((screen.getByRole("button", { name: "حفظ ما ظهر في المعاينة" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    h.preview.data = { fileHash: "b".repeat(64), sheets: [PREVIEW.sheets[1]] };
    render(<ProjectWorkbookPanel tenantId="t1" projectId="p1" />);
    await pick();
    expect((screen.getByRole("button", { name: "حفظ ما ظهر في المعاينة" }) as HTMLButtonElement).disabled).toBe(true);
    const refused = document.querySelector('[data-workbook-sheet="requests"]')!;
    expect(refused.getAttribute("data-workbook-state")).toBe("refused");
    expect(refused.textContent).toContain("الصف 6"); expect(refused.querySelector("[data-workbook-error=PMC_UNIT_NOT_FOUND]")).not.toBeNull(); expect(refused.textContent).not.toContain("PMC_UNIT_NOT_FOUND"); // said in words, not the code
  });

  it("Q-51 batch 3 — POSITIVE: «download with what the project holds» asks for this project's workbook in the reader's language; NEGATIVE: a refusal is said in words", () => {
    h.language = "en";
    const { rerender } = render(<ProjectWorkbookPanel tenantId="t1" projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Download the workbook with what the project holds now/ }));
    expect(h.filled.mutate).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p1", locale: "en" });
    expect(document.querySelector("[data-workbook-filled-download]")!.textContent).toContain("unchanged");
    h.filled.error = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN" } };
    rerender(<ProjectWorkbookPanel tenantId="t1" projectId="p1" />);
    const alert = document.querySelector("[data-workbook-filled-download] [role=alert]")!;
    expect(alert.textContent).not.toBe(""); expect(alert.textContent).not.toContain("PROJECT_OS_PERMISSION_DENIED");
  });
});
