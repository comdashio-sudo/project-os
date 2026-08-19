/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectImports } from "./ProjectImports";

const state = vi.hoisted(() => ({ arabic: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { dataImports: {
  list: { useQuery: () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000f3", fileName: "upsert.csv", status: "completed", duplicateMode: "upsert", createdRows: 1, updatedRows: 1, skippedRows: 0 }], refetch: vi.fn() }) },
  detail: { useQuery: () => ({ data: { id: "00000000-0000-4000-8000-0000000000f3", fileName: "upsert.csv", status: "completed", duplicateMode: "upsert", errors: [], rowResults: [{ rowNumber: 2, rowKey: "WBS-EXISTING", action: "updated" }, { rowNumber: 3, rowKey: "WBS-NEW", action: "created" }] }, refetch: vi.fn(), error: null }) },
  analyze: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
  reanalyze: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
  confirm: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
} } }));

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
    state.arabic = true;
    cleanup();
    render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getAllByText("إنشاء الجديد وتحديث الموجود").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "عرض النتائج" }));
    expect(screen.getByText("نتائج الصفوف")).toBeTruthy();
    expect(screen.getByText("تم التحديث")).toBeTruthy();
    state.arabic = false;
  });
});
