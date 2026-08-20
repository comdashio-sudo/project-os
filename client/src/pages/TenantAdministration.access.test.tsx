/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TenantAdministration from "./TenantAdministration";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Administration access denied safely" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
  return { trpc: {
    useUtils: () => ({ tenant: { administration: { invalidate: vi.fn() } } }),
    tenant: {
      administration: { useQuery: () => ({ isLoading: false, error: { message: "forbidden" }, data: undefined }) },
      findAssignableUser: { useQuery: () => ({ data: undefined, error: null, isFetching: false }) },
      assignMember: { useMutation: mutation },
      createRole: { useMutation: mutation },
      updateRole: { useMutation: mutation },
      assignMembershipRole: { useMutation: mutation },
      revokeMembershipRole: { useMutation: mutation },
      createInvitation: { useMutation: mutation },
      transitionMembershipStatus: { useMutation: mutation },
    },
  } };
});

describe("TenantAdministration access", () => {
  it("shows a localized denial and omits membership-management forms when tenant administration is forbidden", () => {
    render(<TenantAdministration />);
    expect(screen.getByText("Administration access denied safely")).toBeTruthy();
    expect(screen.queryByText("Organization members & roles")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create invitation link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create role" })).toBeNull();
  });
});
