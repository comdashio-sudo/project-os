/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LicensingConsole from "./LicensingConsole";

// The plan catalog is a platform-administrator read (server: assertPlatformAdministrator, which needs users.role = "admin").
// The page must not send that request for anyone else. The mock below counts the requests the page actually sends, and answers
// a refusal (FORBIDDEN) whenever one is sent, so a request made by mistake would show up in the count and in the text.
const DENIED_AR = "يتطلب تعديل الخطط والتفعيل اليدوي صلاحية مسؤول المنصة. يمكنك عرض الرخصة فقط إن كنت مسؤول الشركة.";
const LOADING_AR = "جارٍ تحميل بيانات الترخيص…";
const CATALOG = { plans: [{ id: "plan-1", code: "ALL_IN_ONE_STANDARD", name: "All-In-One Standard", active: true }], features: [], planFeatures: [] };

const state = vi.hoisted(() => ({
  user: { role: "user" } as { role: string } | null,
  authLoading: false,
  catalogRequests: 0,
  catalogReply: { isLoading: false, error: { data: { code: "FORBIDDEN" } } as unknown, data: undefined as unknown },
}));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: state.authLoading }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true, language: (true) ? "ar" : "en", isRtl: true }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ licensing: { tenantLicense: { invalidate: vi.fn() }, catalog: { invalidate: vi.fn() } } }),
  licensing: {
    tenantLicense: { useQuery: () => ({ isLoading: false, error: null, data: { license: { id: "license-1", planName: "All-In-One Standard", planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 5, manualActivation: true, startsAt: new Date(), endsAt: null }, featureOverrides: [] } }) },
    catalog: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
      if (options?.enabled === false) return { isLoading: false, error: null, data: undefined };
      state.catalogRequests += 1;
      return state.catalogReply;
    } },
    provision: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    transition: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    setFeatureOverride: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  },
} }));

beforeEach(() => {
  state.user = { role: "user" };
  state.authLoading = false;
  state.catalogRequests = 0;
  state.catalogReply = { isLoading: false, error: { data: { code: "FORBIDDEN" } }, data: undefined };
});

describe("LicensingConsole follows the platform-administrator rule", () => {
  afterEach(cleanup);

  it("a tenant manager who is not a platform administrator sends no catalog request and reads the explanation", () => {
    render(<LicensingConsole />);
    expect(state.catalogRequests).toBe(0);
    expect(screen.getAllByText(DENIED_AR)).toHaveLength(2);
    expect(screen.getByText("الرخصة الحالية")).toBeTruthy();
    expect(screen.queryByText("Localized error")).toBeNull();
    expect(screen.queryByLabelText("حد Master Plan")).toBeNull();
    expect(screen.queryByRole("button", { name: "حفظ الحد" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تفعيل أو ترقية الرخصة" })).toBeNull();
  });

  it("a platform administrator sends the catalog request and gets the controls", () => {
    state.user = { role: "admin" };
    state.catalogReply = { isLoading: false, error: null, data: CATALOG };
    render(<LicensingConsole />);
    expect(state.catalogRequests).toBeGreaterThan(0);
    expect(screen.getByLabelText("حد Master Plan")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تفعيل أو ترقية الرخصة" })).toBeTruthy();
    expect(screen.queryByText(DENIED_AR)).toBeNull();
  });

  it("while the signed-in person is still being read, the page shows the loading line and not a refusal", () => {
    state.user = null;
    state.authLoading = true;
    render(<LicensingConsole />);
    expect(state.catalogRequests).toBe(0);
    expect(screen.getAllByText(LOADING_AR)).toHaveLength(2);
    expect(screen.queryByText(DENIED_AR)).toBeNull();
  });
});
