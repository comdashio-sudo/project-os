// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import { SupportOwnerPanel } from "./SupportOwnerPanel";

// The server's canManageSupport (server/db.ts) asks for tenant.manage on claim, ticket transition and article creation.
const state = vi.hoisted(() => ({ permission: { data: undefined as unknown, error: null as unknown, isLoading: false } }));
const TENANT = "11111111-1111-4111-8111-111111111111";
const TICKET = { id: "22222222-2222-4222-8222-222222222222", subject: "Example ticket", ownerUserId: null, status: "open", escalationStatus: "none", tagsJson: "[]" };

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/SectionResilience", () => ({ SourceNotice: () => null }));
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ data, error: null, isLoading: false, refetch: vi.fn() });
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, data: undefined });
  return { trpc: {
    accessSummary: { mine: { useQuery: () => state.permission } },
    useUtils: () => ({ support: { tickets: { invalidate: vi.fn() }, knowledge: { list: { invalidate: vi.fn() }, sources: { invalidate: vi.fn() } } } }),
    support: {
      knowledge: { sources: { useQuery: () => query([]) }, create: { useMutation: mutation } },
      tickets: { useQuery: () => query([TICKET]) },
      claim: { useMutation: mutation },
      transition: { useMutation: mutation },
    },
  } };
});

const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["EXECUTIVE"], permissions: ["tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const panel = () => <PermissionProvider tenantId={TENANT}><SupportOwnerPanel tenantId={TENANT} /></PermissionProvider>;

describe("SupportOwnerPanel write controls follow tenant.manage", () => {
  beforeEach(() => { state.permission = { data: undefined, error: null, isLoading: false }; });
  afterEach(cleanup);

  it("a support manager sees the claim, tag and publish controls", () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    render(panel());
    expect(screen.getByRole("button", { name: "Assign to me" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save tags" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish article" })).toBeTruthy();
  });

  it("a person without tenant.manage sees the tickets but none of the write controls", () => {
    state.permission = { data: summary({ permissions: ["project.read"] }), error: null, isLoading: false };
    render(panel());
    expect(screen.getByText("Example ticket")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save tags" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish article" })).toBeNull();
  });

  it("while the permission answer is loading no write control is drawn", () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(panel());
    expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save tags" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish article" })).toBeNull();
  });

  it("when the permission lookup fails the controls stay, and the server refuses what it must", () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    render(panel());
    expect(screen.getByRole("button", { name: "Assign to me" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save tags" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish article" })).toBeTruthy();
  });
});
