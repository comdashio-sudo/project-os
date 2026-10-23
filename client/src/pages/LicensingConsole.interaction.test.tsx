/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LicensingConsole from "./LicensingConsole";

const state = vi.hoisted(() => ({ user: { role: "admin" } as { role: string }, override: vi.fn(), provision: vi.fn(), transition: vi.fn(), invalidate: vi.fn(), catalog: { plans: [{ id: "plan-1", code: "ALL_IN_ONE_STANDARD", name: "All-In-One Standard", active: true }], features: [], planFeatures: [] } }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ licensing: { tenantLicense: { invalidate: state.invalidate }, catalog: { invalidate: state.invalidate } } }), licensing: { tenantLicense: { useQuery: () => ({ isLoading: false, error: null, data: { license: { id: "license-1", planName: "All-In-One Standard", planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 5, manualActivation: true, startsAt: new Date(), endsAt: null }, featureOverrides: [] } }) }, catalog: { useQuery: () => ({ isLoading: false, error: null, data: state.catalog }) }, provision: { useMutation: () => ({ mutate: state.provision, isPending: false, error: null }) }, transition: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) }, setFeatureOverride: { useMutation: () => ({ mutate: state.override, isPending: false, error: null }) } } } }));

describe("LicensingConsole", () => {
  it("sends a governed Master Plan limit for the current tenant license", async () => {
    const user = userEvent.setup(); render(<LicensingConsole />);
    expect(screen.getByText("PROJECT OS")).toBeTruthy();
    await user.clear(screen.getByLabelText("Master Plan limit")); await user.type(screen.getByLabelText("Master Plan limit"), "7"); await user.click(screen.getByRole("button", { name: "Save limit" }));
    expect(state.override).toHaveBeenCalledWith({ tenantId: "tenant-1", licenseId: "license-1", featureCode: "MASTER_PLAN", active: true, limitValue: 7 });
  });

  it("keeps a tenant manager read-only when platform catalog access is unavailable", () => {
    cleanup();
    state.catalog = undefined as unknown as typeof state.catalog;
    render(<LicensingConsole />);
    expect(screen.getAllByText("Changing plans and manual activation require platform-administrator access. Tenant managers can view the current license only.")).toHaveLength(2);
    expect(screen.queryByLabelText("Master Plan limit")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save limit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Provision or upgrade license" })).toBeNull();
  });
});
