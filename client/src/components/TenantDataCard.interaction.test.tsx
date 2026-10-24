/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantDataCard } from "./TenantDataCard";

const state = vi.hoisted(() => ({
  preview: { data: undefined as unknown, error: null as unknown, isLoading: false, refetch: vi.fn() },
  request: { mutate: vi.fn(), data: undefined as unknown, error: null as unknown, isPending: false },
  confirm: { mutate: vi.fn(), data: undefined as unknown, error: null as unknown, isPending: false },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true, language: (true) ? "ar" : "en", isRtl: true }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "رسالة خطأ" }));
vi.mock("@/lib/trpc", () => ({ trpc: { tenantData: { preview: { useQuery: () => state.preview }, requestDeletion: { useMutation: () => state.request }, confirmDeletion: { useMutation: () => state.confirm } } } }));

const preview = (over: Record<string, unknown> = {}) => ({ companyName: "شركة الاختبار", tables: [{ table: "projects", rows: 3 }, { table: "wbs_items", rows: 9 }, { table: "empty", rows: 0 }], totalRows: 12, auditRows: 4, files: 2, peopleKept: 5, lastExportAt: null, exportFresh: false, exportFreshDays: 7, ...over });
const asked = { confirmationToken: "t".repeat(40), expiresAt: new Date(), companyName: "شركة الاختبار", totalRows: 12, files: 2, peopleKept: 5 };

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.preview = { data: preview(), error: null, isLoading: false, refetch: vi.fn() };
  state.request = { mutate: vi.fn(), data: undefined, error: null, isPending: false };
  state.confirm = { mutate: vi.fn(), data: undefined, error: null, isPending: false };
});

describe("TenantDataCard", () => {
  it("renders nothing for anyone the server refuses (not the owner), and nothing while it cannot tell", () => {
    state.preview = { data: undefined, error: new Error("PROJECT_OS_TENANT_OWNER_REQUIRED"), isLoading: false, refetch: vi.fn() };
    const { container } = render(<TenantDataCard tenantId="t1" />);
    expect(container.innerHTML).toBe("");
  });

  it("offers the export as a download of the streamed file, and counts only the tables that hold rows", () => {
    render(<TenantDataCard tenantId="t1" />);
    const link = screen.getByRole("link", { name: "تنزيل نسخة كاملة من بيانات الشركة" });
    expect(link.getAttribute("href")).toBe("/api/tenant-export/t1");
    expect(screen.getByText("تملك شركتك 12 سجلًا في 2 جدولًا و2 ملفًا مخزّنًا.")).toBeTruthy();
  });

  it("will not even offer the deletion until a full copy has been downloaded", () => {
    render(<TenantDataCard tenantId="t1" />);
    expect(screen.getByText(/لا يتاح الحذف إلا بعد تنزيل نسخة كاملة/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "أريد حذف بيانات الشركة نهائيًا" })).toBeNull();
  });

  it("the first confirmation only asks; nothing is deleted by it", async () => {
    state.preview = { ...state.preview, data: preview({ exportFresh: true, lastExportAt: new Date().toISOString() }) };
    render(<TenantDataCard tenantId="t1" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "أريد حذف بيانات الشركة نهائيًا" }));
    expect(state.request.mutate).toHaveBeenCalledWith({ tenantId: "t1" });
    expect(state.confirm.mutate).not.toHaveBeenCalled();
  });

  it("the second confirmation stays shut until the exact name is typed AND the box is ticked", async () => {
    state.preview = { ...state.preview, data: preview({ exportFresh: true }) };
    state.request = { ...state.request, data: asked };
    render(<TenantDataCard tenantId="t1" />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "احذف بيانات الشركة نهائيًا" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.type(screen.getByLabelText("اسم الشركة"), "شركة الاختبا");
    await user.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(true); // the name is one letter short
    await user.type(screen.getByLabelText("اسم الشركة"), "ر");
    expect(button.disabled).toBe(false);
    await user.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(true); // box unticked again
    await user.click(screen.getByRole("checkbox"));
    await user.click(button);
    expect(state.confirm.mutate).toHaveBeenCalledWith({ tenantId: "t1", confirmationToken: asked.confirmationToken, typedName: "شركة الاختبار", understandsItCannotBeUndone: true });
  });

  it("shows the verification report, and says plainly when it did not pass", () => {
    const base = { tenantId: "t1", rowsDeleted: 12, tablesChecked: 90, remaining: [] as Array<{ table: string; rows: number }>, files: { found: 2, deleted: 2, failed: 0, failedKeys: [] as string[] } };
    state.confirm = { ...state.confirm, data: { ...base, verification: "PASS" } };
    const first = render(<TenantDataCard tenantId="t1" />);
    expect(screen.getByText("التحقق: نجح — لا سجل واحد متبقٍّ في أي جدول.")).toBeTruthy();
    expect(screen.getByText("حُذف 12 سجلًا بعد فحص 90 جدولًا.")).toBeTruthy();
    first.unmount();
    state.confirm = { ...state.confirm, data: { ...base, verification: "FAIL", files: { found: 2, deleted: 1, failed: 1, failedKeys: ["tenants/x/a.pdf"] }, remaining: [{ table: "projects", rows: 1 }] } };
    render(<TenantDataCard tenantId="t1" />);
    expect(screen.getByText(/التحقق: لم يكتمل/)).toBeTruthy();
    expect(screen.getByText("tenants/x/a.pdf")).toBeTruthy();
    expect(screen.getByText("projects: 1")).toBeTruthy();
  });

  it("keeps the verdict on screen after the erasure, even though the preview then fails (the company and the owner's membership are gone)", () => {
    state.confirm = { mutate: vi.fn(), data: { verification: "PASS", rowsDeleted: 12, tablesChecked: 118, remaining: [], files: { found: 2, deleted: 2, failedKeys: [] } }, error: null, isPending: false };
    state.preview = { data: undefined, error: new Error("PROJECT_OS_TENANT_ACCESS_DENIED"), isLoading: false, refetch: vi.fn() }; // the refetch the erasure triggers
    render(<TenantDataCard tenantId="t1" />);
    expect(screen.getByText("اكتمل الحذف")).toBeTruthy();
    expect(screen.getByText(/التحقق: نجح/)).toBeTruthy();
  });
});
