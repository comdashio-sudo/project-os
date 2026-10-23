/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyPerformance from "./MyPerformance";

// performance.get refuses with PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED when the signed-in account is not linked to an active
// employee record (server: assertPerformanceAccess in server/db.ts). The client has no signal for that link before the call, so the
// page still makes the call; this test covers what the person sees when the server refuses: the server's reason, and no indicators
// or objection form behind it.
const EN = "Your account must be linked to an active employee record to view individual indicators.";
const AR = "يلزم ربط حسابك ببطاقة موظف نشطة لعرض مؤشراتك الفردية.";
const LINK_REQUIRED = { message: "PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERFORMANCE_EMPLOYEE_LINK_REQUIRED", messages: { ar: AR, en: EN } } } };

const state = vi.hoisted(() => ({ isArabic: false, query: {} as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="navigation" /> }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { performance: {
  get: { useQuery: () => state.query },
  objections: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
} } }));

beforeEach(() => {
  state.isArabic = false;
  state.query = { data: undefined, error: LINK_REQUIRED, isLoading: false, refetch: vi.fn() };
});

describe("MyPerformance when the account has no linked employee record", () => {
  afterEach(cleanup);

  it("shows the server's reason and no indicators or objection form", () => {
    render(<MyPerformance />);
    expect(screen.getByText(EN)).toBeTruthy();
    expect(screen.queryByLabelText("My objections")).toBeNull();
    expect(screen.queryByText("Assigned")).toBeNull();
    expect(screen.queryByText("Formula & data sources")).toBeNull();
  });

  it("gives the same reason in Arabic", () => {
    state.isArabic = true;
    render(<MyPerformance />);
    expect(screen.getByText(AR)).toBeTruthy();
    expect(screen.queryByLabelText("اعتراضاتي")).toBeNull();
  });
});
