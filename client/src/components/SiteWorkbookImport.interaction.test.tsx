/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_REASONS, siteReasonWords, SiteWorkbookImport } from "./SiteWorkbookImport";

// D-59: the site's old workbook from the PMC import tab — the next step the site-update screen's and the S-curve's empty states link to. Synthetic numbers only.
const HASH = "b".repeat(64);
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", calls: [] as Array<[string, unknown]>, put: vi.fn(), analysis: {} as Record<string, unknown>, confirmError: null as unknown, invalidated: 0,
}));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (error: { message: string }) => `localized: ${error.message}` }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: h.put }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string, reply: () => unknown) => ({ useMutation: (config?: { onSuccess?: () => void }) => {
    const [state, setState] = React.useState<{ data?: unknown; isSuccess: boolean; error: unknown }>({ isSuccess: false, error: null });
    const run = async (input: unknown) => { h.calls.push([name, input]); if (name === "confirm" && h.confirmError) { setState({ isSuccess: false, error: h.confirmError }); throw h.confirmError; } const data = reply(); setState({ data, isSuccess: true, error: null }); config?.onSuccess?.(); return data; };
    return { mutate: (input: unknown) => { void run(input).catch(() => undefined); }, mutateAsync: run, reset: () => setState({ isSuccess: false, error: null }), isPending: false, ...state };
  } });
  return { trpc: { useUtils: () => ({ pmcSite: { invalidate: () => { h.invalidated += 1; } } }), smartImport: {
    createUpload: mutation("createUpload", () => ({ uploadKey: "smart/t/p/k/site.xlsx", uploadUrl: "https://storage.example.test/put", headers: { "content-type": "x" } })),
    analyze: mutation("analyze", () => h.analysis),
    confirm: mutation("confirm", () => ({ status: "completed" })),
  } } };
});

const plan = (errors: Array<{ code: string; detail?: string }> = [], rejectedByReason: Record<string, number> = {}) => ({ siteLegacyPlan: {
  fileHash: HASH, activities: 114, cells: 44460, contractors: 5, historyEvents: 900, logEvents: 100, dailyReports: 60, planMonths: 24, errors, rejectedByReason, canConfirm: errors.length === 0,
} });
beforeEach(() => { h.language = "en"; h.calls = []; h.put.mockReset(); h.put.mockResolvedValue(undefined); h.confirmError = null; h.invalidated = 0; h.analysis = plan([], { SITE_DATE_IN_FUTURE: 3, SITE_VILLA_UNKNOWN: 2 }); });
afterEach(cleanup);
const choose = (name: string) => fireEvent.change(document.querySelector('[data-import="site-workbook"] input[type="file"]')!, { target: { files: [new File(["x"], name)] } });

describe("the site workbook import (D-59)", () => {
  it("uploads, reads the file as the site workbook, shows what it would write and what it refuses by reason, and confirms the exact plan shown", async () => {
    render(<SiteWorkbookImport tenantId="t" projectId="p" />);
    choose("site.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    await waitFor(() => expect(document.querySelector("[data-plan]")).not.toBeNull());
    expect(h.put).toHaveBeenCalledTimes(1);
    expect(h.calls.find(([name]) => name === "analyze")![1]).toMatchObject({ tenantId: "t", projectId: "p", uploadKey: "smart/t/p/k/site.xlsx", kind: "siteWorkbook" });
    expect(Array.from(document.querySelectorAll("[data-plan] dd")).map(item => item.textContent)).toEqual(["114", "44,460", "5", "1,000", "60", "24"]);
    expect(document.querySelector("[data-rejected]")!.textContent).toContain("Date in the future: 3");
    expect(document.querySelector("[data-rejected]")!.textContent).toContain("Villa not in the project: 2");
    fireEvent.click(screen.getByRole("button", { name: "Confirm the import" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("44,460 cells"));
    expect(h.calls.find(([name]) => name === "confirm")![1]).toMatchObject({ kind: "siteWorkbook", approvedHash: HASH, uploadKey: "smart/t/p/k/site.xlsx" });
    expect(h.invalidated).toBe(1);
    expect(screen.getByRole("link", { name: "Open the site update" }).getAttribute("href")).toBe("/m/t/p/site-update");
  });

  it("NEGATIVE: a plan with a blocking error has no confirm button and names it; a refused second import is said; a file that is not the workbook is said", async () => {
    h.analysis = plan([{ code: "SITE_NO_UNITS_IN_PROJECT" }]);
    const { unmount } = render(<SiteWorkbookImport tenantId="t" projectId="p" />);
    choose("site.xlsx"); fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    await waitFor(() => expect(document.querySelector("[data-errors]")).not.toBeNull());
    expect(document.querySelector("[data-errors]")!.textContent).toContain("No units in the project yet: import the units first");
    expect(screen.queryByRole("button", { name: "Confirm the import" })).toBeNull();
    unmount();

    h.analysis = plan(); h.confirmError = new Error("PROJECT_OS_SITE_LEGACY_ALREADY_IMPORTED");
    const second = render(<SiteWorkbookImport tenantId="t" projectId="p" />);
    choose("site.xlsx"); fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    await waitFor(() => screen.getByRole("button", { name: "Confirm the import" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm the import" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("localized: PROJECT_OS_SITE_LEGACY_ALREADY_IMPORTED"));
    expect(h.invalidated).toBe(0);
    second.unmount();

    h.analysis = { understanding: { kind: "budget" } };
    render(<SiteWorkbookImport tenantId="t" projectId="p" />);
    choose("site.xlsx"); fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This file is not the site workbook."));
  });

  it("refuses another file type before uploading anything", async () => {
    render(<SiteWorkbookImport tenantId="t" projectId="p" />);
    choose("site.csv");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    expect(h.put).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it("has a word for every refusal reason the server gives, in the three languages", () => {
    expect(SITE_REASONS).toHaveLength(12);
    for (const language of ["ar", "en", "ur"] as const) {
      const words = siteReasonWords(language);
      for (const code of SITE_REASONS) expect(words[code], `${language} ${code}`).toMatch(/\S{3}/);
    }
    expect(siteReasonWords("ur").SITE_VILLA_UNKNOWN).not.toBe(siteReasonWords("en").SITE_VILLA_UNKNOWN);
  });
});
