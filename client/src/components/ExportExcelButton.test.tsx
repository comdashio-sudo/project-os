/** @vitest-environment jsdom */
import { LanguageProvider } from "@/contexts/LanguageContext";
import React from "react";
import { buildTableWorkbook } from "@/lib/excelExport";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportExcelButton } from "./ExportExcelButton";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});

// jsdom has no object URLs, so the download path gets stubs instead.
function stubObjectUrls() {
  const create = vi.fn(() => "blob:test");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  return { create, revoke };
}

type Row = { code: string; amount: number };
const columns = [
  { header: "الرمز", value: (row: Row) => row.code },
  { header: "المبلغ", value: (row: Row) => row.amount, kind: "money" as const },
];
const rows: Row[] = [{ code: "A-1", amount: 10 }];

function renderButton(props: Partial<Parameters<typeof ExportExcelButton<Row>>[0]> = {}, language: "ar" | "en" = "ar") {
  window.localStorage.setItem("project-os-language", language);
  return render(
    <LanguageProvider>
      <ExportExcelButton<Row> fileName="الميزانية" sheetName="الميزانية" title="تقرير" rows={rows} columns={columns} {...props} />
    </LanguageProvider>,
  );
}

describe("ExportExcelButton", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the Arabic label by default and is enabled when there are rows", () => {
    renderButton();
    expect((screen.getByRole("button", { name: /تصدير إلى Excel/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the English label when the person chose English", () => {
    renderButton({}, "en");
    expect((screen.getByRole("button", { name: /Export to Excel/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is disabled and explains why when there are no rows to export", () => {
    renderButton({ rows: [] });
    expect((screen.getByRole("button", { name: /تصدير إلى Excel/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("لا توجد صفوف لتصديرها").textContent).toBe("لا توجد صفوف لتصديرها");
  });

  it("builds the file from the visible rows and starts a download named with the export day", async () => {
    const { create: created, revoke: revoked } = stubObjectUrls();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /تصدير إلى Excel/ }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const blob = (created.mock.calls as unknown as [Blob][])[0][0];
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(blob.size).toBeGreaterThan(0);
    expect(revoked).toHaveBeenCalledWith("blob:test");
  });

  it("names the download with the readable base and the export day", async () => {
    stubObjectUrls();
    const download: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      download.push(this.download);
    });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /تصدير إلى Excel/ }));
    await waitFor(() => expect(download).toHaveLength(1));
    expect(download[0]).toMatch(/^الميزانية-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("shows a translated error and starts no download when the file cannot be built", async () => {
    vi.mocked(buildTableWorkbook).mockRejectedValueOnce(new Error("boom"));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /تصدير إلى Excel/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("تعذّر إنشاء ملف Excel");
    expect(click).not.toHaveBeenCalled();
  });
});
