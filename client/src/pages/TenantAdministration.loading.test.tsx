/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TenantAdministration from "./TenantAdministration";

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">اللغة</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "خطأ" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
  return { trpc: { useUtils: () => ({ tenant: { administration: { invalidate: vi.fn() } } }), tenant: { administration: { useQuery: () => ({ isLoading: true, error: null, data: undefined }) }, findAssignableUser: { useQuery: () => ({ data: undefined, error: null, isFetching: false }) }, assignMember: { useMutation: mutation }, createRole: { useMutation: mutation }, updateRole: { useMutation: mutation }, assignMembershipRole: { useMutation: mutation }, revokeMembershipRole: { useMutation: mutation }, createInvitation: { useMutation: mutation }, transitionMembershipStatus: { useMutation: mutation } } } };
});

describe("TenantAdministration loading state", () => {
  it("keeps the Dashio identity and a localized authorization-aware message during loading", () => {
    render(<TenantAdministration />);
    expect(screen.getByText("Dashio")).toBeTruthy();
    expect(screen.getByText("يتم تجهيز إدارة الفريق والأدوار")).toBeTruthy();
    expect(screen.getByText(/لن تظهر أي صلاحيات قبل تحقق الحراسة الخادمية/)).toBeTruthy();
  });
});
