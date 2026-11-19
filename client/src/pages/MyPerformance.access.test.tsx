/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyPerformance from "./MyPerformance";

// Q-52: the page first asks performance.availability whether this account has an active linked employee record and read_own here. Only
// when both hold does it ask performance.get; otherwise it says why in words, without a refused request (a refused request was a console
// error on every visit and failed the UI audit on main). A refusal of get itself (a race, a revoked role) is still shown and not retried.
const EN = "Your account must be linked to an active employee record to view individual indicators.";
const AR = "يلزم ربط حسابك ببطاقة موظف نشطة لعرض مؤشراتك الفردية.";
const UR = "انفرادی اشاریے دیکھنے کے لیے آپ کا اکاؤنٹ کسی فعال ملازم کے ریکارڈ سے جڑا ہونا چاہیے۔";
const DENIED_EN = "You do not have the required permission to complete this operation.";
const LINK_REQUIRED = { message: "PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED", messages: { ar: AR, en: EN, ur: UR } } } };

const state = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", availability: {} as unknown, query: {} as unknown, options: undefined as unknown, availabilityOptions: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.language === "ar", language: state.language, isRtl: state.language !== "en" }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="navigation" /> }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { performance: {
  availability: { useQuery: (_input: unknown, options: unknown) => { state.availabilityOptions = options; return state.availability; } },
  get: { useQuery: (_input: unknown, options: unknown) => { state.options = options; return state.query; } },
  objections: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
} } }));

const idle = { data: undefined, error: null, isLoading: false, isFetching: false, refetch: vi.fn() };
beforeEach(() => {
  state.language = "en";
  state.availability = { ...idle, data: { linked: false, canRead: true } };
  state.query = idle;
});

describe("MyPerformance when the account has no linked employee record", () => {
  afterEach(cleanup);

  it("says why in words, does not ask for the indicators, and shows no indicators or objection form", () => {
    render(<MyPerformance />);
    expect(screen.getByText(EN)).toBeTruthy();
    expect((state.options as { enabled: boolean }).enabled).toBe(false);
    expect(screen.queryByLabelText("My objections")).toBeNull();
    expect(screen.queryByText("Assigned")).toBeNull();
    expect(screen.queryByText("Formula & data sources")).toBeNull();
  });

  it("gives the same reason in Arabic and Urdu", () => {
    state.language = "ar";
    render(<MyPerformance />);
    expect(screen.getByText(AR)).toBeTruthy();
    expect(screen.queryByLabelText("اعتراضاتي")).toBeNull();
    cleanup();
    state.language = "ur";
    render(<MyPerformance />);
    expect(screen.getByText(UR)).toBeTruthy();
  });

  it("a linked account without read_own is told it lacks the permission, and get is not asked either", () => {
    state.availability = { ...idle, data: { linked: true, canRead: false } };
    render(<MyPerformance />);
    expect(screen.getByText(DENIED_EN)).toBeTruthy();
    expect(screen.queryByText(EN)).toBeNull();
    expect((state.options as { enabled: boolean }).enabled).toBe(false);
  });

  it("a linked account with read_own asks for the indicators and shows no reason", () => {
    state.availability = { ...idle, data: { linked: true, canRead: true } };
    render(<MyPerformance />);
    expect((state.options as { enabled: boolean }).enabled).toBe(true);
    expect(screen.queryByText(EN)).toBeNull();
    expect(screen.queryByText(DENIED_EN)).toBeNull();
  });

  it("a refusal of get itself is still shown with the server's reason and not retried; a network failure is still retried", () => {
    state.availability = { ...idle, data: { linked: true, canRead: true } };
    state.query = { ...idle, error: LINK_REQUIRED };
    render(<MyPerformance />);
    expect(screen.getByText(EN)).toBeTruthy();
    expect(screen.queryByLabelText("My objections")).toBeNull();
    for (const options of [state.options, state.availabilityOptions]) {
      const retry = (options as { retry: (failureCount: number, error: unknown) => boolean }).retry;
      expect(retry(0, LINK_REQUIRED)).toBe(false);
      expect(retry(0, new Error("Failed to fetch"))).toBe(true);
      expect(retry(3, new Error("Failed to fetch"))).toBe(false);
    }
  });

  it("a failed availability read offers a retry of that read", () => {
    state.availability = { ...idle, error: { message: "network down" } };
    render(<MyPerformance />);
    expect(screen.getByText("Your indicators could not be loaded right now.")).toBeTruthy();
    expect((state.options as { enabled: boolean }).enabled).toBe(false);
  });
});
