/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContracts } from "./ProjectContracts";
import { ProjectGoodsReceipts } from "./ProjectGoodsReceipts";
import { ProjectNotifications } from "./ProjectNotifications";

// G-100, behaviour: when ONE source of a screen fails, the screen says which one, offers a retry, and everything else keeps working. Each case
// breaks a single query and leaves the rest healthy.
const helpers = vi.hoisted(() => {
  const state = { suppliers: "ok" as "ok" | "fail", prefs: "ok" as "ok" | "fail", warehouses: "ok" as "ok" | "fail", refetch: vi.fn() };
  const refusal = { data: { code: "INTERNAL_SERVER_ERROR", projectError: { code: "PROJECT_OS_SERVER_ERROR", messages: { ar: "حدث خطأ في الخادم.", en: "A server error occurred." } } } };
  const query = (data: unknown, failed = false) => ({ data: failed ? undefined : data, error: failed ? refusal : null, isLoading: false, isFetching: false, refetch: state.refetch });
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });
  return { state, query, mutation };
});
const { state, query, mutation } = helpers;

vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true, language: (true) ? "ar" : "en", isRtl: true }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    procurement: { register: { useQuery: () => helpers.query({ suppliers: [{ id: "s1", code: "SUP-1", legalName: "Gulf Steel Co", active: true }] }, helpers.state.suppliers === "fail") } },
    contracts: {
      getProjectRegister: { useQuery: () => helpers.query({ contracts: [], commitments: [] }) },
      create: { useMutation: helpers.mutation }, createCommitment: { useMutation: helpers.mutation },
    },
    notifications: {
      list: { useQuery: () => helpers.query([{ id: "n1", notificationCode: "PROJECT_HEALTH_EXCEPTION", acknowledgedAt: null, createdAt: new Date("2026-10-16T08:00:00Z"), payload: "{}" }]) },
      emailPreferences: { useQuery: () => helpers.query({ active: true, preferences: { support_escalation: true, approvals_waiting: true, daily_digest: true } }, helpers.state.prefs === "fail") },
      acknowledge: { useMutation: helpers.mutation }, setEmailPreference: { useMutation: helpers.mutation },
    },
    goodsReceipts: { list: { useQuery: () => helpers.query([]) }, create: { useMutation: helpers.mutation } },
    purchaseOrders: { list: { useQuery: () => helpers.query([]) } },
    materials: { list: { useQuery: () => helpers.query([]) } },
    qualityInspections: { list: { useQuery: () => helpers.query([]) } },
    ncrs: { list: { useQuery: () => helpers.query([]) } },
    warehouses: { list: { useQuery: () => helpers.query({ warehouses: [{ id: "w1", code: "WH-1", name: "Main store", active: true }], balances: [], transactions: [] }, helpers.state.warehouses === "fail") } },
  },
}));

beforeEach(() => { cleanup(); state.suppliers = "ok"; state.prefs = "ok"; state.warehouses = "ok"; state.refetch.mockReset(); });

describe("one failed source does not take its screen with it", () => {
  it("contracts: a failed supplier list is announced beside the picker, the form is still there, and retrying asks the source again", () => {
    state.suppliers = "fail";
    render(<ProjectContracts tenantId="t" projectId="p" />);
    // choose a supplier contract: that is where the list is needed
    const kind = screen.getAllByRole("combobox").find(select => within(select).queryByText(/مورّد|مورد/));
    expect(kind).toBeTruthy();
    fireEvent.change(kind!, { target: { value: "supplier" } });
    const alert = screen.getByRole("alert", { name: "قائمة الموردين" });
    expect(alert.textContent).toContain("تعذّر تحميل: قائمة الموردين");
    expect(alert.textContent).toContain("حدث خطأ في الخادم.");
    expect(alert.textContent).toContain("اختر نوع الطرف");
    expect(screen.getAllByLabelText(/الرمز|Code/).length).toBeGreaterThan(0); // the rest of the form is intact
    fireEvent.click(within(alert).getByRole("button", { name: "أعد المحاولة" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("contracts: with a healthy supplier list there is no notice", () => {
    render(<ProjectContracts tenantId="t" projectId="p" />);
    expect(screen.queryByRole("alert", { name: "قائمة الموردين" })).toBeNull();
  });

  it("notifications: a failed e-mail-preferences source is announced, and the in-app notifications still show", () => {
    state.prefs = "fail";
    render(<ProjectNotifications tenantId="t" />);
    expect(screen.getByRole("alert", { name: "تفضيلات إشعارات البريد" }).textContent).toContain("إشعاراتك داخل المنصة تعمل كالمعتاد");
    expect(screen.getByText("استثناء في صحة المشروع")).toBeTruthy();
    expect(screen.queryByText("إشعارات البريد")).toBeNull(); // no preference switches are drawn from data that never arrived
  });

  it("goods receipts: a failed warehouse list is announced with the way round it (direct to site), and the receipt form remains", () => {
    state.warehouses = "fail";
    render(<ProjectGoodsReceipts tenantId="t" projectId="p" />);
    const alert = screen.getByRole("alert", { name: "قائمة المستودعات" });
    expect(alert.textContent).toContain("توريد مباشر للموقع");
    expect(screen.getByRole("button", { name: /تسجيل الاستلام|حفظ|Record|Save/ })).toBeTruthy();
  });
});
