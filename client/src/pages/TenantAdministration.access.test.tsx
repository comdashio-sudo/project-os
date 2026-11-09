/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import TenantAdministration from "./TenantAdministration";

const state = vi.hoisted(() => ({
  administration: { isLoading: false, error: { message: "forbidden" } as unknown, data: undefined as unknown },
  permission: { data: undefined as unknown, error: null as unknown, isLoading: false },
}));

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Administration access denied safely" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
  return { trpc: {
    accessSummary: { mine: { useQuery: () => state.permission } },
    useUtils: () => ({ tenant: { administration: { invalidate: vi.fn() }, roleTemplateRemovals: { invalidate: vi.fn() } } }),
    tenantData: {
      preview: { useQuery: () => ({ data: undefined, error: null, isLoading: false }) },
      requestDeletion: { useMutation: mutation },
      confirmDeletion: { useMutation: mutation },
    },
    tenant: {
      administration: { useQuery: () => state.administration },
      roleTemplateRemovals: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      securitySettings: { useQuery: () => ({ data: { requireTwoStep: false }, isLoading: false, isError: false }) },
      setRequireTwoStep: { useMutation: () => ({ mutate: vi.fn(), error: null, isPending: false }) },
      decideRoleTemplateRemovals: { useMutation: () => ({ mutate: vi.fn(), error: null, isPending: false }) },
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

// Membership status changes and role revocation are tenant.manage operations on the server (assertTenantManager in server/db.ts).
const ROLE = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP = "44444444-4444-4444-8444-444444444444";
const ASSIGNMENT = "55555555-5555-4555-8555-555555555555";
const administrationData = {
  roles: [{ id: ROLE, code: "project_manager", name: "Project manager", productCode: "PROJECT", systemManaged: false, permissions: [] }],
  permissions: [{ code: "project.read", name: "Read project", productCode: "PROJECT" }],
  members: [{ membershipId: MEMBERSHIP, userId: 7, name: "Example Member", email: "member@example.test", status: "active", roles: [{ assignmentId: ASSIGNMENT, roleId: ROLE, roleCode: "project_manager", roleName: "Project manager", scopeType: "company", scopeName: "Company" }] }],
};
const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["EXECUTIVE", "PROJECT"], permissions: ["tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const page = () => <PermissionProvider tenantId="tenant-1"><TenantAdministration /></PermissionProvider>;

describe("TenantAdministration membership and revocation controls follow tenant.manage", () => {
  beforeEach(() => {
    state.administration = { isLoading: false, error: null, data: administrationData };
    state.permission = { data: undefined, error: null, isLoading: false };
  });
  afterEach(cleanup);

  it("a company manager sees the membership status control and the role revocation button", () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    render(page());
    expect(screen.getByLabelText("Select an active or suspended member")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke role assignment" })).toBeTruthy();
  });

  it("a person without tenant.manage sees the members but neither control", () => {
    state.permission = { data: summary({ permissions: ["project.read"] }), error: null, isLoading: false };
    render(page());
    expect(screen.getByText("Example Member")).toBeTruthy();
    expect(screen.queryByLabelText("Select an active or suspended member")).toBeNull();
    expect(screen.queryByRole("button", { name: "Revoke role assignment" })).toBeNull();
  });

  it("while the permission answer is loading neither control is drawn", () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(page());
    expect(screen.queryByLabelText("Select an active or suspended member")).toBeNull();
    expect(screen.queryByRole("button", { name: "Revoke role assignment" })).toBeNull();
  });

  it("when the permission lookup fails both controls stay, and the server refuses what it must", () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    render(page());
    expect(screen.getByLabelText("Select an active or suspended member")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke role assignment" })).toBeTruthy();
  });
});
