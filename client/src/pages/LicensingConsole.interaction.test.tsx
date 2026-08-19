/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LicensingConsole from "./LicensingConsole";

const state = vi.hoisted(() => ({ override: vi.fn(), provision: vi.fn(), transition: vi.fn(), invalidate: vi.fn() }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ licensing: { tenantLicense: { invalidate: state.invalidate }, catalog: { invalidate: state.invalidate } } }), licensing: { tenantLicense: { useQuery: () => ({ isLoading: false, error: null, data: { license: { id: "license-1", planName: "All-In-One Standard", planCode: "ALL_IN_ONE_STANDARD", status: "active", seats: 5, manualActivation: true, startsAt: new Date(), endsAt: null }, featureOverrides: [] } }) }, catalog: { useQuery: () => ({ isLoading: false, error: null, data: { plans: [{ id: "plan-1", code: "ALL_IN_ONE_STANDARD", name: "All-In-One Standard", active: true }], features: [], planFeatures: [] } }) }, provision: { useMutation: () => ({ mutate: state.provision, isPending: false, error: null }) }, transition: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) }, setFeatureOverride: { useMutation: () => ({ mutate: state.override, isPending: false, error: null }) } } } }));

describe("LicensingConsole", () => {
  it("sends a governed Master Plan limit for the current tenant license", async () => {
    const user = userEvent.setup(); render(<LicensingConsole />);
    await user.clear(screen.getByLabelText("Master Plan limit")); await user.type(screen.getByLabelText("Master Plan limit"), "7"); await user.click(screen.getByRole("button", { name: "Save limit" }));
    expect(state.override).toHaveBeenCalledWith({ tenantId: "tenant-1", licenseId: "license-1", featureCode: "MASTER_PLAN", active: true, limitValue: 7 });
  });
});
