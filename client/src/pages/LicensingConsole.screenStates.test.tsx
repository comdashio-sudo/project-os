/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LicensingConsole from "./LicensingConsole";

// The four states of /licensing/:tenantId (G-160): a refused license read says so in a sentence (no "no license configured" line),
// a failed read offers a retry, and a company without a license gets an empty state whose next action is the activation card.
const FORBIDDEN_EN = "Only the company owner can read this license.";
const forbidden = { message: "PROJECT_OS_TENANT_OWNER_REQUIRED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_TENANT_OWNER_REQUIRED", messages: { ar: "هذه العملية لمالك الشركة وحده.", en: FORBIDDEN_EN } } } };

const state = vi.hoisted(() => ({
  user: { role: "user" } as { role: string } | null,
  license: { isLoading: false, isFetching: false, error: null as unknown, data: undefined as unknown, refetch: vi.fn() },
}));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ licensing: { tenantLicense: { invalidate: vi.fn() }, catalog: { invalidate: vi.fn() } } }),
  licensing: {
    tenantLicense: { useQuery: () => state.license },
    catalog: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({ isLoading: false, error: null, data: options?.enabled === false ? undefined : { plans: [], features: [], planFeatures: [] } }) },
    provision: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    transition: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    setFeatureOverride: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
  },
} }));

beforeEach(() => {
  state.user = { role: "user" };
  state.license = { isLoading: false, isFetching: false, error: null, data: undefined, refetch: vi.fn() };
});

describe("LicensingConsole screen states", () => {
  afterEach(cleanup);

  it("a refused license read shows the server's sentence and no 'no license' line, and offers no retry", () => {
    state.license.error = forbidden;
    render(<LicensingConsole />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByText("No license has been provisioned for this workspace.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a failed license read offers a retry that refetches the same query", () => {
    state.license.error = { message: "network down" };
    render(<LicensingConsole />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.license.refetch).toHaveBeenCalledTimes(1);
  });

  it("a company with no license gets an empty state whose next action is the activation card for a platform administrator", () => {
    state.user = { role: "admin" };
    render(<LicensingConsole />);
    expect(screen.getByText("No license has been provisioned for this workspace.")).toBeTruthy();
    const action = screen.getByRole("link", { name: "Go to license activation" });
    expect(action.getAttribute("href")).toBe("#license-provision");
    expect(document.getElementById("license-provision")).toBeTruthy();
  });

  it("a tenant manager with no license is told who can activate it, with no action of their own", () => {
    render(<LicensingConsole />);
    expect(screen.getByText("No license has been provisioned for this workspace.")).toBeTruthy();
    expect(screen.getByText("Ask the platform administrator to activate a license for this company.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Go to license activation" })).toBeNull();
  });

  it("while the license loads, the page says so and shows no empty line", () => {
    state.license.isLoading = true;
    render(<LicensingConsole />);
    expect(screen.getByText("Loading licensing data…")).toBeTruthy();
    expect(screen.queryByText("No license has been provisioned for this workspace.")).toBeNull();
  });
});
