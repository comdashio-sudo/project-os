/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectImports } from "./ProjectImports";

const language = vi.hoisted(() => ({ arabic: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: language.arabic, language: (language.arabic) ? "ar" : "en", isRtl: language.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
const state = vi.hoisted(() => ({
  mock: {
    list: [{ id: "00000000-0000-4000-8000-0000000000f3", fileName: "upsert.csv", status: "completed", duplicateMode: "upsert", createdRows: 1, updatedRows: 1, skippedRows: 0 }] as unknown[],
    detail: { id: "00000000-0000-4000-8000-0000000000f3", fileName: "upsert.csv", status: "completed", duplicateMode: "upsert", errors: [], rowResults: [{ rowNumber: 2, rowKey: "WBS-EXISTING", action: "updated" }, { rowNumber: 3, rowKey: "WBS-NEW", action: "created" }] } as unknown,
    progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn(),
  },
}));
vi.mock("@/lib/trpc", async () => ({ trpc: (await import("../test/importsTrpcMock")).importsTrpc(state.mock) }));

describe("ProjectImports result history", () => {
  it("shows saved per-row upsert outcomes after the user explicitly opens the record", async () => {
    const user = userEvent.setup();
    cleanup();
    render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getAllByText("Create new and update existing rows").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "View results" }));
    expect(screen.getByText("Row results")).toBeTruthy();
    expect(screen.getByText("#2 · WBS-EXISTING")).toBeTruthy();
    expect(screen.getAllByText("Updated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
  });

  it("localizes the duplicate policy and row actions in Arabic", async () => {
    const user = userEvent.setup();
    language.arabic = true;
    cleanup();
    render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getAllByText("إنشاء الجديد وتحديث الموجود").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "عرض النتائج" }));
    expect(screen.getByText("نتائج الصفوف")).toBeTruthy();
    expect(screen.getByText("تم التحديث")).toBeTruthy();
    language.arabic = false;
  });
});
